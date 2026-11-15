import request from 'supertest';
import { COACH_TEMPLATE } from '@flacroncv/career-server';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';

describe('career coach over HTTP', () => {
  let t: TestApp;
  const model = new FakeTextModel();
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_coaching', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/coaching')).status).toBe(401);
    expect((await http().post('/api/career/v1/coaching').send({ question: 'Hello' })).status).toBe(401);
  });

  it('answers a question on Free, continues the conversation, and deletes it', async () => {
    const auth = bearer('http-coach');
    const empty = await http().get('/api/career/v1/coaching').set('Authorization', auth);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ items: [], coaching: { includedRemaining: 5, packRemaining: 0 } });

    const missingKey = await http().post('/api/career/v1/coaching').set('Authorization', auth).send({ question: 'How do I start?' });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body).toEqual({ code: 'validation_error', field: 'Idempotency-Key' });

    const badLocale = await http()
      .post('/api/career/v1/coaching')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-coach-locale')
      .send({ question: 'How do I start?', locale: 'it' });
    expect(badLocale.status).toBe(400);

    model.once(COACH_TEMPLATE, 'Start with the roles that use your SQL.');
    const first = await http()
      .post('/api/career/v1/coaching')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-coach-1')
      .send({ question: 'How do I start?', locale: 'de' });
    expect(first.status).toBe(201);
    expect(first.body.thread).toMatchObject({ title: 'How do I start?', messageCount: 2, opportunityId: null });
    expect(first.body.thread.messages[1]).toMatchObject({ role: 'assistant', content: 'Start with the roles that use your SQL.' });
    expect(first.body.usage).toMatchObject({ unit: 'coaching_response', includedRemaining: 4, ledgerState: 'committed' });
    expect(first.body.replayed).toBe(false);

    model.once(COACH_TEMPLATE, 'Then tailor your CV.');
    const second = await http()
      .post('/api/career/v1/coaching')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-coach-2')
      .send({ question: 'And then?', threadId: first.body.thread.id });
    expect(second.status).toBe(201);
    expect(second.body.thread.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    const listed = await http().get('/api/career/v1/coaching').set('Authorization', auth);
    expect(listed.body.items).toEqual([expect.objectContaining({ id: first.body.thread.id, messageCount: 4 })]);
    expect(listed.body.coaching.includedRemaining).toBe(3);

    const other = await http().get(`/api/career/v1/coaching/${first.body.thread.id}`).set('Authorization', bearer('http-coach-other'));
    expect(other.status).toBe(403);

    const removed = await http().delete(`/api/career/v1/coaching/${first.body.thread.id}`).set('Authorization', auth);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });
    expect((await http().get(`/api/career/v1/coaching/${first.body.thread.id}`).set('Authorization', auth)).status).toBe(404);
  });
});
