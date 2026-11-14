import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService, type Principal } from '../identity/identity.service';
import { TestClock } from '../testing/billing-fixture';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { OpportunityService } from './opportunity.service';
import { OpportunityTrustService } from './opportunity-trust.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-16T09:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('OpportunityTrustService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let opportunities: OpportunityService;
  let trustService: OpportunityTrustService;
  const adminUid = 'admin-user-1';

  beforeAll(async () => {
    db = await createTestDatabase('opportunity_trust');
    clock = new TestClock('2026-10-16T09:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
  });

  beforeEach(() => {
    opportunities = new OpportunityService(db.pool, clock);
    trustService = new OpportunityTrustService(db.pool, clock, new Set([adminUid]));
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string): Promise<Principal> {
    return identities.principal(identity(uid));
  }

  it('records a user report and auto-flags opportunity upon reaching threshold', async () => {
    const candidate1 = await person('cand-1');
    const candidate2 = await person('cand-2');

    const ingested = await opportunities.ingest(null, [{
      provider: 'adzuna',
      sourceId: 'trust-shared-fee',
      title: 'Suspicious Job Title',
      organization: 'Example Org',
      description: 'Suspicious Job Title\nRequires $500 wire transfer upfront for training equipment.',
      locations: ['London'],
      sourceUrl: 'https://example.test/jobs/trust-shared-fee',
      deadline: null,
      compensation: { minimum: null, maximum: null, currency: null, period: null },
      category: 'job',
      status: 'open',
    }]);
    expect(ingested.inserted).toBe(1);
    const found = await opportunities.search(candidate1, { q: 'Suspicious Job Title' });
    const inserted = found.items.find((item) => item.title === 'Suspicious Job Title');
    expect(inserted).toBeTruthy();

    // Initial trust signals
    const signalsInitial = await trustService.getTrustSignals(candidate1, inserted!.id);
    expect(signalsInitial.moderationStatus).toBe('unflagged');
    expect(signalsInitial.reportCount).toBe(0);
    expect(signalsInitial.signals.some((s) => s.key === 'suspicious_fee')).toBe(true);

    // 1st report
    const r1 = await trustService.reportListing(candidate1, inserted!.id, {
      reason: 'suspicious_fee',
      notes: 'Asked for money upfront',
    });
    expect(r1.status).toBe('reported');

    let opp = await opportunities.get(candidate1, inserted!.id);
    expect(opp.moderationStatus).toBe('unflagged');

    // 2nd report from different user -> triggers auto-flag
    const r2 = await trustService.reportListing(candidate2, inserted!.id, {
      reason: 'scam',
      notes: 'Confirmed scam posting',
    });
    expect(r2.status).toBe('reported');

    opp = await opportunities.get(candidate1, inserted!.id);
    expect(opp.moderationStatus).toBe('flagged');

    const signalsAfter = await trustService.getTrustSignals(candidate1, inserted!.id);
    expect(signalsAfter.moderationStatus).toBe('flagged');
    expect(signalsAfter.reportCount).toBe(2);
  });

  it('lists moderation queue for admin and refuses non-admin', async () => {
    const cand = await person('cand-normal');
    const admin = await person(adminUid);

    // Non-admin should be rejected
    try {
      await trustService.listModerationQueue(cand);
      throw new Error('expected permission_denied');
    } catch (error) {
      expect(isBillingError(error, 'permission_denied')).toBe(true);
    }

    // Admin lists moderation queue
    const queue = await trustService.listModerationQueue(admin);
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.items[0].moderationStatus).toBe('flagged');
    expect(queue.items[0].reportCount).toBe(2);
  });

  it('allows admin to moderate listing (verify, suppress, dismiss) and audits actions', async () => {
    const cand = await person('cand-normal');
    const admin = await person(adminUid);

    const inserted = await opportunities.paste(cand, {
      text: 'Legit Engineer\nGood company, clear compensation.',
    });

    // 1. Verify listing
    const vResult = await trustService.moderateListing(admin, inserted.id, {
      action: 'verify',
      notes: 'Employer verified by phone.',
    });
    expect(vResult.moderationStatus).toBe('verified');

    let detail = await opportunities.get(cand, inserted.id);
    expect(detail.moderationStatus).toBe('verified');
    expect(detail.trustSignals?.isVerified).toBe(true);

    // 2. Suppress listing -> hidden from search
    const sResult = await trustService.moderateListing(admin, inserted.id, {
      action: 'suppress',
      notes: 'Violates terms.',
    });
    expect(sResult.moderationStatus).toBe('suppressed');

    // Search by another user does not include suppressed opportunity
    const other = await person('other-searcher');
    const searchRes = await opportunities.search(other, { q: 'Legit Engineer' });
    expect(searchRes.items.some((item) => item.id === inserted.id)).toBe(false);

    // 3. Dismiss -> returns to unflagged
    const dResult = await trustService.moderateListing(admin, inserted.id, {
      action: 'dismiss',
      notes: 'Reviewed and cleared.',
    });
    expect(dResult.moderationStatus).toBe('unflagged');

    detail = await opportunities.get(cand, inserted.id);
    expect(detail.moderationStatus).toBe('unflagged');

    // Check admin audit records exist
    const auditRows = await db.pool.query(
      `SELECT action, target FROM admin_audit WHERE actor_auth_user_id = $1 ORDER BY created_at DESC`,
      [admin.authUserId],
    );
    expect(auditRows.rows.length).toBeGreaterThanOrEqual(3);
    expect(auditRows.rows[0].action).toBe('opportunity.moderate');
  });

  it('keeps one open report per person and returns that person review status', async () => {
    const candidate = await person('cand-once');
    const inserted = await opportunities.paste(candidate, {
      text: 'Fee Role\nPay an application fee upfront.',
    });
    await trustService.reportListing(candidate, inserted.id, { reason: 'suspicious_fee', notes: 'first' });
    const again = await trustService.reportListing(candidate, inserted.id, { reason: 'misleading', notes: 'updated note' });
    expect(again.reviewStatus).toBe('pending');

    const signals = await trustService.getTrustSignals(candidate, inserted.id);
    expect(signals.reportCount).toBe(1);
    expect(signals.moderationStatus).toBe('unflagged');
    expect(signals.viewerReport?.reason).toBe('misleading');
    expect(signals.viewerReport?.status).toBe('pending');
    expect(signals.sourceConfidence).toBe('candidate_supplied');
    expect(signals.signals.some((signal) => /fraud|guaranteed/i.test(signal.message))).toBe(false);
  });

  it('refuses a report on another person pasted listing', async () => {
    const owner = await person('paste-owner-trust');
    const other = await person('paste-other-trust');
    const inserted = await opportunities.paste(owner, { text: 'Private paste role\nDesk work only, filing and records upkeep.' });
    try {
      await trustService.reportListing(other, inserted.id, { reason: 'other' });
      throw new Error('expected permission_denied');
    } catch (error) {
      expect(isBillingError(error, 'permission_denied')).toBe(true);
    }
  });

  it('removes a shared listing from search and still explains that removal', async () => {
    const admin = await person(adminUid);
    const reader = await person('reader-trust');
    const ingested = await opportunities.ingest(null, [{
      provider: 'adzuna',
      sourceId: 'trust-public-1',
      title: 'Public trust analyst',
      organization: 'Babbage Works',
      description: 'Ordinary analyst role with stated duties.',
      locations: ['London'],
      sourceUrl: 'https://example.test/jobs/trust-public-1',
      deadline: null,
      compensation: { minimum: null, maximum: null, currency: null, period: null },
      category: 'job',
      status: 'open',
    }]);
    expect(ingested.inserted).toBe(1);

    const found = await opportunities.search(reader, { q: 'Public trust analyst' });
    const id = found.items.find((item) => item.title === 'Public trust analyst')?.id;
    expect(id).toBeTruthy();

    await trustService.moderateListing(admin, id as string, { action: 'suppress', notes: 'Removed after review.' });
    const hidden = await opportunities.search(reader, { q: 'Public trust analyst' });
    expect(hidden.items.some((item) => item.id === id)).toBe(false);

    const detail = await opportunities.get(reader, id as string);
    expect(detail.moderationStatus).toBe('suppressed');
    expect(detail.trustSignals?.signals.some((signal) => signal.key === 'suppressed_listing')).toBe(true);

    await trustService.moderateListing(admin, id as string, { action: 'dismiss', notes: 'Cleared after a second look.' });
    const restored = await opportunities.search(reader, { q: 'Public trust analyst' });
    expect(restored.items.some((item) => item.id === id)).toBe(true);
  });
});
