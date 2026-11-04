import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AccountPrivacyService, DEFAULT_CLOSURE_SWEEP, StorageCleanupService, storageCleanupIntervalMs } from '@flacroncv/career-server';
import type { ClosureSweepOptions } from '@flacroncv/career-server';
import type { ObjectStorage, V1AccountSource } from '@flacroncv/career-server';
import { V1_ACCOUNT_SOURCE } from '../integration/career-access.service';
import { DatabaseService } from '../database/database.service';
import { OBJECT_STORAGE } from './storage.token';

/**
 * Sweeps abandoned stored objects on a timer inside the API, which already
 * has the storage role; the worker keeps no storage access. Several API
 * processes can run it at once (rows are claimed with SKIP LOCKED). A run
 * that fails is simply tried again on the next tick. The same tick finishes
 * account deletions interrupted after their sign-in was removed, since that
 * also deletes stored objects.
 *
 * V1 integration: the tick also erases the career data of accounts V1 has
 * closed (soft-deleted or deactivated), however they were closed. A V1
 * record that is missing or unreadable is never treated as closed.
 *
 * The three steps run independently: an object-storage outage must not stop
 * the erasure of closed accounts (V1 web and mobile deletions rely on this
 * sweep when the career service was unreachable at deletion time).
 */
@Injectable()
export class StorageCleanupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly cleanup: StorageCleanupService;
  private readonly logger = new Logger('StorageCleanup');

  constructor(
    @Inject(DatabaseService) database: DatabaseService,
    @Inject(OBJECT_STORAGE) storage: ObjectStorage,
    @Inject(AccountPrivacyService) private readonly privacy: AccountPrivacyService,
    @Inject(V1_ACCOUNT_SOURCE) private readonly v1: V1AccountSource,
  ) {
    this.cleanup = new StorageCleanupService(database.connectionPool, storage);
  }

  onApplicationBootstrap(): void {
    const every = storageCleanupIntervalMs(process.env);
    if (every <= 0) {
      this.logger.warn('Storage cleanup and closed-account erasure are switched off (interval <= 0).');
      return;
    }
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Each step retries on the next tick by itself. Nothing is logged that could name a file or a person.
      await this.step('storage sweep', () => this.cleanup.runOnce());
      await this.step('interrupted deletions', () => this.privacy.finishInterruptedDeletions());
      await this.step('closed V1 accounts', async () => {
        const run = await this.privacy.eraseClosedV1Accounts(async (uid) => {
          const account = await this.v1.read(uid);
          return account !== null && !account.active;
        }, closureSweepOptions(process.env));
        // Counts only, never who. Logged when something needs attention.
        if (run.failed > 0 || run.backlog > 0) {
          this.logger.warn(
            `closed V1 accounts: checked ${run.checked}, erased ${run.erased}, failed ${run.failed}, still due ${run.backlog}, oldest overdue ${Math.round(run.oldestDueMs / 60_000)} min`,
          );
        }
      });
    } finally {
      this.running = false;
    }
  }

  private async step(name: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch {
      this.logger.warn(`${name} failed; retrying on the next tick`);
    }
  }
}

/**
 * V1_CLOSURE_BATCH_SIZE (default 50, 1–500), V1_CLOSURE_CONCURRENCY (default 4,
 * 1–16), V1_CLOSURE_TIME_BUDGET_MS (default 60000, 1000–600000). Out-of-range
 * or unparsable values fall back to the default; the bounds keep one tick from
 * flooding the database.
 */
export function closureSweepOptions(env: NodeJS.ProcessEnv): Partial<ClosureSweepOptions> {
  const read = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(env[name]?.trim());
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  };
  return {
    batchSize: read('V1_CLOSURE_BATCH_SIZE', DEFAULT_CLOSURE_SWEEP.batchSize, 1, 500),
    concurrency: read('V1_CLOSURE_CONCURRENCY', DEFAULT_CLOSURE_SWEEP.concurrency, 1, 16),
    timeBudgetMs: read('V1_CLOSURE_TIME_BUDGET_MS', DEFAULT_CLOSURE_SWEEP.timeBudgetMs, 1000, 600_000),
  };
}
