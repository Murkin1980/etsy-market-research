import type { ListingScrapeResult } from '../scraper/listing-scraper.js';
import type { SearchResultItem } from '../types/schemas.js';
import type { EtsyApiListing, EtsyMoney } from './client.js';

export interface MappedApiListing {
  searchItem: SearchResultItem;
  scrapeResult: ListingScrapeResult;
}

export function mapApiListings(listings: EtsyApiListing[]): MappedApiListing[] {
  return listings.map((listing, index) => mapApiListing(listing, index));
}

export function mapApiListing(listing: EtsyApiListing, index: number): MappedApiListing {
  const listingId = String(listing.listing_id);
  const url = listing.url || `https://www.etsy.com/listing/${listingId}`;
  const price = mapMoney(listing.price);
  const images = [...(listing.images ?? [])]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((image) => image.url_fullxfull || image.url_570xN || '')
    .filter(Boolean);
  const videos = (listing.videos ?? []).map((video) => video.video_url ?? '').filter(Boolean);
  const shopName = listing.shop?.shop_name ?? null;
  const listingType = listing.type ?? listing.listing_type;
  const productType = listingType === 'download'
    ? 'digital'
    : listingType === 'physical'
      ? 'physical'
      : 'unknown';
  const page = Math.floor(index / 100) + 1;
  const position = index + 1;

  const searchItem: SearchResultItem = {
    listingId,
    url,
    titlePreview: listing.title ?? null,
    displayedPrice: price.rawText,
    shopName,
    rating: null,
    displayedReviewCount: null,
    imageUrl: images[0] ?? null,
    isAd: false,
    isBestseller: false,
    isPopularNow: false,
    page,
    position,
  };

  const apiEvidence = { source: 'api' as const, confidence: 0.98 };
  const unavailableEvidence = { source: null, confidence: 0 };
  const scrapeResult: ListingScrapeResult = {
    url,
    listingId,
    html: '',
    jsonLdData: [],
    embeddedState: null,
    title: listing.title ?? null,
    shopName,
    shopUrl: listing.shop?.url ?? (shopName ? `https://www.etsy.com/shop/${encodeURIComponent(shopName)}` : null),
    price: {
      ...price,
      originalPrice: null,
      discountPercent: null,
    },
    listingRating: null,
    listingReviewCount: null,
    shopRating: listing.shop?.review_average ?? null,
    shopReviewCount: listing.shop?.review_count ?? null,
    shopSales: listing.shop?.transaction_sold_count ?? null,
    descriptionRaw: listing.description ?? null,
    features: listing.tags ?? [],
    includedItems: [],
    fileFormats: [],
    mainImageUrl: images[0] ?? null,
    imageUrls: images,
    hasVideo: videos.length > 0,
    videoUrl: videos[0] ?? null,
    badges: { bestseller: false, etsyPick: false, popularNow: false },
    isDigital: productType === 'digital',
    productType,
    relatedSearches: [],
    tags: listing.tags ?? [],
    breadcrumbs: [],
    cartsCount: null,
    favoritesCount: listing.num_favorers ?? null,
    evidence: {
      title: listing.title ? apiEvidence : unavailableEvidence,
      shopName: shopName ? apiEvidence : unavailableEvidence,
      price: price.amount !== null ? apiEvidence : unavailableEvidence,
      listingRating: unavailableEvidence,
      listingReviewCount: unavailableEvidence,
      description: listing.description ? apiEvidence : unavailableEvidence,
      images: images.length > 0 ? apiEvidence : unavailableEvidence,
    },
  };

  return { searchItem, scrapeResult };
}

function mapMoney(money: EtsyMoney | undefined): {
  rawText: string | null;
  amount: number | null;
  currency: string | null;
} {
  if (!money || typeof money.amount !== 'number') {
    return { rawText: null, amount: null, currency: null };
  }
  const divisor = typeof money.divisor === 'number' && money.divisor > 0 ? money.divisor : 100;
  const amount = money.amount / divisor;
  const currency = money.currency_code ?? null;
  return {
    rawText: currency ? `${amount.toFixed(2)} ${currency}` : amount.toFixed(2),
    amount,
    currency,
  };
}
