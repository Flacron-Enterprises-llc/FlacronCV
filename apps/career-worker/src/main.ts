import { Pool } from 'pg';
import { loadRepoEnv, redactDatabaseUrl } from '@flacroncv/career-server';
import { readWorkerConfig, WorkerConfig } from './config';
import { DEFAULT_HANDLERS, alertHandlers, feedHandlers, maintenanceHandlers, SCHEDULES } from './jobs';
import { Worker } from './worker';

/**
 * `--check`: connect, start pg-boss, stop, exit 0. The deploy health check.
 * `--drain`: process what is queued now, then exit.
 * No flag: run until SIGINT or SIGTERM.
 */
async function main(argv: readonly string[]): Promise<number | 'running'> {
  loadRepoEnv(__dirname);

  let config: WorkerConfig;
  try {
    config = readWorkerConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Startup failed');
    return 1;
  }

  if (argv.includes('--check')) {
    await new Worker(config).check();
    console.log('Worker health check passed');
    return 0;
  }

  const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  pool.on('error', () => console.error('Database pool reported an idle client error'));
  const draining = argv.includes('--drain');
  // A drain processes what is queued now; it does not register the schedules.
  const worker = new Worker(
    config,
    { ...DEFAULT_HANDLERS, ...maintenanceHandlers(pool), ...alertHandlers(pool), ...feedHandlers(pool) },
    draining ? {} : SCHEDULES,
  );
  await worker.start();

  if (draining) {
    const result = await worker.drain();
    await worker.stop();
    await pool.end();
    console.log(`Drained: ${result.completed} completed, ${result.failed} failed`);
    return result.failed === 0 ? 0 : 1;
  }

  await worker.work();
  console.log('FlacronCV worker running');
  const shutdown = () => {
    worker
      .stop()
      .then(() => pool.end())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return 'running';
}

main(process.argv.slice(2)).then(
  (result) => {
    if (result !== 'running') process.exit(result);
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Worker failed';
    console.error(redactDatabaseUrl(message, process.env.DATABASE_URL));
    process.exit(1);
  },
);
