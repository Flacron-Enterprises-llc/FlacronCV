import { SubscriptionPlan, SubscriptionStatus, BillingInterval } from './enums';

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
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A slim, non-sensitive summary of a Stripe invoice, for showing the account
 * owner their own billing history. Deliberately exposes only fields that are
 * safe for the customer to see — no raw Stripe customer/payment-method objects.
 */
export interface BillingInvoice {
  id: string;
  /** Human-facing invoice number (e.g. "A1B2C3-0001"); null for some drafts. */
  number: string | null;
  /** Stripe invoice status: draft | open | paid | uncollectible | void. */
  status: string;
  /** Amount actually paid, in the smallest currency unit (e.g. cents). */
  amountPaid: number;
  /** Amount due, in the smallest currency unit. */
  amountDue: number;
  /** ISO-4217 currency code, lower-cased (Stripe convention, e.g. "usd"). */
  currency: string;
  /** Invoice creation time, ISO-8601. */
  created: string;
  /** Hosted Stripe invoice page (view in browser); null if unavailable. */
  hostedInvoiceUrl: string | null;
  /** Direct PDF download link; null if unavailable. */
  invoicePdf: string | null;
}

/**
 * Free-trial length applied to a NEW Pro subscriber's first checkout (Stripe
 * `trial_period_days`). Enterprise never receives a trial. ASSUMPTION (client
 * confirmed 2026-08-18): 7 days, card-required upfront, auto-charges when the
 * trial ends unless cancelled. Set to 0 to disable trials.
 */
export const TRIAL_PERIOD_DAYS = 7;

export interface PlanConfig {
  name: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  limits: PlanLimits;
  features: string[];
}

export interface PlanLimits {
  cvs: number | 'unlimited';
  coverLetters: number | 'unlimited';
  aiCredits: number;
  templates: 'free_only' | 'all';
  exports: number | 'unlimited';
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  [SubscriptionPlan.FREE]: {
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    limits: {
      cvs: 5,
      coverLetters: 1,
      aiCredits: 5,
      templates: 'free_only',
      exports: 2,
    },
    features: [
      '5 CVs',
      '1 Cover Letter',
      '5 AI Credits',
      'Free templates only',
      '2 exports',
      'PDF export',
    ],
  },
  [SubscriptionPlan.PRO]: {
    name: 'Pro',
    priceMonthly: 29.99,
    // $299.99/year against $359.88 billed monthly — a saving of $59.89 (17%).
    priceYearly: 299.99,
    // These are FALLBACKS. STRIPE_PRO_MONTHLY_PRICE_ID / _YEARLY_ in the API's
    // env win when set — see PaymentService.resolvePriceId. A price id belongs
    // to one Stripe account, so it cannot be a constant shared across
    // environments; the previous values here (…AWDS7HwRCx…) were left behind by
    // an account switch and made every checkout fail with "No such price".
    stripePriceIdMonthly: 'price_1U0xNhKFLhrvSzkgWFAU2LuD',
    // Verified interval=year, $299.99 USD, active in acct_1HUAchKFLhrvSzkg —
    // see scripts/verify-yearly-prices.mjs.
    stripePriceIdYearly: 'price_1U0xNjKFLhrvSzkgYWyB6I6f',
    limits: {
      cvs: 10,
      coverLetters: 20,
      aiCredits: 100,
      templates: 'all',
      exports: 'unlimited',
    },
    features: [
      '10 CVs/month',
      '20 Cover Letters/month',
      '100 AI Credits/month',
      'All templates',
      'Unlimited exports',
      'PDF & DOCX export',
      'Priority support',
    ],
  },
  // ── Career Accelerator (4th plan, PDF requirement) ──────────────────────────
  // ASSUMPTIONS (client to confirm/adjust — this whole block is config):
  //  • Positioned between Pro and Enterprise; price $49.99/mo (between $29.99 and
  //    $99.99). priceYearly is a 12× placeholder (yearly billing is disabled
  //    platform-wide until real annual Stripe prices exist).
  //  • Limits chosen to sit above Pro, below Enterprise's "unlimited".
  //  • stripePriceId* are EMPTY on purpose → the billing UI shows the plan but
  //    marks it "Coming soon" (no purchasable checkout) until the client creates
  //    the real Stripe price and sets its id here. This mirrors the yearly-billing
  //    safety guard — no fake price can ever reach checkout.
  [SubscriptionPlan.CAREER_ACCELERATOR]: {
    name: 'Career Accelerator',
    priceMonthly: 49.99,
    priceYearly: 599.88,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    limits: {
      cvs: 25,
      coverLetters: 50,
      aiCredits: 250,
      templates: 'all',
      exports: 'unlimited',
    },
    features: [
      '25 CVs/month',
      '50 Cover Letters/month',
      '250 AI Credits/month',
      'All Pro templates',
      'Unlimited exports',
      'PDF & DOCX export',
      'All AI career tools (ATS, Interview Prep, LinkedIn)',
      'Priority support',
    ],
  },
  [SubscriptionPlan.ENTERPRISE]: {
    name: 'Enterprise',
    priceMonthly: 99.99,
    // $999.99/year against $1,199.88 billed monthly — a saving of $199.89 (17%).
    priceYearly: 999.99,
    // Fallbacks — STRIPE_ENTERPRISE_*_PRICE_ID in the API's env win when set.
    stripePriceIdMonthly: 'price_1U0xNlKFLhrvSzkgl98Q71yw',
    // Verified interval=year, $999.99 USD, active in acct_1HUAchKFLhrvSzkg.
    stripePriceIdYearly: 'price_1U0xNnKFLhrvSzkgSkx7sca7',
    limits: {
      cvs: 'unlimited',
      coverLetters: 'unlimited',
      aiCredits: 500,
      templates: 'all',
      exports: 'unlimited',
    },
    features: [
      'Unlimited CVs',
      'Unlimited Cover Letters',
      '500 AI Credits/month',
      'All templates',
      'Unlimited exports',
      'PDF & DOCX export',
      'Priority support',
    ],
  },
};

