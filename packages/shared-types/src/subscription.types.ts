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
  /**
   * True for plans kept only for existing customers (Pro, Career Accelerator,
   * Enterprise). Legacy plans keep their original rules exactly: CV / letter
   * caps count creations per calendar month (`usage.cvsCreated`), counters reset
   * on the 1st (`UsageResetService`) and on each paid invoice, ATS checks spend
   * an Engine credit. They are never sold to new customers.
   *
   * Current-catalog plans (legacy=false) use: document CAPACITY (stored, not
   * deleted documents), monthly counters renewed on the billing anniversary
   * (Free: account anniversary), and a separate `analyses` counter for ATS.
   */
  legacy: boolean;
}

export interface PlanLimits {
  /**
   * Legacy plans: CVs created per cycle (`usage.cvsCreated`).
   * Current plans: CAPACITY — résumé versions stored at once (deleted ones do
   * not count). A downgraded account keeps every existing CV; only new
   * creation beyond capacity is refused.
   */
  cvs: number | 'unlimited';
  /** Same semantics as {@link cvs}, for cover letters. */
  coverLetters: number | 'unlimited';
  /** AI document credits per month (summary, bullets, letters, LinkedIn, interview prep). */
  aiCredits: number;
  /**
   * Résumé job analyses per month (the ATS check). Absent on legacy plans,
   * whose ATS check keeps spending an Engine credit as it always did.
   */
  analyses?: number;
  /**
   * Highest template tier this plan may select. A TIER value (free / pro /
   * career_accelerator / enterprise), compared by `planMeetsTier`. Not a
   * boolean — Pro is not Enterprise. Not persisted on user docs.
   */
  templates: SubscriptionPlan;
  exports: number | 'unlimited';
  /** DOCX download. False only on Free. */
  docxExport: boolean;
  /**
   * Exports carry no "Made with FlacronCV" mark. False only on Free. Legacy
   * plans are paid and have never carried a mark, so they stay true.
   */
  removeBranding: boolean;
  /** Job-tracker entries stored at once (not deleted). Legacy plans: unlimited, as before. */
  trackedApplications: number | 'unlimited';
}

/**
 * The template tier a `limits.templates` value stands for. Tier values are the
 * legacy plan ids free / pro / career_accelerator / enterprise; a current plan
 * id passed here resolves through its own `limits.templates`.
 */
export function templateTierOf(plan: SubscriptionPlan | string | null | undefined): SubscriptionPlan {
  switch (plan) {
    case SubscriptionPlan.FREE:
    case SubscriptionPlan.PRO:
    case SubscriptionPlan.CAREER_ACCELERATOR:
    case SubscriptionPlan.ENTERPRISE:
      return plan;
    default: {
      const config = plan ? PLAN_CONFIGS[plan as SubscriptionPlan] : undefined;
      return config ? config.limits.templates : SubscriptionPlan.FREE;
    }
  }
}

/**
 * English pricing-card line for `limits.templates`. Cards are not a `t()`
 * surface. Keep this the only place the template bullet is worded so Pro
 * cannot say "All templates" while `planMeetsTier` refuses Enterprise-tier.
 */
export function templateFeatureLine(maxTier: SubscriptionPlan): string {
  switch (maxTier) {
    case SubscriptionPlan.FREE:
      return 'Free templates only';
    case SubscriptionPlan.PRO:
      // Plan-neutral: "Pro" would now be read as Career Pro. The PRO tier is what
      // Starter, Professional and legacy Pro unlock.
      return 'Premium templates';
    case SubscriptionPlan.CAREER_ACCELERATOR:
      return 'All premium templates';
    case SubscriptionPlan.ENTERPRISE:
      return 'All templates';
    // Current plans are never a tier value; word them by the tier they grant.
    case SubscriptionPlan.STARTER:
    case SubscriptionPlan.PROFESSIONAL:
      return templateFeatureLine(SubscriptionPlan.PRO);
    case SubscriptionPlan.CAREER_PRO:
    case SubscriptionPlan.BUSINESS:
      return templateFeatureLine(SubscriptionPlan.ENTERPRISE);
    default: {
      const _exhaustive: never = maxTier;
      return _exhaustive;
    }
  }
}

