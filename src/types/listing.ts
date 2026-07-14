export type ExtractionSource =
  | 'json_ld'
  | 'embedded_json'
  | 'dom'
  | 'text'
  | 'search_result'
  | 'api'
  | 'llm'
  | null;

export interface ExtractedValue<T> {
  value: T | null;
  source: ExtractionSource;
  confidence: number;
}

export interface ListingFieldEvidence {
  title: Omit<ExtractedValue<string>, 'value'>;
  shopName: Omit<ExtractedValue<string>, 'value'>;
  price: Omit<ExtractedValue<number>, 'value'>;
  listingRating: Omit<ExtractedValue<number>, 'value'>;
  listingReviewCount: Omit<ExtractedValue<number>, 'value'>;
  description: Omit<ExtractedValue<string>, 'value'>;
  images: Omit<ExtractedValue<string[]>, 'value'>;
}

export interface TextContent {
  raw: string | null;
  cleaned: string | null;
}

export interface PriceData {
  rawText: string | null;
  amount: number | null;
  currency: string | null;
  originalPrice: number | null;
  discountPercent: number | null;
  amountUsd: number | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: 'identity' | 'live' | 'cache' | 'fallback' | null;
}

export interface ReviewMetrics {
  listingRating: number | null;
  listingReviewCount: number | null;
  shopRating: number | null;
  shopReviewCount: number | null;
  shopSales: number | null;
}

export interface Badges {
  bestseller: boolean;
  etsyPick: boolean;
  popularNow: boolean;
  ad: boolean;
}

export interface Engagement {
  cartsCount: number | null;
  favoritesCount: number | null;
}

export interface ContentData {
  descriptionRaw: string | null;
  descriptionCleaned: string | null;
  mainFeature: string | null;
  features: string[];
  includedItems: string[];
  fileFormats: string[];
  relatedSearches: string[];
  extractedKeywords: string[];
}

export interface MediaData {
  mainImageUrl: string | null;
  imageUrls: string[];
  imageCount: number;
  hasVideo: boolean;
  videoUrl: string | null;
}

export interface SearchPosition {
  page: number;
  position: number;
}

export type SalesLevel = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface SalesEstimate {
  level: SalesLevel;
  score: number;
  listingEvidenceScore: number;
  shopProxyScore: number;
  confidence: number;
  reasons: string[];
  shopProxyReasons: string[];
}

export type ScrapingStatus = 'success' | 'partial' | 'failed' | 'blocked';

export interface ScrapingMeta {
  status: ScrapingStatus;
  scrapedAt: string;
  missingFields: string[];
  warnings: string[];
}

export interface EtsyListing {
  listingId: string | null;
  url: string;
  canonicalUrl: string;
  title: string | null;
  shopName: string | null;
  shopUrl: string | null;
  productType: 'digital' | 'physical' | 'unknown';
  price: PriceData;
  rating: ReviewMetrics;
  badges: Badges;
  engagement: Engagement;
  content: ContentData;
  media: MediaData;
  searchPosition: SearchPosition;
  evidence: ListingFieldEvidence;
  salesEstimate: SalesEstimate;
  scraping: ScrapingMeta;
}

export type ErrorType =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'BLOCKED'
  | 'CAPTCHA'
  | 'SELECTOR_NOT_FOUND'
  | 'INVALID_DATA'
  | 'CURRENCY_ERROR'
  | 'LLM_ERROR'
  | 'UNKNOWN';

export interface FailedListing {
  url: string;
  listingId: string | null;
  errorType: ErrorType;
  message: string;
  attempts: number;
  timestamp: string;
}

export interface RunMetadata {
  query: string;
  startedAt: string;
  completedAt: string | null;
  params: Record<string, unknown>;
  totalFound: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  blockedCount: number;
  durationMs: number | null;
  schemaVersion: string;
  appVersion: string;
}
