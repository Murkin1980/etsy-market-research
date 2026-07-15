import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from './config/env.js';
import {
  buildCliParams,
  getClientIp,
  parseCheckoutRequest,
  parseJsonBody,
  parseAiAnalysisRequest,
  parseNicheComparisonRequest,
  parseEtsyApiSettings,
  parseInviteRequest,
  parsePlanChangeRequest,
  parseResearchJobRequest,
  parseLoginRequest,
  parseRegisterRequest,
  parseRunResultOutput,
  readRawBody,
  RequestBodyError,
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
  loadRunListings,
  RunReportError,
} from './analysis/run-report-analyzer.js';
import { compareNiches } from './analysis/niche-comparison.js';
import { AccountStore } from './auth/account-store.js';
import { authenticateRequest, clearSessionCookie, sessionCookie, type RequestPrincipal } from './auth/http-auth.js';
import { RunOwnershipStore } from './storage/run-ownership.js';
import { BillingStore, PLAN_CATALOG, QuotaExceededError } from './billing/billing-store.js';
import { createPaddleCheckout, paddleConfigured, parsePaddleSubscriptionEvent, verifyPaddleWebhook } from './billing/paddle.js';

const log = createChildLogger('server');

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const MIN_PRODUCTION_API_KEY_LENGTH = 24;
const APP_VERSION = '1.7.1';
const activeChildren = new Set<ReturnType<typeof spawn>>();
const activeAiAnalyses = new Set<string>();
let rateLimitChecks = 0;
let runtimeEtsyApiKey = config.etsyApiKey;
let etsyApiStatus: 'missing' | 'checking' | 'verified' | 'invalid' = runtimeEtsyApiKey
  ? 'checking'
  : 'missing';
let credentialStore: EncryptedCredentialStore | null = null;
const accountStore = new AccountStore(
  path.join(config.paths.auth, 'accounts.json'),
  config.server.sessionTtlDays,
);
const runOwnershipStore = new RunOwnershipStore(path.join(config.paths.auth, 'run-owners.json'));
const billingStore = new BillingStore(path.join(config.paths.billing, 'billing.json'));

