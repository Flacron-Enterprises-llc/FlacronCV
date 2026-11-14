import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import { BillingService } from '../billing/billing.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { WindowRateLimit } from './rate-limit';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-17T04:00:00Z');
  return { uid, email: null, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('search rate limit', () => {
  let db: TestDatabase;
  let clock: TestClock;

  beforeAll(async () => {
    db = await createTestDatabase('rate-limit');
    clock = new TestClock('2026-10-17T04:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  it('refuses the third search in the window and does not write the ledger', async () => {
    const identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    const ada = await identities.principal(identity('rate-ada'));
    const opportunities = new OpportunityService(db.pool, clock, new WindowRateLimit(2, 60_000));
    await opportunities.search(ada, {});
    await opportunities.search(ada, {});
    await expect(opportunities.search(ada, {})).rejects.toMatchObject({ code: 'rate_limited', details: { limit: 2 } });
    const ledger = await db.pool.query(`SELECT 1 FROM usage_ledger`);
    expect(ledger.rowCount).toBe(0);
    clock.set('2026-10-17T04:01:01Z');
    await expect(opportunities.search(ada, {})).resolves.toEqual({ items: [], notApplied: [] });
  });
});
