import request from 'supertest';
import { COVER_LETTER_TEMPLATE, WRITING_TEMPLATE } from '@flacroncv/career-server';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';

describe('writing over HTTP', () => {
  let t: TestApp;
  const model = new FakeTextModel();
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_writing', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/writing')).status).toBe(401);
    expect((await http().post('/api/career/v1/writing').send({ type: 'bio', opportunityId: null })).status).toBe(401);
  });

  it('spends one credit on confirmed facts and lets an edit through without another', async () => {
    const auth = bearer('http-writing');
    const draft = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'experience', value: { position: 'Analyst', company: 'SecretCo' }, confirmation: 'draft' });
    expect(draft.status).toBe(201);
    const refused = await http()
      .post('/api/career/v1/writing')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-writing-empty')
      .send({ type: 'bio', opportunityId: null });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: 'validation_error', field: 'facts', reason: 'no_confirmed_facts' });

    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    expect(fact.status).toBe(201);
    model.always(
      WRITING_TEMPLATE,
      JSON.stringify({ factIds: [fact.body.id], letter: 'raised $50 million at Initech' }),
    );
    const missingKey = await http().post('/api/career/v1/writing').set('Authorization', auth).send({ type: 'bio', opportunityId: null });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });

    const created = await http()
      .post('/api/career/v1/writing')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-writing-1')
      .send({ type: 'bio', opportunityId: null });
    expect(created.status).toBe(201);
    expect(created.body.document.body).toBe('SQL');
    expect(created.body.document.title).toBe('Bio');
    expect(created.body.document.templateId).toBe('classic');
    expect(JSON.stringify(created.body.document)).not.toContain('Initech');
    expect(JSON.stringify(created.body.document)).not.toContain('SecretCo');
    expect(created.body.usage).toMatchObject({ unit: 'document_credit', includedRemaining: 2, ledgerState: 'committed' });
    expect(created.body.replayed).toBe(false);

    const replay = await http()
      .post('/api/career/v1/writing')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-writing-1')
      .send({ type: 'bio', opportunityId: null });
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.document).toEqual(created.body.document);

    const edited = await http()
      .patch(`/api/career/v1/writing/${created.body.document.id}`)
      .set('Authorization', auth)
      .send({ body: 'SQL, as I would tell it' });
    expect(edited.status).toBe(200);
    expect(edited.body.body).toBe('SQL, as I would tell it');
    const list = await http().get('/api/career/v1/writing').set('Authorization', auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.documentCredit.includedRemaining).toBe(2);

    const other = await http().get(`/api/career/v1/writing/${created.body.document.id}`).set('Authorization', bearer('http-writing-other'));
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ code: 'permission_denied' });

    const role = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({
        factType: 'experience',
        value: { position: 'Cataloguer', company: 'Northwind Cataloguing', startDate: '2019-03', endDate: '2024-06' },
        confirmation: 'confirmed',
      });
    expect(role.status).toBe(201);
    model.always(
      COVER_LETTER_TEMPLATE,
      JSON.stringify({
        opening: 'I am writing to apply and to share the work I did at Northwind Cataloguing.',
        body: 'At Northwind Cataloguing I worked as a cataloguer from 2019-03 to 2024-06 and used SQL every week to keep the inventory records accurate for the team. That confirmed experience is the evidence I can offer.',
        closing: 'Thank you for your time and consideration.',
        factIds: [role.body.id, fact.body.id],
      }),
    );
    const letter = await http()
      .post('/api/career/v1/writing')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-writing-letter')
      .send({ type: 'cover_letter', opportunityId: null, templateId: 'creative' });
    expect(letter.status).toBe(201);
    expect(letter.body.document.templateId).toBe('creative');
    expect(letter.body.document.body).toContain('Northwind Cataloguing');
    expect(letter.body.document.body.split('\n\n')).toHaveLength(3);
    const switched = await http()
      .patch(`/api/career/v1/writing/${letter.body.document.id}`)
      .set('Authorization', auth)
      .send({ templateId: 'modern' });
    expect(switched.status).toBe(200);
    expect(switched.body.templateId).toBe('modern');
    expect(switched.body.body).toBe(letter.body.document.body);
    const pdf = await http()
      .get(`/api/career/v1/writing/${letter.body.document.id}/export`)
      .query({ format: 'pdf' })
      .set('Authorization', auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).toString('latin1')).toContain('Northwind Cataloguing');
    const docx = await http()
      .get(`/api/career/v1/writing/${letter.body.document.id}/export`)
      .query({ format: 'docx' })
      .set('Authorization', auth);
    expect(docx.status).toBe(403);
    expect(docx.body).toEqual({ code: 'plan_upgrade_required', feature: 'docxExport', minimumPlan: 'starter' });
  });
});
