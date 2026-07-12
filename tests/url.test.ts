import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  extractListingId,
  isEtsyUrl,
  buildSearchUrl,
  deduplicateByListingId,
} from '../src/normalization/url.js';

describe('url normalization', () => {
  describe('normalizeUrl', () => {
    it('removes tracking parameters', () => {
      const url = 'https://www.etsy.com/listing/123456789?utm_source=test&ref=something';
      const result = normalizeUrl(url);
      expect(result).not.toContain('utm_source');
      expect(result).not.toContain('ref=');
      expect(result).toContain('/listing/123456789');
    });

    it('preserves non-tracking parameters', () => {
      const url = 'https://www.etsy.com/search?q=template&page=2';
      const result = normalizeUrl(url);
      expect(result).toContain('q=template');
      expect(result).toContain('page=2');
    });

    it('removes trailing slash', () => {
      const url = 'https://www.etsy.com/listing/123/';
      const result = normalizeUrl(url);
      expect(result).not.toMatch(/\/$/);
    });
  });

  describe('extractListingId', () => {
    it('extracts ID from listing URL', () => {
      expect(extractListingId('https://www.etsy.com/listing/123456789/title')).toBe('123456789');
    });

    it('returns null for non-listing URL', () => {
      expect(extractListingId('https://www.etsy.com/search?q=template')).toBeNull();
    });
  });

  describe('isEtsyUrl', () => {
    it('returns true for etsy URLs', () => {
      expect(isEtsyUrl('https://www.etsy.com/listing/123')).toBe(true);
      expect(isEtsyUrl('https://etsy.com/listing/123')).toBe(true);
    });

    it('returns false for non-etsy URLs', () => {
      expect(isEtsyUrl('https://www.amazon.com/listing/123')).toBe(false);
    });
  });

  describe('buildSearchUrl', () => {
    it('builds correct search URL', () => {
      const url = buildSearchUrl('notion template', 1, 'USD', 'US', 'en-US');
      expect(url).toContain('etsy.com/search');
      expect(url).toContain('q=notion+template');
      expect(url).toContain('currency_code=USD');
    });

    it('includes page parameter for page > 1', () => {
      const url = buildSearchUrl('test', 2);
      expect(url).toContain('page=2');
    });

    it('omits page parameter for page 1', () => {
      const url = buildSearchUrl('test', 1);
      expect(url).not.toContain('page=');
    });
  });

  describe('deduplicateByListingId', () => {
    it('removes duplicates by listingId', () => {
      const items = [
        { url: 'https://www.etsy.com/listing/123', listingId: '123' },
        { url: 'https://www.etsy.com/listing/456', listingId: '456' },
        { url: 'https://www.etsy.com/listing/123?ref=test', listingId: '123' },
      ];
      const result = deduplicateByListingId(items);
      expect(result).toHaveLength(2);
    });

    it('deduplicates by URL when listingId is null', () => {
      const items = [
        { url: 'https://www.etsy.com/listing/123', listingId: null },
        { url: 'https://www.etsy.com/listing/456', listingId: null },
      ];
      const result = deduplicateByListingId(items);
      expect(result).toHaveLength(2);
    });
  });
});