// ─── Current catalog (five plans) ────────────────────────────────────────────
//
// Prices and allowances are the career catalog's
// (`packages/career-shared/src/catalog.ts` PLANS / ALLOWANCES, catalog
// 2026-10-10). This package compiles to CommonJS and cannot import that ESM
// source package, so the figures are restated here and
// `apps/web/src/lib/plan-catalog-parity.test.ts` fails the build if they ever
// differ. Change the career catalog first, then these.
//
// Stripe price ids are NEVER compiled in for these plans: they come only from
// the API's env (STRIPE_PRICE_<PLAN>_MONTHLY / _ANNUAL). Unset → checkout
// answers PLAN_NOT_CONFIGURED and the pricing page shows "Coming soon".
//
// cvs / coverLetters are capacities (résumé versions). Cover-letter capacity
// equal to CV capacity is an ASSUMPTION (the spec sizes résumé versions only).
// Business figures are per owner account; seats are not sold here.

/** Display order of the plans offered to customers. */
export const CURRENT_PLANS: readonly SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.STARTER,
  SubscriptionPlan.PROFESSIONAL,
  SubscriptionPlan.CAREER_PRO,
  SubscriptionPlan.BUSINESS,
];

/** Plans kept only for the customers who already have them. */
export const LEGACY_PLANS: readonly SubscriptionPlan[] = [
  SubscriptionPlan.PRO,
  SubscriptionPlan.CAREER_ACCELERATOR,
  SubscriptionPlan.ENTERPRISE,
];

/** The plan marked "recommended" on pricing surfaces (career `RECOMMENDED_PLAN_ID`). */
export const RECOMMENDED_PLAN = SubscriptionPlan.PROFESSIONAL;

/** Card-required trial on Professional only (career `PLAN_TRIALS`), monthly and annual. */
export const PLAN_TRIAL_DAYS: Partial<Record<SubscriptionPlan, number>> = {
  [SubscriptionPlan.PROFESSIONAL]: 7,
};

function currentPlanFeatures(limits: PlanLimits): string[] {
  const n = (v: number | 'unlimited', one: string, many: string) =>
    v === 'unlimited' ? `Unlimited ${many}` : `${v.toLocaleString('en-US')} ${v === 1 ? one : many}`;
  return [
    n(limits.cvs, 'CV', 'CVs'),
    n(limits.coverLetters, 'Cover Letter', 'Cover Letters'),
    `${limits.aiCredits.toLocaleString('en-US')} Engine Credits/month`,
    `${(limits.analyses ?? 0).toLocaleString('en-US')} Résumé Analyses/month`,
    templateFeatureLine(limits.templates),
    'Unlimited PDF exports',
    limits.docxExport ? 'PDF & DOCX export' : 'PDF export',
    n(limits.trackedApplications, 'tracked application', 'tracked applications'),
  ];
}

const FREE_LIMITS: PlanLimits = {
  cvs: 1,
  coverLetters: 1,
  aiCredits: 3,
  analyses: 3,
  templates: SubscriptionPlan.FREE,
  exports: 'unlimited',
  docxExport: false,
  removeBranding: false,
  trackedApplications: 25,
};

const STARTER_LIMITS: PlanLimits = {
  cvs: 5,
  coverLetters: 5,
  aiCredits: 20,
  analyses: 15,
  templates: SubscriptionPlan.PRO,
  exports: 'unlimited',
  docxExport: true,
  removeBranding: true,
  trackedApplications: 100,
};

const PROFESSIONAL_LIMITS: PlanLimits = {
  cvs: 20,
  coverLetters: 20,
  aiCredits: 60,
  analyses: 60,
  templates: SubscriptionPlan.PRO,
  exports: 'unlimited',
  docxExport: true,
  removeBranding: true,
  trackedApplications: 500,
};

