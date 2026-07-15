import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config/env.js';
import {
  buildCliParams,
  getClientIp,
  parseJsonBody,
  parseAiAnalysisRequest,
  parseEtsyApiSettings,
  parseResearchJobRequest,
  parseRunResultOutput,
  RequestBodyError,
  secretsEqual,
  type RunResultPayload,
} from './server-api.js';
import {
  JobManager,
  JobQueueFullError,
  type ResearchJob,
} from './server-jobs.js';
import { listRunFiles, resolveRunFile } from './run-files.js';
import { resolveUiAsset } from './server-ui.js';
import { closeLogStreams, createChildLogger } from './utils/logger.js';
import { EtsyApiClient, EtsyApiError } from './etsy-api/client.js';
import { EncryptedCredentialStore } from './storage/encrypted-credential.js';
import {
  createRunAiAnalysis,
  getRunAiAnalysis,
  RunReportError,
} from './analysis/run-report-analyzer.js';

const log = createChildLogger('server');

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const MIN_PRODUCTION_API_KEY_LENGTH = 24;
const APP_VERSION = '1.4.1';
const activeChildren = new Set<ReturnType<typeof spawn>>();
const activeAiAnalyses = new Set<string>();
let rateLimitChecks = 0;
let runtimeEtsyApiKey = config.etsyApiKey;
let etsyApiStatus: 'missing' | 'checking' | 'verified' | 'invalid' = runtimeEtsyApiKey
  ? 'checking'
  : 'missing';
let credentialStore: EncryptedCredentialStore | null = null;

