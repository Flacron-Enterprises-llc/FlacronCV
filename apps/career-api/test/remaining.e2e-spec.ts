import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('remaining scope over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const option = { name: 'Stay', costCents: 0, months: 12, destination: 'London', wageCents: null, source: 'user' };

  beforeAll(async () => {
    t = await createTestApp('api_remaining');
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES
         ('scenarioReports', true), ('applicationAnalytics', true), ('assistedForms', true),
         ('mapSessions', true), ('staffSeats', true), ('activeCandidates', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/learning-loop')).status).toBe(401);
    expect((await http().get('/api/career/v1/human-services')).status).toBe(401);
    expect((await http().post('/api/career/v1/scenarios').send({ options: [option] })).status).toBe(401);
    expect((await http().get('/api/career/v1/forms/00000000-0000-4000-8000-000000000001/fill')).status).toBe(401);
  });

  it('keeps missing pay unknown, reports the 20 percent sample, and does not send a form', async () => {
    const auth = bearer('http-scope');
    const blocked = await http().post('/api/career/v1/scenarios').set('Authorization', auth).set('Idempotency-Key', 'scope-free').send({ options: [option] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('plan_upgrade_required');

    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'professional' WHERE auth_user_id = 'http-scope'`);
    const created = await http().post('/api/career/v1/scenarios').set('Authorization', auth).set('Idempotency-Key', 'scope-1').send({ options: [option] });
    expect(created.status).toBe(201);
    expect(created.body.result.options[0].wageCents).toBeNull();
    expect(created.body.result.tradeoff).toContain('not a promise of earnings or employment');
    const again = await http().post('/api/career/v1/scenarios').set('Authorization', auth).set('Idempotency-Key', 'scope-2').send({ options: [{ ...option, name: 'Train' }] });
    expect(again.status).toBe(402);
    expect(again.body.code).toBe('quota_exhausted');

    const account = await t.db.pool.query<{ workspace_id: string }>(`SELECT workspace_id FROM billing_accounts WHERE auth_user_id = 'http-scope'`);
    for (const status of ['applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'interviewing', 'offered', 'saved']) {
      const opportunity = await t.db.pool.query<{ id: string }>(
        `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
         VALUES ('job', 'paste', $1, $1, 'unstated', 'open', 'http-scope') RETURNING id`,
        [`scope-${status}-${Math.random().toString(16).slice(2)}`],
      );
      const revision = await t.db.pool.query<{ id: string }>(
        `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
         VALUES ($1, 1, 'Role', 'unstated', 'desc', 'open') RETURNING id`,
        [opportunity.rows[0].id],
      );
      await t.db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunity.rows[0].id, revision.rows[0].id]);
      await t.db.pool.query(
        `INSERT INTO applications (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, status, source_snapshot)
         VALUES ($1, 'http-scope', $2, $3, $4, '{}'::jsonb)`,
        [account.rows[0].workspace_id, opportunity.rows[0].id, revision.rows[0].id, status],
      );
    }
    const loop = await http().get('/api/career/v1/learning-loop').set('Authorization', auth);
    expect(loop.status).toBe(200);
    expect(loop.body.statement).toBe('2 interviews from 10 recorded applications is a 20 percent observed interview rate in that sample, not a future hiring probability.');

    const badSite = await http().post('/api/career/v1/forms').set('Authorization', auth).set('Idempotency-Key', 'form-bad').send({ site: 'other.test' });
    expect(badSite.status).toBe(400);
    const form = await http().post('/api/career/v1/forms').set('Authorization', auth).set('Idempotency-Key', 'form-1').send({ site: 'example-jobs.test' });
    expect(form.status).toBe(201);
    const unreadied = await http().get(`/api/career/v1/forms/${form.body.result.id}/fill`).set('Authorization', auth);
    expect(unreadied.status).toBe(400);
    const reviewed = await http().post(`/api/career/v1/forms/${form.body.result.id}/review`).set('Authorization', auth).send({ confirmed: true });
    expect(reviewed.status).toBe(201);
    expect(reviewed.body).toMatchObject({ externalSubmitted: false, message: 'FlacronCV does not send this form.' });
    const fill = await http().get(`/api/career/v1/forms/${form.body.result.id}/fill`).set('Authorization', auth);
    expect(fill.status).toBe(200);
    expect(fill.body).toMatchObject({
      site: 'example-jobs.test',
      submit: false,
      extension: 'unpacked_local',
      distribution: 'unpublished',
      fields: { full_name: '', email: '', phone: '', notes: '' },
    });
    expect(fill.body.message).toContain('unpacked');
    expect(fill.body.submit).toBe(false);
    const ledger = await t.db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'http-scope')
          AND unit = 'assisted_form' AND state = 'committed'`,
    );
    expect(ledger.rows[0].quantity).toBe(1);

    const facts = await t.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = 'http-scope'`);
    const goal = await http().post('/api/career/v1/maintenance/promotion-goals').set('Authorization', auth).send({ desiredTitle: 'Staff engineer' });
    expect(goal.status).toBe(201);
    const after = await t.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = 'http-scope'`);
    expect(after.rows[0].n).toBe(facts.rows[0].n);
    const credential = await http().post('/api/career/v1/maintenance/credentials').set('Authorization', auth).send({ name: 'First aid', expiresOn: '2026-11-01' });
    expect(credential.body.due).toBe(true);

    const map = await http().post('/api/career/v1/maps').set('Authorization', auth).set('Idempotency-Key', 'map-1');
    expect(map.status).toBe(201);
    expect(map.body.result).toMatchObject({ minutes: 15, approximate: true, tiles: null, coordinates: null, attribution: null, provider: null });
    expect(map.body.usage.includedRemaining).toBe(49);
    const listed = await http().get('/api/career/v1/maps').set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body.tiles).toBeNull();
    expect(listed.body.attribution).toBeNull();
    expect(listed.body.provider).toBeNull();
    expect(listed.body.items.every((item: { coordinates: null; approximate: boolean }) => item.coordinates === null && item.approximate === true)).toBe(true);
  });

  it('charges one scenario report when the same key is retried and when two reports race', async () => {
    const auth = bearer('http-scope-race');
    expect((await http().get('/api/career/v1/maintenance').set('Authorization', auth)).status).toBe(200);
    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'professional' WHERE auth_user_id = 'http-scope-race'`);
    const send = (key: string) => http().post('/api/career/v1/scenarios').set('Authorization', auth).set('Idempotency-Key', key).send({ options: [option] });
    const [first, second] = await Promise.all([send('race-a'), send('race-b')]);
    expect([first.status, second.status].sort()).toEqual([201, 402]);
    const winner = first.status === 201 ? 'race-a' : 'race-b';
    const replay = await send(winner);
    expect(replay.status).toBe(201);
    expect(replay.body.replayed).toBe(true);
    const ledger = await t.db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'http-scope-race')
          AND unit = 'scenario_report' AND state = 'committed'`,
    );
    expect(ledger.rows[0].quantity).toBe(1);
    const loop = await http().get('/api/career/v1/learning-loop').set('Authorization', auth);
    const again = await http().get('/api/career/v1/learning-loop').set('Authorization', auth);
    expect(again.body).toEqual(loop.body);
    const outcomeLedger = await t.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger
        WHERE billing_account_id = (SELECT id FROM billing_accounts WHERE auth_user_id = 'http-scope-race')
          AND unit <> 'scenario_report'`,
    );
    expect(outcomeLedger.rows[0].n).toBe(0);
  });

  it('stops at three staff, keeps booking and checkout closed, and scopes an API key', async () => {
    const owner = bearer('http-biz');
    const outsider = bearer('http-biz-out');
    await http().get('/api/career/v1/maintenance').set('Authorization', owner);
    await http().get('/api/career/v1/maintenance').set('Authorization', outsider);
    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'business' WHERE auth_user_id IN ('http-biz', 'http-biz-out')`);

    for (const authUserId of ['staff-1', 'staff-2', 'staff-3']) {
      const added = await http().post('/api/career/v1/business/staff').set('Authorization', owner).send({ authUserId, role: 'counselor' });
      expect(added.status).toBe(201);
    }
    const fourth = await http().post('/api/career/v1/business/staff').set('Authorization', owner).send({ authUserId: 'staff-4', role: 'counselor' });
    expect(fourth.status).toBe(409);
    expect(fourth.body.code).toBe('capacity_exceeded');

    const refused = await http().post('/api/career/v1/business/candidates').set('Authorization', owner).send({ email: 'no@example.test', consent: false });
    expect(refused.status).toBe(400);
    const invited = await http().post('/api/career/v1/business/candidates').set('Authorization', owner).send({ email: 'person@example.test', consent: true });
    expect(invited.status).toBe(201);
    const hidden = await http().get(`/api/career/v1/business/candidates/${invited.body.id}`).set('Authorization', outsider);
    expect(hidden.status).toBe(403);
    expect(hidden.body.code).toBe('permission_denied');

    const booked = await http().post('/api/career/v1/human-services/review-not-open/bookings').set('Authorization', owner).send({});
    expect(booked.status).toBe(409);
    expect(booked.body).toEqual({ code: 'not_purchasable' });
    const checkout = await http().post('/api/career/v1/recruiting/checkout').set('Authorization', owner).send({});
    expect(checkout.status).toBe(409);
    expect(checkout.body).toEqual({ code: 'not_purchasable' });

    await http().post('/api/career/v1/recruiting/opt-in').set('Authorization', owner).send({ discoverable: true });
    const found = await http().get('/api/career/v1/recruiting/search').set('Authorization', outsider);
    expect(found.body.items).toEqual([{ candidateAuthUserId: 'http-biz', label: 'Opted-in candidate' }]);
    expect(JSON.stringify(found.body)).not.toContain('@');
    await http().post('/api/career/v1/recruiting/opt-in').set('Authorization', owner).send({ discoverable: false });
    expect((await http().get('/api/career/v1/recruiting/search').set('Authorization', outsider)).body.items).toEqual([]);

    const blockedKey = await http().post('/api/career/v1/developer/keys').set('Authorization', owner);
    expect(blockedKey.status).toBe(409);
    expect(blockedKey.body).toEqual({ code: 'not_purchasable' });
    const account = await t.db.pool.query<{ id: string; workspace_id: string }>(`SELECT id, workspace_id FROM billing_accounts WHERE auth_user_id = 'http-biz'`);
    const other = await t.db.pool.query<{ workspace_id: string }>(`SELECT workspace_id FROM billing_accounts WHERE auth_user_id = 'http-biz-out'`);
    await t.db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining)
       VALUES ($1, $2, 'api_package', 1)`,
      [account.rows[0].id, account.rows[0].workspace_id],
    );
    const key = await http().post('/api/career/v1/developer/keys').set('Authorization', owner);
    expect(key.status).toBe(201);
    expect(key.body.token.startsWith('flc_')).toBe(true);
    const denied = await http().post('/api/career/v1/developer/reads').set('Authorization', owner).send({ token: key.body.token, workspaceId: other.rows[0].workspace_id });
    expect(denied.status).toBe(403);
    const spent = await http().post('/api/career/v1/developer/reads').set('Authorization', owner).send({ token: key.body.token, workspaceId: account.rows[0].workspace_id });
    expect(spent.status).toBe(201);
    expect(spent.body.readsRemaining).toBe(0);
    const empty = await http().post('/api/career/v1/developer/reads').set('Authorization', owner).send({ token: key.body.token, workspaceId: account.rows[0].workspace_id });
    expect(empty.status).toBe(402);
    const brand = await http().put('/api/career/v1/developer/white-label').set('Authorization', owner).send({ brandName: 'North', attribution: 'Source: FlacronCV' });
    expect(brand.status).toBe(409);
    await t.db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining)
       VALUES ($1, $2, 'white_label', null)`,
      [account.rows[0].id, account.rows[0].workspace_id],
    );
    const stripped = await http().put('/api/career/v1/developer/white-label').set('Authorization', owner).send({ brandName: 'North', attribution: 'North only' });
    expect(stripped.status).toBe(400);
    const saved = await http().put('/api/career/v1/developer/white-label').set('Authorization', owner).send({ brandName: 'North', attribution: 'Source: FlacronCV' });
    expect(saved.status).toBe(200);
    expect(saved.body.attribution).toContain('FlacronCV');
  });

  it('stores a public sales inquiry without claiming email delivery', async () => {
    const created = await http().post('/api/career/v1/sales-inquiries').send({
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      organization: 'School',
      message: 'We need SSO for a workforce program.',
    });
    expect(created.status).toBe(201);
    expect(created.body.delivered).toBe(false);
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    const invalid = await http().post('/api/career/v1/sales-inquiries').send({
      name: 'A',
      email: 'bad',
      organization: 'X',
      message: 'short',
    });
    expect(invalid.status).toBe(400);
  });
});
