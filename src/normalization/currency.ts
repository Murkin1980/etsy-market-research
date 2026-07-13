import type { PriceData } from '../types/listing.js';
import { CURRENCY_SYMBOLS } from '../config/defaults.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('currency');
const KNOWN_CURRENCY_CODES = new Set(Object.keys(CURRENCY_SYMBOLS));

const CURRENCY_PATTERNS: Array<{ regex: RegExp; currency: string }> = [
  { regex: /US\$\s*/u, currency: 'USD' },
  { regex: /CA\$\s*/u, currency: 'CAD' },
  { regex: /AU\$\s*/u, currency: 'AUD' },
  { regex: /NZ\$\s*/u, currency: 'NZD' },
  { regex: /S\$\s*/u, currency: 'SGD' },
  { regex: /HK\$\s*/u, currency: 'HKD' },
  { regex: /NT\$\s*/u, currency: 'TWD' },
  { regex: /MX\$\s*/u, currency: 'MXN' },
  { regex: /R\$\s*/u, currency: 'BRL' },
  { regex: /€/u, currency: 'EUR' },
  { regex: /£/u, currency: 'GBP' },
  { regex: /₹\s*/u, currency: 'INR' },
  { regex: /₽\s*/u, currency: 'RUB' },
  { regex: /₴\s*/u, currency: 'UAH' },
  { regex: /₸\s*/u, currency: 'KZT' },
  { regex: /zł\s*/u, currency: 'PLN' },
  { regex: /CHF\s*/u, currency: 'CHF' },
  { regex: /kr\s*/u, currency: 'SEK' },
  { regex: /¥\s*/u, currency: 'JPY' },
  { regex: /R\s*/u, currency: 'ZAR' },
  { regex: /\$\s*/u, currency: 'USD' },
];

