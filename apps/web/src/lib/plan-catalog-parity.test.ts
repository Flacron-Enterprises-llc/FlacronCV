import { describe, it, expect } from 'vitest';
import {
  ALLOWANCES,
  PLAN_ORDER,
  PLANS,
  RECOMMENDED_PLAN_ID,
  trialFor,
} from '@flacroncv/career-shared';
import {
  CURRENT_PLANS,
  PLAN_CONFIGS,
  PLAN_TRIAL_DAYS,
  RECOMMENDED_PLAN,
  SubscriptionPlan,
  customerFacingPlans,
} from '@flacroncv/shared-types';

/**
 * V1 PLAN_CONFIGS (CommonJS, cannot import the ESM career catalog) restates the
 * five plans' prices and allowances. This test is the guarantee that the two
 * never disagree: change packages/career-shared/src/catalog.ts first, then
 * PLAN_CONFIGS, or the build fails here.
 */
describe('V1 plan catalog = career catalog', () => {
  it('same plan ids, same order, same recommended plan', () => {
    expect([...CURRENT_PLANS]).toEqual([...PLAN_ORDER]);
    expect(customerFacingPlans()).toEqual([...PLAN_ORDER]);
    expect(RECOMMENDED_PLAN).toBe(RECOMMENDED_PLAN_ID);
  });

  it.each([...PLAN_ORDER])('%s — monthly and annual prices', (id) => {
    const v1 = PLAN_CONFIGS[id as SubscriptionPlan];
    expect(Math.round(v1.priceMonthly * 100)).toBe(PLANS[id].monthlyCents);
    expect(Math.round(v1.priceYearly * 100)).toBe(PLANS[id].annualCents);
  });

  it.each([...PLAN_ORDER])('%s — allowances (résumé versions, credits, analyses, tracked applications, exports)', (id) => {
    const v1 = PLAN_CONFIGS[id as SubscriptionPlan].limits;
    const career = ALLOWANCES[id];
    expect(v1.cvs).toBe(career.resumeVersions ?? 'unlimited');
    expect(v1.aiCredits).toBe(career.documentCredits);
    expect(v1.analyses).toBe(career.resumeAnalyses);
    expect(v1.trackedApplications).toBe(career.trackedApplications ?? 'unlimited');
    expect(v1.docxExport).toBe(career.docxExport);
    expect(v1.removeBranding).toBe(career.removeExportBranding);
    expect(career.pdfExport).toBe(true);
    expect(v1.exports).toBe('unlimited');
  });

  it.each([...PLAN_ORDER])('%s — trial', (id) => {
    expect(PLAN_TRIAL_DAYS[id as SubscriptionPlan] ?? null).toBe(trialFor(id, 'monthly')?.days ?? null);
  });
});
