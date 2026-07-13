import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildLlmPayload, buildUserPrompt } from '../src/analysis/llm-analyzer.js';
import { exportListingsJson, validateListingsForExport } from '../src/exporters/json-exporter.js';
import { EtsyListingSchema } from '../src/types/schemas.js';
import type { EtsyListing } from '../src/types/listing.js';
import { createMockListing } from './helpers/listing-fixture.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('data quality safeguards', () => {
  it('validates a complete listing before export', () => {
    const listing = createMockListing();
    expect(EtsyListingSchema.safeParse(listing).success).toBe(true);
    expect(validateListingsForExport([listing])).toEqual([listing]);
  });

  it('does not write a report when listing evidence is invalid', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-export-'));
    temporaryDirectories.push(directory);
    const invalid = createMockListing({
      evidence: {
        ...createMockListing().evidence,
        title: { source: 'dom', confidence: 2 },
      },
    });

    expect(() => exportListingsJson([invalid], 'invalid.json', directory))
      .toThrow(/evidence\.title\.confidence/);
    expect(fs.existsSync(path.join(directory, 'invalid.json'))).toBe(false);
  });

  it('upgrades legacy stage-4 listings during validation', () => {
    const legacy = JSON.parse(JSON.stringify(createMockListing())) as Record<string, unknown>;
    delete legacy.evidence;
    const legacyPrice = legacy.price as Record<string, unknown>;
    delete legacyPrice.exchangeRateSource;
    const legacyEstimate = legacy.salesEstimate as Record<string, unknown>;
    delete legacyEstimate.listingEvidenceScore;
    delete legacyEstimate.shopProxyScore;
    delete legacyEstimate.shopProxyReasons;

    const [validated] = validateListingsForExport([legacy as unknown as EtsyListing]);
    expect(validated.evidence.title).toEqual({ source: null, confidence: 0 });
    expect(validated.price.exchangeRateSource).toBeNull();
    expect(validated.salesEstimate.listingEvidenceScore).toBe(validated.salesEstimate.score);
    expect(validated.salesEstimate.shopProxyScore).toBe(0);
  });

  it('builds a deterministic LLM payload with shop proxies separated', () => {
    const listing = createMockListing({
      rating: {
        listingRating: 4.8,
        listingReviewCount: 120,
        shopRating: 4.9,
        shopReviewCount: 900,
        shopSales: 5000,
      },
      salesEstimate: {
        level: 'Medium',
        score: 4,
        listingEvidenceScore: 4,
        shopProxyScore: 2,
        confidence: 0.8,
        reasons: ['Listing evidence'],
        shopProxyReasons: ['Shop proxy'],
      },
    });

    const payload = buildLlmPayload([listing]);
    expect(payload[0]).toMatchObject({
      listingSignals: { rating: 4.8, reviewCount: 120 },
      demandEstimate: { listingEvidenceScore: 4, confidence: 0.8 },
      shopProxy: { score: 2, shopSales: 5000 },
      evidence: listing.evidence,
    });
    expect(payload[0]).not.toHaveProperty('salesEstimate');
    expect(payload[0]).not.toHaveProperty('rating');
    expect(buildUserPrompt([listing])).toBe(buildUserPrompt([listing]));
  });
});
