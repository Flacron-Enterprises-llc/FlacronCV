import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('applications over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_applications');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/applications')).status).toBe(401);
    expect((await http().post('/api/career/v1/applications').send({})).status).toBe(401);
  });

  it('saves a listing, keeps the same id, and does not write a score', async () => {
    const auth = bearer('http-app');
    const resume = await http().post('/api/career/v1/resumes').set('Authorization', auth).send({ title: 'Ada', language: 'en' });
    expect(resume.status).toBe(201);
    const listing = await http()
      .post('/api/career/v1/opportunities')
      .set('Authorization', auth)
      .send({ text: 'SQL analyst\nKeep the ledger.' });
    expect(listing.status).toBe(201);

    const created = await http().post('/api/career/v1/applications').set('Authorization', auth).send({
      opportunityId: listing.body.id,
      resumeVersionId: resume.body.version.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('saved');
    expect(created.body.snapshot.title).toBe('SQL analyst');
    expect(created.body.score).toBeUndefined();

    const again = await http().post('/api/career/v1/applications').set('Authorization', auth).send({
      opportunityId: listing.body.id,
      resumeVersionId: resume.body.version.id,
    });
    expect(again.body.id).toBe(created.body.id);

    const moved = await http()
      .patch(`/api/career/v1/applications/${created.body.id}`)
      .set('Authorization', auth)
      .send({ status: 'applied', notes: 'Sent Tuesday' });
    expect(moved.status).toBe(200);
    expect(moved.body.id).toBe(created.body.id);
    expect(moved.body.status).toBe('applied');

    const other = await http().get(`/api/career/v1/applications/${created.body.id}`).set('Authorization', bearer('http-app-other'));
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ code: 'permission_denied' });
  });
});
