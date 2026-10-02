import { ApifyClient } from 'apify-client';
import type { SearchResultItem } from '../types/schemas.js';

export type ApifySearchOptions = {
  maxPages?: number;
  instantDownload?: boolean;
  token?: string;
  /** Prefer 'candidate' while the Search Actor remains unlisted / pre-latest. */
  build?: string;
};

/**
 * Optional hosted search source via publicrecords/etsy-search-scraper.
 * Maps Actor rows onto this repo's SearchResultItem shape.
 */
export async function apifySearch(
  query: string,
  opts: ApifySearchOptions = {},
): Promise<SearchResultItem[]> {
  const client = new ApifyClient({ token: opts.token ?? process.env.APIFY_TOKEN });
  const run = await client.actor('publicrecords/etsy-search-scraper').call(
    {
      queries: [query],
      maxPages: opts.maxPages ?? 3,
      instant_download: opts.instantDownload ?? false,
    },
    opts.build ? { build: opts.build } : undefined,
  );
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return (items as Record<string, unknown>[]).map((r, idx) => {
    const listingId = r.listing_id != null ? String(r.listing_id) : null;
    const url =
      typeof r.url === 'string' && r.url.length > 0
        ? r.url
        : listingId
          ? `https://www.etsy.com/listing/${listingId}`
          : `https://www.etsy.com/search?q=${encodeURIComponent(query)}#apify-${idx}`;
    const price = typeof r.price === 'number' ? r.price : null;
    const currency = typeof r.currency === 'string' ? r.currency : null;
    const displayedPrice =
      price != null ? `${currency ?? ''}${price}`.trim() || String(price) : null;
    return {
      listingId,
      url,
      titlePreview: typeof r.title === 'string' ? r.title : null,
      displayedPrice,
      shopName: typeof r.shop_name === 'string' ? r.shop_name : null,
      rating: typeof r.rating_value === 'number' ? r.rating_value : null,
      displayedReviewCount: typeof r.review_count === 'number' ? r.review_count : null,
      imageUrl: null,
      isAd: Boolean(r.is_ad),
      isBestseller: Boolean(r.bestseller),
      isPopularNow: Boolean(r.popular_now),
      page: typeof r.page === 'number' ? r.page : 1,
      position: typeof r.position === 'number' ? r.position : idx + 1,
    } satisfies SearchResultItem;
  });
}
