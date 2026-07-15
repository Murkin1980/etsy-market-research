import { createHmac, timingSafeEqual } from 'crypto';
import type { PlanId, SubscriptionStatus } from './billing-store.js';

export interface PaddleConfig {
  apiKey: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
  prices: Partial<Record<Exclude<PlanId, 'trial'>, string>>;
}

interface PaddleTransactionResponse {
  data?: { checkout?: { url?: string | null } | null };
  error?: { detail?: string };
}

export function paddleConfigured(config: PaddleConfig): boolean {
  return Boolean(config.apiKey && config.webhookSecret && config.prices.pro && config.prices.studio);
}

export async function createPaddleCheckout(
  config: PaddleConfig,
  input: { accountId: string; planId: Exclude<PlanId, 'trial'> },
): Promise<string> {
  const priceId = config.prices[input.planId];
  if (!config.apiKey || !priceId) throw new Error('Paddle checkout is not configured');
  const baseUrl = config.environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const response = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: { signal_lab_account_id: input.accountId, signal_lab_plan_id: input.planId },
    }),
  });
  const payload = await response.json() as PaddleTransactionResponse;
  const checkoutUrl = payload.data?.checkout?.url;
  if (!response.ok || !checkoutUrl) throw new Error(payload.error?.detail || 'Paddle did not return a checkout URL');
  const parsed = new URL(checkoutUrl);
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'paddle.com' && !parsed.hostname.endsWith('.paddle.com'))) {
    throw new Error('Paddle returned an invalid checkout URL');
  }
  return parsed.toString();
}

export function verifyPaddleWebhook(rawBody: string, signatureHeader: string, secret: string, nowSeconds = Date.now() / 1_000): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;
  const values = signatureHeader.split(';').map((part) => part.split('=', 2));
  const timestamp = values.find(([key]) => key === 'ts')?.[1] ?? '';
  const signatures = values.filter(([key]) => key === 'h1').map(([, value]) => value);
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(nowSeconds - numericTimestamp) > 5) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`, 'utf8').digest('hex');
  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
}

export interface PaddleSubscriptionEvent {
  eventId: string;
  eventType: string;
  accountId: string;
  planId: Exclude<PlanId, 'trial'>;
  status: SubscriptionStatus;
  customerId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
}

export function parsePaddleSubscriptionEvent(input: unknown, prices: PaddleConfig['prices']): PaddleSubscriptionEvent | null {
  if (!input || typeof input !== 'object') return null;
  const event = input as Record<string, unknown>;
  const eventType = typeof event.event_type === 'string' ? event.event_type : '';
  if (!eventType.startsWith('subscription.')) return null;
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {};
  const customData = data.custom_data && typeof data.custom_data === 'object' ? data.custom_data as Record<string, unknown> : {};
  const items = Array.isArray(data.items) ? data.items : [];
  const firstItem = items[0] && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : {};
  const price = firstItem.price && typeof firstItem.price === 'object' ? firstItem.price as Record<string, unknown> : {};
  const priceId = typeof price.id === 'string' ? price.id : '';
  const planId = priceId === prices.pro ? 'pro' : priceId === prices.studio ? 'studio' : null;
  const accountId = typeof customData.signal_lab_account_id === 'string' ? customData.signal_lab_account_id : '';
  const eventId = typeof event.event_id === 'string' ? event.event_id : '';
  if (!eventId || !accountId || !planId) return null;
  const rawStatus = typeof data.status === 'string' ? data.status : '';
  const status: SubscriptionStatus = eventType === 'subscription.canceled' || rawStatus === 'canceled'
    ? 'canceled'
    : rawStatus === 'past_due' ? 'past_due' : 'active';
  const currentBillingPeriod = data.current_billing_period && typeof data.current_billing_period === 'object'
    ? data.current_billing_period as Record<string, unknown> : {};
  return {
    eventId,
    eventType,
    accountId,
    planId,
    status,
    customerId: typeof data.customer_id === 'string' ? data.customer_id : null,
    subscriptionId: typeof data.id === 'string' ? data.id : null,
    currentPeriodEnd: typeof currentBillingPeriod.ends_at === 'string' ? currentBillingPeriod.ends_at : null,
  };
}
