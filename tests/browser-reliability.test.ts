import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { detectBlockReason } from '../src/scraper/browser.js';
import type { BrowserManager } from '../src/scraper/browser.js';
import { classifyScrapeError } from '../src/scraper/listing-scraper.js';
import { scrapeSearchResults } from '../src/scraper/search-scraper.js';
import { RetryError, withRetry } from '../src/utils/retry.js';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8');

describe('browser reliability helpers', () => {
  it('distinguishes blocked pages from CAPTCHA challenges', () => {
    expect(detectBlockReason(fixture('blocked-page.html'))).toBe('BLOCKED');
    expect(detectBlockReason(fixture('captcha-page.html'))).toBe('CAPTCHA');
    expect(detectBlockReason('<html><body>Product page</body></html>')).toBeNull();
    expect(detectBlockReason('<html></html>', 'https://www.etsy.com/captcha/check')).toBe('CAPTCHA');
  });

  it('retries transient failures and returns the eventual result', async () => {
    let attempts = 0;
    const value = await withRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary network issue');
      return 'ok';
    }, { maxRetries: 2, baseDelayMs: 1 });

    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('reports exact attempts when retry budget is exhausted by a timeout', async () => {
    const operation = withRetry(
      async () => { throw new Error('Timeout 100ms exceeded'); },
      { maxRetries: 2, baseDelayMs: 1 },
      'fixture page',
    );

    await expect(operation).rejects.toMatchObject<Partial<RetryError>>({
      name: 'RetryError',
      attempts: 3,
      lastError: expect.objectContaining({ message: 'Timeout 100ms exceeded' }),
    });
  });

  it('preserves timeout and challenge types through retry errors', () => {
    expect(classifyScrapeError(new RetryError('failed', 3, new Error('CAPTCHA')))).toBe('CAPTCHA');
    expect(classifyScrapeError(new RetryError('failed', 3, new Error('BLOCKED')))).toBe('BLOCKED');
    expect(classifyScrapeError(new RetryError('failed', 3, new Error('page.goto: Timeout exceeded'))))
      .toBe('TIMEOUT');
    expect(classifyScrapeError(new Error('net::ERR_CONNECTION_RESET'))).toBe('HTTP_ERROR');
  });

  it('surfaces a blocked search page instead of returning a successful empty search', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockRejectedValue(new Error('no listing cards')),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const browserManager = {
      getPage: () => page,
      isBlocked: vi.fn().mockResolvedValue(true),
    } as unknown as BrowserManager;

    const result = await scrapeSearchResults(browserManager, {
      query: 'planner',
      pages: 1,
      currency: 'USD',
      country: 'US',
      language: 'en-US',
      delayMinMs: 1,
      delayMaxMs: 2,
      timeoutMs: 100,
    });

    expect(result).toEqual({ results: [], blockedCount: 1 });
  });
});
