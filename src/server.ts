import http from 'http';
import { spawn } from 'child_process';
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
    totalFound: number;
    successCount: number;
    failedCount: number;
    averagePriceUsd: number | null;
    outputDir: string;
  };
  error?: string;
}

const jobs: ResearchJob[] = [];
let jobCounter = 0;

function runResearch(args: {
  query: string;
  pages: number;
  maxListings: number;
  currency: string;
  country: string;
  useLlm: boolean;
}): Promise<ResearchJob['result']> {
  return new Promise((resolve, reject) => {
    const params = [
      'dist/cli.js',
      '--query', args.query,
      '--pages', String(args.pages),
      '--max-listings', String(args.maxListings),
      '--currency', args.currency,
      '--country', args.country,
    ];
    if (args.useLlm) params.push('--use-llm');

    const child = spawn('node', params, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      const metadataMatch = stdout.match(/Scraped: (\d+)/);
      const priceMatch = stdout.match(/Avg Price USD: \$([0-9.]+)/);
      const foundMatch = stdout.match(/Found: (\d+)/);

      resolve({
        totalFound: foundMatch ? parseInt(foundMatch[1], 10) : 0,
        successCount: metadataMatch ? parseInt(metadataMatch[1], 10) : 0,
        failedCount: 0,
        averagePriceUsd: priceMatch ? parseFloat(priceMatch[1]) : null,
        outputDir: config.paths.reports,
      });
    });

    child.on('error', (err: Error) => {
      reject(err);
    });
  });
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
      jobs: jobs.length,
    });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'GET') {
    sendJson(res, 200, { jobs, total: jobs.length });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const query = body.query as string | undefined;
      if (!query) {
        sendJson(res, 400, { error: 'query is required' });
        return;
      }

      jobCounter++;
      const job: ResearchJob = {
        id: `job-${jobCounter}`,
        query,
        status: 'queued',
        startedAt: new Date().toISOString(),
      };
      jobs.push(job);

      log.info({ jobId: job.id, query }, 'Research job queued');

      job.status = 'running';
      runResearch({
        query,
        pages: (body.pages as number) || 2,
        maxListings: (body.maxListings as number) || 80,
        currency: (body.currency as string) || 'USD',
        country: (body.country as string) || 'US',
        useLlm: (body.useLlm as boolean) || false,
      })
        .then((result) => {
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
          job.result = result;
          log.info({ jobId: job.id }, 'Research job completed');
        })
        .catch((err: Error) => {
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          job.error = err.message;
          log.error({ jobId: job.id, error: err.message }, 'Research job failed');
        });

      sendJson(res, 202, { jobId: job.id, status: job.status });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  if (url.pathname.startsWith('/jobs/') && req.method === 'GET') {
    const jobId = url.pathname.split('/')[2];
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      sendJson(res, 404, { error: 'Job not found' });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  log.info({ port: PORT }, 'Etsy Research API server started');
  console.log(`Etsy Research API running on http://0.0.0.0:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health          - Health check');
  console.log('  GET  /jobs            - List all jobs');
  console.log('  POST /jobs            - Start research (body: {query, pages?, maxListings?, currency?, country?, useLlm?})');
  console.log('  GET  /jobs/:id        - Get job status');
});
