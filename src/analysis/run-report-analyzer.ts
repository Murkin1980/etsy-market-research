import fs from 'fs';
import path from 'path';
import { exportMarketAnalysis } from '../exporters/json-exporter.js';
import { isSafeRunId } from '../run-files.js';
import { EtsyListingSchema, LlmAnalysisResultSchema, type LlmAnalysisResult } from '../types/schemas.js';
import type { EtsyListing } from '../types/listing.js';
import { LlmAnalyzer } from './llm-analyzer.js';
import { summarizeReport, type ReportSummary } from './report-summary.js';

export class RunReportError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 404 | 409 | 422 | 500 | 502 | 503,
  ) {
    super(message);
    this.name = 'RunReportError';
  }
}

export interface RunAiAnalysisPayload {
  runId: string;
  status: 'missing' | 'ready';
  configured: boolean;
  model: string;
  summary: ReportSummary;
  analysis: LlmAnalysisResult | null;
  topShopLinks: TopShopLink[];
}

export interface TopShopLink {
  shopName: string;
  shopUrl: string;
  listingId: string;
  listingTitle: string;
  listingUrl: string;
  shopSalesSignal: number | null;
}

function safeEtsyUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || (hostname !== 'etsy.com' && !hostname.endsWith('.etsy.com'))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildTopShopLinks(listings: EtsyListing[], analysis: LlmAnalysisResult | null): TopShopLink[] {
  if (!analysis) return [];
  const listingsById = new Map(
    listings.filter((listing) => listing.listingId).map((listing) => [listing.listingId as string, listing]),
  );
  const seenShops = new Set<string>();
  const links: TopShopLink[] = [];
  for (const product of analysis.topProducts) {
    const listing = listingsById.get(product.listingId);
    const shopUrl = safeEtsyUrl(listing?.shopUrl ?? null);
    const listingUrl = safeEtsyUrl(listing?.canonicalUrl ?? listing?.url ?? null);
    if (!listing || !shopUrl || !listingUrl || seenShops.has(shopUrl)) continue;
    seenShops.add(shopUrl);
    links.push({
      shopName: listing.shopName || 'Etsy shop',
      shopUrl,
      listingId: product.listingId,
      listingTitle: listing.title || product.title,
      listingUrl,
      shopSalesSignal: listing.rating.shopSales,
    });
  }
  return links;
}

function resolveRunRoot(runsDir: string, runId: string): string {
  if (!isSafeRunId(runId)) throw new RunReportError('Invalid run identifier', 404);
  const runsRoot = path.resolve(runsDir);
  const runRoot = path.resolve(runsRoot, runId);
  if (!runRoot.startsWith(`${runsRoot}${path.sep}`)) throw new RunReportError('Invalid run identifier', 404);
  if (!fs.existsSync(runRoot) || !fs.statSync(runRoot).isDirectory()) {
    throw new RunReportError('Run not found', 404);
  }
  return runRoot;
}

export function loadRunListings(runsDir: string, runId: string): EtsyListing[] {
  const runRoot = resolveRunRoot(runsDir, runId);
  const filePath = path.join(runRoot, 'reports', 'listings-full.json');
  if (!fs.existsSync(filePath)) throw new RunReportError('The run has no completed listings report', 422);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const validated = EtsyListingSchema.array().safeParse(parsed);
    if (!validated.success) throw new Error(validated.error.message);
    if (validated.data.length === 0) throw new RunReportError('The report contains no listings to analyze', 422);
    return validated.data as EtsyListing[];
  } catch (error) {
    if (error instanceof RunReportError) throw error;
    throw new RunReportError(`The listings report is invalid: ${(error as Error).message}`, 422);
  }
}

export function readRunAnalysis(runsDir: string, runId: string): LlmAnalysisResult | null {
  const runRoot = resolveRunRoot(runsDir, runId);
  const filePath = path.join(runRoot, 'reports', 'market-analysis.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return LlmAnalysisResultSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch (error) {
    throw new RunReportError(`The saved AI analysis is invalid: ${(error as Error).message}`, 500);
  }
}

export function getRunAiAnalysis(
  runsDir: string,
  runId: string,
  configured: boolean,
  model: string,
): RunAiAnalysisPayload {
  const listings = loadRunListings(runsDir, runId);
  const analysis = readRunAnalysis(runsDir, runId);
  return {
    runId,
    status: analysis ? 'ready' : 'missing',
    configured,
    model,
    summary: summarizeReport(listings),
    analysis,
    topShopLinks: buildTopShopLinks(listings, analysis),
  };
}

export async function createRunAiAnalysis(options: {
  runsDir: string;
  runId: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  force?: boolean;
}): Promise<RunAiAnalysisPayload> {
  if (!options.apiKey) throw new RunReportError('OpenAI API is not configured', 503);
  const listings = loadRunListings(options.runsDir, options.runId);
  const existing = readRunAnalysis(options.runsDir, options.runId);
  if (existing && !options.force) {
    return getRunAiAnalysis(options.runsDir, options.runId, true, options.model);
  }

  const analyzer = new LlmAnalyzer({
    provider: 'openai',
    apiKey: options.apiKey,
    model: options.model,
    timeoutMs: options.timeoutMs,
  });
  let analysis: LlmAnalysisResult;
  try {
    analysis = await analyzer.analyze(listings);
  } catch (error) {
    throw new RunReportError(`OpenAI analysis failed: ${(error as Error).message}`, 502);
  }

  const reportDirectory = path.join(resolveRunRoot(options.runsDir, options.runId), 'reports');
  exportMarketAnalysis(analysis, 'market-analysis.json', reportDirectory);
  return {
    runId: options.runId,
    status: 'ready',
    configured: true,
    model: options.model,
    summary: summarizeReport(listings),
    analysis,
    topShopLinks: buildTopShopLinks(listings, analysis),
  };
}
