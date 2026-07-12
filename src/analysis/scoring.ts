import { SALES_SCORE_CONFIG } from '../config/defaults.js';
import type { SalesEstimate, EtsyListing } from '../types/listing.js';

export function calculateSalesScore(listing: EtsyListing): SalesEstimate {
  let score = 0;
  const reasons: string[] = [];
  const cfg = SALES_SCORE_CONFIG;

  // Listing review count
  const reviewCount = listing.rating.listingReviewCount;
  if (reviewCount !== null) {
    if (reviewCount >= 200) {
      score += cfg.listingReviewCount['200+'];
      reasons.push(`High listing review count: ${reviewCount}`);
    } else if (reviewCount >= 50) {
      score += cfg.listingReviewCount['50-199'];
      reasons.push(`Good listing review count: ${reviewCount}`);
    } else if (reviewCount >= 10) {
      score += cfg.listingReviewCount['10-49'];
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
      score += cfg.shopSales['5000+'];
      reasons.push(`High shop sales: ${shopSales.toLocaleString()}`);
    } else if (shopSales >= 500) {
      score += cfg.shopSales['500-4999'];
      reasons.push(`Moderate shop sales: ${shopSales.toLocaleString()}`);
    } else {
      reasons.push(`Low shop sales: ${shopSales.toLocaleString()}`);
    }
  } else {
    reasons.push('Shop sales count not available');
  }

  // Bestseller badge
  if (listing.badges.bestseller) {
    score += cfg.bestsellerBonus;
    reasons.push('Has bestseller badge');
  }

  // Popular Now
  if (listing.badges.popularNow) {
    score += cfg.popularNowBonus;
    reasons.push('Has popular now badge');
  }

  // High rating
  const rating = listing.rating.listingRating ?? listing.rating.shopRating;
  if (rating !== null && rating >= cfg.highRatingThreshold) {
    score += cfg.highRatingBonus;
    reasons.push(`High rating: ${rating}`);
  }

  // Top organic position
  if (
    !listing.badges.ad &&
    listing.searchPosition.position <= cfg.topPositionThreshold
  ) {
    score += cfg.topPositionBonus;
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
  if (score >= cfg.levels.high.min) {
    level = 'High';
  } else if (score >= cfg.levels.medium.min) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  // Confidence based on data availability
  let confidence = 0.3; // base
  if (reviewCount !== null) confidence += 0.15;
  if (shopSales !== null) confidence += 0.15;
  if (listing.badges.bestseller) confidence += 0.1;
  if (listing.engagement.cartsCount !== null) confidence += 0.1;
  if (rating !== null) confidence += 0.05;
  if (listing.media.imageCount > 0) confidence += 0.05;
  confidence = Math.min(confidence, 1);

  return {
    level,
    score,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

export function calculateMarketSummary(listings: EtsyListing[]): {
  averagePriceUsd: number | null;
  medianPriceUsd: number | null;
  totalAnalyzed: number;
} {
  const prices = listings
    .map((l) => l.price.amountUsd)
    .filter((p): p is number => p !== null && p > 0);

  if (prices.length === 0) {
    return { averagePriceUsd: null, medianPriceUsd: null, totalAnalyzed: listings.length };
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
  };
}
