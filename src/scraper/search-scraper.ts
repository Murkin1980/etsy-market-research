import type { SearchResultItem } from '../types/schemas.js';
import { buildSearchUrl, deduplicateByListingId } from '../normalization/url.js';
import { parseSearchPage } from './parsers.js';
import { SEARCH_SELECTORS } from './selectors.js';
import { createChildLogger } from '../utils/logger.js';
import { randomDelay } from '../utils/delay.js';
import type { BrowserManager } from './browser.js';

const log = createChildLogger('search-scraper');

export interface SearchScraperOptions {
  query: string;
  pages: number;
  currency: string;
  country: string;
  language: string;
  delayMinMs: number;
  delayMaxMs: number;
  timeoutMs: number;
}

export async function scrapeSearchResults(
  browserManager: BrowserManager,
  options: SearchScraperOptions,
): Promise<SearchResultItem[]> {
  const { query, pages, currency, country, language, delayMinMs, delayMaxMs, timeoutMs } = options;
  const page = browserManager.getPage();
  const allResults: SearchResultItem[] = [];

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const searchUrl = buildSearchUrl(query, pageNum, currency, country, language);
    log.info({ page: pageNum, url: searchUrl }, 'Navigating to search page');

    try {
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      // Wait for results to load
      try {
        await page.waitForSelector(SEARCH_SELECTORS.listingCard, {
          timeout: 10000,
        });
      } catch {
        log.warn({ page: pageNum }, 'Could not find listing cards, trying alternative wait');
        await page.waitForTimeout(3000);
      }

      // Check for blocked page
      const blocked = await browserManager.isBlocked(page);
      if (blocked) {
        log.error({ page: pageNum }, 'Blocked page detected, stopping search');
        break;
      }

      // Get page HTML and parse
      const html = await page.content();
      const { results, nextPageAvailable } = parseSearchPage(html, pageNum);

      log.info(
        { page: pageNum, resultsCount: results.length },
        `Page ${pageNum}: found ${results.length} results`,
      );

      allResults.push(...results);

      if (!nextPageAvailable && pageNum < pages) {
        log.info({ page: pageNum }, 'No more pages available');
        break;
      }

      // Random delay between pages
      if (pageNum < pages) {
        const waitMs = Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs;
        log.debug({ waitMs }, 'Waiting before next page');
        await randomDelay(delayMinMs, delayMaxMs);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(
        { page: pageNum, error: error.message },
        'Failed to scrape search page',
      );
    }
  }

  const deduplicated = deduplicateByListingId(allResults);
  log.info(
    { total: allResults.length, deduplicated: deduplicated.length },
    'Search scraping complete',
  );

  return deduplicated;
}
