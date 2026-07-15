import type { EtsyListing } from '../types/listing.js';

export interface NicheComparisonInput {
  runId: string;
  query: string;
  listings: EtsyListing[];
}

export interface NicheMetrics {
  runId: string;
  query: string;
  listings: number;
  uniqueShops: number;
  averagePriceUsd: number | null;
  medianPriceUsd: number | null;
  priceMinUsd: number | null;
  priceMaxUsd: number | null;
  digitalSharePercent: number;
  favoritesCoveragePercent: number;
  medianFavorites: number | null;
  highDemandSignals: number;
  mediumDemandSignals: number;
  evidenceConfidencePercent: number;
  topKeywords: string[];
  topListings: Array<{ title: string; url: string; shopName: string | null }>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildNicheMetrics(input: NicheComparisonInput): NicheMetrics {
  const prices = input.listings.map((item) => item.price.amountUsd).filter((value): value is number => value !== null);
  const favorites = input.listings.map((item) => item.engagement.favoritesCount).filter((value): value is number => value !== null);
  const shops = new Set(input.listings.map((item) => item.shopName).filter(Boolean));
  const keywordCounts = new Map<string, number>();
  const confidences: number[] = [];

  for (const listing of input.listings) {
    for (const keyword of listing.content.extractedKeywords) {
      const normalized = keyword.trim().toLocaleLowerCase('en-US');
      if (normalized.length >= 3) keywordCounts.set(normalized, (keywordCounts.get(normalized) ?? 0) + 1);
    }
    confidences.push(...Object.values(listing.evidence).map((item) => item.confidence));
  }

  const averagePrice = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
  return {
    runId: input.runId,
    query: input.query,
    listings: input.listings.length,
    uniqueShops: shops.size,
    averagePriceUsd: averagePrice === null ? null : round(averagePrice),
    medianPriceUsd: median(prices) === null ? null : round(median(prices) as number),
    priceMinUsd: prices.length ? Math.min(...prices) : null,
    priceMaxUsd: prices.length ? Math.max(...prices) : null,
    digitalSharePercent: input.listings.length ? round(input.listings.filter((item) => item.productType === 'digital').length / input.listings.length * 100) : 0,
    favoritesCoveragePercent: input.listings.length ? round(favorites.length / input.listings.length * 100) : 0,
    medianFavorites: median(favorites),
    highDemandSignals: input.listings.filter((item) => item.salesEstimate.level === 'High').length,
    mediumDemandSignals: input.listings.filter((item) => item.salesEstimate.level === 'Medium').length,
    evidenceConfidencePercent: confidences.length ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length * 100) : 0,
    topKeywords: [...keywordCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([keyword]) => keyword),
    topListings: [...input.listings]
      .sort((a, b) => b.salesEstimate.score - a.salesEstimate.score)
      .slice(0, 3)
      .map((item) => ({ title: item.title ?? 'Товар Etsy', url: item.url, shopName: item.shopName })),
  };
}

export function compareNiches(inputs: NicheComparisonInput[]): { createdAt: string; niches: NicheMetrics[] } {
  return { createdAt: new Date().toISOString(), niches: inputs.map(buildNicheMetrics) };
}