export function parseLocalizedNumber(text: string): number | null {
  let cleaned = text
    .trim()
    .replace(/[\s\u00a0\u202f']/gu, '')
    .replace(/[^\d.,+-]/gu, '');
  if (!cleaned || !/\d/u.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    cleaned = cleaned.replaceAll(thousandsSeparator, '');
    if (decimalSeparator === ',') cleaned = cleaned.replace(',', '.');
  } else {
    const separator = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;
    if (separator) {
      const parts = cleaned.split(separator);
      const fractionalDigits = parts.at(-1)?.length ?? 0;
      const repeatedThousands = parts.length > 2 && parts.slice(1).every((part) => part.length === 3);
      if (repeatedThousands || fractionalDigits === 3) {
        cleaned = parts.join('');
      } else if (separator === ',') {
        cleaned = cleaned.replace(',', '.');
      }
    }
  }

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function parsePrice(text: string): { amount: number | null; currency: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { amount: null, currency: null };

  for (const { regex, currency } of CURRENCY_PATTERNS) {
    const match = trimmed.match(regex);
    if (match && match.index === 0) {
      return {
        amount: parseLocalizedNumber(trimmed.slice((match.index ?? 0) + match[0].length)),
        currency,
      };
    }
  }

  const prefixCode = trimmed.match(/^([A-Z]{3})\s*(.+)$/u);
  if (prefixCode && KNOWN_CURRENCY_CODES.has(prefixCode[1])) {
    return { amount: parseLocalizedNumber(prefixCode[2]), currency: prefixCode[1] };
  }

  const suffixCode = trimmed.match(/^(.+?)\s*([A-Z]{3})$/u);
  if (suffixCode && KNOWN_CURRENCY_CODES.has(suffixCode[2])) {
    return { amount: parseLocalizedNumber(suffixCode[1]), currency: suffixCode[2] };
  }

  return { amount: parseLocalizedNumber(trimmed), currency: null };
}

export function parseNumericValue(text: string): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  const multiplierMatch = trimmed.match(
    /^([\d,.\s\u00a0\u202f]+)\s*(k|m|к|м|тыс\.?|млн\.?)$/iu,
  );
  if (multiplierMatch) {
    const base = parseLocalizedNumber(multiplierMatch[1]);
    if (base === null) return null;
    const suffix = multiplierMatch[2].toLowerCase();
    const multiplier = suffix === 'm' || suffix === 'м' || suffix.startsWith('млн')
      ? 1_000_000
      : 1_000;
    return base * multiplier;
  }
  return parseLocalizedNumber(trimmed);
}

export type ExchangeRateSource = 'identity' | 'live' | 'cache' | 'fallback';

export interface ExchangeRateQuote {
  rate: number;
  asOf: string | null;
  source: ExchangeRateSource;
}

interface CachedRate {
  rate: number;
  asOf: string;
  cachedAtMs: number;
}

export interface ExchangeRateOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  cacheTtlMs?: number;
  timeoutMs?: number;
}

const RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const rateCache = new Map<string, CachedRate>();

const FALLBACK_RATES: Record<string, number> = {
  'EUR-USD': 1.09, 'GBP-USD': 1.27, 'CAD-USD': 0.74, 'AUD-USD': 0.65,
  'JPY-USD': 0.0067, 'CNY-USD': 0.14, 'INR-USD': 0.012, 'BRL-USD': 0.20,
  'SEK-USD': 0.096, 'NOK-USD': 0.094, 'DKK-USD': 0.15, 'PLN-USD': 0.25,
  'CHF-USD': 1.13, 'NZD-USD': 0.60, 'SGD-USD': 0.75, 'HKD-USD': 0.13,
  'KRW-USD': 0.00074, 'TWD-USD': 0.031, 'ZAR-USD': 0.054, 'RUB-USD': 0.011,
  'UAH-USD': 0.024, 'KZT-USD': 0.0020, 'MXN-USD': 0.058, 'THB-USD': 0.028,
};

export function clearExchangeRateCache(): void {
  rateCache.clear();
}

export async function resolveExchangeRate(
  from: string,
  to: string,
  options: ExchangeRateOptions = {},
): Promise<ExchangeRateQuote | null> {
  const now = options.now ?? (() => new Date());
  if (from === to) return { rate: 1, asOf: now().toISOString(), source: 'identity' };

  const cacheKey = `${from}-${to}`;
  const cached = rateCache.get(cacheKey);
  const nowMs = now().getTime();
  if (cached && nowMs - cached.cachedAtMs <= (options.cacheTtlMs ?? RATE_CACHE_TTL_MS)) {
    return { rate: cached.rate, asOf: cached.asOf, source: 'cache' };
  }

  try {
    const fetchFn = options.fetchFn ?? fetch;
    const response = await fetchFn(`https://open.er-api.com/v6/latest/${from}`, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        result?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      };
      const rate = data.rates?.[to];
      if (data.result === 'success' && typeof rate === 'number' && Number.isFinite(rate)) {
        const parsedProviderDate = data.time_last_update_utc
          ? new Date(data.time_last_update_utc)
          : now();
        const asOf = Number.isNaN(parsedProviderDate.getTime())
          ? now().toISOString()
          : parsedProviderDate.toISOString();
        rateCache.set(cacheKey, { rate, asOf, cachedAtMs: nowMs });
        return { rate, asOf, source: 'live' };
      }
    } else {
      log.warn({ from, to, status: response.status }, 'Exchange rate API error');
    }
  } catch (error) {
    log.warn({ from, to, error: (error as Error).message }, 'Failed to fetch exchange rate');
  }

  const directFallback = FALLBACK_RATES[cacheKey];
  if (directFallback !== undefined) {
    return { rate: directFallback, asOf: null, source: 'fallback' };
  }
  const reverseFallback = FALLBACK_RATES[`${to}-${from}`];
  if (reverseFallback !== undefined) {
    return { rate: 1 / reverseFallback, asOf: null, source: 'fallback' };
  }
  return null;
}

export async function fetchExchangeRate(
  from: string,
  to: string,
  options: ExchangeRateOptions = {},
): Promise<number | null> {
  return (await resolveExchangeRate(from, to, options))?.rate ?? null;
}

export async function normalizePrice(
  priceData: Partial<PriceData>,
  rateOptions: ExchangeRateOptions = {},
): Promise<PriceData> {
  const amount = priceData.amount ?? null;
  const currency = priceData.currency ?? null;
  const base = {
    rawText: priceData.rawText ?? null,
    amount,
    currency,
    originalPrice: priceData.originalPrice ?? null,
    discountPercent: priceData.discountPercent ?? null,
  };

  if (amount === null || currency === null) {
    return {
      ...base,
      amountUsd: null,
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
    };
  }

  const quote = await resolveExchangeRate(currency, 'USD', rateOptions);
  if (!quote) {
    log.warn({ amount, currency, targetCurrency: 'USD' }, 'Cannot convert currency, rate unavailable');
    return {
      ...base,
      amountUsd: null,
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
    };
  }

  return {
    ...base,
    amountUsd: Math.round(amount * quote.rate * 100) / 100,
    exchangeRate: quote.rate,
    exchangeRateDate: quote.asOf,
    exchangeRateSource: quote.source,
  };
}
