import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSearchPage } from '../src/scraper/parsers.js';
import { parseListingHtml } from '../src/scraper/listing-scraper.js';
import { evaluateScrapeCompleteness } from '../src/scraper/scrape-quality.js';
import type { SearchResultItem } from '../src/types/schemas.js';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8');

const searchItem: SearchResultItem = {
  listingId: '1234567890',
  url: 'https://www.etsy.com/listing/1234567890/digital-planner?ref=search_results',
  titlePreview: 'Search fallback title',
  displayedPrice: '$15.00',
  shopName: 'SearchFallbackShop',
  rating: 4.7,
  displayedReviewCount: 222,
  imageUrl: null,
  isAd: false,
  isBestseller: false,
  isPopularNow: false,
  page: 1,
  position: 1,
};

describe('saved HTML parser integration', () => {
  it('extracts normalized search results, pagination, badges, and ads', () => {
    const parsed = parseSearchPage(fixture('search-page.html'), 3);

    expect(parsed.nextPageAvailable).toBe(true);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({
      listingId: '1234567890',
      url: 'https://www.etsy.com/listing/1234567890/digital-planner',
      titlePreview: 'Digital Planner Bundle',
      displayedPrice: '$12.50',
      shopName: 'PaperPixelStudio',
      rating: 4.8,
      displayedReviewCount: 1234,
      isAd: false,
      isBestseller: true,
      page: 3,
      position: 1,
    });
    expect(parsed.results[1]).toMatchObject({
      listingId: '9876543210',
      isAd: true,
      isPopularNow: true,
      position: 2,
    });
  });

  it('extracts a complete listing from a saved product page', () => {
    const result = parseListingHtml(fixture('listing-page.html'), searchItem);
    const completeness = evaluateScrapeCompleteness(result);

    expect(result).toMatchObject({
      listingId: '1234567890',
      title: 'Ultimate Digital Planner',
      shopName: 'PaperPixelStudio',
      shopUrl: 'https://www.etsy.com/shop/PaperPixelStudio',
      price: { amount: 15, currency: 'USD', originalPrice: 20, discountPercent: 25 },
      listingRating: 4.9,
      listingReviewCount: 222,
      shopSales: 12345,
      isDigital: true,
      hasVideo: true,
      cartsCount: 18,
      favoritesCount: 2100,
    });
    expect(result.imageUrls).toHaveLength(2);
    expect(result.fileFormats).toEqual(expect.arrayContaining(['PDF', 'PNG', 'ZIP']));
    expect(result.badges).toEqual({ bestseller: true, etsyPick: true, popularNow: true });
    expect(completeness).toEqual({ status: 'success', missingFields: [] });
  });

  it('marks any missing required listing data as partial', () => {
    const result = parseListingHtml(fixture('partial-listing-page.html'), searchItem);

    expect(evaluateScrapeCompleteness(result)).toEqual({
      status: 'partial',
      missingFields: ['description', 'images'],
    });
  });
});
