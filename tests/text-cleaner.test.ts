import { describe, it, expect } from 'vitest';
import { cleanText, cleanHtml, removeEmojis, extractKeywords } from '../src/normalization/text-cleaner.js';

describe('text-cleaner', () => {
  describe('cleanHtml', () => {
    it('removes HTML tags', () => {
      expect(cleanHtml('<p>Hello <b>world</b></p>')).toBe(' Hello  world  ');
    });

    it('decodes HTML entities', () => {
      expect(cleanHtml('A &amp; B &lt; C &gt; D')).toBe('A & B < C > D');
    });

    it('replaces non-breaking spaces', () => {
      expect(cleanHtml('Hello\u00A0world')).toBe('Hello world');
    });

    it('removes invisible unicode characters', () => {
      expect(cleanHtml('Hello\u200Bworld')).toBe('Helloworld');
    });
  });

  describe('cleanText', () => {
    it('returns raw and cleaned text', () => {
      const result = cleanText('<p>Hello   world</p>');
      expect(result.raw).toBe('<p>Hello   world</p>');
      expect(result.cleaned).toBe('Hello world');
    });

    it('removes marketing noise', () => {
      const result = cleanText('Great product! Add to cart Buy it now Share');
      expect(result.cleaned).not.toContain('Add to cart');
    });

    it('collapses multiple newlines', () => {
      const result = cleanText('Line 1\n\n\n\nLine 2');
      expect(result.cleaned).toBe('Line 1\n\nLine 2');
    });
  });

  describe('removeEmojis', () => {
    it('removes emojis and collapses spaces', () => {
      expect(removeEmojis('Hello 🌟 world ✨')).toBe('Hello world');
    });

    it('preserves regular text', () => {
      expect(removeEmojis('No emojis here')).toBe('No emojis here');
    });
  });

  describe('extractKeywords', () => {
    it('extracts frequent words', () => {
      const keywords = extractKeywords('notion template planner notion template planner notion');
      expect(keywords).toContain('notion');
      expect(keywords).toContain('template');
      expect(keywords).toContain('planner');
    });

    it('filters words shorter than minLength', () => {
      const keywords = extractKeywords('a the an is it to of', 4);
      expect(keywords).toHaveLength(0);
    });

    it('returns up to 20 keywords', () => {
      const longText = Array(30).fill('word').join(' ');
      const keywords = extractKeywords(longText);
      expect(keywords.length).toBeLessThanOrEqual(20);
    });
  });
});
