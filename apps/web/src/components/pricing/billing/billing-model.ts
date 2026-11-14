import type { UsagePack, UsageSummary } from '@flacroncv/career-api-client';
import { PLAN_CONFIGS, type SubscriptionPlan } from '@flacroncv/shared-types';
import { isLegacyPlan } from '../plan-catalog';

/**
 * Plain data for Settings → Billing: one allowance row per unit (V1 counters
 * and the career metering ledger) and the spec §11 usage warnings.
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

/** What `/users/me/usage` returns. Newer counters are optional so an older API still renders. */
export interface V1Usage {
  cvsCreated?: number;
  coverLettersCreated?: number;
  aiCreditsUsed?: number;
  analysesUsed?: number;
  exportsThisMonth?: number;
}

type LooseLimits = {
  cvs?: number | 'unlimited';
  coverLetters?: number | 'unlimited';
  aiCredits?: number;
  analyses?: number;
  exports?: number | 'unlimited';
};

function configOf(plan: string): { limits?: LooseLimits; legacy?: boolean } | null {
  return (PLAN_CONFIGS as Record<string, { limits?: LooseLimits; legacy?: boolean } | undefined>)[plan as SubscriptionPlan] ?? null;
}

function finite(limit: number | 'unlimited' | undefined): number | null {
  return typeof limit === 'number' ? limit : null;
}

/**
 * V1 rows for the stored plan. When the career ledger meters document credits
 * and analyses (PLAN_CONTRACT "one pool"), those V1 rows are left out so the
 * customer never sees the same allowance twice.
 */
export function v1AllowanceRows(plan: string, usage: V1Usage | null | undefined, careerUnits: ReadonlySet<string>): AllowanceRow[] {
  const config = configOf(plan);
  const limits = config?.limits;
  if (!limits) return [];
  // Creations-per-month counting: the legacy plans, and every plan on an API that predates the five-plan catalog.
  const legacy = config?.legacy ?? (isLegacyPlan(plan) || limits.analyses === undefined);
  const rows: AllowanceRow[] = [];
  const row = (key: string, limit: number | 'unlimited' | undefined, used: number | undefined, capacity: boolean) => {
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
  // Legacy plans count creations per month; current plans cap stored documents,
  // which this counter does not report, so "used" stays unknown for them.
  row('cvs', limits.cvs, legacy ? usage?.cvsCreated : undefined, !legacy);
  row('coverLetters', limits.coverLetters, legacy ? usage?.coverLettersCreated : undefined, !legacy);
  if (!careerUnits.has('document_credit')) row('aiCredits', limits.aiCredits, usage?.aiCreditsUsed, false);
  if (!careerUnits.has('resume_analysis')) row('analyses', limits.analyses, usage?.analysesUsed, false);
  row('exports', limits.exports, usage?.exportsThisMonth, false);
  return rows;
}

/** Career ledger rows (GET /usage on the career API). */
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
 * Spec §11: warn at 80, 95 and 100 percent of the included allowance. Pack
 * units still available hold the warning back until they run out too, and a
 * unit the plan does not include (granted 0, nothing bought) is not a warning.
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

/** Purchased packs that still hold units, soonest expiry first. */
export function activePacks(summary: UsageSummary | null | undefined): UsagePack[] {
  return (summary?.packs ?? [])
    .filter((pack) => pack.state === 'held' && pack.remainingUnits > 0)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

/** A pack expiring within this many days is flagged. */
export const PACK_EXPIRY_SOON_DAYS = 30;

export function expiresSoon(pack: UsagePack, now: Date = new Date()): boolean {
  const at = Date.parse(pack.expiresAt);
  return Number.isFinite(at) && at - now.getTime() <= PACK_EXPIRY_SOON_DAYS * 86_400_000;
}