const CAREER_PRO_LIMITS: PlanLimits = {
  cvs: 50,
  coverLetters: 50,
  aiCredits: 150,
  analyses: 150,
  templates: SubscriptionPlan.ENTERPRISE,
  exports: 'unlimited',
  docxExport: true,
  removeBranding: true,
  trackedApplications: 2000,
};

const BUSINESS_LIMITS: PlanLimits = {
  cvs: 20,
  coverLetters: 20,
  aiCredits: 500,
  analyses: 500,
  templates: SubscriptionPlan.ENTERPRISE,
  exports: 'unlimited',
  docxExport: true,
  removeBranding: true,
  trackedApplications: 500,
};

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  [SubscriptionPlan.FREE]: {
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    legacy: false,
    limits: FREE_LIMITS,
    features: currentPlanFeatures(FREE_LIMITS),
  },
  [SubscriptionPlan.STARTER]: {
    name: 'Starter',
    priceMonthly: 21.99,
    priceYearly: 219.9,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    legacy: false,
    limits: STARTER_LIMITS,
    features: currentPlanFeatures(STARTER_LIMITS),
  },
  [SubscriptionPlan.PROFESSIONAL]: {
    name: 'Professional',
    priceMonthly: 38.99,
    priceYearly: 389.9,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    legacy: false,
    limits: PROFESSIONAL_LIMITS,
    features: currentPlanFeatures(PROFESSIONAL_LIMITS),
  },
  [SubscriptionPlan.CAREER_PRO]: {
    name: 'Career Pro',
    priceMonthly: 68.99,
    priceYearly: 689.9,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    legacy: false,
    limits: CAREER_PRO_LIMITS,
    features: currentPlanFeatures(CAREER_PRO_LIMITS),
  },
  [SubscriptionPlan.BUSINESS]: {
    name: 'Business',
    priceMonthly: 208,
    priceYearly: 2080,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    legacy: false,
    limits: BUSINESS_LIMITS,
    features: currentPlanFeatures(BUSINESS_LIMITS),
  },

  // ─── LEGACY (existing customers only — keep every figure and id unchanged) ──
  [SubscriptionPlan.PRO]: {
    name: 'Pro',
    priceMonthly: 29.99,
    // $299.99/year against $359.88 billed monthly — a saving of $59.89 (17%).
    priceYearly: 299.99,
    // These are FALLBACKS for `sk_test_` only. A live secret must set
    // STRIPE_PRO_*_PRICE_ID in env — see PaymentService.resolvePriceId and
    // assertLiveStripePricesConfigured. Do not put live ids here (next account
    // switch repeats "No such price"). Do not empty them either: a non-empty
    // stripePriceIdMonthly is the customer-facing "for sale" pin
    // (isPlanPurchasable / customerFacingPlans). Emptying it hides the plan
    // on pricing, billing, comparison, and JSON-LD.
    stripePriceIdMonthly: 'price_1U0xNhKFLhrvSzkgWFAU2LuD',
    // Verified interval=year, $299.99 USD, active in acct_1HUAchKFLhrvSzkg —
    // see scripts/verify-yearly-prices.mjs.
    stripePriceIdYearly: 'price_1U0xNjKFLhrvSzkgYWyB6I6f',
    legacy: true,
    limits: {
      cvs: 10,
      coverLetters: 20,
      aiCredits: 100,
      templates: SubscriptionPlan.PRO,
      exports: 'unlimited',
      docxExport: true,
      removeBranding: true,
      trackedApplications: 'unlimited',
    },
    features: [
      '10 CVs/month',
      '20 Cover Letters/month',
      '100 Engine Credits/month',
      templateFeatureLine(SubscriptionPlan.PRO),
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
    legacy: true,
    limits: {
      cvs: 25,
      coverLetters: 50,
      aiCredits: 250,
      templates: SubscriptionPlan.CAREER_ACCELERATOR,
      exports: 'unlimited',
      docxExport: true,
      removeBranding: true,
      trackedApplications: 'unlimited',
    },
    features: [
      '25 CVs/month',
      '50 Cover Letters/month',
      '250 Engine Credits/month',
      templateFeatureLine(SubscriptionPlan.CAREER_ACCELERATOR),
      'Unlimited exports',
      'PDF & DOCX export',
      'All Flacron Engine career tools (ATS, Interview Prep, LinkedIn)',
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
    legacy: true,
    limits: {
      cvs: 'unlimited',
      coverLetters: 'unlimited',
      aiCredits: 500,
      templates: SubscriptionPlan.ENTERPRISE,
      exports: 'unlimited',
      docxExport: true,
      removeBranding: true,
      trackedApplications: 'unlimited',
    },
    features: [
      'Unlimited CVs',
      'Unlimited Cover Letters',
      '500 Engine Credits/month',
      templateFeatureLine(SubscriptionPlan.ENTERPRISE),
      'Unlimited exports',
      'PDF & DOCX export',
      'Priority support',
    ],
  },
};

// ─── Plan visibility ─────────────────────────────────────────────────────────
//
// One rule for every customer surface (public pricing, in-app billing, plan
// comparison, JSON-LD offers): customers are offered the five current plans,
// in CURRENT_PLANS order, and never a legacy plan. Whether a paid plan's Stripe
// price is configured is known only to the API (env), so a page asks
// GET /plans for `configured` and shows "Coming soon" for an unconfigured plan
// instead of hiding it. Admin / CRM grant lists every plan, legacy included.

/** True for Pro, Career Accelerator and Enterprise (existing customers only). */
export function isLegacyPlan(plan: SubscriptionPlan | string | null | undefined): boolean {
  const config = plan ? PLAN_CONFIGS[plan as SubscriptionPlan] : undefined;
  return config?.legacy === true;
}

/** Narrow an arbitrary stored string to a known plan id (unknown → null). */
export function asSubscriptionPlan(value: unknown): SubscriptionPlan | null {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAN_CONFIGS, value)
    ? (value as SubscriptionPlan)
    : null;
}