// ─── Plan visibility ─────────────────────────────────────────────────────────
//
// The public pricing page and the in-app billing comparison previously each
// decided for themselves which plans to show, and they disagreed: Career
// Accelerator appeared on the billing page (marked "coming soon") but not in
// public pricing, so the same product advertised two different catalogues.
//
// The rule below is the single source of truth for BOTH surfaces:
//
//     a plan is shown to customers if, and only if, they can actually buy it
//
// "Can actually buy it" means it has a real Stripe monthly price configured.
// Career Accelerator is fully built and stays hidden while
// `stripePriceIdMonthly` is empty. Filling that field is the launch pin: the
// plan appears on public pricing, in-app billing, plan comparison, and JSON-LD
// offers together, with no further code change. Do not fill it by accident.
// Admin CRM grant still lists every plan regardless of this rule.

/** True when `plan` has a real Stripe monthly price and can be checked out. */
export function isPlanPurchasable(plan: SubscriptionPlan): boolean {
  return !!PLAN_CONFIGS[plan].stripePriceIdMonthly;
}

/**
 * Plans to render in customer-facing pricing tables, in display order.
 * FREE is always included (it needs no Stripe price); paid plans must be
 * purchasable. Never hard-code a plan list in a page — call this.
 */
export function customerFacingPlans(): SubscriptionPlan[] {
  return [
    SubscriptionPlan.FREE,
    SubscriptionPlan.PRO,
    SubscriptionPlan.CAREER_ACCELERATOR,
    SubscriptionPlan.ENTERPRISE,
  ].filter((p) => p === SubscriptionPlan.FREE || isPlanPurchasable(p));
}

/**
 * What a customer saves per year by paying annually instead of monthly.
 *
 * Derived, never written down twice. A hardcoded "save $60" in the UI is a
 * price claim that silently becomes false the next time someone edits
 * priceMonthly — and an overstated saving on a pricing page is a
 * consumer-protection problem, not a copy bug.
 *
 * Returns 0 for plans with no annual option (free, or not yet priced).
 */
export function yearlySavings(plan: SubscriptionPlan): number {
  const c = PLAN_CONFIGS[plan];
  if (!c?.priceMonthly || !c?.priceYearly) return 0;
  // Currency: round to cents so floating-point noise never reaches the page.
  return Math.max(0, Math.round((c.priceMonthly * 12 - c.priceYearly) * 100) / 100);
}

/** The same saving as a whole-number percentage, for "save 17%" copy. */
export function yearlySavingsPercent(plan: SubscriptionPlan): number {
  const c = PLAN_CONFIGS[plan];
  if (!c?.priceMonthly) return 0;
  const full = c.priceMonthly * 12;
  if (full <= 0) return 0;
  return Math.round((yearlySavings(plan) / full) * 100);
}

/**
 * Whether yearly billing may be offered anywhere in the product.
 *
 * ENABLED. Both `stripePriceIdYearly` values above were confirmed against the
 * Stripe API as interval=`year`, at the advertised amounts, and active.
 *
 * This flag is the SINGLE gate: it drives the pricing-page toggle, the billing
 * page, and `PaymentService.allowedCheckoutPriceIds()`, so the UI and the
 * server can never disagree about whether annual plans are for sale.
 *
 * Before changing an annual price id, re-run:
 *     node apps/api/scripts/verify-yearly-prices.mjs
 *
 * A price id does not encode its billing interval, so a MONTH-interval price
 * sits in `stripePriceIdYearly` perfectly happily and bills twelve times too
 * often. That is not hypothetical: the two ids this file previously carried are
 * named "Pro Yearly" and "Enterprise Yearly" in Stripe and bill $359.99 and
 * $1,199.00 every MONTH — roughly 14× the advertised annual price.
 */
export const YEARLY_BILLING_ENABLED = true;
