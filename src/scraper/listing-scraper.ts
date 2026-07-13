import type { SearchResultItem } from '../types/schemas.js';
import { LISTING_SELECTORS } from './selectors.js';
import { createChildLogger } from '../utils/logger.js';
import { RetryError, withRetry } from '../utils/retry.js';
import { normalizeUrl } from '../normalization/url.js';
import type { BrowserManager } from './browser.js';
import * as cheerio from 'cheerio';
import type { ErrorType } from '../types/listing.js';
import { parsePrice } from '../normalization/currency.js';

const log = createChildLogger('listing-scraper');

export interface ListingScrapeResult {
  url: string;
  listingId: string | null;
  html: string;
  jsonLdData: Record<string, unknown>[];
  embeddedState: string | null;
  title: string | null;
  shopName: string | null;
  shopUrl: string | null;
  price: {
    rawText: string | null;
    amount: number | null;
    currency: string | null;
    originalPrice: number | null;
    discountPercent: number | null;
  };
  listingRating: number | null;
  listingReviewCount: number | null;
  shopRating: number | null;
  shopReviewCount: number | null;
  shopSales: number | null;
  descriptionRaw: string | null;
  features: string[];
  includedItems: string[];
  fileFormats: string[];
  mainImageUrl: string | null;
  imageUrls: string[];
  hasVideo: boolean;
  videoUrl: string | null;
  badges: {
    bestseller: boolean;
    etsyPick: boolean;
    popularNow: boolean;
  };
  isDigital: boolean;
  relatedSearches: string[];
  tags: string[];
  breadcrumbs: string[];
  cartsCount: number | null;
  favoritesCount: number | null;
}

export function classifyScrapeError(error: Error): ErrorType {
  const rootError = error instanceof RetryError ? error.lastError : error;
  if (rootError.message.includes('CAPTCHA')) return 'CAPTCHA';
  if (rootError.message.includes('BLOCKED')) return 'BLOCKED';
  if (/timeout/i.test(rootError.message)) return 'TIMEOUT';
  if (rootError.message.includes('net::ERR')) return 'HTTP_ERROR';
  return 'UNKNOWN';
}

