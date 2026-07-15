import { describe, expect, it } from 'vitest';
import { buildNicheMetrics, compareNiches } from '../src/analysis/niche-comparison.js';
import { createMockListing } from './helpers/listing-fixture.js';

describe('niche comparison', () => {
  it('calculates transparent metrics without inventing missing values', () => {
    const base = createMockListing();
    const metrics = buildNicheMetrics({ runId: 'run-a', query: 'notion template', listings: [
      createMockListing({ shopName: 'Alpha', price: { ...base.price, amountUsd: 10 }, engagement: { cartsCount: null, favoritesCount: 20 }, content: { ...base.content, extractedKeywords: ['notion', 'planner'] }, salesEstimate: { ...base.salesEstimate, level: 'High', score: 80 } }),
      createMockListing({ listingId: '456', shopName: 'Beta', productType: 'physical', price: { ...base.price, amountUsd: 30 }, engagement: { cartsCount: null, favoritesCount: null }, content: { ...base.content, extractedKeywords: ['notion', 'business'] } }),
    ] });
    expect(metrics.medianPriceUsd).toBe(20);
    expect(metrics.uniqueShops).toBe(2);
    expect(metrics.digitalSharePercent).toBe(50);
    expect(metrics.favoritesCoveragePercent).toBe(50);
    expect(metrics.highDemandSignals).toBe(1);
    expect(metrics.topKeywords[0]).toBe('notion');
  });

  it('keeps every selected niche in the response', () => {
    const result = compareNiches([{ runId: 'a', query: 'planner', listings: [] }, { runId: 'b', query: 'wedding', listings: [] }]);
    expect(result.niches.map((niche) => niche.query)).toEqual(['planner', 'wedding']);
  });
});
