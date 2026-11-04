import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { FeatureId, UsageUnit } from '@flacroncv/career-shared';
import { lockAccount, readAccount } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { commit, release, reserve, unitBalance } from '../billing/entitlements';
import type { LedgerRow, UnitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { fingerprintRequest } from '../billing/fingerprint';
import { isLiveSpender } from '../privacy/live-person';
import { requireFeature } from './access';

/** Who is spending. A `Principal` fits. */
export interface Spender {
  billingAccountId: string;
  workspaceId: string;
  authUserId: string;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface CapacityContext {
  db: Db;
  account: AccountRow;
  snapshot: CatalogSnapshot;
  /** Requests of this kind reserved and still running. They count toward a cap. */
  inFlight: number;
}

export interface MeteredOperation<Output, Result extends JsonValue> {
  spender: Spender;
  /** Stable operation name, for example `resume.generate`. Part of the idempotency fingerprint. */
  kind: string;
  unit: UsageUnit;
  /** The phase switch checked before anything is reserved. */
  feature: FeatureId;
  /** The `Idempotency-Key` header. Required. */
  idempotencyKey: string | undefined;
  /** The request body as received. Same key with another body is `idempotency_mismatch`. */
  body: unknown;
  requestId: string;
  /** Count caps. Runs under the account lock, before the reserve. */
  checkCapacity?: (ctx: CapacityContext) => Promise<void>;
  /** Provenance kept on the job (V2_ARCHITECTURE section 18). */
  provenance?: {
    provider?: string;
    promptTemplateVersion?: string;
    outputSchemaVersion?: string;
    inputVersions?: Record<string, JsonValue>;
  };
  /** The provider call. Runs outside every transaction. */
  execute: () => Promise<Output>;
  /**
   * Validates and saves the output. Runs in the transaction that commits
   * the reservation, so saved results and the debit land together. The
   * return value is stored on the job and returned again on a replay.
   */
  save: (db: Db, output: Output) => Promise<Result>;
}

export interface UsageView {
  unit: string;
  includedGranted: number;
  includedRemaining: number;
  packRemaining: number;
  packHeld: number;
  renewalDate: Date;
  /** `committed` on success. */
  ledgerState: LedgerRow['state'];
}

export interface MeteredResult<Result> {
  result: Result;
  usage: UsageView;
  jobId: string;
  /** True when this key had already succeeded and nothing ran or was debited again. */
  replayed: boolean;
}

interface JobRow {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: JsonValue | null;
  error_code: string | null;
  ledger_id: string;
}

type Started =
  | { replayOf: LedgerRow; ledger: LedgerRow; jobId: null }
  | { replayOf: null; ledger: LedgerRow; jobId: string };

const systemClock: Clock = { now: () => new Date() };

/**
 * Ownership of a running paid job. The process that runs the provider call
 * renews the lease every `heartbeatEveryMs` (short single-statement updates,
 * no transaction held across the call) until `maxRunMs` after the job
 * started; after that, or if the process dies, the lease lapses and the
 * worker sweep releases the reservation. `heartbeatEveryMs: 0` disables
 * renewal (tests use it to stand for a crashed process).
 */
export interface LeaseOptions {
  leaseMs: number;
  heartbeatEveryMs: number;
  maxRunMs: number;
}

export const DEFAULT_LEASE: LeaseOptions = { leaseMs: 2 * 60_000, heartbeatEveryMs: 30_000, maxRunMs: 30 * 60_000 };

/**
 * Spec section 11 "Request flow" for every paid action. The guard has
 * already authenticated and resolved the workspace. This runs:
 * feature switch, account lock, replay check, capacity, then `reserve`
 * (billing state, versioned plan, plan access, included units then packs)
 * with the job row in the same transaction; the provider call; then save
 * and commit together, or release. The response carries the remaining
 * balance and the renewal date.
 *
 * "No credit used" may be said only when `released` is true on the error.
 */
export class MeteringService {
  private readonly catalogs = new CatalogStore();
  private readonly lease: LeaseOptions;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
    lease: Partial<LeaseOptions> = {},
  ) {
    this.lease = { ...DEFAULT_LEASE, ...lease };
  }

  async run<Output, Result extends JsonValue>(op: MeteredOperation<Output, Result>): Promise<MeteredResult<Result>> {
    const key = op.idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 255) {
      throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    }
    const fingerprint = fingerprintRequest({ kind: op.kind, body: op.body ?? null });
    const leaseToken = randomUUID();

    const started = await withTransaction<Started>(this.pool, async (db) => {
      const account = await lockAccount(db, op.spender.billingAccountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);

      const existing = await db.query<LedgerRow>(
        `SELECT * FROM usage_ledger WHERE billing_account_id = $1 AND idempotency_key = $2`,
        [account.id, key],
      );
      const prior = existing.rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) {
          throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
        }
        return { replayOf: prior, ledger: prior, jobId: null };
      }

      await requireFeature(db, snapshot, op.feature);
      if (op.checkCapacity) {
        const inFlight = await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ai_jobs
            WHERE billing_account_id = $1 AND kind = $2 AND status IN ('queued', 'running')`,
          [account.id, op.kind],
        );
        await op.checkCapacity({ db, account, snapshot, inFlight: inFlight.rows[0].n });
      }

      const reserved = await reserve(
        db,
        {
          billingAccountId: account.id,
          unit: op.unit,
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          requestId: op.requestId,
          candidateAuthUserId: null,
        },
        (version) => this.catalogs.get(db, version),
        this.clock.now(),
      );
      const job = await db.query<{ id: string }>(
        `INSERT INTO ai_jobs
           (billing_account_id, workspace_id, owner_auth_user_id, kind, unit, ledger_id, idempotency_key, status,
            input_versions, provider, prompt_template_version, output_schema_version, created_at,
            lease_token, lease_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'running', $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          account.id,
          account.workspace_id,
          op.spender.authUserId,
          op.kind,
          op.unit,
          reserved.ledger.id,
          key,
          JSON.stringify(op.provenance?.inputVersions ?? {}),
          op.provenance?.provider ?? null,
          op.provenance?.promptTemplateVersion ?? null,
          op.provenance?.outputSchemaVersion ?? null,
          this.clock.now(),
          leaseToken,
          new Date(this.clock.now().getTime() + this.lease.leaseMs),
        ],
      );
      return { replayOf: null, ledger: reserved.ledger, jobId: job.rows[0].id };
    });

    if (started.replayOf !== null) return this.replay(op, started.replayOf);
    const { ledger, jobId } = started;

    let output: Output;
    const heartbeat = this.keepLease(jobId, leaseToken);
    try {
      output = await op.execute();
    } catch (error) {
      heartbeat.stop();
      throw await this.fail(ledger, jobId, leaseToken, error);
    }
    heartbeat.stop();

    let result: Result;
    try {
      result = await withTransaction(this.pool, async (db) => {
        // Same lock order as the sweep (account, then job), so the two serialise instead of deadlocking.
        await lockAccount(db, ledger.billing_account_id);
        // A provider call can outlast an account deletion; nothing is saved for a deleted or deleting person.
        if (!(await isLiveSpender(db, op.spender))) {
          throw new BillingError('permission_denied', { reason: 'account_deleted' });
        }
        await this.requireLease(db, jobId, leaseToken);
        const saved = await op.save(db, output);
        await commit(db, ledger.billing_account_id, ledger.id, this.clock.now());
        await db.query(
          `UPDATE ai_jobs SET status = 'succeeded', result = $2, finished_at = $3 WHERE id = $1`,
          [jobId, JSON.stringify(saved), this.clock.now()],
        );
        return saved;
      });
    } catch (error) {
      throw await this.fail(ledger, jobId, leaseToken, error);
    }

    return {
      result,
      usage: await this.usage(ledger.billing_account_id, op.unit, 'committed'),
      jobId,
      replayed: false,
    };
  }

  /** Reads the job for the caller's account only. */
  async job(billingAccountId: string, jobId: string): Promise<{ id: string; kind: string; status: JobRow['status']; ledgerState: LedgerRow['state']; errorCode: string | null }> {
    const res = await this.pool.query<JobRow & { state: LedgerRow['state'] }>(
      `SELECT j.id, j.kind, j.status, j.result, j.error_code, j.ledger_id, l.state
         FROM ai_jobs j JOIN usage_ledger l ON l.id = j.ledger_id
        WHERE j.id = $1 AND j.billing_account_id = $2`,
      [jobId, billingAccountId],
    );
    const row = res.rows[0];
    if (!row) throw new BillingError('not_found', { jobId });
    return { id: row.id, kind: row.kind, status: row.status, ledgerState: row.state, errorCode: row.error_code };
  }

  /**
   * Worker sweep: a job still `running` after `olderThanMs` belonged to a
   * request whose process is gone (Phase 1 runs on the request, and a
   * request times out long before this). Its reservation is released.
   */
  async releaseAbandoned(olderThanMs: number): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - olderThanMs);
    // A leased job is abandoned only when its lease ran out (process gone, or
    // past maxRunMs); a row from before leases existed falls back to its age.
    const stale = await this.pool.query<{ id: string; ledger_id: string; billing_account_id: string }>(
      `SELECT id, ledger_id, billing_account_id FROM ai_jobs
        WHERE status = 'running'
          AND ((lease_expires_at IS NOT NULL AND lease_expires_at <= $1) OR (lease_expires_at IS NULL AND created_at < $2))`,
      [now, cutoff],
    );
    let released = 0;
    for (const job of stale.rows) {
      try {
        const done = await withTransaction(this.pool, async (db) => {
          await lockAccount(db, job.billing_account_id);
          const still = await db.query<{ state: LedgerRow['state'] }>(
            `SELECT l.state FROM ai_jobs j JOIN usage_ledger l ON l.id = j.ledger_id
              WHERE j.id = $1
                AND j.status = 'running'
                AND ((j.lease_expires_at IS NOT NULL AND j.lease_expires_at <= $2) OR (j.lease_expires_at IS NULL AND j.created_at < $3))
              FOR UPDATE OF j`,
            [job.id, now, cutoff],
          );
          const state = still.rows[0]?.state;
          if (!state) return false;
          // A committed reservation with no saved result is an operator case; the unit is not given back.
          const code = state === 'committed' ? 'not_confirmed' : 'abandoned';
          if (state === 'reserved') await release(db, job.billing_account_id, job.ledger_id, this.clock.now());
          await db.query(
            `UPDATE ai_jobs SET status = 'failed', error_code = $2, finished_at = $3 WHERE id = $1`,
            [job.id, code, this.clock.now()],
          );
          return state === 'reserved';
        });
        if (done) released += 1;
      } catch {
        // One job that cannot be closed must not stop the sweep; it is retried next run.
      }
    }
    return released;
  }

  private async replay<Output, Result extends JsonValue>(
    op: MeteredOperation<Output, Result>,
    ledger: LedgerRow,
  ): Promise<MeteredResult<Result>> {
    const res = await this.pool.query<JobRow>(
      `SELECT id, kind, status, result, error_code, ledger_id FROM ai_jobs WHERE ledger_id = $1`,
      [ledger.id],
    );
    const job = res.rows[0];
    if (!job || job.kind !== op.kind) throw new BillingError('idempotency_mismatch', { idempotencyKey: ledger.idempotency_key });
    if (job.status === 'succeeded') {
      return {
        result: job.result as Result,
        usage: await this.usage(ledger.billing_account_id, op.unit, ledger.state),
        jobId: job.id,
        replayed: true,
      };
    }
    if (job.status === 'failed') {
      throw new BillingError('provider_unavailable', { released: ledger.state === 'released', jobId: job.id });
    }
    throw new BillingError('request_in_progress', { jobId: job.id });
  }

  /**
   * Releases the reservation and marks the job failed in one transaction.
   * Returns the error to throw: a contract error keeps its code, anything
   * else is `provider_unavailable`. `released` says whether the release
   * committed.
   */
  private async fail(ledger: LedgerRow, jobId: string, leaseToken: string, cause: unknown): Promise<BillingError> {
    const code = isBillingError(cause) ? cause.code : 'provider_unavailable';
    let released = false;
    try {
      released = await withTransaction(this.pool, async (db) => {
        await lockAccount(db, ledger.billing_account_id);
        const job = await db.query<{ status: string; lease_token: string | null }>(
          `SELECT status, lease_token FROM ai_jobs WHERE id = $1 FOR UPDATE`,
          [jobId],
        );
        const row = job.rows[0];
        // An erase removed the job row while the call ran: this process is the
        // only one left that knows the reservation, so it releases it.
        if (!row) {
          await release(db, ledger.billing_account_id, ledger.id, this.clock.now());
          return true;
        }
        // Only the lease holder closes a running job; if the sweep already did, report what it left.
        if (row.status === 'running' && (row.lease_token === null || row.lease_token === leaseToken)) {
          await release(db, ledger.billing_account_id, ledger.id, this.clock.now());
          await db.query(
            `UPDATE ai_jobs SET status = 'failed', error_code = $2, finished_at = $3 WHERE id = $1`,
            [jobId, code, this.clock.now()],
          );
          return true;
        }
        const state = await db.query<{ state: string }>(`SELECT state FROM usage_ledger WHERE id = $1`, [ledger.id]);
        return state.rows[0]?.state === 'released';
      });
    } catch {
      released = false;
    }
    const details = isBillingError(cause) ? { ...cause.details } : {};
    return new BillingError(code, { ...details, released, jobId });
  }

  /** Refuses the save unless this process still holds a live lease on a running job. */
  private async requireLease(db: Db, jobId: string, leaseToken: string): Promise<void> {
    const res = await db.query<{ status: string; lease_token: string | null; lease_expires_at: Date | null }>(
      `SELECT status, lease_token, lease_expires_at FROM ai_jobs WHERE id = $1 FOR UPDATE`,
      [jobId],
    );
    const job = res.rows[0];
    const live =
      job !== undefined &&
      job.status === 'running' &&
      job.lease_token === leaseToken &&
      job.lease_expires_at !== null &&
      job.lease_expires_at > this.clock.now();
    if (!live) throw new BillingError('provider_unavailable', { reason: 'lease_expired' });
  }

  /**
   * Renews the lease while the provider call runs. Stops by itself at
   * `maxRunMs`, or as soon as a renewal finds the lease gone (expired, taken
   * by the sweep, or the job closed), so a stale process never revives a
   * released job.
   */
  private keepLease(jobId: string, leaseToken: string): { stop: () => void } {
    if (this.lease.heartbeatEveryMs <= 0) return { stop: () => undefined };
    const started = this.clock.now().getTime();
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      const now = this.clock.now();
      if (now.getTime() - started >= this.lease.maxRunMs) {
        stopped = true;
        clearInterval(timer);
        return;
      }
      void this.pool
        .query(
          `UPDATE ai_jobs SET lease_expires_at = $3
            WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > $4`,
          [jobId, leaseToken, new Date(now.getTime() + this.lease.leaseMs), now],
        )
        .then((res) => {
          if (res.rowCount === 0) {
            stopped = true;
            clearInterval(timer);
          }
        })
        .catch(() => undefined);
    }, this.lease.heartbeatEveryMs);
    timer.unref?.();
    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  private async usage(billingAccountId: string, unit: UsageUnit, ledgerState: LedgerRow['state']): Promise<UsageView> {
    const account = await readAccount(this.pool, billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const balance: UnitBalance = await unitBalance(this.pool, account, snapshot, unit, this.clock.now());
    return {
      unit,
      includedGranted: balance.includedGranted,
      includedRemaining: balance.includedRemaining,
      packRemaining: balance.packRemaining,
      packHeld: balance.packHeld,
      renewalDate: balance.renewalDate,
      ledgerState,
    };
  }
}
