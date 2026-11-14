import {
  BillingInterval,
  CURRENT_PLANS,
  PLAN_CONFIGS,
  PLAN_TRIAL_DAYS,
  PlanLimits,
  RECOMMENDED_PLAN,
  SubscriptionPlan,
  isLegacyPlan,
} from '@flacroncv/shared-types';

/**
 * Stripe prices for the five-plan catalog come ONLY from the API's env — never
 * from compiled constants. A price id belongs to one Stripe account and mode;
 * baking it in is how the legacy plans once checked out against prices that no
 * longer existed. An unset variable means "not on sale yet": checkout answers
 * 503 PLAN_NOT_CONFIGURED and GET /plans reports `configured: false`.
 */
export const CURRENT_PLAN_PRICE_ENV: Record<
  SubscriptionPlan.STARTER | SubscriptionPlan.PROFESSIONAL | SubscriptionPlan.CAREER_PRO | SubscriptionPlan.BUSINESS,
  { month: string; year: string }
> = {
  [SubscriptionPlan.STARTER]: { month: 'STRIPE_PRICE_STARTER_MONTHLY', year: 'STRIPE_PRICE_STARTER_ANNUAL' },
  [SubscriptionPlan.PROFESSIONAL]: {
    month: 'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
    year: 'STRIPE_PRICE_PROFESSIONAL_ANNUAL',
  },
  [SubscriptionPlan.CAREER_PRO]: { month: 'STRIPE_PRICE_CAREER_PRO_MONTHLY', year: 'STRIPE_PRICE_CAREER_PRO_ANNUAL' },
  [SubscriptionPlan.BUSINESS]: { month: 'STRIPE_PRICE_BUSINESS_MONTHLY', year: 'STRIPE_PRICE_BUSINESS_ANNUAL' },
};

/** `{ starter: { month, year }, … }` — the shape `configuration.ts` exposes as `stripe.planPrices`. */
export type CurrentPlanPrices = Partial<Record<SubscriptionPlan, { month?: string; year?: string }>>;

/** Read the env variables above (trimmed; blank → unset). */
export function currentPlanPricesFromEnv(env: Record<string, string | undefined> = process.env): CurrentPlanPrices {
  const out: CurrentPlanPrices = {};
  for (const [plan, keys] of Object.entries(CURRENT_PLAN_PRICE_ENV)) {
    const month = env[keys.month]?.trim() || undefined;
    const year = env[keys.year]?.trim() || undefined;
    out[plan as SubscriptionPlan] = { month, year };
  }
  return out;
}

/** A paid plan of the current catalog (Starter, Professional, Career Pro, Business). */
export function isCurrentPaidPlan(plan: SubscriptionPlan | string | null | undefined): boolean {
  return !!plan && plan !== SubscriptionPlan.FREE && Object.prototype.hasOwnProperty.call(CURRENT_PLAN_PRICE_ENV, plan);
}

/** The configured price for a current paid plan, or null when unset. */
export function currentPlanPriceId(
  prices: CurrentPlanPrices | undefined,
  plan: SubscriptionPlan,
  interval: BillingInterval,
): string | null {
  if (!isCurrentPaidPlan(plan)) return null;
  const entry = prices?.[plan];
  const id = interval === BillingInterval.YEAR ? entry?.year : entry?.month;
  return id?.trim() || null;
}

/** The current plan a configured price id grants, or null when it is not one of them. */
export function currentPlanForPriceId(prices: CurrentPlanPrices | undefined, priceId: string): SubscriptionPlan | null {
  if (!priceId || !prices) return null;
  for (const [plan, entry] of Object.entries(prices)) {
    if (!isCurrentPaidPlan(plan)) continue;
    if ((entry?.month && entry.month === priceId) || (entry?.year && entry.year === priceId)) {
      return plan as SubscriptionPlan;
    }
  }
  return null;
}

/** One plan in GET /plans. */
export interface PublicPlan {
  id: SubscriptionPlan;
  name: string;
  recommended: boolean;
  currency: 'usd';
  /** USD. Annual is paid upfront; allowances still renew monthly. */
  priceMonthly: number;
  priceAnnual: number;
  limits: PlanLimits;
  /** Card-required free trial on first checkout (Professional only), null otherwise. */
  trialDays: number | null;
  /** True when checkout can be started for that interval right now (price configured). */
  configured: { month: boolean; year: boolean };
  /** Business always offers Contact Sales, self-serve or not. */
  contactSales: boolean;
}

export interface PublicPlanCatalog {
  plans: PublicPlan[];
  /** Same switch the checkout allowlist uses. */
  yearlyBillingEnabled: boolean;
}

/**
 * The public catalog: the five current plans in display order, never a legacy
 * plan. Figures come from PLAN_CONFIGS (which mirror the career catalog);
 * `configured` says whether that interval can be bought right now.
 */
export function publicPlanCatalog(prices: CurrentPlanPrices | undefined, yearlyBillingEnabled: boolean): PublicPlanCatalog {
  return {
    yearlyBillingEnabled,
    plans: CURRENT_PLANS.filter((plan) => !isLegacyPlan(plan)).map((plan) => {
      const config = PLAN_CONFIGS[plan];
      const paid = isCurrentPaidPlan(plan);
      return {
        id: plan,
        name: config.name,
        recommended: plan === RECOMMENDED_PLAN,
        currency: 'usd',
        priceMonthly: config.priceMonthly,
        priceAnnual: config.priceYearly,
        limits: config.limits,
        trialDays: PLAN_TRIAL_DAYS[plan] ?? null,
        configured: {
          month: paid && !!currentPlanPriceId(prices, plan, BillingInterval.MONTH),
          year: paid && yearlyBillingEnabled && !!currentPlanPriceId(prices, plan, BillingInterval.YEAR),
        },
        contactSales: plan === SubscriptionPlan.BUSINESS,
      };
    }),
  };
}
