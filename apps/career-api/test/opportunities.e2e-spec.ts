import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('opportunities over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_opportunities');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token', async () => {
    expect((await http().get('/api/career/v1/opportunities')).status).toBe(401);
    expect((await http().post('/api/career/v1/opportunities').send({ text: 'Analyst' })).status).toBe(401);
  });

  it('saves a paste, searches it, and refuses a radius past Free', async () => {
    const auth = bearer('http-opp');
    const created = await http()
      .post('/api/career/v1/opportunities')
      .set('Authorization', auth)
      .send({ text: 'Ledger analyst\nKeep the ledger. Pay was not written down.', sourceUrl: 'https://example.test/paste' });
    expect(created.status).toBe(201);
    expect(created.body.organization).toBeNull();
    expect(created.body.compensation).toMatchObject({ minimum: null, maximum: null });
    expect(created.body.sponsorship).toBe('unknown');
    expect(created.body.description).toContain('not written down');
    expect(created.body.score).toBeUndefined();

    const again = await http()
      .post('/api/career/v1/opportunities')
      .set('Authorization', auth)
      .send({ text: 'Ledger analyst\nKeep the ledger. Pay was not written down.' });
    expect(again.body.id).toBe(created.body.id);

    const list = await http().get('/api/career/v1/opportunities').query({ q: 'Ledger' }).set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const wide = await http().get('/api/career/v1/opportunities').query({ radiusMiles: 200 }).set('Authorization', auth);
    expect(wide.status).toBe(400);
    expect(wide.body).toMatchObject({ code: 'validation_error', field: 'radiusMiles', limit: 25 });

    const other = await http().get(`/api/career/v1/opportunities/${created.body.id}`).set('Authorization', bearer('http-opp-other'));
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ code: 'permission_denied' });

    const missing = await http()
      .get('/api/career/v1/opportunities/00000000-0000-4000-8000-000000000099')
      .set('Authorization', auth);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ code: 'not_found' });
  });
});
