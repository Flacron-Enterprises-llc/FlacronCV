import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { ADMIN_UIDS } from '../src/admin/admin.controller';
import { createTestApp, TestApp } from './support';

describe('admin over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_admin', {
      customize: (builder) => builder.overrideProvider(ADMIN_UIDS).useValue(new Set(['http-admin'])),
    });
    // V1 integration: operators need V1's staff claim as well as the allowlist.
    t.tokens.set('http-admin', { role: 'super_admin' });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('refuses a customer, ignores a price id, and reports providers as unconfigured', async () => {
    expect((await http().get('/api/career/v1/admin/health')).status).toBe(401);
    const customer = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('http-customer'));
    expect(customer.status).toBe(403);
    expect(customer.body.code).toBe('permission_denied');

    // Allowlisted without V1's staff claim, and V1 staff without the allowlist: both refused.
    t.tokens.set('http-admin', { role: null });
    const noClaim = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('http-admin'));
    expect(noClaim.status).toBe(403);
    expect(noClaim.body.code).toBe('permission_denied');
    t.tokens.set('http-admin', { role: 'super_admin' });
    t.tokens.set('staff-not-listed', { role: 'admin' });
    const unlisted = await http().get('/api/career/v1/admin/health').set('Authorization', bearer('staff-not-listed'));
    expect(unlisted.status).toBe(403);

    const auth = bearer('http-admin');
    const priced = await http().post('/api/career/v1/admin/catalog').set('Authorization', auth).send({ priceId: 'price_secret' });
    expect(priced.status).toBe(400);
    expect(priced.body.code).toBe('validation_error');

    const published = await http().post('/api/career/v1/admin/catalog').set('Authorization', auth).send({});
    expect(published.status).toBe(201);
    expect(published.body.result).toBe('unchanged');
    const health = await http().get('/api/career/v1/admin/health').set('Authorization', auth);
    expect(health.status).toBe(200);
    expect(health.body.providers.every((row: { status: string }) => row.status === 'unconfigured')).toBe(true);
    expect(JSON.stringify(health.body)).not.toContain('sk_');
    const audit = await http().get('/api/career/v1/admin/audit').set('Authorization', auth);
    expect(audit.status).toBe(200);
    expect(audit.body.items.some((item: { action: string }) => item.action === 'catalog.unchanged')).toBe(true);
    expect(JSON.stringify(audit.body)).not.toContain('price_');
  });
});
