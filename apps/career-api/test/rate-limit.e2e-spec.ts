import request from 'supertest';
import { OpportunityService, WindowRateLimit } from '@flacroncv/career-server';
import { bearer } from '@flacroncv/career-server/src/testing';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp, TestApp } from './support';

describe('search rate limit over HTTP', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp('api_rate', {
      customize: (builder) =>
        builder.overrideProvider(OpportunityService).useFactory({
          factory: (database: DatabaseService) =>
            new OpportunityService(database.connectionPool, { now: () => new Date() }, new WindowRateLimit(2, 60_000)),
          inject: [DatabaseService],
        }),
    });
  });

  afterAll(async () => {
    if (t) await t.close();
  });

  it('answers 429 rate_limited with the limit and does not charge', async () => {
    const auth = bearer('http-rate');
    expect((await http().get('/api/career/v1/opportunities').set('Authorization', auth)).status).toBe(200);
    expect((await http().get('/api/career/v1/opportunities').set('Authorization', auth)).status).toBe(200);
    const blocked = await http().get('/api/career/v1/opportunities').set('Authorization', auth);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('rate_limited');
    expect(blocked.body.limit).toBe(2);
    expect(typeof blocked.body.retryAt).toBe('string');
    const ledger = await t.db.pool.query(`SELECT 1 FROM usage_ledger`);
    expect(ledger.rowCount).toBe(0);
  });
});
