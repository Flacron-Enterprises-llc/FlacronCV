import { DEFAULT_CAREER_PLAN_MAP, decideCareerAccess, isV1Plan, liveCapacity, parseCareerPlanMap, V1_PLANS } from './v1-plan-bridge';
import type { V1AccountSnapshot, V1CapacitySubscription } from './v1-plan-bridge';

/** Pure plan-map rules (five-plan contract, 2026-11-14). No database. */
describe('V1 → career plan map', () => {
  const account = (plan: V1AccountSnapshot['plan']): V1AccountSnapshot => ({ uid: `u-${plan}`, plan, active: true });

  it('knows every V1 plan id, current and legacy', () => {
    for (const plan of ['free', 'starter', 'professional', 'career_pro', 'business', 'pro', 'career_accelerator', 'enterprise']) {
      expect(isV1Plan(plan)).toBe(true);
    }
    expect(isV1Plan('platinum')).toBe(false);
    expect([...V1_PLANS].sort()).toEqual(Object.keys(DEFAULT_CAREER_PLAN_MAP).sort());
  });

  it('defaults: same id for current plans, nearest current plan for legacy ones', () => {
    expect(DEFAULT_CAREER_PLAN_MAP).toEqual({
      free: 'free',
      starter: 'starter',
      professional: 'professional',
      career_pro: 'career_pro',
      business: 'business',
      pro: 'starter',
      career_accelerator: 'professional',
      enterprise: 'career_pro',
    });
  });

  it('an unset or empty CAREER_PLAN_MAP is the default map (no longer "none")', () => {
    expect(parseCareerPlanMap(undefined)).toEqual(DEFAULT_CAREER_PLAN_MAP);
    expect(parseCareerPlanMap('')).toEqual(DEFAULT_CAREER_PLAN_MAP);
    expect(parseCareerPlanMap('   ')).toEqual(DEFAULT_CAREER_PLAN_MAP);
  });

  it('env entries override single plans and keep the rest of the default', () => {
    const map = parseCareerPlanMap('free:none,enterprise:business');
    expect(map.free).toBeNull();
    expect(map.enterprise).toBe('business');
    expect(map.pro).toBe('starter');
    expect(map.professional).toBe('professional');
  });

  it('rejects unknown plans on either side', () => {
    expect(() => parseCareerPlanMap('platinum:starter')).toThrow(/unknown V1 plan/);
    expect(() => parseCareerPlanMap('free:gold')).toThrow(/unknown career plan/);
  });

  it('a Free V1 account gets career access on the career Free plan', () => {
    expect(decideCareerAccess(account('free'), parseCareerPlanMap(undefined))).toMatchObject({
      enabled: true,
      v1Plan: 'free',
      careerPlan: 'free',
      source: 'v1_plan_map',
    });
  });

  it.each([
    ['pro', 'starter'],
    ['career_accelerator', 'professional'],
    ['enterprise', 'career_pro'],
    ['business', 'business'],
  ] as const)('legacy/current %s maps to career %s by default', (v1, career) => {
    expect(decideCareerAccess(account(v1), parseCareerPlanMap(undefined))).toMatchObject({ enabled: true, careerPlan: career });
  });

  it('an explicit none still switches a plan off', () => {
    expect(decideCareerAccess(account('free'), parseCareerPlanMap('free:none'))).toMatchObject({
      enabled: false,
      reason: 'plan_not_mapped',
    });
  });
});

/** Which recurring capacity add-ons count now (same paid-period rule as a plan). */
describe('liveCapacity', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const inPeriod = new Date('2026-11-01T00:00:00Z');
  const ended = new Date('2026-10-01T00:00:00Z');
  const sub = (status: string, currentPeriodEnd: Date | null, addonId = 'saved_search_5'): V1CapacitySubscription => ({
    addonId,
    quantity: 2,
    status,
    currentPeriodEnd,
  });
  const live = (s: V1CapacitySubscription) => liveCapacity([s], now).length === 1;

  it('counts an active or trialing add-on inside its period, or with no period end recorded', () => {
    expect(liveCapacity([sub('active', inPeriod)], now)).toEqual([{ addonId: 'saved_search_5', quantity: 2 }]);
    expect(live(sub('trialing', inPeriod))).toBe(true);
    expect(live(sub('active', null))).toBe(true);
    expect(live(sub('active', ended))).toBe(false);
  });

  it('keeps a past_due add-on until its paid period ends, then drops it', () => {
    expect(live(sub('past_due', inPeriod))).toBe(true);
    expect(live(sub('past_due', ended))).toBe(false);
    expect(live(sub('past_due', null))).toBe(false);
    // The period end itself is no longer inside the period.
    expect(liveCapacity([sub('past_due', now)], now)).toEqual([]);
  });

  it('keeps a canceled add-on only until its period ends', () => {
    expect(live(sub('canceled', inPeriod))).toBe(true);
    expect(live(sub('canceled', ended))).toBe(false);
    expect(live(sub('canceled', null))).toBe(false);
  });

  it('never counts incomplete, incomplete_expired, unpaid or an unknown status', () => {
    for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused', 'weird']) {
      expect([status, live(sub(status, inPeriod))]).toEqual([status, false]);
      expect([status, live(sub(status, null))]).toEqual([status, false]);
    }
  });

  it('filters a mixed list in order and accepts a missing list', () => {
    const out = liveCapacity(
      [sub('active', inPeriod, 'a'), sub('incomplete', inPeriod, 'b'), sub('past_due', inPeriod, 'c'), sub('canceled', ended, 'd')],
      now,
    );
    expect(out.map((g) => g.addonId)).toEqual(['a', 'c']);
    expect(liveCapacity(undefined, now)).toEqual([]);
  });
});
