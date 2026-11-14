import { describe, it, expect } from 'vitest';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import { cheapestPlanForTier, localizedPlanFeatures } from './plan-features';

describe('localizedPlanFeatures', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;

  it('current Free: capacities, monthly credits + analyses, unlimited PDF, branding mark', () => {
    const free = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    const lines = localizedPlanFeatures(SubscriptionPlan.FREE, t, 'templates');
    expect(lines).toContain(`feat_cv_capacity:${JSON.stringify({ count: free.cvs })}`);
    expect(lines).toContain(`feat_letter_capacity:${JSON.stringify({ count: free.coverLetters })}`);
    expect(lines).toContain(`feat_credits_monthly:${JSON.stringify({ count: free.aiCredits })}`);
    expect(lines).toContain(`feat_analyses_monthly:${JSON.stringify({ count: free.analyses })}`);
    expect(lines).toContain(`feat_tracked_apps:${JSON.stringify({ count: free.trackedApplications })}`);
    expect(lines).toContain('feat_exports_pdf_unlimited');
    expect(lines).toContain('feat_pdf');
    expect(lines).toContain('feat_branding_mark');
    expect(lines).not.toContain('feat_pdf_docx');
  });

  it('current paid plans: DOCX, no branding mark', () => {
    const lines = localizedPlanFeatures(SubscriptionPlan.PROFESSIONAL, t, 'templates');
    expect(lines).toContain(`feat_cv_capacity:${JSON.stringify({ count: 20 })}`);
    expect(lines).toContain('feat_pdf_docx');
    expect(lines).not.toContain('feat_branding_mark');
  });

  it('LEGACY Pro keeps its original lines', () => {
    const pro = PLAN_CONFIGS[SubscriptionPlan.PRO].limits;
    const lines = localizedPlanFeatures(SubscriptionPlan.PRO, t, 'templates');
    expect(lines).toContain(`feat_cvs_monthly:${JSON.stringify({ count: pro.cvs })}`);
    expect(lines).toContain('feat_exports_unlimited');
    expect(lines).toContain('feat_pdf_docx');
    expect(lines).toContain('feat_priority_support');
  });

  it('advertises a template tier through the cheapest current plan', () => {
    expect(cheapestPlanForTier(SubscriptionPlan.FREE)).toBe(SubscriptionPlan.FREE);
    expect(cheapestPlanForTier(SubscriptionPlan.PRO)).toBe(SubscriptionPlan.STARTER);
    expect(cheapestPlanForTier(SubscriptionPlan.ENTERPRISE)).toBe(SubscriptionPlan.CAREER_PRO);
  });
});
