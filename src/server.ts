import http from 'http';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
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
  type ResearchJobRequest,
  type RunResultPayload,
} from './server-api.js';
import { createChildLogger } from './utils/logger.js';

const log = createChildLogger('server');

interface ResearchJob {
  id: string;
  query: string;
  request: ResearchJobRequest;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: RunResultPayload;
  error?: string;
}

const jobQueue: ResearchJob[] = [];
const activeJobs = new Set<string>();
const allJobs: ResearchJob[] = [];

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const MIN_PRODUCTION_API_KEY_LENGTH = 24;
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

function pruneJobHistory(): void {
  const terminalJobs = allJobs.filter((job) => job.status === 'completed' || job.status === 'failed');
  const overflow = terminalJobs.length - config.server.maxJobsRetained;
  if (overflow <= 0) return;

  const idsToRemove = new Set(terminalJobs.slice(0, overflow).map((job) => job.id));
  for (let index = allJobs.length - 1; index >= 0; index--) {
    if (idsToRemove.has(allJobs[index].id)) allJobs.splice(index, 1);
  }
}

function startJob(job: ResearchJob): void {
  activeJobs.add(job.id);
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  log.info({ jobId: job.id, query: job.query }, 'Starting job');

  const child = spawn('node', buildCliParams(job.id, job.request), {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

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
    activeJobs.delete(job.id);
    job.completedAt = new Date().toISOString();

    if (spawnError || code !== 0) {
      job.status = 'failed';
      job.error = spawnError?.message ?? `Exit code ${code}: ${stderr.slice(-500)}`;
      log.error({ jobId: job.id, code, error: job.error }, 'Job failed');
    } else {
      const result = parseRunResultOutput(stdout);
      if (result?.status === 'completed') {
        job.status = 'completed';
        job.result = result;
        log.info({ jobId: job.id, runDir: result.runDir }, 'Job completed');
      } else {
        job.status = 'failed';
        job.error = result?.error ?? 'CLI completed without a valid structured result';
        if (result) job.result = result;
        log.error({ jobId: job.id, error: job.error }, 'Job returned an invalid result');
      }
    }

    pruneJobHistory();
    processQueue();
  };

  child.on('close', (code: number | null) => finish(code));
  child.on('error', (error: Error) => finish(null, error));
}

function processQueue(): void {
  while (activeJobs.size < config.server.maxConcurrentJobs && jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (job) startJob(job);
  }
}

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

  if (url.pathname === '/' || url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      activeJobs: activeJobs.size,
      queuedJobs: jobQueue.length,
      retainedJobs: allJobs.length,
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
    sendJson(res, 200, { jobs: allJobs, total: allJobs.length });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'POST') {
    try {
      if (jobQueue.length >= config.server.maxQueuedJobs) {
        sendJson(res, 429, { error: 'Job queue is full', maxQueued: config.server.maxQueuedJobs });
        return;
      }

      const body = await parseJsonBody(req, config.server.maxRequestBodyBytes);
      const request = parseResearchJobRequest(body);
      const availableSlots = Math.max(0, config.server.maxConcurrentJobs - activeJobs.size);
      const queuePosition = Math.max(0, jobQueue.length + 1 - availableSlots);
      const job: ResearchJob = {
        id: randomUUID(),
        query: request.query,
        request,
        status: 'queued',
        queuedAt: new Date().toISOString(),
      };

      allJobs.push(job);
      jobQueue.push(job);
      log.info({ jobId: job.id, query: job.query }, 'Job queued');
      processQueue();

      sendJson(res, 202, {
        jobId: job.id,
        status: job.status,
        ...(queuePosition > 0 ? { queuePosition } : {}),
      });
    } catch (error) {
      if (error instanceof RequestBodyError) {
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
    const job = allJobs.find((candidate) => candidate.id === jobId);
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
