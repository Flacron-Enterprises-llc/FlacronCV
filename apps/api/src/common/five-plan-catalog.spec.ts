import {
  SubscriptionPlan,
  PLAN_CONFIGS,
  PLAN_RANK,
  isPlanUpgrade,
  planMeetsTier,
  templateTierOf,
  templateFeatureLine,
  canUseCvLayout,
  canUseCoverLetterTemplate,
  CV_TEMPLATE_TIER,
  addMonthsUtc,
  monthlyWindowContaining,
  currentUsageWindow,
  isUsageWindowStale,
  effectiveUsage,
  asSubscriptionPlan,
} from '@flacroncv/shared-types';

const { FREE, STARTER, PROFESSIONAL, CAREER_PRO, BUSINESS, PRO, CAREER_ACCELERATOR, ENTERPRISE } = SubscriptionPlan;

describe('five-plan catalog — template tiers', () => {
  it.each([
    [FREE, FREE],
    [STARTER, PRO],
    [PROFESSIONAL, PRO],
    [CAREER_PRO, ENTERPRISE],
    [BUSINESS, ENTERPRISE],
    // Legacy plans are their own tier, exactly as before.
    [PRO, PRO],
    [CAREER_ACCELERATOR, CAREER_ACCELERATOR],
    [ENTERPRISE, ENTERPRISE],
  ])('%s reaches the %s tier', (plan, tier) => {
    expect(templateTierOf(plan)).toBe(tier);
  });

  it('Starter/Professional get Pro templates but not Enterprise ones', () => {
    for (const plan of [STARTER, PROFESSIONAL]) {
      expect(planMeetsTier(plan, PRO)).toBe(true);
      expect(planMeetsTier(plan, ENTERPRISE)).toBe(false);
      expect(canUseCvLayout('top-bar', plan)).toBe(true);
      expect(canUseCoverLetterTemplate('corporate', plan)).toBe(false);
    }
  });

  it('words the template line without the word Pro (it would read as Career Pro)', () => {
    expect(templateFeatureLine(STARTER)).toBe('Premium templates');
    expect(templateFeatureLine(PROFESSIONAL)).toBe('Premium templates');
    expect(templateFeatureLine(SubscriptionPlan.CAREER_PRO)).toBe('All templates');
    expect(templateFeatureLine(SubscriptionPlan.FREE)).toBe('Free templates only');
    // Legacy plans keep a sensible line for existing customers.
    expect(templateFeatureLine(SubscriptionPlan.PRO)).toBe('Premium templates');
    expect(templateFeatureLine(SubscriptionPlan.CAREER_ACCELERATOR)).toBe('All premium templates');
    for (const plan of Object.values(SubscriptionPlan)) expect(templateFeatureLine(plan)).not.toMatch(/Pro/);
  });

  it('Career Pro/Business get every template', () => {
    for (const plan of [CAREER_PRO, BUSINESS]) {
      for (const tier of Object.values(CV_TEMPLATE_TIER)) expect(planMeetsTier(plan, tier)).toBe(true);
      expect(canUseCoverLetterTemplate('executive', plan)).toBe(true);
    }
  });

  it('Free stays on free templates', () => {
    expect(planMeetsTier(FREE, PRO)).toBe(false);
    expect(canUseCvLayout('slate-gold', FREE)).toBe(false);
  });

  it('legacy tier comparisons are unchanged (Career Accelerator: Pro yes, Enterprise no)', () => {
    expect(planMeetsTier(CAREER_ACCELERATOR, PRO)).toBe(true);
    expect(planMeetsTier(CAREER_ACCELERATOR, ENTERPRISE)).toBe(false);
    expect(planMeetsTier(PRO, CAREER_ACCELERATOR)).toBe(false);
    expect(planMeetsTier(ENTERPRISE, CAREER_ACCELERATOR)).toBe(true);
  });
});

