import { URL } from 'url';
import { TRACKING_PARAMS, ETSY_BASE_URL } from '../config/defaults.js';

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, ETSY_BASE_URL);
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param);
    }
    let normalized = url.origin + url.pathname;
    const remainingParams = url.searchParams.toString();
    if (remainingParams) {
      normalized += '?' + remainingParams;
    }
    normalized = normalized.replace(/\/+$/, '');
    return normalized;
  } catch {
    return rawUrl;
  }
}

export function extractListingId(url: string): string | null {
  const match = url.match(/\/listing\/(\d+)/);
  return match ? match[1] : null;
}

export function isEtsyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('etsy.com');
  } catch {
    return false;
  }
}

export function extractShopUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 1 && pathParts[0] !== 'search' && pathParts[0] !== 'listing') {
      return `${parsed.origin}/${pathParts[0]}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildSearchUrl(
  query: string,
  page: number,
  currency: string = 'USD',
  country: string = 'US',
  language: string = 'en-US',
): string {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('ref', 'search_bar');
  params.set('currency_code', currency);
  params.set('country', country);
  params.set('locale', language);
  if (page > 1) {
    params.set('explicit', '1');
    params.set('page', page.toString());
  }
  return `${ETSY_BASE_URL}/search?${params.toString()}`;
}

export function deduplicateByListingId<T extends { url: string; listingId: string | null }>(
  items: T[],
): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = item.listingId ?? normalizeUrl(item.url);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}