/**
 * True when `plan` is a paid plan offered to new customers (a current-catalog
 * plan other than Free). Legacy plans are never purchasable: the API refuses
 * new checkouts for them. Whether the Stripe price is configured is a separate,
 * server-side question (GET /plans).
 */
export function isPlanPurchasable(plan: SubscriptionPlan): boolean {
  return plan !== SubscriptionPlan.FREE && !!PLAN_CONFIGS[plan] && !isLegacyPlan(plan);
}

/**
 * Plans to render in customer-facing pricing tables, in display order: the
 * five current plans, never a legacy one. Never hard-code a plan list in a
 * page — call this.
 */
export function customerFacingPlans(): SubscriptionPlan[] {
  return [...CURRENT_PLANS];
}

/** Every plan, current first then legacy — for admin / CRM lists and filters. */
export function allPlansForAdmin(): SubscriptionPlan[] {
  return [...CURRENT_PLANS, ...LEGACY_PLANS];
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
 * Before changing an annual price id used in **test** fallbacks, re-run
 *     node apps/api/scripts/verify-yearly-prices.mjs
 * (test secret only). **Live** yearly ids go in STRIPE_PRO_YEARLY_PRICE_ID /
 * STRIPE_ENTERPRISE_YEARLY_PRICE_ID, not in this file.
 *
 * A price id does not encode its billing interval, so a MONTH-interval price
 * sits in `stripePriceIdYearly` perfectly happily and bills twelve times too
 * often. That is not hypothetical: the two ids this file previously carried are
 * named "Pro Yearly" and "Enterprise Yearly" in Stripe and bill $359.99 and
 * $1,199.00 every MONTH — roughly 14× the advertised annual price.
 */
export const YEARLY_BILLING_ENABLED = true;
