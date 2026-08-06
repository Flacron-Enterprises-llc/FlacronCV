import { SubscriptionPlan, SubscriptionStatus } from './enums';

/**
 * Subscription statuses in which a paid plan is *delinquent* — the customer is
 * not currently paid up. Stripe is either retrying a failed payment (past_due),
 * has exhausted its retries (unpaid), or never completed the initial payment
 * (incomplete). Access during these states is only honoured for the period the
 * customer has already paid for (see {@link resolveEffectivePlan}).
 */
export const DELINQUENT_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.INCOMPLETE,
];

/**
 * Statuses in which a paid plan must not outlive the period already paid for.
 *
 * The dunning trio plus CANCELED. CANCELED is not *delinquent* — nobody owes
 * anything — but the subscription has ended, so entitlements must end with it.
 * It was previously absent from the only status check `resolveEffectivePlan`
 * performed, which meant a user doc carrying `plan: PRO, status: CANCELED`
 * resolved to PRO indefinitely. Stripe writes exactly that pairing on
 * `customer.subscription.updated` when a subscription is cancelled, so the
 * cancellation left paid access in place permanently.
 *
 * Kept separate from DELINQUENT_STATUSES because that set also drives the
 * dunning banner, which must keep saying "your payment failed" and not show for
 * a clean cancellation.
 */
export const ACCESS_ENDING_STATUSES: readonly SubscriptionStatus[] = [
  ...DELINQUENT_STATUSES,
  SubscriptionStatus.CANCELED,
];

/**
 * Minimal subscription shape needed to resolve entitlements. Deliberately loose
 * so it accepts both `UserSubscription` (the denormalised user-doc field) and
 * the full `Subscription`, as well as the various runtime shapes `currentPeriodEnd`
 * can take once it has round-tripped through Firestore.
 */
export interface EntitlementSubscription {
  plan?: SubscriptionPlan | null;
  status?: SubscriptionStatus | null;
  currentPeriodEnd?:
    | Date
    | string
    | number
    | { toDate?: () => Date; seconds?: number }
    | null;
}

/**
 * Coerce the many runtime shapes `currentPeriodEnd` can take — a JS Date, a
 * Firestore Timestamp (`.toDate()` / `.seconds`), an ISO string, epoch millis,
 * or null — into a Date, or null if it cannot be understood.
 */
function coerceDate(value: EntitlementSubscription['currentPeriodEnd']): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object') {
    const ts = value as { toDate?: () => Date; seconds?: number };
    if (typeof ts.toDate === 'function') {
      try {
        const d = ts.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
  }
  if (typeof value === 'number') return Number.isNaN(value) ? null : new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Resolve the plan a subscription is *actually entitled to right now*.
 *
 * A paid plan (pro/enterprise) whose status is delinquent (past_due / unpaid /
 * incomplete) keeps its paid entitlements only until the end of the period it
 * has already paid for (`currentPeriodEnd`). Once that date passes — or if it
 * cannot be determined — the effective plan falls back to FREE. Active and
 * trialing subscriptions always resolve to their stored plan.
 *
 * This is the single source of truth for entitlement gating: callers should use
 * `PLAN_CONFIGS[resolveEffectivePlan(subscription)]` rather than reading
 * `subscription.plan` directly, so that a delinquent account cannot keep paid
 * access after its grace period.
 *
 * @param subscription the user's subscription (or the standalone Subscription doc).
 * @param now injectable clock, for testing; defaults to the current time.
 */
export function resolveEffectivePlan(
  subscription: EntitlementSubscription | null | undefined,
  now: Date = new Date(),
): SubscriptionPlan {
  const plan = subscription?.plan ?? SubscriptionPlan.FREE;

  // Free is already the floor — nothing to revoke.
  if (plan === SubscriptionPlan.FREE) return SubscriptionPlan.FREE;

  const status = subscription?.status;
  if (status != null && ACCESS_ENDING_STATUSES.includes(status)) {
    const periodEnd = coerceDate(subscription?.currentPeriodEnd);
    // Grace until period end: honour paid access through the already-paid
    // period, then downgrade. Unknown or expired period end downgrades now
    // (fail safe toward not granting unpaid access).
    if (periodEnd == null || now.getTime() > periodEnd.getTime()) {
      return SubscriptionPlan.FREE;
    }
  }

  return plan;
}
