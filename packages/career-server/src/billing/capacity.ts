import type { Addon, PlanAllowances, PlanId } from '@flacroncv/career-shared';
import type { AccountRow } from './accounts';
import type { CatalogSnapshot } from './catalog';
import { planRank } from './catalog';
import type { Db } from './db';

/**
 * Recurring capacity add-ons (spec sections 9 and 10): extra location
 * profile, saved searches, portfolio page and storage for individuals; staff
 * seats, active candidates and storage for Business. Each one raises exactly
 * one count cap. Nothing here can touch a monthly unit, alert intelligence,
 * matching schedule or the local radius: those are not in this map, so a
 * purchase can never raise them (section 9, "Purchased packs never increase
 * alert intelligence or local radius").
 */
export const CAPACITY_FIELD_BY_ADDON_UNIT = {
  location_profile: 'locationProfiles',
  saved_search: 'savedSearches',
  portfolio_page: 'portfolioPages',
  storage_byte: 'storageBytes',
  staff_seat: 'staffSeats',
  active_candidate: 'activeCandidates',
} as const satisfies Record<string, keyof PlanAllowances>;

export type CapacityAddonUnit = keyof typeof CAPACITY_FIELD_BY_ADDON_UNIT;
export type ExtendableCapacityField = (typeof CAPACITY_FIELD_BY_ADDON_UNIT)[CapacityAddonUnit];

const EXTENDABLE = new Set<string>(Object.values(CAPACITY_FIELD_BY_ADDON_UNIT));

/** One live recurring add-on as V1's verified Stripe state reports it. */
export interface CapacityGrant {
  addonId: string;
  quantity: number;
}

/** The recurring add-on, when `addonId` is a sellable capacity or organization add-on. */
export function capacityAddon(snapshot: CatalogSnapshot, addonId: string): Addon | null {
  const addon = snapshot.addons.find((a) => a.id === addonId);
  if (!addon || addon.status !== 'active' || addon.billing !== 'monthly') return null;
  if (addon.kind !== 'capacity' && addon.kind !== 'organization') return null;
  if (!(addon.unit in CAPACITY_FIELD_BY_ADDON_UNIT)) return null;
  return addon;
}

/**
 * Extra capacity per allowance field for `planId`. An add-on the plan may
 * not hold (a Business seat on Professional, any add-on on Free) adds
 * nothing: Free must upgrade first, and the purchase gate refuses it
 * anyway. Quantities are clamped to whole non-negative numbers.
 */
export function capacityExtrasFor(
  snapshot: CatalogSnapshot,
  planId: PlanId,
  grants: readonly CapacityGrant[],
): Partial<Record<ExtendableCapacityField, number>> {
  const extras: Partial<Record<ExtendableCapacityField, number>> = {};
  for (const grant of grants) {
    const addon = capacityAddon(snapshot, grant.addonId);
    if (!addon || planId === 'free' || planRank(snapshot, planId) < planRank(snapshot, addon.minPlan)) continue;
    const quantity = Number.isInteger(grant.quantity) && grant.quantity > 0 ? grant.quantity : 0;
    if (quantity === 0) continue;
    const field = CAPACITY_FIELD_BY_ADDON_UNIT[addon.unit as CapacityAddonUnit];
    extras[field] = (extras[field] ?? 0) + addon.units * quantity;
  }
  return extras;
}

/** The extra the account holds for `field` (0 when none, or when the field cannot be extended). */
export function capacityExtra(account: Pick<AccountRow, 'capacity_extras'>, field: string): number {
  if (!EXTENDABLE.has(field)) return 0;
  const value = account.capacity_extras?.[field];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Writes the account's capacity extras. Returns the fields whose value
 * changed, so the caller can record an adjustment. Lowering an extra never
 * deletes anything: existing items stay readable and only new creation
 * above the new limit is refused (section 11).
 */
export async function applyCapacityExtras(
  db: Db,
  account: AccountRow,
  extras: Partial<Record<ExtendableCapacityField, number>>,
): Promise<Array<{ field: string; from: number; to: number }>> {
  const changes: Array<{ field: string; from: number; to: number }> = [];
  const fields = new Set([...Object.keys(account.capacity_extras ?? {}), ...Object.keys(extras)]);
  for (const field of fields) {
    const from = capacityExtra(account, field);
    const to = (extras as Record<string, number | undefined>)[field] ?? 0;
    if (from !== to) changes.push({ field, from, to });
  }
  if (changes.length === 0) return changes;
  await db.query(`UPDATE billing_accounts SET capacity_extras = $2::jsonb, updated_at = now() WHERE id = $1`, [
    account.id,
    JSON.stringify(extras),
  ]);
  account.capacity_extras = { ...extras };
  return changes;
}
