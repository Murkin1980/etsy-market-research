import type { ListingScrapeResult } from './listing-scraper.js';
import type { ScrapingStatus } from '../types/listing.js';

export interface ScrapeCompleteness {
  status: Extract<ScrapingStatus, 'success' | 'partial'>;
  missingFields: string[];
}

export function evaluateScrapeCompleteness(
  result: Pick<ListingScrapeResult, 'title' | 'price' | 'descriptionRaw' | 'imageUrls'>,
): ScrapeCompleteness {
  const missingFields: string[] = [];
  if (!result.title) missingFields.push('title');
  if (result.price.amount === null) missingFields.push('price');
  if (result.descriptionRaw === null) missingFields.push('description');
  if (result.imageUrls.length === 0) missingFields.push('images');

  return {
    status: missingFields.length === 0 ? 'success' : 'partial',
    missingFields,
  };
}
