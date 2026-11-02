import request from 'supertest';
import { DAILY_IMPORT_LIMIT } from '@flacroncv/career-shared';
import { RESUME_IMPORT_TEMPLATE } from '@flacroncv/career-server';
import { bearer, FakeTextModel } from '@flacroncv/career-server/src/testing';
import { TEXT_MODEL } from '../src/ai/ai.providers';
import { createTestApp, TestApp } from './support';

const RESUME = `Grace Hopper
grace@example.test
Rear Admiral, US Navy, 1967 to 1986
Skills: COBOL`;

describe('career facts and import over HTTP', () => {
  let t: TestApp;
  const model = new FakeTextModel();
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_profile', {
      customize: (builder) => builder.overrideProvider(TEXT_MODEL).useValue(model),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/facts')).status).toBe(401);
    expect((await http().post('/api/career/v1/imports').send({ text: RESUME })).status).toBe(401);
  });

  it('creates, edits, confirms and lists a fact, with history', async () => {
    const auth = bearer('http-facts');
    const created = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'experience', value: { company: 'Acme', startDate: '2020-02' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ confirmation: 'draft', missingFields: ['position'] });

    const early = await http().post(`/api/career/v1/facts/${created.body.id}/confirm`).set('Authorization', auth);
    expect(early.status).toBe(400);
    expect(early.body).toEqual({ code: 'validation_error', errors: [{ field: 'position', reason: 'required' }] });

    const edited = await http()
      .patch(`/api/career/v1/facts/${created.body.id}`)
      .set('Authorization', auth)
      .send({ value: { position: 'Engineer' } });
    expect(edited.status).toBe(200);
    const confirmed = await http().post(`/api/career/v1/facts/${created.body.id}/confirm`).set('Authorization', auth);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.confirmation).toBe('confirmed');

    const list = await http().get('/api/career/v1/facts').set('Authorization', auth);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.profileVersion).toBe(3);
    const history = await http().get(`/api/career/v1/facts/${created.body.id}/revisions`).set('Authorization', auth);
    expect(history.body.items.map((r: { change: string }) => r.change)).toEqual(['created', 'edited', 'confirmed']);
  });

  it('refuses a bad envelope and a bad value with the field that is wrong', async () => {
    const auth = bearer('http-facts-bad');
    const type = await http().post('/api/career/v1/facts').set('Authorization', auth).send({ factType: 'hobby', value: {} });
    expect(type.status).toBe(400);
    expect(type.body).toEqual({ code: 'validation_error' });
    const date = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', auth)
      .send({ factType: 'education', value: { institution: 'MIT', endDate: 'June 2020' } });
    expect(date.status).toBe(400);
    expect(date.body).toEqual({ code: 'validation_error', errors: [{ field: 'endDate', reason: 'invalid_date' }] });
  });

  it("is 403 on someone else's fact, 404 on none, and delete removes it", async () => {
    const owner = bearer('http-owner');
    const created = await http()
      .post('/api/career/v1/facts')
      .set('Authorization', owner)
      .send({ factType: 'skill', value: { name: 'SQL' } });
    const other = await http().get(`/api/career/v1/facts/${created.body.id}`).set('Authorization', bearer('http-intruder'));
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ code: 'permission_denied' });
    const missing = await http().get('/api/career/v1/facts/00000000-0000-4000-8000-000000000000').set('Authorization', owner);
    expect(missing.status).toBe(404);
    const removed = await http().delete(`/api/career/v1/facts/${created.body.id}`).set('Authorization', owner);
    expect(removed.body).toEqual({ ok: true });
    expect((await http().get(`/api/career/v1/facts/${created.body.id}`).set('Authorization', owner)).status).toBe(404);
  });

  it('saves preferences and reports counts on the profile', async () => {
    const auth = bearer('http-prefs');
    const saved = await http()
      .patch('/api/career/v1/profile/preferences')
      .set('Authorization', auth)
      .send({ preferences: { targetRoles: ['Analyst'], schedules: ['full_time'] } });
    expect(saved.status).toBe(200);
    expect(saved.body.preferences).toMatchObject({ targetRoles: ['Analyst'], schedules: ['full_time'] });
    expect(saved.body.counts).toEqual({
      confirmed: 0,
      draft: 0,
      uncertain: 0,
      missingCore: ['contact', 'summary', 'experience', 'education', 'skill'],
    });
  });

  it('imports text into drafts, shows the allowance, and never writes the ledger', async () => {
    const auth = bearer('http-import');
    const before = await http().get('/api/career/v1/imports/allowance').set('Authorization', auth);
    expect(before.body).toMatchObject({ limit: DAILY_IMPORT_LIMIT, used: 0, remaining: DAILY_IMPORT_LIMIT });

    model.once(
      RESUME_IMPORT_TEMPLATE,
      JSON.stringify({
        contact: { fullName: 'Grace Hopper', email: 'grace@example.test' },
        experience: [{ position: 'Rear Admiral', company: 'US Navy', startDate: '1967', endDate: '1986' }],
        skills: ['COBOL', 'Fortran'],
      }),
    );
    const res = await http()
      .post('/api/career/v1/imports')
      .set('Authorization', auth)
      .send({ text: RESUME, fileName: 'grace.docx', format: 'docx' });
    expect(res.status).toBe(201);
    expect(res.body.missing).toEqual(['summary', 'education']);
    expect(res.body.importsRemaining).toBe(DAILY_IMPORT_LIMIT - 1);
    const fortran = res.body.facts.find((f: { value: { name?: string } }) => f.value.name === 'Fortran');
    expect(fortran.uncertain).toEqual({ name: { reason: 'not_found_in_source' } });

    const ledger = await t.db.pool.query(`SELECT count(*)::int AS n FROM usage_ledger`);
    expect(ledger.rows[0].n).toBe(0);
  });

  it('answers 503 when the model fails, and the import is not counted', async () => {
    const auth = bearer('http-import-fail');
    model.once(RESUME_IMPORT_TEMPLATE, new Error('down'));
    const res = await http().post('/api/career/v1/imports').set('Authorization', auth).send({ text: RESUME });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ code: 'provider_unavailable', reason: 'provider_error' });
    const allowance = await http().get('/api/career/v1/imports/allowance').set('Authorization', auth);
    expect(allowance.body.used).toBe(0);
  });

  it('answers 429 import_daily_limit with the number and the reset', async () => {
    const auth = bearer('http-import-limit');
    await http().get('/api/career/v1/me').set('Authorization', auth);
    await t.db.pool.query(
      `INSERT INTO import_daily_counts (auth_user_id, usage_date, count) VALUES ('http-import-limit', (now() AT TIME ZONE 'UTC')::date, $1)`,
      [DAILY_IMPORT_LIMIT],
    );
    const res = await http().post('/api/career/v1/imports').set('Authorization', auth).send({ text: RESUME });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: 'import_daily_limit', limit: DAILY_IMPORT_LIMIT, used: DAILY_IMPORT_LIMIT });
    expect(typeof res.body.resetsAt).toBe('string');
  });

  it('accepts resume text larger than the default 100kb body limit', async () => {
    const auth = bearer('http-import-big');
    model.once(RESUME_IMPORT_TEMPLATE, JSON.stringify({ skills: ['COBOL'] }));
    const text = `${RESUME}\n${'é'.repeat(90_000)}`;
    const res = await http().post('/api/career/v1/imports').set('Authorization', auth).send({ text });
    expect(res.status).toBe(201);
  });
});
