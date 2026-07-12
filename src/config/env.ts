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

export const config = {
  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  openaiApiKey: env('OPENAI_API_KEY'),
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
  cache: {
    ttlHours: envInt('SCRAPE_CACHE_TTL_HOURS', 24),
  },
  checkpoint: {
    interval: envInt('CHECKPOINT_INTERVAL', 5),
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
    logs: path.resolve('logs'),
  },
} as const;
