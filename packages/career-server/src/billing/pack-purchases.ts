import type { AccountRow } from './accounts';
import type { CatalogSnapshot } from './catalog';
import type { Db } from './db';
import { BillingError } from './errors';
import { revokePack } from './packs';
import type { RevokeReason } from './packs';
import { addMonthsUtc } from './periods';

/**
 * A one-time pack paid through V1's Stripe account (Checkout in payment mode,
 * or an opted-in automatic top-up). V1 verified the payment; this records it
 * in the career ledger.
 */
export interface PaidPack {
  addonId: string;
  /** The Stripe Checkout Session or PaymentIntent id. One purchase, one pack. */
  purchaseRef: string;
  purchasedAt: Date;
  amountCents: number | null;
  currency: string | null;
  autoTopup?: boolean;
}

/**
 * Grants a paid pack once per `purchaseRef` (the `purchases` unique key makes
 * a redelivered webhook or a repeated sync a no-op). The plan minimum is a
 * purchase-time gate (V1 checkout refuses Free and too-low plans); a pack
 * that was paid for is never thrown away here. If the plan is now below the
 * pack's minimum, the units are held until the plan includes them again,
 * with the twelve-month expiry unchanged (decision 22). Returns null when the
 * purchase was already recorded.
 */
export async function grantPaidPack(
  db: Db,
  account: AccountRow,
  paid: PaidPack,
  snapshot: CatalogSnapshot,
): Promise<{ packId: string } | null> {
  const addon = snapshot.addons.find((a) => a.id === paid.addonId);
  if (!addon || addon.kind !== 'usage_pack' || addon.billing !== 'one_time' || addon.expiresAfterMonths === undefined) {
    throw new BillingError('not_purchasable', { addonId: paid.addonId });
  }
  const currency = paid.currency ? paid.currency.toUpperCase() : null;
  const purchase = await db.query<{ id: string }>(
    `INSERT INTO purchases
       (billing_account_id, provider, provider_payment_id, kind, catalog_version, sku, amount_cents, currency,
        purchased_at, auto_topup)
     VALUES ($1, 'stripe', $2, 'pack', $3, $4, $5, $6, $7, $8)
     ON CONFLICT ON CONSTRAINT purchases_provider_payment_unique DO NOTHING
     RETURNING id`,
    [
      account.id,
      paid.purchaseRef,
      snapshot.version,
      addon.id,
      currency ? paid.amountCents : null,
      currency,
      paid.purchasedAt,
      paid.autoTopup === true,
    ],
  );
  if (!purchase.rows[0]) return null;
  const pack = await db.query<{ id: string }>(
    `INSERT INTO packs
       (billing_account_id, workspace_id, addon_id, catalog_version, unit, purchased_units, remaining_units,
        purchased_at, expires_at, purchase_id)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)
     RETURNING id`,
    [
      account.id,
      account.workspace_id,
      addon.id,
      snapshot.version,
      addon.unit,
      addon.units,
      paid.purchasedAt,
      addMonthsUtc(paid.purchasedAt, addon.expiresAfterMonths),
      purchase.rows[0].id,
    ],
  );
  await recordAdjustment(db, account.id, {
    kind: 'pack_granted',
    unit: addon.unit,
    quantity: addon.units,
    sourceRef: paid.purchaseRef,
    detail: { addonId: addon.id, autoTopup: paid.autoTopup === true },
  });
  return { packId: pack.rows[0].id };
}

/**
 * A refunded or disputed pack purchase: only the unused units are revoked;
 * units already spent stay in the ledger (section 11). Unknown or already
 * revoked purchases change nothing.
 */
