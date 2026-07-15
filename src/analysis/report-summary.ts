import type { EtsyListing } from '../types/listing.js';

export interface ReportSummary {
  listingCount: number;
  uniqueShops: number;
  pricesUsd: {
    populated: number;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    median: number | null;
    bands: {
      upTo10: number;
      from10To20: number;
      from20To40: number;
      above40: number;
    };
  };
  signalCoverage: {
    listingRatingsPercent: number;
    listingReviewsPercent: number;
    shopSalesPercent: number;
    listingEvidencePercent: number;
    averageConfidence: number;
  };
  topTerms: Array<{ term: string; listings: number }>;
  warnings: string[];
}

const STOP_WORDS = new Set([
  'notion', 'template', 'templates', 'digital', 'download', 'planner', 'the', 'for', 'and',
  'with', 'your', 'all', 'from', 'into', 'this', 'that', 'you', 'of', 'to', 'in', 'a',
]);

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentage(count: number, total: number): number {
  return total === 0 ? 0 : round((count / total) * 100, 1);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round((sorted[middle - 1] + sorted[middle]) / 2)
    : round(sorted[middle]);
}

function collectTopTerms(listings: EtsyListing[]): Array<{ term: string; listings: number }> {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    const terms = String(listing.title ?? '')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const term of new Set(terms)) {
      if (term.length < 3 || STOP_WORDS.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([term, count]) => ({ term, listings: count }));
}

export function summarizeReport(listings: EtsyListing[]): ReportSummary {
  const listingCount = listings.length;
  const prices = listings
    .map((listing) => listing.price.amountUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const ratingCount = listings.filter((listing) => listing.rating.listingRating !== null).length;
  const reviewCount = listings.filter((listing) => listing.rating.listingReviewCount !== null).length;
  const shopSalesCount = listings.filter((listing) => (listing.rating.shopSales ?? 0) > 0).length;
  const evidenceCount = listings.filter((listing) => listing.salesEstimate.listingEvidenceScore > 0).length;
  const averageConfidence = listingCount === 0
    ? 0
    : round(listings.reduce((sum, listing) => sum + listing.salesEstimate.confidence, 0) / listingCount, 2);
  const warnings: string[] = [];

  if (listingCount < 30) warnings.push('Выборка меньше 30 объявлений — выводы носят предварительный характер.');
  if (percentage(ratingCount, listingCount) < 30) warnings.push('Рейтинги конкретных объявлений почти не представлены.');
  if (percentage(reviewCount, listingCount) < 30) warnings.push('Отзывы конкретных объявлений почти не представлены.');
  if (percentage(evidenceCount, listingCount) < 50) warnings.push('У большинства объявлений нет достаточных сигналов спроса.');
  if (averageConfidence < 0.5) warnings.push('Средняя уверенность оценки ниже 0,5; нельзя трактовать её как доказанный спрос.');

  return {
    listingCount,
    uniqueShops: new Set(listings.map((listing) => listing.shopName).filter(Boolean)).size,
    pricesUsd: {
      populated: prices.length,
      minimum: prices.length > 0 ? round(Math.min(...prices)) : null,
      maximum: prices.length > 0 ? round(Math.max(...prices)) : null,
      average: prices.length > 0 ? round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null,
      median: median(prices),
      bands: {
        upTo10: prices.filter((price) => price <= 10).length,
        from10To20: prices.filter((price) => price > 10 && price <= 20).length,
        from20To40: prices.filter((price) => price > 20 && price <= 40).length,
        above40: prices.filter((price) => price > 40).length,
      },
    },
    signalCoverage: {
      listingRatingsPercent: percentage(ratingCount, listingCount),
      listingReviewsPercent: percentage(reviewCount, listingCount),
      shopSalesPercent: percentage(shopSalesCount, listingCount),
      listingEvidencePercent: percentage(evidenceCount, listingCount),
      averageConfidence,
    },
    topTerms: collectTopTerms(listings),
    warnings,
  };
}
