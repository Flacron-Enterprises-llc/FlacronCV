import type { UsageUnit } from '@flacroncv/career-shared';
import { advanceAllowancePeriod, AccountRow, lockAccount, SPENDABLE_STATUSES, v2PlanOf } from './accounts';
import { CatalogSnapshot, includedFor, isUsageUnit, minimumPlanFor } from './catalog';
import type { Db } from './db';
import { BillingError } from './errors';

export type LedgerState = 'reserved' | 'committed' | 'released';

export interface LedgerRow {
  id: string;
  billing_account_id: string;
  workspace_id: string;
  candidate_auth_user_id: string | null;
  unit: string;
  quantity: number;
  request_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  allowance_period_start: Date;
  pack_id: string | null;
  state: LedgerState;
  created_at: Date;
  committed_at: Date | null;
  released_at: Date | null;
}

export interface UnitBalance {
  unit: string;
  includedGranted: number;
  includedRemaining: number;
  /** Pack units this plan can spend now. */
  packRemaining: number;
  /** Unexpired pack units this plan cannot spend (decision 22). */
  packHeld: number;
  allowancePeriodStart: Date;
  renewalDate: Date;
}

export interface ReserveInput {
  billingAccountId: string;
  unit: string;
  quantity?: number;
  idempotencyKey: string;
  /** `fingerprintRequest(body)`. Same key with another fingerprint is `idempotency_mismatch`. */
  requestFingerprint: string;
  requestId: string;
  candidateAuthUserId?: string | null;
}

export interface ReserveResult {
  ledger: LedgerRow;
  /** True when this key already had a row and nothing new was debited. */
  replayed: boolean;
  balance: UnitBalance;
}

const WARNING_THRESHOLDS = [80, 95, 100] as const;

/**
 * DATA_MODEL "Reserve order", inside the caller's transaction:
 * account lock, idempotency check, renewal if due, billing state, plan
 * access, included units first, then the earliest-expiring pack that can
 * cover the quantity, then the ledger row.
 */
