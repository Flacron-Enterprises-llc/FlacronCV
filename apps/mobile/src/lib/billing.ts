import type {
  UsagePack,
  UsageSummary,
  UsageWarning as CareerUsageWarning,
} from '../../../../packages/career-api-client/src/types';
import {
  hasLiveStorePurchase,
  hasLiveStripeSubscription,
  resolveEffectivePlan,
  type EntitlementSubscription,
} from '../../../../packages/shared-types/src/subscription.entitlements';
import { PLAN_CONFIGS } from '../../../../packages/shared-types/src/subscription.types';
import type { SubscriptionPlan as SharedPlan } from '../../../../packages/shared-types/src/enums';
import { isLegacyPlan } from './plan-catalog';

/**
 * Plain data for Settings → Billing & usage (ported from the website's
 * components/pricing/billing/billing-model.ts): one allowance row per unit
 * (V1 counters and the career metering ledger), the 80/95/100 % warnings,
 * packs and their expiry, and who bills the plan — which decides whether the
 * app may sell a plan at all (never on top of another live subscription).
 */

export type AllowanceSource = 'v1' | 'career';

export interface AllowanceRow {
  /** V1 key (cvs, coverLetters, aiCredits, analyses, exports) or career usage unit. */
  key: string;
  source: AllowanceSource;
  /** Included this period; null = unlimited. 0 = not in the plan. */
  granted: number | null;
  used: number | null;
  /** Included + purchased still available; null = unlimited or unknown. */
  remaining: number | null;
  /** Purchased pack units still available (career units only). */
  packRemaining: number;
  /** Capacity rows count stored items, not monthly operations. */
  capacity: boolean;
}

export type WarningLevel = 80 | 95 | 100;

export interface UsageWarning {
  key: string;
  source: AllowanceSource;
  level: WarningLevel;
  percent: number;
}

/** GET /users/me/usage. The five-plan counters are optional so an older API still renders. */
export interface V1Usage {
  cvsCreated?: number;
  coverLettersCreated?: number;
  aiCreditsUsed?: number;
  aiCreditsLimit?: number;
  exportsThisMonth?: number;
  /** Active (not deleted) CVs / letters — what current-plan capacity counts. */
  storedCvs?: number;
  storedCoverLetters?: number;
  analysesUsed?: number;
  /** Null on legacy plans (their ATS check spends an Engine credit). */
  analysesLimit?: number | null;
}

function finite(limit: number | 'unlimited' | undefined): number | null {
  return typeof limit === 'number' ? limit : null;
}

/**
 * V1 rows for the effective plan. Legacy plans count creations per month;
 * current plans cap STORED documents (capacity) and report the stored count
 * (`storedCvs` / `storedCoverLetters`). When the career ledger meters document
 * credits and analyses (one pool), those V1 rows are left out so the same
 * allowance never shows twice.
 */
export function v1AllowanceRows(plan: string, usage: V1Usage | null | undefined, careerUnits: ReadonlySet<string>): AllowanceRow[] {
  const config = PLAN_CONFIGS[plan as SharedPlan];
  if (!config) return [];
  const limits = config.limits;
  const legacy = config.legacy || isLegacyPlan(plan);
  const rows: AllowanceRow[] = [];
  const row = (key: string, limit: number | 'unlimited' | undefined, used: number | undefined | null, capacity: boolean) => {
    if (limit === undefined) return;
    const granted = finite(limit);
    const usedValue = typeof used === 'number' ? used : null;
    rows.push({
      key,
      source: 'v1',
      granted,
      used: usedValue,
      remaining: granted === null || usedValue === null ? null : Math.max(0, granted - usedValue),
      packRemaining: 0,
      capacity,
    });
  };
  row('cvs', limits.cvs, legacy ? usage?.cvsCreated : usage?.storedCvs, !legacy);
  row('coverLetters', limits.coverLetters, legacy ? usage?.coverLettersCreated : usage?.storedCoverLetters, !legacy);
  if (!careerUnits.has('document_credit')) {
    // The stored ceiling can be lower than the plan's (abuse grant); the server enforces min(stored, plan).
    const stored = usage?.aiCreditsLimit;
    const aiLimit = typeof stored === 'number' && stored >= 0 ? Math.min(stored, limits.aiCredits) : limits.aiCredits;
    row('aiCredits', aiLimit, usage?.aiCreditsUsed, false);
  }
  if (!careerUnits.has('resume_analysis') && !legacy) {
    const limit = typeof usage?.analysesLimit === 'number' ? usage.analysesLimit : limits.analyses;
    row('analyses', limit, usage?.analysesUsed, false);
  }
  row('exports', limits.exports, usage?.exportsThisMonth, false);
  return rows;
}

