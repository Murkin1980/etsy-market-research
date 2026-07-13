import { SALES_SCORE_CONFIG } from '../config/defaults.js';
import type { SalesEstimate, EtsyListing } from '../types/listing.js';

export function calculateSalesScore(listing: EtsyListing): SalesEstimate {
  let listingEvidenceScore = 0;
  let shopProxyScore = 0;
  const reasons: string[] = [];
  const shopProxyReasons: string[] = [];
  const cfg = SALES_SCORE_CONFIG;

  // Listing review count
  const reviewCount = listing.rating.listingReviewCount;
  if (reviewCount !== null) {
    if (reviewCount >= 200) {
      listingEvidenceScore += cfg.listingReviewCount['200+'];
      reasons.push(`High listing review count: ${reviewCount}`);
    } else if (reviewCount >= 50) {
      listingEvidenceScore += cfg.listingReviewCount['50-199'];
      reasons.push(`Good listing review count: ${reviewCount}`);
    } else if (reviewCount >= 10) {
      listingEvidenceScore += cfg.listingReviewCount['10-49'];
      reasons.push(`Moderate listing review count: ${reviewCount}`);
    } else {
      reasons.push(`Low listing review count: ${reviewCount}`);
    }
  } else {
    reasons.push('No listing review count available');
  }

  // Shop sales
  const shopSales = listing.rating.shopSales;
  if (shopSales !== null) {
    if (shopSales >= 5000) {
      shopProxyScore += cfg.shopSales['5000+'];
      shopProxyReasons.push(`High shop sales proxy: ${shopSales.toLocaleString()}`);
    } else if (shopSales >= 500) {
      shopProxyScore += cfg.shopSales['500-4999'];
      shopProxyReasons.push(`Moderate shop sales proxy: ${shopSales.toLocaleString()}`);
    } else {
      shopProxyReasons.push(`Low shop sales proxy: ${shopSales.toLocaleString()}`);
    }
  } else {
    shopProxyReasons.push('Shop sales proxy not available');
  }

  // Bestseller badge
  if (listing.badges.bestseller) {
    listingEvidenceScore += cfg.bestsellerBonus;
    reasons.push('Has bestseller badge');
  }

  // Popular Now
  if (listing.badges.popularNow) {
    listingEvidenceScore += cfg.popularNowBonus;
    reasons.push('Has popular now badge');
  }

  // High rating
  const rating = listing.rating.listingRating;
  if (rating !== null && rating >= cfg.highRatingThreshold) {
    listingEvidenceScore += cfg.highRatingBonus;
    reasons.push(`High rating: ${rating}`);
  }

  const shopRating = listing.rating.shopRating;
  if (shopRating !== null && shopRating >= cfg.highRatingThreshold) {
    shopProxyScore += cfg.highRatingBonus;
    shopProxyReasons.push(`High shop rating proxy: ${shopRating}`);
  }

  // Top organic position
  if (
    !listing.badges.ad &&
    listing.searchPosition.position <= cfg.topPositionThreshold
  ) {
    listingEvidenceScore += cfg.topPositionBonus;
    reasons.push(`Top ${cfg.topPositionThreshold} organic position (#${listing.searchPosition.position})`);
  }

  // Price level signals
  const priceUsd = listing.price.amountUsd;
  if (priceUsd !== null) {
    if (priceUsd >= 5 && priceUsd <= 30) {
      reasons.push(`Accessible price point: $${priceUsd}`);
    } else if (priceUsd > 30) {
      reasons.push(`Premium price point: $${priceUsd}`);
    } else {
      reasons.push(`Low price point: $${priceUsd}`);
    }
  }

  // Content quality signals
  if (listing.media.imageCount >= 5) {
    reasons.push(`Good visual presentation: ${listing.media.imageCount} images`);
  }
  if (listing.content.descriptionRaw && listing.content.descriptionRaw.length > 200) {
    reasons.push('Detailed description');
  }
  if (listing.content.features.length >= 3) {
    reasons.push(`Clear feature list: ${listing.content.features.length} features`);
  }

  // Carts engagement
  if (listing.engagement.cartsCount !== null && listing.engagement.cartsCount > 20) {
    reasons.push(`High cart engagement: ${listing.engagement.cartsCount} in carts`);
  }

  // Determine level
  let level: SalesEstimate['level'] = 'Unknown';
  if (listingEvidenceScore >= cfg.levels.high.min) {
    level = 'High';
  } else if (listingEvidenceScore >= cfg.levels.medium.min) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  // Confidence based on data availability
  let confidence = 0.3; // base
  if (reviewCount !== null) confidence += 0.15;
  if (listing.badges.bestseller) confidence += 0.1;
  if (listing.engagement.cartsCount !== null) confidence += 0.1;
  if (rating !== null) confidence += 0.05;
  if (listing.media.imageCount > 0) confidence += 0.05;
  confidence = Math.min(confidence, 1);

  return {
    level,
    score: listingEvidenceScore,
    listingEvidenceScore,
    shopProxyScore,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    shopProxyReasons,
  };
}

export function calculateMarketSummary(listings: EtsyListing[]): {
  averagePriceUsd: number | null;
  medianPriceUsd: number | null;
  totalAnalyzed: number;
  pricedListings: number;
  priceCoverage: number;
} {
  const prices = listings
    .map((l) => l.price.amountUsd)
    .filter((p): p is number => p !== null && p > 0);

  if (prices.length === 0) {
    return {
      averagePriceUsd: null,
      medianPriceUsd: null,
      totalAnalyzed: listings.length,
      pricedListings: 0,
      priceCoverage: 0,
    };
  }

  const averagePriceUsd =
    Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;

  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianPriceUsd =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return {
    averagePriceUsd,
    medianPriceUsd: Math.round(medianPriceUsd * 100) / 100,
    totalAnalyzed: listings.length,
    pricedListings: prices.length,
    priceCoverage: Math.round((prices.length / listings.length) * 100) / 100,
  };
}
