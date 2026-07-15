import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { parsePaddleSubscriptionEvent, verifyPaddleWebhook } from '../src/billing/paddle.js';

describe('Paddle billing integration', () => {
  it('verifies raw request signatures and rejects stale or changed payloads', () => {
    const rawBody = '{"event_id":"evt_1"}';
    const timestamp = 1_700_000_000;
    const secret = 'pdl_ntfset_test';
    const hash = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex');
    const signature = `ts=${timestamp};h1=${hash}`;
    expect(verifyPaddleWebhook(rawBody, signature, secret, timestamp + 2)).toBe(true);
    expect(verifyPaddleWebhook(`${rawBody} `, signature, secret, timestamp + 2)).toBe(false);
    expect(verifyPaddleWebhook(rawBody, signature, secret, timestamp + 10)).toBe(false);
  });

  it('extracts a mapped plan and account from subscription custom data', () => {
    const event = parsePaddleSubscriptionEvent({
      event_id: 'evt_123', event_type: 'subscription.activated',
      data: {
        id: 'sub_123', customer_id: 'ctm_123', status: 'active',
        custom_data: { signal_lab_account_id: 'account-123' },
        current_billing_period: { ends_at: '2026-08-15T00:00:00Z' },
        items: [{ price: { id: 'pri_pro' } }],
      },
    }, { pro: 'pri_pro', studio: 'pri_studio' });
    expect(event).toMatchObject({ eventId: 'evt_123', accountId: 'account-123', planId: 'pro', status: 'active', subscriptionId: 'sub_123' });
  });
});
