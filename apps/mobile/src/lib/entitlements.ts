import {
  resolveEffectivePlan as sharedResolveEffectivePlan,
  hasLiveStorePurchase,
  hasLiveStripeSubscription,
  type EntitlementSubscription,
} from '../../../../packages/shared-types/src/subscription.entitlements';
import { PLAN_CONFIGS as SHARED_PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import { planMeetsTier } from '../../../../packages/shared-types/src/template.tiers';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import { SubscriptionPlan } from '../types/enums';

export type { EntitlementSubscription };
export { hasLiveStorePurchase, hasLiveStripeSubscription };

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
  // Five-plan catalog ids: this copy-only enum has no names for them yet (app
  // phase); use the copy of the legacy plan with the same template reach.
  if (plan === 'career_pro' || plan === 'business') return SubscriptionPlan.ENTERPRISE;
  return SubscriptionPlan.PRO;
}

/**
 * The plan to NAME on screen (read-only display). Unlike
 * {@link effectivePlanForCopy} it keeps the five-plan catalog ids, so a
 * Starter or Career Pro subscriber sees their real plan name instead of the
 * legacy "Pro" / "Enterprise" copy. Legacy subscribers keep their old name.
 */
export function planForDisplay(subscription: EntitlementSubscription | null | undefined): SharedPlan {
  return sharedResolveEffectivePlan(subscription);
}

/**
 * Whether the plan belongs to the five-plan catalog (Starter, Professional,
 * Career Pro, Business). The app sells only the legacy Pro plan in this phase,
 * so these subscribers are not offered an in-app purchase.
 */
export function isCatalogPaidPlan(plan: SharedPlan | string): boolean {
  return plan === 'starter' || plan === 'professional' || plan === 'career_pro' || plan === 'business';
}

/** The shared plan limits (capacity / credits) for the subscriber's real plan. */
export function sharedPlanLimits(subscription: EntitlementSubscription | null | undefined) {
  return SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)].limits;
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
  const config = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)];
  const limit = config.limits.cvs;
  if (limit === 'unlimited') return true;
  // Five-plan catalog: current plans limit STORED CVs (capacity), which the
  // profile does not carry — the API decides (CV_LIMIT_REACHED). Only legacy
  // plans count creations and are pre-checked here.
  if (!config.legacy) return true;
  return cvsCreated < limit;
}

export function canCreateCoverLetter(
  subscription: EntitlementSubscription | null | undefined,
  clCreated: number,
): boolean {
  const config = SHARED_PLAN_CONFIGS[sharedResolveEffectivePlan(subscription)];
  const limit = config.limits.coverLetters;
  if (limit === 'unlimited') return true;
  if (!config.legacy) return true; // capacity: the API decides (see canCreateCV)
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
