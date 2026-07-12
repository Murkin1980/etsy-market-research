import type { TextContent } from '../types/listing.js';

const HTML_TAG_REGEX = /<[^>]*>/g;
const NON_BREAKING_SPACE = /\u00A0/g;
const MULTIPLE_SPACES = / {2,}/g;
const MULTIPLE_NEWLINES = /\n{3,}/g;
const INVISIBLE_UNICODE = /[\u200B-\u200F\u2028-\u202F\uFEFF]/g;
const MARKETING_NOISE_PATTERNS = [
  /(?:Add to cart|Buy it now|Share|Favorite|Shop policies|Shipping and returns|Report this item|Image\b).*$/gim,
  /(?:Etsy|1stDibs|Pattern by Etsy|Back to top|Keep in touch|Terms and Privacy|Site).*$/gim,
];

export function cleanHtml(text: string): string {
  return text
    .replace(HTML_TAG_REGEX, ' ')
    .replace(NON_BREAKING_SPACE, ' ')
    .replace(INVISIBLE_UNICODE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"');
}

export function cleanText(raw: string): TextContent {
  let cleaned = cleanHtml(raw);
  cleaned = cleaned.replace(MULTIPLE_SPACES, ' ').trim();
  cleaned = cleaned.replace(MULTIPLE_NEWLINES, '\n\n').trim();

  for (const pattern of MARKETING_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(MULTIPLE_SPACES, ' ').trim();
  cleaned = cleaned.replace(MULTIPLE_NEWLINES, '\n\n').trim();

  return { raw, cleaned };
}

export function removeEmojis(text: string): string {
  const emojiRegex =
    /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Component})/gu;
  return text.replace(emojiRegex, '').replace(MULTIPLE_SPACES, ' ').trim();
}

export function extractKeywords(text: string, minLength: number = 3): string[] {
  const cleaned = removeEmojis(text.toLowerCase());
  const words = cleaned
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= minLength);
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
