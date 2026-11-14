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
import type { NormalizedListing } from './normalize';
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
    // Another person's paste looks exactly like a missing listing.
    expect(isBillingError(hidden, 'not_found')).toBe(true);
    const loaded = await opportunities.readForCandidate(other, created.id).catch((error: unknown) => error);
    expect(isBillingError(loaded, 'not_found')).toBe(true);
    expect((await opportunities.readForCandidate(owner, created.id)).title).toBe('Night sorter');
    expect((await opportunities.search(other, { q: 'Night sorter' })).items).toEqual([]);

    const wide = await opportunities.search(owner, { radiusMiles: 200 }).catch((error: unknown) => error);
    expect(isBillingError(wide, 'validation_error')).toBe(true);
    if (isBillingError(wide)) expect(wide.details).toMatchObject({ field: 'radiusMiles', limit: 25 });
    const near = await opportunities.search(owner, { radiusMiles: 25, q: 'ledger' });
    expect(near.items).toHaveLength(1);
    // A radius without a place cannot be applied, and the response says so.
    expect(near.notApplied).toEqual([{ filter: 'radiusMiles', reason: 'no_place' }]);
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

  it('keeps the same title in two cities apart and records a sponsorship change as a material revision', async () => {
    const base: NormalizedListing = {
      provider: 'greenhouse',
      sourceId: 'gh-city-1',
      title: 'Payroll clerk',
      organization: 'Quay Mills',
      description: 'Run the payroll.',
      locations: ['Leeds'],
      sourceUrl: 'https://example.test/gh-city-1',
      deadline: null,
      compensation: { minimum: null, maximum: null, currency: null, period: null },
      category: 'job',
      status: 'open',
    };
    const first = await opportunities.ingest(null, [base, { ...base, sourceId: 'gh-city-2', locations: ['York'] }]);
    expect(first.inserted).toBe(2);
    // The same vacancy from another feed, with the region spelled out, is one listing.
    const other = await opportunities.ingest(null, [{ ...base, provider: 'lever', sourceId: 'lv-city-1', locations: ['Leeds, West Yorkshire'] }]);
    expect(other.deduped).toBe(1);
    const before = await opportunities.ingest(null, [{ ...base, locations: ['Leeds, West Yorkshire'] }]);
    expect(before.unchanged + before.revised).toBe(1);
    const changed = await opportunities.ingest(null, [{ ...base, locations: ['Leeds, West Yorkshire'], sponsorship: 'stated_no' }]);
    expect(changed.revised).toBe(1);
  });

  it('reads deadline, category, remote limit and category fields from a paste and lets the person override them', async () => {
    const owner = await person('opp-paste-model');
    const created = await opportunities.paste(owner, {
      text: 'Summer Internship at Northwind Traders\nFully remote. US residents only.\nStipend: $2,000 per month\nApplication deadline: 15 December 2026\nPosted: 2026-10-01\nLearn the finance stack.',
    });
    expect(created.category).toBe('internship');
    expect(created.deadline).toBe('2026-12-15');
    expect(created.publishedAt).toBe('2026-10-01');
    expect(created.remoteRestriction).toBe('US residents only');
    expect(created.arrangement).toBe('remote');
    expect(created.details.stipend).toBe('$2,000 per month');
    expect(created.stale).toBe(false);

    const scholarship = await opportunities.paste(owner, {
      text: 'Data Futures Award\nFunding: Full tuition for one year\nEligibility: Residents of Quebec studying statistics\nApply before the end of term.',
      category: 'scholarship',
      deadline: '2026-11-30',
    });
    expect(scholarship.category).toBe('scholarship');
    expect(scholarship.deadline).toBe('2026-11-30');
    expect(scholarship.details).toMatchObject({ funding: 'Full tuition for one year', eligibility: 'Residents of Quebec studying statistics' });

    const bad = await opportunities.paste(owner, { text: 'Data Futures Award\nFunding: Full tuition for one year and more text', category: 'lottery' }).catch((error: unknown) => error);
    expect(isBillingError(bad, 'validation_error')).toBe(true);
  });

  it('filters stored listings and tells the person which filter it could not apply', async () => {
    const owner = await person('opp-filters');
    const pay = { minimum: 50000, maximum: 60000, currency: 'GBP', period: 'year' };
    const listing = (sourceId: string, extra: Partial<NormalizedListing>): NormalizedListing => ({
      provider: 'adzuna',
      sourceId,
      title: `Filter role ${sourceId}`,
      organization: 'Filterworks',
      description: 'Filter test listing.',
      locations: ['Bristol'],
      sourceUrl: `https://example.test/${sourceId}`,
      deadline: null,
      compensation: { minimum: null, maximum: null, currency: null, period: null },
      category: 'job',
      status: 'open',
      ...extra,
    });
    await opportunities.ingest(null, [
      listing('f-paid', { compensation: pay, schedule: 'full_time', seniority: 'senior', publishedAt: '2026-10-10' }),
      listing('f-remote', { arrangement: 'remote', remoteRestriction: 'UK residents only', locations: ['Remote'], organization: 'Metamorphic Ltd' }),
      listing('f-intern', { category: 'internship', deadline: '2026-10-20', organization: 'Meta Platforms' }),
    ]);
    const titles = async (query: Parameters<OpportunityService['search']>[1]) =>
      (await opportunities.search(owner, { q: 'Filter role', ...query })).items.map((item) => item.title).sort();

    expect(await titles({ minPay: 55000, payCurrency: 'GBP' })).toEqual(['Filter role f-paid']);
    expect(await titles({ payStated: true })).toEqual(['Filter role f-paid']);
    expect(await titles({ category: 'full_time' })).toEqual(['Filter role f-paid']);
    expect(await titles({ category: 'remote' })).toEqual(['Filter role f-remote']);
    expect(await titles({ category: 'internship' })).toEqual(['Filter role f-intern']);
    expect(await titles({ seniority: 'senior' })).toEqual(['Filter role f-paid']);
    expect(await titles({ remote: 'restricted' })).toEqual(['Filter role f-remote']);
    expect(await titles({ postedWithinDays: 10 })).toEqual(['Filter role f-paid']);
    expect(await titles({ deadlineBefore: '2026-10-31' })).toEqual(['Filter role f-intern']);
    expect(await titles({ place: 'Bristol, UK' })).toEqual(['Filter role f-intern', 'Filter role f-paid']);
    expect(await titles({ provider: 'usajobs' })).toEqual([]);

    const followedNone = await opportunities.search(owner, { q: 'Filter role', followedOnly: true });
    expect(followedNone.notApplied).toEqual([{ filter: 'followedOnly', reason: 'no_followed_companies' }]);
    await db.pool.query(
      `INSERT INTO followed_companies (workspace_id, candidate_auth_user_id, name) VALUES ($1, $2, 'Meta')`,
      [owner.workspaceId, owner.authUserId],
    );
    // "Meta" matches Meta Platforms as a whole word and never Metamorphic.
    expect(await titles({ followedOnly: true })).toEqual(['Filter role f-intern']);

    const radius = await opportunities.search(owner, { q: 'Filter role', place: 'Bristol', radiusMiles: 20 });
    expect(radius.notApplied).toEqual([{ filter: 'radiusMiles', reason: 'geocoding_unavailable' }]);
    expect(radius.items.map((item) => item.title).sort()).toEqual(['Filter role f-intern', 'Filter role f-paid']);

    const located = new OpportunityService(db.pool, clock, undefined, {
      lookup: async (query: string) => ({ query, label: 'Bath', latitude: 51.38, longitude: -2.36 }),
    });
    await opportunities.ingest(null, [listing('f-coords', { locations: ['Keynsham'], latitude: 51.41, longitude: -2.5 })]);
    const nearBath = await located.search(owner, { q: 'Filter role', place: 'Bath', radiusMiles: 20 });
    expect(nearBath.notApplied).toEqual([]);
    expect(nearBath.items.map((item) => item.title)).toEqual(['Filter role f-coords']);

    clock.set('2026-10-25T09:00:00Z');
    expect(await titles({ includeExpired: false, category: 'internship' })).toEqual([]);
    clock.set('2026-10-17T09:00:00Z');
  });

  it('saves a visible listing once and refuses another person paste', async () => {
    const owner = await person('opp-saver');
    const other = await person('opp-saver-other');
    const listed = await opportunities.search(owner, { q: 'ledger' });
    const id = listed.items[0]!.id;
    await opportunities.save(owner, id);
    await opportunities.save(owner, id);
    expect((await opportunities.saved(owner)).items.map((item) => item.id)).toEqual([id]);
    expect((await opportunities.get(owner, id)).saved).toBe(true);
    const paste = await opportunities.paste(other, { text: 'Private role at Hidden Co\nOnly the person who pasted this may see it at all.' });
    const refused = await opportunities.save(owner, paste.id).catch((error: unknown) => error);
    expect(isBillingError(refused, 'not_found')).toBe(true);
    await opportunities.unsave(owner, id);
    expect((await opportunities.saved(owner)).items).toEqual([]);
  });

  it('does not call a live feed', async () => {
    const failed = await new UnconfiguredJobFeed().load('adzuna').catch((error: unknown) => error);
    expect(isBillingError(failed, 'provider_unavailable')).toBe(true);
  });
});
