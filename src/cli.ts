import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { config } from './config/env.js';
import { APP_VERSION, SCHEMA_VERSION } from './config/defaults.js';
import { createBrowserManager } from './scraper/browser.js';
import { scrapeSearchResults } from './scraper/search-scraper.js';
import { scrapeListing, type ListingScrapeResult } from './scraper/listing-scraper.js';
import { calculateSalesScore, calculateMarketSummary } from './analysis/scoring.js';
import { extractFeatures, extractMarketFeatures } from './analysis/feature-extractor.js';
import { LlmAnalyzer } from './analysis/llm-analyzer.js';
import { normalizePrice } from './normalization/currency.js';
import { normalizeUrl } from './normalization/url.js';
import { cleanText } from './normalization/text-cleaner.js';
import { exportListingsJson, exportMarketAnalysis, exportFailedListings, exportRunMetadata } from './exporters/json-exporter.js';
import { exportListingsCsv } from './exporters/csv-exporter.js';
import { CheckpointManager } from './storage/checkpoint.js';
import { randomDelay } from './utils/delay.js';
import { ConcurrencyLimiter } from './utils/concurrency.js';
import { createChildLogger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import type { EtsyListing, FailedListing, RunMetadata } from './types/listing.js';
import type { SearchResultItem } from './types/schemas.js';

const log = createChildLogger('cli');

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
  };
}

