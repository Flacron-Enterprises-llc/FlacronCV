import request from 'supertest';
import { applyMappedPlan, parseCareerPlanMap } from '@flacroncv/career-server';
import type { V1AccountSnapshot } from '@flacroncv/career-server';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/**
 * Deleting and re-creating a career account cannot reset the allowance of
 * the current period. Fictional accounts; usage is simulated directly on the
 * balances (what a metered action would have spent).
 */
describe('allowance survives account deletion and re-creation within the period', () => {
  let t: TestApp;
  let now = new Date();
  const accounts = new Map<string, V1AccountSnapshot>();
  const http = () => request(t.app.getHttpServer());
  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  const credits = async (uid: string) => {
    const res = await http().get('/api/career/v1/usage').set('Authorization', bearer(uid));
    expect(res.status).toBe(200);
    return (res.body.units as Array<{ unit: string; includedGranted: number; includedRemaining: number }>).find((u) => u.unit === 'document_credit');
  };
  const spend = (uid: string, remaining: number) =>
    t.db.pool.query(
      `UPDATE usage_balances b SET included_remaining = $2
         FROM billing_accounts a
        WHERE a.id = b.billing_account_id AND a.auth_user_id = $1 AND b.unit = 'document_credit'
          AND b.allowance_period_end > now()`,
      [uid, remaining],
    );
  const remove = async (uid: string) => {
    const res = await http().post('/api/career/v1/account/delete').set('Authorization', bearer(uid)).send({ confirm: 'DELETE', idToken: `fake:${uid}` });
    expect(res.status).toBe(201);
    // The deleted-sign-in memory lasts two hours; drop it as if that time had passed.
    await t.db.pool.query(`DELETE FROM deleted_sign_ins WHERE auth_user_id = $1`, [uid]);
  };
  const users = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM users WHERE auth_user_id = $1`, [uid])).rows[0].n as number;

  beforeAll(async () => {
    t = await createTestApp('api_allowance_carry', {
      v1: { accounts, map: parseCareerPlanMap('pro:professional,enterprise:career_pro'), clock: { now: () => now } },
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('re-creating after the two-hour memory keeps the used units; concurrent first requests create one account', async () => {
    accounts.set('carry-ann', { uid: 'carry-ann', plan: 'pro', active: true });
    accounts.set('carry-bob', { uid: 'carry-bob', plan: 'pro', active: true });
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 60, includedRemaining: 60 });
    expect(await credits('carry-bob')).toMatchObject({ includedGranted: 60, includedRemaining: 60 });
    await spend('carry-ann', 45);

    await remove('carry-ann');
    expect(await users('carry-ann')).toBe(0);
    const carried = await t.db.pool.query(`SELECT unit, used FROM allowance_carryovers WHERE unit = 'document_credit'`);
    expect(carried.rows).toEqual([{ unit: 'document_credit', used: 15 }]);
    // No profile content comes back: only counts are kept.
    expect(Object.keys((await t.db.pool.query(`SELECT * FROM allowance_carryovers LIMIT 1`)).rows[0]).sort()).toEqual(
      ['anchor', 'period_end', 'person_key', 'recorded_at', 'unit', 'used'],
    );

    const results = await Promise.all(Array.from({ length: 5 }, () => http().get('/api/career/v1/usage').set('Authorization', bearer('carry-ann'))));
    for (const res of results) expect(res.status).toBe(200);
    expect(await users('carry-ann')).toBe(1);
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 60, includedRemaining: 45 });
    const facts = await http().get('/api/career/v1/facts').set('Authorization', bearer('carry-ann'));
    expect(facts.body.items).toEqual([]);
  });

  it('replayed plan syncs change nothing; a same-period plan change keeps the used units', async () => {
    const account = await t.db.pool.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE auth_user_id = 'carry-ann'`);
    const access = { enabled: true as const, v1Plan: 'pro' as const, careerPlan: 'professional' as const, source: 'v1_plan_map' as const };
    for (let i = 0; i < 3; i += 1) await applyMappedPlan(t.db.pool, account.rows[0].id, access, CATALOG_VERSION, now);
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 60, includedRemaining: 45 });

    accounts.set('carry-ann', { uid: 'carry-ann', plan: 'enterprise', active: true });
    later(31_000);
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 150, includedRemaining: 135 });
  });

  it('a second delete and re-create in the same period still cannot reset, even when Free briefly granted less', async () => {
    await spend('carry-ann', 100); // 50 used of 150
    await remove('carry-ann');
    accounts.set('carry-ann', { uid: 'carry-ann', plan: 'enterprise', active: true });
    later(31_000);
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 150, includedRemaining: 100 });
  });

  it('the next allowance period renews in full, and another customer was never affected', async () => {
    expect(await credits('carry-bob')).toMatchObject({ includedGranted: 60, includedRemaining: 60 });
    later(32 * 24 * 60 * 60 * 1000);
    expect(await credits('carry-ann')).toMatchObject({ includedGranted: 150, includedRemaining: 150 });
  });
});
