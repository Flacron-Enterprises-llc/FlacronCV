import { pooledCandidate } from '../remaining/business-sponsor';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { UsageUnit } from '@flacroncv/career-shared';
import { lockAccount, readAccount } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { commit, release, reserve, unitBalance } from '../billing/entitlements';
import type { LedgerRow } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { fingerprintRequest } from '../billing/fingerprint';
import { decideTopUp, readTopUpSettings, topUpSpentCents } from '../billing/top-up';
import type { Spender } from './metering.service';

/**
 * The units V1's own AI features spend from the shared career ledger
 * (PLAN_CONTRACT "Metering"): one pool, so a Professional customer has 60
 * document credits in total, not 60 in the CV builder plus 60 here.
 */
export const V1_METERED_UNITS = ['document_credit', 'resume_analysis'] as const;
export type V1MeteredUnit = (typeof V1_METERED_UNITS)[number];

/** How long a reservation lives without a commit or release before the worker sweep releases it. */
export const DEFAULT_RESERVATION_TTL_MS = 5 * 60_000;
export const MAX_RESERVATION_TTL_MS = 15 * 60_000;
const MIN_RESERVATION_TTL_MS = 30_000;

/** `ai_jobs.kind` prefix; keeps these rows apart from the career features' own jobs. */
const KIND_PREFIX = 'v1.';
const OPERATION = /^[a-z0-9][a-z0-9._-]{0,47}$/;

export type ReservationState = 'reserved' | 'committed' | 'released';

export interface ReservationView {
  reservationId: string;
  unit: string;
  operation: string;
  state: ReservationState;
  /** When an open reservation is released by the sweep if nobody commits it. */
  expiresAt: string | null;
  /** True when this idempotency key already had a reservation and nothing new was debited. */
  replayed: boolean;
  usage: { unit: string; includedGranted: number; includedRemaining: number; packRemaining: number; packHeld: number; renewalDate: string };
}

interface JobRow {
  id: string;
  kind: string;
  unit: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  ledger_id: string;
  lease_expires_at: Date | null;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Server-to-server reserve / commit / release for V1's AI endpoints, on
 * behalf of the signed-in person (V1 forwards their own ID token; the guard
 * resolves the principal). Same ledger, same rules as the career features:
 * account lock, idempotency key, included units first then the
 * earliest-expiring pack, warnings at 80/95/100 percent.
 *
 * - Retrying `reserve` with the same key returns the same reservation and
 *   never debits twice; the same key for another unit or operation is
 *   `idempotency_mismatch`.
 * - A reservation that is neither committed nor released within its TTL is
 *   released by the worker's `releaseAbandoned` sweep (it is an `ai_jobs`
 *   row with a lease that is never renewed).
 * - `commit` and `release` are idempotent; a released reservation cannot be
 *   committed (`reservation_closed`), so a late commit never charges a unit
 *   that was already given back.
 */
