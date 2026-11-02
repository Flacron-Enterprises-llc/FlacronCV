import type { Pool } from 'pg';
import type { Clock } from '../billing/billing.service';
import { withTransaction } from '../billing/db';
import { isBillingError } from '../billing/errors';
import type { ObjectStorage } from './object-storage';

const systemClock: Clock = { now: () => new Date() };

/** A claimed row is skipped by other sweepers for this long, so a crashed sweep is retried later. */
export const CLEANUP_LEASE_MS = 5 * 60 * 1000;
/** Retry delay: one minute, doubling per attempt, at most six hours. */
export function cleanupBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

export interface CleanupRun {
  deleted: number;
  kept: number;
  failed: number;
  queuedExports: number;
}

/**
 * Deletes abandoned objects listed in `stored_object_intents`: uploads that
 * never finished, replaced files whose delete failed, and expired or failed
 * account exports. Runs where storage credentials already live (the API
 * process or a one-off task with the API's role), so the worker keeps no
 * storage access. Safe to run from several processes at once.
 */
export class StorageCleanupService {
  constructor(
    private readonly pool: Pool,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock = systemClock,
  ) {}

  async runOnce(limit = 50): Promise<CleanupRun> {
    const queuedExports = await this.queueSpentExports(limit);
    const claimed = await this.claim(limit);
    const run: CleanupRun = { deleted: 0, kept: 0, failed: 0, queuedExports };
    for (const row of claimed) {
      // Still in use: an item points at it, or an export link is live. Nothing to delete.
      const used = await this.pool.query(
        `SELECT 1 FROM career_evidence WHERE attachment_object_key = $1
         UNION ALL
         SELECT 1 FROM account_exports WHERE object_key = $1 AND status = 'ready' AND expires_at > $2
         LIMIT 1`,
        [row.object_key, this.clock.now()],
      );
      if (used.rows.length > 0) {
        await this.pool.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [row.object_key]);
        run.kept += 1;
        continue;
      }
      try {
        await this.storage.delete(row.object_key);
        await this.pool.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [row.object_key]);
        run.deleted += 1;
      } catch (error) {
        const code = isBillingError(error) ? `${error.code}:${String(error.details.reason ?? '')}` : 'error';
        await this.pool.query(
          `UPDATE stored_object_intents SET last_error = $2, not_before = $3 WHERE object_key = $1`,
          [row.object_key, code.slice(0, 80), new Date(this.clock.now().getTime() + cleanupBackoffMs(row.attempts))],
        );
        run.failed += 1;
      }
    }
    return run;
  }

  /** Due rows, locked against other sweepers and in-progress uploads, then leased. */
  private async claim(limit: number): Promise<Array<{ object_key: string; attempts: number }>> {
    return withTransaction(this.pool, async (db) => {
      const due = await db.query<{ object_key: string; attempts: number }>(
        `SELECT object_key, attempts FROM stored_object_intents
          WHERE not_before <= $1 ORDER BY not_before LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [this.clock.now(), limit],
      );
      if (due.rows.length === 0) return [];
      const keys = due.rows.map((row) => row.object_key);
      await db.query(
        `UPDATE stored_object_intents SET attempts = attempts + 1, not_before = $2 WHERE object_key = ANY($1::text[])`,
        [keys, new Date(this.clock.now().getTime() + CLEANUP_LEASE_MS)],
      );
      return due.rows.map((row) => ({ object_key: row.object_key, attempts: row.attempts + 1 }));
    });
  }

  /**
   * Expired exports, failed exports, and exports stuck `queued` for an hour
   * hand their object to the queue and stop pointing at it. Expired links
   * already show `failed`; the object is no longer needed.
   */
  private async queueSpentExports(limit: number): Promise<number> {
    return withTransaction(this.pool, async (db) => {
      const now = this.clock.now();
      const spent = await db.query<{ id: string; object_key: string; auth_user_id: string }>(
        `SELECT id, object_key, auth_user_id FROM account_exports
          WHERE object_key IS NOT NULL
            AND (status = 'failed' OR (status = 'ready' AND expires_at <= $1) OR (status = 'queued' AND created_at <= $2))
          LIMIT $3 FOR UPDATE SKIP LOCKED`,
        [now, new Date(now.getTime() - 60 * 60 * 1000), limit],
      );
      for (const row of spent.rows) {
        await db.query(
          `INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, created_at, not_before)
           VALUES ($1, $2, $3, $3) ON CONFLICT (object_key) DO NOTHING`,
          [row.object_key, row.auth_user_id, now],
        );
        await db.query(`UPDATE account_exports SET object_key = NULL WHERE id = $1`, [row.id]);
      }
      return spent.rows.length;
    });
  }
}

/**
 * How often the API sweeps abandoned objects. `STORAGE_CLEANUP_INTERVAL_MS`
 * wins (0 turns it off, minimum one minute); otherwise every 15 minutes when
 * a store is configured, and never in tests.
 */
export function storageCleanupIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.STORAGE_CLEANUP_INTERVAL_MS?.trim();
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.max(60_000, Math.floor(value));
  }
  if (env.NODE_ENV === 'test') return 0;
  const mode = env.OBJECT_STORAGE?.trim().toLowerCase() ?? '';
  return mode === 's3' || mode === 'local' ? 15 * 60 * 1000 : 0;
}
