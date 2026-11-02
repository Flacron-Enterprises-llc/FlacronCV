import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('account export and deletion over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  // setup-env binds in-memory storage for other suites; this suite checks the unconfigured refusal.
  const storage = process.env.OBJECT_STORAGE;

  beforeAll(async () => {
    process.env.OBJECT_STORAGE = '';
    t = await createTestApp('api_privacy');
  });

  afterAll(async () => {
    if (t) await t.close();
    process.env.OBJECT_STORAGE = storage;
  });

  it('refuses export without storage and refuses a delete that is not confirmed', async () => {
    expect((await http().post('/api/career/v1/exports').send({ scope: 'personal' })).status).toBe(401);
    expect((await http().post('/api/career/v1/account/delete').send({ confirm: 'DELETE', idToken: 'fake:http-privacy' })).status).toBe(401);

    const auth = bearer('http-privacy');
    const exported = await http().post('/api/career/v1/exports').set('Authorization', auth).send({ scope: 'personal' });
    expect(exported.status).toBe(503);
    expect(exported.body.code).toBe('provider_unavailable');

    const user = await t.db.pool.query<{ workspace_id: string }>(
      `SELECT w.id AS workspace_id FROM users u JOIN workspaces w ON w.owner_user_id = u.id WHERE u.auth_user_id = 'http-privacy'`,
    );
    await t.db.pool.query(
      `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation)
       VALUES ($1, 'http-privacy', 'skill', '{"name":"SQL"}'::jsonb, 'manual', 'draft')`,
      [user.rows[0].workspace_id],
    );

    const wrong = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'delete', idToken: 'fake:http-privacy' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('validation_error');

    t.tokens.set('http-privacy', { authTime: new Date('2020-01-01T00:00:00Z') });
    const stale = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'DELETE', idToken: 'fake:http-privacy' });
    expect(stale.status).toBe(400);
    expect(stale.body.reason).toBe('stale');
    const kept = await t.db.pool.query(`SELECT 1 FROM career_facts WHERE candidate_auth_user_id = 'http-privacy'`);
    expect(kept.rowCount).toBe(1);

    t.tokens.set('http-privacy', { authTime: new Date() });
    const removed = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'DELETE', idToken: 'fake:http-privacy' });
    expect(removed.status).toBe(201);
    expect(removed.body).toEqual({ deleted: true });
    const facts = await t.db.pool.query(`SELECT 1 FROM career_facts WHERE candidate_auth_user_id = 'http-privacy'`);
    expect(facts.rowCount).toBe(0);
    const gone = await t.db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'http-privacy'`);
    expect(gone.rowCount).toBe(0);
    expect(t.signIns.deleted).toContain('fake:http-privacy');

    // A token issued before the deletion is still signed, but it cannot open a new empty account.
    const after = await http().get('/api/career/v1/me').set('Authorization', auth);
    expect(after.status).toBe(403);
    expect((await t.db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'http-privacy'`)).rowCount).toBe(0);
  });

  it('keeps the account and its sign-in when removing the sign-in fails, and the retry finishes', async () => {
    const auth = bearer('http-retry');
    expect((await http().get('/api/career/v1/me').set('Authorization', auth)).status).toBe(200);
    t.tokens.set('http-retry', { authTime: new Date() });
    t.signIns.failNext = 1;
    const failed = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'DELETE', idToken: 'fake:http-retry' });
    expect(failed.status).toBe(503);
    const marked = await t.db.pool.query(`SELECT deletion_requested_at, sign_in_deleted_at FROM users WHERE auth_user_id = 'http-retry'`);
    expect(marked.rows[0].deletion_requested_at).not.toBeNull();
    expect(marked.rows[0].sign_in_deleted_at).toBeNull();
    const retried = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'DELETE', idToken: 'fake:http-retry' });
    expect(retried.status).toBe(201);
    expect(t.signIns.deleted).toContain('fake:http-retry');
    expect((await t.db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'http-retry'`)).rowCount).toBe(0);
  });

  it('refuses other requests once deletion has started, but lets the deletion itself finish', async () => {
    const auth = bearer('http-pending');
    expect((await http().get('/api/career/v1/me').set('Authorization', auth)).status).toBe(200);
    await t.db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = 'http-pending'`);
    const me = await http().get('/api/career/v1/me').set('Authorization', auth);
    expect(me.status).toBe(403);
    expect(me.body).toEqual({ code: 'permission_denied' });
    t.tokens.set('http-pending', { authTime: new Date() });
    const removed = await http().post('/api/career/v1/account/delete').set('Authorization', auth).send({ confirm: 'DELETE', idToken: 'fake:http-pending' });
    expect(removed.status).toBe(201);
    expect(removed.body).toEqual({ deleted: true });
    expect((await t.db.pool.query(`SELECT 1 FROM users WHERE auth_user_id = 'http-pending'`)).rowCount).toBe(0);
  });
});
