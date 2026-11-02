import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/**
 * V1 integration: V1 owns sign-in (`/auth/verify`), legal acceptance and
 * push tokens. The career service serves only `GET/PATCH /me` and creates
 * the career account on the first permitted request.
 */
describe('auth routes', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_auth');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  describe('without a valid token', () => {
    it.each([
      ['no header', undefined],
      ['a non-bearer header', 'Basic abc'],
      ['a token the verifier rejects', 'Bearer not-a-real-token'],
      ['an empty bearer', 'Bearer '],
    ])('GET /me with %s is 401 unauthenticated and creates nothing', async (_label, header) => {
      const req = http().get('/api/career/v1/me');
      if (header !== undefined) req.set('Authorization', header);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'unauthenticated' });
      const users = await t.db.pool.query(`SELECT count(*)::int AS n FROM users`);
      expect(users.rows[0].n).toBe(0);
    });

    it('health needs no token', async () => {
      expect((await http().get('/api/career/v1/health')).status).toBe(200);
    });
  });

  it('the first permitted request creates the career account once, even when two arrive together', async () => {
    const [a, b] = await Promise.all([
      http().get('/api/career/v1/me').set('Authorization', bearer('web-user')),
      http().get('/api/career/v1/me').set('Authorization', bearer('web-user')),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.user.id).toBe(b.body.user.id);
    const accounts = await t.db.pool.query(`SELECT count(*)::int AS n FROM billing_accounts WHERE auth_user_id = 'web-user'`);
    expect(accounts.rows[0].n).toBe(1);
  });

  it('GET /me returns user, workspace and plan; the token decides who you are', async () => {
    const res = await http().get('/api/career/v1/me').set('Authorization', bearer('me-user'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      user: { authUserId: 'me-user', locale: 'en', email: 'me-user@example.test', emailVerified: true },
      planId: 'free',
    });
    expect(typeof res.body.workspaceId).toBe('string');
    const other = await http().get('/api/career/v1/me').set('Authorization', bearer('other-user'));
    expect(other.body.workspaceId).not.toBe(res.body.workspaceId);
  });

  it('PATCH /me stores the document language (en or fr) and refuses another', async () => {
    const ok = await http().patch('/api/career/v1/me').set('Authorization', bearer('locale-user')).send({ locale: 'fr' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.locale).toBe('fr');
    const bad = await http().patch('/api/career/v1/me').set('Authorization', bearer('locale-user')).send({ locale: 'es' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ code: 'validation_error' });
  });

  it('does not serve V2 session, legal-acceptance or push-token routes (V1 owns them)', async () => {
    const auth = bearer('v1-owned');
    expect((await http().post('/api/career/v1/session').send({ idToken: 'fake:v1-owned' })).status).toBe(404);
    expect((await http().post('/api/career/v1/session/logout').set('Authorization', auth).send({})).status).toBe(404);
    expect((await http().get('/api/career/v1/legal-acceptances').set('Authorization', auth)).status).toBe(404);
    expect((await http().post('/api/career/v1/legal-acceptances').set('Authorization', auth).send({})).status).toBe(404);
    expect((await http().post('/api/career/v1/push-tokens').set('Authorization', auth).send({ token: 't' })).status).toBe(404);
  });
});
