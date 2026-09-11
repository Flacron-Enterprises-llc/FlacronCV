import { describe, it, expect } from 'vitest';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import { localizedPlanFeatures } from './plan-features';

describe('localizedPlanFeatures', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;

  it('reads counts from PLAN_CONFIGS so display cannot drift from enforcement', () => {
    const free = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    const lines = localizedPlanFeatures(SubscriptionPlan.FREE, t, 'templates');
    expect(lines).toContain(`feat_cvs:${JSON.stringify({ count: free.cvs })}`);
    expect(lines).toContain(`feat_letters:${JSON.stringify({ count: free.coverLetters })}`);
    expect(lines).toContain(`feat_credits:${JSON.stringify({ count: free.aiCredits })}`);
    expect(lines).toContain(`feat_exports:${JSON.stringify({ count: free.exports })}`);
    expect(lines).toContain('feat_pdf');
    expect(lines).not.toContain('feat_priority_support');
  });

  it('uses monthly + unlimited keys for paid plans', () => {
    const pro = PLAN_CONFIGS[SubscriptionPlan.PRO].limits;
    const lines = localizedPlanFeatures(SubscriptionPlan.PRO, t, 'templates');
    expect(lines).toContain(`feat_cvs_monthly:${JSON.stringify({ count: pro.cvs })}`);
    expect(lines).toContain('feat_exports_unlimited');
    expect(lines).toContain('feat_pdf_docx');
    expect(lines).toContain('feat_priority_support');
  });
});
