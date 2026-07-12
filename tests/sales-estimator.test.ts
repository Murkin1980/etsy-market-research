import { describe, it, expect } from 'vitest';
import { calculateSalesScore } from '../src/analysis/scoring.js';
import type { EtsyListing } from '../src/types/listing.js';

function createMockListing(overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    listingId: '123',
    url: 'https://www.etsy.com/listing/123',
    canonicalUrl: 'https://www.etsy.com/listing/123',
    title: 'Test Listing',
    shopName: 'TestShop',
    shopUrl: 'https://www.etsy.com/shop/TestShop',
    productType: 'digital',
    price: {
      rawText: '$10.00',
      amount: 10,
      currency: 'USD',
      originalPrice: null,
      discountPercent: null,
      amountUsd: 10,
      exchangeRate: null,
      exchangeRateDate: null,
    },
    rating: {
      listingRating: null,
      listingReviewCount: null,
      shopRating: null,
      shopReviewCount: null,
      shopSales: null,
    },
    badges: {
      bestseller: false,
      etsyPick: false,
      popularNow: false,
      ad: false,
    },
    engagement: {
      cartsCount: null,
      favoritesCount: null,
    },
    content: {
      descriptionRaw: null,
      descriptionCleaned: null,
      mainFeature: null,
      features: [],
      includedItems: [],
      fileFormats: [],
      relatedSearches: [],
      extractedKeywords: [],
    },
    media: {
      mainImageUrl: null,
      imageUrls: [],
      imageCount: 0,
      hasVideo: false,
      videoUrl: null,
    },
    searchPosition: {
      page: 1,
      position: 50,
    },
    salesEstimate: {
      level: 'Unknown',
      score: 0,
      confidence: 0,
      reasons: [],
    },
    scraping: {
      status: 'success',
      scrapedAt: new Date().toISOString(),
      missingFields: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe('sales-estimator', () => {
  it('returns Low for minimal listing (no reviews, no badges, low position)', () => {
    const listing = createMockListing({
      searchPosition: { page: 1, position: 50 },
    });
    const estimate = calculateSalesScore(listing);
    expect(estimate.level).toBe('Low');
    expect(estimate.score).toBe(0);
  });

  it('returns High for bestseller with high reviews', () => {
    const listing = createMockListing({
      badges: { bestseller: true, etsyPick: false, popularNow: false, ad: false },
      rating: {
        listingRating: 4.9,
        listingReviewCount: 250,
        shopRating: 4.8,
        shopReviewCount: 1000,
        shopSales: 10000,
      },
    });
    const estimate = calculateSalesScore(listing);
    expect(estimate.level).toBe('High');
    expect(estimate.score).toBeGreaterThanOrEqual(6);
    expect(estimate.reasons.length).toBeGreaterThan(0);
  });

  it('returns Medium for moderate metrics', () => {
    const listing = createMockListing({
      searchPosition: { page: 1, position: 50 },
      rating: {
        listingRating: 4.5,
        listingReviewCount: 60,
        shopRating: 4.7,
        shopReviewCount: 500,
        shopSales: 1000,
      },
    });
    const estimate = calculateSalesScore(listing);
    expect(estimate.level).toBe('Medium');
    expect(estimate.score).toBeGreaterThanOrEqual(3);
    expect(estimate.score).toBeLessThanOrEqual(5);
  });

  it('gives bonus for popular now', () => {
    const base = createMockListing({
      searchPosition: { page: 1, position: 50 },
    });
    const popular = createMockListing({
      badges: { bestseller: false, etsyPick: false, popularNow: true, ad: false },
      searchPosition: { page: 1, position: 50 },
    });
    const baseScore = calculateSalesScore(base);
    const popularScore = calculateSalesScore(popular);
    expect(popularScore.score).toBeGreaterThan(baseScore.score);
  });

  it('gives bonus for top organic position', () => {
    const topPosition = createMockListing({
      searchPosition: { page: 1, position: 3 },
    });
    const lowPosition = createMockListing({
      searchPosition: { page: 1, position: 50 },
    });
    const topEstimate = calculateSalesScore(topPosition);
    const lowEstimate = calculateSalesScore(lowPosition);
    expect(topEstimate.score).toBeGreaterThan(lowEstimate.score);
  });

  it('does not give position bonus for ads', () => {
    const adTopPosition = createMockListing({
      badges: { bestseller: false, etsyPick: false, popularNow: false, ad: true },
      searchPosition: { page: 1, position: 3 },
    });
    const estimate = calculateSalesScore(adTopPosition);
    expect(estimate.reasons.some((r) => r.includes('position'))).toBe(false);
  });

  it('calculates confidence based on data availability', () => {
    const minimal = createMockListing({
      searchPosition: { page: 1, position: 50 },
    });
    const complete = createMockListing({
      searchPosition: { page: 1, position: 50 },
      rating: {
        listingRating: 4.8,
        listingReviewCount: 100,
        shopRating: 4.9,
        shopReviewCount: 500,
        shopSales: 5000,
      },
      engagement: { cartsCount: 50, favoritesCount: null },
      badges: { bestseller: true, etsyPick: false, popularNow: false, ad: false },
      media: {
        mainImageUrl: 'img.jpg',
        imageUrls: ['img1.jpg', 'img2.jpg', 'img3.jpg', 'img4.jpg', 'img5.jpg'],
        imageCount: 5,
        hasVideo: false,
        videoUrl: null,
      },
    });
    const minConfidence = calculateSalesScore(minimal);
    const maxConfidence = calculateSalesScore(complete);
    expect(maxConfidence.confidence).toBeGreaterThan(minConfidence.confidence);
  });
});
