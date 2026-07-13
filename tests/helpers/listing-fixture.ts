import type { EtsyListing } from '../../src/types/listing.js';

export function createMockListing(overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    listingId: '123',
    url: 'https://www.etsy.com/listing/123',
    canonicalUrl: 'https://www.etsy.com/listing/123',
    title: 'Test Listing',
    shopName: 'TestShop',
    shopUrl: 'https://www.etsy.com/shop/TestShop',
    productType: 'digital',
    price: {
      rawText: '$10.00', amount: 10, currency: 'USD', originalPrice: null,
      discountPercent: null, amountUsd: 10, exchangeRate: 1,
      exchangeRateDate: '2026-07-14T00:00:00.000Z', exchangeRateSource: 'identity',
    },
    rating: {
      listingRating: null, listingReviewCount: null, shopRating: null,
      shopReviewCount: null, shopSales: null,
    },
    badges: { bestseller: false, etsyPick: false, popularNow: false, ad: false },
    engagement: { cartsCount: null, favoritesCount: null },
    content: {
      descriptionRaw: null, descriptionCleaned: null, mainFeature: null,
      features: [], includedItems: [], fileFormats: [], relatedSearches: [], extractedKeywords: [],
    },
    media: {
      mainImageUrl: null, imageUrls: [], imageCount: 0, hasVideo: false, videoUrl: null,
    },
    searchPosition: { page: 1, position: 50 },
    evidence: {
      title: { source: 'dom', confidence: 0.98 },
      shopName: { source: 'dom', confidence: 0.95 },
      price: { source: 'dom', confidence: 0.98 },
      listingRating: { source: null, confidence: 0 },
      listingReviewCount: { source: null, confidence: 0 },
      description: { source: null, confidence: 0 },
      images: { source: null, confidence: 0 },
    },
    salesEstimate: {
      level: 'Unknown', score: 0, listingEvidenceScore: 0, shopProxyScore: 0,
      confidence: 0, reasons: [], shopProxyReasons: [],
    },
    scraping: {
      status: 'success', scrapedAt: '2026-07-14T00:00:00.000Z', missingFields: [], warnings: [],
    },
    ...overrides,
  };
}
