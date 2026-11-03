import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { parseCareerPlanMap } from '@flacroncv/career-server';
import type { V1AccountSnapshot, V1AccountSource } from '@flacroncv/career-server';
import { ADMIN_UIDS } from '../src/admin/admin.controller';
import { V1_ACCOUNT_SOURCE } from '../src/integration/career-access.service';
import { createTestApp, TestApp } from './support';

/** V1 status is read fresh before anything can be created or changed; a stale token cannot outlive the V1 account. */
describe('current V1 account status gates provisioning and operator routes', () => {
  let t: TestApp;
  const accounts = new Map<string, V1AccountSnapshot>();
  const unreadable = new Set<string>();
  const source: V1AccountSource = {
    async read(uid: string) {
      if (unreadable.has(uid)) throw new Error('firestore unavailable');
      return accounts.get(uid) ?? null;
    },
    async jobStatuses() {
      return null;
    },
  };
  const http = () => request(t.app.getHttpServer());
  const rows = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM users WHERE auth_user_id = $1`, [uid])).rows[0].n as number;
  const facts = async (uid: string) =>
    (await t.db.pool.query(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = $1`, [uid])).rows[0].n as number;
  const fact = (uid: string) =>
    http()
      .post('/api/career/v1/facts')
      .set('Authorization', bearer(uid))
      .send({ factType: 'experience', value: { company: 'Fictional Co', startDate: '2020-02' } });

  beforeAll(async () => {
    t = await createTestApp('api_v1_status', {
      v1: { accounts, map: parseCareerPlanMap('pro:professional') },
      customize: (builder) =>
        builder
          .overrideProvider(V1_ACCOUNT_SOURCE)
          .useValue(source)
          .overrideProvider(ADMIN_UIDS)
          .useValue(new Set(['ops-active', 'ops-disabled', 'ops-deleted', 'ops-unreadable'])),
    });
    for (const uid of ['ops-active', 'ops-disabled', 'ops-deleted', 'ops-unreadable']) t.tokens.set(uid, { role: 'super_admin' });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('an active V1 admin with the staff claim and the allowlist reaches operator routes', async () => {
    accounts.set('ops-active', { uid: 'ops-active', plan: 'enterprise', active: true });
    expect((await http().get('/api/career/v1/admin/health').set('Authorization', bearer('ops-active'))).status).toBe(200);
  });

  it('a deactivated or deleted V1 admin with a stale staff claim is refused before any career row is written', async () => {
    accounts.set('ops-disabled', { uid: 'ops-disabled', plan: 'enterprise', active: false });
    const disabled = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('ops-disabled'));
    expect(disabled.status).toBe(403);
    expect(disabled.body.code).toBe('permission_denied');
    expect(await rows('ops-disabled')).toBe(0);

    const deleted = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('ops-deleted'));
    expect(deleted.status).toBe(403);
    expect(deleted.body.code).toBe('permission_denied');
    expect(await rows('ops-deleted')).toBe(0);
  });

  it('an admin deactivated a moment ago is refused even while an earlier positive read is cached', async () => {
    accounts.set('ops-active', { uid: 'ops-active', plan: 'enterprise', active: true });
    expect((await http().get('/api/career/v1/access').set('Authorization', bearer('ops-active'))).status).toBe(200);
    accounts.set('ops-active', { uid: 'ops-active', plan: 'enterprise', active: false });
    expect((await http().get('/api/career/v1/admin/health').set('Authorization', bearer('ops-active'))).status).toBe(403);
    accounts.set('ops-active', { uid: 'ops-active', plan: 'enterprise', active: true });
  });

  it('fails closed (503) when V1 status cannot be read, for operators and for first-time customers, and writes nothing', async () => {
    unreadable.add('ops-unreadable');
    const operator = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('ops-unreadable'));
    expect(operator.status).toBe(503);
    expect(operator.body).toMatchObject({ code: 'provider_unavailable', reason: 'v1_status_unavailable' });
    unreadable.add('cust-unreadable');
    const customer = await http().get('/api/career/v1/me').set('Authorization', bearer('cust-unreadable'));
    expect(customer.status).toBe(503);
    expect(await rows('ops-unreadable')).toBe(0);
    expect(await rows('cust-unreadable')).toBe(0);
  });

  it('a customer deactivated after a cached positive read cannot provision an account or write', async () => {
    accounts.set('cust-new', { uid: 'cust-new', plan: 'pro', active: true });
    expect((await http().get('/api/career/v1/access').set('Authorization', bearer('cust-new'))).body.enabled).toBe(true);
    accounts.set('cust-new', { uid: 'cust-new', plan: 'pro', active: false });
    // First request that would create the career account: refused from the fresh read.
    const me = await http().get('/api/career/v1/me').set('Authorization', bearer('cust-new'));
    expect(me.status).toBe(403);
    expect(me.body).toMatchObject({ code: 'feature_unavailable', reason: 'v1_account_inactive' });
    expect(await rows('cust-new')).toBe(0);
  });

  it('an existing customer deactivated during use cannot write, even with concurrent requests inside the cache window', async () => {
    accounts.set('cust-live', { uid: 'cust-live', plan: 'pro', active: true });
    expect((await fact('cust-live')).status).toBe(201);
    expect(await facts('cust-live')).toBe(1);
    accounts.set('cust-live', { uid: 'cust-live', plan: 'pro', active: false });
    const results = await Promise.all(Array.from({ length: 5 }, () => fact('cust-live')));
    for (const res of results) {
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('v1_account_inactive');
    }
    expect(await facts('cust-live')).toBe(1);
  });
});
