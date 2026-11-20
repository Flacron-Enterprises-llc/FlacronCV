import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { AlertService, ChannelAlertNotifier, RecordingAlertNotifier, createAlertNotifier, createRecordedEmailResolver } from './alert.service';
import { rememberErasureEmail } from '../privacy/erasure-email';
import { openBalances, readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { CareerModesService } from '../career-modes/career-modes.service';
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
    // Free is the Basic alert level: source details only, so no fit is computed.
    expect(matches.rows[0]?.n).toBe(0);
    expect(updated.items[0]?.reason).toMatchObject({ tier: 'basic', fit: null, searchLabel: 'SQL' });
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

  it('charges a Business-sponsored candidate’s scheduled alert to the Business pool, not their own Free account', async () => {
    const org = await person('alert-biz-owner');
    const cand = await person('alert-biz-cand');
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'business', status = 'active' WHERE id = $1`, [org.billingAccountId]);
    const orgAccount = await readAccount(db.pool, org.billingAccountId);
    await openBalances(db.pool, orgAccount, await new CatalogStore().get(db.pool, orgAccount.catalog_version), { regrant: true });
    const user = await db.pool.query<{ id: string }>(`SELECT id FROM users WHERE auth_user_id = $1`, [cand.authUserId]);
    await db.pool.query(
      `INSERT INTO business_candidates (workspace_id, email, consent, member_user_id, status, accepted_at)
       VALUES ($1, 'alert-biz-cand@example.test', true, $2, 'active', now())`,
      [org.workspaceId, user.rows[0]!.id],
    );
    await alerts.createSearch(cand, { q: 'Treasury' });
    await db.pool.query(`UPDATE saved_searches SET paused = true WHERE candidate_auth_user_id <> $1`, [cand.authUserId]);
    await opportunities.ingest(null, [listing('lever', 'lv-treasury', 'Treasury analyst role.')]);

    const run = await alerts.runDue();
    expect(run.surfaced).toBe(1);
    expect(await units(cand)).toEqual([]);
    expect(await units(org)).toEqual(['alert_item:committed']);
    // The alert itself stays the candidate's.
    const items = await db.pool.query(`SELECT workspace_id FROM alert_items WHERE recipient_auth_user_id = $1`, [cand.authUserId]);
    expect(items.rows).toEqual([{ workspace_id: cand.workspaceId }]);
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
  async function setPlan(principal: Principal, planId: 'starter' | 'professional' | 'career_pro') {
    await db.pool.query(`UPDATE billing_accounts SET plan_id = $1 WHERE id = $2`, [planId, principal.billingAccountId]);
    const acc = await readAccount(db.pool, principal.billingAccountId);
    const snapshot = await new CatalogStore().get(db.pool, acc.catalog_version);
    await openBalances(db.pool, acc, snapshot, { regrant: true });
  }

  /** Only this person's searches and companies take part in a run. */
  async function only(p: Principal) {
    await db.pool.query(`UPDATE saved_searches SET paused = true WHERE candidate_auth_user_id <> $1`, [p.authUserId]);
    await db.pool.query(`DELETE FROM followed_companies WHERE candidate_auth_user_id <> $1`, [p.authUserId]);
  }

  it('refuses filters above the alert level and keeps Free alerts to source details', async () => {
    const p = await person('alert-tier-free');
    const pay = await alerts.createSearch(p, { q: 'Tier', minPay: 50000 }).catch((error: unknown) => error);
    expect(isBillingError(pay, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(pay)) expect(pay.details).toMatchObject({ feature: 'alertIntelligence', minimumPlan: 'starter' });
    await setPlan(p, 'starter');
    const threshold = await alerts.createSearch(p, { q: 'Tier', relevance: 'strong_fit' }).catch((error: unknown) => error);
    expect(isBillingError(threshold, 'plan_upgrade_required')).toBe(true);
    if (isBillingError(threshold)) expect(threshold.details).toMatchObject({ minimumPlan: 'professional' });
    const search = await alerts.createSearch(p, { q: 'Tier', workSchedule: 'full_time', category: 'job' });
    expect(search.filters.workSchedule).toBe('full_time');
    expect(search.inactiveFilters).toEqual([]);
    // After a downgrade the stored filter is shown as not applied, never dropped silently.
    await db.pool.query(`UPDATE billing_accounts SET plan_id = 'free' WHERE id = $1`, [p.billingAccountId]);
    expect((await alerts.searches(p)).items[0]?.inactiveFilters).toEqual(['workSchedule']);
  });

  it('records which search triggered an alert, adds fit only from Enhanced, and applies the relevance threshold', async () => {
    clock.set('2026-10-16T09:00:00Z');
    const p = await person('alert-tier-pro');
    await setPlan(p, 'professional');
    await only(p);
    await profiles.createFact(p, { factType: 'skill', value: { name: 'Kotlin mobile' }, confirmation: 'confirmed' });
    const strong = await alerts.createSearch(p, { q: 'Kotlin', relevance: 'strong_fit' });
    await opportunities.ingest(null, [
      { ...listing('adzuna', 'adz-kotlin', 'Kotlin mobile Kotlin mobile.'), title: 'Kotlin mobile engineer', organization: 'Tier Co' },
    ]);
    // No resume yet: an unknown fit never passes a threshold.
    expect((await alerts.runDue()).surfaced).toBe(0);
    await resumes.create(p, { title: 'Pro', language: 'en' });
    clock.set('2026-10-16T16:00:00Z');
    expect((await alerts.runDue()).surfaced).toBe(1);
    clock.set('2026-10-16T09:00:00Z');
    const list = await alerts.alerts(p);
    expect(list.tier).toBe('enhanced');
    expect(list.items[0]?.title).toBe('Kotlin mobile engineer');
    expect(list.items[0]?.reason).toMatchObject({ code: 'saved_search', searchId: strong.id, searchLabel: 'Kotlin', tier: 'enhanced', label: 'strong_fit' });
    expect(list.items[0]?.basic).toMatchObject({ provider: 'adzuna', locations: ['London'], sourceUrl: 'https://example.test/adz-kotlin' });
    expect(list.unread).toBe(1);
    await alerts.markRead(p, list.items[0]!.id);
    expect((await alerts.alerts(p)).unread).toBe(0);
  });

  it('links an alert to the person’s own goal only from Career Pro (advanced); Professional gets no advanced context', async () => {
    clock.set('2026-10-17T09:00:00Z');
    const pro = await person('alert-adv-professional');
    const cp = await person('alert-adv-careerpro');
    await setPlan(pro, 'professional');
    await setPlan(cp, 'career_pro');
    await db.pool.query(`UPDATE saved_searches SET paused = true WHERE candidate_auth_user_id NOT IN ($1, $2)`, [pro.authUserId, cp.authUserId]);
    await db.pool.query(`DELETE FROM followed_companies WHERE candidate_auth_user_id NOT IN ($1, $2)`, [pro.authUserId, cp.authUserId]);
    for (const p of [pro, cp]) {
      await alerts.createSearch(p, { q: 'Staff platform engineer' });
      await db.pool.query(
        `INSERT INTO career_promotion_goals (workspace_id, candidate_auth_user_id, desired_title) VALUES ($1, $2, 'Staff platform engineer')`,
        [p.workspaceId, p.authUserId],
      );
    }
    await opportunities.ingest(null, [
      { ...listing('lever', 'lv-adv-1', 'Lead the platform.'), title: 'Staff platform engineer', organization: 'Goal Co' },
    ]);
    await alerts.runDue();

    const cpList = await alerts.alerts(cp);
    expect(cpList.tier).toBe('advanced');
    expect(cpList.items[0]?.reason).toMatchObject({ code: 'saved_search', tier: 'advanced' });
    expect(cpList.items[0]?.reason.advanced).toMatchObject({ promotionGoal: 'Staff platform engineer', learningPlanId: null, actionPackId: null });

    const proList = await alerts.alerts(pro);
    expect(proList.tier).toBe('enhanced');
    expect(proList.items[0]?.title).toBe('Staff platform engineer');
    expect(proList.items[0]?.reason.advanced ?? null).toBeNull();
  });

  it('matches a followed company by whole words and aliases with roles and places, not by substring', async () => {
    const p = await person('alert-company');
    await only(p);
    const meta = await alerts.follow(p, { name: 'Meta', aliases: ['Facebook'], roles: ['engineer'], locations: ['London'] });
    expect(meta).toMatchObject({ aliases: ['Facebook'], roles: ['engineer'], locations: ['London'] });
    await opportunities.ingest(null, [
      { ...listing('lever', 'lv-meta-1', 'Build things.'), title: 'Data engineer', organization: 'Metamorphic Ltd' },
      { ...listing('lever', 'lv-meta-2', 'Build things.'), title: 'Data engineer', organization: 'Facebook UK' },
      { ...listing('lever', 'lv-meta-3', 'Build things.'), title: 'Office manager', organization: 'Meta Platforms' },
      { ...listing('lever', 'lv-meta-4', 'Build things.'), title: 'Platform engineer', organization: 'Meta Platforms', locations: ['Paris'] },
    ]);
    await alerts.runDue();
    const items = (await alerts.alerts(p)).items;
    expect(items.map((item) => item.organization)).toEqual(['Facebook UK']);
    expect(items[0]?.reason).toMatchObject({ code: 'followed_company', companyId: meta.id, companyName: 'Meta', tier: 'basic', fit: null });
  });

  it('applies a saved search place by name when no coordinates exist, and by distance when both sides have them', async () => {
    const p = await person('alert-place');
    await setPlan(p, 'starter');
    await only(p);
    const leeds = await alerts.createLocation(p, { place: 'Leeds, UK', radiusMiles: 10 });
    expect(leeds.hasCoordinates).toBe(false);
    const search = await alerts.createSearch(p, { q: 'Welder', locationProfileId: leeds.id });
    expect(search.locationMode).toBe('name');
    await opportunities.ingest(null, [
      { ...listing('usajobs', 'us-weld-1', 'Weld.'), title: 'Welder', organization: 'Place Co', locations: ['Leeds'] },
      { ...listing('usajobs', 'us-weld-2', 'Weld.'), title: 'Welder', organization: 'Place Co', locations: ['York'] },
    ]);
    await alerts.runDue();
    expect((await alerts.alerts(p)).items.map((item) => item.basic.locations)).toEqual([['Leeds']]);

    const located = new AlertService(db.pool, new MeteringService(db.pool, clock), notifier, clock, {
      lookup: async (query: string) => ({ query, label: 'Bath, UK', latitude: 51.38, longitude: -2.36 }),
    });
    const bath = await located.updateLocation(p, leeds.id, { place: 'Bath' });
    // A later check time keeps these listings inside the run's most-recent window.
    clock.set('2026-10-17T09:00:00Z');
    expect(bath.hasCoordinates).toBe(true);
    await opportunities.ingest(null, [
      { ...listing('usajobs', 'us-weld-3', 'Weld.'), title: 'Welder', organization: 'Place Co', locations: ['Keynsham'], latitude: 51.41, longitude: -2.5 },
      { ...listing('usajobs', 'us-weld-4', 'Weld.'), title: 'Welder', organization: 'Place Co', locations: ['Bath, far office'], latitude: 53.8, longitude: -1.55 },
    ]);
    clock.set('2026-10-18T09:00:00Z');
    await located.runDue();
    const places = (await located.alerts(p)).items.map((item) => item.basic.locations[0]).sort();
    expect(places).toEqual(['Keynsham', 'Leeds']);
    clock.set('2026-10-16T09:00:00Z');
  });

  it('writes places through the career-modes single writer (same row, same defaults, same rules)', async () => {
    const p = await person('alert-single-writer');
    await setPlan(p, 'starter');
    const geocoder = { lookup: async (query: string) => ({ query, label: 'Leeds, UK', latitude: 53.8, longitude: -1.55 }) };
    const located = new AlertService(db.pool, new MeteringService(db.pool, clock), notifier, clock, geocoder);
    const leeds = await located.createLocation(p, { place: 'Leeds', radiusMiles: 10 });
    expect(leeds).toMatchObject({ place: 'Leeds', radiusMiles: 10, hasCoordinates: true, geocodedLabel: 'Leeds, UK' });

    // Relocation & modes sees the very same row, with the writer's "never assumed" defaults.
    const modes = new CareerModesService(db.pool);
    const listed = await modes.listLocations(p);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ id: leeds.id, kind: 'current', workAuthorization: 'not_stated', licenseTransfer: 'not_stated' });

    // The alerts error contract the released mobile app reads is kept.
    const wide = await located.updateLocation(p, leeds.id, { radiusMiles: 500 }).catch((error: unknown) => error);
    expect(isBillingError(wide, 'validation_error')).toBe(true);
    if (isBillingError(wide)) expect(wide.details).toMatchObject({ field: 'radiusMiles', reason: 'above_plan' });

    // A rename without a configured geocoder drops the old point instead of measuring from the wrong city.
    await modes.updateLocation(p, leeds.id, { place: 'York' });
    expect((await alerts.locations(p)).items[0]).toMatchObject({ place: 'York', hasCoordinates: false, geocodedLabel: null });

    await alerts.deleteLocation(p, leeds.id);
    expect((await modes.listLocations(p)).items).toHaveLength(0);
  });

  it('never marks a delivery sent without a provider, and sends the queued row once one is configured', async () => {
    const p = await person('alert-honest');
    await setPlan(p, 'professional');
    await only(p);
    const unconfigured = new AlertService(db.pool, new MeteringService(db.pool, clock), createAlertNotifier({}), clock);
    await unconfigured.updateSettings(p, { push: true, digest: 'immediate' });
    await unconfigured.createSearch(p, { q: 'Honesty' });
    await opportunities.ingest(null, [{ ...listing('greenhouse', 'gh-honest', 'Honesty matters.'), title: 'Honesty analyst' }]);
    await unconfigured.runDue();
    const view = await unconfigured.alerts(p);
    expect(view.channels).toEqual({ email: 'not_connected', push: 'not_connected', telegram: 'not_connected' });
    expect(view.items[0]?.deliveries).toEqual([
      { channel: 'email', status: 'pending', lastError: 'provider_unavailable' },
      { channel: 'push', status: 'pending', lastError: 'provider_unavailable' },
    ]);
    const attempts = await db.pool.query<{ attempts: number }>(
      `SELECT attempts FROM notification_deliveries WHERE alert_item_id = $1`,
      [view.items[0]!.id],
    );
    expect(attempts.rows.map((row) => row.attempts)).toEqual([0, 0]);

    const configured = new AlertService(db.pool, new MeteringService(db.pool, clock), new ChannelAlertNotifier({ push: { send: async () => undefined } }), clock);
    clock.set('2026-10-23T09:00:00Z');
    await configured.runDue();
    const after = (await configured.alerts(p)).items[0]?.deliveries;
    expect(after).toEqual([
      { channel: 'email', status: 'pending', lastError: 'provider_unavailable' },
      { channel: 'push', status: 'sent', lastError: null },
    ]);
    expect(await units(p)).toEqual(['alert_item:committed']);
    clock.set('2026-10-16T09:00:00Z');
  });

  it('emails the verified sign-in address once a live mailer is configured, and nobody being deleted', async () => {
    const p = await person('alert-email-to');
    const resolveEmail = createRecordedEmailResolver(db.pool);
    // rememberErasureEmail is best effort; record it the way sign-in does.
    await rememberErasureEmail(db.pool, p.authUserId, identity('alert-email-to'));
    expect(await resolveEmail(p.authUserId)).toBe('alert-email-to@example.test');
    expect(await resolveEmail('nobody-signed-in')).toBeNull();

    const sent: Array<{ to: string }> = [];
    const notifier = createAlertNotifier({}, { resolveEmail, mailer: { send: async (m) => (sent.push(m), { delivered: true }) } });
    expect(notifier.available('email')).toBe(true);
    await notifier.deliver({ channel: 'email', recipientAuthUserId: p.authUserId, alertItemId: 'item-1', messageId: 'msg-1', kind: 'alert', title: 'SQL analyst' });
    expect(sent.map((m) => m.to)).toEqual(['alert-email-to@example.test']);

    await db.pool.query(`UPDATE users SET deletion_requested_at = now() WHERE auth_user_id = $1`, [p.authUserId]);
    expect(await resolveEmail(p.authUserId)).toBeNull();
    await db.pool.query(`UPDATE users SET deletion_requested_at = NULL WHERE auth_user_id = $1`, [p.authUserId]);
  });

  it('keeps reminders apart from alert quota and shows them with history', async () => {
    const p = await person('alert-reminders');
    await only(p);
    const deadlineListing = await opportunities.paste(p, {
      text: 'Bursary officer at Fund House\nApplication deadline: 2026-10-20\nRun the bursary scheme carefully.',
    });
    await opportunities.save(p, deadlineListing.id);
    await profiles.createFact(p, { factType: 'certification', value: { name: 'First Aid', expiryDate: '2026-12-01' }, confirmation: 'confirmed' });
    await profiles.createFact(p, { factType: 'certification', value: { name: 'Old Licence', expiryDate: '2030-01-01' }, confirmation: 'confirmed' });
    const synced = await alerts.syncTrackerReminders(p, {
      items: [
        { kind: 'interview', sourceKey: 'job-1', title: 'Interview · Acme', dueDate: '2026-10-18', link: '/jobs' },
        { kind: 'application_follow_up', sourceKey: 'job-2', title: 'Follow up · Beta', dueDate: '2027-03-01' },
      ],
    });
    expect(synced.created).toBe(1);
    const bad = await alerts.syncTrackerReminders(p, { items: [{ kind: 'billing', sourceKey: 'x', title: 'x', dueDate: '2026-10-18' }] }).catch((error: unknown) => error);
    expect(isBillingError(bad, 'validation_error')).toBe(true);

    const list = await alerts.reminders(p);
    expect(list.upcoming.map((item) => [item.kind, item.title, item.dueDate])).toEqual([
      ['interview', 'Interview · Acme', '2026-10-18'],
      ['listing_deadline', 'Bursary officer', '2026-10-20'],
      ['certification_expiry', 'First Aid', '2026-12-01'],
    ]);
    expect(list.unread).toBe(3);
    await alerts.markReminderRead(p, list.upcoming[0]!.id);

    clock.set('2026-10-19T09:00:00Z');
    const later = await alerts.reminders(p);
    expect(later.history.map((item) => [item.title, item.read])).toEqual([['Interview · Acme', true]]);
    expect(later.upcoming).toHaveLength(2);
    // Reminders never reserve or spend anything.
    expect(await units(p)).toEqual([]);
    clock.set('2026-10-16T09:00:00Z');
  });
});
