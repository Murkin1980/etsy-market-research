import { z } from 'zod';

export const SearchResultItemSchema = z.object({
  listingId: z.string().nullable(),
  url: z.string().url(),
  titlePreview: z.string().nullable(),
  displayedPrice: z.string().nullable(),
  shopName: z.string().nullable(),
  rating: z.number().nullable(),
  displayedReviewCount: z.number().nullable(),
  imageUrl: z.string().nullable(),
  isAd: z.boolean(),
  isBestseller: z.boolean(),
  isPopularNow: z.boolean(),
  page: z.number(),
  position: z.number(),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const PriceDataSchema = z.object({
  rawText: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  originalPrice: z.number().nullable(),
  discountPercent: z.number().nullable(),
  amountUsd: z.number().nullable(),
  exchangeRate: z.number().nullable(),
  exchangeRateDate: z.string().nullable(),
  exchangeRateSource: z.enum(['identity', 'live', 'cache', 'fallback']).nullable().default(null),
});

const FieldEvidenceSchema = z.object({
  source: z.enum(['json_ld', 'embedded_json', 'dom', 'text', 'search_result', 'llm']).nullable(),
  confidence: z.number().min(0).max(1),
});

const UnknownListingEvidence = {
  title: { source: null, confidence: 0 },
  shopName: { source: null, confidence: 0 },
  price: { source: null, confidence: 0 },
  listingRating: { source: null, confidence: 0 },
  listingReviewCount: { source: null, confidence: 0 },
  description: { source: null, confidence: 0 },
  images: { source: null, confidence: 0 },
} as const;

export const ReviewMetricsSchema = z.object({
  listingRating: z.number().nullable(),
  listingReviewCount: z.number().nullable(),
  shopRating: z.number().nullable(),
  shopReviewCount: z.number().nullable(),
  shopSales: z.number().nullable(),
});

export const EtsyListingSchema = z.object({
  listingId: z.string().nullable(),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  title: z.string().nullable(),
  shopName: z.string().nullable(),
  shopUrl: z.string().nullable(),
  productType: z.enum(['digital', 'physical', 'unknown']),
  price: PriceDataSchema,
  rating: ReviewMetricsSchema,
  badges: z.object({
    bestseller: z.boolean(),
    etsyPick: z.boolean(),
    popularNow: z.boolean(),
    ad: z.boolean(),
  }),
  engagement: z.object({
    cartsCount: z.number().nullable(),
    favoritesCount: z.number().nullable(),
  }),
  content: z.object({
    descriptionRaw: z.string().nullable(),
    descriptionCleaned: z.string().nullable(),
    mainFeature: z.string().nullable(),
    features: z.array(z.string()),
    includedItems: z.array(z.string()),
    fileFormats: z.array(z.string()),
    relatedSearches: z.array(z.string()),
    extractedKeywords: z.array(z.string()),
  }),
  media: z.object({
    mainImageUrl: z.string().nullable(),
    imageUrls: z.array(z.string()),
    imageCount: z.number(),
    hasVideo: z.boolean(),
    videoUrl: z.string().nullable(),
  }),
  searchPosition: z.object({
    page: z.number(),
    position: z.number(),
  }),
  evidence: z.object({
    title: FieldEvidenceSchema,
    shopName: FieldEvidenceSchema,
    price: FieldEvidenceSchema,
    listingRating: FieldEvidenceSchema,
    listingReviewCount: FieldEvidenceSchema,
    description: FieldEvidenceSchema,
    images: FieldEvidenceSchema,
  }).default(UnknownListingEvidence),
  salesEstimate: z.object({
    level: z.enum(['High', 'Medium', 'Low', 'Unknown']),
    score: z.number(),
    listingEvidenceScore: z.number().optional(),
    shopProxyScore: z.number().optional(),
    confidence: z.number(),
    reasons: z.array(z.string()),
    shopProxyReasons: z.array(z.string()).default([]),
  }).transform((estimate) => ({
    ...estimate,
    listingEvidenceScore: estimate.listingEvidenceScore ?? estimate.score,
    shopProxyScore: estimate.shopProxyScore ?? 0,
  })),
  scraping: z.object({
    status: z.enum(['success', 'partial', 'failed', 'blocked']),
    scrapedAt: z.string(),
    missingFields: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
});

export type EtsyListingValidated = z.infer<typeof EtsyListingSchema>;

export const LlmAnalysisResultSchema = z.object({
  marketSummary: z.object({
    analyzedListings: z.number(),
    averagePriceUsd: z.number().nullable(),
    medianPriceUsd: z.number().nullable(),
    commonFeatures: z.array(z.string()),
    commonPositioningPatterns: z.array(z.string()),
    marketGaps: z.array(z.string()),
  }),
  topProducts: z.array(
    z.object({
      rank: z.number(),
      listingId: z.string(),
      title: z.string(),
      url: z.string().url(),
      mainUSP: z.string(),
      targetAudience: z.array(z.string()),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      demandReasons: z.array(z.string()),
      improvementOpportunities: z.array(z.string()),
    }),
  ),
  recommendedFeatures: z.array(
    z.object({
      name: z.string(),
      priority: z.enum(['must_have', 'important', 'optional']),
      reason: z.string(),
    }),
  ),
  newProductConcept: z.object({
    name: z.string(),
    positioning: z.string(),
    mainUSP: z.string(),
    targetAudience: z.array(z.string()),
    recommendedPriceMinUsd: z.number().nullable(),
    recommendedPriceMaxUsd: z.number().nullable(),
    includedItems: z.array(z.string()),
    bonuses: z.array(z.string()),
    imagePlan: z.array(z.string()),
    descriptionPlan: z.array(z.string()),
  }),
  risks: z.array(z.string()),
});

export type LlmAnalysisResult = z.infer<typeof LlmAnalysisResultSchema>;

export const FailedListingSchema = z.object({
  url: z.string(),
  listingId: z.string().nullable(),
  errorType: z.string(),
  message: z.string(),
  attempts: z.number(),
  timestamp: z.string(),
});
