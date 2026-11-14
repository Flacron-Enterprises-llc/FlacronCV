import request from 'supertest';
import { randomUUID } from 'crypto';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { COVER_LETTER_TEMPLATE } from '@flacroncv/career-server/src/writing/writing-compose';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';
import { openBalances, readAccount } from '@flacroncv/career-server/src/billing/accounts';
import { CatalogStore } from '@flacroncv/career-server/src/billing/catalog';

describe('action engine over HTTP (CV12)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  // The pack's letter comes from the text model; this reply names only the
  // confirmed employer and the listing's organization.
  const model = new FakeTextModel().always(COVER_LETTER_TEMPLATE, (req) => {
    const prompt = JSON.parse(req.prompt) as { requiredFactIds: string[] };
    return JSON.stringify({
      opening: 'I am writing to apply to CloudScale and to share the work I did at Harbour Data.',
      body: 'At Harbour Data I worked as a platform engineer and used PostgreSQL every week to keep streaming pipelines reliable for the team. That confirmed experience is the evidence I can offer.',
      closing: 'Thank you for your time and consideration.',
      factIds: prompt.requiredFactIds,
    });
  });

  beforeAll(async () => {
    t = await createTestApp('api_action_engine', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
    // Ensure the Phase 2 actionPacks flag is enabled
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('actionPacks', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/action-packs')).status).toBe(401);
    expect((await http().post('/api/career/v1/action-packs').send({})).status).toBe(401);
  });

  it('runs the full action engine workflow over HTTP', async () => {
    const auth = bearer('http-action-user');

    // 1. Initial profile call creates the account and user on Free
    const meRes = await http().get('/api/career/v1/me').set('Authorization', auth);
    expect(meRes.status).toBe(200);

    // 2. Add confirmed fact to profile
    const factRes = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'skill',
        value: { name: 'Distributed Systems & PostgreSQL' },
      });
    expect(factRes.status).toBe(201);
    const confirmRes = await http()
      .post(`/api/career/v1/facts/${factRes.body.id}/confirm`)
      .set('Authorization', auth);
    expect(confirmRes.status).toBe(200);
    // A cover letter needs a confirmed job or school.
    const roleRes = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'experience', value: { position: 'Platform Engineer', company: 'Harbour Data', startDate: '2020-01', endDate: '2024-06' } });
    expect(roleRes.status).toBe(201);
    expect((await http().post(`/api/career/v1/facts/${roleRes.body.id}/confirm`).set('Authorization', auth)).status).toBe(200);

    // 3. Seed an opportunity in the test db
    const oppId = randomUUID();
    const revId = randomUUID();
    await t.db.pool.query(
      `INSERT INTO opportunities (id, category, provider, source_id, title, organization, status)
       VALUES ($1, 'job', 'manual', $2, 'Principal Architect', 'CloudScale', 'open')`,
      [oppId, oppId],
    );
    await t.db.pool.query(
      `INSERT INTO opportunity_revisions (id, opportunity_id, revision, title, organization, locations, eligibility, compensation, description, status)
       VALUES ($1, $2, 1, 'Principal Architect', 'CloudScale', '["Remote"]'::jsonb, '{}'::jsonb, '{"salary": 180000}'::jsonb, 'Node.js, PostgreSQL, and streaming architecture.', 'open')`,
      [revId, oppId],
    );
    await t.db.pool.query(
      `UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`,
      [oppId, revId],
    );

    // 4. Upgrade account to Professional so actionPacks is included
    const billingAccountRes = await t.db.pool.query<{ id: string }>(
      `SELECT b.id FROM billing_accounts b
         JOIN workspaces w ON w.id = b.workspace_id
         JOIN users u ON u.id = w.owner_user_id
        WHERE u.auth_user_id = 'http-action-user'`,
    );
    const billingAccountId = billingAccountRes.rows[0].id;
    await t.db.pool.query(
      `UPDATE billing_accounts SET plan_id = 'professional' WHERE id = $1`,
      [billingAccountId],
    );
    const acc = await readAccount(t.db.pool, billingAccountId);
    const snapshot = await new CatalogStore().get(t.db.pool, acc.catalog_version);
    await openBalances(t.db.pool, acc, snapshot, { regrant: true });

    // 5. POST /api/career/v1/action-packs with Idempotency-Key
    const idempotencyKey = randomUUID();
    const createRes = await http()
      .post('/api/career/v1/action-packs')
      .set('Authorization', auth)
      .set('Idempotency-Key', idempotencyKey)
      .send({ opportunityId: oppId });

    expect(createRes.status).toBe(201);
    expect(createRes.body.usage.unit).toBe('action_pack');
    expect(createRes.body.usage.includedRemaining).toBe(9);
    expect(createRes.body.replayed).toBe(false);

    const pack = createRes.body.actionPack;
    expect(pack.id).toBeDefined();
    expect(pack.opportunityId).toBe(oppId);
    expect(pack.opportunityRevisionId).toBe(revId);
    expect(pack.vacancySnapshot.title).toBe('Principal Architect');
    expect(pack.vacancySnapshot.organization).toBe('CloudScale');
    expect(pack.fit.fit).toBeDefined();
    expect(pack.tailoredResume.lines.length).toBeGreaterThan(0);
    expect(pack.coverLetter.body).toContain('CloudScale');
    expect(pack.checklist).toHaveLength(5);
    expect(pack.nextSteps.length).toBeGreaterThan(0);

    // 6. GET /api/career/v1/action-packs lists the pack
    const listRes = await http()
      .get('/api/career/v1/action-packs')
      .set('Authorization', auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.actionPack.includedRemaining).toBe(9);

    // 7. GET /api/career/v1/action-packs/:id retrieves specific pack
    const getRes = await http()
      .get(`/api/career/v1/action-packs/${pack.id}`)
      .set('Authorization', auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(pack.id);

    // 8. PATCH /api/career/v1/action-packs/:id/checklist/:checklistId updates item
    const checklistItemId = pack.checklist[0].id;
    const patchRes = await http()
      .patch(`/api/career/v1/action-packs/${pack.id}/checklist/${checklistItemId}`)
      .set('Authorization', auth)
      .send({ done: true });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.checklist.find((c: any) => c.id === checklistItemId)?.done).toBe(true);

    // 9. Replaying with same idempotency key returns cached pack with replayed: true
    const replayRes = await http()
      .post('/api/career/v1/action-packs')
      .set('Authorization', auth)
      .set('Idempotency-Key', idempotencyKey)
      .send({ opportunityId: oppId });
    expect(replayRes.status).toBe(201);
    expect(replayRes.body.replayed).toBe(true);
    expect(replayRes.body.actionPack.id).toBe(pack.id);
  });
});
