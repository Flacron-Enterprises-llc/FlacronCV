import {
  PLAN_CONFIGS,
  SubscriptionPlan,
  isPlanPurchasable,
  customerFacingPlans,
  YEARLY_BILLING_ENABLED,
  yearlySavings,
  yearlySavingsPercent,
  planMeetsTier,
  CV_TEMPLATE_TIER,
  COVER_LETTER_TEMPLATE_TIER,
  templateFeatureLine,
} from '@flacroncv/shared-types';

/**
 * Advertising must match ENFORCEMENT, not another claim.
 *
 * `features[]` vs `limits[]` used to compare two handwritten lists, so Pro
 * could say "All templates" while `limits.templates` said `'all'` and
 * `planMeetsTier` still refused Enterprise-tier catalogue ids. This file
 * asserts against the gates that actually run:
 *   - templates: `planMeetsTier` + `CV_TEMPLATE_TIER` / `COVER_LETTER_TEMPLATE_TIER`
 *   - DOCX: `plan === FREE` in `export.service.ts` `recordClientExport`
 *   - cadence: Free is skipped in `usage-reset.service.ts`; paid numeric caps reset
 *
 * Quantity lines still compare to `limits.*` because those fields are what
 * `cv.service` / `cover-letter.service` / `export.service` / AI credit checks
 * read. That is the enforced cap, not a second slogan.
 */

const PLANS = Object.values(SubscriptionPlan);

/** Pull the leading number out of a feature line, or 'unlimited'. */
function advertised(features: string[], noun: RegExp): number | 'unlimited' | null {
  const line = features.find((f) => noun.test(f));
  if (!line) return null;
  if (/unlimited/i.test(line)) return 'unlimited';
  const m = line.match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function templateLine(plan: SubscriptionPlan): string | undefined {
  return PLAN_CONFIGS[plan].features.find((f) => /templates/i.test(f));
}

function allowanceLine(plan: SubscriptionPlan, noun: RegExp): string | undefined {
  return PLAN_CONFIGS[plan].features.find((f) => noun.test(f));
}

describe('advertised template access matches planMeetsTier', () => {
  it.each(PLANS)('%s — limits.templates is the plan’s own max reachable tier', (plan) => {
    expect(PLAN_CONFIGS[plan].limits.templates).toBe(plan);
  });

  it.each(PLANS)('%s — every built-in CV template', (plan) => {
    const max = PLAN_CONFIGS[plan].limits.templates;
    for (const [id, required] of Object.entries(CV_TEMPLATE_TIER)) {
      expect({ id, advertised: planMeetsTier(max, required) }).toEqual({
        id,
        advertised: planMeetsTier(plan, required),
      });
    }
  });

  it.each(PLANS)('%s — every built-in cover-letter template', (plan) => {
    const max = PLAN_CONFIGS[plan].limits.templates;
    for (const [id, required] of Object.entries(COVER_LETTER_TEMPLATE_TIER)) {
      expect({ id, advertised: planMeetsTier(max, required) }).toEqual({
        id,
        advertised: planMeetsTier(plan, required),
      });
    }
  });

  it.each(PLANS)('%s — pricing-card template line is derived from that tier', (plan) => {
    expect(templateLine(plan)).toBe(templateFeatureLine(PLAN_CONFIGS[plan].limits.templates));
  });

  it('Pro and Career Accelerator are not sold Enterprise-tier templates', () => {
    for (const plan of [SubscriptionPlan.PRO, SubscriptionPlan.CAREER_ACCELERATOR]) {
      expect(planMeetsTier(plan, SubscriptionPlan.ENTERPRISE)).toBe(false);
      expect(PLAN_CONFIGS[plan].features.join(' ')).not.toMatch(/all templates/i);
      for (const [id, required] of Object.entries(CV_TEMPLATE_TIER)) {
        if (required === SubscriptionPlan.ENTERPRISE) {
          expect({ id, granted: planMeetsTier(PLAN_CONFIGS[plan].limits.templates, required) }).toEqual(
            { id, granted: false },
          );
        }
      }
      for (const [id, required] of Object.entries(COVER_LETTER_TEMPLATE_TIER)) {
        if (required === SubscriptionPlan.ENTERPRISE) {
          expect({ id, granted: planMeetsTier(PLAN_CONFIGS[plan].limits.templates, required) }).toEqual(
            { id, granted: false },
          );
        }
      }
    }
  });
});

describe('advertised quantities match enforced caps', () => {
  it.each(PLANS)('%s — CV allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /\bCVs?\b/i)).toBe(PLAN_CONFIGS[plan].limits.cvs);
  });

  it.each(PLANS)('%s — cover-letter allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /cover letters?/i)).toBe(
      PLAN_CONFIGS[plan].limits.coverLetters,
    );
  });

  it.each(PLANS)('%s — AI credit allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /AI credits?/i)).toBe(
      PLAN_CONFIGS[plan].limits.aiCredits,
    );
  });

  it.each(PLANS)('%s — export allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /exports?/i)).toBe(
      PLAN_CONFIGS[plan].limits.exports,
    );
  });
});

describe('DOCX advertising matches the export gate', () => {
  // Same predicate as `export.service.ts` recordClientExport: Free is refused
  // with `docx_requires_paid`; every other plan is allowed.
  it.each(PLANS)('%s', (plan) => {
    const advertisesDocx = /DOCX/i.test(PLAN_CONFIGS[plan].features.join(' '));
    const docxAllowed = plan !== SubscriptionPlan.FREE;
    expect(advertisesDocx).toBe(docxAllowed);
  });
});

describe('cadence advertising matches usage-reset', () => {
  // Free docs are skipped entirely in `usage-reset.service.ts`. Paid numeric
  // caps (CVs, cover letters, AI credits, exports) reset on the 1st.
  const monthlyNouns: { noun: RegExp; cap: (plan: SubscriptionPlan) => number | 'unlimited' }[] = [
    { noun: /\bCVs?\b/i, cap: (p) => PLAN_CONFIGS[p].limits.cvs },
    { noun: /cover letters?/i, cap: (p) => PLAN_CONFIGS[p].limits.coverLetters },
    { noun: /AI credits?/i, cap: (p) => PLAN_CONFIGS[p].limits.aiCredits },
    { noun: /exports?/i, cap: (p) => PLAN_CONFIGS[p].limits.exports },
  ];

  it.each(PLANS)('%s', (plan) => {
    for (const { noun, cap } of monthlyNouns) {
      const line = allowanceLine(plan, noun);
      expect(line).toBeDefined();
      const limit = cap(plan);
      if (plan === SubscriptionPlan.FREE) {
        expect(line).not.toMatch(/\/month/i);
      } else if (limit === 'unlimited') {
        expect(line).not.toMatch(/\/month/i);
      } else {
        expect(line).toMatch(/\/month/i);
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
