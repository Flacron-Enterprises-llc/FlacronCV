import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('alerts over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_alerts');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/alerts')).status).toBe(401);
    expect((await http().post('/api/career/v1/saved-searches').send({ q: 'SQL' })).status).toBe(401);
  });

  it('keeps a second Free search off the list and refuses push', async () => {
    const auth = bearer('http-alerts');
    const created = await http().post('/api/career/v1/saved-searches').set('Authorization', auth).send({ q: 'SQL' });
    expect(created.status).toBe(201);
    expect(created.body.schedule).toBe('weekly');

    const second = await http().post('/api/career/v1/saved-searches').set('Authorization', auth).send({ q: 'COBOL' });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'capacity_exceeded', field: 'savedSearches', limit: 1 });

    const list = await http().get('/api/career/v1/saved-searches').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const push = await http().patch('/api/career/v1/alert-settings').set('Authorization', auth).send({ push: true });
    expect(push.status).toBe(403);
    expect(push.body).toMatchObject({ code: 'plan_upgrade_required', feature: 'alertDelivery', minimumPlan: 'professional' });

    const weekly = await http().patch('/api/career/v1/alert-settings').set('Authorization', auth).send({ digest: 'weekly', email: true });
    expect(weekly.status).toBe(200);
    expect(weekly.body).toMatchObject({ digest: 'weekly', push: false, email: true });

    const center = await http().get('/api/career/v1/alerts').set('Authorization', auth);
    expect(center.status).toBe(200);
    expect(center.body.items).toEqual([]);
    expect(center.body.alertItem.includedRemaining).toBe(10);
    expect(center.body.score).toBeUndefined();
  });
});
