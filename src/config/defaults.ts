export const APP_VERSION = '1.2.0';
export const SCHEMA_VERSION = '1.2.0';

export const ETSY_BASE_URL = 'https://www.etsy.com';
export const ETSY_SEARCH_URL = `${ETSY_BASE_URL}/search`;

export const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'click_id',
  'click_key',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'li_fat_id',
  'igshid',
  'spref',
]);

export const SALES_SCORE_CONFIG = {
  listingReviewCount: {
    '0-9': 0,
    '10-49': 1,
    '50-199': 2,
    '200+': 3,
  },
  shopSales: {
    '0-499': 0,
    '500-4999': 1,
    '5000+': 2,
  },
  bestsellerBonus: 2,
  popularNowBonus: 1,
  highRatingThreshold: 4.8,
  highRatingBonus: 1,
  topPositionThreshold: 10,
  topPositionBonus: 1,
  levels: {
    low: { min: 0, max: 2 },
    medium: { min: 3, max: 5 },
    high: { min: 6, max: Infinity },
  },
} as const;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'AU$',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  INR: '₹',
  BRL: 'R$',
  MXN: 'MX$',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  CHF: 'CHF',
  NZD: 'NZ$',
  SGD: 'S$',
  HKD: 'HK$',
  THB: '฿',
  TWD: 'NT$',
  ZAR: 'R',
  RUB: '₽',
  UAH: '₴',
  KZT: '₸',
};
