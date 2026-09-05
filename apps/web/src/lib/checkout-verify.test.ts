import { describe, it, expect } from 'vitest';
import { SubscriptionPlan } from '@flacroncv/shared-types';
import {
  isPaidActivationPlan,
  shouldClaimCheckoutSuccess,
} from './checkout-verify';

describe('checkout verify banner', () => {
  it('does not claim success when verify-session failed', () => {
    expect(shouldClaimCheckoutSuccess(false, SubscriptionPlan.PRO)).toBe(false);
    expect(shouldClaimCheckoutSuccess(false, undefined)).toBe(false);
  });

  it('does not claim success when verify returned Free or no plan', () => {
    expect(shouldClaimCheckoutSuccess(true, SubscriptionPlan.FREE)).toBe(false);
    expect(shouldClaimCheckoutSuccess(true, undefined)).toBe(false);
    expect(shouldClaimCheckoutSuccess(true, 'not-a-plan')).toBe(false);
  });

  it('claims success only for a successful verify with a paid plan', () => {
    expect(shouldClaimCheckoutSuccess(true, SubscriptionPlan.PRO)).toBe(true);
    expect(shouldClaimCheckoutSuccess(true, SubscriptionPlan.CAREER_ACCELERATOR)).toBe(
      true,
    );
    expect(shouldClaimCheckoutSuccess(true, SubscriptionPlan.ENTERPRISE)).toBe(true);
  });

  it('treats only known non-free plans as paid activations', () => {
    expect(isPaidActivationPlan(SubscriptionPlan.FREE)).toBe(false);
    expect(isPaidActivationPlan(SubscriptionPlan.PRO)).toBe(true);
  });
});