async function buildListingFromScrapeResult(
  scrapeResult: ListingScrapeResult,
  searchItem: SearchResultItem,
  targetCurrency: string,
): Promise<EtsyListing> {
  const featureResult = extractFeatures(
    scrapeResult.descriptionRaw,
    scrapeResult.features,
    scrapeResult.includedItems,
    scrapeResult.fileFormats,
    scrapeResult.title,
  );

  const missingFields: string[] = [];
  if (!scrapeResult.title) missingFields.push('title');
  if (scrapeResult.price.amount === null) missingFields.push('price');
  if (scrapeResult.descriptionRaw === null) missingFields.push('description');
  if (scrapeResult.imageUrls.length === 0) missingFields.push('images');

  let scrapingStatus: EtsyListing['scraping']['status'] = 'success';
  if (missingFields.length > 2) scrapingStatus = 'partial';

  const normalizedPrice = await normalizePrice(
    {
      rawText: scrapeResult.price.rawText,
      amount: scrapeResult.price.amount,
      currency: scrapeResult.price.currency,
      originalPrice: null,
      discountPercent: scrapeResult.price.discountPercent,
    },
    targetCurrency,
  );

  const listing: EtsyListing = {
    listingId: scrapeResult.listingId ?? searchItem.listingId,
    url: scrapeResult.url,
    canonicalUrl: normalizeUrl(scrapeResult.url),
    title: scrapeResult.title,
    shopName: scrapeResult.shopName,
    shopUrl: scrapeResult.shopUrl,
    productType: scrapeResult.isDigital ? 'digital' : 'unknown',
    price: normalizedPrice,
    rating: {
      listingRating: scrapeResult.listingRating,
      listingReviewCount: scrapeResult.listingReviewCount,
      shopRating: scrapeResult.shopRating,
      shopReviewCount: scrapeResult.shopReviewCount,
      shopSales: scrapeResult.shopSales,
    },
    badges: {
      bestseller: scrapeResult.badges.bestseller,
      etsyPick: scrapeResult.badges.etsyPick,
      popularNow: scrapeResult.badges.popularNow,
      ad: searchItem.isAd,
    },
    engagement: {
      cartsCount: scrapeResult.cartsCount,
      favoritesCount: scrapeResult.favoritesCount,
    },
    content: {
      descriptionRaw: scrapeResult.descriptionRaw,
      descriptionCleaned: scrapeResult.descriptionRaw ? cleanText(scrapeResult.descriptionRaw).cleaned : null,
      mainFeature: featureResult.mainFeature,
      features: featureResult.features,
      includedItems: featureResult.includedItems,
      fileFormats: featureResult.fileFormats,
      relatedSearches: scrapeResult.relatedSearches,
      extractedKeywords: featureResult.extractedKeywords,
    },
    media: {
      mainImageUrl: scrapeResult.mainImageUrl,
      imageUrls: scrapeResult.imageUrls,
      imageCount: scrapeResult.imageUrls.length,
      hasVideo: scrapeResult.hasVideo,
      videoUrl: scrapeResult.videoUrl,
    },
    searchPosition: {
      page: searchItem.page,
      position: searchItem.position,
    },
    salesEstimate: {
      level: 'Unknown',
      score: 0,
      confidence: 0,
      reasons: [],
    },
    scraping: {
      status: scrapingStatus,
      scrapedAt: new Date().toISOString(),
      missingFields,
      warnings: [],
    },
  };

  // Calculate sales score
  listing.salesEstimate = calculateSalesScore(listing);

  return listing;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startTime = Date.now();

  log.info(
    { query: args.query, pages: args.pages, maxListings: args.maxListings, useLlm: args.useLlm },
    'Starting Etsy market research',
  );

  // Ensure output directories exist
  for (const dir of [config.paths.reports, config.paths.rawData, config.paths.checkpoints]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const checkpointManager = new CheckpointManager();
  let checkpoint = args.resume ? checkpointManager.load() : null;
  if (args.resume && checkpoint) {
    log.info(
      { processed: checkpoint.processedUrls.length },
      'Resuming from checkpoint',
    );
  }

  // Phase 1: Search scraping
  log.info('=== Phase 1: Search Results ===');
  const browserManager = await createBrowserManager(args.headless);

  let searchResults: SearchResultItem[];
  try {
    searchResults = await scrapeSearchResults(browserManager, {
      query: args.query,
      pages: args.pages,
      currency: args.currency,
      country: args.country,
      language: args.language,
      delayMinMs: args.delayMin,
      delayMaxMs: args.delayMax,
      timeoutMs: config.scraper.timeoutMs,
    });
  } finally {
    await browserManager.close();
  }

  // Limit to max listings
  if (searchResults.length > args.maxListings) {
    searchResults = searchResults.slice(0, args.maxListings);
  }

  log.info({ total: searchResults.length }, 'Search results collected');

  // Save raw search results
  const searchResultsPath = path.join(config.paths.rawData, 'search-results.json');
  fs.writeFileSync(searchResultsPath, JSON.stringify(searchResults, null, 2));

  // Phase 2: Deep listing scraping
  log.info('=== Phase 2: Deep Listing Scraping ===');
  const listings: EtsyListing[] = [];
  const failedListings: FailedListing[] = [];
  let blockedCount = 0;

  const bm = await createBrowserManager(args.headless);
  const concurrencyLimiter = new ConcurrencyLimiter(args.concurrency);
  let recentErrors = 0;
  const windowSize = 10;

  try {
    for (let i = 0; i < searchResults.length; i++) {
      const searchItem = searchResults[i];

      // Skip if already processed (resume mode)
      if (checkpoint && checkpointManager.isUrlProcessed(searchItem.url, checkpoint)) {
        log.debug({ url: searchItem.url }, 'Skipping already processed URL');
        continue;
      }

      // Adaptive concurrency
      if (i >= windowSize) {
        const errorRate = recentErrors / windowSize;
        if (errorRate > 0.3) {
          concurrencyLimiter.reduce();
          log.warn({ errorRate, concurrency: concurrencyLimiter.limit }, 'Reducing concurrency due to high error rate');
        }
      }

      log.info(
        { index: i + 1, total: searchResults.length, url: searchItem.url },
        `Processing listing ${i + 1}/${searchResults.length}`,
      );

      await concurrencyLimiter.acquire();

      try {
        const { result, errorType, error } = await scrapeListing(
          bm,
          searchItem,
          config.scraper.timeoutMs,
          config.scraper.maxRetries,
        );

        if (result) {
          const listing = await buildListingFromScrapeResult(result, searchItem, args.currency);
          listings.push(listing);

          if (!checkpoint) {
            checkpoint = { processedUrls: [], successfulUrls: [], failedUrls: [], timestamp: '', query: args.query };
          }
          checkpoint.processedUrls.push(searchItem.url);
          checkpoint.successfulUrls.push(searchItem.url);

          log.info(
            { title: listing.title?.substring(0, 50), salesLevel: listing.salesEstimate.level },
            `✓ Scraped: ${listing.title?.substring(0, 50) ?? 'unknown'}`,
          );
        } else {
          failedListings.push({
            url: searchItem.url,
            listingId: searchItem.listingId,
            errorType: errorType ?? 'UNKNOWN',
            message: error ?? 'Unknown error',
            attempts: config.scraper.maxRetries + 1,
            timestamp: new Date().toISOString(),
          });

          if (errorType === 'BLOCKED') {
            blockedCount++;
            log.warn('Blocked — pausing and reducing concurrency');
            concurrencyLimiter.reduce();
            await randomDelay(10000, 20000);
          }

          if (!checkpoint) {
            checkpoint = { processedUrls: [], successfulUrls: [], failedUrls: [], timestamp: '', query: args.query };
          }
          checkpoint.processedUrls.push(searchItem.url);
          checkpoint.failedUrls.push(searchItem.url);

          recentErrors++;
        }
      } finally {
        concurrencyLimiter.release();
      }

      // Save checkpoint periodically
      if (checkpoint && (i + 1) % config.checkpoint.interval === 0) {
        checkpointManager.save(checkpoint);
      }

      // Random delay between requests
      if (i < searchResults.length - 1) {
        await randomDelay(args.delayMin, args.delayMax);
      }

      // Progress
      const processed = i + 1;
      const remaining = searchResults.length - processed;
      log.info(
        { processed, remaining, success: listings.length, failed: failedListings.length },
        `Progress: ${processed}/${searchResults.length} (${remaining} remaining)`,
      );
    }
  } finally {
    await bm.close();
  }

  // Phase 3: Market analysis
  log.info('=== Phase 3: Market Analysis ===');
  const marketSummary = calculateMarketSummary(listings);
  extractMarketFeatures(listings);

  let llmAnalysis = null;
  if (args.useLlm) {
    const apiKey = args.llmProvider === 'anthropic' ? config.anthropicApiKey : config.openaiApiKey;
    if (apiKey) {
      log.info({ provider: args.llmProvider }, '=== Phase 3b: LLM Analysis ===');
      try {
        const analyzer = new LlmAnalyzer({
          provider: args.llmProvider,
          apiKey,
          model: args.llmModel || undefined,
        });
        llmAnalysis = await analyzer.analyze(listings);
        log.info('LLM analysis completed successfully');
      } catch (err) {
        log.error({ error: (err as Error).message }, 'LLM analysis failed');
        failedListings.push({
          url: '',
          listingId: null,
          errorType: 'LLM_ERROR',
          message: (err as Error).message,
          attempts: 1,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      log.warn(`LLM analysis requested but ${args.llmProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} not set`);
    }
  }

  // Phase 4: Export
  log.info('=== Phase 4: Export ===');
  const durationMs = Date.now() - startTime;

  exportListingsJson(listings, `${args.output}.json`);
  await exportListingsCsv(listings, `${args.output.replace('-full', '-summary')}.csv`);
  exportFailedListings(failedListings);

  if (llmAnalysis) {
    exportMarketAnalysis(llmAnalysis);
  }

  const metadata: RunMetadata = {
    query: args.query,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    params: {
      pages: args.pages,
      maxListings: args.maxListings,
      currency: args.currency,
      country: args.country,
      language: args.language,
      headless: args.headless,
      concurrency: args.concurrency,
      useLlm: args.useLlm,
    },
    totalFound: searchResults.length,
    successCount: listings.filter((l) => l.scraping.status === 'success').length,
    partialCount: listings.filter((l) => l.scraping.status === 'partial').length,
    failedCount: failedListings.length,
    blockedCount,
    durationMs,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
  };
  exportRunMetadata(metadata);

  // Clear checkpoint on successful completion
  checkpointManager.clear();

  // Final summary
  log.info('=== Research Complete ===');
  log.info(
    {
      query: args.query,
      totalFound: searchResults.length,
      successCount: metadata.successCount,
      partialCount: metadata.partialCount,
      failedCount: metadata.failedCount,
      blockedCount,
      durationMs,
      averagePriceUsd: marketSummary.averagePriceUsd,
    },
    'Summary',
  );

  console.log('\n=== RESEARCH COMPLETE ===');
  console.log(`Query: ${args.query}`);
  console.log(`Found: ${searchResults.length} results`);
  console.log(`Scraped: ${listings.length} listings`);
  console.log(`Failed: ${failedListings.length}`);
  console.log(`Blocked: ${blockedCount}`);
  console.log(`Duration: ${Math.round(durationMs / 1000)}s`);
  if (marketSummary.averagePriceUsd) {
    console.log(`Avg Price USD: $${marketSummary.averagePriceUsd}`);
    console.log(`Median Price USD: $${marketSummary.medianPriceUsd}`);
  }
  console.log(`\nOutput: ${config.paths.reports}`);
}

main().catch((err) => {
  log.fatal({ error: (err as Error).message }, 'Fatal error');
  console.error('Fatal error:', (err as Error).message);
  process.exit(1);
});
