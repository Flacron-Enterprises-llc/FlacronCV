import { isDeepStrictEqual } from 'util';
import {
  ADDONS,
  ALLOWANCES,
  CATALOG_VERSION,
  DAILY_IMPORT_LIMIT,
  FEATURE_PHASE,
  PLAN_ORDER,
  PLAN_TRIALS,
  PLANS,
  PURCHASE_CHANNELS,
  UNIT_ALLOWANCE_FIELD,
} from '@flacroncv/career-shared';
import type {
  Addon,
  BillingInterval,
  Plan,
  PlanAllowances,
  PlanId,
  PlanTrial,
  PurchaseChannel,
  UnitAllowanceField,
  UsageUnit,
} from '@flacroncv/career-shared';
import type { Db } from './db';
import { BillingError } from './errors';

/**
 * What `catalog_versions.snapshot` holds. Built from `packages/shared` at
 * publish time. Entitlements read this, never the package directly, so an
 * account keeps the catalog version it was sold.
 */
export interface CatalogSnapshot {
  version: string;
  planOrder: PlanId[];
  plans: Record<PlanId, Plan>;
  allowances: Record<PlanId, PlanAllowances>;
  addons: Addon[];
  purchaseChannels: Record<PlanId, Record<BillingInterval, PurchaseChannel[]>>;
  trials: Record<PlanId, PlanTrial | null>;
  featurePhase: Record<string, number>;
  unitAllowanceField: Record<UsageUnit, UnitAllowanceField | null>;
  dailyImportLimit: number;
}

export function buildCatalogSnapshot(): CatalogSnapshot {
  const snapshot: CatalogSnapshot = JSON.parse(
    JSON.stringify({
      version: CATALOG_VERSION,
      planOrder: PLAN_ORDER,
      plans: PLANS,
      allowances: ALLOWANCES,
      addons: ADDONS,
      purchaseChannels: PURCHASE_CHANNELS,
      trials: PLAN_TRIALS,
      featurePhase: FEATURE_PHASE,
      unitAllowanceField: UNIT_ALLOWANCE_FIELD,
      dailyImportLimit: DAILY_IMPORT_LIMIT,
    }),
  );
  return snapshot;
}

/**
 * Inserts the current `packages/shared` catalog under its version. A
 * second publish of the same contents does nothing. Different contents
 * under a version already published are refused: a price change needs a
 * new `CATALOG_VERSION`.
 */
export async function publishCatalog(db: Db, publishedAt: Date = new Date()): Promise<'inserted' | 'unchanged'> {
  const snapshot = buildCatalogSnapshot();
  const inserted = await db.query(
    `INSERT INTO catalog_versions (version, published_at, snapshot)
     VALUES ($1, $2, $3)
     ON CONFLICT (version) DO NOTHING
     RETURNING version`,
    [snapshot.version, publishedAt, JSON.stringify(snapshot)],
  );
  if (inserted.rowCount === 1) return 'inserted';

  const existing = await db.query<{ snapshot: unknown }>(
    `SELECT snapshot FROM catalog_versions WHERE version = $1`,
    [snapshot.version],
  );
  if (!isDeepStrictEqual(existing.rows[0]?.snapshot, snapshot)) {
    throw new BillingError('catalog_conflict', { version: snapshot.version });
  }
  return 'unchanged';
}

/** Published versions are immutable, so a loaded snapshot is cached. */
export class CatalogStore {
  private readonly cache = new Map<string, CatalogSnapshot>();

  async get(db: Db, version: string): Promise<CatalogSnapshot> {
    const cached = this.cache.get(version);
    if (cached) return cached;
    const res = await db.query<{ snapshot: CatalogSnapshot }>(
      `SELECT snapshot FROM catalog_versions WHERE version = $1`,
      [version],
    );
    const snapshot = res.rows[0]?.snapshot;
    if (!snapshot) throw new BillingError('not_found', { catalogVersion: version });
    this.cache.set(version, snapshot);
    return snapshot;
  }
}

export function isV2Plan(snapshot: CatalogSnapshot, planId: string): planId is PlanId {
  return snapshot.planOrder.some((id) => id === planId);
}

export function isUsageUnit(snapshot: CatalogSnapshot, unit: string): unit is UsageUnit {
  return Object.prototype.hasOwnProperty.call(snapshot.unitAllowanceField, unit);
}

/** Monthly included units, or null when the plan does not include the unit. */
export function includedFor(snapshot: CatalogSnapshot, planId: PlanId, unit: UsageUnit): number | null {
  const field = snapshot.unitAllowanceField[unit];
  return field === null ? null : snapshot.allowances[planId][field];
}

export function minimumPlanFor(snapshot: CatalogSnapshot, unit: UsageUnit): PlanId | null {
  return snapshot.planOrder.find((planId) => includedFor(snapshot, planId, unit) !== null) ?? null;
}

export function planRank(snapshot: CatalogSnapshot, planId: PlanId): number {
  return snapshot.planOrder.indexOf(planId);
}

/** Units the plan includes, with the monthly count. */
export function includedUnitsFor(snapshot: CatalogSnapshot, planId: PlanId): Array<[UsageUnit, number]> {
  const out: Array<[UsageUnit, number]> = [];
  for (const unit of Object.keys(snapshot.unitAllowanceField)) {
    if (!isUsageUnit(snapshot, unit)) continue;
    const included = includedFor(snapshot, planId, unit);
    if (included !== null) out.push([unit, included]);
  }
  return out;
}

/**
 * Section 11: an upgrade adds the difference between allowances. A unit
 * the old plan did not include adds the new plan's full amount.
 */
export function allowanceDeltas(
  snapshot: CatalogSnapshot,
  fromPlan: PlanId,
  toPlan: PlanId,
): Array<{ unit: UsageUnit; delta: number }> {
  return includedUnitsFor(snapshot, toPlan)
    .map(([unit, next]) => ({ unit, delta: next - (includedFor(snapshot, fromPlan, unit) ?? 0) }))
    .filter((d) => d.delta > 0);
}
