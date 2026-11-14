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
  CURRENT_PLANS,
  LEGACY_PLANS,
  isLegacyPlan,
  allPlansForAdmin,
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
  it.each(LEGACY_PLANS)('LEGACY %s — limits.templates is the plan’s own max reachable tier (unchanged)', (plan) => {
    expect(PLAN_CONFIGS[plan].limits.templates).toBe(plan);
  });

  it('current plans map to template tiers per the contract', () => {
    expect(PLAN_CONFIGS[SubscriptionPlan.FREE].limits.templates).toBe(SubscriptionPlan.FREE);
    expect(PLAN_CONFIGS[SubscriptionPlan.STARTER].limits.templates).toBe(SubscriptionPlan.PRO);
    expect(PLAN_CONFIGS[SubscriptionPlan.PROFESSIONAL].limits.templates).toBe(SubscriptionPlan.PRO);
    expect(PLAN_CONFIGS[SubscriptionPlan.CAREER_PRO].limits.templates).toBe(SubscriptionPlan.ENTERPRISE);
    expect(PLAN_CONFIGS[SubscriptionPlan.BUSINESS].limits.templates).toBe(SubscriptionPlan.ENTERPRISE);
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

  it.each(PLANS)('%s — Engine credit allowance', (plan) => {
    expect(advertised(PLAN_CONFIGS[plan].features, /Engine credits?/i)).toBe(
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
    const docxAllowed = PLAN_CONFIGS[plan].limits.docxExport;
    expect(advertisesDocx).toBe(docxAllowed);
    // Same rule as before the catalog change: only Free is refused DOCX.
    expect(docxAllowed).toBe(plan !== SubscriptionPlan.FREE);
  });
});

describe('cadence advertising matches usage-reset', () => {
  // Free docs are skipped entirely in `usage-reset.service.ts`. Paid numeric
  // caps (CVs, cover letters, Engine credits, exports) reset on the 1st.
  const monthlyNouns: { noun: RegExp; cap: (plan: SubscriptionPlan) => number | 'unlimited' }[] = [
    { noun: /\bCVs?\b/i, cap: (p) => PLAN_CONFIGS[p].limits.cvs },
    { noun: /cover letters?/i, cap: (p) => PLAN_CONFIGS[p].limits.coverLetters },
    { noun: /Engine credits?/i, cap: (p) => PLAN_CONFIGS[p].limits.aiCredits },
    { noun: /exports?/i, cap: (p) => PLAN_CONFIGS[p].limits.exports },
  ];

  it.each(CURRENT_PLANS)('current %s — credits and analyses are monthly; CVs/letters are capacity; exports unlimited', (plan) => {
    const f = PLAN_CONFIGS[plan].features;
    expect(allowanceLine(plan, /Engine credits?/i)).toMatch(/\/month/i);
    expect(allowanceLine(plan, /analys/i)).toMatch(/\/month/i);
    expect(advertised(f, /analys/i)).toBe(PLAN_CONFIGS[plan].limits.analyses);
    expect(allowanceLine(plan, /\bCVs?\b/i)).not.toMatch(/\/month/i);
    expect(allowanceLine(plan, /cover letters?/i)).not.toMatch(/\/month/i);
    expect(advertised(f, /exports?/i)).toBe('unlimited');
    expect(advertised(f, /tracked applications?/i)).toBe(PLAN_CONFIGS[plan].limits.trackedApplications);
  });

  it.each(LEGACY_PLANS)('LEGACY %s (unchanged)', (plan) => {
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

describe('plan visibility (five-plan catalog)', () => {
  it('customers are offered exactly the five current plans, in order', () => {
    expect(customerFacingPlans()).toEqual(['free', 'starter', 'professional', 'career_pro', 'business']);
  });

  it('legacy plans are never offered nor purchasable, but stay configured for existing customers', () => {
    for (const plan of LEGACY_PLANS) {
      expect(isLegacyPlan(plan)).toBe(true);
      expect(customerFacingPlans()).not.toContain(plan);
      expect(isPlanPurchasable(plan)).toBe(false);
    }
    // Existing subscriptions keep renewing against these compiled test ids.
    expect(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly).toBe('price_1U0xNhKFLhrvSzkgWFAU2LuD');
    expect(PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].stripePriceIdMonthly).toBe('price_1U0xNlKFLhrvSzkgl98Q71yw');
  });

  it('legacy limits and prices are unchanged', () => {
    expect(PLAN_CONFIGS[SubscriptionPlan.PRO]).toMatchObject({
      priceMonthly: 29.99,
      limits: { cvs: 10, coverLetters: 20, aiCredits: 100, exports: 'unlimited', templates: SubscriptionPlan.PRO },
    });
    expect(PLAN_CONFIGS[SubscriptionPlan.CAREER_ACCELERATOR]).toMatchObject({
      priceMonthly: 49.99,
      limits: { cvs: 25, coverLetters: 50, aiCredits: 250, exports: 'unlimited' },
    });
    expect(PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE]).toMatchObject({
      priceMonthly: 99.99,
      limits: { cvs: 'unlimited', coverLetters: 'unlimited', aiCredits: 500, exports: 'unlimited' },
    });
    for (const plan of LEGACY_PLANS) {
      expect(PLAN_CONFIGS[plan].limits.analyses).toBeUndefined();
      expect(PLAN_CONFIGS[plan].limits.trackedApplications).toBe('unlimited');
      expect(PLAN_CONFIGS[plan].limits.removeBranding).toBe(true);
    }
  });

  it('paid current plans are purchasable (price configured server-side); Free is not a purchase', () => {
    expect(isPlanPurchasable(SubscriptionPlan.FREE)).toBe(false);
    for (const plan of CURRENT_PLANS.filter((p) => p !== SubscriptionPlan.FREE)) {
      expect(isPlanPurchasable(plan)).toBe(true);
      // Never a compiled price id for the current catalog: env only.
      expect(PLAN_CONFIGS[plan].stripePriceIdMonthly).toBe('');
      expect(PLAN_CONFIGS[plan].stripePriceIdYearly).toBe('');
    }
  });

  it('admin lists show every plan, current then legacy', () => {
    expect(allPlansForAdmin()).toEqual([...CURRENT_PLANS, ...LEGACY_PLANS]);
    expect(new Set(allPlansForAdmin())).toEqual(new Set(PLANS));
  });

  it('only Free carries the export branding mark', () => {
    for (const plan of PLANS) {
      expect(PLAN_CONFIGS[plan].limits.removeBranding).toBe(plan !== SubscriptionPlan.FREE);
    }
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
