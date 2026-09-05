import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';

/** Stripe may put ?success=true on the return URL even when nothing was granted. */
export function isPaidActivationPlan(plan: unknown): boolean {
  return (
    typeof plan === 'string' &&
    plan !== SubscriptionPlan.FREE &&
    Object.prototype.hasOwnProperty.call(PLAN_CONFIGS, plan)
  );
}

/** Activated banner only when verify-session succeeded and returned a paid plan. */
export function shouldClaimCheckoutSuccess(
  verifySucceeded: boolean,
  plan: unknown,
): boolean {
  return verifySucceeded && isPaidActivationPlan(plan);
}
