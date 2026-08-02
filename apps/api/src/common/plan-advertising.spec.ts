import {
  PLAN_CONFIGS,
  SubscriptionPlan,
  isPlanPurchasable,
  customerFacingPlans,
  YEARLY_BILLING_ENABLED,
  yearlySavings,
  yearlySavingsPercent,
} from '@flacroncv/shared-types';

/**
 * The client asked us to guarantee that "usage limits shown publicly exactly
 * match the limits enforced in the backend".
 *
 * Each plan's marketing `features` list is hand-written prose while `limits` is
 * what the server actually enforces, so the two can silently drift — a plan's
 * cap could be raised in `limits` and the pricing page would keep advertising
 * the old number (or worse, the reverse: advertise more than we grant). These
 * tests parse the numbers back out of the advertised copy and assert they agree
 * with the enforced values, so any future edit to one without the other fails
 * CI instead of shipping.
 */

/** Pull the leading number out of a feature line, or 'unlimited'. */
function advertised(features: string[], noun: RegExp): number | 'unlimited' | null {
  const line = features.find((f) => noun.test(f));
  if (!line) return null;
  if (/unlimited/i.test(line)) return 'unlimited';
  const m = line.match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

describe('advertised plan features match enforced limits', () => {
  const plans = Object.values(SubscriptionPlan);

  it.each(plans)('%s — CV allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /\bCVs?\b/i)).toBe(PLAN_CONFIGS[plan].limits.cvs);
  });

  it.each(plans)('%s — cover-letter allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /cover letters?/i)).toBe(
      PLAN_CONFIGS[plan].limits.coverLetters,
    );
  });

  it.each(plans)('%s — AI credit allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /AI credits?/i)).toBe(
      PLAN_CONFIGS[plan].limits.aiCredits,
    );
  });

  it.each(plans)('%s — export allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /exports?/i)).toBe(
      PLAN_CONFIGS[plan].limits.exports,
    );
  });

  it.each(plans)('%s — template access', (plan) => {
    const line = PLAN_CONFIGS[plan].features.find((f) => /templates/i.test(f));
    expect(line).toBeDefined();
    // "Free templates only" ⇔ free_only; anything else must be the 'all' tier.
    const advertisesFreeOnly = /free templates only/i.test(line!);
    expect(advertisesFreeOnly).toBe(PLAN_CONFIGS[plan].limits.templates === 'free_only');
  });

  it('only a paid plan advertises DOCX export', () => {
    for (const plan of plans) {
      if (/DOCX/i.test(PLAN_CONFIGS[plan].features.join(' '))) {
        expect(plan).not.toBe(SubscriptionPlan.FREE);
      }
    }
  });
});

describe('plan visibility follows purchasability', () => {
  it('FREE is always offered even though it has no Stripe price', () => {
    expect(customerFacingPlans()).toContain(SubscriptionPlan.FREE);
    expect(isPlanPurchasable(SubscriptionPlan.FREE)).toBe(false);
  });

  it('never advertises a paid plan that has no Stripe price configured', () => {
    for (const plan of customerFacingPlans()) {
      if (plan === SubscriptionPlan.FREE) continue;
      expect(isPlanPurchasable(plan)).toBe(true);
    }
  });

  it('hides Career Accelerator while its Stripe price is unset', () => {
    // Guards the client-reported inconsistency: the plan appeared on the
    // billing comparison but not on public pricing. Visibility is now one
    // rule, so the two surfaces cannot disagree. When the client configures
    // the real Stripe price this expectation flips deliberately.
    const ca = SubscriptionPlan.CAREER_ACCELERATOR;
    expect(customerFacingPlans().includes(ca)).toBe(isPlanPurchasable(ca));
  });

  it('Pro and Enterprise are both purchasable, so both get a self-serve CTA', () => {
    // The public page previously said "Contact Sales" for Enterprise while the
    // billing page sold it directly. Both are real Stripe prices.
    expect(isPlanPurchasable(SubscriptionPlan.PRO)).toBe(true);
    expect(isPlanPurchasable(SubscriptionPlan.ENTERPRISE)).toBe(true);
  });
});

describe('yearly billing safety guard', () => {
  const ANNUAL_PLANS = [SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];

  // This previously asserted the flag stayed FALSE, because the ids in
  // stripePriceIdYearly billed MONTHLY at roughly the annual amount (~14×
  // overcharge). Real year-interval prices now exist and are configured, so the
  // meaningful assertion is no longer "it is off" but "it is never on without
  // an id to charge with" — covered by the if-and-only-if test below.
  it('never advertises an annual plan it has no price id to sell', () => {
    if (!YEARLY_BILLING_ENABLED) return;
    for (const plan of ANNUAL_PLANS) {
      expect((PLAN_CONFIGS[plan].stripePriceIdYearly ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  // The two must move together. This is what makes the flag safe to flip:
  // whoever turns it on is forced to have supplied the price ids, and whoever
  // supplies the ids is reminded the flag is still off.
  it('is off if and only if an annual price id is missing', () => {
    const allIdsPresent = ANNUAL_PLANS.every(
      (p) => (PLAN_CONFIGS[p].stripePriceIdYearly ?? '').trim().length > 0,
    );
    expect(YEARLY_BILLING_ENABLED).toBe(allIdsPresent);
  });

  it.each(ANNUAL_PLANS)('%s advertises a saving that matches its own prices', (plan) => {
    const c = PLAN_CONFIGS[plan];
    // An annual price must actually be cheaper than 12 monthly payments —
    // otherwise the page advertises a discount that does not exist.
    expect(c.priceYearly).toBeLessThan(c.priceMonthly * 12);
    expect(yearlySavings(plan)).toBeCloseTo(c.priceMonthly * 12 - c.priceYearly, 2);
    expect(yearlySavingsPercent(plan)).toBeGreaterThan(0);
  });

  it('prices the annual plans as published', () => {
    expect(PLAN_CONFIGS[SubscriptionPlan.PRO].priceYearly).toBe(299.99);
    expect(PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].priceYearly).toBe(999.99);
    // ~$60 and ~$200, the figures used in marketing copy.
    expect(yearlySavings(SubscriptionPlan.PRO)).toBeCloseTo(59.89, 2);
    expect(yearlySavings(SubscriptionPlan.ENTERPRISE)).toBeCloseTo(199.89, 2);
  });
});
