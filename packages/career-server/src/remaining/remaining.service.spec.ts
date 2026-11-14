import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { MeteringService } from '../metering/metering.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { RemainingService } from './remaining.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-18T11:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('RemainingService', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let remaining: RemainingService;
  let clock: TestClock;

  beforeAll(async () => {
    db = await createTestDatabase('remaining');
    clock = new TestClock('2026-10-18T11:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES
         ('scenarioReports', true), ('applicationAnalytics', true), ('assistedForms', true),
         ('mapSessions', true), ('staffSeats', true), ('activeCandidates', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    remaining = new RemainingService(db.pool, new MeteringService(db.pool, clock), clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string, plan?: 'professional' | 'business' | 'starter'): Promise<Principal> {
    const principal = await identities.principal(identity(uid));
    if (plan) await db.pool.query(`UPDATE billing_accounts SET plan_id = $2 WHERE id = $1`, [principal.billingAccountId, plan]);
    return principal;
  }

  let listingCount = 0;
  async function application(owner: Principal, status: string): Promise<void> {
    listingCount += 1;
    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
       VALUES ('job', 'paste', $1, $2, 'unstated', 'open', $3) RETURNING id`,
      [`remain-${listingCount}`, `Role ${listingCount}`, owner.authUserId],
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, $2, 'unstated', 'desc', 'open') RETURNING id`,
      [opportunity.rows[0].id, `Role ${listingCount}`],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunity.rows[0].id, revision.rows[0].id]);
    await db.pool.query(
      `INSERT INTO applications (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, status, source_snapshot)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)`,
      [owner.workspaceId, owner.authUserId, opportunity.rows[0].id, revision.rows[0].id, status],
    );
  }

  it('compares three routes without inventing pay, and stops at the scenario allowance', async () => {
    const free = await person('scenario-free');
    const blocked = await remaining.createScenario(free, [{ name: 'Stay', costCents: 0, months: 1, destination: 'London', wageCents: null, source: 'user' }], 'free-scenario').catch((error: unknown) => error);
    expect(isBillingError(blocked, 'plan_upgrade_required')).toBe(true);

    const owner = await person('scenario-pro', 'professional');
    const created = await remaining.createScenario(owner, [
      { name: 'Stay', costCents: 0, months: 12, destination: 'London', wageCents: null, source: 'user' },
      { name: 'Bridge', costCents: 100, months: 6, destination: 'Berlin', wageCents: null, source: 'estimate' },
    ], 'scenario-1');
    const result = created.result as { tradeoff: string; options: Array<{ wageCents: number | null }> };
    expect(result.options.every((option) => option.wageCents === null)).toBe(true);
    expect(result.tradeoff).toContain('not a promise of earnings or employment');
    const again = await remaining.createScenario(owner, [{ name: 'Train', costCents: 0, months: 3, destination: 'Remote', wageCents: null, source: 'user' }], 'scenario-2').catch((error: unknown) => error);
    expect(isBillingError(again, 'quota_exhausted')).toBe(true);
  });

  it('reports 2 interviews from 10 recorded applications as 20 percent', async () => {
    const owner = await person('loop-pro', 'professional');
    for (let i = 0; i < 8; i += 1) await application(owner, 'applied');
    await application(owner, 'interviewing');
    await application(owner, 'offered');
    await application(owner, 'saved');
    const report = await remaining.learningLoop(owner);
    expect(report.statement).toBe('2 interviews from 10 recorded applications is a 20 percent observed interview rate in that sample, not a future hiring probability.');
    expect(report.unrecorded).toBe(1);
    expect(report.noResponse).toBe(8);
  });

  it('reviews a supported form without sending it', async () => {
    const owner = await person('form-pro', 'professional');
    const unsupported = await remaining.createForm(owner, 'other.test', 'form-bad').catch((error: unknown) => error);
    expect(isBillingError(unsupported, 'validation_error')).toBe(true);
    const created = await remaining.createForm(owner, 'example-jobs.test', 'form-1');
    const id = (created.result as { id: string }).id;
    const unreadied = await remaining.fillForm(owner, id).catch((error: unknown) => error);
    expect(isBillingError(unreadied, 'validation_error')).toBe(true);
    const reviewed = await remaining.reviewForm(owner, id, true);
    expect(reviewed.externalSubmitted).toBe(false);
    expect(reviewed.message).toBe('FlacronCV does not send this form.');
    const fill = await remaining.fillForm(owner, id);
    expect(fill).toMatchObject({
      site: 'example-jobs.test',
      submit: false,
      extension: 'unpacked_local',
      distribution: 'unpublished',
      fields: { full_name: '', email: '', phone: '', notes: '' },
    });
    expect(fill.message).toContain('unpacked');
    expect(fill.message).toContain('does not send the form');
    const ledger = await db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE billing_account_id = $1 AND unit = 'assisted_form' AND state = 'committed'`,
      [owner.billingAccountId],
    );
    expect(ledger.rows[0].quantity).toBe(1);
    await remaining.reviewForm(owner, id, true);
    const again = await db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE billing_account_id = $1 AND unit = 'assisted_form' AND state = 'committed'`,
      [owner.billingAccountId],
    );
    expect(again.rows[0].quantity).toBe(1);
  });

  it('keeps a promotion goal out of the fact profile and flags a due credential', async () => {
    const owner = await person('maintain');
    const before = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = $1`, [owner.authUserId]);
    await remaining.addPromotionGoal(owner, 'Staff engineer');
    const after = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM career_facts WHERE candidate_auth_user_id = $1`, [owner.authUserId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const credential = await remaining.addCredential(owner, 'First aid', '2026-11-01');
    expect(credential.due).toBe(true);
    const later = await remaining.addCredential(owner, 'License', '2027-05-01');
    expect(later.due).toBe(false);
  });

  it('edits and deletes maintenance items, refuses impossible dates, and feeds reminders', async () => {
    const owner = await person('maintain-crud');
    const other = await person('maintain-other');
    const impossible = await remaining.addCredential(owner, { name: 'Gas Safe', expiresOn: '2026-02-31' }).catch((error: unknown) => error);
    expect(isBillingError(impossible, 'validation_error')).toBe(true);
    const credential = await remaining.addCredential(owner, { name: 'Gas Safe', expiresOn: '2027-06-30', issuer: 'Register', region: 'UK', reviewOn: '2026-12-01' });
    expect(credential).toMatchObject({ issuer: 'Register', region: 'UK', due: true });
    const edited = await remaining.updateCredential(owner, credential.id, { reviewOn: null, expiresOn: '2028-01-01' });
    expect(edited).toMatchObject({ reviewOn: null, due: false });
    expect(isBillingError(await remaining.updateCredential(other, credential.id, { name: 'x' }).catch((e: unknown) => e), 'permission_denied')).toBe(true);

    const achievement = await remaining.addAchievement(owner, { title: 'Shipped billing', details: 'Led the rollout', achievedOn: '2026-10-01' });
    expect(achievement).toMatchObject({ title: 'Shipped billing', achievedOn: '2026-10-01', factId: null });
    const badLink = await remaining.updateAchievement(owner, achievement.id, { evidenceId: '00000000-0000-4000-8000-000000000001' }).catch((e: unknown) => e);
    expect(isBillingError(badLink, 'validation_error')).toBe(true);
    expect((await remaining.updateAchievement(owner, achievement.id, { title: 'Shipped billing v2' })).title).toBe('Shipped billing v2');
    await remaining.deleteAchievement(owner, achievement.id);

    const goal = await remaining.addPromotionGoal(owner, { desiredTitle: 'Lead', targetDate: '2027-01-31' });
    expect((await remaining.updatePromotionGoal(owner, goal.id, { status: 'dropped' })).status).toBe('dropped');
    await remaining.deletePromotionGoal(owner, goal.id);

    const view = await remaining.maintenance(owner);
    expect(view.achievements).toEqual([]);
    expect(view.promotionGoals).toEqual([]);
    expect(view.credentials.map((c) => c.name)).toEqual(['First aid', 'Gas Safe'].filter((name) => view.credentials.some((c) => c.name === name)));
    expect(await remaining.credentialReminders(owner)).toEqual(view.reminders);
    await remaining.deleteCredential(owner, credential.id);
  });

  it('confirms a promotion into the profile only when the person confirms it', async () => {
    const owner = await person('promote');
    const writes: Array<{ kind: string; value: Record<string, unknown> }> = [];
    const facts = {
      createFact: async (_owner: unknown, input: { value: Record<string, unknown> }) => {
        writes.push({ kind: 'create', value: input.value });
        const row = await db.pool.query<{ id: string }>(
          `INSERT INTO career_facts (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, uncertain, confirmed_at)
           VALUES ($1, $2, 'experience', $3, 'manual', 'confirmed', '{}', now()) RETURNING id`,
          [owner.workspaceId, owner.authUserId, JSON.stringify(input.value)],
        );
        return { id: row.rows[0].id };
      },
      updateFact: async () => {
        throw new Error('not used');
      },
    };
    const withFacts = new RemainingService(db.pool, new MeteringService(db.pool, clock), clock, undefined, undefined, undefined, facts);
    const goal = await withFacts.addPromotionGoal(owner, 'Engineering manager');
    expect(writes).toEqual([]);
    const unconfirmed = await withFacts.confirmPromotion(owner, goal.id, { confirmed: false, company: 'Acme' }).catch((e: unknown) => e);
    expect(isBillingError(unconfirmed, 'validation_error')).toBe(true);
    const done = await withFacts.confirmPromotion(owner, goal.id, { confirmed: true, company: 'Acme', startDate: '2026-11-01' });
    expect(done.status).toBe('confirmed');
    expect(done.confirmedFactId).not.toBeNull();
    expect(writes).toEqual([{ kind: 'create', value: { position: 'Engineering manager', company: 'Acme', current: true, startDate: '2026-11-01' } }]);
    const twice = await withFacts.confirmPromotion(owner, goal.id, { confirmed: true, company: 'Acme' }).catch((e: unknown) => e);
    expect(isBillingError(twice, 'validation_error')).toBe(true);
  });

  it('lists, reopens and edits saved scenarios without charging again', async () => {
    const owner = await person('scenario-list', 'professional');
    const created = await remaining.createScenario(owner, [
      { name: 'Stay', costCents: 0, months: 12, destination: 'Leeds', wageCents: 4000000, source: 'market', sourceName: 'ONS', sourceDate: '2026-04-01', uncertainty: 'medium' },
    ], 'scenario-list-1', { title: 'Stay or go' });
    const id = (created.result as { id: string }).id;
    const list = await remaining.listScenarios(owner);
    expect(list.items.map((item) => item.id)).toEqual([id]);
    expect(list.items[0]).toMatchObject({ title: 'Stay or go' });
    expect(list.items[0].options[0]).toMatchObject({ wageLabel: 'market_data', sourceName: 'ONS' });
    expect(list.remaining).toBe(0);
    const edited = await remaining.updateScenario(owner, id, {
      options: [{ name: 'Stay', costCents: 100, months: 6, destination: 'Leeds', wageCents: null, source: 'user' }],
    });
    expect(edited.options[0]).toMatchObject({ costCents: 100, wageLabel: 'unknown' });
    const ledger = await db.pool.query<{ n: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND unit = 'scenario_report' AND state = 'committed'`,
      [owner.billingAccountId],
    );
    expect(ledger.rows[0].n).toBe(1);
    const stranger = await person('scenario-stranger', 'professional');
    expect(isBillingError(await remaining.getScenario(stranger, id).catch((e: unknown) => e), 'permission_denied')).toBe(true);
    const badLink = await remaining.updateScenario(owner, id, { locationProfileIds: ['00000000-0000-4000-8000-000000000001'] }).catch((e: unknown) => e);
    expect(isBillingError(badLink, 'validation_error')).toBe(true);
  });

  it('does not charge a map session while no tile provider is configured', async () => {
    const owner = await person('map-pro', 'professional');
    const started = await remaining.startMap(owner, 'map-1').catch((error: unknown) => error);
    expect(isBillingError(started, 'provider_unavailable')).toBe(true);
    const ledger = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM usage_ledger WHERE billing_account_id = $1 AND unit = 'map_session'`, [owner.billingAccountId]);
    expect(ledger.rows[0].n).toBe(0);
    const listed = await remaining.mapList(owner);
    expect(listed.available).toBe(false);
    expect(listed.tiles).toBeNull();
    expect(listed.attribution).toBeNull();
    expect(listed.provider).toBeNull();
    expect(listed.items.every((item) => item.coordinates === null && item.approximate === true)).toBe(true);
  });

  it('does not sell human review or employer checkout', async () => {
    expect(remaining.humanServices().items[0].bookingOpen).toBe(false);
    const booked = (() => {
      try {
        remaining.bookHumanService();
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(isBillingError(booked, 'not_purchasable')).toBe(true);
  });

  it('shows only opted-in candidates and keeps a private profile out of search', async () => {
    const quiet = await person('quiet');
    const visible = await person('visible');
    const start = (await remaining.recruitingCount()).count;
    expect(await remaining.getOptIn(visible)).toEqual({ discoverable: false });
    await remaining.setOptIn(visible, true);
    expect(await remaining.getOptIn(visible)).toEqual({ discoverable: true });
    // Candidates learn only how many opted in, never who.
    const counted = await remaining.recruitingCount();
    expect(counted).toEqual({ count: start + 1 });
    expect(JSON.stringify(counted)).not.toContain(visible.authUserId);
    await remaining.setOptIn(quiet, false);
    await remaining.setOptIn(visible, false);
    expect((await remaining.recruitingCount()).count).toBe(start);
    const checkout = (() => {
      try {
        remaining.employerCheckout();
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(isBillingError(checkout, 'not_purchasable')).toBe(true);
  });

  it('refuses an API key until the package exists, then blocks another workspace', async () => {
    const owner = await person('api-biz', 'business');
    const other = await person('api-other', 'business');
    expect(await remaining.developerStatus(owner)).toMatchObject({ apiPackage: false, whiteLabel: false, brand: null, keys: [], rateLimits: { test: 30, live: 120 } });
    const blocked = await remaining.createApiKey(owner).catch((error: unknown) => error);
    expect(isBillingError(blocked, 'not_purchasable')).toBe(true);
    await db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining)
       VALUES ($1, $2, 'api_package', 1)`,
      [owner.billingAccountId, owner.workspaceId],
    );
    const key = await remaining.createApiKey(owner);
    expect(key.token.startsWith('flc_live_')).toBe(true);
    expect(key.environment).toBe('live');
    const stored = await db.pool.query<{ key_hash: string }>(`SELECT key_hash FROM api_keys WHERE id = $1`, [key.id]);
    expect(stored.rows[0].key_hash).not.toBe(key.token);
    expect((await remaining.consumeRead(owner, key.token, owner.workspaceId)).readsRemaining).toBe(0);
    const denied = await remaining.consumeRead(owner, key.token, other.workspaceId).catch((error: unknown) => error);
    expect(isBillingError(denied, 'permission_denied')).toBe(true);
    const empty = await remaining.consumeRead(owner, key.token, owner.workspaceId).catch((error: unknown) => error);
    expect(isBillingError(empty, 'quota_exhausted')).toBe(true);
    const brand = await remaining.setWhiteLabel(owner, 'North', 'Source: FlacronCV').catch((error: unknown) => error);
    expect(isBillingError(brand, 'not_purchasable')).toBe(true);
    await db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining)
       VALUES ($1, $2, 'white_label', null)`,
      [owner.billingAccountId, owner.workspaceId],
    );
    const stripped = await remaining.setWhiteLabel(owner, 'North', 'North only').catch((error: unknown) => error);
    expect(isBillingError(stripped, 'validation_error')).toBe(true);
    expect((await remaining.setWhiteLabel(owner, 'North', 'Source: FlacronCV')).attribution).toContain('FlacronCV');
    expect(await remaining.developerStatus(owner)).toMatchObject({
      apiPackage: true,
      whiteLabel: true,
      brand: { brandName: 'North', attribution: 'Source: FlacronCV' },
    });
  });

  it('keeps test keys off paid reads, rate limits each key, and honours revocation', async () => {
    const owner = await person('api-env', 'business');
    await db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining) VALUES ($1, $2, 'api_package', 500)`,
      [owner.billingAccountId, owner.workspaceId],
    );
    const test = await remaining.createApiKey(owner, 'test');
    expect(test.token.startsWith('flc_test_')).toBe(true);
    expect(test.prefix.startsWith('flc_test_')).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      expect(await remaining.consumeRead(owner, test.token, owner.workspaceId)).toEqual({ readsRemaining: 500, environment: 'test' });
    }
    const limited = await remaining.consumeRead(owner, test.token, owner.workspaceId).catch((error: unknown) => error);
    expect(isBillingError(limited, 'rate_limited')).toBe(true);
    clock.set(new Date(clock.now().getTime() + 61_000).toISOString());
    expect((await remaining.consumeRead(owner, test.token, owner.workspaceId)).environment).toBe('test');
    const live = await remaining.createApiKey(owner, 'live');
    expect((await remaining.consumeRead(owner, live.token, owner.workspaceId)).readsRemaining).toBe(499);
    await remaining.revokeApiKey(owner, live.id);
    const revoked = await remaining.consumeRead(owner, live.token, owner.workspaceId).catch((error: unknown) => error);
    expect(isBillingError(revoked, 'permission_denied')).toBe(true);
    const status = await remaining.developerStatus(owner);
    expect(status.keys.map((key) => [key.environment, key.revokedAt !== null])).toEqual([['live', true], ['test', false]]);
  });

  it('stores a sales inquiry without claiming email delivery', async () => {
    const invalid = await remaining
      .submitSalesInquiry({ name: 'A', email: 'bad', organization: 'X', message: 'short' })
      .catch((error: unknown) => error);
    expect(isBillingError(invalid, 'validation_error')).toBe(true);
    const saved = await remaining.submitSalesInquiry({
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      organization: 'School',
      message: 'We need SSO for a workforce program.',
    });
    expect(saved.delivered).toBe(false);
    const row = await db.pool.query<{ delivered: boolean }>(`SELECT delivered FROM sales_inquiries WHERE id = $1`, [saved.id]);
    expect(row.rows[0].delivered).toBe(false);
  });
});
