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
import { MemoryObjectStorage } from '../storage/object-storage';
import type { SpeechTranscriber } from '../ai/speech-transcriber';
import { mp4Fragmented, oggOpus, webmOpus } from './audio-fixtures';
import { VoiceInterviewService } from './voice-interview.service';
import type { VoiceTranscriptionRequest } from './voice-interview.service';

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
  let storage: MemoryObjectStorage;

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
    storage = new MemoryObjectStorage();
    voice = new VoiceInterviewService(db.pool, clock, undefined, storage);
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

  async function intents(): Promise<Array<{ object_key: string; not_before: string }>> {
    const rows = await db.pool.query<{ object_key: string; not_before: string }>(
      `SELECT object_key, not_before::text AS not_before FROM stored_object_intents WHERE object_key LIKE 'voice/%'`,
    );
    return rows.rows;
  }

  function webm(seconds: number) {
    return { body: webmOpus(seconds), contentType: 'audio/webm;codecs=opus' };
  }

  it('meters the seconds measured in the uploaded audio, stores it privately, and keeps the summary after removal', async () => {
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
    expect(before.transcriptionAvailable).toBe(false);

    const session = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'technical' });
    expect(session.summary).toBe('No recording yet.');
    expect(session.stage).toBe('technical');
    expect(session.prompt).toContain('SQL');
    expect(session.recording).toBeNull();
    expect((await voice.list(owner)).remainingSeconds).toBe(1800);

    const missingLanguage = await voice.transcribe(owner, session.id, { language: 'de' }).catch((error: unknown) => error);
    expect(isBillingError(missingLanguage, 'validation_error')).toBe(true);
    const unavailable = await voice.transcribe(owner, session.id, { language: 'en' }).catch((error: unknown) => error);
    expect(isBillingError(unavailable, 'provider_unavailable')).toBe(true);

    const audio = webm(90);
    const recorded = await voice.record(owner, session.id, audio, 'take-90');
    expect(recorded.replayed).toBe(false);
    expect(recorded.billedSeconds).toBe(90);
    expect(recorded.truncated).toBe(false);
    expect(recorded.remainingSeconds).toBe(1710);
    // No transcription provider: the take is saved and the words are typed next. Nothing is invented.
    expect(recorded.transcription).toBe('unavailable');
    expect(recorded.session.recording).toMatchObject({ transcript: '', transcriptSource: 'pending', feedback: null, audioStored: true, audioDeleted: false });
    expect(recorded.session.summary).toBe('Recorded 90 seconds. Add the transcript to get feedback.');
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(1);
    expect(storage.objects.size).toBe(1);
    const [storedKey] = [...storage.objects.keys()];
    expect(storedKey).toMatch(/^voice\/.+\.webm$/);
    expect(storedKey).not.toContain(owner.authUserId);
    expect(storage.contentTypes.get(storedKey)).toBe('audio/webm');
    // The queue row is kept but never due, so only an account deletion or "Remove" deletes the file.
    expect(await intents()).toEqual([{ object_key: storedKey, not_before: 'infinity' }]);

    const replay = await voice.record(owner, session.id, audio, 'take-90');
    expect(replay.replayed).toBe(true);
    expect(replay.remainingSeconds).toBe(1710);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(1);
    expect(storage.objects.size).toBe(1);

    const mismatch = await voice.record(owner, session.id, webm(91), 'take-90').catch((error: unknown) => error);
    expect(isBillingError(mismatch, 'idempotency_mismatch')).toBe(true);
    const twice = await voice.record(owner, session.id, webm(5), 'take-again').catch((error: unknown) => error);
    expect(isBillingError(twice, 'validation_error')).toBe(true);

    const denied = await voice.record(other, session.id, webm(10), 'other-take').catch((error: unknown) => error);
    expect(isBillingError(denied, 'permission_denied')).toBe(true);
    expect(storage.objects.size).toBe(1);
    expect(await intents()).toHaveLength(1);

    const link = await voice.audioLink(owner, session.id);
    expect(link.contentType).toBe('audio/webm');
    expect(link.url).toContain(encodeURIComponent(storedKey));
    const hiddenLink = await voice.audioLink(other, session.id).catch((error: unknown) => error);
    expect(isBillingError(hiddenLink, 'permission_denied')).toBe(true);

    const again = await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' });
    const second = await voice.record(owner, again.id, { body: oggOpus(40), contentType: 'audio/ogg' }, 'take-40');
    expect(second.billedSeconds).toBe(40);
    expect(second.remainingSeconds).toBe(1670);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(2);

    // Typing the words computes feedback and saves a new summary; no time is spent.
    const typed = await voice.correctTranscript(owner, session.id, 'I used SQL.');
    expect(typed.recording).toMatchObject({ transcript: 'I used SQL.', transcriptSource: 'typed' });
    expect(typed.recording?.feedback?.relevance).toBe('grounded');
    expect(typed.summary).toBe('Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.');
    const corrected = await voice.correctTranscript(owner, session.id, 'I helped the team.');
    expect(corrected.recording?.transcript).toBe('I helped the team.');
    expect(corrected.recording?.feedback?.relevance).toBe('missing');
    expect(corrected.summary).toBe('Recorded 90 seconds. Relevance missing. Structure thin. Specificity general. Evidence unstated.');
    expect(corrected.summary).not.toMatch(/emotion|honesty|personality|guaranteed|confident|nervous/i);
    expect((await voice.list(owner)).items.find((item) => item.id === session.id)?.summary).toBe(corrected.summary);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(2);

    const removed = await voice.deleteAudio(owner, session.id);
    expect(removed.recording).toMatchObject({ audioDeleted: true, audioStored: false, transcript: 'I helped the team.' });
    expect(removed.summary).toBe(corrected.summary);
    expect(storage.objects.has(storedKey)).toBe(false);
    expect((await intents()).map((row) => row.object_key)).not.toContain(storedKey);
    expect((await voice.list(owner)).items.find((item) => item.id === session.id)?.summary).toBe(corrected.summary);
    const gone = await voice.audioLink(owner, session.id).catch((error: unknown) => error);
    expect(isBillingError(gone, 'not_found')).toBe(true);
    // Removing again is harmless.
    expect((await voice.deleteAudio(owner, session.id)).recording?.audioDeleted).toBe(true);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(2);
  });

  it('refuses audio it cannot measure or that is not what it claims, before charging or storing', async () => {
    const owner = await person('voice-bad-audio', 'professional');
    await voice.consent(owner);
    await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const session = await voice.start(owner, { kind: 'practice', role: 'Data analyst', stage: 'recruiter' });
    expect(session.opportunityId).toBeNull();
    expect(session.title).toBe('Data analyst');
    const cases: Array<[unknown, string, string]> = [
      [Buffer.from('not audio at all'), 'audio/webm', 'type_mismatch'],
      [webmOpus(5), 'audio/ogg', 'type_mismatch'],
      [webmOpus(5), 'audio/wav', 'unsupported_type'],
      [Buffer.alloc(0), 'audio/webm', 'empty'],
      [{ not: 'a buffer' }, 'audio/webm', 'empty'],
      [webmOpus(5).subarray(0, 40), 'audio/webm', 'duration_unreadable'],
    ];
    for (const [body, contentType, reason] of cases) {
      const error = await voice.record(owner, session.id, { body, contentType }, `bad-${reason}-${contentType}`).catch((caught: unknown) => caught);
      expect(isBillingError(error, 'validation_error')).toBe(true);
      if (isBillingError(error)) expect(error.details.reason).toBe(reason);
    }
    const language = await voice.record(owner, session.id, { ...webm(3), language: 'de' }, 'bad-language').catch((caught: unknown) => caught);
    expect(isBillingError(language, 'validation_error')).toBe(true);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(0);
    expect((await voice.list(owner)).items[0].recording).toBeNull();
    const shortRole = await voice.start(owner, { kind: 'practice', role: 'x', stage: 'recruiter' }).catch((caught: unknown) => caught);
    expect(isBillingError(shortRole, 'validation_error')).toBe(true);
  });

  it("treats another person's pasted listing as missing", async () => {
    const owner = await person('voice-listing-owner', 'professional');
    const intruder = await person('voice-listing-intruder', 'professional');
    await voice.consent(intruder);
    await profiles.createFact(intruder, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const privateListing = await listing(owner, 'Secret role');
    const refused = await voice.start(intruder, { kind: 'practice', opportunityId: privateListing, stage: 'behavioral' }).catch((error: unknown) => error);
    expect(isBillingError(refused, 'not_found')).toBe(true);
  });

  it('uses a connected transcriber with the audio, and spends nothing when storage refuses the file', async () => {
    const owner = await person('voice-transcribed', 'professional');
    await voice.consent(owner);
    await profiles.createFact(owner, { factType: 'skill', value: { name: 'SQL' }, confirmation: 'confirmed' });
    const seen: VoiceTranscriptionRequest[] = [];
    const transcriber: SpeechTranscriber = {
      async transcribe(request) {
        seen.push(request as VoiceTranscriptionRequest);
        return { text: '  I used SQL every week.  ', provider: 'fake', model: 'fake-1' };
      },
    };
    const connected = new VoiceInterviewService(db.pool, clock, transcriber, storage);
    const session = await connected.start(owner, { kind: 'practice', role: 'Analyst', stage: 'behavioral' });
    const take = await connected.record(owner, session.id, { body: mp4Fragmented(20), contentType: 'audio/mp4', language: 'fr' }, 'mp4-take');
    expect(take.billedSeconds).toBe(20);
    expect(take.transcription).toBe('transcribed');
    expect(take.session.recording).toMatchObject({ transcript: 'I used SQL every week.', transcriptSource: 'transcribed' });
    expect(take.session.summary).toContain('Recorded 20 seconds. Relevance grounded.');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ language: 'fr', mimeType: 'audio/mp4' });
    expect(Buffer.isBuffer(seen[0].audio)).toBe(true);

    const failing = new MemoryObjectStorage();
    failing.put = async () => {
      throw new Error('disk full');
    };
    const broken = new VoiceInterviewService(db.pool, clock, transcriber, failing);
    const next = await broken.start(owner, { kind: 'practice', role: 'Analyst', stage: 'behavioral' });
    const before = await ledgerMinutes(owner.billingAccountId);
    const error = await broken.record(owner, next.id, webm(70), 'disk-full').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(await ledgerMinutes(owner.billingAccountId)).toBe(before);
    const rows = await db.pool.query(`SELECT 1 FROM voice_audio_records WHERE session_id = $1`, [next.id]);
    expect(rows.rowCount).toBe(0);
    expect((await intents()).filter((row) => row.not_before !== 'infinity')).toEqual([]);
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
    const cut = await voice.record(owner, session.id, webm(30), 'cut');
    expect(cut.truncated).toBe(true);
    expect(cut.billedSeconds).toBe(10);
    expect(cut.remainingSeconds).toBe(0);
    expect(cut.session.recording?.requestedSeconds).toBe(30);
    expect(cut.session.summary).toContain('Recorded 10 seconds.');
    const objectsBefore = storage.objects.size;
    const empty = await voice
      .record(owner, (await voice.start(owner, { kind: 'practice', opportunityId, stage: 'behavioral' })).id, webm(5), 'empty')
      .catch((error: unknown) => error);
    expect(isBillingError(empty, 'quota_exhausted')).toBe(true);
    expect(storage.objects.size).toBe(objectsBefore);

    const talk = await voice.start(owner, { kind: 'negotiation', offer: '80000 USD', salarySource: 'the pasted posting' });
    expect(talk.guidance).toContain('Assumption:');
    expect(talk.guidance).toContain('80000 USD');
    expect(talk.guidance).not.toMatch(/guaranteed|emotion|honesty|personality/i);
  });
});
