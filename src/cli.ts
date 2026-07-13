import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { config } from './config/env.js';
import { APP_VERSION, SCHEMA_VERSION } from './config/defaults.js';
import { closeBrowser, createBrowserManager } from './scraper/browser.js';
import { scrapeSearchResults } from './scraper/search-scraper.js';
import { scrapeListing } from './scraper/listing-scraper.js';
import type { ListingScrapeResult } from './scraper/listing-scraper.js';
import { evaluateScrapeCompleteness } from './scraper/scrape-quality.js';
import { calculateSalesScore, calculateMarketSummary } from './analysis/scoring.js';
import { extractFeatures, extractMarketFeatures } from './analysis/feature-extractor.js';
import { LlmAnalyzer } from './analysis/llm-analyzer.js';
import { normalizePrice } from './normalization/currency.js';
import { normalizeUrl } from './normalization/url.js';
import { cleanText } from './normalization/text-cleaner.js';
import { exportListingsJson, exportMarketAnalysis, exportFailedListings, exportRunMetadata, validateListingsForExport } from './exporters/json-exporter.js';
import { exportListingsCsv } from './exporters/csv-exporter.js';
import { CheckpointManager } from './storage/checkpoint.js';
import { randomDelay } from './utils/delay.js';
import { ConcurrencyLimiter } from './utils/concurrency.js';
import { createChildLogger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import type { EtsyListing, FailedListing, RunMetadata } from './types/listing.js';
import type { SearchResultItem } from './types/schemas.js';
import type { LlmAnalysisResult } from './types/schemas.js';

const log = createChildLogger('cli');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function createRunDir(query: string, runId?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const slug = slugify(query);
  const safeRunId = runId?.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
  const runDir = path.join(config.paths.runs, `${timestamp}_${slug}${safeRunId ? `_${safeRunId}` : ''}`);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(runDir, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'reports'), { recursive: true });
  return runDir;
}

interface CliArgs {
  query: string;
  pages: number;
  maxListings: number;
  currency: string;
  country: string;
  language: string;
  headless: boolean;
  concurrency: number;
  delayMin: number;
  delayMax: number;
  useLlm: boolean;
  llmProvider: 'anthropic' | 'openai';
  llmModel: string;
  output: string;
  resume: boolean;
  runId: string;
}

function parseArgs(): CliArgs {
  const parsed = yargs(hideBin(process.argv))
    .option('query', { type: 'string', demandOption: true, describe: 'Search query' })
    .option('pages', { type: 'number', default: 2, describe: 'Number of search pages' })
    .option('max-listings', { type: 'number', default: 80, describe: 'Max listings to process' })
    .option('currency', { type: 'string', default: config.defaultCurrency })
    .option('country', { type: 'string', default: config.defaultCountry })
    .option('language', { type: 'string', default: config.defaultLanguage })
    .option('headless', { type: 'boolean', default: config.headless })
    .option('concurrency', { type: 'number', default: config.scraper.concurrency })
    .option('delay-min', { type: 'number', default: config.scraper.delayMinMs })
    .option('delay-max', { type: 'number', default: config.scraper.delayMaxMs })
    .option('use-llm', { type: 'boolean', default: false })
    .option('llm-provider', { type: 'string', default: config.llmProvider, choices: ['anthropic', 'openai'] })
    .option('llm-model', { type: 'string', default: '' })
    .option('output', { type: 'string', default: 'listings-full' })
    .option('resume', { type: 'boolean', default: false })
    .option('run-id', { type: 'string', default: '', describe: 'Unique run identifier used by the API server' })
    .help()
    .parseSync();

  return {
    query: parsed.query,
    pages: parsed.pages,
    maxListings: parsed['max-listings'],
    currency: parsed.currency,
    country: parsed.country,
    language: parsed.language,
    headless: parsed.headless,
    concurrency: parsed.concurrency,
    delayMin: parsed['delay-min'],
    delayMax: parsed['delay-max'],
    useLlm: parsed['use-llm'],
    llmProvider: parsed['llm-provider'] as 'anthropic' | 'openai',
    llmModel: parsed['llm-model'],
    output: parsed.output,
    resume: parsed.resume,
    runId: parsed['run-id'],
  };
}

