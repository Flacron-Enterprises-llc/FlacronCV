import {
  resolveEffectivePlan as sharedResolveEffectivePlan,
  type EntitlementSubscription,
} from '../../../../packages/shared-types/src/subscription.entitlements';
import { PLAN_CONFIGS as SHARED_PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import { planMeetsTier } from '../../../../packages/shared-types/src/template.tiers';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import { SubscriptionPlan } from '../types/enums';

export type { EntitlementSubscription };

/**
 * Q15 — same function the API uses (`packages/shared-types` `resolveEffectivePlan`).
 * Do not reimplement the status / period-end / cancel-at-period-end branches here.
 */
export function resolveEffectivePlan(
  subscription: EntitlementSubscription | null | undefined,
): SharedPlan {
  return sharedResolveEffectivePlan(subscription);
}

/**
 * Mobile `PLAN_CONFIGS` / copy helpers only know Free / Pro / Enterprise.
 * Gates use shared configs (including Career Accelerator). This is copy only.
 */
export function effectivePlanForCopy(
  subscription: EntitlementSubscription | null | undefined,
): SubscriptionPlan {
  const plan = sharedResolveEffectivePlan(subscription);
  if (plan === 'enterprise') return SubscriptionPlan.ENTERPRISE;
  if (plan === 'pro') return SubscriptionPlan.PRO;
  if (plan === 'free') return SubscriptionPlan.FREE;
  return SubscriptionPlan.PRO;
}

export function canAccessTemplate(
  subscription: EntitlementSubscription | null | undefined,
  templateTier: SubscriptionPlan | SharedPlan | string,
): boolean {
  return planMeetsTier(
    sharedResolveEffectivePlan(subscription),
    templateTier as SharedPlan,
  );
}

export function canCreateCV(
  subscription: EntitlementSubscription | null | undefined,
  cvsCreated: number,
): boolean {
  const limit = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)].limits.cvs;
  if (limit === 'unlimited') return true;
  return cvsCreated < limit;
}

export function canCreateCoverLetter(
  subscription: EntitlementSubscription | null | undefined,
  clCreated: number,
): boolean {
  const limit = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)].limits.coverLetters;
  if (limit === 'unlimited') return true;
  return clCreated < limit;
}

/**
 * Matches `UsersService.reserveAiCredit`: min(stored aiCreditsLimit, effective plan limit).
 * If the stored ceiling is missing, use the plan limit only (server still decides).
 */
export function canUseAI(
  subscription: EntitlementSubscription | null | undefined,
  aiCreditsUsed: number,
  storedAiCreditsLimit?: number,
): boolean {
  const planLimit = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)].limits.aiCredits;
  const limit =
    typeof storedAiCreditsLimit === 'number'
      ? Math.min(storedAiCreditsLimit, planLimit)
      : planLimit;
  return aiCreditsUsed < limit;
}

export function canExport(
  subscription: EntitlementSubscription | null | undefined,
  exportsThisMonth: number,
): boolean {
  const limit = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)].limits.exports;
  if (limit === 'unlimited') return true;
  return exportsThisMonth < limit;
}
