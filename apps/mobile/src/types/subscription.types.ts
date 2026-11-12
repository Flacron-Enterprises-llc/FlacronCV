import { BillingInterval, SubscriptionPlan, SubscriptionStatus } from './enums';
import {
  PLAN_CONFIGS as SHARED_PLAN_CONFIGS,
  yearlySavingsPercent as sharedYearlySavingsPercent,
  type PlanLimits as SharedPlanLimits,
} from '../../../../packages/shared-types/src/subscription.types';

export type PlanLimits = SharedPlanLimits;

export interface PlanConfig {
  plan: SubscriptionPlan;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  limits: PlanLimits;
  features: string[];
}

/**
 * Wrapper around shared-types `PLAN_CONFIGS`. Every price, limit, feature line
 * and Stripe id is read from there — restating a number here is how this app
 * previously advertised $239.88/yr while the server charged $299.99.
 *
 * This enum has three plans only, so Career Accelerator stays off mobile even
 * if someone fills `stripePriceIdMonthly` in shared-types (that fill is the
 * web launch pin — see `isPlanPurchasable`).
 */
function fromShared(plan: SubscriptionPlan): PlanConfig {
  const shared = SHARED_PLAN_CONFIGS[plan as unknown as keyof typeof SHARED_PLAN_CONFIGS];
  return {
    plan,
    priceMonthly: shared.priceMonthly,
    priceYearly: shared.priceYearly,
    stripePriceIdMonthly: shared.stripePriceIdMonthly || undefined,
    stripePriceIdYearly: shared.stripePriceIdYearly || undefined,
    limits: shared.limits,
    features: shared.features,
  };
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  [SubscriptionPlan.FREE]: fromShared(SubscriptionPlan.FREE),
  [SubscriptionPlan.PRO]: fromShared(SubscriptionPlan.PRO),
  [SubscriptionPlan.ENTERPRISE]: fromShared(SubscriptionPlan.ENTERPRISE),
};

export function yearlySavingsPercent(plan: SubscriptionPlan): number {
  return sharedYearlySavingsPercent(plan as unknown as Parameters<typeof sharedYearlySavingsPercent>[0]);
}

/**
 * One row of `GET /payments/invoices` (API `PaymentService.getInvoices`,
 * shared-types `BillingInvoice`). Amounts are in the smallest currency unit.
 * The two URL fields are returned but the app must not link to them (store
 * rules: no external payment pages) — they are typed only to mirror the API.
 */
export interface BillingInvoice {
  id: string;
  number: string | null;
  /** Stripe status: draft | open | paid | uncollectible | void. */
  status: string;
  amountPaid: number;
  amountDue: number;
  /** Lower-case ISO-4217 code, e.g. "usd". */
  currency: string;
  /** ISO-8601. */
  created: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  plan: SubscriptionPlan;
  priceId: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAt: string | null;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