describe('five-plan catalog — commercial order', () => {
  it('places legacy plans between the current ones by price', () => {
    const order = Object.values(SubscriptionPlan).sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
    expect(order).toEqual([FREE, STARTER, PRO, PROFESSIONAL, CAREER_ACCELERATOR, CAREER_PRO, ENTERPRISE, BUSINESS]);
    // Ranks follow monthly price, so "upgrade" means "pays more".
    for (let i = 1; i < order.length; i++) {
      expect(PLAN_CONFIGS[order[i]].priceMonthly).toBeGreaterThan(PLAN_CONFIGS[order[i - 1]].priceMonthly);
    }
    expect(isPlanUpgrade(PRO, PROFESSIONAL)).toBe(true);
    expect(isPlanUpgrade(ENTERPRISE, CAREER_PRO)).toBe(false);
  });

  it('narrows stored strings to known plans only', () => {
    expect(asSubscriptionPlan('career_pro')).toBe(CAREER_PRO);
    expect(asSubscriptionPlan('platinum')).toBeNull();
    expect(asSubscriptionPlan('toString')).toBeNull();
  });
});

describe('usage windows (monthly renewal)', () => {
  const d = (s: string) => new Date(s);

  it('adds months clamping the day (31 Jan → 28/29 Feb → 31 Mar)', () => {
    const anchor = d('2026-01-31T10:00:00Z');
    expect(addMonthsUtc(anchor, 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonthsUtc(anchor, 2).toISOString()).toBe('2026-03-31T10:00:00.000Z');
  });

  it('finds the anniversary window that contains a date', () => {
    const w = monthlyWindowContaining(d('2026-01-15T00:00:00Z'), d('2026-04-20T12:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-05-15T00:00:00.000Z');
  });

  it('Free anchors on the account creation date', () => {
    const user = { createdAt: d('2026-03-10T08:00:00Z'), subscription: { plan: FREE } };
    expect(currentUsageWindow(user, d('2026-11-14T00:00:00Z'))?.start.toISOString()).toBe('2026-11-10T08:00:00.000Z');
  });

  it('a paid current plan anchors on the billing period start, monthly even when annual', () => {
    const user = {
      createdAt: d('2025-01-01T00:00:00Z'),
      subscription: {
        plan: PROFESSIONAL,
        status: 'active' as never,
        currentPeriodStart: d('2026-08-20T00:00:00Z'),
        currentPeriodEnd: d('2027-08-20T00:00:00Z'),
      },
    };
    expect(currentUsageWindow(user, d('2026-11-14T00:00:00Z'))?.start.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('legacy plans have no window (calendar resets stay in charge)', () => {
    const user = { createdAt: d('2025-01-01T00:00:00Z'), subscription: { plan: PRO, status: 'active' as never, currentPeriodEnd: null } };
    expect(currentUsageWindow(user)).toBeNull();
    expect(isUsageWindowStale(user)).toBe(false);
  });

  it('reads counters from an earlier window as zero', () => {
    const user = {
      createdAt: d('2026-01-05T00:00:00Z'),
      subscription: { plan: FREE },
      usage: { aiCreditsUsed: 3, analysesUsed: 2, usagePeriodStart: d('2026-09-05T00:00:00Z') },
    };
    const now = d('2026-11-14T00:00:00Z');
    expect(isUsageWindowStale(user, now)).toBe(true);
    expect(effectiveUsage(user, now)).toMatchObject({ aiCreditsUsed: 0, analysesUsed: 0, aiCreditsLimit: 3, analysesLimit: 3 });
    const fresh = { ...user, usage: { ...user.usage, usagePeriodStart: d('2026-11-05T00:00:00Z') } };
    expect(effectiveUsage(fresh, now)).toMatchObject({ aiCreditsUsed: 3, analysesUsed: 2 });
  });

  it('docs without usagePeriodStart fall back to lastExportReset', () => {
    const user = {
      createdAt: d('2026-01-05T00:00:00Z'),
      subscription: { plan: FREE },
      usage: { aiCreditsUsed: 3, lastExportReset: d('2026-11-06T00:00:00Z') },
    };
    expect(isUsageWindowStale(user, d('2026-11-14T00:00:00Z'))).toBe(false);
  });

  it('legacy credit limit stays min(stored, plan); analyses do not exist on legacy plans', () => {
    const user = { subscription: { plan: PRO, status: 'active' as never, currentPeriodEnd: null }, usage: { aiCreditsLimit: 40 } };
    expect(effectiveUsage(user)).toMatchObject({ aiCreditsLimit: 40, analysesLimit: null });
  });
});
