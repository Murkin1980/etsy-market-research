import { describe, it, expect } from 'vitest';
import {
  clearExchangeRateCache,
  normalizePrice,
  parseLocalizedNumber,
  parseNumericValue,
  parsePrice,
  resolveExchangeRate,
} from '../src/normalization/currency.js';

describe('currency', () => {
  describe('parsePrice', () => {
    it('parses USD price with $ symbol', () => {
      const result = parsePrice('$12.99');
      expect(result.amount).toBe(12.99);
      expect(result.currency).toBe('USD');
    });

    it('parses EUR price with € symbol', () => {
      const result = parsePrice('€9,50');
      expect(result.amount).toBe(9.5);
      expect(result.currency).toBe('EUR');
    });

    it('parses GBP price with £ symbol', () => {
      const result = parsePrice('£7.99');
      expect(result.amount).toBe(7.99);
      expect(result.currency).toBe('GBP');
    });

    it('parses US$ prefix', () => {
      const result = parsePrice('US$15.00');
      expect(result.amount).toBe(15);
      expect(result.currency).toBe('USD');
    });

    it('parses currency code prefix', () => {
      const result = parsePrice('CAD 25.00');
      expect(result.amount).toBe(25);
      expect(result.currency).toBe('CAD');
    });

    it('returns null amount for empty string', () => {
      const result = parsePrice('');
      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
    });

    it('handles prices with thousand separators', () => {
      const result = parsePrice('$1,234.56');
      expect(result.amount).toBe(1234.56);
    });

    it('handles a whole-dollar price with a thousands separator', () => {
      const result = parsePrice('$1,234');
      expect(result.amount).toBe(1234);
    });

    it('parses European thousands and decimal separators', () => {
      expect(parsePrice('€1.234,56')).toEqual({ amount: 1234.56, currency: 'EUR' });
      expect(parsePrice('1\u202f234,56 EUR')).toEqual({ amount: 1234.56, currency: 'EUR' });
    });
  });

  describe('parseNumericValue', () => {
    it('parses plain numbers', () => {
      expect(parseNumericValue('1234')).toBe(1234);
    });

    it('parses numbers with k/K suffix', () => {
      expect(parseNumericValue('1.5k')).toBe(1500);
      expect(parseNumericValue('12K')).toBe(12000);
    });

    it('parses numbers with comma separators', () => {
      expect(parseNumericValue('1,234')).toBe(1234);
    });

    it('returns null for empty string', () => {
      expect(parseNumericValue('')).toBeNull();
    });

    it('returns null for non-numeric text', () => {
      expect(parseNumericValue('abc')).toBeNull();
    });

    it('parses localized compact review counts', () => {
      expect(parseNumericValue('1,5k')).toBe(1500);
      expect(parseNumericValue('2.4M')).toBe(2_400_000);
      expect(parseLocalizedNumber('12\u202f345,7')).toBe(12345.7);
    });
  });

  describe('normalizePrice', () => {
    it('labels static fallback rates instead of presenting them as live dated rates', async () => {
      clearExchangeRateCache();
      const result = await normalizePrice(
        { amount: 10, currency: 'EUR' },
        { fetchFn: async () => { throw new Error('offline'); } },
      );
      expect(result.amountUsd).toBe(10.9);
      expect(result.currency).toBe('EUR');
      expect(result.exchangeRateSource).toBe('fallback');
      expect(result.exchangeRateDate).toBeNull();
    });

    it('uses a dated live rate first and then the bounded cache', async () => {
      clearExchangeRateCache();
      let calls = 0;
      const fetchFn: typeof fetch = async () => {
        calls += 1;
        return new Response(JSON.stringify({
          result: 'success',
          rates: { USD: 1.2 },
          time_last_update_utc: 'Tue, 14 Jul 2026 00:00:00 +0000',
        }), { status: 200 });
      };
      const options = { fetchFn, now: () => new Date('2026-07-14T01:00:00.000Z') };

      expect(await resolveExchangeRate('EUR', 'USD', options)).toEqual({
        rate: 1.2,
        asOf: '2026-07-14T00:00:00.000Z',
        source: 'live',
      });
      expect(await resolveExchangeRate('EUR', 'USD', options)).toEqual({
        rate: 1.2,
        asOf: '2026-07-14T00:00:00.000Z',
        source: 'cache',
      });
      expect(calls).toBe(1);
    });
  });
});
