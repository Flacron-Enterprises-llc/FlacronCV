import type { PlanId } from '@flacroncv/career-shared';
import { AccountRow, SPENDABLE_STATUSES, v2PlanOf } from './accounts';
import { CatalogSnapshot, includedFor, isUsageUnit, minimumPlanFor, planRank } from './catalog';
import type { Db } from './db';
import { BillingError } from './errors';
import { addMonthsUtc } from './periods';

export type RevokeReason = 'refund' | 'chargeback' | 'reversed';

export interface PackRow {
  id: string;
  billing_account_id: string;
  addon_id: string;
  unit: string;
  purchased_units: number;
  remaining_units: number;
  revoked_units: number;
  purchased_at: Date;
  expires_at: Date;
  status: 'active' | 'exhausted' | 'expired' | 'revoked';
  revoked_at: Date | null;
  revoke_reason: RevokeReason | null;
}

const PACK_COLUMNS = `id, billing_account_id, addon_id, unit, purchased_units, remaining_units, revoked_units,
  purchased_at, expires_at, status, revoked_at, revoke_reason`;

/**
 * Adds a one-time usage pack after a verified purchase (P3 calls this from
 * the webhook). Section 9: Free cannot buy packs, each pack has a plan
 * minimum, and it expires twelve months after purchase. The add-on comes
 * from the account's catalog snapshot.
 */
export async function grantPack(
  db: Db,
  account: AccountRow,
  addonId: string,
  purchasedAt: Date,
  snapshot: CatalogSnapshot,
): Promise<PackRow> {
  const addon = snapshot.addons.find((a) => a.id === addonId);
  if (
    !addon ||
    addon.kind !== 'usage_pack' ||
    addon.billing !== 'one_time' ||
    addon.status !== 'active' ||
    !addon.firmPrice ||
    addon.expiresAfterMonths === undefined
  ) {
    throw new BillingError('not_purchasable', { addonId });
  }
  const planId = v2PlanOf(snapshot, account);
  if (planRank(snapshot, planId) < planRank(snapshot, addon.minPlan)) {
    throw new BillingError('not_purchasable', { addonId, minimumPlan: addon.minPlan });
  }
  if (!SPENDABLE_STATUSES.includes(account.status)) {
    throw new BillingError('billing_inactive', { status: account.status });
  }

  const res = await db.query<PackRow>(
    `INSERT INTO packs
       (billing_account_id, workspace_id, addon_id, catalog_version, unit, purchased_units, remaining_units,
        purchased_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
     RETURNING ${PACK_COLUMNS}`,
    [
      account.id,
      account.workspace_id,
      addon.id,
      snapshot.version,
      addon.unit,
      addon.units,
      purchasedAt,
      addMonthsUtc(purchasedAt, addon.expiresAfterMonths),
    ],
  );
  return res.rows[0];
}

/**
 * Section 11: a refund, chargeback, or reversed purchase revokes only the
 * unused units. Committed usage stays in the ledger. A reservation still
 * open on this pack keeps its units: committed later, they count as used;
 * released later, they are revoked too. Revoking twice changes nothing.
 */
export async function revokePack(
  db: Db,
  account: AccountRow,
  packId: string,
  reason: RevokeReason,
  now: Date,
): Promise<{ pack: PackRow; revokedNow: number }> {
  const locked = await db.query<PackRow>(
    `SELECT ${PACK_COLUMNS} FROM packs WHERE id = $1 AND billing_account_id = $2 FOR UPDATE`,
    [packId, account.id],
  );
  const pack = locked.rows[0];
  if (!pack) throw new BillingError('not_found', { packId });
  if (pack.status === 'revoked') return { pack, revokedNow: 0 };

  const res = await db.query<PackRow>(
    `UPDATE packs
        SET revoked_units = revoked_units + remaining_units, remaining_units = 0,
            status = 'revoked', revoked_at = $2, revoke_reason = $3
      WHERE id = $1
      RETURNING ${PACK_COLUMNS}`,
    [packId, now, reason],
  );
  return { pack: res.rows[0], revokedNow: pack.remaining_units };
}

/** Daily worker job. A pack past `expires_at` cannot be spent; the row stays for the balance history. */
export async function expirePacks(db: Db, now: Date): Promise<number> {
  const res = await db.query(
    `UPDATE packs SET status = 'expired'
      WHERE status IN ('active', 'exhausted') AND expires_at <= $1`,
    [now],
  );
  return res.rowCount ?? 0;
}

export async function listPacks(db: Db, accountId: string): Promise<PackRow[]> {
  const res = await db.query<PackRow>(
    `SELECT ${PACK_COLUMNS} FROM packs WHERE billing_account_id = $1
      ORDER BY expires_at, purchased_at, id`,
    [accountId],
  );
  return res.rows;
}

/**
 * `held`: unexpired units for a unit the current plan does not include
 * (decision 22). They become spendable again on a plan that includes it,
 * and the expiry date does not move while held.
 */
export type PackState = 'spendable' | 'held' | 'used_up' | 'expired' | 'revoked';

/** One row of the billing page's pack list (section 11: visible balance and expiry). */
export interface PackView {
  id: string;
  addonId: string;
  unit: string;
  purchasedUnits: number;
  remainingUnits: number;
  revokedUnits: number;
  purchasedAt: Date;
  expiresAt: Date;
  state: PackState;
  /** For a held pack, the lowest plan that includes its unit. Otherwise null. */
  requiredPlan: PlanId | null;
}

export function packView(pack: PackRow, account: AccountRow, snapshot: CatalogSnapshot, now: Date): PackView {
  const planId = v2PlanOf(snapshot, account);
  const unit = isUsageUnit(snapshot, pack.unit) ? pack.unit : null;
  let state: PackState;
  if (pack.status === 'revoked') state = 'revoked';
  else if (pack.status === 'expired' || pack.expires_at <= now) state = 'expired';
  else if (pack.remaining_units === 0) state = 'used_up';
  else if (unit === null || includedFor(snapshot, planId, unit) === null) state = 'held';
  else state = 'spendable';
  return {
    id: pack.id,
    addonId: pack.addon_id,
    unit: pack.unit,
    purchasedUnits: pack.purchased_units,
    remainingUnits: pack.remaining_units,
    revokedUnits: pack.revoked_units,
    purchasedAt: pack.purchased_at,
    expiresAt: pack.expires_at,
    state,
    requiredPlan: state === 'held' && unit !== null ? minimumPlanFor(snapshot, unit) : null,
  };
}
