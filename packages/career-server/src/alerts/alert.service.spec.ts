import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { AlertService, RecordingAlertNotifier } from './alert.service';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { OpportunityService } from '../opportunities/opportunity.service';
import type { NormalizedListing } from '../opportunities/normalize';
import { CareerProfileService } from '../profile/career-profile.service';
import { ResumeStudioService } from '../resumes/resume.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

const pay = { minimum: null, maximum: null, currency: null, period: null };

function listing(provider: NormalizedListing['provider'], sourceId: string, description: string): NormalizedListing {
  return {
    provider,
    sourceId,
    title: 'SQL analyst',
    organization: 'Babbage Works',
    description,
    locations: ['London'],
    sourceUrl: `https://example.test/${sourceId}`,
    deadline: null,
    compensation: pay,
    category: 'job',
    status: 'open',
  };
}

describe('AlertService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let opportunities: OpportunityService;
  let resumes: ResumeStudioService;
  let notifier: RecordingAlertNotifier;
  let alerts: AlertService;

  beforeAll(async () => {
    db = await createTestDatabase('alerts');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    const model = new FakeTextModel();
    profiles = new CareerProfileService(db.pool, model, clock);
    opportunities = new OpportunityService(db.pool, clock);
    resumes = new ResumeStudioService(db.pool, model, new MeteringService(db.pool, clock));
    notifier = new RecordingAlertNotifier();
    alerts = new AlertService(db.pool, new MeteringService(db.pool, clock), notifier, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  async function units(p: Principal): Promise<string[]> {
    const res = await db.pool.query<{ unit: string; state: string }>(
      `SELECT unit, state FROM usage_ledger WHERE billing_account_id = $1 ORDER BY created_at`,
      [p.billingAccountId],
    );
    return res.rows.map((row) => `${row.unit}:${row.state}`);
  }

  it('caps searches, locations, and companies, and keeps Free on the weekly email', async () => {
    const p = await person('alert-caps');
    const first = await alerts.createSearch(p, { q: 'SQL' });
    expect(first.schedule).toBe('weekly');
    const second = await alerts.createSearch(p, { q: 'COBOL' }).catch((error: unknown) => error);
    expect(isBillingError(second, 'capacity_exceeded')).toBe(true);
    if (isBillingError(second)) expect(second.details).toMatchObject({ field: 'savedSearches', limit: 1 });
    expect((await alerts.searches(p)).items).toHaveLength(1);

    const wide = await alerts.createLocation(p, { place: 'London', radiusMiles: 200 }).catch((error: unknown) => error);
    expect(isBillingError(wide, 'validation_error')).toBe(true);
    if (isBillingError(wide)) expect(wide.details).toMatchObject({ field: 'radiusMiles', reason: 'above_plan', limit: 25 });
    await alerts.createLocation(p, { place: 'London', radiusMiles: 25 });
    const extraPlace = await alerts.createLocation(p, { place: 'Paris', radiusMiles: 10 }).catch((error: unknown) => error);
    expect(isBillingError(extraPlace, 'capacity_exceeded')).toBe(true);
    if (isBillingError(extraPlace)) expect(extraPlace.details).toMatchObject({ field: 'locationProfiles', limit: 1 });

    await alerts.follow(p, { name: 'One' });
    await alerts.follow(p, { name: 'Two' });
    await alerts.follow(p, { name: 'Three' });
    const fourth = await alerts.follow(p, { name: 'Four' }).catch((error: unknown) => error);
    expect(isBillingError(fourth, 'capacity_exceeded')).toBe(true);
    if (isBillingError(fourth)) expect(fourth.details).toMatchObject({ field: 'followedCompanies', limit: 3 });

    const faster = await alerts.createSearch(p, { q: 'SQL', schedule: 'daily' }).catch((error: unknown) => error);
    expect(isBillingError(faster, 'validation_error')).toBe(true);
    if (isBillingError(faster)) expect(faster.details).toMatchObject({ field: 'schedule', reason: 'above_plan', limit: 'weekly' });

    const push = await alerts.updateSettings(p, { push: true }).catch((error: unknown) => error);
    expect(isBillingError(push, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(push)) expect(push.details).toMatchObject({ feature: 'alertDelivery', minimumPlan: 'professional' });
    const daily = await alerts.updateSettings(p, { digest: 'daily' }).catch((error: unknown) => error);
    expect(isBillingError(daily, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(daily)) expect(daily.details).toMatchObject({ minimumPlan: 'starter' });

    const saved = await alerts.updateSettings(p, { digest: 'weekly', quietStart: '22:00', quietEnd: '07:00' });
    expect(saved).toMatchObject({ digest: 'weekly', email: true, push: false, quietStart: '22:00', quietEnd: '07:00' });
    const equal = await alerts.updateSettings(p, { quietStart: '09:00', quietEnd: '09:00' }).catch((error: unknown) => error);
    expect(isBillingError(equal, 'validation_error')).toBe(true);
  });

  it('surfaces one alert per revision, holds the digest in quiet hours, and does not spend an analysis', async () => {
    const p = await person('alert-ada');
    const other = await person('alert-other');
    await profiles.createFact(p, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    await resumes.create(p, { title: 'Ada', language: 'en' });
    await alerts.createSearch(p, { q: 'SQL' });
    await db.pool.query(`UPDATE saved_searches SET paused = true WHERE candidate_auth_user_id <> $1`, [p.authUserId]);
    await alerts.updateSettings(p, { quietStart: '08:00', quietEnd: '12:00' });
    await opportunities.ingest(null, [listing('adzuna', 'adz-sql', 'SQL is required.')]);
    await opportunities.ingest(null, [listing('greenhouse', 'gh-sql', 'SQL is required.')]);

    const first = await alerts.runDue();
    expect(first.surfaced).toBe(1);
    expect(notifier.delivered).toHaveLength(0);
    expect(await alerts.sendDigests()).toEqual({ sent: 0, failed: 0 });
    expect(await units(p)).toEqual(['alert_item:committed']);

    clock.set('2026-10-16T13:00:00Z');
    await alerts.updateSettings(p, { quietStart: null, quietEnd: null });
    expect(await alerts.sendDigests()).toEqual({ sent: 1, failed: 0 });
    expect(notifier.delivered).toEqual([
      expect.objectContaining({ channel: 'email', title: 'digest:1', recipientAuthUserId: 'alert-ada' }),
    ]);
    expect(await units(p)).toEqual(['alert_item:committed']);

    clock.set('2026-10-24T13:00:00Z');
    expect(await alerts.runDue()).toMatchObject({ surfaced: 0 });
    const still = await alerts.alerts(p);
    expect(still.items).toHaveLength(1);
    expect(still.items[0]?.reason.code).toBe('saved_search');
    expect(JSON.stringify(still)).not.toContain('hiring');

    await opportunities.ingest(null, [listing('adzuna', 'adz-sql', 'SQL is required. A new line was added.')]);
    clock.set('2026-11-01T13:00:00Z');
    expect(await alerts.runDue()).toMatchObject({ surfaced: 1 });
    const updated = await alerts.alerts(p);
    expect(updated.items).toHaveLength(2);
    expect(updated.items.map((item) => item.reason.code).sort()).toEqual(['material_update', 'saved_search']);
    expect(await units(p)).toEqual(['alert_item:committed', 'alert_item:committed']);
    expect((await alerts.alerts(other)).items).toHaveLength(0);

    const matches = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM match_results WHERE candidate_auth_user_id = $1`,
      [p.authUserId],
    );
    expect(matches.rows[0]?.n).toBe(2);
    const analyses = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND unit = 'resume_analysis'`,
      [p.billingAccountId],
    );
    expect(analyses.rows[0]?.n).toBe(0);
  });

  it('pauses new alerts when the balance is gone and still returns a search', async () => {
    const p = await person('alert-empty');
    await alerts.createSearch(p, { q: 'Ledger' });
    await db.pool.query(
      `UPDATE usage_balances SET included_remaining = 0
        WHERE billing_account_id = $1 AND unit = 'alert_item'`,
      [p.billingAccountId],
    );
    await opportunities.ingest(null, [listing('lever', 'lv-ledger', 'Ledger analyst. SQL is not the title word here. Ledger is.')]);
    const run = await alerts.runDue();
    expect(run.paused).toBeGreaterThanOrEqual(1);
    expect((await alerts.alerts(p)).items).toHaveLength(0);
    expect(await units(p)).toEqual([]);
    const found = await opportunities.search(p, { q: 'Ledger' });
    expect(found.items.length).toBeGreaterThan(0);
  });

  it("one person's failure does not stop the run for everyone after them", async () => {
    await alerts.createSearch(await person('alert-broken'), { q: 'SQL' });
    await alerts.createSearch(await person('alert-fine'), { q: 'SQL' });
    type Surfacer = { surfacePerson: (p: { authUserId: string }) => Promise<unknown> };
    const real = (alerts as unknown as Surfacer).surfacePerson.bind(alerts);
    const seen: string[] = [];
    jest.spyOn(alerts as unknown as Surfacer, 'surfacePerson').mockImplementation(async (p) => {
      seen.push(p.authUserId);
      if (p.authUserId === 'alert-broken') throw new Error('simulated failure');
      return real(p);
    });
    const run = await alerts.runDue();
    expect(run.failed).toBe(1);
    expect(seen).toContain('alert-broken');
    expect(seen).toContain('alert-fine');
  });

  it('does not re-create alert settings for a person whose erasure has started', async () => {
    const p = await person('alert-erased');
    await db.pool.query(`DELETE FROM alert_settings WHERE candidate_auth_user_id = $1`, [p.authUserId]);
    await db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = $1`, [p.authUserId]);
    await (alerts as unknown as { touchMatched: (p: Principal) => Promise<void> }).touchMatched(p);
    const rows = await db.pool.query(`SELECT 1 FROM alert_settings WHERE candidate_auth_user_id = $1`, [p.authUserId]);
    expect(rows.rows).toHaveLength(0);
  });
});
