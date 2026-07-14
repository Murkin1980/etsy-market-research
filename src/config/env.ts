import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function env(key: string, fallback: string = ''): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
}

const nodeEnv = env('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProduction,
  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  openaiApiKey: env('OPENAI_API_KEY'),
  etsyApiKey: env('ETSY_API_KEY'),
  etsyDataSource: env('ETSY_DATA_SOURCE', 'api') as 'api' | 'scraper',
  etsyApiBaseUrl: env('ETSY_API_BASE_URL', 'https://api.etsy.com/v3/application'),
  llmProvider: env('LLM_PROVIDER', 'openai') as 'anthropic' | 'openai',
  headless: envBool('HEADLESS', true),
  defaultCurrency: env('DEFAULT_CURRENCY', 'USD'),
  defaultCountry: env('DEFAULT_COUNTRY', 'US'),
  defaultLanguage: env('DEFAULT_LANGUAGE', 'en-US'),
  scraper: {
    concurrency: envInt('SCRAPER_CONCURRENCY', 2),
    delayMinMs: envInt('SCRAPER_DELAY_MIN_MS', 2500),
    delayMaxMs: envInt('SCRAPER_DELAY_MAX_MS', 6000),
    timeoutMs: envInt('SCRAPER_TIMEOUT_MS', 45000),
    maxRetries: envInt('SCRAPER_MAX_RETRIES', 3),
  },
  etsyApi: {
    timeoutMs: envInt('ETSY_API_TIMEOUT_MS', 30_000),
    maxRetries: envInt('ETSY_API_MAX_RETRIES', 3),
  },
  cache: {
    ttlHours: envInt('SCRAPE_CACHE_TTL_HOURS', 24),
  },
  checkpoint: {
    interval: envInt('CHECKPOINT_INTERVAL', 5),
  },
  server: {
    apiKey: env('API_KEY', ''),
    requireApiKey: envBool('REQUIRE_API_KEY', isProduction),
    host: env('SERVER_HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
    trustProxy: envBool('TRUST_PROXY', false),
    corsOrigin: env('CORS_ORIGIN', ''),
    rateLimitPerMinute: envInt('RATE_LIMIT_PER_MINUTE', 10),
    maxConcurrentJobs: envInt('MAX_CONCURRENT_JOBS', 2),
    maxQueuedJobs: envInt('MAX_QUEUED_JOBS', 50),
    maxJobsRetained: envInt('MAX_JOBS_RETAINED', 100),
    maxRequestBodyBytes: envInt('MAX_REQUEST_BODY_BYTES', 16_384),
  },
  logging: {
    level: env('LOG_LEVEL', 'info'),
  },
  outputDirectory: env('OUTPUT_DIRECTORY', './data/reports'),
  paths: {
    rawData: path.resolve('data/raw'),
    normalizedData: path.resolve('data/normalized'),
    reports: path.resolve('data/reports'),
    checkpoints: path.resolve('data/checkpoints'),
    settings: path.resolve('data/settings'),
    runs: path.resolve('data/runs'),
    logs: path.resolve('logs'),
  },
} as const;
