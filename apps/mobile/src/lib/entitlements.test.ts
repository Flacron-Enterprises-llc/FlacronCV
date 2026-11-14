import { describe, expect, it } from 'vitest';
import { effectivePlanForCopy, isCatalogPaidPlan, planForDisplay } from './entitlements';
import { SubscriptionPlan } from '../types/enums';

const active = (plan: string) =>
  ({ plan, status: 'active', currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString() }) as never;

describe('plan display', () => {
  it('names five-plan subscribers by their real plan', () => {
    expect(planForDisplay(active('starter'))).toBe('starter');
    expect(planForDisplay(active('career_pro'))).toBe('career_pro');
    expect(isCatalogPaidPlan('professional')).toBe(true);
    expect(isCatalogPaidPlan('business')).toBe(true);
  });

  it('keeps legacy subscribers on their legacy plan and copy', () => {
    expect(planForDisplay(active('pro'))).toBe('pro');
    expect(isCatalogPaidPlan('pro')).toBe(false);
    expect(isCatalogPaidPlan('enterprise')).toBe(false);
    expect(effectivePlanForCopy(active('pro'))).toBe(SubscriptionPlan.PRO);
  });

  it('treats no subscription as Free', () => {
    expect(planForDisplay(null)).toBe('free');
    expect(isCatalogPaidPlan('free')).toBe(false);
  });
});
