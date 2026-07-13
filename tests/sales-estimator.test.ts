import { describe, it, expect } from 'vitest';
import { calculateMarketSummary, calculateSalesScore } from '../src/analysis/scoring.js';
import { createMockListing } from './helpers/listing-fixture.js';

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

  it('does not promote a listing using shop-level proxy metrics', () => {
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
    expect(estimate.level).toBe('Low');
    expect(estimate.listingEvidenceScore).toBe(2);
    expect(estimate.shopProxyScore).toBe(1);
    expect(estimate.shopProxyReasons[0]).toMatch(/^Moderate shop sales proxy: 1\D?000$/u);
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

  it('keeps a high shop rating out of the listing evidence score', () => {
    const estimate = calculateSalesScore(createMockListing({
      rating: {
        listingRating: null,
        listingReviewCount: null,
        shopRating: 5,
        shopReviewCount: 1000,
        shopSales: null,
      },
    }));

    expect(estimate.listingEvidenceScore).toBe(0);
    expect(estimate.shopProxyScore).toBe(1);
    expect(estimate.shopProxyReasons).toContain('High shop rating proxy: 5');
  });

  it('calculates deterministic market price coverage and median', () => {
    const listings = [10, 30, null].map((amountUsd, index) => createMockListing({
      listingId: String(index),
      price: {
        ...createMockListing().price,
        amount: amountUsd,
        amountUsd,
      },
    }));

    expect(calculateMarketSummary(listings)).toEqual({
      averagePriceUsd: 20,
      medianPriceUsd: 20,
      totalAnalyzed: 3,
      pricedListings: 2,
      priceCoverage: 0.67,
    });
  });
});