function checkRateLimit(ip: string, limit: number): boolean {
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
        const runId = result.runDir ? path.basename(result.runDir) : '';
        if (runId) runOwnershipStore.assign(runId, job.ownerId);
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

function principalPayload(principal: RequestPrincipal, csrfToken: string | null): Record<string, unknown> {
  return {
    authenticated: true,
    user: principal.account ?? {
      id: principal.userId,
      email: principal.authType === 'api-key' ? 'admin@local' : 'local@development',
      name: principal.authType === 'api-key' ? 'Production administrator' : 'Local administrator',
      role: principal.role,
    },
    authType: principal.authType,
    csrfToken,
  };
}

function isStateChanging(method: string | undefined): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
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
      authentication: 'accounts-and-admin-key',
      billing: paddleConfigured(config.paddle) ? 'paddle' : 'trial-only',
    });
    return;
  }

  if (url.pathname === '/webhooks/paddle' && req.method === 'POST') {
    try {
      const rawBody = await readRawBody(req, Math.max(config.server.maxRequestBodyBytes, 262_144));
      const signature = Array.isArray(req.headers['paddle-signature'])
        ? req.headers['paddle-signature'][0]
        : req.headers['paddle-signature'] ?? '';
      if (!verifyPaddleWebhook(rawBody, signature, config.paddle.webhookSecret)) {
        sendJson(res, 401, { error: 'Invalid Paddle signature' });
        return;
      }
      const event = parsePaddleSubscriptionEvent(JSON.parse(rawBody), config.paddle.prices);
      if (event && accountStore.hasAccount(event.accountId)) billingStore.applyPaddleSubscription(event);
      sendJson(res, 200, { received: true });
    } catch (error) {
      if (error instanceof RequestBodyError) sendJson(res, error.statusCode, { error: error.message });
      else sendJson(res, 400, { error: 'Invalid Paddle webhook' });
    }
    return;
  }

  const ip = getClientIp(req, config.server.trustProxy);
  const rateLimit = req.method === 'GET'
    ? config.server.rateLimitPerMinute * 10
    : config.server.rateLimitPerMinute;
  if (!checkRateLimit(ip, rateLimit)) {
    sendJson(res, 429, {
      error: 'Rate limit exceeded',
      limit: rateLimit,
      window: '60s',
    });
    return;
  }

  if (url.pathname === '/auth/register' && req.method === 'POST') {
    try {
      const input = parseRegisterRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      const account = await accountStore.register(input);
      const session = accountStore.createSession(account.id);
      res.setHeader('Set-Cookie', sessionCookie(session.token, config.server.sessionTtlDays * 86_400, config.isProduction));
      sendJson(res, 201, {
        authenticated: true,
        user: account,
        authType: 'session',
        csrfToken: session.csrfToken,
      });
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else {
        sendJson(res, 422, { error: (error as Error).message });
      }
    }
    return;
  }

  if (url.pathname === '/auth/login' && req.method === 'POST') {
    try {
      const input = parseLoginRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      const account = await accountStore.verifyPassword(input.email, input.password);
      if (!account) {
        sendJson(res, 401, { error: 'Email or password is incorrect' });
        return;
      }
      const session = accountStore.createSession(account.id);
      res.setHeader('Set-Cookie', sessionCookie(session.token, config.server.sessionTtlDays * 86_400, config.isProduction));
      sendJson(res, 200, {
        authenticated: true,
        user: account,
        authType: 'session',
        csrfToken: session.csrfToken,
      });
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendJson(res, error.statusCode, { error: error.message, details: error.details });
      } else {
        log.error({ error: (error as Error).message }, 'Login failed');
        sendJson(res, 500, { error: 'Login failed' });
      }
    }
    return;
  }

  const principal = authenticateRequest(req, accountStore, config.server.apiKey, config.server.requireApiKey);

  if (url.pathname === '/auth/me' && req.method === 'GET') {
    if (!principal) {
      sendJson(res, 200, { authenticated: false });
      return;
    }
    const csrfToken = principal.sessionId ? accountStore.rotateCsrf(principal.sessionId) : null;
    sendJson(res, 200, principalPayload(principal, csrfToken));
    return;
  }

  if (!principal) {
    sendJson(res, 401, { error: 'Authentication required' });
    return;
  }

  if (principal.sessionId && isStateChanging(req.method)) {
    const csrfToken = Array.isArray(req.headers['x-csrf-token'])
      ? req.headers['x-csrf-token'][0]
      : req.headers['x-csrf-token'] ?? '';
    if (!accountStore.verifyCsrf(principal.sessionId, csrfToken)) {
      sendJson(res, 403, { error: 'Security token is missing or expired. Refresh the page and try again.' });
      return;
    }
  }

  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    if (principal.sessionId) accountStore.deleteSession(principal.sessionId);
    res.setHeader('Set-Cookie', clearSessionCookie(config.isProduction));
    sendJson(res, 200, { authenticated: false });
    return;
  }

  if (url.pathname === '/billing/status' && req.method === 'GET') {
    if (principal.authType !== 'session') {
      sendJson(res, 200, {
        unlimited: true,
        plan: { id: 'internal', name: 'Владелец', monthlyPriceUsd: 0, limits: null },
        checkoutConfigured: paddleConfigured(config.paddle),
        plans: Object.values(PLAN_CATALOG),
      });
      return;
    }
    sendJson(res, 200, {
      unlimited: false,
      ...billingStore.status(principal.userId),
      checkoutConfigured: paddleConfigured(config.paddle),
      plans: Object.values(PLAN_CATALOG),
    });
    return;
  }

  if (url.pathname === '/billing/checkout' && req.method === 'POST') {
    if (!principal.account) {
      sendJson(res, 400, { error: 'Checkout requires an account session' });
      return;
    }
    try {
      const input = parseCheckoutRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      const checkoutUrl = await createPaddleCheckout(config.paddle, {
        accountId: principal.account.id,
        planId: input.planId,
      });
      sendJson(res, 201, { checkoutUrl });
    } catch (error) {
      if (error instanceof RequestBodyError) sendJson(res, error.statusCode, { error: error.message, details: error.details });
      else sendJson(res, 503, { error: (error as Error).message });
    }
    return;
  }

  if (url.pathname === '/admin/invites' && req.method === 'POST') {
    if (principal.role !== 'admin') {
      sendJson(res, 403, { error: 'Administrator access is required' });
      return;
    }
    try {
      const input = parseInviteRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      const invite = accountStore.createInvite(principal.userId, input.role);
      sendJson(res, 201, { ...invite, role: input.role });
    } catch (error) {
      if (error instanceof RequestBodyError) sendJson(res, error.statusCode, { error: error.message, details: error.details });
      else sendJson(res, 500, { error: 'Failed to create invitation' });
    }
    return;
  }

  if (url.pathname === '/admin/accounts' && req.method === 'GET') {
    if (principal.role !== 'admin') {
      sendJson(res, 403, { error: 'Administrator access is required' });
      return;
    }
    const accounts = accountStore.listAccounts().map((account) => ({ ...account, billing: billingStore.status(account.id) }));
    sendJson(res, 200, { accounts, total: accounts.length });
    return;
  }

  const adminPlanMatch = url.pathname.match(/^\/admin\/accounts\/([^/]+)\/plan$/);
  if (adminPlanMatch && req.method === 'PUT') {
    if (principal.role !== 'admin') {
      sendJson(res, 403, { error: 'Administrator access is required' });
      return;
    }
    const accountId = decodePathSegment(adminPlanMatch[1]);
    if (!accountId || !accountStore.hasAccount(accountId)) {
      sendJson(res, 404, { error: 'Account not found' });
      return;
    }
    try {
      const input = parsePlanChangeRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      sendJson(res, 200, billingStore.setPlan(accountId, input.planId));
    } catch (error) {
      if (error instanceof RequestBodyError) sendJson(res, error.statusCode, { error: error.message, details: error.details });
      else sendJson(res, 500, { error: 'Failed to update plan' });
    }
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
    if (principal.role !== 'admin') {
      sendJson(res, 403, { error: 'Administrator access is required' });
      return;
    }
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
    const jobs = jobManager.list(principal.userId, principal.role === 'admin');
    sendJson(res, 200, { jobs, total: jobs.length });
    return;
  }

  if (url.pathname === '/jobs' && req.method === 'POST') {
    let quotaConsumed = false;
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
      if (principal.authType === 'session') {
        billingStore.assertResearchAllowed(principal.userId, request.maxListings);
        billingStore.consume(principal.userId, 'research');
        quotaConsumed = true;
      }
      const { job, queuePosition } = jobManager.enqueue(request, principal.userId);
      log.info({ jobId: job.id, query: job.query }, 'Job queued');

      sendJson(res, 202, {
        jobId: job.id,
        status: job.status,
        ...(queuePosition > 0 ? { queuePosition } : {}),
      });
    } catch (error) {
      if (quotaConsumed) billingStore.refund(principal.userId, 'research');
      if (error instanceof JobQueueFullError) {
        sendJson(res, 429, { error: 'Job queue is full', maxQueued: error.maxQueued });
      } else if (error instanceof QuotaExceededError) {
        sendJson(res, 402, { error: error.message, quota: error.kind, limit: error.limit });
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
    const job = jobManager.get(jobId, principal.userId, principal.role === 'admin');
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
      .filter((directory) => runOwnershipStore.canAccess(directory, principal.userId, principal.role))
      .map((directory) => ({ id: directory, ...readRunResult(path.join(runsDir, directory)) }));
    sendJson(res, 200, { runs, total: runs.length });
    return;
  }

  if (url.pathname === '/comparisons' && req.method === 'POST') {
    try {
      const { runIds } = parseNicheComparisonRequest(await parseJsonBody(req, config.server.maxRequestBodyBytes));
      const inputs = runIds.map((runId) => {
        if (!runOwnershipStore.canAccess(runId, principal.userId, principal.role)) {
          throw new RunReportError('Run not found', 404);
        }
        const result = readRunResult(path.join(config.paths.runs, runId));
        if (!result || result.status !== 'completed') throw new RunReportError('Only completed reports can be compared', 422);
        return { runId, query: result.query, listings: loadRunListings(config.paths.runs, runId) };
      });
      sendJson(res, 201, { comparison: compareNiches(inputs) });
    } catch (error) {
      if (error instanceof RequestBodyError) sendJson(res, error.statusCode, { error: error.message, details: error.details });
      else if (error instanceof RunReportError) sendJson(res, error.statusCode, { error: error.message });
      else {
        log.error({ error: (error as Error).message }, 'Niche comparison failed');
        sendJson(res, 500, { error: 'Niche comparison failed' });
      }
    }
    return;
  }

  const runAiAnalysisMatch = url.pathname.match(/^\/runs\/([^/]+)\/ai-analysis$/);
  if (runAiAnalysisMatch && (req.method === 'GET' || req.method === 'POST')) {
    const runId = decodePathSegment(runAiAnalysisMatch[1]);
    if (!runId) {
      sendJson(res, 400, { error: 'Invalid run identifier' });
      return;
    }
    if (!runOwnershipStore.canAccess(runId, principal.userId, principal.role)) {
      sendJson(res, 404, { error: 'Run not found' });
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
      const existingAnalysis = getRunAiAnalysis(config.paths.runs, runId, Boolean(config.openaiApiKey), config.openaiModel);
      if (principal.authType === 'session' && (request.force || existingAnalysis.status !== 'ready')) {
        billingStore.consume(principal.userId, 'aiAnalysis');
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
      if (error instanceof QuotaExceededError) {
        sendJson(res, 402, { error: error.message, quota: error.kind, limit: error.limit });
      } else if (error instanceof RequestBodyError) {
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
    if (!runOwnershipStore.canAccess(runId, principal.userId, principal.role)) {
      sendJson(res, 404, { error: 'Run not found' });
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
    if (!runOwnershipStore.canAccess(runId, principal.userId, principal.role)) {
      sendJson(res, 404, { error: 'Run file not found' });
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
  console.log('  POST /auth/login       - Start an account session');
  console.log('  POST /auth/register    - Create an invited account');
  console.log('  GET  /auth/me          - Read the current session');
  console.log('  POST /admin/invites    - Create a one-time invitation (admin)');
  console.log('  GET  /billing/status   - Read plan limits and monthly usage');
  console.log('  POST /billing/checkout - Start Paddle hosted checkout');
  console.log('  POST /webhooks/paddle  - Receive verified subscription events');
  console.log('  GET  /jobs             - List jobs');
  console.log('  POST /jobs             - Create a validated research job');
  console.log('  GET  /jobs/:id         - Job status');
  console.log('  GET  /runs             - List completed runs');
  console.log('  GET  /runs/:id/ai-analysis - Read report analysis');
  console.log('  POST /runs/:id/ai-analysis - Analyze a completed report');
  console.log('  PUT  /settings/etsy-api - Verify and save Etsy API credentials');
  if (config.server.apiKey) console.log('  Auth: account session or administrative Bearer API key');

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
