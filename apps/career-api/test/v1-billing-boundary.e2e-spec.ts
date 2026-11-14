import request from 'supertest';
import { bearer } from '@flacroncv/career-server/src/testing';
import { createTestApp, TestApp } from './support';

/**
 * V1 billing is unchanged and is the only place a customer pays. The career
 * service therefore serves no V2 prices, checkout, portal or store webhooks.
 * (The spending cap and top-up opt-in ARE served: they only record consent;
 * V1 charges.) (Their logic stays unit-tested in
 * `packages/career-server/src/billing`; it is simply not reachable.)
 */
describe('V1 billing boundary', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_billing_boundary');
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it.each([
    ['get', '/api/career/v1/catalog'],
    ['get', '/api/career/v1/billing'],
    ['post', '/api/career/v1/estimates'],
    ['post', '/api/career/v1/checkout'],
    ['post', '/api/career/v1/billing/upgrade-preview'],
    ['post', '/api/career/v1/billing/portal'],
    ['post', '/api/career/v1/webhooks/stripe'],
    ['post', '/api/career/v1/webhooks/apple'],
    ['post', '/api/career/v1/webhooks/google'],
  ] as const)('%s %s is not served, signed in or not', async (method, path) => {
    expect((await http()[method](path).send({})).status).toBe(404);
    expect((await http()[method](path).set('Authorization', bearer('boundary-user')).send({})).status).toBe(404);
  });

  it('still reports career allowance usage (balances only, no prices)', async () => {
    const res = await http().get('/api/career/v1/usage').set('Authorization', bearer('usage-user'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.units)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/priceCents|price_id|checkout/i);
  });
});
