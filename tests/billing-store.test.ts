import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BillingStore, QuotaExceededError } from '../src/billing/billing-store.js';

function temporaryFile(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-billing-'));
  return path.join(root, 'billing.json');
}

describe('BillingStore', () => {
  it('creates a trial plan, enforces limits, refunds, and persists upgrades', () => {
    const filePath = temporaryFile();
    const store = new BillingStore(filePath);
    expect(store.status('account-1')).toMatchObject({
      plan: { id: 'trial' }, usage: { research: 0, aiAnalysis: 0 }, remaining: { research: 5, aiAnalysis: 5 },
    });
    expect(() => store.assertResearchAllowed('account-1', 41)).toThrow(QuotaExceededError);
    store.consume('account-1', 'research');
    store.consume('account-1', 'aiAnalysis');
    store.refund('account-1', 'research');
    expect(store.status('account-1').usage).toMatchObject({ research: 0, aiAnalysis: 1 });
    store.setPlan('account-1', 'pro');
    expect(new BillingStore(filePath).status('account-1')).toMatchObject({
      plan: { id: 'pro' }, subscription: { provider: 'manual', status: 'active' }, remaining: { research: 60, aiAnalysis: 119 },
    });
  });

  it('applies Paddle events idempotently and downgrades canceled subscriptions', () => {
    const store = new BillingStore(temporaryFile());
    const event = {
      eventId: 'evt_1', accountId: 'account-2', planId: 'studio' as const, status: 'active' as const,
      customerId: 'ctm_1', subscriptionId: 'sub_1', currentPeriodEnd: '2026-08-01T00:00:00Z',
    };
    expect(store.applyPaddleSubscription(event)).toBe(true);
    expect(store.applyPaddleSubscription(event)).toBe(false);
    expect(store.status('account-2')).toMatchObject({ plan: { id: 'studio' }, subscription: { provider: 'paddle' } });
    store.applyPaddleSubscription({ ...event, eventId: 'evt_2', status: 'canceled' });
    expect(store.status('account-2')).toMatchObject({ plan: { id: 'trial' }, subscription: { status: 'canceled' } });
  });
});