export async function reserve(
  db: Db,
  input: ReserveInput,
  catalog: (version: string) => Promise<CatalogSnapshot>,
  now: Date,
): Promise<ReserveResult> {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BillingError('validation_error', { field: 'quantity' });
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 255) {
    throw new BillingError('validation_error', { field: 'idempotencyKey' });
  }
  if (!input.requestFingerprint) {
    throw new BillingError('validation_error', { field: 'requestFingerprint' });
  }

  const account = await lockAccount(db, input.billingAccountId);
  const snapshot = await catalog(account.catalog_version);

  const existing = await db.query<LedgerRow>(
    `SELECT * FROM usage_ledger WHERE billing_account_id = $1 AND idempotency_key = $2`,
    [account.id, input.idempotencyKey],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.request_fingerprint !== input.requestFingerprint) {
      throw new BillingError('idempotency_mismatch', { idempotencyKey: input.idempotencyKey });
    }
    return { ledger: row, replayed: true, balance: await unitBalance(db, account, snapshot, row.unit, now) };
  }

  if (!isUsageUnit(snapshot, input.unit)) {
    throw new BillingError('validation_error', { field: 'unit' });
  }
  const unit: UsageUnit = input.unit;

  await advanceAllowancePeriod(db, account, snapshot, now);

  if (!SPENDABLE_STATUSES.includes(account.status)) {
    throw new BillingError('billing_inactive', { status: account.status });
  }

  const planId = v2PlanOf(snapshot, account);
  const included = includedFor(snapshot, planId, unit);
  if (included === null) {
    // Packs for this unit are held, not spent: a pack never unlocks a
    // feature the plan lacks (section 5, decision 22).
    throw new BillingError('plan_upgrade_required', {
      feature: snapshot.unitAllowanceField[unit],
      unit,
      minimumPlan: minimumPlanFor(snapshot, unit),
    });
  }

  // A paid period that lapsed with no payment event grants no new month,
  // but packs bought earlier stay spendable (decision 22).
  const lapsed = now >= account.allowance_period_end;
  const balance = lapsed ? null : await lockBalance(db, account, unit, included);
  let packId: string | null = null;

  if (balance && balance.included_remaining >= quantity) {
    await db.query(
      `UPDATE usage_balances SET included_remaining = included_remaining - $2, updated_at = now() WHERE id = $1`,
      [balance.id, quantity],
    );
  } else {
    const pack = await db.query<{ id: string; remaining_units: number }>(
      `SELECT id, remaining_units FROM packs
        WHERE billing_account_id = $1 AND unit = $2 AND status = 'active'
          AND expires_at > $3 AND remaining_units >= $4
        ORDER BY expires_at, purchased_at, id
        LIMIT 1
        FOR UPDATE`,
      [account.id, unit, now, quantity],
    );
    if (!pack.rows[0]) {
      const current = await unitBalance(db, account, snapshot, unit, now);
      throw new BillingError('quota_exhausted', {
        unit,
        remaining: (balance?.included_remaining ?? 0) + current.packRemaining,
        renewalDate: account.allowance_period_end,
      });
    }
    packId = pack.rows[0].id;
    await db.query(
      `UPDATE packs
          SET remaining_units = remaining_units - $2,
              status = CASE WHEN remaining_units - $2 = 0 THEN 'exhausted' ELSE status END
        WHERE id = $1`,
      [packId, quantity],
    );
  }

  const inserted = await db.query<LedgerRow>(
    `INSERT INTO usage_ledger
       (billing_account_id, workspace_id, candidate_auth_user_id, unit, quantity, request_id,
        idempotency_key, request_fingerprint, allowance_period_start, pack_id, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'reserved')
     RETURNING *`,
    [
      account.id,
      account.workspace_id,
      input.candidateAuthUserId ?? null,
      unit,
      quantity,
      input.requestId,
      input.idempotencyKey,
      input.requestFingerprint,
      account.allowance_period_start,
      packId,
    ],
  );

  if (packId === null && balance) {
    await recordWarnings(db, account, unit, balance.included_granted, balance.included_remaining - quantity);
  }

  return { ledger: inserted.rows[0], replayed: false, balance: await unitBalance(db, account, snapshot, unit, now) };
}

/** Success: `reserved` to `committed`. Repeating a commit is a no-op. */
export async function commit(db: Db, billingAccountId: string, ledgerId: string, now: Date): Promise<LedgerRow> {
  const row = await lockLedger(db, billingAccountId, ledgerId);
  if (row.state === 'committed') return row;
  if (row.state === 'released') throw new BillingError('reservation_closed', { ledgerId, state: row.state });
  const res = await db.query<LedgerRow>(
    `UPDATE usage_ledger SET state = 'committed', committed_at = $2 WHERE id = $1 RETURNING *`,
    [ledgerId, now],
  );
  return res.rows[0];
}

/**
 * Failure: `reserved` to `released`, and the quantity goes back to the
 * same source (the included balance of that period, or that pack). Only
 * after this commits may a client say "no credit used". Repeating a
 * release is a no-op. A committed row is not released; a refund is a
 * separate adjustment.
 */
export async function release(db: Db, billingAccountId: string, ledgerId: string, now: Date): Promise<LedgerRow> {
  await lockAccount(db, billingAccountId);
  const row = await lockLedger(db, billingAccountId, ledgerId);
  if (row.state === 'released') return row;
  if (row.state === 'committed') throw new BillingError('reservation_closed', { ledgerId, state: row.state });

  if (row.pack_id !== null) {
    // Units that come back to a refunded pack are revoked, not spendable.
    await db.query(
      `UPDATE packs
          SET remaining_units = remaining_units + CASE WHEN status = 'revoked' THEN 0 ELSE $2 END,
              revoked_units = revoked_units + CASE WHEN status = 'revoked' THEN $2 ELSE 0 END,
              status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END
        WHERE id = $1`,
      [row.pack_id, row.quantity],
    );
  } else {
    await db.query(
      `UPDATE usage_balances
          SET included_remaining = included_remaining + $4, updated_at = now()
        WHERE billing_account_id = $1 AND unit = $2 AND allowance_period_start = $3
          AND candidate_auth_user_id IS NULL`,
      [row.billing_account_id, row.unit, row.allowance_period_start, row.quantity],
    );
  }
  const res = await db.query<LedgerRow>(
    `UPDATE usage_ledger SET state = 'released', released_at = $2 WHERE id = $1 RETURNING *`,
    [ledgerId, now],
  );
  return res.rows[0];
}