/** Career ledger rows (career API GET /usage). */
export function careerAllowanceRows(summary: UsageSummary | null | undefined): AllowanceRow[] {
  return (summary?.units ?? []).map((unit) => ({
    key: unit.unit,
    source: 'career' as const,
    granted: unit.includedGranted,
    used: Math.max(0, unit.includedGranted - unit.includedRemaining),
    remaining: unit.includedRemaining + unit.packRemaining,
    packRemaining: unit.packRemaining,
    capacity: false,
  }));
}

/**
 * Warn at 80, 95 and 100 percent of the included allowance. Pack units still
 * available hold the warning back until they run out too; a unit the plan does
 * not include (granted 0) is not a warning. Capacity rows never warn here
 * (creation beyond capacity is refused with its own message).
 */
export function usageWarnings(rows: readonly AllowanceRow[]): UsageWarning[] {
  const warnings: UsageWarning[] = [];
  for (const row of rows) {
    if (row.capacity || row.granted === null || row.used === null) continue;
    if (row.granted <= 0) continue;
    const percent = Math.min(100, Math.floor((row.used / row.granted) * 100));
    if (row.remaining === 0) {
      warnings.push({ key: row.key, source: row.source, level: 100, percent: 100 });
      continue;
    }
    if (row.packRemaining > 0) continue;
    if (percent >= 95) warnings.push({ key: row.key, source: row.source, level: 95, percent });
    else if (percent >= 80) warnings.push({ key: row.key, source: row.source, level: 80, percent });
  }
  return warnings.sort((a, b) => b.level - a.level);
}

/** Server-side notices (career ledger) not marked seen yet — the ids to mark once the banner has shown them. */
export function unseenWarningIds(summary: UsageSummary | null | undefined): string[] {
  const list: CareerUsageWarning[] = summary?.warnings ?? [];
  return list.filter((w) => !w.seenAt && typeof w.id === 'string' && w.id).map((w) => w.id);
}

/** Purchased packs that still hold units, soonest expiry first. */
export function activePacks(summary: UsageSummary | null | undefined): UsagePack[] {
  return (summary?.packs ?? [])
    .filter((pack) => pack.state === 'held' && pack.remainingUnits > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

/** A pack expiring within this many days is flagged. */
export const PACK_EXPIRY_SOON_DAYS = 30;

export function expiresSoon(pack: Pick<UsagePack, 'expiresAt'>, now: Date = new Date()): boolean {
  const at = Date.parse(pack.expiresAt);
  return Number.isFinite(at) && at - now.getTime() <= PACK_EXPIRY_SOON_DAYS * 86_400_000;
}

/** After a downgrade or cancellation, files above the storage limit are kept until `graceUntil`. */
export function storageGrace(summary: UsageSummary | null | undefined): { graceUntil: string; excessBytes: number } | null {
  const storage = summary?.storage;
  return storage?.graceUntil && storage.excessBytes > 0 ? { graceUntil: storage.graceUntil, excessBytes: storage.excessBytes } : null;
}

// ─── Who bills the plan ──────────────────────────────────────────────────────

/**
 * - `none`: Free (or a paid plan whose period ended) — the app may sell a plan.
 * - `store`: an App Store / Google Play subscription is live — change or cancel it in the store.
 * - `website`: a Stripe subscription is live (bought on the website) — managed there; never sold again in the app.
 * - `support`: a paid plan with no live store or Stripe subscription (granted by support).
 */
export type BillingOwner = 'none' | 'store' | 'website' | 'support';

export interface BillingSubscription extends EntitlementSubscription {
  stripeCustomerId?: string | null;
}

export function billingOwner(subscription: BillingSubscription | null | undefined, now: Date = new Date()): BillingOwner {
  if (hasLiveStorePurchase(subscription, now)) return 'store';
  if (hasLiveStripeSubscription(subscription, now)) return 'website';
  return resolveEffectivePlan(subscription, now) === 'free' ? 'none' : 'support';
}

/** Which store bills a store-owned plan (by the id the server stored). */
export function billingStore(subscription: BillingSubscription | null | undefined): 'apple' | 'google' | null {
  if (subscription?.provider === 'apple' || subscription?.originalTransactionId) return 'apple';
  if (subscription?.provider === 'google' || subscription?.purchaseToken) return 'google';
  return null;
}

/**
 * True when a purchase may start in the app. Never on top of a live
 * subscription: a web (Stripe) subscriber would be billed twice, and a store
 * subscriber changes plans in the store's own subscription settings.
 */
export function canPurchaseInApp(subscription: BillingSubscription | null | undefined, now: Date = new Date()): boolean {
  return billingOwner(subscription, now) === 'none';
}
