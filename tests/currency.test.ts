import { describe, it, expect } from 'vitest';
import { parsePrice, parseNumericValue } from '../src/normalization/currency.js';

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
  });
});
