import request from 'supertest';
import { parseCareerPlanMap } from '@flacroncv/career-server';
import type { V1AccountSnapshot } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/**
 * Business pooled usage through the real V1 bridge: an invited candidate with
 * no career plan of their own can accept, then spends from the Business
 * account's pool (not a pool of their own), while billing routes stay on their
 * own account. Fictional accounts only.
 */
describe('Business candidates spend the Business pool', () => {
  let t: TestApp;
  const accounts = new Map<string, V1AccountSnapshot>();
  const http = () => request(t.app.getHttpServer());
  const base = '/api/career/v1';
  const v1 = (uid: string, plan: V1AccountSnapshot['plan']) => accounts.set(uid, { uid, plan, active: true });

  beforeAll(async () => {
    t = await createTestApp('api_business_pool', {
      // Free has no career access here (operator override), so only the Business pool can grant it.
      v1: { accounts, map: parseCareerPlanMap('free:none') },
    });
    // Business workspaces ship behind operator switches.
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('staffSeats', true), ('activeCandidates', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  const accountOf = async (uid: string) =>
    (await t.db.pool.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE auth_user_id = $1`, [uid])).rows[0]?.id;
  const ledgerRows = async (accountId: string) =>
    (
      await t.db.pool.query<{ unit: string; candidate_auth_user_id: string | null }>(
        `SELECT unit, candidate_auth_user_id FROM usage_ledger WHERE billing_account_id = $1`,
        [accountId],
      )
    ).rows;

  it('accepts without an own plan, then charges reservations to the Business account', async () => {
    v1('pool-owner', 'business');
    v1('pool-cand', 'free');
    v1('pool-stranger', 'free');

    // Before any invitation a Free (unmapped) person has no career access.
    const refused = await http().post(`${base}/metering/reservations`).set('Authorization', bearer('pool-stranger')).set('Idempotency-Key', 'k0').send({ unit: 'document_credit', operation: 'ai.generate' });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('feature_unavailable');

    const owner = bearer('pool-owner');
    expect((await http().get(`${base}/business`).set('Authorization', owner)).status).toBe(200);
    const invited = await http().post(`${base}/business/candidates`).set('Authorization', owner).send({ email: 'pool-cand@example.test', consent: true });
    expect(invited.status).toBe(201);
    const token = new URL(`http://x${invited.body.invitePath}`).searchParams.get('token');

    const accepted = await http().post(`${base}/business/invitations/accept`).set('Authorization', bearer('pool-cand')).send({ token });
    expect(accepted.status).toBe(201);
    expect(accepted.body.kind).toBe('candidate');

    const reserved = await http()
      .post(`${base}/metering/reservations`)
      .set('Authorization', bearer('pool-cand'))
      .set('Idempotency-Key', 'pool-k1')
      .send({ unit: 'document_credit', operation: 'ai.generate' });
    expect(reserved.status).toBe(201);
    expect(reserved.body.state).toBe('reserved');

    const ownerAccount = (await accountOf('pool-owner'))!;
    const candidateAccount = (await accountOf('pool-cand'))!;
    expect(await ledgerRows(ownerAccount)).toEqual([{ unit: 'document_credit', candidate_auth_user_id: 'pool-cand' }]);
    expect(await ledgerRows(candidateAccount)).toEqual([]);

    // Billing stays on the candidate's own account: they see their own (Free) plan, never the organization's.
    const billing = await http().get(`${base}/billing`).set('Authorization', bearer('pool-cand'));
    expect(JSON.stringify(billing.body)).not.toContain(ownerAccount);
  });

  it('stops pooling the moment the candidate leaves', async () => {
    v1('pool-owner2', 'business');
    v1('pool-leaver', 'free');
    const owner = bearer('pool-owner2');
    await http().get(`${base}/business`).set('Authorization', owner);
    const invited = await http().post(`${base}/business/candidates`).set('Authorization', owner).send({ email: 'pool-leaver@example.test', consent: true });
    const token = new URL(`http://x${invited.body.invitePath}`).searchParams.get('token');
    await http().post(`${base}/business/invitations/accept`).set('Authorization', bearer('pool-leaver')).send({ token });
    const left = await http().delete(`${base}/business/my/${invited.body.id}`).set('Authorization', bearer('pool-leaver'));
    expect(left.status).toBe(200);
    const after = await http()
      .post(`${base}/metering/reservations`)
      .set('Authorization', bearer('pool-leaver'))
      .set('Idempotency-Key', 'pool-k2')
      .send({ unit: 'document_credit', operation: 'ai.generate' });
    expect(after.status).toBe(403);
  });
});
