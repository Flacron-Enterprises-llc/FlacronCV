import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { RecordingMailer } from '../mail/mailer';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { BusinessService } from './business.service';

function identity(uid: string, verified = true): VerifiedIdentity {
  const at = new Date('2026-11-14T10:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: verified, authTime: at, issuedAt: at, signInProvider: 'password' };
}

function tokenOf(path: string): string {
  return decodeURIComponent(path.split('token=')[1]);
}

async function refused(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.catch((e: unknown) => e);
  expect(isBillingError(error, code as never)).toBe(true);
}

describe('BusinessService (CV23)', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let clock: TestClock;
  let mailer: RecordingMailer;
  let business: BusinessService;

  beforeAll(async () => {
    db = await createTestDatabase('business');
    clock = new TestClock('2026-11-14T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('staffSeats', true), ('activeCandidates', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    mailer = new RecordingMailer();
    business = new BusinessService(db.pool, clock, mailer, 'https://app.example.test');
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string, plan?: 'business' | 'professional', verified = true): Promise<Principal> {
    const principal = await identities.principal(identity(uid, verified));
    if (plan) await db.pool.query(`UPDATE billing_accounts SET plan_id = $2 WHERE id = $1`, [principal.billingAccountId, plan]);
    return principal;
  }

  it('is only for the Business plan', async () => {
    const pro = await person('biz-pro', 'professional');
    await refused(business.overview(pro), 'plan_upgrade_required');
    await refused(business.inviteStaff(pro, undefined, 'x@example.test', 'counselor'), 'plan_upgrade_required');
  });

  it('invites staff by email with an expiring, revocable token that only the invited address can accept', async () => {
    const owner = await person('biz-owner', 'business');
    const counselor = await person('biz-counselor');
    const stranger = await person('biz-stranger');
    const invite = await business.inviteStaff(owner, undefined, 'BIZ-COUNSELOR@example.test', 'counselor');
    expect(invite.invitePath).toMatch(/^\/career\/business\/join\?token=bst_/);
    // The recording mailer is the "not configured" path: nothing is reported as sent.
    expect(invite.delivered).toBe(false);
    expect(mailer.sent[mailer.sent.length - 1]?.text).toContain('https://app.example.test/career/business/join?token=');
    const stored = await db.pool.query<{ invite_token_hash: string }>(`SELECT invite_token_hash FROM business_staff WHERE id = $1`, [invite.id]);
    expect(stored.rows[0].invite_token_hash).not.toContain(tokenOf(invite.invitePath));

    await refused(business.acceptInvitation(stranger, tokenOf(invite.invitePath)), 'permission_denied');
    const unverified = await person('biz-unverified', undefined, false);
    await refused(business.acceptInvitation(unverified, tokenOf(invite.invitePath)), 'permission_denied');
    await expect(business.acceptInvitation(counselor, tokenOf(invite.invitePath))).resolves.toEqual({ kind: 'staff', workspaceId: owner.workspaceId });
    await refused(business.acceptInvitation(counselor, tokenOf(invite.invitePath)), 'not_found');

    const memberships = await business.memberships(counselor);
    expect(memberships.staffOf).toEqual([{ workspaceId: owner.workspaceId, role: 'counselor' }]);

    // Revoked and expired invitations stop working.
    const revokedInvite = await business.inviteStaff(owner, undefined, 'biz-stranger@example.test', 'manager');
    await business.removeStaff(owner, undefined, revokedInvite.id);
    await refused(business.acceptInvitation(stranger, tokenOf(revokedInvite.invitePath)), 'not_found');
    const late = await business.inviteStaff(owner, undefined, 'biz-stranger@example.test', 'manager');
    clock.set('2026-11-29T10:00:00Z');
    await refused(business.acceptInvitation(stranger, tokenOf(late.invitePath)), 'not_found');
    clock.set('2026-11-14T10:00:00Z');
  });

  it('counts accepted and pending staff against the three seats', async () => {
    const owner = await person('biz-seats', 'business');
    for (const name of ['a', 'b', 'c']) await business.inviteStaff(owner, undefined, `${name}@example.test`, 'counselor');
    await refused(business.inviteStaff(owner, undefined, 'd@example.test', 'counselor'), 'capacity_exceeded');
  });

  it('raises seat and candidate caps through add-ons, and checks the cap when reactivating', async () => {
    const owner = await person('biz-addons', 'business');
    await db.pool.query(`UPDATE billing_accounts SET capacity_extras = '{"staffSeats": 1}'::jsonb WHERE id = $1`, [owner.billingAccountId]);
    for (const name of ['w', 'x', 'y', 'z']) await business.inviteStaff(owner, undefined, `${name}@example.test`, 'counselor');
    await refused(business.inviteStaff(owner, undefined, 'v@example.test', 'counselor'), 'capacity_exceeded');
    expect((await business.overview(owner)).capacity.staffSeats).toBe(4);

    // Fill the candidate cap, archive one, fill the freed slot: reactivating must then be refused.
    const limit = (await business.overview(owner)).capacity.activeCandidates ?? 0;
    const user = await person('biz-addons-cand');
    const first = await business.inviteCandidate(owner, undefined, 'biz-addons-cand@example.test', true);
    await business.acceptInvitation(user, tokenOf(first.invitePath));
    for (let i = 1; i < limit; i += 1) await business.inviteCandidate(owner, undefined, `c${i}@example.test`, true);
    await business.setCandidateArchived(owner, undefined, first.id, true);
    await business.inviteCandidate(owner, undefined, 'late@example.test', true);
    await refused(business.setCandidateArchived(owner, undefined, first.id, false), 'capacity_exceeded');
    await db.pool.query(`UPDATE billing_accounts SET capacity_extras = '{"staffSeats": 1, "activeCandidates": 25}'::jsonb WHERE id = $1`, [owner.billingAccountId]);
    expect((await business.setCandidateArchived(owner, undefined, first.id, false)).status).toBe('active');
  });

  it('limits a counselor to assigned candidates, a billing admin to billing, and revokes removed staff at once', async () => {
    const owner = await person('biz-roles', 'business');
    const counselor = await person('biz-roles-c');
    const billing = await person('biz-roles-b');
    const outsider = await person('biz-roles-out', 'business');
    const c = await business.inviteStaff(owner, undefined, 'biz-roles-c@example.test', 'counselor');
    const b = await business.inviteStaff(owner, undefined, 'biz-roles-b@example.test', 'billing_admin');
    await business.acceptInvitation(counselor, tokenOf(c.invitePath));
    await business.acceptInvitation(billing, tokenOf(b.invitePath));

    const candidateUser = await person('biz-roles-cand');
    const invited = await business.inviteCandidate(owner, undefined, 'biz-roles-cand@example.test', true);
    await refused(business.inviteCandidate(owner, undefined, 'no@example.test', false), 'validation_error');
    expect(invited.invitePath).toContain('token=bca_');
    await business.acceptInvitation(candidateUser, tokenOf(invited.invitePath));

    const ws = owner.workspaceId;
    expect((await business.overview(counselor, ws)).candidates).toEqual([]);
    await refused(business.candidate(counselor, ws, invited.id), 'permission_denied');
    await business.assignCounselor(owner, undefined, c.id, invited.id);
    expect((await business.overview(counselor, ws)).candidates.map((x) => x.id)).toEqual([invited.id]);
    const detail = await business.candidate(counselor, ws, invited.id);
    expect(detail).toMatchObject({ email: 'biz-roles-cand@example.test', status: 'active', shared: null });

    // Shared material appears only after the candidate allows it.
    await business.setShareProfile(candidateUser, invited.id, true);
    expect((await business.candidate(counselor, ws, invited.id)).shared).toEqual({ evidence: [], confirmedFacts: 0 });

    // Counselors cannot manage the workspace; billing admins see no candidates.
    await refused(business.inviteCandidate(counselor, ws, 'x@example.test', true), 'permission_denied');
    await refused(business.candidate(billing, ws, invited.id), 'permission_denied');
    const usage = await business.usage(billing, ws);
    expect(usage.invoices).toEqual([]);
    await refused(business.report(billing, ws), 'permission_denied');
    expect((await business.usage(owner)).units.length).toBeGreaterThan(0);

    // Another workspace is out of reach.
    await refused(business.overview(outsider, ws), 'permission_denied');
    await refused(business.candidate(owner, undefined, (await business.inviteCandidate(outsider, undefined, 'p@example.test', true)).id), 'permission_denied');

    // Removal takes effect on the next request.
    await business.removeStaff(owner, undefined, c.id);
    await refused(business.overview(counselor, ws), 'permission_denied');

    const report = await business.report(owner);
    expect(report).toMatchObject({ candidates: { active: 1 }, staff: { billing_admin: 1, counselor: 0 }, sharingCandidates: 1 });
  });

  it('keeps archived candidates from new services until reactivated', async () => {
    const owner = await person('biz-archive', 'business');
    const user = await person('biz-archive-cand');
    const invited = await business.inviteCandidate(owner, undefined, 'biz-archive-cand@example.test', true);
    await business.acceptInvitation(user, tokenOf(invited.invitePath));
    await business.addQueueItem(owner, undefined, { title: 'Shared role', url: 'https://jobs.example.test/1' });
    await refused(business.addQueueItem(owner, undefined, { title: 'Bad', url: 'javascript:alert(1)' }), 'validation_error');
    expect((await business.addQueueItem(owner, undefined, { title: 'For you', candidateId: invited.id })).status).toBe('recommended');

    const archived = await business.setCandidateArchived(owner, undefined, invited.id, true);
    expect(archived.status).toBe('archived');
    await refused(business.addQueueItem(owner, undefined, { title: 'Again', candidateId: invited.id }), 'validation_error');
    expect((await business.overview(owner)).capacity.candidatesUsed).toBe(0);
    expect((await business.setCandidateArchived(owner, undefined, invited.id, false)).status).toBe('active');
    expect((await business.queue(owner)).items.map((item) => item.title).sort()).toEqual(['For you', 'Shared role']);

    // The candidate can leave; their own profile is untouched.
    await business.leave(user, invited.id);
    expect((await business.memberships(user)).candidateOf).toEqual([]);
  });
});
