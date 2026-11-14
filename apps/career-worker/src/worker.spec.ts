import { spawn } from 'child_process';
import { join } from 'path';
import { BillingService, buildCatalogSnapshot } from '@flacroncv/career-server';
import { createTestDatabase, TestDatabase } from '@flacroncv/career-server/src/testing';
import { DEFAULT_HANDLERS, alertHandlers, maintenanceHandlers, QUEUES, SCHEDULES } from './jobs';
import { Worker } from './worker';

const TSX_CLI = require.resolve('tsx/cli');
const MAIN = join(__dirname, 'main.ts');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runWorkerProcess(args: string[], env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, MAIN, ...args], {
      cwd: join(__dirname, '..'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitForState(worker: Worker, id: string, state: string, timeoutMs = 20000): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last: string | undefined;
  while (Date.now() < deadline) {
    const job = await worker.boss.getJobById(QUEUES.noop, id);
    last = job?.state;
    if (last === state) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

describe('worker', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase('worker');
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('enqueues and completes a no-op job', async () => {
    const worker = new Worker({ databaseUrl: db.url, bossSchema: db.schema });
    await worker.start();
    try {
      await worker.work();
      const id = await worker.boss.send(QUEUES.noop, {});
      expect(id).toBeTruthy();
      expect(await waitForState(worker, id as string, 'completed')).toBe('completed');
    } finally {
      await worker.stop();
    }
  });

  it('completes in a second process a job this process enqueued, and this process sees it', async () => {
    const producer = new Worker({ databaseUrl: db.url, bossSchema: db.schema });
    await producer.start();
    try {
      const id = (await producer.boss.send(QUEUES.noop, { from: 'test-process' })) as string;
      expect((await producer.boss.getJobById(QUEUES.noop, id))?.state).toBe('created');

      const result = await runWorkerProcess(['--drain'], { DATABASE_URL: db.url, PGBOSS_SCHEMA: db.schema });
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Drained: 1 completed, 0 failed');

      expect((await producer.boss.getJobById(QUEUES.noop, id))?.state).toBe('completed');
    } finally {
      await producer.stop();
    }
  });

  it('registers the billing schedules and runs renewals and the abandoned-reservation sweep from the queue', async () => {
    const billing = new BillingService(db.pool);
    await billing.publishCatalog();
    const due = await billing.createFreeAccount({
      authUserId: 'worker-renewal',
      anchor: new Date(Date.now() - 40 * 86_400_000),
      catalogVersion: buildCatalogSnapshot().version,
    });
    await db.pool.query(
      `UPDATE billing_accounts SET allowance_period_start = allowance_period_start - interval '1 month',
                                   allowance_period_end = allowance_period_end - interval '1 month'
        WHERE id = $1`,
      [due.id],
    );

    const worker = new Worker(
      { databaseUrl: db.url, bossSchema: db.schema },
      { ...DEFAULT_HANDLERS, ...maintenanceHandlers(db.pool), ...alertHandlers(db.pool) },
      SCHEDULES,
    );
    await worker.start();
    try {
      const names = (await worker.boss.getSchedules()).map((s) => s.name).sort();
      expect(names).toEqual(
        [QUEUES.packExpiry, QUEUES.renewals, QUEUES.releaseAbandoned, QUEUES.alertMatch, QUEUES.alertDigest, QUEUES.alertReminders].sort(),
      );

      await worker.boss.send(QUEUES.renewals, {});
      await worker.boss.send(QUEUES.packExpiry, {});
      await worker.boss.send(QUEUES.releaseAbandoned, {});
      expect(await worker.drain()).toEqual({ completed: 3, failed: 0 });
    } finally {
      await worker.stop();
    }
    const after = await db.pool.query<{ allowance_period_end: Date }>(
      `SELECT allowance_period_end FROM billing_accounts WHERE id = $1`,
      [due.id],
    );
    expect(after.rows[0].allowance_period_end.getTime()).toBeGreaterThan(Date.now());
  });

  it('alert jobs bind no channel without a provider, so nothing is recorded as sent', async () => {
    const handlers = alertHandlers(db.pool, { MAIL_DELIVERY: 'record' });
    expect(Object.keys(handlers).sort()).toEqual([QUEUES.alertMatch, QUEUES.alertDigest, QUEUES.alertReminders].sort());
    await handlers[QUEUES.alertReminders]!({});
    const sent = await db.pool.query(`SELECT 1 FROM notification_deliveries WHERE status = 'sent'`);
    expect(sent.rows).toHaveLength(0);
  });

  it('--check connects, starts pg-boss, and exits 0', async () => {
    const result = await runWorkerProcess(['--check'], { DATABASE_URL: db.url, PGBOSS_SCHEMA: db.schema });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Worker health check passed');
  });

  it('refuses an empty DATABASE_URL and names the variable', async () => {
    const result = await runWorkerProcess(['--check'], { DATABASE_URL: '' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Missing required environment variable: DATABASE_URL');
  });

  it('refuses a remote DATABASE_URL in development without printing it', async () => {
    const result = await runWorkerProcess(['--check'], {
      DATABASE_URL: 'postgresql://u:secret-pw@db.example.com:5432/x',
      NODE_ENV: 'development',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('must point at localhost');
    expect(result.stderr).not.toContain('secret-pw');
  });
});