async function buildListingFromScrapeResult(
  scrapeResult: ListingScrapeResult,
  searchItem: SearchResultItem,
): Promise<EtsyListing> {
  const sr = scrapeResult as ListingScrapeResult;

  const featureResult = extractFeatures(
    sr.descriptionRaw,
    sr.features,
    sr.includedItems,
    sr.fileFormats,
    sr.title,
  );

  const { missingFields, status: scrapingStatus } = evaluateScrapeCompleteness(sr);

  const normalizedPrice = await normalizePrice(
    {
      rawText: sr.price.rawText,
      amount: sr.price.amount,
      currency: sr.price.currency,
      originalPrice: sr.price.originalPrice,
      discountPercent: sr.price.discountPercent,
    },
  );

  const listing: EtsyListing = {
    listingId: sr.listingId ?? searchItem.listingId,
    url: sr.url,
    canonicalUrl: normalizeUrl(sr.url),
    title: sr.title,
    shopName: sr.shopName,
    shopUrl: sr.shopUrl,
    productType: sr.isDigital ? 'digital' : 'unknown',
    price: normalizedPrice,
    rating: {
      listingRating: sr.listingRating,
      listingReviewCount: sr.listingReviewCount,
      shopRating: sr.shopRating,
      shopReviewCount: sr.shopReviewCount,
      shopSales: sr.shopSales,
    },
    badges: {
      bestseller: sr.badges.bestseller,
      etsyPick: sr.badges.etsyPick,
      popularNow: sr.badges.popularNow,
      ad: searchItem.isAd,
    },
    engagement: {
      cartsCount: sr.cartsCount,
      favoritesCount: sr.favoritesCount,
    },
    content: {
      descriptionRaw: sr.descriptionRaw,
      descriptionCleaned: sr.descriptionRaw ? cleanText(sr.descriptionRaw).cleaned : null,
      mainFeature: featureResult.mainFeature,
      features: featureResult.features,
      includedItems: featureResult.includedItems,
      fileFormats: featureResult.fileFormats,
      relatedSearches: sr.relatedSearches,
      extractedKeywords: featureResult.extractedKeywords,
    },
    media: {
      mainImageUrl: sr.mainImageUrl,
      imageUrls: sr.imageUrls,
      imageCount: sr.imageUrls.length,
      hasVideo: sr.hasVideo,
      videoUrl: sr.videoUrl,
    },
    searchPosition: {
      page: searchItem.page,
      position: searchItem.position,
    },
    evidence: sr.evidence,
    salesEstimate: {
      level: 'Unknown',
      score: 0,
      listingEvidenceScore: 0,
      shopProxyScore: 0,
      confidence: 0,
      reasons: [],
      shopProxyReasons: [],
    },
    scraping: {
      status: scrapingStatus,
      scrapedAt: new Date().toISOString(),
      missingFields,
      warnings: [],
    },
  };

  listing.salesEstimate = calculateSalesScore(listing);
  return listing;
}

interface RunResult {
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
  error?: string;
}

