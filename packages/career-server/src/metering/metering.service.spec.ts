import { randomUUID } from 'crypto';
import type { AccountRow } from '../billing/accounts';
import { BillingError } from '../billing/errors';
import { createBillingFixture } from '../testing/billing-fixture';
import type { BillingFixture } from '../testing/billing-fixture';
import { checkCapacity } from './access';
import { MeteredOperation, MeteringService } from './metering.service';

type Op = MeteredOperation<string, { text: string }>;

describe('MeteringService: the section 11 request flow', () => {
  let f: BillingFixture;
  let metering: MeteringService;

  beforeAll(async () => {
    f = await createBillingFixture('metering', '2026-10-16T10:00:00Z');
    metering = new MeteringService(f.db.pool, f.clock);
    await f.db.pool.query(`CREATE TABLE test_outputs (id serial PRIMARY KEY, account_id uuid, text text)`);
  });

  afterAll(async () => {
    if (f) await f.drop();
  });

  function op(account: AccountRow, overrides: Partial<Op> = {}): Op & { calls: () => number } {
    let calls = 0;
    const base: Op = {
      spender: { billingAccountId: account.id, workspaceId: account.workspace_id, authUserId: account.auth_user_id ?? '' },
      kind: 'test.generate',
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey: `key-${randomUUID()}`,
      body: { prompt: 'hello' },
      requestId: randomUUID(),
      execute: async () => {
        calls += 1;
        return 'generated text';
      },
      save: async (db, output) => {
        const res = await db.query<{ id: number }>(
          `INSERT INTO test_outputs (account_id, text) VALUES ($1, $2) RETURNING id`,
          [account.id, output],
        );
        return { text: `${output}#${res.rows[0].id}` };
      },
    };
    const merged = { ...base, ...overrides };
    if (!overrides.execute) merged.execute = base.execute;
    return Object.assign(merged, { calls: () => calls });
  }

  async function ledgerRows(accountId: string): Promise<Array<{ state: string }>> {
    const res = await f.db.pool.query<{ state: string }>(
      `SELECT state FROM usage_ledger WHERE billing_account_id = $1 ORDER BY created_at`,
      [accountId],
    );
    return res.rows;
  }

  async function outputs(accountId: string): Promise<number> {
    const res = await f.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM test_outputs WHERE account_id = $1`, [
      accountId,
    ]);
    return res.rows[0].n;
  }

  async function remaining(accountId: string): Promise<number> {
    return (await f.billing.unitBalance(accountId, 'document_credit')).includedRemaining;
  }

  it('reserves, executes once, saves and commits together, and returns the balance and renewal date', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const o = op(account);
    const out = await metering.run(o);
    expect(o.calls()).toBe(1);
    expect(out.replayed).toBe(false);
    expect(out.result.text).toMatch(/^generated text#\d+$/);
    expect(out.usage).toMatchObject({
      unit: 'document_credit',
      includedRemaining: before - 1,
      ledgerState: 'committed',
      renewalDate: account.allowance_period_end,
    });
    expect(await ledgerRows(account.id)).toEqual([{ state: 'committed' }]);
    expect((await metering.job(account.id, out.jobId)).status).toBe('succeeded');
  });

  it('the same key and body returns the saved result without running or debiting again', async () => {
    const account = await f.freeAccount();
    const first = op(account);
    const a = await metering.run(first);
    const second = op(account, { idempotencyKey: first.idempotencyKey });
    const b = await metering.run(second);
    expect(second.calls()).toBe(0);
    expect(b).toMatchObject({ replayed: true, result: a.result, jobId: a.jobId });
    expect(await ledgerRows(account.id)).toHaveLength(1);
    expect(await outputs(account.id)).toBe(1);
  });

  it('the same key with another body, or for another operation, is idempotency_mismatch and runs nothing', async () => {
    const account = await f.freeAccount();
    const first = op(account);
    await metering.run(first);
    const otherBody = op(account, { idempotencyKey: first.idempotencyKey, body: { prompt: 'changed' } });
    await expect(metering.run(otherBody)).rejects.toMatchObject({ code: 'idempotency_mismatch' });
    const otherKind = op(account, { idempotencyKey: first.idempotencyKey, kind: 'test.other' });
    await expect(metering.run(otherKind)).rejects.toMatchObject({ code: 'idempotency_mismatch' });
    expect(otherBody.calls() + otherKind.calls()).toBe(0);
    expect(await ledgerRows(account.id)).toHaveLength(1);
  });

  it('refuses a missing Idempotency-Key before anything else', async () => {
    const account = await f.freeAccount();
    const o = op(account, { idempotencyKey: undefined });
    await expect(metering.run(o)).rejects.toMatchObject({ code: 'validation_error', details: { field: 'Idempotency-Key' } });
    expect(o.calls()).toBe(0);
    expect(await ledgerRows(account.id)).toHaveLength(0);
  });

  it('a provider failure releases the unit, says released, and a retry of that key does not run again', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    let calls = 0;
    const failing = op(account, {
      execute: async () => {
        calls += 1;
        throw new Error('model timeout with internal detail');
      },
    });
    const error = await metering.run(failing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BillingError);
    expect(error).toMatchObject({ code: 'provider_unavailable', details: { released: true } });
    expect(JSON.stringify((error as BillingError).details)).not.toContain('internal detail');
    expect(await remaining(account.id)).toBe(before);
    expect(await ledgerRows(account.id)).toEqual([{ state: 'released' }]);

    await expect(metering.run({ ...failing })).rejects.toMatchObject({
      code: 'provider_unavailable',
      details: { released: true },
    });
    expect(calls).toBe(1);
  });

  it('says released: false when the release itself does not commit (the "not confirmed" copy)', async () => {
    const account = await f.freeAccount();
    const key = `key-${randomUUID()}`;
    const o = op(account, {
      idempotencyKey: key,
      execute: async () => {
        await f.db.pool.query(
          `UPDATE usage_ledger SET state = 'committed', committed_at = now() WHERE billing_account_id = $1 AND idempotency_key = $2`,
          [account.id, key],
        );
        throw new Error('provider failed');
      },
    });
    await expect(metering.run(o)).rejects.toMatchObject({ code: 'provider_unavailable', details: { released: false } });
  });

  it('a save that fails validation releases the unit and keeps nothing', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const o = op(account, {
      save: async (db) => {
        await db.query(`INSERT INTO test_outputs (account_id, text) VALUES ($1, 'partial')`, [account.id]);
        throw new BillingError('provider_unavailable', { reason: 'missing_required_field' });
      },
    });
    await expect(metering.run(o)).rejects.toMatchObject({ code: 'provider_unavailable', details: { released: true } });
    expect(await outputs(account.id)).toBe(0);
    expect(await remaining(account.id)).toBe(before);
  });

  it('quota exhausted runs nothing and reserves nothing', async () => {
    const account = await f.freeAccount();
    await f.spend(account.id, 'document_credit', await remaining(account.id));
    const o = op(account);
    await expect(metering.run(o)).rejects.toMatchObject({ code: 'quota_exhausted', details: { unit: 'document_credit', remaining: 0 } });
    expect(o.calls()).toBe(0);
    const jobs = await f.db.pool.query(`SELECT count(*)::int AS n FROM ai_jobs WHERE billing_account_id = $1`, [account.id]);
    expect(jobs.rows[0].n).toBe(0);
  });

  it('a unit the plan does not include is plan_upgrade_required with the minimum plan', async () => {
    const account = await f.freeAccount();
    const o = op(account, { unit: 'text_interview', feature: 'textInterviewSessions' });
    await expect(metering.run(o)).rejects.toMatchObject({ code: 'plan_upgrade_required', details: { minimumPlan: 'starter' } });
    expect(o.calls()).toBe(0);
  });

  it('a switched-off feature is feature_unavailable; later phases are off by default', async () => {
    const account = await f.paidAccount('professional', 'monthly', '2026-10-16T10:00:00Z');
    const later = op(account, { unit: 'voice_minute', feature: 'voiceMinutes' });
    await expect(metering.run(later)).rejects.toMatchObject({ code: 'feature_unavailable', details: { feature: 'voiceMinutes' } });

    await f.db.pool.query(`INSERT INTO feature_flags (feature, enabled) VALUES ('documentCredits', false)`);
    try {
      const off = op(account);
      await expect(metering.run(off)).rejects.toMatchObject({ code: 'feature_unavailable' });
      expect(off.calls()).toBe(0);
      expect(await ledgerRows(account.id)).toHaveLength(0);
    } finally {
      await f.db.pool.query(`DELETE FROM feature_flags WHERE feature = 'documentCredits'`);
    }
  });

  it('billing that cannot spend is billing_inactive', async () => {
    const account = await f.paidAccount('starter', 'monthly', '2026-10-16T10:00:00Z');
    await f.db.pool.query(`UPDATE billing_accounts SET status = 'incomplete' WHERE id = $1`, [account.id]);
    await expect(metering.run(op(account))).rejects.toMatchObject({ code: 'billing_inactive' });
  });

  it('a count cap counts requests still running, so two at once cannot both pass', async () => {
    const account = await f.freeAccount();
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const capped = (extra: Partial<Op>) =>
      op(account, {
        kind: 'test.capped',
        checkCapacity: async ({ db, account: locked, snapshot, inFlight }) => {
          const saved = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM test_outputs WHERE account_id = $1`, [
            locked.id,
          ]);
          checkCapacity(snapshot, locked, 'resumeVersions', saved.rows[0].n + inFlight);
        },
        ...extra,
      });
    const slow = capped({
      execute: async () => {
        await gate;
        return 'slow';
      },
    });
    const first = metering.run(slow);
    await new Promise((r) => setTimeout(r, 200));
    const second = capped({});
    await expect(metering.run(second)).rejects.toMatchObject({ code: 'capacity_exceeded', details: { field: 'resumeVersions', limit: 1 } });
    unblock();
    await first;
    await expect(metering.run(capped({}))).rejects.toMatchObject({ code: 'capacity_exceeded' });
    expect(await ledgerRows(account.id)).toHaveLength(1);
  });

  it('a replay while the first request still runs is request_in_progress', async () => {
    const account = await f.freeAccount();
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const slow = op(account, {
      execute: async () => {
        await gate;
        return 'slow';
      },
    });
    const first = metering.run(slow);
    await new Promise((r) => setTimeout(r, 200));
    await expect(metering.run({ ...slow })).rejects.toMatchObject({ code: 'request_in_progress' });
    unblock();
    await expect(first).resolves.toMatchObject({ replayed: false });
  });

  it('the sweep releases a reservation whose request process is gone, and only that one', async () => {
    const account = await f.freeAccount();
    const before = await remaining(account.id);
    const never = op(account, { execute: () => new Promise<string>(() => undefined) });
    void metering.run(never);
    await new Promise((r) => setTimeout(r, 200));
    expect(await remaining(account.id)).toBe(before - 1);

    expect(await metering.releaseAbandoned(15 * 60_000)).toBe(0);
    f.clock.set('2026-10-16T10:20:00Z');
    try {
      expect(await metering.releaseAbandoned(15 * 60_000)).toBe(1);
    } finally {
      f.clock.set('2026-10-16T10:00:00Z');
    }
    expect(await remaining(account.id)).toBe(before);
    expect(await ledgerRows(account.id)).toEqual([{ state: 'released' }]);
    const open = await f.db.pool.query(`SELECT error_code FROM ai_jobs WHERE status = 'running'`);
    expect(open.rows).toEqual([]);
    const notConfirmed = await f.db.pool.query(`SELECT count(*)::int AS n FROM ai_jobs WHERE error_code = 'not_confirmed'`);
    expect(notConfirmed.rows[0].n).toBe(1);
  });

  it('another account cannot read the job', async () => {
    const a = await f.freeAccount();
    const b = await f.freeAccount();
    const out = await metering.run(op(a));
    await expect(metering.job(b.id, out.jobId)).rejects.toMatchObject({ code: 'not_found' });
  });
});
