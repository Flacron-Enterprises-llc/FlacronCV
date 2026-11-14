import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { UnconfiguredJobFeed } from './feeds';
import { parseAdzuna, parseGreenhouse, parseLever, parseUsajobs } from './normalize';
import { OpportunityService } from './opportunity.service';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as unknown;
}

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('OpportunityService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let opportunities: OpportunityService;

  beforeAll(async () => {
    db = await createTestDatabase('opportunities');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    opportunities = new OpportunityService(db.pool, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('dedupes two feeds, keeps unknown pay, and labels a past deadline expired', async () => {
    const p = await person('opp-reader');
    const first = await opportunities.ingest(null, [
      ...parseAdzuna(fixture('adzuna.json')),
      ...parseUsajobs(fixture('usajobs.json')),
      ...parseLever(fixture('lever.json'), 'Harbour Office'),
    ]);
    expect(first).toMatchObject({ inserted: 4, deduped: 0 });
    const second = await opportunities.ingest(null, parseGreenhouse(fixture('greenhouse.json'), 'Babbage Works'));
    expect(second.deduped).toBe(1);
    expect(second.inserted).toBe(0);

    const listed = await opportunities.search(p, { q: 'ledger' });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      title: 'Ledger analyst',
      organization: 'Babbage Works',
      compensation: { minimum: null, maximum: null },
      sponsorship: 'unknown',
      label: 'open',
    });
    expect(JSON.stringify(listed.items[0])).not.toContain('score');
    const revisions = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM opportunity_revisions r
        JOIN opportunities o ON o.id = r.opportunity_id
       WHERE o.title = 'Ledger analyst'`,
    );
    expect(revisions.rows[0].n).toBe(2);
    const sources = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM opportunity_sources s
        JOIN opportunities o ON o.id = s.opportunity_id
       WHERE o.title = 'Ledger analyst'`,
    );
    expect(sources.rows[0].n).toBe(2);

    const clerk = await opportunities.search(p, { q: 'Night clerk' });
    expect(clerk.items[0]?.compensation).toMatchObject({ minimum: 28000, maximum: 32000 });
    const federal = await opportunities.search(p, { q: 'Records clerk' });
    expect(federal.items[0]?.label).toBe('expired');
    expect(federal.items[0]?.deadline).toBe('2020-01-01');
    const open = await opportunities.search(p, { status: 'open', q: 'clerk' });
    expect(open.items.map((item) => item.title)).toEqual(['Night clerk']);

    clock.set('2026-10-17T09:00:00Z');
    const again = await opportunities.ingest(null, parseAdzuna(fixture('adzuna.json')));
    expect(again.unchanged).toBe(1);
    expect(again.revised).toBe(1);
  });

  it('keeps a paste private and refuses a radius past the free plan', async () => {
    const owner = await person('opp-paste');
    const other = await person('opp-other');
    const created = await opportunities.paste(owner, {
      text: 'Night sorter\nSort letters. Pay was not on the note.',
      sourceUrl: 'https://example.test/note',
    });
    expect(created.organization).toBeNull();
    expect(created.compensation.minimum).toBeNull();
    expect(created.sponsorship).toBe('unknown');
    expect(created.description).toContain('Pay was not on the note');
    const again = await opportunities.paste(owner, { text: 'Night sorter\nSort letters. Pay was not on the note.' });
    expect(again.id).toBe(created.id);
    const hidden = await opportunities.get(other, created.id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    expect((await opportunities.search(other, { q: 'Night sorter' })).items).toEqual([]);

    const wide = await opportunities.search(owner, { radiusMiles: 200 }).catch((error: unknown) => error);
    expect(isBillingError(wide, 'validation_error')).toBe(true);
    if (isBillingError(wide)) expect(wide.details).toMatchObject({ field: 'radiusMiles', limit: 25 });
    const near = await opportunities.search(owner, { radiusMiles: 25, q: 'ledger' });
    expect(near.items).toHaveLength(1);
  });

  it('reads the fields a paste states and refuses a paste too short to be a listing', async () => {
    const owner = await person('opp-paste-fields');
    const created = await opportunities.paste(owner, {
      text: 'Records Analyst at Northwind Traders, Montreal\nSalary: $60,000 - $70,000 per year\nVisa sponsorship is not available.\nKeep the records accurate.',
    });
    expect(created.title).toBe('Records Analyst');
    expect(created.organization).toBe('Northwind Traders');
    expect(created.locations).toEqual(['Montreal']);
    expect(created.compensation).toEqual({ minimum: 60000, maximum: 70000, currency: 'USD', period: 'year' });
    expect(created.sponsorship).toBe('stated_no');

    const short = await opportunities.paste(owner, { text: 'abc' }).catch((error: unknown) => error);
    expect(isBillingError(short, 'validation_error')).toBe(true);
    if (isBillingError(short)) expect(short.details).toMatchObject({ field: 'text', reason: 'too_short', minimum: 40 });
  });

  it('does not call a live feed', async () => {
    const failed = await new UnconfiguredJobFeed().load('adzuna').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
  });
});
