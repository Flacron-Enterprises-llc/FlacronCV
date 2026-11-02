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

  beforeAll(async () => {
    db = await createTestDatabase('remaining');
    const clock = new TestClock('2026-10-18T11:00:00Z');
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

  it('opens a 15 minute map session without tiles', async () => {
    const owner = await person('map-pro', 'professional');
    const started = await remaining.startMap(owner, 'map-1');
    expect(started.result).toMatchObject({ minutes: 15, approximate: true, tiles: null, coordinates: null, attribution: null, provider: null });
    expect(started.usage.includedRemaining).toBe(49);
    const listed = await remaining.mapList(owner);
    expect(listed.tiles).toBeNull();
    expect(listed.attribution).toBeNull();
    expect(listed.provider).toBeNull();
    expect(listed.items.every((item) => item.coordinates === null && item.approximate === true)).toBe(true);
  });

  it('stops at three staff and hides a candidate from another workspace and an unassigned counselor', async () => {
    const owner = await person('biz', 'business');
    const outsider = await person('biz-out', 'business');
    await remaining.addStaff(owner, 'staff-1', 'counselor');
    await remaining.addStaff(owner, 'staff-2', 'manager');
    await remaining.addStaff(owner, 'staff-3', 'counselor');
    const fourth = await remaining.addStaff(owner, 'staff-4', 'counselor').catch((error: unknown) => error);
    expect(isBillingError(fourth, 'capacity_exceeded')).toBe(true);

    const accessOwner = await person('biz-access', 'business');
    const counselor = await person('biz-counselor');
    const candidate = await remaining.inviteCandidate(accessOwner, 'person@example.test', true);
    const refused = await remaining.inviteCandidate(accessOwner, 'no@example.test', false).catch((error: unknown) => error);
    expect(isBillingError(refused, 'validation_error')).toBe(true);
    const hidden = await remaining.getCandidate(outsider, candidate.id).catch((error: unknown) => error);
    expect(isBillingError(hidden, 'permission_denied')).toBe(true);
    const staff = await remaining.addStaff(accessOwner, counselor.authUserId, 'counselor');
    const unassigned = await remaining.getCandidate(counselor, candidate.id).catch((error: unknown) => error);
    expect(isBillingError(unassigned, 'permission_denied')).toBe(true);
    await remaining.assignCounselor(accessOwner, staff.id, candidate.id);
    expect((await remaining.getCandidate(counselor, candidate.id)).email).toBe('person@example.test');
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
    expect((await remaining.recruitingSearch()).items).toEqual([]);
    await remaining.setOptIn(visible, true);
    expect((await remaining.recruitingSearch()).items).toEqual([{ candidateAuthUserId: visible.authUserId, label: 'Opted-in candidate' }]);
    await remaining.setOptIn(quiet, false);
    await remaining.setOptIn(visible, false);
    expect((await remaining.recruitingSearch()).items).toEqual([]);
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
    const blocked = await remaining.createApiKey(owner).catch((error: unknown) => error);
    expect(isBillingError(blocked, 'not_purchasable')).toBe(true);
    await db.pool.query(
      `INSERT INTO organization_entitlements (billing_account_id, workspace_id, addon_id, reads_remaining)
       VALUES ($1, $2, 'api_package', 1)`,
      [owner.billingAccountId, owner.workspaceId],
    );
    const key = await remaining.createApiKey(owner);
    expect(key.token.startsWith('flc_')).toBe(true);
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
