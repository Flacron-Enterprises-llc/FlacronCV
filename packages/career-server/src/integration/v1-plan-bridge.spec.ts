import { DEFAULT_CAREER_PLAN_MAP, decideCareerAccess, isV1Plan, parseCareerPlanMap, V1_PLANS } from './v1-plan-bridge';
import type { V1AccountSnapshot } from './v1-plan-bridge';

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
