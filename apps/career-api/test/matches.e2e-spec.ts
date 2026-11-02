import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('matches over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_matches');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token and an explicit mode', async () => {
    expect((await http().post('/api/career/v1/matches').send({})).status).toBe(401);
    const auth = bearer('http-match');
    const missing = await http()
      .post('/api/career/v1/matches')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-match-mode')
      .send({
        resumeVersionId: '00000000-0000-4000-8000-000000000001',
        opportunityId: '00000000-0000-4000-8000-000000000002',
      });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'validation_error', field: 'mode' });
  });

  it('spends one analysis and reopens it without another', async () => {
    const auth = bearer('http-match-ada');
    const fact = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    expect(fact.status).toBe(201);
    const resume = await http().post('/api/career/v1/resumes').set('Authorization', auth).send({ title: 'Ada', language: 'en' });
    expect(resume.status).toBe(201);
    const listing = await http()
      .post('/api/career/v1/opportunities')
      .set('Authorization', auth)
      .send({ text: 'Ledger analyst\nSQL is required. Pay was not written.' });
    expect(listing.status).toBe(201);
    expect(listing.body.resumeAnalysis.includedRemaining).toBe(3);

    const created = await http()
      .post('/api/career/v1/matches')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-match-1')
      .send({ resumeVersionId: resume.body.version.id, opportunityId: listing.body.id, mode: 'explicit' });
    expect(created.status).toBe(201);
    expect(created.body.match.reasons.some((reason: { token: string }) => reason.token === 'sql')).toBe(true);
    expect(created.body.match.unknowns).toContainEqual({ code: 'pay' });
    expect(created.body.match.hiringProbability).toBeUndefined();
    expect(created.body.usage).toMatchObject({ unit: 'resume_analysis', includedRemaining: 2, ledgerState: 'committed' });

    const again = await http()
      .post('/api/career/v1/matches')
      .set('Authorization', auth)
      .set('Idempotency-Key', 'http-match-2')
      .send({ resumeVersionId: resume.body.version.id, opportunityId: listing.body.id, mode: 'explicit' });
    expect(again.body.replayed).toBe(true);
    expect(again.body.match.id).toBe(created.body.match.id);
    expect(again.body.usage.includedRemaining).toBe(2);

    const saved = await http()
      .get('/api/career/v1/matches')
      .query({ opportunityId: listing.body.id, resumeVersionId: resume.body.version.id })
      .set('Authorization', auth);
    expect(saved.body.match.id).toBe(created.body.match.id);
    const other = await http().get(`/api/career/v1/analyses/${created.body.match.id}`).set('Authorization', bearer('http-match-stranger'));
    expect(other.status).toBe(403);
  });
});
