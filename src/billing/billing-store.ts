import fs from 'fs';
import path from 'path';

export type PlanId = 'trial' | 'pro' | 'studio';
export type UsageKind = 'research' | 'aiAnalysis';
export type QuotaKind = UsageKind | 'maxListings';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number;
  limits: { research: number; aiAnalysis: number; maxListings: number };
}

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  trial: { id: 'trial', name: 'Пробный', monthlyPriceUsd: 0, limits: { research: 5, aiAnalysis: 5, maxListings: 40 } },
  pro: { id: 'pro', name: 'Pro', monthlyPriceUsd: 19, limits: { research: 60, aiAnalysis: 120, maxListings: 150 } },
  studio: { id: 'studio', name: 'Studio', monthlyPriceUsd: 49, limits: { research: 250, aiAnalysis: 500, maxListings: 500 } },
};

interface SubscriptionRecord {
  accountId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  provider: 'trial' | 'manual' | 'paddle';
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

interface UsageRecord {
  accountId: string;
  period: string;
  research: number;
  aiAnalysis: number;
}

interface BillingDatabase {
  version: 1;
  subscriptions: SubscriptionRecord[];
  usage: UsageRecord[];
  processedEvents: string[];
}

export interface BillingStatus {
  plan: PlanDefinition;
  subscription: Omit<SubscriptionRecord, 'accountId'>;
  usage: { period: string; research: number; aiAnalysis: number };
  remaining: { research: number; aiAnalysis: number };
}

export class QuotaExceededError extends Error {
  constructor(public readonly kind: QuotaKind, public readonly limit: number) {
    super(kind === 'maxListings'
      ? `This plan allows at most ${limit} listings per research`
      : kind === 'research' ? 'Monthly research limit reached' : 'Monthly AI analysis limit reached');
    this.name = 'QuotaExceededError';
  }
}

function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function isPlanId(value: string): value is PlanId {
  return value === 'trial' || value === 'pro' || value === 'studio';
}

export class BillingStore {
  private database: BillingDatabase;

  constructor(private readonly filePath: string) {
    this.database = this.load();
  }

  status(accountId: string): BillingStatus {
    const subscription = this.subscription(accountId);
    const usage = this.usage(accountId);
    const plan = PLAN_CATALOG[subscription.planId];
    return {
      plan,
      subscription: {
        planId: subscription.planId,
        status: subscription.status,
        provider: subscription.provider,
        providerCustomerId: subscription.providerCustomerId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        updatedAt: subscription.updatedAt,
      },
      usage: { period: usage.period, research: usage.research, aiAnalysis: usage.aiAnalysis },
      remaining: {
        research: Math.max(0, plan.limits.research - usage.research),
        aiAnalysis: Math.max(0, plan.limits.aiAnalysis - usage.aiAnalysis),
      },
    };
  }

  assertResearchAllowed(accountId: string, maxListings: number): void {
    const status = this.status(accountId);
    if (maxListings > status.plan.limits.maxListings) {
      throw new QuotaExceededError('maxListings', status.plan.limits.maxListings);
    }
    if (status.remaining.research < 1) throw new QuotaExceededError('research', status.plan.limits.research);
  }

  consume(accountId: string, kind: UsageKind): BillingStatus {
    const status = this.status(accountId);
    if (status.remaining[kind === 'research' ? 'research' : 'aiAnalysis'] < 1) {
      throw new QuotaExceededError(kind, status.plan.limits[kind]);
    }
    const usage = this.usage(accountId);
    usage[kind] += 1;
    this.save();
    return this.status(accountId);
  }

  refund(accountId: string, kind: UsageKind): void {
    const usage = this.usage(accountId);
    usage[kind] = Math.max(0, usage[kind] - 1);
    this.save();
  }

  setPlan(accountId: string, planId: PlanId, provider: 'manual' | 'paddle' = 'manual'): BillingStatus {
    const subscription = this.subscription(accountId);
    subscription.planId = planId;
    subscription.status = planId === 'trial' ? 'trialing' : 'active';
    subscription.provider = planId === 'trial' ? 'trial' : provider;
    subscription.updatedAt = new Date().toISOString();
    if (provider !== 'paddle') {
      subscription.providerCustomerId = null;
      subscription.providerSubscriptionId = null;
      subscription.currentPeriodEnd = null;
    }
    this.save();
    return this.status(accountId);
  }

  applyPaddleSubscription(input: {
    eventId: string;
    accountId: string;
    planId: PlanId;
    status: SubscriptionStatus;
    customerId?: string | null;
    subscriptionId?: string | null;
    currentPeriodEnd?: string | null;
  }): boolean {
    if (this.database.processedEvents.includes(input.eventId)) return false;
    const subscription = this.subscription(input.accountId);
    subscription.planId = input.status === 'canceled' ? 'trial' : input.planId;
    subscription.status = input.status;
    subscription.provider = input.status === 'canceled' ? 'trial' : 'paddle';
    subscription.providerCustomerId = input.customerId ?? subscription.providerCustomerId;
    subscription.providerSubscriptionId = input.subscriptionId ?? subscription.providerSubscriptionId;
    subscription.currentPeriodEnd = input.currentPeriodEnd ?? null;
    subscription.updatedAt = new Date().toISOString();
    this.database.processedEvents.push(input.eventId);
    this.database.processedEvents = this.database.processedEvents.slice(-1_000);
    this.save();
    return true;
  }

  private subscription(accountId: string): SubscriptionRecord {
    let subscription = this.database.subscriptions.find((candidate) => candidate.accountId === accountId);
    if (!subscription) {
      subscription = {
        accountId,
        planId: 'trial',
        status: 'trialing',
        provider: 'trial',
        providerCustomerId: null,
        providerSubscriptionId: null,
        currentPeriodEnd: null,
        updatedAt: new Date().toISOString(),
      };
      this.database.subscriptions.push(subscription);
      this.save();
    }
    return subscription;
  }

  private usage(accountId: string): UsageRecord {
    const period = currentPeriod();
    let usage = this.database.usage.find((candidate) => candidate.accountId === accountId && candidate.period === period);
    if (!usage) {
      usage = { accountId, period, research: 0, aiAnalysis: 0 };
      this.database.usage.push(usage);
      this.database.usage = this.database.usage.filter((candidate) => candidate.period >= period || candidate.accountId !== accountId);
      this.save();
    }
    return usage;
  }

  private load(): BillingDatabase {
    if (!fs.existsSync(this.filePath)) return { version: 1, subscriptions: [], usage: [], processedEvents: [] };
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as BillingDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.subscriptions) || !Array.isArray(parsed.usage) || !Array.isArray(parsed.processedEvents)) {
      throw new Error('Unsupported billing database format');
    }
    for (const subscription of parsed.subscriptions) {
      if (!isPlanId(subscription.planId)) throw new Error('Unsupported billing plan');
    }
    return parsed;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.database, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }
}
