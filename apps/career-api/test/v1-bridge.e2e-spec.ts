import request from 'supertest';
import { parseCareerPlanMap } from '@flacroncv/career-server';
import type { V1AccountSnapshot } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';
import { StorageCleanupScheduler } from '../src/storage/storage-cleanup.scheduler';

/**
 * The V1 bridge end to end: the V1 plan (fixture standing in for Firestore)
 * decides access and the career plan. V1 is only read.
 */
describe('V1 plan bridge', () => {
  let t: TestApp;
  let now = new Date('2026-11-02T10:00:00Z');
  const accounts = new Map<string, V1AccountSnapshot>();
  const http = () => request(t.app.getHttpServer());
  const v1 = (uid: string, plan: V1AccountSnapshot['plan'], active = true) => accounts.set(uid, { uid, plan, active });
  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  const userCount = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM users WHERE auth_user_id = $1`, [uid])).rows[0].n as number;
  const documentCredits = async (uid: string) => {
    const res = await http().get('/api/career/v1/usage').set('Authorization', bearer(uid));
    expect(res.status).toBe(200);
    return res.body.units.find((row: { unit: string }) => row.unit === 'document_credit') as {
      includedGranted: number;
      includedRemaining: number;
    };
  };

  beforeAll(async () => {
    t = await createTestApp('api_v1_bridge', {
      v1: {
        accounts,
        // Fixture only. The real mapping is a client decision; the default is all `none`.
        map: parseCareerPlanMap('free:none,pro:professional,career_accelerator:none,enterprise:career_pro'),
        clock: { now: () => now },
        jobs,
      },
    });
  });

  const jobs = new Map<string, string[]>();

  it('outcome analytics count the V1 Jobs tracker, not a second tracker', async () => {
    v1('loop-ji', 'pro');
    // V1 statuses as stored in job_applications. `mystery` is not a V1 status and is dropped.
    jobs.set('loop-ji', ['wishlist', 'applied', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'mystery']);
    await t.db.pool.query(`INSERT INTO feature_flags (feature, enabled, updated_by) VALUES ('applicationAnalytics', true, 'test')`);
    const res = await http().get('/api/career/v1/learning-loop').set('Authorization', bearer('loop-ji'));
    expect(res.status).toBe(200);
    // recorded = applied×2, interviewing, offer, accepted(=offer), rejected = 6; saved (wishlist) is unrecorded.
    expect(res.body).toMatchObject({ sampleSize: 7, recordedApplications: 6, unrecorded: 1, interviews: 3, offers: 2, interviewRatePercent: 50 });
    const careerRows = await t.db.pool.query(`SELECT count(*)::int AS n FROM applications`);
    expect(careerRows.rows[0].n).toBe(0);
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('a V1 plan mapped to none gets feature_unavailable and no career rows', async () => {
    v1('free-ada', 'free');
    const res = await http().get('/api/career/v1/me').set('Authorization', bearer('free-ada'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'feature_unavailable', feature: 'career', reason: 'plan_not_mapped' });
    const access = await http().get('/api/career/v1/access').set('Authorization', bearer('free-ada'));
    expect(access.body).toMatchObject({ enabled: false, v1Plan: 'free', reason: 'plan_not_mapped' });
    expect(await userCount('free-ada')).toBe(0);
  });

  it('refuses a token with no V1 account, and a deactivated V1 account', async () => {
    const missing = await http().get('/api/career/v1/facts').set('Authorization', bearer('nobody'));
    expect(missing.body).toEqual({ code: 'feature_unavailable', feature: 'career', reason: 'v1_account_missing' });
    v1('gone-bo', 'pro', false);
    const gone = await http().get('/api/career/v1/facts').set('Authorization', bearer('gone-bo'));
    expect(gone.body).toEqual({ code: 'feature_unavailable', feature: 'career', reason: 'v1_account_inactive' });
    expect(await userCount('nobody')).toBe(0);
    expect(await userCount('gone-bo')).toBe(0);
  });

  it('a mapped V1 plan opens the career area on the mapped plan, once, under concurrent first requests', async () => {
    v1('pro-cy', 'pro');
    const results = await Promise.all(
      Array.from({ length: 4 }, () => http().get('/api/career/v1/me').set('Authorization', bearer('pro-cy'))),
    );
    for (const res of results) expect(res.status).toBe(200);
    expect(results[0].body.planId).toBe('professional');
    expect(await userCount('pro-cy')).toBe(1);
    const credits = await documentCredits('pro-cy');
    expect(credits).toMatchObject({ includedGranted: 60, includedRemaining: 60 });
    const access = await http().get('/api/career/v1/access').set('Authorization', bearer('pro-cy'));
    expect(access.body).toMatchObject({ enabled: true, v1Plan: 'pro', careerPlan: 'professional' });
    expect(access.body.features.documentCredits).toBe(true);
    const row = await t.db.pool.query(`SELECT plan_source, v1_plan, provider FROM billing_accounts WHERE auth_user_id = 'pro-cy'`);
    expect(row.rows[0]).toEqual({ plan_source: 'v1_mapping', v1_plan: 'pro', provider: null });
  });

  it('a V1 plan change moves the ceiling without handing out a second month', async () => {
    v1('flip-di', 'pro');
    await http().get('/api/career/v1/me').set('Authorization', bearer('flip-di'));
    // Five document credits spent this period.
    await t.db.pool.query(
      `UPDATE usage_balances SET included_remaining = included_remaining - 5
        WHERE unit = 'document_credit' AND billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'flip-di')`,
    );

    v1('flip-di', 'enterprise');
    later(31_000);
    expect(await documentCredits('flip-di')).toMatchObject({ includedGranted: 150, includedRemaining: 145 });

    v1('flip-di', 'pro');
    later(31_000);
    expect(await documentCredits('flip-di')).toMatchObject({ includedGranted: 60, includedRemaining: 55 });

    v1('flip-di', 'enterprise');
    later(31_000);
    expect(await documentCredits('flip-di')).toMatchObject({ includedGranted: 150, includedRemaining: 145 });
  });

  it('a V1 change is seen within the cache window, not before', async () => {
    v1('cache-ed', 'pro');
    expect((await http().get('/api/career/v1/me').set('Authorization', bearer('cache-ed'))).status).toBe(200);
    v1('cache-ed', 'free');
    expect((await http().get('/api/career/v1/me').set('Authorization', bearer('cache-ed'))).status).toBe(200);
    later(31_000);
    expect((await http().get('/api/career/v1/me').set('Authorization', bearer('cache-ed'))).status).toBe(403);
  });

  it('after losing access, the person can still export and erase the career data they created', async () => {
    v1('leaver-fa', 'pro');
    const auth = bearer('leaver-fa');
    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'experience', value: { company: 'Fictional Co', startDate: '2020-02' } });
    expect(fact.status).toBe(201);

    v1('leaver-fa', 'free');
    later(31_000);
    expect((await http().get('/api/career/v1/facts').set('Authorization', auth)).status).toBe(403);
    const exported = await http().post('/api/career/v1/exports').set('Authorization', auth).send({ scope: 'personal' });
    expect(exported.status).toBe(201);
    // Someone who never had career data has nothing to export, and no account is created for them.
    v1('never-ga', 'free');
    const none = await http().post('/api/career/v1/exports').set('Authorization', bearer('never-ga')).send({ scope: 'personal' });
    expect(none.status).toBe(404);
    expect(await userCount('never-ga')).toBe(0);
  });

  it('renews the career allowance on the anniversary while the V1 plan stays mapped', async () => {
    v1('renew-hu', 'pro');
    const auth = bearer('renew-hu');
    await http().get('/api/career/v1/me').set('Authorization', auth);
    await t.db.pool.query(
      `UPDATE usage_balances SET included_remaining = 0
        WHERE unit = 'document_credit' AND billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'renew-hu')`,
    );
    expect(await documentCredits('renew-hu')).toMatchObject({ includedRemaining: 0 });
    later(32 * 24 * 60 * 60 * 1000);
    await http().get('/api/career/v1/me').set('Authorization', auth);
    // `usage` reads the balance for the server's real clock; check the stored period instead.
    const rows = await t.db.pool.query(
      `SELECT b.included_remaining, b.allowance_period_start
         FROM usage_balances b JOIN billing_accounts a ON a.id = b.billing_account_id
        WHERE a.auth_user_id = 'renew-hu' AND b.unit = 'document_credit'
        ORDER BY b.allowance_period_start`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[1].included_remaining).toBe(60);
  });
});

describe('V1 closure sweep', () => {
  let t: TestApp;
  const accounts = new Map<string, V1AccountSnapshot>();
  const http = () => request(t.app.getHttpServer());
  const userCount = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM users WHERE auth_user_id = $1`, [uid])).rows[0].n as number;
  const factCount = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = $1`, [uid])).rows[0]
      .n as number;

  beforeAll(async () => {
    t = await createTestApp('api_v1_closure', {
      v1: { accounts, map: parseCareerPlanMap('pro:professional') },
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('erases career data only for accounts V1 closed, never for active or missing V1 records', async () => {
    for (const uid of ['closing-ana', 'staying-ben', 'missing-cal']) {
      accounts.set(uid, { uid, plan: 'pro', active: true });
      const res = await http()
        .post('/api/career/v1/facts')
        .set('Authorization', bearer(uid))
        .send({ factType: 'experience', value: { company: 'Fictional Co', startDate: '2020-02' } });
      expect(res.status).toBe(201);
    }
    // V1 soft-deletes one account; another V1 record cannot be read at all.
    accounts.set('closing-ana', { uid: 'closing-ana', plan: 'pro', active: false });
    accounts.delete('missing-cal');

    await t.app.get(StorageCleanupScheduler).tick();

    expect(await userCount('closing-ana')).toBe(0);
    expect(await factCount('closing-ana')).toBe(0);
    expect(await userCount('staying-ben')).toBe(1);
    expect(await factCount('staying-ben')).toBe(1);
    expect(await userCount('missing-cal')).toBe(1);
    expect(await factCount('missing-cal')).toBe(1);
    // A second tick does not re-check the survivors today, and changes nothing.
    await t.app.get(StorageCleanupScheduler).tick();
    expect(await userCount('staying-ben')).toBe(1);
  });

  it('retries a closed account whose earlier erase failed after it was marked, but leaves a deletion in progress alone', async () => {
    for (const uid of ['stalled-dee', 'in-progress-eve']) {
      accounts.set(uid, { uid, plan: 'pro', active: true });
      const res = await http()
        .post('/api/career/v1/facts')
        .set('Authorization', bearer(uid))
        .send({ factType: 'experience', value: { company: 'Fictional Co', startDate: '2020-02' } });
      expect(res.status).toBe(201);
      accounts.set(uid, { uid, plan: 'pro', active: false });
    }
    // Simulate a sweep that marked the account and then failed (storage or database error):
    // marked 20 minutes ago, closure check never stamped. The other was marked a minute ago.
    await t.db.pool.query(`UPDATE users SET deletion_requested_at = now() - interval '20 minutes' WHERE auth_user_id = 'stalled-dee'`);
    await t.db.pool.query(`UPDATE users SET deletion_requested_at = now() - interval '1 minute' WHERE auth_user_id = 'in-progress-eve'`);

    await t.app.get(StorageCleanupScheduler).tick();

    expect(await userCount('stalled-dee')).toBe(0);
    expect(await factCount('stalled-dee')).toBe(0);
    expect(await userCount('in-progress-eve')).toBe(1);
  });
});

describe('purchased career entitlement (default map: no V1 plan grants career access)', () => {
  let t: TestApp;
  const now = new Date('2026-11-02T10:00:00Z');
  const accounts = new Map<string, V1AccountSnapshot>();
  const http = () => request(t.app.getHttpServer());
  const day = 24 * 60 * 60 * 1000;
  const buyer = (uid: string, plan: V1AccountSnapshot['plan'], status: string, periodEndOffset: number, careerPlan = 'professional') =>
    accounts.set(uid, { uid, plan, active: true, careerPurchase: { plan: careerPlan, status, currentPeriodEnd: new Date(now.getTime() + periodEndOffset) } });
  const access = async (uid: string) => (await http().get('/api/career/v1/access').set('Authorization', bearer(uid))).body;

  beforeAll(async () => {
    t = await createTestApp('api_v1_purchase', { v1: { accounts, map: parseCareerPlanMap(''), clock: { now: () => now } } });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('existing V1 plans keep their V1 benefits but get no career access without a purchase', async () => {
    for (const plan of ['free', 'pro', 'career_accelerator', 'enterprise'] as const) {
      accounts.set(`plain-${plan}`, { uid: `plain-${plan}`, plan, active: true });
      expect(await access(`plain-${plan}`)).toMatchObject({ enabled: false, reason: 'plan_not_mapped' });
      expect((await http().get('/api/career/v1/facts').set('Authorization', bearer(`plain-${plan}`))).status).toBe(403);
    }
  });

  it('an active or trialing purchase grants exactly the purchased plan', async () => {
    buyer('buy-active', 'pro', 'active', 20 * day);
    expect(await access('buy-active')).toMatchObject({ enabled: true, careerPlan: 'professional', source: 'purchase', v1Plan: 'pro' });
    const me = await http().get('/api/career/v1/me').set('Authorization', bearer('buy-active'));
    expect(me.body.planId).toBe('professional');
    buyer('buy-trial', 'free', 'trialing', 5 * day, 'starter');
    expect(await access('buy-trial')).toMatchObject({ enabled: true, careerPlan: 'starter' });
  });

  it('past-due and cancelling purchases keep access only until the paid period ends', async () => {
    buyer('buy-pastdue', 'pro', 'past_due', 3 * day);
    expect((await access('buy-pastdue')).enabled).toBe(true);
    buyer('buy-pastdue-over', 'pro', 'past_due', -1 * day);
    expect((await access('buy-pastdue-over')).enabled).toBe(false);
    buyer('buy-canceled-in-period', 'pro', 'canceled', 2 * day);
    expect((await access('buy-canceled-in-period')).enabled).toBe(true);
    buyer('buy-canceled', 'pro', 'canceled', -2 * day);
    expect((await access('buy-canceled')).enabled).toBe(false);
  });

  it('failed or abandoned checkouts never grant access, and direct API calls are refused', async () => {
    for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused']) {
      buyer(`buy-${status}`, 'pro', status, 20 * day);
      expect((await access(`buy-${status}`)).enabled).toBe(false);
      const direct = await http().post('/api/career/v1/facts').set('Authorization', bearer(`buy-${status}`)).send({ factType: 'skill', value: { name: 'SQL' } });
      expect(direct.status).toBe(403);
    }
    const rows = await t.db.pool.query(`SELECT count(*)::int AS n FROM users WHERE auth_user_id LIKE 'buy-i%' OR auth_user_id LIKE 'buy-u%' OR auth_user_id LIKE 'buy-pa%'`);
    expect(rows.rows[0].n).toBe(0);
  });

  it('a purchase only ever raises the career plan; an unknown or free purchase grants nothing', async () => {
    buyer('buy-unknown', 'pro', 'active', 20 * day, 'platinum');
    expect((await access('buy-unknown')).enabled).toBe(false);
    buyer('buy-free', 'pro', 'active', 20 * day, 'free');
    expect((await access('buy-free')).enabled).toBe(false);
  });
});
