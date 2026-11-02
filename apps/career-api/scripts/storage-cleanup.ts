/**
 * One sweep of abandoned stored objects, for a scheduled task that runs with
 * the API's storage role (`pnpm --filter api storage:cleanup`). Prints counts
 * only, never keys or the database address.
 */
import { Pool } from 'pg';
import { StorageCleanupService, createObjectStorage, loadRepoEnv, readDatabaseUrl } from '@flacroncv/career-server';

async function main(): Promise<number> {
  loadRepoEnv(__dirname);
  const pool = new Pool({ connectionString: readDatabaseUrl(process.env), max: 2 });
  try {
    const cleanup = new StorageCleanupService(pool, createObjectStorage(process.env));
    const total = { deleted: 0, kept: 0, failed: 0, queuedExports: 0 };
    // Up to 20 batches of 50; whatever is left waits for the next run.
    for (let batch = 0; batch < 20; batch += 1) {
      const run = await cleanup.runOnce(50);
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += run[key];
      if (run.deleted + run.kept + run.failed === 0) break;
    }
    console.log(JSON.stringify(total));
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : 'Storage cleanup failed');
    process.exit(1);
  },
);
