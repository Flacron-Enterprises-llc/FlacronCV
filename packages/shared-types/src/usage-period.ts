import { SubscriptionPlan } from './enums';
import { PLAN_CONFIGS, PlanLimits } from './subscription.types';
import { EntitlementSubscription, resolveEffectivePlan } from './subscription.entitlements';

/**
 * Monthly allowance windows for the CURRENT plans (Free, Starter,
 * Professional, Career Pro, Business).
 *
 * Credits and analyses renew monthly on the billing anniversary: the day of
 * the month the paid period started (`subscription.currentPeriodStart`, from
 * Stripe). Annual plans are paid upfront but still renew monthly from that
 * same anchor. Free renews on the account anniversary (`createdAt`).
 *
 * The month arithmetic is the career billing ledger's
 * (`packages/career-server/src/billing/periods.ts`), so V1 counters and career
 * allowances roll over at the same instant for the same anchor.
 *
 * LEGACY plans (Pro, Career Accelerator, Enterprise) do not use this: they keep
 * the calendar-month reset (`UsageResetService`) and the reset on each paid
 * invoice, exactly as before. For them {@link currentUsageWindow} is null.
 */

export interface UsageWindow {
  start: Date;
  end: Date;
}

/** A date in any shape a user doc carries once it has been through Firestore / JSON. */
export type DateLike =
  | Date
  | string
  | number
  | { toDate?: () => Date; seconds?: number; _seconds?: number }
  | null
  | undefined;

/** Coerce a Date / Firestore Timestamp / ISO string / epoch millis; null when unusable. */
export function toDateOrNull(value: DateLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    const seconds = typeof value.seconds === 'number' ? value.seconds : value._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

/**
 * Adds calendar months in UTC. The day is clamped to the last day of the
 * target month and counted from the anchor each time, so 31 January gives
 * 28/29 February and then 31 March, not 28 March.
 */
export function addMonthsUtc(anchor: Date, months: number): Date {
  const monthIndex = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** The monthly anniversary window `[start, end)` that contains `at`. */
export function monthlyWindowContaining(anchor: Date, at: Date): UsageWindow {
  let n = (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (at.getUTCMonth() - anchor.getUTCMonth());
  while (addMonthsUtc(anchor, n) > at) n -= 1;
  while (addMonthsUtc(anchor, n + 1) <= at) n += 1;
  return { start: addMonthsUtc(anchor, n), end: addMonthsUtc(anchor, n + 1) };
}

/** The parts of a user doc the window logic reads. Loose on purpose (Firestore shapes). */
export interface UsageSubject {
  createdAt?: DateLike;
  subscription?: (EntitlementSubscription & { currentPeriodStart?: DateLike }) | null;
  usage?: {
    aiCreditsUsed?: number;
    aiCreditsLimit?: number;
    analysesUsed?: number;
    exportsThisMonth?: number;
    usagePeriodStart?: DateLike;
    lastExportReset?: DateLike;
  } | null;
}

/**
 * The anchor monthly windows count from, or null when the effective plan is a
 * legacy plan (calendar resets) or no anchor is known.
 */
export function usageAnchor(user: UsageSubject | null | undefined, now: Date = new Date()): Date | null {
  const plan = resolveEffectivePlan(user?.subscription, now);
  const config = PLAN_CONFIGS[plan];
  if (!config || config.legacy) return null;
  if (plan !== SubscriptionPlan.FREE) {
    const periodStart = toDateOrNull(user?.subscription?.currentPeriodStart);
    if (periodStart) return periodStart;
    // A paid doc written before currentPeriodStart was stored: fall back to the
    // account anniversary rather than never renewing.
  }
  return toDateOrNull(user?.createdAt);
}

/** The window the user's counters belong to right now (null → legacy rules apply). */
export function currentUsageWindow(user: UsageSubject | null | undefined, now: Date = new Date()): UsageWindow | null {
  const anchor = usageAnchor(user, now);
  return anchor ? monthlyWindowContaining(anchor, now) : null;
}

/**
 * True when the stored counters belong to an earlier window and must be read
 * as zero (and rewritten on the next server write). The last reset is
 * `usage.usagePeriodStart`, or for docs that predate it `usage.lastExportReset`
 * (written at account creation and on every reset).
 */
export function isUsageWindowStale(user: UsageSubject | null | undefined, now: Date = new Date()): boolean {
  const window = currentUsageWindow(user, now);
  if (!window) return false;
  const lastReset = toDateOrNull(user?.usage?.usagePeriodStart) ?? toDateOrNull(user?.usage?.lastExportReset);
  return lastReset == null || lastReset.getTime() < window.start.getTime();
}

export interface EffectiveUsage {
  plan: SubscriptionPlan;
  limits: PlanLimits;
  aiCreditsUsed: number;
  /** min(stored limit, plan limit) on legacy plans (unchanged rule); the plan limit on current plans. */
  aiCreditsLimit: number;
  analysesUsed: number;
  /** Null on legacy plans: their ATS check spends an Engine credit instead. */
  analysesLimit: number | null;
  exportsThisMonth: number;
  /** Current window, or null on legacy plans. */
  window: UsageWindow | null;
}

/**
 * What the user has used and may use in the current window, reading stale
 * counters as zero. Pure: the same answer on the server (before a write) and
 * in a client (for display / pre-checks). The server stays the authority.
 */
export function effectiveUsage(
  user: UsageSubject | null | undefined,
  now: Date = new Date(),
): EffectiveUsage {
  const plan = resolveEffectivePlan(user?.subscription, now);
  const config = PLAN_CONFIGS[plan] ?? PLAN_CONFIGS[SubscriptionPlan.FREE];
  const limits = config.limits;
  const stale = isUsageWindowStale(user, now);
  const usage = user?.usage ?? {};
  const counter = (v: unknown) => (stale ? 0 : typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
  const stored = usage.aiCreditsLimit;
  const aiCreditsLimit = config.legacy && typeof stored === 'number' && Number.isFinite(stored)
    ? Math.min(stored, limits.aiCredits)
    : limits.aiCredits;
  return {
    plan,
    limits,
    aiCreditsUsed: counter(usage.aiCreditsUsed),
    aiCreditsLimit,
    analysesUsed: counter(usage.analysesUsed),
    analysesLimit: typeof limits.analyses === 'number' ? limits.analyses : null,
    exportsThisMonth: counter(usage.exportsThisMonth),
    window: currentUsageWindow(user, now),
  };
}
