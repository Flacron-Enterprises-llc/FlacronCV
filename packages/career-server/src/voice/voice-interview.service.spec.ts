import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { BillingService } from '../billing/billing.service';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService } from '../identity/identity.service';
import type { Principal } from '../identity/identity.service';
import { CareerProfileService } from '../profile/career-profile.service';
import { TestClock } from '../testing/billing-fixture';
import { FakeTextModel } from '../testing/fake-ai';
import { createTestDatabase, TestDatabase } from '../testing/test-database';
import { VoiceInterviewService } from './voice-interview.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-18T10:00:00Z');
  return { uid, email: `${uid}@example.test`, emailVerified: true, authTime: at, issuedAt: at, signInProvider: 'password' };
}

describe('VoiceInterviewService', () => {
  let db: TestDatabase;
  let clock: TestClock;
  let identities: IdentityService;
  let profiles: CareerProfileService;
  let voice: VoiceInterviewService;

  beforeAll(async () => {
    db = await createTestDatabase('voice');
    clock = new TestClock('2026-10-18T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    await db.pool.query(
      `INSERT INTO feature_flags (feature, enabled) VALUES ('voiceMinutes', true)
       ON CONFLICT (feature) DO UPDATE SET enabled = true`,
    );
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    profiles = new CareerProfileService(db.pool, new FakeTextModel(), clock);
    voice = new VoiceInterviewService(db.pool, clock);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function person(uid: string, plan?: 'professional'): Promise<Principal> {
    const principal = await identities.principal(identity(uid));
    if (plan) await db.pool.query(`UPDATE billing_accounts SET plan_id = $2 WHERE id = $1`, [principal.billingAccountId, plan]);
    return principal;
  }

  let listingCount = 0;
  async function listing(owner: Principal, title: string): Promise<string> {
    listingCount += 1;
    const opportunity = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunities (category, provider, source_id, title, organization, status, candidate_auth_user_id)
       VALUES ('job', 'paste', $1, $2, 'unstated', 'open', $3) RETURNING id`,
      [`voice-${listingCount}`, title, owner.authUserId],
    );
    const revision = await db.pool.query<{ id: string }>(
      `INSERT INTO opportunity_revisions (opportunity_id, revision, title, organization, description, status)
       VALUES ($1, 1, $2, 'unstated', $3, 'open') RETURNING id`,
      [opportunity.rows[0].id, title, 'SQL analyst'],
    );
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunity.rows[0].id, revision.rows[0].id]);
    return opportunity.rows[0].id;
  }

  async function ledgerMinutes(accountId: string): Promise<number> {
    const rows = await db.pool.query<{ quantity: number }>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM usage_ledger
        WHERE billing_account_id = $1 AND unit = 'voice_minute' AND state = 'committed'`,
      [accountId],
    );
    return rows.rows[0].quantity;
  }

  it('stays off until the flag is on, and Free cannot start', async () => {
    await db.pool.query(`UPDATE feature_flags SET enabled = false WHERE feature = 'voiceMinutes'`);
    const blocked = await person('voice-flag');
    const off = await voice.list(blocked).catch((error: unknown) => error);
    expect(isBillingError(off, 'feature_unavailable')).toBe(true);
    await db.pool.query(`UPDATE feature_flags SET enabled = true WHERE feature = 'voiceMinutes'`);

    const free = await person('voice-free');
    const listed = await voice.list(free);
    expect(listed.planIncludesVoice).toBe(false);
    expect(listed.remainingSeconds).toBe(0);
    const upgrade = await voice.start(free, { kind: 'practice', opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' }).catch((error: unknown) => error);
    expect(isBillingError(upgrade, 'validation_error')).toBe(true);
    await voice.consent(free);
    const still = await voice.start(free, { kind: 'practice', opportunityId: '00000000-0000-4000-8000-000000000001', stage: 'behavioral' }).catch((error: unknown) => error);
    expect(isBillingError(still, 'plan_upgrade_required')).toBe(true);
    expect(await ledgerMinutes(free.billingAccountId)).toBe(0);
  });

  it('meters 90 seconds as one minute plus a 30 second remainder, then keeps the summary after delete', async () => {
    const owner = await person('voice-pro', 'professional');
    const other = await person('voice-other', 'professional');
    await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const opportunityId = await listing(owner, 'SQL analyst');
    const noConsent = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' }).catch((error: unknown) => error);
    expect(isBillingError(noConsent, 'validation_error')).toBe(true);

    // Consent can be withdrawn, and starting is refused again until it is given back.
    await voice.consent(owner);
    expect(await voice.withdrawConsent(owner)).toEqual({ consent: false });
    expect((await voice.list(owner)).consent).toBe(false);
    const withdrawn = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' }).catch((error: unknown) => error);
    expect(isBillingError(withdrawn, 'validation_error')).toBe(true);

    await voice.consent(owner);
    const before = await voice.list(owner);
    expect(before.remainingSeconds).toBe(1800);
    expect(before.consent).toBe(true);

    const session = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' });
    expect(session.summary).toBe('No recording yet.');
    expect(session.prompt).toContain('SQL');
    expect(session.recording).toBeNull();
    expect((await voice.list(owner)).remainingSeconds).toBe(1800);

    const missingLanguage = await voice.transcribe(owner, session.id, { language: 'de' }).catch((error: unknown) => error);
    expect(isBillingError(missingLanguage, 'validation_error')).toBe(true);
    const unavailable = await voice.transcribe(owner, session.id, { language: 'en' }).catch((error: unknown) => error);
    expect(isBillingError(unavailable, 'provider_unavailable')).toBe(true);
    expect(JSON.stringify(unavailable)).not.toMatch(/I used SQL/);

    const recorded = await voice.record(owner, session.id, { durationSeconds: 90, transcript: 'I used SQL.' }, 'take-90');
    expect(recorded.replayed).toBe(false);
    expect(recorded.billedSeconds).toBe(90);
    expect(recorded.truncated).toBe(false);
    expect(recorded.remainingSeconds).toBe(1710);
    expect(recorded.session.summary).toBe('Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.');
    expect(recorded.session.summary).not.toMatch(/emotion|honesty|personality|guaranteed/i);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(1);

    const replay = await voice.record(owner, session.id, { durationSeconds: 90, transcript: 'I used SQL.' }, 'take-90');
    expect(replay.replayed).toBe(true);
    expect(replay.remainingSeconds).toBe(1710);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(1);

    const mismatch = await voice.record(owner, session.id, { durationSeconds: 91, transcript: 'I used SQL.' }, 'take-90').catch((error: unknown) => error);
    expect(isBillingError(mismatch, 'idempotency_mismatch')).toBe(true);

    const denied = await voice.record(other, session.id, { durationSeconds: 10, transcript: 'I used SQL.' }, 'other-take').catch((error: unknown) => error);
    expect(isBillingError(denied, 'permission_denied')).toBe(true);

    const again = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' });
    const second = await voice.record(owner, again.id, { durationSeconds: 40, transcript: 'I used SQL again.' }, 'take-40');
    expect(second.billedSeconds).toBe(40);
    expect(second.remainingSeconds).toBe(1670);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(2);

    const corrected = await voice.correctTranscript(owner, session.id, 'I helped the team.');
    expect(corrected.summary).toBe(recorded.session.summary);
    expect(corrected.recording?.transcript).toBe('I helped the team.');
    expect(corrected.recording?.feedback.relevance).toBe('missing');
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(2);

    const removed = await voice.deleteAudio(owner, session.id);
    expect(removed.recording?.audioDeleted).toBe(true);
    expect(removed.summary).toBe(recorded.session.summary);
    expect((await voice.list(owner)).items.find((item) => item.id === session.id)?.summary).toBe(recorded.session.summary);
  });

  it('cuts a take at the seconds that remain and quotes a negotiation offer as an assumption', async () => {
    const owner = await person('voice-edge', 'professional');
    await voice.consent(owner);
    await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const opportunityId = await listing(owner, 'SQL analyst');
    const account = await db.pool.query<{ id: string; allowance_period_start: Date }>(
      `SELECT id, allowance_period_start FROM billing_accounts WHERE id = $1`,
      [owner.billingAccountId],
    );
    await db.pool.query(
      `INSERT INTO usage_balances
         (billing_account_id, workspace_id, unit, allowance_period_start, allowance_period_end, included_granted, included_remaining)
       SELECT id, workspace_id, 'voice_minute', allowance_period_start, allowance_period_end, 30, 1
         FROM billing_accounts WHERE id = $1`,
      [owner.billingAccountId],
    );
    await db.pool.query(
      `INSERT INTO voice_meter_remainders (billing_account_id, allowance_period_start, remainder_seconds)
       VALUES ($1, $2, 50)`,
      [account.rows[0].id, account.rows[0].allowance_period_start],
    );
    const session = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' });
    expect((await voice.list(owner)).remainingSeconds).toBe(10);
    const cut = await voice.record(owner, session.id, { durationSeconds: 30, transcript: 'I used SQL.' }, 'cut');
    expect(cut.truncated).toBe(true);
    expect(cut.billedSeconds).toBe(10);
    expect(cut.remainingSeconds).toBe(0);
    expect(cut.session.summary).toContain('Recorded 10 seconds.');
    const empty = await voice.record(owner, (await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' })).id, { durationSeconds: 5, transcript: 'I used SQL.' }, 'empty').catch((error: unknown) => error);
    expect(isBillingError(empty, 'quota_exhausted')).toBe(true);

    const talk = await voice.start(owner, { kind: 'negotiation', offer: '80000 USD', salarySource: 'the pasted posting' });
    expect(talk.guidance).toContain('Assumption:');
    expect(talk.guidance).toContain('80000 USD');
    expect(talk.guidance).not.toMatch(/guaranteed|emotion|honesty|personality/i);
  });
});
