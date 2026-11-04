import { randomUUID } from 'crypto';
import type { AccountRow } from '../billing/accounts';
import { createBillingFixture } from '../testing/billing-fixture';
import type { BillingFixture } from '../testing/billing-fixture';
import { MeteredOperation, MeteringService } from './metering.service';

type Op = MeteredOperation<string, { text: string }>;
const MIN = 60_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Leases on paid jobs: a fake provider and a controlled clock, no real AI call. */
describe('MeteringService job leases', () => {
  let f: BillingFixture;
  let live: MeteringService;
  let crashed: MeteringService;

  beforeAll(async () => {
    f = await createBillingFixture('metering_lease', '2026-10-16T10:00:00Z');
    // A real heartbeat (fast in real time) and a process that never renews (stands for a crash).
    // The live instance's lease is wide (5 min) so a heartbeat delayed by test load cannot be mistaken for a crash.
    live = new MeteringService(f.db.pool, f.clock, { leaseMs: 5 * MIN, heartbeatEveryMs: 15, maxRunMs: 30 * MIN });
    crashed = new MeteringService(f.db.pool, f.clock, { leaseMs: 2 * MIN, heartbeatEveryMs: 0 });
    await f.db.pool.query(`CREATE TABLE lease_outputs (id serial PRIMARY KEY, account_id uuid, text text)`);
  });

  afterEach(() => {
    f.clock.set('2026-10-16T10:00:00Z');
  });

  afterAll(async () => {
    if (f) await f.drop();
  });

  function gated(account: AccountRow, overrides: Partial<Op> = {}) {
    let open: (value: string) => void = () => undefined;
    let shut: (error: Error) => void = () => undefined;
    const gate = new Promise<string>((resolve, reject) => {
      open = resolve;
      shut = reject;
    });
    const op: Op = {
      spender: { billingAccountId: account.id, workspaceId: account.workspace_id, authUserId: account.auth_user_id ?? '' },
      kind: 'test.generate',
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey: `key-${randomUUID()}`,
      body: { prompt: 'hello' },
      requestId: randomUUID(),
      execute: () => gate,
      save: async (db, output) => {
        await db.query(`INSERT INTO lease_outputs (account_id, text) VALUES ($1, $2)`, [account.id, output]);
        return { text: output };
      },
      ...overrides,
    };
    return { op, open, shut };
  }

  const remaining = async (id: string) => (await f.billing.unitBalance(id, 'document_credit')).includedRemaining;
  const ledger = async (id: string) =>
    (await f.db.pool.query<{ state: string }>(`SELECT state FROM usage_ledger WHERE billing_account_id = $1`, [id])).rows.map((r) => r.state);
  const outputs = async (id: string) =>
    (await f.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM lease_outputs WHERE account_id = $1`, [id])).rows[0].n;
  const jobs = async (id: string) =>
    (await f.db.pool.query<{ status: string; error_code: string | null }>(`SELECT status, error_code FROM ai_jobs WHERE billing_account_id = $1`, [id])).rows;
  /** Moves the clock in one-minute steps, letting real heartbeats run in between. */
  const advance = async (minutes: number) => {
    for (let i = 0; i < minutes; i += 1) {
      f.clock.set(new Date(f.clock.now().getTime() + MIN).toISOString());
      await wait(150);
    }
  };

  it('a live job running past 15 minutes keeps its reservation and commits once', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const { op, open } = gated(account);
    const run = live.run(op);
    await wait(100);
    await advance(20);
    expect(await live.releaseAbandoned(15 * MIN)).toBe(0);
    open('long answer');
    await expect(run).resolves.toMatchObject({ replayed: false, result: { text: 'long answer' } });
    expect(await ledger(account.id)).toEqual(['committed']);
    expect(await remaining(account.id)).toBe(before - 1);
    expect(await outputs(account.id)).toBe(1);
  });

  it('a crashed worker: the expired lease is released, and the late provider answer saves and charges nothing', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const { op, open } = gated(account);
    const run = crashed.run(op);
    await wait(100);
    expect(await live.releaseAbandoned(15 * MIN)).toBe(0); // lease still valid
    f.clock.set('2026-10-16T10:03:00Z');
    expect(await live.releaseAbandoned(15 * MIN)).toBe(1);
    expect(await remaining(account.id)).toBe(before);
    open('late answer');
    await expect(run).rejects.toMatchObject({ code: 'provider_unavailable', details: { reason: 'lease_expired', released: true } });
    expect(await ledger(account.id)).toEqual(['released']);
    expect(await outputs(account.id)).toBe(0);
    expect(await jobs(account.id)).toEqual([{ status: 'failed', error_code: 'abandoned' }]);
  });

  it('renewal stops at the maximum run time, so a hung call cannot hold a reservation forever', async () => {
    const short = new MeteringService(f.db.pool, f.clock, { leaseMs: 2 * MIN, heartbeatEveryMs: 15, maxRunMs: 5 * MIN });
    const account = await f.freeAccount();
    const { op, open } = gated(account);
    const run = short.run(op);
    await wait(100);
    await advance(8);
    expect(await short.releaseAbandoned(15 * MIN)).toBe(1);
    open('too late');
    await expect(run).rejects.toMatchObject({ details: { reason: 'lease_expired' } });
    expect(await ledger(account.id)).toEqual(['released']);
  });

  it('completion racing the sweep ends in exactly one consistent outcome', async () => {
    const account = await f.freeAccount();
    const { op, open } = gated(account);
    const run = crashed.run(op).then(
      () => 'saved',
      () => 'refused',
    );
    await wait(100);
    f.clock.set('2026-10-16T10:02:30Z');
    open('racing answer');
    const [outcome, released] = await Promise.all([run, live.releaseAbandoned(15 * MIN)]);
    const states = await ledger(account.id);
    const [job] = await jobs(account.id);
    // The lease had expired, so the save is refused whichever wins the lock; never charged and failed at once.
    expect(outcome).toBe('refused');
    expect(states).toEqual(['released']);
    expect(job.status).toBe('failed');
    expect(await outputs(account.id)).toBe(0);
    expect(released).toBeLessThanOrEqual(1);
  });

  it('a live job and a sweep at the same moment: the job commits and the sweep leaves it alone', async () => {
    const account = await f.freeAccount();
    const { op, open } = gated(account);
    const run = live.run(op);
    await wait(100);
    open('on time');
    const [result, released] = await Promise.all([run, live.releaseAbandoned(15 * MIN)]);
    expect(result).toMatchObject({ replayed: false });
    expect(released).toBe(0);
    expect(await ledger(account.id)).toEqual(['committed']);
  });

  it('duplicate workers with the same key run the provider once and charge once', async () => {
    const account = await f.freeAccount();
    let calls = 0;
    const { op, open } = gated(account);
    const counted: Op = { ...op, execute: () => { calls += 1; return op.execute(); } };
    const first = live.run(counted);
    await wait(100);
    await expect(live.run({ ...counted })).rejects.toMatchObject({ code: 'request_in_progress' });
    open('once');
    await first;
    await expect(live.run({ ...counted })).resolves.toMatchObject({ replayed: true });
    expect(calls).toBe(1);
    expect(await ledger(account.id)).toEqual(['committed']);
  });

  it('a provider failure releases the unit and says so', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const { op, shut } = gated(account);
    const run = live.run(op);
    await wait(100);
    shut(new Error('provider down'));
    await expect(run).rejects.toMatchObject({ code: 'provider_unavailable', details: { released: true } });
    expect(await remaining(account.id)).toBe(before);
    expect(await ledger(account.id)).toEqual(['released']);
  });

  it('account deletion during generation: nothing is saved, the unit is released', async () => {
    const account = await f.freeAccount();
    const { op, open } = gated(account);
    const run = live.run(op);
    await wait(100);
    await f.db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = $1`, [account.auth_user_id]);
    open('answer for a deleted person');
    await expect(run).rejects.toMatchObject({ details: { reason: 'account_deleted', released: true } });
    expect(await outputs(account.id)).toBe(0);
    expect(await ledger(account.id)).toEqual(['released']);
  });
});