export class RemoteMeteringService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
  ) {}

  async reserve(
    spender: Spender,
    input: { unit: string; operation: string; idempotencyKey: string | undefined; ttlMs?: number },
    requestId: string = randomUUID(),
  ): Promise<ReservationView> {
    if (!(V1_METERED_UNITS as readonly string[]).includes(input.unit)) {
      throw new BillingError('validation_error', { field: 'unit', reason: 'invalid' });
    }
    if (typeof input.operation !== 'string' || !OPERATION.test(input.operation)) {
      throw new BillingError('validation_error', { field: 'operation', reason: 'invalid' });
    }
    const key = input.idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 255) throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    const ttl = Math.min(Math.max(input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS, MIN_RESERVATION_TTL_MS), MAX_RESERVATION_TTL_MS);
    const unit = input.unit as V1MeteredUnit;
    const kind = `${KIND_PREFIX}${input.operation}`;
    const fingerprint = fingerprintRequest({ kind, unit });

    let started: { jobId: string; replayed: boolean };
    try {
      started = await withTransaction(this.pool, async (db) => {
        const account = await lockAccount(db, spender.billingAccountId);
        const prior = await db.query<LedgerRow>(
          `SELECT * FROM usage_ledger WHERE billing_account_id = $1 AND idempotency_key = $2`,
          [account.id, key],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== fingerprint) throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
          const job = await db.query<{ id: string }>(`SELECT id FROM ai_jobs WHERE ledger_id = $1`, [prior.rows[0].id]);
          if (!job.rows[0]) throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
          return { jobId: job.rows[0].id, replayed: true };
        }
        const now = this.clock.now();
        const reserved = await reserve(
          db,
          {
            billingAccountId: account.id,
            unit,
            idempotencyKey: key,
            requestFingerprint: fingerprint,
            requestId,
            candidateAuthUserId: pooledCandidate(account, spender),
          },
          (version) => this.catalogs.get(db, version),
          now,
        );
        const job = await db.query<{ id: string }>(
          `INSERT INTO ai_jobs
             (billing_account_id, workspace_id, owner_auth_user_id, kind, unit, ledger_id, idempotency_key, status,
              provider, created_at, lease_token, lease_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', 'v1', $8, $9, $10)
           RETURNING id`,
          [account.id, account.workspace_id, spender.authUserId, kind, unit, reserved.ledger.id, key, now, randomUUID(), new Date(now.getTime() + ttl)],
        );
        return { jobId: job.rows[0].id, replayed: false };
      });
    } catch (error) {
      if (isBillingError(error, 'quota_exhausted')) throw await this.withTopUp(spender, unit, error);
      throw error;
    }
    return this.view(spender, started.jobId, started.replayed);
  }

  async commit(spender: Spender, reservationId: string): Promise<ReservationView> {
    await withTransaction(this.pool, async (db) => {
      await lockAccount(db, spender.billingAccountId);
      const job = await this.lockJob(db, spender, reservationId);
      if (job.status === 'succeeded') return;
      if (job.status === 'failed') throw new BillingError('reservation_closed', { reservationId, state: 'released' });
      await commit(db, spender.billingAccountId, job.ledger_id, this.clock.now());
      await db.query(`UPDATE ai_jobs SET status = 'succeeded', result = '{}'::jsonb, finished_at = $2 WHERE id = $1`, [
        job.id,
        this.clock.now(),
      ]);
    });
    return this.view(spender, reservationId, false);
  }

  async release(spender: Spender, reservationId: string, reason = 'released'): Promise<ReservationView> {
    await withTransaction(this.pool, async (db) => {
      await lockAccount(db, spender.billingAccountId);
      const job = await this.lockJob(db, spender, reservationId);
      if (job.status === 'failed') return;
      if (job.status === 'succeeded') throw new BillingError('reservation_closed', { reservationId, state: 'committed' });
      await release(db, spender.billingAccountId, job.ledger_id, this.clock.now());
      await db.query(`UPDATE ai_jobs SET status = 'failed', error_code = $2, finished_at = $3 WHERE id = $1`, [
        job.id,
        reason.slice(0, 64),
        this.clock.now(),
      ]);
    });
    return this.view(spender, reservationId, false);
  }

  async get(spender: Spender, reservationId: string): Promise<ReservationView> {
    return this.view(spender, reservationId, false);
  }

  private async lockJob(db: Db, spender: Spender, reservationId: string): Promise<JobRow> {
    const res = await db.query<JobRow>(
      `SELECT id, kind, unit, status, ledger_id, lease_expires_at FROM ai_jobs
        WHERE id = $1 AND billing_account_id = $2 AND kind LIKE 'v1.%'
        FOR UPDATE`,
      [reservationId, spender.billingAccountId],
    );
    const job = res.rows[0];
    if (!job) throw new BillingError('not_found', { reservationId });
    return job;
  }

  private async view(spender: Spender, reservationId: string, replayed: boolean): Promise<ReservationView> {
    const res = await this.pool.query<JobRow & { state: ReservationState }>(
      `SELECT j.id, j.kind, j.unit, j.status, j.ledger_id, j.lease_expires_at, l.state
         FROM ai_jobs j JOIN usage_ledger l ON l.id = j.ledger_id
        WHERE j.id = $1 AND j.billing_account_id = $2 AND j.kind LIKE 'v1.%'`,
      [reservationId, spender.billingAccountId],
    );
    const job = res.rows[0];
    if (!job) throw new BillingError('not_found', { reservationId });
    const account = await readAccount(this.pool, spender.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const balance = await unitBalance(this.pool, account, snapshot, job.unit, this.clock.now());
    return {
      reservationId: job.id,
      unit: job.unit,
      operation: job.kind.slice(KIND_PREFIX.length),
      state: job.state,
      expiresAt: job.state === 'reserved' && job.lease_expires_at ? job.lease_expires_at.toISOString() : null,
      replayed,
      usage: {
        unit: job.unit,
        includedGranted: balance.includedGranted,
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        packHeld: balance.packHeld,
        renewalDate: balance.renewalDate.toISOString(),
      },
    };
  }

  /**
   * On exhaustion, says whether an opted-in automatic top-up could cover the
   * request, so V1 can charge it (it owns Stripe). Nothing is bought here,
   * and the decision is only ever positive with consent and a cap.
   */
  private async withTopUp(spender: Spender, unit: UsageUnit, error: BillingError): Promise<BillingError> {
    try {
      const account = await readAccount(this.pool, spender.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const settings = await readTopUpSettings(this.pool, account.id);
      const decision = decideTopUp(snapshot, account.plan_id, unit, settings, await topUpSpentCents(this.pool, account));
      return new BillingError('quota_exhausted', { ...error.details, topUp: decision.eligible ? decision : { eligible: false, reason: decision.reason } });
    } catch {
      return error;
    }
  }
}
