import { setTimeout as delay } from 'timers/promises';

const DEFAULT_BASE_URL = 'https://api.etsy.com/v3/application';
const MAX_BATCH_SIZE = 100;

export interface EtsyMoney {
  amount?: number;
  divisor?: number;
  currency_code?: string;
}

export interface EtsyApiImage {
  rank?: number;
  url_570xN?: string;
  url_fullxfull?: string;
}

export interface EtsyApiVideo {
  video_url?: string;
}

export interface EtsyApiShop {
  shop_name?: string;
  url?: string;
  review_average?: number;
  review_count?: number;
  transaction_sold_count?: number;
}

export interface EtsyApiListing {
  listing_id: number;
  shop_id?: number;
  title?: string;
  description?: string;
  url?: string;
  price?: EtsyMoney;
  type?: 'physical' | 'download' | 'both' | string;
  listing_type?: string;
  tags?: string[];
  materials?: string[];
  num_favorers?: number;
  images?: EtsyApiImage[];
  videos?: EtsyApiVideo[];
  shop?: EtsyApiShop;
}

interface EtsyApiListResponse {
  count?: number;
  results?: EtsyApiListing[];
}

export interface EtsyApiSearchOptions {
  query: string;
  pages: number;
  maxListings: number;
  currency: string;
  country: string;
}

export interface EtsyApiSearchResult {
  listings: EtsyApiListing[];
  totalAvailable: number;
}

export interface EtsyApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export class EtsyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EtsyApiError';
  }
}

export class EtsyApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: EtsyApiClientOptions) {
    if (!options.apiKey.trim() || !options.apiKey.includes(':')) {
      throw new EtsyApiError(
        'ETSY_API_KEY must contain keystring and shared secret separated by a colon',
        null,
        false,
      );
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async searchActiveListings(options: EtsyApiSearchOptions): Promise<EtsyApiSearchResult> {
    const requestedPages = Math.max(1, Math.min(10, Math.trunc(options.pages)));
    const requestedListings = Math.max(1, Math.trunc(options.maxListings));
    const pageSize = Math.min(MAX_BATCH_SIZE, Math.ceil(requestedListings / requestedPages));
    const searchListings: EtsyApiListing[] = [];
    let totalAvailable = 0;

    for (let page = 0; page < requestedPages && searchListings.length < requestedListings; page++) {
      const limit = Math.min(pageSize, requestedListings - searchListings.length);
      const params = new URLSearchParams({
        keywords: options.query,
        limit: String(limit),
        offset: String(page * pageSize),
        sort_on: 'score',
        sort_order: 'desc',
      });
      const response = await this.request<EtsyApiListResponse>(`/listings/active?${params}`);
      const results = Array.isArray(response.results) ? response.results : [];
      totalAvailable = typeof response.count === 'number' ? response.count : totalAvailable;
      searchListings.push(...results.filter(hasListingId));
      if (results.length < limit) break;
    }

    const uniqueListings = deduplicateListings(searchListings).slice(0, requestedListings);
    if (uniqueListings.length === 0) return { listings: [], totalAvailable };

    const detailedListings: EtsyApiListing[] = [];
    for (let offset = 0; offset < uniqueListings.length; offset += MAX_BATCH_SIZE) {
      const batch = uniqueListings.slice(offset, offset + MAX_BATCH_SIZE);
      const params = new URLSearchParams({
        listing_ids: batch.map((listing) => listing.listing_id).join(','),
        includes: 'Images,Shop,Videos,BuyerPrice',
        currency: options.currency,
        buyer_country: options.country,
      });
      const response = await this.request<EtsyApiListResponse>(`/listings/batch?${params}`);
      detailedListings.push(...(response.results ?? []).filter(hasListingId));
    }

    const detailsById = new Map(detailedListings.map((listing) => [listing.listing_id, listing]));
    return {
      listings: uniqueListings.map((listing) => ({
        ...listing,
        ...(detailsById.get(listing.listing_id) ?? {}),
      })),
      totalAvailable,
    };
  }

  async verifyCredentials(): Promise<void> {
    await this.request<{ application_id?: number }>('/openapi-ping');
  }

  private async request<T>(path: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'etsy-market-research/1.4.0',
            'x-api-key': this.options.apiKey,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) return (await response.json()) as T;

        const body = await response.text();
        const message = readApiError(body) ?? response.statusText ?? 'Unknown Etsy API error';
        const retryable = response.status === 429 || response.status >= 500;
        const error = new EtsyApiError(
          friendlyStatusMessage(response.status, message),
          response.status,
          retryable,
        );
        if (!retryable || attempt === this.maxRetries) throw error;

        lastError = error;
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1_000, 30_000)
          : Math.min(1_000 * 2 ** attempt, 8_000);
        await delay(waitMs);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (error instanceof EtsyApiError && !error.retryable) throw error;
        lastError = normalized;
        if (attempt === this.maxRetries) break;
        await delay(Math.min(1_000 * 2 ** attempt, 8_000));
      }
    }

    if (lastError instanceof EtsyApiError) throw lastError;
    throw new EtsyApiError(
      `Etsy API request failed: ${lastError?.message ?? 'unknown network error'}`,
      null,
      true,
    );
  }
}

function hasListingId(value: EtsyApiListing): boolean {
  return Number.isInteger(value?.listing_id) && value.listing_id > 0;
}

function deduplicateListings(listings: EtsyApiListing[]): EtsyApiListing[] {
  return [...new Map(listings.map((listing) => [listing.listing_id, listing])).values()];
}

function readApiError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return body.trim().slice(0, 300) || null;
  }
}

function friendlyStatusMessage(status: number, message: string): string {
  if (status === 401) return `Etsy API rejected the application key: ${message}`;
  if (status === 403) {
    return `Etsy API denied access. Check the app access level and API terms: ${message}`;
  }
  if (status === 429) return `Etsy API rate limit exceeded: ${message}`;
  return `Etsy API returned HTTP ${status}: ${message}`;
}
