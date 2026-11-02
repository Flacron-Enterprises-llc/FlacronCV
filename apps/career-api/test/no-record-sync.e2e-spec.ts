import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/**
 * V1 integration: Firestore stays the only store of V1 CVs, cover letters and
 * job applications; Postgres holds only career records. Nothing synchronises
 * them, so V2's former record-sharing endpoints (/shared/v1) stay unserved.
 */
describe('no record synchronisation endpoints', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_v2_isolation');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('answers 404 for every former /shared/v1 route, signed in or not', async () => {
    const auth = bearer('iso-ada');
    for (const path of ['/api/career/v1/shared/v1/cvs', '/api/career/v1/shared/v1/cvs/any-id', '/api/career/v1/shared/v1/cover-letters']) {
      expect((await http().get(path).set('Authorization', auth)).status).toBe(404);
      expect((await http().post(path).set('Authorization', auth).send({ title: 'x' })).status).toBe(404);
    }
    expect((await t.db.pool.query(`SELECT 1 FROM shared_record_requests`)).rowCount).toBe(0);
  });
});

/**
 * V1's Jobs tracker (Firestore `job_applications`) is the only application
 * tracker. V2's separate tracker routes are not served, so a customer can
 * never end up with two disagreeing lists; outcome analytics read V1's.
 */
describe('one application tracker', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_one_tracker');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('does not serve the V2 applications routes', async () => {
    const auth = bearer('tracker-ada');
    expect((await http().get('/api/career/v1/applications').set('Authorization', auth)).status).toBe(404);
    expect((await http().post('/api/career/v1/applications').set('Authorization', auth).send({})).status).toBe(404);
    expect((await http().get('/api/career/v1/applications/any/calendar').set('Authorization', auth)).status).toBe(404);
  });
});
