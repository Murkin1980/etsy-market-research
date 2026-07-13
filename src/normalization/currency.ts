import type { PriceData } from '../types/listing.js';
import { CURRENCY_SYMBOLS } from '../config/defaults.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('currency');

const CURRENCY_SYMBOL_MAP: Record<string, string> = {};
for (const [code, symbol] of Object.entries(CURRENCY_SYMBOLS)) {
  CURRENCY_SYMBOL_MAP[symbol] = code;
}

const KNOWN_CURRENCY_CODES = new Set(Object.keys(CURRENCY_SYMBOLS));

const CURRENCY_PATTERNS: Array<{ regex: RegExp; currency: string | null }> = [
  { regex: /US\$\s*/, currency: 'USD' },
  { regex: /CA\$\s*/, currency: 'CAD' },
  { regex: /AU\$\s*/, currency: 'AUD' },
  { regex: /NZ\$\s*/, currency: 'NZD' },
  { regex: /S\$\s*/, currency: 'SGD' },
  { regex: /HK\$\s*/, currency: 'HKD' },
  { regex: /NT\$\s*/, currency: 'TWD' },
  { regex: /MX\$\s*/, currency: 'MXN' },
  { regex: /R\$\s*/, currency: 'BRL' },
  { regex: /\u20AC/, currency: 'EUR' },
  { regex: /\u00A3/, currency: 'GBP' },
  { regex: /¥\s*/, currency: 'JPY' },
  { regex: /₹\s*/, currency: 'INR' },
  { regex: /₽\s*/, currency: 'RUB' },
  { regex: /₴\s*/, currency: 'UAH' },
  { regex: /₸\s*/, currency: 'KZT' },
  { regex: /zł\s*/, currency: 'PLN' },
  { regex: /kr\s*/, currency: 'SEK' },
  { regex: /CHF\s*/, currency: 'CHF' },
  { regex: /R\s*/, currency: 'ZAR' },
  { regex: /\$\s*/, currency: 'USD' },
];

