import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config/env.js';
import { createChildLogger } from './utils/logger.js';

const log = createChildLogger('server');

interface ResearchJob {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: {
    status: 'completed' | 'failed';
    query: string;
    runDir: string;
    totalFound: number;
    successCount: number;
    partialCount: number;
    failedCount: number;
    blockedCount: number;
    averagePriceUsd: number | null;
    medianPriceUsd: number | null;
    durationMs: number;
  };
  error?: string;
}

// Job queue
const jobQueue: ResearchJob[] = [];
const activeJobs: Set<string> = new Set();
let jobCounter = 0;

// Rate limiting: IP -> timestamps of recent requests
const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const limit = config.server.rateLimitPerMinute;
  if (limit <= 0) return true;

  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= limit) return false;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return true;
}

function checkApiKey(req: http.IncomingMessage): boolean {
  const requiredKey = config.server.apiKey;
  if (!requiredKey) return true;

  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === requiredKey;
}

function readRunResult(runDir: string): ResearchJob['result'] | null {
  const resultPath = path.join(runDir, 'run-result.json');
  if (!fs.existsSync(resultPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(resultPath, 'utf-8')) as ResearchJob['result'];
  } catch {
    return null;
  }
}

function processQueue(): void {
  if (activeJobs.size >= config.server.maxConcurrentJobs) return;
  if (jobQueue.length === 0) return;

  const job = jobQueue.shift();
  if (!job) return;

  activeJobs.add(job.id);
  job.status = 'running';

  log.info({ jobId: job.id, query: job.query }, 'Starting job');

  const params = [
    'dist/cli.js',
    '--query', job.query,
    '--pages', '2',
    '--max-listings', '80',
    '--currency', 'USD',
    '--country', 'US',
  ];

  const child = spawn('node', params, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stderr = '';
  child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

  child.on('close', (code: number | null) => {
    activeJobs.delete(job.id);

    if (code !== 0) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.error = `Exit code ${code}: ${stderr.slice(-500)}`;
      log.error({ jobId: job.id, code }, 'Job failed');
    } else {
      // Read run-result.json from the most recent run directory
      const runsDir = config.paths.runs;
      if (fs.existsSync(runsDir)) {
        const runDirs = fs.readdirSync(runsDir)
          .filter((d) => d.includes(slugify(job.query)))
          .sort()
          .reverse();

        if (runDirs.length > 0) {
          const result = readRunResult(path.join(runsDir, runDirs[0]));
          if (result) {
            job.status = 'completed';
            job.completedAt = new Date().toISOString();
            job.result = result;
            log.info({ jobId: job.id }, 'Job completed');
            processQueue();
            return;
          }
        }
      }

      // Fallback
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = {
        status: 'completed',
        query: job.query,
        runDir: '',
        totalFound: 0,
        successCount: 0,
        partialCount: 0,
        failedCount: 0,
        blockedCount: 0,
        averagePriceUsd: null,
        medianPriceUsd: null,
        durationMs: 0,
      };
      log.info({ jobId: job.id }, 'Job completed (fallback result)');
    }

    processQueue();
  });

  child.on('error', (err: Error) => {
    activeJobs.delete(job.id);
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.error = err.message;
    log.error({ jobId: job.id, error: err.message }, 'Job error');
    processQueue();
  });
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function getClientIp(req: http.IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'local';
}

const allJobs: ResearchJob[] = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const ip = getClientIp(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check
  if (!checkApiKey(req)) {
    sendJson(res, 401, { error: 'Unauthorized. Provide Authorization: Bearer <API_KEY>' });
    return;
  }

  // Rate limit
  if (!checkRateLimit(ip)) {
    sendJson(res, 429, { error: 'Rate limit exceeded', limit: config.server.rateLimitPerMinute, window: '60s' });
    return;
  }

  // Health
  if (url.pathname === '/' || url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      activeJobs: activeJobs.size,
      queuedJobs: jobQueue.length,
      totalJobs: allJobs.length,
      maxConcurrent: config.server.maxConcurrentJobs,
      maxTotal: config.server.maxJobsTotal,
    });
    return;
  }

  // List jobs
  if (url.pathname === '/jobs' && req.method === 'GET') {
    sendJson(res, 200, { jobs: allJobs, total: allJobs.length });
    return;
  }

  // Create job
  if (url.pathname === '/jobs' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const query = body.query as string | undefined;
      if (!query) { sendJson(res, 400, { error: 'query is required' }); return; }

      if (allJobs.length >= config.server.maxJobsTotal) {
        sendJson(res, 429, { error: 'Max jobs limit reached', max: config.server.maxJobsTotal });
        return;
      }

      const runningCount = allJobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
      if (runningCount >= config.server.maxConcurrentJobs) {
        sendJson(res, 202, { message: 'Job queued (all slots busy)', queuePosition: jobQueue.length + 1 });
      }

      jobCounter++;
      const job: ResearchJob = {
        id: `job-${jobCounter}`,
        query,
        status: 'queued',
        startedAt: new Date().toISOString(),
      };
      allJobs.push(job);
      jobQueue.push(job);

      log.info({ jobId: job.id, query }, 'Job queued');
      processQueue();

      sendJson(res, 202, { jobId: job.id, status: 'queued' });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  // Get job
  if (url.pathname.startsWith('/jobs/') && req.method === 'GET') {
    const jobId = url.pathname.split('/')[2];
    const job = allJobs.find((j) => j.id === jobId);
    if (!job) { sendJson(res, 404, { error: 'Job not found' }); return; }
    sendJson(res, 200, job);
    return;
  }

  // List runs
  if (url.pathname === '/runs' && req.method === 'GET') {
    const runsDir = config.paths.runs;
    if (!fs.existsSync(runsDir)) { sendJson(res, 200, { runs: [] }); return; }
    const dirs = fs.readdirSync(runsDir).filter((d) => !d.startsWith('.'));
    const runs = dirs.map((d) => {
      const result = readRunResult(path.join(runsDir, d));
      return { id: d, ...result };
    });
    sendJson(res, 200, { runs, total: runs.length });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  log.info({ port: PORT }, 'Etsy Research API started');
  console.log(`Etsy Research API on http://0.0.0.0:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health           - Health check');
  console.log('  GET  /jobs             - List jobs');
  console.log('  POST /jobs             - Create job {query, pages?, maxListings?}');
  console.log('  GET  /jobs/:id         - Job status');
  console.log('  GET  /runs             - List completed runs');
  if (config.server.apiKey) console.log('  Auth: Authorization: Bearer <API_KEY>');
});