function writeRunResult(runDir: string, result: RunResult): void {
  const filePath = path.join(runDir, 'run-result.json');
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startTime = Date.now();

  log.info(
    { query: args.query, pages: args.pages, maxListings: args.maxListings, useLlm: args.useLlm },
    'Starting Etsy market research',
  );

  const checkpointId = args.runId ? `${slugify(args.query)}-${args.runId}` : slugify(args.query);
  const checkpointManager = new CheckpointManager(undefined, checkpointId);
  let checkpoint = args.resume ? checkpointManager.load() : null;
  if (checkpoint && checkpoint.query !== args.query) {
    log.warn(
      { expectedQuery: args.query, checkpointQuery: checkpoint.query },
      'Ignoring checkpoint created for a different query',
    );
    checkpoint = null;
  }

  const canResumeRun = Boolean(
    checkpoint?.runDir && fs.existsSync(checkpoint.runDir),
  );
  const runDir = canResumeRun ? checkpoint!.runDir : createRunDir(args.query, args.runId);
  const reportsDir = path.join(runDir, 'reports');
  const rawDir = path.join(runDir, 'raw');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const outputName = canResumeRun ? checkpoint!.outputName : args.output;

  log.info({ runDir, resumed: canResumeRun }, canResumeRun ? 'Run directory resumed' : 'Run directory created');

  if (args.resume && canResumeRun && checkpoint) {
    log.info({ processed: checkpoint.processedUrls.length }, 'Resuming from checkpoint');
  }

  // Load existing results for resume merge
  let existingListings: EtsyListing[] = [];
  let existingFailed: FailedListing[] = [];
  if (args.resume && canResumeRun) {
    const existingListingsPath = path.join(reportsDir, `${outputName}.json`);
    const existingFailedPath = path.join(reportsDir, 'failed-listings.json');
    if (fs.existsSync(existingListingsPath)) {
      const storedListings = JSON.parse(fs.readFileSync(existingListingsPath, 'utf-8')) as EtsyListing[];
      existingListings = validateListingsForExport(storedListings);
      log.info({ count: existingListings.length }, 'Loaded existing listings for merge');
    }
    if (fs.existsSync(existingFailedPath)) {
      existingFailed = JSON.parse(fs.readFileSync(existingFailedPath, 'utf-8')) as FailedListing[];
    }
  }

  // Phase 1: Search scraping
  log.info('=== Phase 1: Search Results ===');
  const browserManager = await createBrowserManager(args.headless);

  let searchResults: SearchResultItem[];
  let searchBlockedCount = 0;
  try {
    const searchScrapeResult = await scrapeSearchResults(browserManager, {
      query: args.query,
      pages: args.pages,
      currency: args.currency,
      country: args.country,
      language: args.language,
      delayMinMs: args.delayMin,
      delayMaxMs: args.delayMax,
      timeoutMs: config.scraper.timeoutMs,
    });
    searchResults = searchScrapeResult.results;
    searchBlockedCount = searchScrapeResult.blockedCount;
  } finally {
    await browserManager.close();
  }

  if (searchResults.length > args.maxListings) {
    searchResults = searchResults.slice(0, args.maxListings);
  }

  log.info({ total: searchResults.length }, 'Search results collected');

  const searchResultsPath = path.join(rawDir, 'search-results.json');
  fs.writeFileSync(searchResultsPath, JSON.stringify(searchResults, null, 2));

  // Phase 2: Deep listing scraping
  log.info('=== Phase 2: Deep Listing Scraping ===');
  const listings: EtsyListing[] = [...existingListings];
  const failedListings: FailedListing[] = [...existingFailed];
  let blockedCount = searchBlockedCount;

  const bm = await createBrowserManager(args.headless);
  const concurrencyLimiter = new ConcurrencyLimiter(args.concurrency);

  // Sliding window for error tracking
  const errorWindow: boolean[] = [];
  const windowSize = 10;
  let completedCount = 0;
  let processedSinceCheckpoint = 0;

  const ensureCheckpoint = (): NonNullable<typeof checkpoint> => {
    checkpoint ??= {
      processedUrls: [],
      successfulUrls: [],
      failedUrls: [],
      timestamp: '',
      query: args.query,
      runDir,
      outputName,
    };
    return checkpoint;
  };

  const persistProgress = (): void => {
    if (!checkpoint) return;
    try {
      checkpointManager.save(checkpoint);
      fs.writeFileSync(
        path.join(reportsDir, `${outputName}.json`),
        JSON.stringify(listings, null, 2),
        'utf-8',
      );
      fs.writeFileSync(
        path.join(reportsDir, 'failed-listings.json'),
        JSON.stringify(failedListings, null, 2),
        'utf-8',
      );
      processedSinceCheckpoint = 0;
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to persist resumable progress');
    }
  };

  const recordFailure = (
    searchItem: SearchResultItem,
    errorType: FailedListing['errorType'],
    message: string,
  ): void => {
    failedListings.push({
      url: searchItem.url,
      listingId: searchItem.listingId,
      errorType,
      message,
      attempts: config.scraper.maxRetries + 1,
      timestamp: new Date().toISOString(),
    });

    const currentCheckpoint = ensureCheckpoint();
    currentCheckpoint.processedUrls.push(searchItem.url);
    currentCheckpoint.failedUrls.push(searchItem.url);
  };

  const updateErrorWindow = (failed: boolean): void => {
    errorWindow.push(failed);
    if (errorWindow.length > windowSize) errorWindow.shift();
  };

  const logProgress = (): void => {
    const remaining = searchResults.length - completedCount;
    log.info(
      { completed: completedCount, remaining, success: listings.length, failed: failedListings.length },
      `Progress: ${completedCount}/${searchResults.length} (${remaining} remaining)`,
    );
  };

  try {
    const tasks = searchResults.map(async (searchItem, i) => {
      if (checkpoint && checkpointManager.isUrlProcessed(searchItem.url, checkpoint)) {
        log.debug({ url: searchItem.url }, 'Skipping already processed URL');
        completedCount++;
        logProgress();
        return;
      }

      await concurrencyLimiter.acquire();

      try {
        if (errorWindow.length >= windowSize) {
          const errorRate = errorWindow.filter(Boolean).length / windowSize;
          if (errorRate > 0.3 && concurrencyLimiter.limit > 1) {
            concurrencyLimiter.reduce();
            log.warn({ errorRate, concurrency: concurrencyLimiter.limit }, 'Reducing concurrency');
          }
        }

        log.info(
          { index: i + 1, total: searchResults.length, url: searchItem.url },
          `Processing listing ${i + 1}/${searchResults.length}`,
        );

        const { result, errorType, error } = await scrapeListing(
          bm,
          searchItem,
          config.scraper.timeoutMs,
          config.scraper.maxRetries,
        );

        if (result) {
          const listing = await buildListingFromScrapeResult(result, searchItem);
          listings.push(listing);

          const currentCheckpoint = ensureCheckpoint();
          currentCheckpoint.processedUrls.push(searchItem.url);
          currentCheckpoint.successfulUrls.push(searchItem.url);

          updateErrorWindow(false);

          log.info(
            { title: listing.title?.substring(0, 50), salesLevel: listing.salesEstimate.level },
            `Scraped: ${listing.title?.substring(0, 50) ?? 'unknown'}`,
          );
        } else {
          recordFailure(searchItem, errorType ?? 'UNKNOWN', error ?? 'Unknown error');
          updateErrorWindow(true);

          if (errorType === 'BLOCKED') {
            blockedCount++;
            log.warn('Blocked — pausing and reducing concurrency');
            concurrencyLimiter.reduce();
            await randomDelay(10000, 20000);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        recordFailure(searchItem, 'UNKNOWN', error.message);
        updateErrorWindow(true);
        log.error({ url: searchItem.url, error: error.message }, 'Unexpected listing processing failure');
      } finally {
        processedSinceCheckpoint++;
        completedCount++;
        concurrencyLimiter.release();
        if (processedSinceCheckpoint >= config.checkpoint.interval) {
          persistProgress();
        }
        logProgress();
      }

      if (i < searchResults.length - 1) {
        await randomDelay(args.delayMin, args.delayMax);
      }
    });

    await Promise.all(tasks);
    listings.sort(
      (a, b) => a.searchPosition.page - b.searchPosition.page || a.searchPosition.position - b.searchPosition.position,
    );
  } finally {
    if (processedSinceCheckpoint > 0) persistProgress();
    await bm.close();
  }

  // Phase 3: Market analysis
  log.info('=== Phase 3: Market Analysis ===');
  const marketSummary = calculateMarketSummary(listings);
  extractMarketFeatures(listings);

  let llmAnalysis: LlmAnalysisResult | null = null;
  if (args.useLlm) {
    const apiKey = args.llmProvider === 'anthropic' ? config.anthropicApiKey : config.openaiApiKey;
    if (apiKey) {
      log.info({ provider: args.llmProvider }, '=== Phase 3b: LLM Analysis ===');
      try {
        const analyzer = new LlmAnalyzer({ provider: args.llmProvider, apiKey, model: args.llmModel || undefined });
        llmAnalysis = await analyzer.analyze(listings);
        log.info('LLM analysis completed');
      } catch (err) {
        log.error({ error: (err as Error).message }, 'LLM analysis failed');
      }
    } else {
      log.warn(`LLM requested but ${args.llmProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} not set`);
    }
  }

  // Phase 4: Export
  log.info('=== Phase 4: Export ===');
  const durationMs = Date.now() - startTime;

  exportListingsJson(listings, `${outputName}.json`, reportsDir);
  await exportListingsCsv(listings, `${outputName.replace('-full', '-summary')}.csv`, reportsDir);
  exportFailedListings(failedListings, 'failed-listings.json', reportsDir);

  if (llmAnalysis) {
    exportMarketAnalysis(llmAnalysis, 'market-analysis.json', reportsDir);
  }

  const metadata: RunMetadata = {
    query: args.query,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    params: { pages: args.pages, maxListings: args.maxListings, currency: args.currency, country: args.country, language: args.language, headless: args.headless, concurrency: args.concurrency, useLlm: args.useLlm },
    totalFound: searchResults.length,
    successCount: listings.filter((l) => l.scraping.status === 'success').length,
    partialCount: listings.filter((l) => l.scraping.status === 'partial').length,
    failedCount: failedListings.length - existingFailed.length,
    blockedCount,
    durationMs,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
  };
  exportRunMetadata(metadata, 'run-metadata.json', reportsDir);

  checkpointManager.clear();

  // Write structured result for server to read
  const searchWasFullyBlocked = searchBlockedCount > 0 && searchResults.length === 0;
  const runResult: RunResult = {
    status: searchWasFullyBlocked ? 'failed' : 'completed',
    query: args.query,
    runDir,
    totalFound: searchResults.length,
    successCount: metadata.successCount,
    partialCount: metadata.partialCount,
    failedCount: metadata.failedCount,
    blockedCount,
    averagePriceUsd: marketSummary.averagePriceUsd,
    medianPriceUsd: marketSummary.medianPriceUsd,
    durationMs,
    ...(searchWasFullyBlocked ? { error: 'Etsy blocked search access before results were collected' } : {}),
  };
  writeRunResult(runDir, runResult);

  // Also write to stdout for backward compat
  console.log(JSON.stringify(runResult));

  log.info('=== Research Complete ===');
  log.info({ ...runResult, runDir }, 'Summary');
}

main()
  .catch((err) => {
    log.fatal({ error: (err as Error).message }, 'Fatal error');
    const failResult: RunResult = {
      status: 'failed',
      query: process.argv.find((a) => a === '--query') ? process.argv[process.argv.indexOf('--query') + 1] : 'unknown',
      runDir: '',
      totalFound: 0,
      successCount: 0,
      partialCount: 0,
      failedCount: 0,
      blockedCount: 0,
      averagePriceUsd: null,
      medianPriceUsd: null,
      durationMs: 0,
      error: (err as Error).message,
    };
    console.log(JSON.stringify(failResult));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
  });
