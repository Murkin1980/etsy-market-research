import fs from 'fs';
import path from 'path';
import type { EtsyListing } from '../types/listing.js';
import type { LlmAnalysisResult } from '../types/schemas.js';
import type { RunMetadata, FailedListing } from '../types/listing.js';
import { config } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';
import { EtsyListingSchema } from '../types/schemas.js';

const log = createChildLogger('json-exporter');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function exportListingsJson(listings: EtsyListing[], filename: string = 'listings-full.json', outputDir?: string): string {
  const validatedListings = validateListingsForExport(listings);
  const dir = outputDir ?? config.paths.reports;
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(validatedListings, null, 2), 'utf-8');
  log.info({ count: validatedListings.length, path: filePath }, 'Listings JSON exported');
  return filePath;
}

export function validateListingsForExport(listings: EtsyListing[]): EtsyListing[] {
  const result = EtsyListingSchema.array().safeParse(listings);
  if (result.success) return result.data as EtsyListing[];

  const details = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'listings'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Listing export validation failed: ${details}`);
}

export function exportMarketAnalysis(
  analysis: LlmAnalysisResult,
  filename: string = 'market-analysis.json',
  outputDir?: string,
): string {
  const dir = outputDir ?? config.paths.reports;
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
  log.info({ path: filePath }, 'Market analysis exported');
  return filePath;
}

export function exportFailedListings(
  failed: FailedListing[],
  filename: string = 'failed-listings.json',
  outputDir?: string,
): string {
  const dir = outputDir ?? config.paths.reports;
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(failed, null, 2), 'utf-8');
  log.info({ count: failed.length, path: filePath }, 'Failed listings exported');
  return filePath;
}

export function exportRunMetadata(
  metadata: RunMetadata,
  filename: string = 'run-metadata.json',
  outputDir?: string,
): string {
  const dir = outputDir ?? config.paths.reports;
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
  log.info({ path: filePath }, 'Run metadata exported');
  return filePath;
}