export async function revokePaidPack(
  db: Db,
  account: AccountRow,
  purchaseRef: string,
  reason: RevokeReason,
  now: Date,
  refundedCents: number | null = null,
): Promise<{ revokedNow: number } | null> {
  const found = await db.query<{ pack_id: string; purchase_id: string; amount_cents: number | null }>(
    `SELECT p.id AS pack_id, pu.id AS purchase_id, pu.amount_cents
       FROM purchases pu JOIN packs p ON p.purchase_id = pu.id
      WHERE pu.billing_account_id = $1 AND pu.provider = 'stripe' AND pu.provider_payment_id = $2`,
    [account.id, purchaseRef],
  );
  const row = found.rows[0];
  if (!row) return null;
  const { pack, revokedNow } = await revokePack(db, account, row.pack_id, reason, now);
  const refunded = refundedCents ?? row.amount_cents;
  await db.query(
    `UPDATE purchases
        SET refunded_cents = COALESCE(refunded_cents, $2), refunded_at = COALESCE(refunded_at, $3)
      WHERE id = $1`,
    [row.purchase_id, refunded === null ? null : Math.min(refunded, row.amount_cents ?? refunded), now],
  );
  if (revokedNow > 0) {
    await recordAdjustment(db, account.id, {
      kind: 'pack_revoked',
      unit: pack.unit,
      quantity: -revokedNow,
      reason,
      sourceRef: purchaseRef,
      detail: { packId: pack.id, usedUnits: pack.purchased_units - pack.revoked_units - pack.remaining_units },
    });
  }
  return { revokedNow };
}

/**
 * A dispute (chargeback) the merchant WON: V1 sets the purchase back to
 * `paid`. The sync revoked the unused units when the dispute opened; this
 * gives exactly those units back, once. Only a pack revoked for a chargeback
 * qualifies (a refunded pack never comes back), and only before its original
 * twelve-month expiry (the date does not move). After the reinstatement the
 * pack is no longer `revoked`, so a repeated sync changes nothing; a later
 * new dispute revokes it again as usual. Returns the units restored, or null
 * when nothing applied.
 */
export async function reinstateDisputedPack(
  db: Db,
  account: AccountRow,
  purchaseRef: string,
  now: Date,
): Promise<{ restored: number } | null> {
  const found = await db.query<{
    pack_id: string;
    purchase_id: string;
    unit: string;
    addon_id: string;
    revoked_units: number;
  }>(
    `SELECT p.id AS pack_id, pu.id AS purchase_id, p.unit, p.addon_id, p.revoked_units
       FROM purchases pu JOIN packs p ON p.purchase_id = pu.id
      WHERE pu.billing_account_id = $1 AND pu.provider = 'stripe' AND pu.provider_payment_id = $2
        AND p.status = 'revoked' AND p.revoke_reason = 'chargeback' AND p.expires_at > $3
      FOR UPDATE OF p`,
    [account.id, purchaseRef, now],
  );
  const row = found.rows[0];
  if (!row) return null;
  await db.query(
    `UPDATE packs
        SET remaining_units = revoked_units, revoked_units = 0,
            status = CASE WHEN revoked_units > 0 THEN 'active' ELSE 'exhausted' END,
            revoked_at = NULL, revoke_reason = NULL
      WHERE id = $1 AND status = 'revoked'`,
    [row.pack_id],
  );
  // The money stayed with the merchant: the purchase is no longer refunded.
  await db.query(`UPDATE purchases SET refunded_cents = NULL, refunded_at = NULL WHERE id = $1`, [row.purchase_id]);
  if (row.revoked_units > 0) {
    await recordAdjustment(db, account.id, {
      kind: 'pack_granted',
      unit: row.unit,
      quantity: row.revoked_units,
      reason: 'dispute_won',
      sourceRef: purchaseRef,
      detail: { packId: row.pack_id, addonId: row.addon_id },
    });
  }
  return { restored: row.revoked_units };
}

export type AdjustmentKind =
  | 'upgrade_difference'
  | 'plan_regrant'
  | 'downgrade_scheduled'
  | 'downgrade_applied'
  | 'pack_granted'
  | 'pack_revoked'
  | 'capacity_changed'
  | 'storage_grace_started'
  | 'period_reanchored';

/** Appends one row to `billing_adjustments`. Never updated or deleted. */
export async function recordAdjustment(
  db: Db,
  billingAccountId: string,
  adjustment: {
    kind: AdjustmentKind;
    unit?: string | null;
    quantity?: number | null;
    reason?: string | null;
    sourceRef?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO billing_adjustments (billing_account_id, kind, unit, quantity, reason, source_ref, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      billingAccountId,
      adjustment.kind,
      adjustment.unit ?? null,
      adjustment.quantity ?? null,
      adjustment.reason ?? null,
      adjustment.sourceRef ?? null,
      JSON.stringify(adjustment.detail ?? {}),
    ],
  );
}
