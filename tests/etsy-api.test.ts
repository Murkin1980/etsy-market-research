import { describe, expect, it, vi } from 'vitest';
import { EtsyApiClient, EtsyApiError, type EtsyApiListing } from '../src/etsy-api/client.js';
import { mapApiListing } from '../src/etsy-api/mapper.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EtsyApiClient', () => {
  it('searches active listings and enriches them through the batch endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        count: 42,
        results: [
          { listing_id: 101, title: 'Planner' },
          { listing_id: 102, title: 'Template' },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        count: 2,
        results: [
          {
            listing_id: 101,
            title: 'Planner Pro',
            price: { amount: 1250, divisor: 100, currency_code: 'USD' },
            images: [{ rank: 1, url_fullxfull: 'https://example.com/planner.jpg' }],
          },
          { listing_id: 102, title: 'Template Pro' },
        ],
      }));

    const client = new EtsyApiClient({
      apiKey: 'keystring:shared-secret',
      fetchImpl: fetchMock,
      maxRetries: 0,
    });
    const result = await client.searchActiveListings({
      query: 'digital planner',
      pages: 1,
      maxListings: 2,
      currency: 'USD',
      country: 'US',
    });

    expect(result.totalAvailable).toBe(42);
    expect(result.listings).toHaveLength(2);
    expect(result.listings[0].title).toBe('Planner Pro');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.pathname).toBe('/v3/application/listings/active');
    expect(searchUrl.searchParams.get('keywords')).toBe('digital planner');
    expect(searchUrl.searchParams.get('sort_on')).toBe('score');

    const batchUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(batchUrl.pathname).toBe('/v3/application/listings/batch');
    expect(batchUrl.searchParams.get('listing_ids')).toBe('101,102');
    expect(batchUrl.searchParams.get('includes')).toBe('Images,Shop,Videos,BuyerPrice');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'x-api-key': 'keystring:shared-secret',
    });
  });

  it('returns an actionable error for a denied access level', async () => {
    const client = new EtsyApiClient({
      apiKey: 'keystring:shared-secret',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ error: 'Application access is not approved' }, 403),
      ),
      maxRetries: 0,
    });

    await expect(client.searchActiveListings({
      query: 'planner',
      pages: 1,
      maxListings: 1,
      currency: 'USD',
      country: 'US',
    })).rejects.toMatchObject<EtsyApiError>({ status: 403, retryable: false });
  });

  it('does not accept an incomplete application key', () => {
    expect(() => new EtsyApiClient({ apiKey: 'keystring-only' })).toThrow(/shared secret/i);
  });
});

describe('mapApiListing', () => {
  it('maps official API fields without presenting shop reviews as listing reviews', () => {
    const listing: EtsyApiListing = {
      listing_id: 777,
      title: 'Digital planner',
      description: 'Printable PDF planner',
      url: 'https://www.etsy.com/listing/777/digital-planner',
      type: 'download',
      price: { amount: 999, divisor: 100, currency_code: 'USD' },
      num_favorers: 21,
      tags: ['planner', 'printable'],
      images: [
        { rank: 2, url_fullxfull: 'https://example.com/second.jpg' },
        { rank: 1, url_fullxfull: 'https://example.com/first.jpg' },
      ],
      videos: [{ video_url: 'https://example.com/video.mp4' }],
      shop: {
        shop_name: 'PlannerStudio',
        review_average: 4.9,
        review_count: 300,
        transaction_sold_count: 1500,
      },
    };

    const mapped = mapApiListing(listing, 0);
    expect(mapped.scrapeResult.productType).toBe('digital');
    expect(mapped.scrapeResult.price.amount).toBe(9.99);
    expect(mapped.scrapeResult.mainImageUrl).toBe('https://example.com/first.jpg');
    expect(mapped.scrapeResult.listingRating).toBeNull();
    expect(mapped.scrapeResult.listingReviewCount).toBeNull();
    expect(mapped.scrapeResult.shopRating).toBe(4.9);
    expect(mapped.scrapeResult.evidence.title.source).toBe('api');
    expect(mapped.scrapeResult.favoritesCount).toBe(21);
  });
});