/**
 * Included units for the account's allowance period, plus unexpired pack
 * units. Pack units for a unit the current plan does not include are
 * `packHeld`, not `packRemaining` (decision 22).
 */
export async function unitBalance(
  db: Db,
  account: AccountRow,
  snapshot: CatalogSnapshot,
  unit: string,
  now: Date,
): Promise<UnitBalance> {
  const planIncludes =
    isUsageUnit(snapshot, unit) && includedFor(snapshot, v2PlanOf(snapshot, account), unit) !== null;
  const included = await db.query<{ included_granted: number; included_remaining: number }>(
    `SELECT included_granted, included_remaining FROM usage_balances
      WHERE billing_account_id = $1 AND unit = $2 AND allowance_period_start = $3
        AND candidate_auth_user_id IS NULL`,
    [account.id, unit, account.allowance_period_start],
  );
  const packs = await db.query<{ remaining: string | null }>(
    `SELECT SUM(remaining_units) AS remaining FROM packs
      WHERE billing_account_id = $1 AND unit = $2 AND status = 'active' AND expires_at > $3`,
    [account.id, unit, now],
  );
  const packUnits = Number(packs.rows[0]?.remaining ?? 0);
  return {
    unit,
    includedGranted: planIncludes ? (included.rows[0]?.included_granted ?? 0) : 0,
    includedRemaining: planIncludes ? (included.rows[0]?.included_remaining ?? 0) : 0,
    packRemaining: planIncludes ? packUnits : 0,
    packHeld: planIncludes ? 0 : packUnits,
    allowancePeriodStart: account.allowance_period_start,
    renewalDate: account.allowance_period_end,
  };
}

async function lockBalance(db: Db, account: AccountRow, unit: UsageUnit, included: number) {
  await db.query(
    `INSERT INTO usage_balances
       (billing_account_id, workspace_id, unit, allowance_period_start, allowance_period_end,
        included_granted, included_remaining)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT ON CONSTRAINT usage_balances_one_row_per_period DO NOTHING`,
    [account.id, account.workspace_id, unit, account.allowance_period_start, account.allowance_period_end, included],
  );
  const res = await db.query<{ id: string; included_granted: number; included_remaining: number }>(
    `SELECT id, included_granted, included_remaining FROM usage_balances
      WHERE billing_account_id = $1 AND unit = $2 AND allowance_period_start = $3
        AND candidate_auth_user_id IS NULL
      FOR UPDATE`,
    [account.id, unit, account.allowance_period_start],
  );
  return res.rows[0];
}

async function lockLedger(db: Db, billingAccountId: string, ledgerId: string): Promise<LedgerRow> {
  const res = await db.query<LedgerRow>(
    `SELECT * FROM usage_ledger WHERE id = $1 AND billing_account_id = $2 FOR UPDATE`,
    [ledgerId, billingAccountId],
  );
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { ledgerId });
  return row;
}

/** Section 11: warn at 80, 95, and 100 percent of the included units. A warning is not a debit. */
async function recordWarnings(db: Db, account: AccountRow, unit: string, granted: number, remaining: number) {
  if (granted <= 0) return;
  const used = granted - remaining;
  for (const threshold of WARNING_THRESHOLDS) {
    if (used * 100 >= threshold * granted) {
      await db.query(
        `INSERT INTO usage_warnings (billing_account_id, unit, allowance_period_start, threshold)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT usage_warnings_once_per_period DO NOTHING`,
        [account.id, unit, account.allowance_period_start, threshold],
      );
    }
  }
}
