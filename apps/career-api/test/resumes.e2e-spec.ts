import request from 'supertest';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService, RESUME_COMPOSE_TEMPLATE } from '@flacroncv/career-server';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';

describe('resumes over HTTP', () => {
  let t: TestApp;
  const model = new FakeTextModel();
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_resumes', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/resumes')).status).toBe(401);
    expect((await http().post('/api/career/v1/resumes').send({ title: 'Ada', language: 'en' })).status).toBe(401);
  });

  it('creates a version from a draft fact, serves a PDF, and refuses DOCX on Free', async () => {
    const auth = bearer('http-resume');
    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'draft' });
    expect(fact.status).toBe(201);
    const created = await http().post('/api/career/v1/resumes').set('Authorization', auth).send({ title: 'Ada', language: 'en' });
    expect(created.status).toBe(201);
    expect(created.body.version.body.confirmation).toBe('draft');
    expect(created.body.version.body.sections[0].lines[0].text).toBe('SQL');
    expect(created.body.documentCredit).toBeUndefined();
    const list = await http().get('/api/career/v1/resumes').set('Authorization', auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.documentCredit.includedRemaining).toBe(3);

    const pdf = await http()
      .get(`/api/career/v1/resume-versions/${created.body.version.id}/export`)
      .query({ format: 'pdf' })
      .set('Authorization', auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const docx = await http()
      .get(`/api/career/v1/resume-versions/${created.body.version.id}/export`)
      .query({ format: 'docx' })
      .set('Authorization', auth);
    expect(docx.status).toBe(403);
    expect(docx.body).toEqual({ code: 'plan_upgrade_required', feature: 'docxExport', minimumPlan: 'starter' });

    const unclear = await http().post(`/api/career/v1/resumes/${created.body.id}/generate`).set('Authorization', auth).send({});
    expect(unclear.status).toBe(400);
    expect(unclear.body).toMatchObject({ code: 'validation_error', field: 'facts', reason: 'need_experience_or_education' });

    const role = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'experience',
        value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
        confirmation: 'confirmed',
      });
    expect(role.status).toBe(201);
    const missingKey = await http().post(`/api/career/v1/resumes/${created.body.id}/generate`).set('Authorization', auth).send({});
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });
    const blocked = await http()
      .post(`/api/career/v1/resumes/${created.body.id}/generate`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-gen-room')
      .send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: 'capacity_exceeded', field: 'resumeVersions', limit: 1 });

    const check = await http().get(`/api/career/v1/resume-versions/${created.body.version.id}/readability`).set('Authorization', auth);
    expect(check.status).toBe(200);
    expect(check.body.label).toBe('flacroncv_readability');
    expect(check.body.score).toBeUndefined();
    expect(check.body.issues.some((issue: { code: string }) => issue.code === 'uncertain_line')).toBe(true);
  });

  it('spends one credit and does not keep a sentence the model wrote', async () => {
    const auth = bearer('http-resume-paid');
    const contact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'contact',
        value: { fullName: 'Ada Lovelace', email: 'ada@example.test', city: 'Montreal' },
        confirmation: 'confirmed',
      });
    const account = await t.db.pool.query<{ id: string }>(
      `SELECT id FROM billing_accounts WHERE auth_user_id = 'http-resume-paid'`,
    );
    await new BillingService(t.db.pool).startSubscription(account.rows[0].id, {
      planId: 'starter',
      interval: 'monthly',
      provider: 'stripe',
      providerSubscriptionId: `sub-${account.rows[0].id}`,
      periodStart: new Date(),
      catalogVersion: CATALOG_VERSION,
    });
    const role = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'experience',
        value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
        confirmation: 'confirmed',
      });
    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const created = await http().post('/api/career/v1/resumes').set('Authorization', auth).send({ title: 'Ada', language: 'en' });
    model.always(
      RESUME_COMPOSE_TEMPLATE,
      JSON.stringify({ templateId: 'compact', factIds: [fact.body.id], blurb: 'FakeCo hired Ada' }),
    );
    const generated = await http()
      .post(`/api/career/v1/resumes/${created.body.id}/generate`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-paid')
      .send({ instructions: 'shorter' });
    expect(generated.status).toBe(201);
    const payload = JSON.stringify(generated.body.version);
    expect(payload).toContain('SQL');
    expect(payload).toContain('Ada Lovelace');
    expect(payload).toContain('Northwind Cataloguing');
    expect(payload).toContain(contact.body.id);
    expect(payload).toContain(role.body.id);
    expect(payload).not.toContain('FakeCo');
    expect(generated.body.usage).toMatchObject({ unit: 'document_credit', includedRemaining: 19, ledgerState: 'committed' });
    expect(generated.body.replayed).toBe(false);

    const replay = await http()
      .post(`/api/career/v1/resumes/${created.body.id}/generate`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-paid')
      .send({ instructions: 'shorter' });
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.version).toEqual(generated.body.version);
    const versions = await http().get(`/api/career/v1/resumes/${created.body.id}/versions`).set('Authorization', auth);
    expect(versions.body.items).toHaveLength(2);
  });
});
