import type { FeatureId, PlanAllowances, PlanId } from '@flacroncv/career-shared';
import { v2PlanOf } from '../billing/accounts';
import { capacityExtra } from '../billing/capacity';
import type { AccountRow } from '../billing/accounts';
import type { CatalogSnapshot } from '../billing/catalog';
import type { Db } from '../billing/db';
import { BillingError } from '../billing/errors';

/** Allowances that are count caps, not monthly units (API_CONTRACT `capacity_exceeded`). */
export type CapacityField = {
  [K in keyof PlanAllowances]: PlanAllowances[K] extends number | null ? K : never;
}[keyof PlanAllowances];

/**
 * The operator switch for a feature. A `feature_flags` row wins. With no
 * row, the catalog phase decides: Phase 1 is on, later phases are off.
 */
export async function isFeatureEnabled(db: Db, snapshot: CatalogSnapshot, feature: FeatureId): Promise<boolean> {
  const res = await db.query<{ enabled: boolean }>(`SELECT enabled FROM feature_flags WHERE feature = $1`, [feature]);
  if (res.rows[0]) return res.rows[0].enabled;
  return snapshot.featurePhase[feature] === 1;
}

/** `feature_unavailable` when the switch is off. Nothing is reserved. */
export async function requireFeature(db: Db, snapshot: CatalogSnapshot, feature: FeatureId): Promise<void> {
  if (!(await isFeatureEnabled(db, snapshot, feature))) {
    throw new BillingError('feature_unavailable', { feature });
  }
}

/** The lowest plan whose allowance for `field` is not null. */
export function minimumPlanForField(snapshot: CatalogSnapshot, field: keyof PlanAllowances): PlanId | null {
  return snapshot.planOrder.find((planId) => snapshot.allowances[planId][field] !== null) ?? null;
}

/**
 * Count caps: `null` on the plan means the plan does not include it
 * (`plan_upgrade_required`); otherwise `used + adding` above the limit is
 * `capacity_exceeded`. Existing items stay readable either way.
 */
export function checkCapacity(
  snapshot: CatalogSnapshot,
  account: AccountRow,
  field: CapacityField,
  used: number,
  adding = 1,
): void {
  const limit = capacityLimit(snapshot, account, field);
  if (limit === null) {
    throw new BillingError('plan_upgrade_required', { feature: field, minimumPlan: minimumPlanForField(snapshot, field) });
  }
  if (used + adding > limit) {
    throw new BillingError('capacity_exceeded', { field, limit, used });
  }
}

/**
 * The count cap for `field`: the plan's limit plus recurring capacity
 * add-ons (`capacity_extras`). `null` when the plan does not include the
 * field at all; an add-on never unlocks a field the plan lacks.
 */
export function capacityLimit(snapshot: CatalogSnapshot, account: AccountRow, field: CapacityField): number | null {
  const planId = v2PlanOf(snapshot, account);
  const limit = snapshot.allowances[planId][field];
  if (limit === null) return null;
  return limit + capacityExtra(account, field);
}

/**
 * Business: reactivating an archived candidate (or adding a seat) must fit
 * the current cap, add-ons included (spec section 11, "Reactivation checks
 * capacity"). `activeNow` is the count of active rows excluding the one
 * being reactivated. Archiving needs no check: it only frees a slot.
 */
export function checkReactivation(
  snapshot: CatalogSnapshot,
  account: AccountRow,
  field: 'activeCandidates' | 'staffSeats',
  activeNow: number,
): void {
  checkCapacity(snapshot, account, field, activeNow, 1);
}

/** A plan-gated feature that is not a monthly unit (DOCX export, alert channels). */
export function requirePlanFeature(
  snapshot: CatalogSnapshot,
  account: AccountRow,
  feature: string,
  minimumPlan: PlanId,
): void {
  const planId = v2PlanOf(snapshot, account);
  if (snapshot.planOrder.indexOf(planId) < snapshot.planOrder.indexOf(minimumPlan)) {
    throw new BillingError('plan_upgrade_required', { feature, minimumPlan });
  }
}
