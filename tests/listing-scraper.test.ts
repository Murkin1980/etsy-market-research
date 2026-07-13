import { describe, expect, it } from 'vitest';
import { parseListingHtml } from '../src/scraper/listing-scraper.js';
import type { SearchResultItem } from '../src/types/schemas.js';

const searchItem: SearchResultItem = {
  listingId: '123456789',
  url: 'https://www.etsy.com/listing/123456789/example',
  titlePreview: 'Example listing',
  displayedPrice: '$1,234.56',
  shopName: 'ExampleShop',
  rating: 4.9,
  displayedReviewCount: 321,
  imageUrl: null,
  isAd: false,
  isBestseller: false,
  isPopularNow: false,
  page: 1,
  position: 1,
};

describe('listing scraper parser', () => {
  it('parses thousands separators without reducing the price by 1000x', () => {
    const result = parseListingHtml(
      '<h1>Example listing</h1><div data-buy-box-region><span class="currency-value">$1,234.56</span></div>',
      searchItem,
    );

    expect(result.price.amount).toBe(1234.56);
    expect(result.price.currency).toBe('USD');
  });

  it('preserves search rating and review count as fallbacks', () => {
    const result = parseListingHtml('<h1>Example listing</h1>', searchItem);

    expect(result.listingRating).toBe(4.9);
    expect(result.listingReviewCount).toBe(321);
  });
});