export async function scrapeListing(
  browserManager: BrowserManager,
  searchItem: SearchResultItem,
  timeoutMs: number,
  maxRetries: number,
): Promise<{ result: ListingScrapeResult | null; errorType: ErrorType | null; error: string | null }> {
  const page = await browserManager.createPage();

  try {
    const html = await withRetry(
      async () => {
        await page.goto(searchItem.url, {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs,
        });
        await page.waitForTimeout(2000);

        // Check for blocked
        const blockReason = await browserManager.getBlockReason(page);
        if (blockReason) {
          throw new Error(blockReason);
        }

        return page.content();
      },
      { maxRetries, baseDelayMs: 2000 },
      searchItem.url,
    );

    const blockReason = await browserManager.getBlockReason(page);
    if (blockReason) {
      return { result: null, errorType: blockReason, error: `Page rejected: ${blockReason}` };
    }

    const result = parseListingHtml(html, searchItem);
    return { result, errorType: null, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorType = classifyScrapeError(error);

    log.error(
      { url: searchItem.url, errorType, message: error.message },
      'Failed to scrape listing',
    );

    return { result: null, errorType, error: error.message };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function parseListingHtml(html: string, searchItem: SearchResultItem): ListingScrapeResult {
  const $ = cheerio.load(html);

  // Extract JSON-LD
  const jsonLdData: Record<string, unknown>[] = [];
  $(LISTING_SELECTORS.jsonLd).each((_i, el) => {
    try {
      const content = $(el).html();
      if (content) {
        jsonLdData.push(JSON.parse(content));
      }
    } catch {
      // skip
    }
  });

  // Extract embedded state data
  let embeddedState: string | null = null;
  $('script').each((_i, el) => {
    const content = $(el).html();
    if (content && (content.includes('listing') || content.includes('shop'))) {
      if (content.length > 500 && content.length < 500000) {
        embeddedState = content;
      }
    }
  });

  // Title
  const title =
    $(LISTING_SELECTORS.title).first().text().trim() ||
    extractFromJsonLd(jsonLdData, 'name') ||
    searchItem.titlePreview ||
    null;

  // Shop
  const shopName =
    $(LISTING_SELECTORS.shopName).first().text().trim() ||
    extractFromJsonLd(jsonLdData, 'seller', 'name') ||
    searchItem.shopName ||
    null;

  const shopLinkEl = $(LISTING_SELECTORS.shopLink).first();
  const shopUrl = shopLinkEl.attr('href')
    ? normalizeUrl(shopLinkEl.attr('href')!.startsWith('http') ? shopLinkEl.attr('href')! : `https://www.etsy.com${shopLinkEl.attr('href')}`)
    : null;

  // Price
  const priceRawText =
    $(LISTING_SELECTORS.priceValue).first().text().trim() ||
    extractFromJsonLd(jsonLdData, 'offers', 'price') ||
    null;

  const originalPriceText =
    $(LISTING_SELECTORS.originalPrice).first().text().trim() || null;

  // Parse price
  let amount: number | null = null;
  let currency: string | null = null;
  if (priceRawText) {
    const parsedPrice = parsePrice(priceRawText);
    amount = parsedPrice.amount;

    // Try to get currency from JSON-LD
    currency = extractFromJsonLd(jsonLdData, 'offers', 'priceCurrency') as string | null;
    currency ??= parsedPrice.currency;
  }

  // Discount
  let discountPercent: number | null = null;
  let originalPrice: number | null = null;
  if (originalPriceText && amount) {
    originalPrice = parsePrice(originalPriceText).amount;
    if (originalPrice !== null && originalPrice > 0) {
      discountPercent = Math.round(((originalPrice - amount) / originalPrice) * 100);
    }
  }

  // Rating — listing-specific
  let listingRating: number | null = searchItem.rating;
  const listingReviewCount: number | null = searchItem.displayedReviewCount;

  // Try to find listing-specific review section
  const reviewSection = $('[id*="reviews"], [class*="review"]');
  const reviewHeaderText = reviewSection.text();
  if (reviewHeaderText.toLowerCase().includes('review') || reviewSection.length > 0) {
    const ratingEl = reviewSection.find('[class*="star"], [aria-label*="star"]').first();
    if (ratingEl.length) {
      const ariaLabel = ratingEl.attr('aria-label') ?? '';
      const match = ariaLabel.match(/([\d.]+)/);
      if (match) listingRating = parseFloat(match[1]);
    }
  }

  // Shop-level metrics
  const shopRating: number | null = null;
  const shopReviewCount: number | null = null;
  let shopSales: number | null = null;

  // Try to find shop sales
  const salesText = $(LISTING_SELECTORS.shopSalesCount).filter((_i, el) => {
    return $(el).text().toLowerCase().includes('sale');
  }).first().text();
  if (salesText) {
    const salesMatch = salesText.match(/([\d,]+)/);
    if (salesMatch) {
      shopSales = parseInt(salesMatch[1].replace(/,/g, ''), 10);
      if (!Number.isFinite(shopSales)) shopSales = null;
    }
  }

  // Description
  const descriptionRaw =
    $(LISTING_SELECTORS.fullDescription).text().trim() ||
    $(LISTING_SELECTORS.description).text().trim() ||
    null;

  // Features — look for bullet points or feature lists
  const features: string[] = [];
  $('[class*="wt-text-body-01"] li, [class*="feature"] li').each((_i, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 5 && text.length < 500) {
      features.push(text);
    }
  });

  // Included items
  const includedItems: string[] = [];
  $('[class*="included"], [class*="what-you-get"]').each((_i, el) => {
    $(el).find('li').each((_j, li) => {
      const text = $(li).text().trim();
      if (text) includedItems.push(text);
    });
  });

  // File formats
  const fileFormats: string[] = [];
  const formatPatterns = [
    /(?:format|file[s]?\s*(?:included|type[s]?))\s*:?\s*([\w\s,/&]+)/gi,
    /(?:PDF|DOCX?|XLSX?|PPTX?|TXT|CSV|ZIP|NOTION|GOODNOTES|KEYNOTE|PNG|JPG)/gi,
  ];
  const fullText = $.text();
  for (const pattern of formatPatterns) {
    const matches = fullText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const formats = match.match(/(?:PDF|DOCX?|XLSX?|PPTX?|TXT|CSV|ZIP|NOTION|GOODNOTES|KEYNOTE|PNG|JPG)/gi);
        if (formats) {
          fileFormats.push(...formats.map((f) => f.toUpperCase()));
        }
      }
    }
  }

  // Images
  const imageUrls: string[] = [];
  $(LISTING_SELECTORS.imageGallery).each((_i, el) => {
    const src = $(el).attr('src') ?? $(el).attr('data-src');
    if (src && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  });
  const mainImageUrl = imageUrls[0] ?? searchItem.imageUrl ?? null;

  // Video
  const hasVideo = $(LISTING_SELECTORS.videoElement).length > 0;
  const videoUrl =
    $(LISTING_SELECTORS.videoElement).first().attr('src') ??
    $(LISTING_SELECTORS.videoButton).attr('data-video-url') ??
    null;

  // Badges
  const badges = {
    bestseller: $(LISTING_SELECTORS.bestsellerBadge).length > 0 || searchItem.isBestseller,
    etsyPick: $(LISTING_SELECTORS.etsyPickBadge).length > 0,
    popularNow: $(LISTING_SELECTORS.popularBadge).length > 0 || searchItem.isPopularNow,
  };

  // Digital
  const isDigital =
    $(LISTING_SELECTORS.digitalBadge).length > 0 ||
    fullText.toLowerCase().includes('digital download') ||
    fullText.toLowerCase().includes('instant download') ||
    fullText.toLowerCase().includes('digital product');

  // Related searches
  const relatedSearches: string[] = [];
  $(LISTING_SELECTORS.relatedSearches).each((_i, el) => {
    const text = $(el).text().trim();
    if (text) relatedSearches.push(text);
  });

  // Tags
  const tags: string[] = [];
  $(LISTING_SELECTORS.tags).each((_i, el) => {
    const text = $(el).text().trim().replace(/^#/, '');
    if (text) tags.push(text);
  });

  // Breadcrumbs
  const breadcrumbs: string[] = [];
  $(LISTING_SELECTORS.breadcrumbs).each((_i, el) => {
    const text = $(el).text().trim();
    if (text && !text.includes('Etsy') && text !== '/') {
      breadcrumbs.push(text);
    }
  });

  // Engagement
  let cartsCount: number | null = null;
  let favoritesCount: number | null = null;
  const engagementText = $.text();
  const cartsMatch = engagementText.match(/([\d,]+)\s*(?:people|person)\s*have\s*this\s*in\s*their\s*cart/i);
  if (cartsMatch) {
    cartsCount = parseInt(cartsMatch[1].replace(/,/g, ''), 10);
    if (!Number.isFinite(cartsCount)) cartsCount = null;
  }
  const favMatch = engagementText.match(
    /(?:([\d,]+)\s*(?:favorite|favorited)|favorited\s+by\s+([\d,]+))/i,
  );
  if (favMatch) {
    favoritesCount = parseInt((favMatch[1] ?? favMatch[2]).replace(/,/g, ''), 10);
    if (!Number.isFinite(favoritesCount)) favoritesCount = null;
  }

  return {
    url: normalizeUrl(searchItem.url),
    listingId: searchItem.listingId,
    html,
    jsonLdData,
    embeddedState,
    title,
    shopName,
    shopUrl,
    price: {
      rawText: priceRawText,
      amount,
      currency,
      originalPrice,
      discountPercent,
    },
    listingRating,
    listingReviewCount,
    shopRating,
    shopReviewCount,
    shopSales,
    descriptionRaw,
    features,
    includedItems,
    fileFormats: [...new Set(fileFormats)],
    mainImageUrl,
    imageUrls,
    hasVideo,
    videoUrl,
    badges,
    isDigital,
    relatedSearches,
    tags,
    breadcrumbs,
    cartsCount,
    favoritesCount,
  };
}

function extractFromJsonLd(
  jsonLdData: Record<string, unknown>[],
  ...path: string[]
): string | null {
  for (const data of jsonLdData) {
    let current: unknown = data;
    for (const key of path) {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = undefined;
        break;
      }
    }
    if (current !== undefined && current !== null) {
      return String(current);
    }
  }
  return null;
}
