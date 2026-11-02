import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AccountPrivacyService, StorageCleanupService, storageCleanupIntervalMs } from '@flacroncv/career-server';
import type { ObjectStorage } from '@flacroncv/career-server';
import { DatabaseService } from '../database/database.service';
import { OBJECT_STORAGE } from './storage.token';

/**
 * Sweeps abandoned stored objects on a timer inside the API, which already
 * has the storage role; the worker keeps no storage access. Several API
 * processes can run it at once (rows are claimed with SKIP LOCKED). A run
 * that fails is simply tried again on the next tick. The same tick finishes
 * account deletions interrupted after their sign-in was removed, since that
 * also deletes stored objects.
 */
@Injectable()
export class StorageCleanupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly cleanup: StorageCleanupService;

  constructor(
    @Inject(DatabaseService) database: DatabaseService,
    @Inject(OBJECT_STORAGE) storage: ObjectStorage,
    @Inject(AccountPrivacyService) private readonly privacy: AccountPrivacyService,
  ) {
    this.cleanup = new StorageCleanupService(database.connectionPool, storage);
  }

  onApplicationBootstrap(): void {
    const every = storageCleanupIntervalMs(process.env);
    if (every <= 0) return;
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
      await this.cleanup.runOnce();
      await this.privacy.finishInterruptedDeletions();
    } catch {
      // Storage or the database is unavailable; the next tick retries. Nothing is logged that could name a file.
    } finally {
      this.running = false;
    }
  }
}
