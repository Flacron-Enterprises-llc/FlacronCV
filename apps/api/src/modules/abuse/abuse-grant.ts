import { AbuseGrantStatus, RiskBand, SubscriptionPlan, UserUsage } from '@flacroncv/shared-types';
import { ABUSE_CODE, AbuseCode } from './abuse.exceptions';

export type ConsumptionKind = 'create' | 'ai' | 'export';

export interface ConsumptionDecisionInput {
  enforcementOn: boolean;
  effectivePlan: SubscriptionPlan;
  grantStatus?: AbuseGrantStatus | null;
  cooldownEndsAt?: Date | string | null;
  now: Date;
  /** Auth record. When the lookup failed, skip the email gate (fail open). */
  emailVerified: boolean;
  emailCheckFailed: boolean;
  kind: ConsumptionKind;
}

export interface ConsumptionDecision {
  action: 'allow' | 'deny' | 'promote';
  code?: AbuseCode;
}

export function grantStatusForBand(band: RiskBand): AbuseGrantStatus {
  if (band === 'allow') return 'eligible';
  if (band === 'verify') return 'pending_step_up';
  return 'blocked';
}

export function cooldownEnd(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function cooldownElapsed(
  cooldownEndsAt: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!cooldownEndsAt) return true;
  const ms = typeof cooldownEndsAt === 'string' ? Date.parse(cooldownEndsAt) : cooldownEndsAt.getTime();
  if (!Number.isFinite(ms)) return true;
  return now.getTime() >= ms;
}

/**
 * Paid entitlements skip the grant and email gates. Missing grantStatus is
 * grandfathered (eligible). Ambiguous / unreadable checks fail open.
 */
export function decideNewConsumption(input: ConsumptionDecisionInput): ConsumptionDecision {
  if (!input.enforcementOn) return { action: 'allow' };
  if (input.effectivePlan !== SubscriptionPlan.FREE) return { action: 'allow' };

  if (input.kind !== 'export' && !input.emailCheckFailed && !input.emailVerified) {
    return { action: 'deny', code: ABUSE_CODE.EMAIL_UNVERIFIED };
  }

  const status = input.grantStatus;
  if (!status || status === 'eligible' || status === 'granted') {
    return { action: 'allow' };
  }

  if (status === 'pending_step_up') {
    if (cooldownElapsed(input.cooldownEndsAt, input.now)) {
      return { action: 'promote' };
    }
    return { action: 'deny', code: ABUSE_CODE.STEP_UP };
  }

  return { action: 'deny', code: ABUSE_CODE.GRANT_BLOCKED };
}

/** Existing usage means they already passed the dashboard; keep those files. */
export function hasExistingUsage(usage: Partial<UserUsage> | null | undefined): boolean {
  if (!usage) return false;
  return (
    (usage.cvsCreated ?? 0) > 0 ||
    (usage.coverLettersCreated ?? 0) > 0 ||
    (usage.aiCreditsUsed ?? 0) > 0 ||
    (usage.exportsThisMonth ?? 0) > 0
  );
}
