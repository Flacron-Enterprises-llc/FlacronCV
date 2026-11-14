import request from 'supertest';
import { INTERVIEW_TEMPLATE } from '@flacroncv/career-server';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';

describe('text interviews over HTTP', () => {
  let t: TestApp;
  const model = new FakeTextModel();
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_interviews', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/interviews/text')).status).toBe(401);
    expect((await http().post('/api/career/v1/interviews/text').send({ opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' })).status).toBe(401);
  });

  it('spends one session on Starter and rejects a story number the profile does not contain', async () => {
    const auth = bearer('http-interview');
    const refused = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-interview-empty')
      .send({ opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' });
    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'not_found' });

    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    expect(fact.status).toBe(201);
    const pasted = await http().post('/api/career/v1/opportunities').set('Authorization', auth).send({ text: 'SQL analyst\nKeep the ledger accurate and reconcile it weekly.' });
    expect(pasted.status).toBe(201);

    const upgrade = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-interview-free')
      .send({ opportunityId: pasted.body.id, stage: 'behavioral' });
    expect(upgrade.status).toBe(403);
    expect(upgrade.body).toMatchObject({ code: 'plan_upgrade_required', feature: 'textInterviewSessions', minimumPlan: 'starter' });

    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE auth_user_id = 'http-interview'`);
    const missingKey = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .send({ opportunityId: pasted.body.id, stage: 'behavioral' });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });

    model.always(INTERVIEW_TEMPLATE, JSON.stringify({ factIds: [fact.body.id], question: 'raised 50 million at Initech' }));
    const created = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-interview-1')
      .send({ opportunityId: pasted.body.id, stage: 'behavioral' });
    expect(created.status).toBe(201);
    expect(created.body.session.questions).toHaveLength(10);
    expect(created.body.session.questions[0].prompt).toContain('Confirmed line: SQL');
    expect(JSON.stringify(created.body.session)).not.toContain('50 million');
    expect(JSON.stringify(created.body.session)).not.toContain('Initech');
    expect(JSON.stringify(created.body.session)).not.toContain('hiring');
    expect(created.body.usage).toMatchObject({ unit: 'text_interview', includedRemaining: 1, ledgerState: 'committed' });
    expect(created.body.replayed).toBe(false);

    const answered = await http()
      .post(`/api/career/v1/interviews/text/${created.body.session.id}/answers`)
      .set('Authorization', auth)
      .send({ answer: 'I used SQL.' });
    expect(answered.status).toBe(201);
    expect(answered.body.answers).toHaveLength(1);
    expect(answered.body.summary).toContain('1 of 10');

    const ledger = await t.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE unit = 'text_interview' AND state = 'committed'`,
    );
    expect(ledger.rows[0].n).toBe(1);

    const invented = await http()
      .post('/api/career/v1/star-stories')
      .set('Authorization', auth)
      .send({ situation: 'SQL', task: 'SQL', action: 'SQL', result: 'raised 50 million' });
    expect(invented.status).toBe(400);
    expect(invented.body).toMatchObject({ code: 'validation_error', field: 'result', reason: 'number_not_in_facts' });
    const achievement = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'achievement', value: { statement: 'Reconciled the SQL ledger every week' }, confirmation: 'confirmed' });
    expect(achievement.status).toBe(201);
    const story = await http()
      .post('/api/career/v1/star-stories')
      .set('Authorization', auth)
      .send({ situation: 'SQL', task: 'SQL', action: 'SQL', result: 'Reconciled the SQL ledger every week.' });
    expect(story.status).toBe(201);
    expect(story.body.factIds).toContain(achievement.body.id);
    const edited = await http()
      .patch(`/api/career/v1/star-stories/${story.body.id}`)
      .set('Authorization', auth)
      .send({ situation: 'SQL', task: 'SQL', action: 'Wrote the checks', result: 'Reconciled the SQL ledger every week.' });
    expect(edited.status).toBe(200);
    expect(edited.body.action).toBe('Wrote the checks');
    const award = await http()
      .patch(`/api/career/v1/star-stories/${story.body.id}`)
      .set('Authorization', auth)
      .send({ situation: 'SQL', task: 'SQL', action: 'SQL', result: 'Reconciled the SQL ledger and won the Gold Award.' });
    expect(award.status).toBe(400);
    expect(award.body).toMatchObject({ code: 'validation_error', field: 'result', reason: 'result_not_in_facts' });

    // Practice by typed role, three questions, no saved listing.
    const byRole = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-interview-role')
      .send({ role: 'Ledger analyst', stage: 'recruiter', questionCount: 3 });
    expect(byRole.status).toBe(201);
    expect(byRole.body.session.questions).toHaveLength(3);
    expect(byRole.body.session.opportunityId).toBeNull();
    const badCount = await http()
      .post('/api/career/v1/interviews/text')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-interview-count')
      .send({ role: 'Ledger analyst', stage: 'recruiter', questionCount: 12 });
    expect(badCount.status).toBe(400);
    const removed = await http().delete(`/api/career/v1/star-stories/${story.body.id}`).set('Authorization', auth);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });
    const still = await t.db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE unit = 'text_interview' AND state = 'committed'`,
    );
    expect(still.rows[0].n).toBe(2);

    const other = await http().get(`/api/career/v1/interviews/text/${created.body.session.id}`).set('Authorization', bearer('http-interview-other'));
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ code: 'permission_denied' });
  });
});
