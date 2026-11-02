import PgBoss from 'pg-boss';
import { Client } from 'pg';
import { redactDatabaseUrl } from '@flacroncv/career-server';
import type { WorkerConfig } from './config';
import { DEFAULT_HANDLERS, JobHandler } from './jobs';

export class Worker {
  readonly boss: PgBoss;

  constructor(
    private readonly config: WorkerConfig,
    private readonly handlers: Readonly<Record<string, JobHandler>> = DEFAULT_HANDLERS,
    private readonly schedules: Readonly<Record<string, string>> = {},
  ) {
    this.boss = new PgBoss({ connectionString: config.databaseUrl, schema: config.bossSchema });
    this.boss.on('error', (error) => {
      console.error(`pg-boss error: ${redactDatabaseUrl(error.message, config.databaseUrl)}`);
    });
  }

  /** Starts pg-boss, makes sure every known queue exists, and registers the schedules (UTC). */
  async start(): Promise<void> {
    await this.boss.start();
    for (const name of Object.keys(this.handlers)) {
      await this.boss.createQueue(name);
    }
    for (const [name, cron] of Object.entries(this.schedules)) {
      if (!this.handlers[name]) throw new Error(`Schedule ${name} has no handler`);
      await this.boss.schedule(name, cron, {}, { tz: 'UTC' });
    }
  }

  /** Polls every known queue until `stop()`. */
  async work(): Promise<void> {
    for (const [name, handler] of Object.entries(this.handlers)) {
      await this.boss.work(name, async (jobs) => {
        for (const job of jobs) {
          await handler(job.data);
        }
      });
    }
  }

  /**
   * Processes the jobs that are waiting now, then returns how many
   * completed. A handler error marks that job failed and moves on.
   */
  async drain(): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;
    for (const [name, handler] of Object.entries(this.handlers)) {
      for (;;) {
        const jobs = await this.boss.fetch(name, { batchSize: 10 });
        if (jobs.length === 0) break;
        for (const job of jobs) {
          try {
            await handler(job.data);
            await this.boss.complete(name, job.id);
            completed += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'handler failed';
            await this.boss.fail(name, job.id, { message });
            failed += 1;
          }
        }
      }
    }
    return { completed, failed };
  }

  /** Connects, starts pg-boss, and stops again. Throws when either fails. */
  async check(): Promise<void> {
    const client = new Client({ connectionString: this.config.databaseUrl, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
    await this.start();
    await this.stop();
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, wait: true });
  }
}
