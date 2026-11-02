import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

describe('portfolios over HTTP (CV16)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_portfolios');
    await t.db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('portfolioPages', true), ('evidenceItems', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
  });

  it('publishes only evidence the owner marked as shared, even when more is linked', async () => {
    const auth = bearer('http-portfolio-sharing');
    const me = await http().get('/api/career/v1/me').set('Authorization', auth);
    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE auth_user_id = $1`, [me.body.user.authUserId]);
    const shared = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({ title: 'Shared certificate', evidenceType: 'credential', isPortfolioShared: true });
    const privateItem = await http()
      .post('/api/career/v1/evidence')
      .set('Authorization', auth)
      .send({ title: 'Private reference letter', evidenceType: 'credential', isPortfolioShared: false });
    expect(shared.status).toBe(201);
    expect(privateItem.status).toBe(201);

    const page = await http()
      .post('/api/career/v1/portfolios')
      .set('Authorization', auth)
      .send({ title: 'Work', displayName: 'Ada' });
    expect(page.status).toBe(201);
    const linked = await http()
      .patch(`/api/career/v1/portfolios/${page.body.id}`)
      .set('Authorization', auth)
      .send({ evidenceIds: [shared.body.id, privateItem.body.id] });
    expect(linked.status).toBe(200);
    await http().post(`/api/career/v1/portfolios/${page.body.id}/publish`).set('Authorization', auth).send({ visibility: 'public' });

    const open = await http().get(`/api/career/v1/portfolios/public/${page.body.slug}`);
    expect(open.status).toBe(200);
    expect((open.body.items as Array<{ title: string }>).map((item) => item.title)).toEqual(['Shared certificate']);
    expect(JSON.stringify(open.body)).not.toContain('Private reference letter');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('needs a token for the owner routes and hides an unknown public slug', async () => {
    expect((await http().get('/api/career/v1/portfolios')).status).toBe(401);
    expect((await http().post('/api/career/v1/portfolios').send({ title: 'Page' })).status).toBe(401);
    expect((await http().get('/api/career/v1/portfolios/public/abc123abc123')).status).toBe(404);
  });

  it('unpublishes a public page and rotates a private link', async () => {
    const auth = bearer('http-portfolio');
    await http().get('/api/career/v1/me').set('Authorization', auth);
    const me = await http().get('/api/career/v1/me').set('Authorization', auth);
    await t.db.pool.query(`UPDATE billing_accounts SET plan_id = 'starter' WHERE auth_user_id = $1`, [me.body.user.authUserId]);

    const created = await http().post('/api/career/v1/portfolios').set('Authorization', auth).send({ title: 'Fair page', displayName: 'Ada' });
    expect(created.status).toBe(201);
    const published = await http()
      .post(`/api/career/v1/portfolios/${created.body.id}/publish`)
      .set('Authorization', auth)
      .send({ visibility: 'public' });
    expect(published.status).toBe(201);
    const open = await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`);
    expect(open.status).toBe(200);
    expect(open.body.displayName).toBe('Ada');

    const renamed = await http()
      .patch(`/api/career/v1/portfolios/${created.body.id}`)
      .set('Authorization', auth)
      .send({ displayName: 'Ada King' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.slug).toBe(created.body.slug);

    const qr = await http()
      .get(`/api/career/v1/portfolios/${created.body.id}/qr`)
      .query({ origin: 'https://flacroncv.test' })
      .set('Authorization', auth);
    expect(qr.status).toBe(200);
    expect(qr.body.path).toBe(`/en/portfolio/${created.body.slug}`);
    expect(qr.body.svg).toContain('<svg');

    const closed = await http().post(`/api/career/v1/portfolios/${created.body.id}/unpublish`).set('Authorization', auth).send({});
    expect(closed.status).toBe(201);
    expect((await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`)).status).toBe(404);

    const privatePage = await http()
      .post(`/api/career/v1/portfolios/${created.body.id}/publish`)
      .set('Authorization', auth)
      .send({ visibility: 'private' });
    expect(privatePage.status).toBe(201);
    const token = privatePage.body.shareToken as string;
    expect((await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`)).status).toBe(404);
    expect((await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`).query({ token })).status).toBe(200);
    const rotated = await http().post(`/api/career/v1/portfolios/${created.body.id}/revoke`).set('Authorization', auth).send({});
    expect(rotated.status).toBe(201);
    expect((await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`).query({ token })).status).toBe(404);
    expect((await http().get(`/api/career/v1/portfolios/public/${created.body.slug}`).query({ token: rotated.body.shareToken })).status).toBe(200);
  });
});
