import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('career modes and relocation over HTTP (CV14)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_career_modes');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/career-modes/locations')).status).toBe(401);
    expect((await http().post('/api/career/v1/career-modes/locations').send({})).status).toBe(401);
    expect((await http().get('/api/career/v1/career-modes/specialist-mode')).status).toBe(401);
    expect((await http().put('/api/career/v1/career-modes/specialist-mode').send({})).status).toBe(401);
  });

  it('runs the full relocation and specialist modes workflow over HTTP', async () => {
    const auth = bearer('http-modes-user');

    // 1. Initial /me call initializes account
    const meRes = await http().get('/api/career/v1/me').set('Authorization', auth);
    expect(meRes.status).toBe(200);

    // 2. Initial list of locations shows capacity = 1 and radius = 25 mi
    const listRes1 = await http()
      .get('/api/career/v1/career-modes/locations')
      .set('Authorization', auth);
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.items).toEqual([]);
    expect(listRes1.body.capacity).toBe(1);
    expect(listRes1.body.allowedRadiusMiles).toBe(25);

    // 3. Create a location profile
    const createRes = await http()
      .post('/api/career/v1/career-modes/locations')
      .set('Authorization', auth)
      .send({
        place: 'Austin, TX',
        radiusMiles: 25,
        targetTimeline: '1_to_3_months',
        isRelocation: true,
        workAuthorization: 'citizen',
        commuteMinutesMax: 30,
        remoteFlexibility: 'hybrid',
        notes: 'Targeting Domain or Downtown Austin.',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.place).toBe('Austin, TX');
    expect(createRes.body.isRelocation).toBe(true);
    expect(createRes.body.commuteMinutesMax).toBe(30);

    const locationId = createRes.body.id;

    // 4. Try creating second location - exceeds capacity of 1 on Free
    const exceedCapRes = await http()
      .post('/api/career/v1/career-modes/locations')
      .set('Authorization', auth)
      .send({
        place: 'Dallas, TX',
        radiusMiles: 20,
      });
    expect(exceedCapRes.status).toBe(409);
    expect(exceedCapRes.body.code).toBe('capacity_exceeded');

    // 5. Update location profile
    const updateRes = await http()
      .patch(`/api/career/v1/career-modes/locations/${locationId}`)
      .set('Authorization', auth)
      .send({
        commuteMinutesMax: 45,
        notes: 'Updated: will consider Round Rock too.',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.commuteMinutesMax).toBe(45);
    expect(updateRes.body.notes).toBe('Updated: will consider Round Rock too.');

    // 6. Specialist Mode on Free defaults to general
    const modeRes1 = await http()
      .get('/api/career/v1/career-modes/specialist-mode')
      .set('Authorization', auth);
    expect(modeRes1.status).toBe(200);
    expect(modeRes1.body.mode).toBe('general');

    // Setting specialist mode on Free is rejected with plan_upgrade_required
    const setModeFreeRes = await http()
      .put('/api/career/v1/career-modes/specialist-mode')
      .set('Authorization', auth)
      .send({
        mode: 'technical_engineering',
      });
    expect(setModeFreeRes.status).toBe(403);
    expect(setModeFreeRes.body.code).toBe('plan_upgrade_required');

    // 7. Upgrade account to Starter plan
    const billingAccountRes = await t.db.pool.query<{ id: string }>(
      `SELECT id FROM billing_accounts WHERE workspace_id = $1`,
      [meRes.body.workspaceId],
    );
    const billingAccountId = billingAccountRes.rows[0].id;
    await t.db.pool.query(
      `UPDATE billing_accounts SET plan_id = 'starter' WHERE id = $1`,
      [billingAccountId],
    );

    // 8. Now set specialist mode to technical_engineering
    const setModeStarterRes = await http()
      .put('/api/career/v1/career-modes/specialist-mode')
      .set('Authorization', auth)
      .send({
        mode: 'technical_engineering',
        focusAreas: ['Distributed Systems', 'Cloud Native'],
        customGuidelines: 'Prioritize scale and latency benchmarks.',
      });
    expect(setModeStarterRes.status).toBe(200);
    expect(setModeStarterRes.body.mode).toBe('technical_engineering');
    expect(setModeStarterRes.body.focusAreas).toEqual(['Distributed Systems', 'Cloud Native']);

    // 9. Delete location profile
    const delRes = await http()
      .delete(`/api/career/v1/career-modes/locations/${locationId}`)
      .set('Authorization', auth);
    expect(delRes.status).toBe(200);

    const listResFinal = await http()
      .get('/api/career/v1/career-modes/locations')
      .set('Authorization', auth);
    expect(listResFinal.body.items).toEqual([]);
  });
});