function parseNumber(text: string): number | null {
  const noSpaces = text.replace(/\s/g, '');

  // Heuristic: if both . and , exist, comma is thousand separator (US format: 1,234.56)
  if (noSpaces.includes('.') && noSpaces.includes(',')) {
    const cleaned = noSpaces.replace(/,/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  // If only , exists and it's followed by 1-2 digits at end → decimal separator (EU: 9,50)
  const euMatch = noSpaces.match(/^(.*),(\d{1,2})$/);
  if (euMatch && !noSpaces.includes('.')) {
    const cleaned = euMatch[1] + '.' + euMatch[2];
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  // Otherwise treat , as a thousands separator (1,234 → 1234)
  const cleaned = noSpaces.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseNumberSimple(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parsePrice(text: string): { amount: number | null; currency: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { amount: null, currency: null };

  for (const { regex, currency } of CURRENCY_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      const afterSymbol = trimmed.slice(match[0].length);
      const amount = parseNumber(afterSymbol);
      return { amount, currency };
    }
  }

  const codeMatch = trimmed.match(/^([A-Z]{3})\s*(.+)/);
  if (codeMatch) {
    const currency = codeMatch[1];
    if (KNOWN_CURRENCY_CODES.has(currency)) {
      const amount = parseNumber(codeMatch[2]);
      return { amount, currency };
    }
  }

  const amount = parseNumber(trimmed);
  return { amount, currency: null };
}

export function parseNumericValue(text: string): number | null {
  if (!text) return null;
  const trimmed = text.trim();

  const multiplierMatch = trimmed.match(/^([\d,.\s]+)\s*([kKкКтыТ])$/);
  if (multiplierMatch) {
    const base = parseNumberSimple(multiplierMatch[1]);
    if (base !== null) {
      return base * 1000;
    }
  }

  return parseNumberSimple(trimmed);
}

interface CurrencyRateCache {
  rates: Record<string, number>;
  timestamp: string;
}

let rateCache: CurrencyRateCache | null = null;

const FALLBACK_RATES: Record<string, number> = {
  'EUR-USD': 1.09,
  'GBP-USD': 1.27,
  'CAD-USD': 0.74,
  'AUD-USD': 0.65,
  'JPY-USD': 0.0067,
  'CNY-USD': 0.14,
  'INR-USD': 0.012,
  'BRL-USD': 0.20,
  'SEK-USD': 0.096,
  'NOK-USD': 0.094,
  'DKK-USD': 0.15,
  'PLN-USD': 0.25,
  'CHF-USD': 1.13,
  'NZD-USD': 0.60,
  'SGD-USD': 0.75,
  'HKD-USD': 0.13,
  'KRW-USD': 0.00074,
  'TWD-USD': 0.031,
  'ZAR-USD': 0.054,
  'RUB-USD': 0.011,
  'UAH-USD': 0.024,
  'KZT-USD': 0.0020,
  'MXN-USD': 0.058,
  'THB-USD': 0.028,
};

export async function fetchExchangeRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  const cacheKey = `${from}-${to}`;
  if (rateCache) {
    if (rateCache.rates[cacheKey] !== undefined) {
      return rateCache.rates[cacheKey];
    }
    const reverseKey = `${to}-${from}`;
    if (rateCache.rates[reverseKey] !== undefined) {
      return 1 / rateCache.rates[reverseKey];
    }
  }

  if (FALLBACK_RATES[cacheKey]) {
    log.info({ from, to, rate: FALLBACK_RATES[cacheKey] }, 'Using fallback exchange rate');
    return FALLBACK_RATES[cacheKey];
  }

  const reverseFallback = `${to}-${from}`;
  if (FALLBACK_RATES[reverseFallback]) {
    const rate = 1 / FALLBACK_RATES[reverseFallback];
    log.info({ from, to, rate }, 'Using fallback exchange rate (reversed)');
    return rate;
  }

  try {
    const url = `https://open.er-api.com/v6/latest/${from}`;
    const response = await fetch(url);
    if (!response.ok) {
      log.warn({ from, to, status: response.status }, 'Exchange rate API error');
      return null;
    }
    const data = (await response.json()) as {
      result: string;
      rates?: Record<string, number>;
    };
    if (data.result === 'success' && data.rates && data.rates[to]) {
      const rate = data.rates[to];
      rateCache = {
        rates: { [cacheKey]: rate },
        timestamp: new Date().toISOString(),
      };
      return rate;
    }
  } catch (err) {
    log.warn({ from, to, error: (err as Error).message }, 'Failed to fetch exchange rate');
  }

  return null;
}

export async function normalizePrice(
  priceData: Partial<PriceData>,
): Promise<PriceData> {
  const amount = priceData.amount ?? null;
  const currency = priceData.currency ?? null;

  if (amount === null || currency === null) {
    return {
      rawText: priceData.rawText ?? null,
      amount,
      currency,
      originalPrice: priceData.originalPrice ?? null,
      discountPercent: priceData.discountPercent ?? null,
      amountUsd: null,
      exchangeRate: null,
      exchangeRateDate: null,
    };
  }

  if (currency === 'USD') {
    return {
      rawText: priceData.rawText ?? null,
      amount,
      currency,
      originalPrice: priceData.originalPrice ?? null,
      discountPercent: priceData.discountPercent ?? null,
      amountUsd: amount,
      exchangeRate: 1,
      exchangeRateDate: new Date().toISOString(),
    };
  }

  const rate = await fetchExchangeRate(currency, 'USD');
  if (rate === null) {
    log.warn({ amount, currency, targetCurrency: 'USD' }, 'Cannot convert currency, rate unavailable');
    return {
      rawText: priceData.rawText ?? null,
      amount,
      currency,
      originalPrice: priceData.originalPrice ?? null,
      discountPercent: priceData.discountPercent ?? null,
      amountUsd: null,
      exchangeRate: null,
      exchangeRateDate: null,
    };
  }

  return {
    rawText: priceData.rawText ?? null,
    amount,
    currency,
    originalPrice: priceData.originalPrice ?? null,
    discountPercent: priceData.discountPercent ?? null,
    amountUsd: Math.round(amount * rate * 100) / 100,
    exchangeRate: rate,
    exchangeRateDate: new Date().toISOString(),
  };
}
