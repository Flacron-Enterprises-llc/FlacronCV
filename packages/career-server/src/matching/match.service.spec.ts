import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { MatchService } from './match.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('MatchService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let opportunities: OpportunityService;
  let resumes: ResumeStudioService;
  let matches: MatchService;

  beforeAll(async () => {
    db = await createTestDatabase('matches');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    const model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    opportunities = new OpportunityService(db.pool, clock);
    resumes = new ResumeStudioService(db.pool, model, new MeteringService(db.pool, clock));
    matches = new MatchService(db.pool, new MeteringService(db.pool, clock), clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  async function states(p: Principal): Promise<string[]> {
    const res = await db.pool.query<{ state: string }>(
      `SELECT state FROM usage_ledger WHERE billing_account_id = $1 AND unit = 'resume_analysis' ORDER BY created_at`,
      [p.billingAccountId],
    );
    return res.rows.map((row) => row.state);
  }

  it('spends one analysis and reopens the same versions for free', async () => {
    const p = await person('match-ada');
    const other = await person('match-other');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    await profiles.createFact(p, { factType: 'skill', value: { name: 'COBOL' }, confirmation: 'draft' });
    const resume = await resumes.create(p, { title: 'Ada', language: 'en' });
    const listing = await opportunities.paste(p, { text: 'Ledger analyst\nSQL is required. COBOL is mentioned. Pay was not written.' });
    const refused = await matches
      .compare(p, { resumeVersionId: resume.version.id, opportunityId: listing.id, mode: 'later' }, 'bad-mode', true)
      .catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    expect(await states(p)).toEqual([]);

    const created = await matches.compare(
      p,
      { resumeVersionId: resume.version.id, opportunityId: listing.id, mode: 'explicit' },
      'match-1',
      true,
    );
    expect(created.replayed).toBe(false);
    expect(created.match.reasons).toContainEqual({ code: 'confirmed_overlap', factId: expect.any(String), token: 'sql' });
    expect(created.match.unknowns).toContainEqual({ code: 'unconfirmed', factId: expect.any(String), token: 'cobol' });
    expect(created.match.unknowns).toContainEqual({ code: 'pay' });
    expect(created.match.gaps.some((gap) => gap.token === 'cobol' || gap.token === 'sql')).toBe(false);
    expect(JSON.stringify(created.match)).not.toContain('hiring');
    expect(Object.keys(created.match)).not.toContain('score');
    expect(created.usage).toMatchObject({ unit: 'resume_analysis', includedRemaining: 2, ledgerState: 'committed' });
    expect(await states(p)).toEqual(['committed']);

    const again = await matches.compare(
      p,
      { resumeVersionId: resume.version.id, opportunityId: listing.id, mode: 'explicit' },
      'match-2',
      true,
    );
    expect(again.replayed).toBe(true);
    expect(again.match.id).toBe(created.match.id);
    expect(await states(p)).toEqual(['committed']);
    const hidden = await matches.get(other, created.match.id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    expect((await matches.find(p, { opportunityId: listing.id, resumeVersionId: resume.version.id })).match?.id).toBe(created.match.id);
  });
it('separates qualification fit from preferences, names a missing credential and a remote limit, and labels the result', async () => {
    const p = await person('match-prefs');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL dashboards reporting' }, confirmation: 'confirmed' });
    await profiles.setPreferences(p, {
      locations: ['Seattle'],
      arrangements: ['remote'],
      schedules: ['full_time'],
      seniority: 'senior',
      minimumPay: { amount: 90000, currency: 'USD', period: 'year' },
    });
    const resume = await resumes.create(p, { title: 'Prefs', language: 'en' });
    const listing = await opportunities.paste(p, {
      text: 'Junior Reporting Analyst at Pine Labs\nFully remote, Washington residents only.\nFull-time.\nSalary: $70,000 - $80,000 per year\nPMP certification required.\nBuild SQL dashboards and reporting.',
    });
    const made = await matches.compare(p, { resumeVersionId: resume.version.id, opportunityId: listing.id, mode: 'explicit' }, 'match-prefs-1', true);
    const byDimension = Object.fromEntries(made.match.preferenceFit.map((check) => [check.dimension, check.status]));
    expect(byDimension).toMatchObject({
      location: 'meets',
      arrangement: 'meets',
      schedule: 'meets',
      seniority: 'conflict',
      pay: 'conflict',
      remote_restriction: 'check',
    });
    expect(made.match.preferenceFit.find((check) => check.dimension === 'remote_restriction')?.detail).toContain('Washington residents only');
    expect(made.match.gaps[0]).toEqual({ code: 'credential_missing', token: 'PMP' });
    expect(made.match.label).toBe('stretch');
    expect(made.match.labelReasons).toEqual(expect.arrayContaining(['credential_missing', 'preference_conflict']));
    // Reopening reads the same label and preference fit from storage.
    const reopened = await matches.get(p, made.match.id);
    expect(reopened.label).toBe('stretch');
    expect(reopened.preferenceFit).toEqual(made.match.preferenceFit);

    const other = await person('match-prefs-other');
    const otherResume = await resumes.create(other, { title: 'Other', language: 'en' });
    const hidden = await matches
      .compare(other, { resumeVersionId: otherResume.version.id, opportunityId: listing.id, mode: 'explicit' }, 'match-prefs-2', true)
      .catch((error: unknown) => error);
    expect(isBillingError(hidden, 'not_found')).toBe(true);
  });
});
