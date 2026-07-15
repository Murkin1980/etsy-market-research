import { config } from '../dist/config/env.js';
import { LlmAnalyzer } from '../dist/analysis/llm-analyzer.js';

if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured');

const listing = {
  listingId: 'smoke-1',
  url: 'https://www.etsy.com/listing/1/example',
  canonicalUrl: 'https://www.etsy.com/listing/1/example',
  title: 'Small Business CRM Notion Template',
  shopName: 'ExampleShop',
  shopUrl: null,
  productType: 'digital',
  price: { rawText: '$15', amount: 15, currency: 'USD', originalPrice: null, discountPercent: null, amountUsd: 15, exchangeRate: 1, exchangeRateDate: null, exchangeRateSource: 'identity' },
  rating: { listingRating: null, listingReviewCount: null, shopRating: null, shopReviewCount: null, shopSales: null },
  badges: { bestseller: false, etsyPick: false, popularNow: false, ad: false },
  engagement: { cartsCount: null, favoritesCount: null },
  content: { descriptionRaw: null, descriptionCleaned: null, mainFeature: 'client CRM', features: ['client tracker'], includedItems: [], fileFormats: [], relatedSearches: [], extractedKeywords: ['small business', 'crm'] },
  media: { mainImageUrl: null, imageUrls: [], imageCount: 0, hasVideo: false, videoUrl: null },
  searchPosition: { page: 1, position: 1 },
  evidence: {
    title: { source: 'api', confidence: 1 }, shopName: { source: 'api', confidence: 1 }, price: { source: 'api', confidence: 1 },
    listingRating: { source: null, confidence: 0 }, listingReviewCount: { source: null, confidence: 0 },
    description: { source: null, confidence: 0 }, images: { source: null, confidence: 0 },
  },
  salesEstimate: { level: 'Unknown', score: 0, listingEvidenceScore: 0, shopProxyScore: 0, confidence: 0.2, reasons: [], shopProxyReasons: [] },
  scraping: { status: 'success', scrapedAt: new Date().toISOString(), missingFields: ['listingRating', 'listingReviewCount'], warnings: [] },
};

const analyzer = new LlmAnalyzer({
  provider: 'openai',
  apiKey: config.openaiApiKey,
  model: config.openaiModel,
  timeoutMs: config.llmTimeoutMs,
});
const result = await analyzer.analyze([listing]);
console.log(JSON.stringify({
  ok: true,
  model: config.openaiModel,
  analyzedListings: result.marketSummary.analyzedListings,
  conceptCreated: Boolean(result.newProductConcept.name),
}));
