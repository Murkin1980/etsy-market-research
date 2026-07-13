import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config/env.js';
import {
  buildCliParams,
  getClientIp,
  parseJsonBody,
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
import { closeLogStreams, createChildLogger } from './utils/logger.js';

const log = createChildLogger('server');

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const MIN_PRODUCTION_API_KEY_LENGTH = 24;
const activeChildren = new Set<ReturnType<typeof spawn>>();
let rateLimitChecks = 0;

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
      env: { ...process.env },
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

      if (spawnError || code !== 0) {
        reject(spawnError ?? new Error(`Exit code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      const result = parseRunResultOutput(stdout);
      if (!result) {
        reject(new Error('CLI completed without a valid structured result'));
        return;
      }
      if (result.status === 'completed') {
        log.info({ jobId: job.id, runDir: result.runDir }, 'Job completed');
      } else {
        log.error({ jobId: job.id, error: result.error }, 'Job returned a failed result');
      }
      resolve(result);
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

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const configuredOrigin = config.server.corsOrigin;
  const requestOrigin = req.headers.origin;
  if (configuredOrigin && (configuredOrigin === '*' || configuredOrigin === requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', configuredOrigin === '*' ? '*' : configuredOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

if (config.server.requireApiKey && !config.server.apiKey) {
  throw new Error('API_KEY must be configured when REQUIRE_API_KEY=true');
}
if (config.server.requireApiKey && config.server.apiKey.length < MIN_PRODUCTION_API_KEY_LENGTH) {
  throw new Error(`API_KEY must contain at least ${MIN_PRODUCTION_API_KEY_LENGTH} characters`);
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
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/' || url.pathname === '/health') {
    const jobStats = jobManager.stats();
    sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      activeJobs: jobStats.active,
      queuedJobs: jobStats.queued,
      retainedJobs: jobStats.retained,
      maxConcurrent: config.server.maxConcurrentJobs,
      maxQueued: config.server.maxQueuedJobs,
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

  if (url.pathname === '/jobs' && req.method === 'GET') {
    const jobs = jobManager.list();
    sendJson(res, 200, { jobs, total: jobs.length });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req, config.server.maxRequestBodyBytes);
      const request = parseResearchJobRequest(body);
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
  if (config.server.apiKey) console.log('  Auth: Authorization: Bearer <API_KEY>');
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
