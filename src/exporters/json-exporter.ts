import fs from 'fs';
import path from 'path';
import type { EtsyListing } from '../types/listing.js';
import type { LlmAnalysisResult } from '../types/schemas.js';
import type { RunMetadata, FailedListing } from '../types/listing.js';
import { config } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('json-exporter');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function exportListingsJson(listings: EtsyListing[], filename: string = 'listings-full.json'): string {
  const outputDir = config.paths.reports;
  ensureDir(outputDir);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(listings, null, 2), 'utf-8');
  log.info({ count: listings.length, path: filePath }, 'Listings JSON exported');
  return filePath;
}

export function exportMarketAnalysis(
  analysis: LlmAnalysisResult,
  filename: string = 'market-analysis.json',
): string {
  const outputDir = config.paths.reports;
  ensureDir(outputDir);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
  log.info({ path: filePath }, 'Market analysis exported');
  return filePath;
}

export function exportFailedListings(
  failed: FailedListing[],
  filename: string = 'failed-listings.json',
): string {
  const outputDir = config.paths.reports;
  ensureDir(outputDir);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(failed, null, 2), 'utf-8');
  log.info({ count: failed.length, path: filePath }, 'Failed listings exported');
  return filePath;
}

export function exportRunMetadata(
  metadata: RunMetadata,
  filename: string = 'run-metadata.json',
): string {
  const outputDir = config.paths.reports;
  ensureDir(outputDir);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
  log.info({ path: filePath }, 'Run metadata exported');
  return filePath;
}
