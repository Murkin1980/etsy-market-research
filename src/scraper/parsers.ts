import * as cheerio from 'cheerio';
import type { SearchResultItem } from '../types/schemas.js';
import { normalizeUrl, extractListingId } from '../normalization/url.js';
import { parseNumericValue } from '../normalization/currency.js';
import { SEARCH_SELECTORS, LISTING_SELECTORS } from './selectors.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('parsers');

export function parseSearchPage(
  html: string,
  page: number,
): { results: SearchResultItem[]; nextPageAvailable: boolean } {
  const $ = cheerio.load(html);
  const results: SearchResultItem[] = [];
  let position = 0;

  // Try to detect blocked page
  if ($(SEARCH_SELECTORS.blockedPage).length > 0) {
    log.warn('Blocked page detected in search results');
    return { results: [], nextPageAvailable: false };
  }

  // Parse listing cards
  $(SEARCH_SELECTORS.listingCard).each((_i, el) => {
    const $card = $(el);
    position++;

    // Extract listing URL and ID
    const linkEl = $card.find(SEARCH_SELECTORS.listingLink);
    let rawUrl = linkEl.attr('href') ?? $card.find('a').first().attr('href') ?? '';
    if (rawUrl && !rawUrl.startsWith('http')) {
      rawUrl = 'https://www.etsy.com' + rawUrl;
    }
    const normalizedUrl = normalizeUrl(rawUrl);
    const listingId = extractListingId(normalizedUrl) ?? $card.attr('data-listing-id') ?? null;

    // Title
    const titlePreview =
      $card.find(SEARCH_SELECTORS.title).first().text().trim() || null;

    // Price
    const priceEl = $card.find(SEARCH_SELECTORS.price).first();
    const displayedPrice = priceEl.text().trim() || null;

    // Shop name
    const shopName =
      $card.find(SEARCH_SELECTORS.shopName).first().text().trim() || null;

    // Rating (stars)
    let rating: number | null = null;
    const ratingEl = $card.find('[class*="star"]');
    if (ratingEl.length) {
      const ariaLabel = ratingEl.attr('aria-label') ?? '';
      const ratingMatch = ariaLabel.match(/([\d.]+)\s*out\s*of/i) ?? ariaLabel.match(/([\d.]+)/);
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]);
      }
    }
    // Fallback: look for rating in text
    if (rating === null) {
      const ratingText = $card.text();
      const rtMatch = ratingText.match(/(\d\.\d)\s*(?:out of|stars?)/i);
      if (rtMatch) {
        rating = parseFloat(rtMatch[1]);
      }
    }

    // Review count
    let displayedReviewCount: number | null = null;
    const reviewText = $card.find(SEARCH_SELECTORS.reviewCount).first().text().trim();
    if (reviewText) {
      displayedReviewCount = parseNumericValue(reviewText.replace(/[()]/g, ''));
    }

    // Image
    const imgEl = $card.find(SEARCH_SELECTORS.listingImage).first();
    const imageUrl = imgEl.attr('src') ?? imgEl.attr('data-src') ?? null;

    // Badges
    const isBestseller = $card.find(SEARCH_SELECTORS.bestseller).length > 0;
    const isPopularNow = $card.find(SEARCH_SELECTORS.popularNow).length > 0;
    const isAd =
      $card.find(SEARCH_SELECTORS.adIndicator).length > 0 ||
      $card.text().toLowerCase().includes('ad ·') ||
      $card.text().toLowerCase().includes('sponsored');

    if (!normalizedUrl || normalizedUrl.includes('/search')) {
      return; // Skip non-listing cards (navigation, etc.)
    }

    results.push({
      listingId,
      url: normalizedUrl,
      titlePreview,
      displayedPrice,
      shopName,
      rating,
      displayedReviewCount,
      imageUrl,
      isAd,
      isBestseller,
      isPopularNow,
      page,
      position,
    });
  });

  // If no cards found, try embedded JSON
  if (results.length === 0) {
    const embeddedResults = parseEmbeddedSearchData($, page);
    if (embeddedResults.length > 0) {
      results.push(...embeddedResults);
      log.info({ count: embeddedResults.length }, 'Parsed search results from embedded JSON');
    }
  }

  // Check for next page
  const nextPageAvailable =
    $(SEARCH_SELECTORS.nextPage).length > 0 ||
    $(SEARCH_SELECTORS.paginationLinks).filter((_i, el) => {
      return $(el).text().trim() === 'Next Page' || $(el).text().trim() === '→';
    }).length > 0;

  return { results, nextPageAvailable };
}

function parseEmbeddedSearchData(
  $: cheerio.CheerioAPI,
  page: number,
): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  let position = 0;

  // Try to find embedded JSON with search data
  $('script').each((_i, el) => {
    const content = $(el).html();
    if (!content) return;

    // Look for search result data in script tags
    const dataMatch = content.match(/"searchResults"\s*:\s*(\[[\s\S]*?\])/);
    if (!dataMatch) return;

    try {
      const searchResults = JSON.parse(dataMatch[1]) as Array<{
        listing_id?: number;
        url?: string;
        title?: string;
        price?: { amount?: number; currency_code?: string };
        shop_name?: string;
        rating?: number;
        review_count?: number;
        image_url?: string;
      }>;

      for (const item of searchResults) {
        position++;
        const rawUrl = item.url ?? '';
        const normalizedUrl = normalizeUrl(rawUrl.startsWith('http') ? rawUrl : `https://www.etsy.com${rawUrl}`);
        const listingId = item.listing_id?.toString() ?? extractListingId(normalizedUrl);

        results.push({
          listingId: listingId ?? null,
          url: normalizedUrl,
          titlePreview: item.title ?? null,
          displayedPrice: item.price?.amount?.toString() ?? null,
          shopName: item.shop_name ?? null,
          rating: item.rating ?? null,
          displayedReviewCount: item.review_count ?? null,
          imageUrl: item.image_url ?? null,
          isAd: false,
          isBestseller: false,
          isPopularNow: false,
          page,
          position,
        });
      }
    } catch {
      // Not valid JSON or wrong structure
    }
  });

  return results;
}

export function parseListingPage(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);
  const data: Record<string, unknown> = {};

  // Extract JSON-LD
  const jsonLdData: unknown[] = [];
  $(LISTING_SELECTORS.jsonLd).each((_i, el) => {
    try {
      const content = $(el).html();
      if (content) {
        const parsed = JSON.parse(content);
        jsonLdData.push(parsed);
      }
    } catch {
      // skip
    }
  });
  data.jsonLd = jsonLdData;

  // Extract embedded JSON / page state
  const embeddedScripts: Record<string, string> = {};
  $('script').each((_i, el) => {
    const content = $(el).html();
    if (!content) return;
    if (content.includes('window.__SEARCH_RESULTS_STATE__') || content.includes('"listing"')) {
      embeddedScripts.stateData = content;
    }
  });
  data.embeddedScripts = embeddedScripts;

  // Store full HTML for additional parsing
  data.html = html;
  data.$ = $;

  return data;
}