function checkRateLimit(ip: string): boolean {
  const limit = config.server.rateLimitPerMinute;
  if (limit <= 0) return true;

  const now = Date.now();
  rateLimitChecks++;
  if (rateLimitChecks % 1_000 === 0) {
    for (const [key, timestamps] of rateLimitMap) {
      const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
      if (activeTimestamps.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, activeTimestamps);
    }
  }

  const recent = (rateLimitMap.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= limit) {
    rateLimitMap.set(ip, recent);
    return false;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

function checkApiKey(req: http.IncomingMessage): boolean {
  if (!config.server.apiKey) return !config.server.requireApiKey;
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return secretsEqual(token, config.server.apiKey);
}

function readRunResult(runDir: string): RunResultPayload | null {
  const resultPath = path.join(runDir, 'run-result.json');
  if (!fs.existsSync(resultPath)) return null;
  try {
    return parseRunResultOutput(fs.readFileSync(resultPath, 'utf-8'));
  } catch {
    return null;
  }
}

function executeCliJob(job: ResearchJob): Promise<RunResultPayload> {
  log.info({ jobId: job.id, query: job.query }, 'Starting job');

  return new Promise((resolve, reject) => {
    const child = spawn('node', buildCliParams(job.id, job.request), {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(runtimeEtsyApiKey ? { ETSY_API_KEY: runtimeEtsyApiKey } : {}),
      },
    });
    activeChildren.add(child);

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (data: Buffer) => {
      stdout = (stdout + data.toString()).slice(-MAX_CHILD_OUTPUT_BYTES);
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-MAX_CHILD_OUTPUT_BYTES);
    });

    const finish = (code: number | null, spawnError?: Error): void => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);

      if (spawnError) {
        reject(spawnError);
        return;
      }

      const result = parseRunResultOutput(stdout);
      if (result) {
        if (result.status === 'completed') {
          log.info({ jobId: job.id, runDir: result.runDir }, 'Job completed');
        } else {
          log.error({ jobId: job.id, error: result.error }, 'Job returned a failed result');
        }
        resolve(result);
        return;
      }

      if (code !== 0) {
        reject(new Error(`Exit code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      if (!result) {
        reject(new Error('CLI completed without a valid structured result'));
        return;
      }
    };

    child.on('close', (code: number | null) => finish(code));
    child.on('error', (error: Error) => finish(null, error));
  });
}

const jobManager = new JobManager({
  maxConcurrent: config.server.maxConcurrentJobs,
  maxQueued: config.server.maxQueuedJobs,
  maxRetained: config.server.maxJobsRetained,
  execute: executeCliJob,
});

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function applyUiSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendUiAsset(res: http.ServerResponse, pathname: string): boolean {
  const asset = resolveUiAsset(pathname);
  if (!asset) return false;
  applyUiSecurityHeaders(res);
  res.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': asset.cacheControl,
  });
  fs.createReadStream(asset.filePath).pipe(res);
  return true;
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const configuredOrigin = config.server.corsOrigin;
  const requestOrigin = req.headers.origin;
  if (configuredOrigin && (configuredOrigin === '*' || configuredOrigin === requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', configuredOrigin === '*' ? '*' : configuredOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

if (config.server.requireApiKey && !config.server.apiKey) {
  throw new Error('API_KEY must be configured when REQUIRE_API_KEY=true');
}
if (config.server.requireApiKey && config.server.apiKey.length < MIN_PRODUCTION_API_KEY_LENGTH) {
  throw new Error(`API_KEY must contain at least ${MIN_PRODUCTION_API_KEY_LENGTH} characters`);
}

if (config.server.apiKey.length >= MIN_PRODUCTION_API_KEY_LENGTH) {
  try {
    credentialStore = new EncryptedCredentialStore(
      path.join(config.paths.settings, 'etsy-api.enc'),
      config.server.apiKey,
    );
    const storedKey = credentialStore.load();
    if (storedKey) {
      runtimeEtsyApiKey = storedKey;
      etsyApiStatus = 'checking';
    }
  } catch (error) {
    log.error({ error: (error as Error).message }, 'Could not load encrypted Etsy API settings');
  }
}

async function verifyEtsyApiKey(apiKey: string): Promise<void> {
  const client = new EtsyApiClient({
    apiKey,
    baseUrl: config.etsyApiBaseUrl,
    timeoutMs: config.etsyApi.timeoutMs,
    maxRetries: 0,
  });
  await client.verifyCredentials();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(302, { Location: '/assets/favicon.svg' });
    res.end();
    return;
  }

  if (req.method === 'GET' && sendUiAsset(res, url.pathname)) return;

  if (url.pathname === '/health') {
    const jobStats = jobManager.stats();
    sendJson(res, 200, {
      status: 'ok',
      version: APP_VERSION,
      uptime: process.uptime(),
      activeJobs: jobStats.active,
      queuedJobs: jobStats.queued,
      retainedJobs: jobStats.retained,
      maxConcurrent: config.server.maxConcurrentJobs,
      maxQueued: config.server.maxQueuedJobs,
      dataSource: config.etsyDataSource === 'api' ? 'etsy-api' : 'browser-scraper',
      etsyApiConfigured: Boolean(runtimeEtsyApiKey),
      etsyApiStatus,
      aiAnalysisConfigured: Boolean(config.openaiApiKey),
      aiAnalysisModel: config.openaiModel,
    });
    return;
  }

  if (!checkApiKey(req)) {
    sendJson(res, 401, { error: 'Unauthorized. Provide Authorization: Bearer <API_KEY>' });
    return;
  }

  const ip = getClientIp(req, config.server.trustProxy);
  if (!checkRateLimit(ip)) {
    sendJson(res, 429, {
      error: 'Rate limit exceeded',
      limit: config.server.rateLimitPerMinute,
      window: '60s',
    });
    return;
  }

  if (url.pathname === '/settings/etsy-api' && req.method === 'GET') {
    sendJson(res, 200, {
      configured: Boolean(runtimeEtsyApiKey),
      status: etsyApiStatus,
      persistentStorage: Boolean(credentialStore),
    });
    return;
  }

  if (url.pathname === '/settings/etsy-api' && req.method === 'PUT') {
    if (!credentialStore) {
      sendJson(res, 503, { error: 'Encrypted credential storage is not available' });
      return;
    }
    try {
      const body = await parseJsonBody(req, config.server.maxRequestBodyBytes);
      const settings = parseEtsyApiSettings(body);
      const candidate = `${settings.keystring}:${settings.sharedSecret}`;
      await verifyEtsyApiKey(candidate);
      runtimeEtsyApiKey = credentialStore.save(settings);
      etsyApiStatus = 'verified';
      sendJson(res, 200, { configured: true, status: etsyApiStatus });
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else if (error instanceof EtsyApiError) {
        sendJson(res, error.status === 401 || error.status === 403 ? 422 : 502, {
          error: error.message,
        });
      } else {
        log.error({ error: (error as Error).message }, 'Failed to save Etsy API settings');
        sendJson(res, 500, { error: 'Failed to save Etsy API settings' });
      }
    }
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'GET') {
    const jobs = jobManager.list();
    sendJson(res, 200, { jobs, total: jobs.length });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req, config.server.maxRequestBodyBytes);
      const request = parseResearchJobRequest(body);
      if (config.etsyDataSource === 'api' && etsyApiStatus !== 'verified') {
        sendJson(res, 503, {
          error: etsyApiStatus === 'checking'
            ? 'Etsy API credential verification is still in progress'
            : 'Configure and verify Etsy API credentials before starting research',
          etsyApiStatus,
        });
        return;
      }
      const { job, queuePosition } = jobManager.enqueue(request);
      log.info({ jobId: job.id, query: job.query }, 'Job queued');

      sendJson(res, 202, {
        jobId: job.id,
        status: job.status,
        ...(queuePosition > 0 ? { queuePosition } : {}),
      });
    } catch (error) {
      if (error instanceof JobQueueFullError) {
        sendJson(res, 429, { error: 'Job queue is full', maxQueued: error.maxQueued });
      } else if (error instanceof RequestBodyError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else {
        log.error({ error: (error as Error).message }, 'Failed to create job');
        sendJson(res, 500, { error: 'Failed to create job' });
      }
    }
    return;
  }

  if (url.pathname.startsWith('/jobs/') && req.method === 'GET') {
    const jobId = url.pathname.split('/')[2];
    const job = jobManager.get(jobId);
    if (!job) {
      sendJson(res, 404, { error: 'Job not found' });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  if (url.pathname === '/runs' && req.method === 'GET') {
    const runsDir = config.paths.runs;
    if (!fs.existsSync(runsDir)) {
      sendJson(res, 200, { runs: [] });
      return;
    }
    const runs = fs.readdirSync(runsDir)
      .filter((directory) => !directory.startsWith('.'))
      .map((directory) => ({ id: directory, ...readRunResult(path.join(runsDir, directory)) }));
    sendJson(res, 200, { runs, total: runs.length });
    return;
  }

  const runAiAnalysisMatch = url.pathname.match(/^\/runs\/([^/]+)\/ai-analysis$/);
  if (runAiAnalysisMatch && (req.method === 'GET' || req.method === 'POST')) {
    const runId = decodePathSegment(runAiAnalysisMatch[1]);
    if (!runId) {
      sendJson(res, 400, { error: 'Invalid run identifier' });
      return;
    }
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, getRunAiAnalysis(
          config.paths.runs,
          runId,
          Boolean(config.openaiApiKey),
          config.openaiModel,
        ));
        return;
      }

      const request = parseAiAnalysisRequest(
        await parseJsonBody(req, config.server.maxRequestBodyBytes),
      );
      if (activeAiAnalyses.has(runId)) {
        sendJson(res, 409, { error: 'AI analysis is already running for this report' });
        return;
      }
      activeAiAnalyses.add(runId);
      try {
        const payload = await createRunAiAnalysis({
          runsDir: config.paths.runs,
          runId,
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
          timeoutMs: config.llmTimeoutMs,
          force: request.force,
        });
        sendJson(res, request.force ? 200 : 201, payload);
      } finally {
        activeAiAnalyses.delete(runId);
      }
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else if (error instanceof RunReportError) {
        sendJson(res, error.statusCode, { error: error.message });
      } else {
        log.error({ runId, error: (error as Error).message }, 'AI report analysis failed');
        sendJson(res, 500, { error: 'AI report analysis failed' });
      }
    }
    return;
  }

  const runFilesMatch = url.pathname.match(/^\/runs\/([^/]+)\/files$/);
  if (runFilesMatch && req.method === 'GET') {
    const runId = decodePathSegment(runFilesMatch[1]);
    if (!runId) {
      sendJson(res, 400, { error: 'Invalid run identifier' });
      return;
    }
    const files = listRunFiles(config.paths.runs, runId);
    if (!files) {
      sendJson(res, 404, { error: 'Run not found' });
      return;
    }
    sendJson(res, 200, { runId, files, total: files.length });
    return;
  }

  const runFileMatch = url.pathname.match(/^\/runs\/([^/]+)\/files\/([^/]+)$/);
  if (runFileMatch && req.method === 'GET') {
    const runId = decodePathSegment(runFileMatch[1]);
    const fileName = decodePathSegment(runFileMatch[2]);
    if (!runId || !fileName) {
      sendJson(res, 400, { error: 'Invalid run file path' });
      return;
    }
    const file = resolveRunFile(config.paths.runs, runId, fileName);
    if (!file) {
      sendJson(res, 404, { error: 'Run file not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': file.definition.contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file.filePath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
server.listen(port, config.server.host, () => {
  log.info({ host: config.server.host, port }, 'Etsy Research API started');
  console.log(`Etsy Research API on http://${config.server.host}:${port}`);
  console.log('Endpoints:');
  console.log('  GET  /health           - Health check (public)');
  console.log('  GET  /jobs             - List jobs');
  console.log('  POST /jobs             - Create a validated research job');
  console.log('  GET  /jobs/:id         - Job status');
  console.log('  GET  /runs             - List completed runs');
  console.log('  GET  /runs/:id/ai-analysis - Read report analysis');
  console.log('  POST /runs/:id/ai-analysis - Analyze a completed report');
  console.log('  PUT  /settings/etsy-api - Verify and save Etsy API credentials');
  if (config.server.apiKey) console.log('  Auth: Authorization: Bearer <API_KEY>');

  if (runtimeEtsyApiKey) {
    void verifyEtsyApiKey(runtimeEtsyApiKey)
      .then(() => {
        etsyApiStatus = 'verified';
        log.info('Etsy API credential verified');
      })
      .catch((error: Error) => {
        etsyApiStatus = 'invalid';
        log.warn({ error: error.message }, 'Etsy API credential verification failed');
      });
  }
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal, activeJobs: activeChildren.size }, 'Graceful shutdown started');
  for (const child of activeChildren) child.kill('SIGTERM');

  server.close((error) => {
    if (error) {
      log.error({ error: error.message }, 'HTTP server shutdown failed');
      process.exitCode = 1;
    }
    closeLogStreams();
  });
  server.closeIdleConnections();

  setTimeout(() => {
    log.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
