import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  applyVoiceSeconds,
  factLineText,
  interviewQuestions,
  isFactType,
  isInterviewStage,
  negotiationGuidance,
  transcriptionRequest,
  voiceAudioContentType,
  voicePendingSummary,
  voiceRecordingSeconds,
  voiceRemainingSeconds,
  voiceSessionSummary,
  TRANSCRIPTION_MIME_TYPES,
  VOICE_CONSENT_VERSION,
  VOICE_NO_RECORDING_SUMMARY,
  VOICE_UPLOAD_MAX_BYTES,
  MAX_VOICE_RECORD_SECONDS,
} from '@flacroncv/career-shared';
import type { InterviewFeedback, InterviewStage, ResumeFactInput, TranscriptionRequest, VoiceAudioContentType } from '@flacroncv/career-shared';
import { lockAccount, readAccount } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore, includedFor, minimumPlanFor } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { commit, reserve } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { fingerprintRequest } from '../billing/fingerprint';
import { UnconfiguredSpeechTranscriber } from '../ai/speech-transcriber';
import type { SpeechTranscribeResult, SpeechTranscriber, SpeechTranscriptionInput } from '../ai/speech-transcriber';
import { requireFeature } from '../metering/access';
import { personKey, requireLivePerson } from '../privacy/live-person';
import type { ProfileOwner } from '../profile/career-profile.service';
import { UnconfiguredObjectStorage } from '../storage/object-storage';
import type { ObjectStorage } from '../storage/object-storage';
import { detectAudioContainer, measureAudioDuration } from './audio-duration';
import type { VoiceAudioContainer } from './audio-duration';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 10_000;
const MAX_OFFER = 500;
const MAX_ROLE = 120;
/** An upload's queue row is not due for cleanup while the upload may still be running. */
const IN_PROGRESS_MS = 10 * 60 * 1000;
/** A playback link lasts five minutes, like an evidence download. */
export const VOICE_AUDIO_LINK_TTL_MS = 5 * 60 * 1000;

const CONTAINER_FOR_TYPE: Record<VoiceAudioContentType, VoiceAudioContainer> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
};
const EXTENSION_FOR_TYPE: Record<VoiceAudioContentType, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};

const systemClock: Clock = { now: () => new Date() };

interface SessionRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  kind: string;
  opportunity_id: string | null;
  stage: string | null;
  title: string;
  prompt: string;
  fact_text: string;
  guidance: string | null;
  summary: string;
  created_at: Date;
}

interface AudioRow {
  id: string;
  session_id: string;
  duration_seconds: number;
  requested_seconds: number;
  truncated: boolean;
  transcript: string;
  transcript_source: string;
  feedback: unknown;
  audio_deleted_at: Date | null;
  audio_object_key: string | null;
  audio_content_type: string | null;
  request_fingerprint: string;
}

const AUDIO_COLUMNS = `id, session_id, duration_seconds, requested_seconds, truncated, transcript, transcript_source, feedback,
  audio_deleted_at, audio_object_key, audio_content_type, request_fingerprint`;

export interface VoiceRecordingView {
  id: string;
  durationSeconds: number;
  requestedSeconds: number;
  truncated: boolean;
  transcript: string;
  /** Where the words came from; `pending` means nothing has been typed or transcribed yet. */
  transcriptSource: 'typed' | 'transcribed' | 'pending';
  /** Null until there is a transcript to judge. */
  feedback: InterviewFeedback | null;
  /** The audio file is still stored and can be played back. */
  audioStored: boolean;
  audioDeleted: boolean;
}

export interface VoiceSessionView {
  id: string;
  kind: 'practice' | 'negotiation';
  title: string;
  prompt: string;
  guidance: string | null;
  summary: string;
  opportunityId: string | null;
  stage: InterviewStage | null;
  recording: VoiceRecordingView | null;
  createdAt: string;
}

export interface VoiceList {
  items: VoiceSessionView[];
  consent: boolean;
  remainingSeconds: number;
  planIncludesVoice: boolean;
  renewalDate: string | null;
  /** False while no speech provider is connected: the person types what they said. */
  transcriptionAvailable: boolean;
}

/** What happened to automatic transcription of a new take. Nothing about it changes the charge. */
export type VoiceTranscriptionOutcome = 'transcribed' | 'unavailable' | 'failed' | 'not_attempted';

export interface VoiceRecordResult {
  session: VoiceSessionView;
  billedSeconds: number;
  truncated: boolean;
  remainingSeconds: number;
  replayed: boolean;
  transcription: VoiceTranscriptionOutcome;
}

/** The raw upload as the HTTP layer received it. */
export interface VoiceAudioUpload {
  body: unknown;
  contentType?: string | null;
  language?: string | null;
}

/**
 * The transcription seam's request plus the audio itself. A vendor adapter
 * reads `audio`; the unconfigured one refuses before looking at it.
 */
export type VoiceTranscriptionRequest = SpeechTranscriptionInput;

/**
 * Spoken practice. Starting a session does not spend time. Uploading a take
 * spends the seconds the server measures in the audio file itself; the
 * transcript and the feedback are included in that spend. Removing the
 * recording deletes the stored audio and keeps the transcript and summary.
 */
export class VoiceInterviewService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
    private readonly transcriber: SpeechTranscriber = new UnconfiguredSpeechTranscriber(),
    private readonly storage: ObjectStorage = new UnconfiguredObjectStorage(),
  ) {}

  async list(owner: ProfileOwner): Promise<VoiceList> {
    await this.assertFeature(owner);
    const rows = await this.pool.query<SessionRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
              fact_text, guidance, summary, created_at
         FROM voice_interview_sessions
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const items: VoiceSessionView[] = [];
    for (const row of rows.rows) items.push(await this.sessionView(row));
    const balance = await this.readBalance(owner);
    return {
      items,
      consent: await this.hasConsent(owner),
      remainingSeconds: balance.remainingSeconds,
      planIncludesVoice: balance.planIncludesVoice,
      renewalDate: balance.renewalDate,
      transcriptionAvailable: !(this.transcriber instanceof UnconfiguredSpeechTranscriber),
    };
  }

  async consent(owner: ProfileOwner): Promise<{ consent: true; version: string }> {
    await this.assertFeature(owner);
    await this.pool.query(
      `INSERT INTO recording_consents (workspace_id, candidate_auth_user_id, consent_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, candidate_auth_user_id, consent_version) DO NOTHING`,
      [owner.workspaceId, owner.authUserId, VOICE_CONSENT_VERSION],
    );
    return { consent: true, version: VOICE_CONSENT_VERSION };
  }

  /**
   * Withdraws recording consent (every version). New recordings are refused
   * until the person agrees again; recordings already made stay until they
   * delete them. Not behind the feature switch: withdrawing must always work.
   */
  async withdrawConsent(owner: ProfileOwner): Promise<{ consent: false }> {
    await this.pool.query(
      `DELETE FROM recording_consents WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    return { consent: false };
  }

  /**
   * Opens a session. A practice session is for a saved listing or, without
   * one, for a role the person names; either way the question comes from
   * their confirmed facts. A negotiation session quotes the offer they enter.
   */
  async start(
    owner: ProfileOwner,
    input: { kind?: string; opportunityId?: string; role?: string; stage?: string; offer?: string; salarySource?: string },
  ): Promise<VoiceSessionView> {
    await this.assertFeature(owner);
    if (!(await this.hasConsent(owner))) throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
    const kind = input.kind === 'negotiation' ? 'negotiation' : input.kind === 'practice' ? 'practice' : null;
    if (!kind) throw new BillingError('validation_error', { field: 'kind', reason: 'invalid' });
    const balance = await this.readBalance(owner);
    if (!balance.planIncludesVoice) {
      throw new BillingError('plan_upgrade_required', {
        feature: 'voiceMinutes',
        minimumPlan: balance.minimumPlan,
      });
    }

    if (kind === 'negotiation') {
      const offer = input.offer?.trim() ?? '';
      const salarySource = input.salarySource?.trim() ?? '';
      if (offer.length === 0 || offer.length > MAX_OFFER) {
        throw new BillingError('validation_error', { field: 'offer', reason: 'invalid' });
      }
      if (salarySource.length > MAX_OFFER) {
        throw new BillingError('validation_error', { field: 'salarySource', reason: 'invalid' });
      }
      const guidance = negotiationGuidance(offer, salarySource);
      const inserted = await this.pool.query<SessionRow>(
        `INSERT INTO voice_interview_sessions
           (workspace_id, candidate_auth_user_id, kind, title, prompt, fact_text, guidance, summary)
         VALUES ($1, $2, 'negotiation', 'Negotiation', $3, $4, $3, $5)
         RETURNING id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
                   fact_text, guidance, summary, created_at`,
        [owner.workspaceId, owner.authUserId, guidance, `${offer}\n${salarySource}`, VOICE_NO_RECORDING_SUMMARY],
      );
      return this.sessionView(inserted.rows[0]);
    }

    if (!input.stage || !isInterviewStage(input.stage)) {
      throw new BillingError('validation_error', { field: 'stage', reason: 'invalid' });
    }
    let target: { opportunityId: string | null; title: string };
    if (input.opportunityId !== undefined && input.opportunityId !== '') {
      if (!UUID.test(input.opportunityId)) throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
      target = await this.listing(owner, input.opportunityId);
    } else {
      const role = input.role?.trim() ?? '';
      if (role.length < 2 || role.length > MAX_ROLE) throw new BillingError('validation_error', { field: 'role', reason: 'invalid' });
      target = { opportunityId: null, title: role };
    }
    const facts = await this.confirmedLines(owner);
    if (facts.length === 0) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const questions = interviewQuestions({ title: target.title, stage: input.stage, facts });
    const question = questions?.[0];
    if (!question) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const fact = facts.find((item) => item.id === question.factId) ?? facts[0];
    const inserted = await this.pool.query<SessionRow>(
      `INSERT INTO voice_interview_sessions
         (workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt, fact_text, summary)
       VALUES ($1, $2, 'practice', $3, $4, $5, $6, $7, $8)
       RETURNING id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
                 fact_text, guidance, summary, created_at`,
      [
        owner.workspaceId,
        owner.authUserId,
        target.opportunityId,
        input.stage,
        target.title,
        question.prompt,
        fact.text,
        VOICE_NO_RECORDING_SUMMARY,
      ],
    );
    return this.sessionView(inserted.rows[0]);
  }

  /**
   * Stores one recorded take and spends its length.
   *
   * The length is measured here from the audio container (see
   * `audio-duration.ts`); a file whose length cannot be established is
   * refused before anything is charged or stored. Seconds are taken from the
   * minute pool (included, then packs) with the existing remainder rule, so
   * the balance drops by exactly the measured seconds. If fewer seconds
   * remain than were recorded, only the remaining seconds are charged and the
   * take is marked truncated.
   *
   * After the spend is committed the audio is offered to the transcription
   * seam. When no provider is connected, or it fails, the take stays saved
   * with a pending transcript that the person types; nothing extra is charged
   * either way, because transcription is included in the recorded time.
   */
  async record(
    owner: ProfileOwner,
    sessionId: string,
    upload: VoiceAudioUpload,
    idempotencyKey: string | undefined,
  ): Promise<VoiceRecordResult> {
    const key = idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 200) throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    const contentType = voiceAudioContentType(upload.contentType);
    if (!contentType) throw new BillingError('validation_error', { field: 'audio', reason: 'unsupported_type' });
    const body = upload.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BillingError('validation_error', { field: 'audio', reason: 'empty' });
    if (body.length > VOICE_UPLOAD_MAX_BYTES) {
      throw new BillingError('validation_error', { field: 'audio', reason: 'too_large', limit: VOICE_UPLOAD_MAX_BYTES });
    }
    if (detectAudioContainer(body) !== CONTAINER_FOR_TYPE[contentType]) {
      throw new BillingError('validation_error', { field: 'audio', reason: 'type_mismatch' });
    }
    const measured = measureAudioDuration(body);
    const recordedSeconds = measured ? voiceRecordingSeconds(measured.milliseconds) : 0;
    if (!measured || recordedSeconds < 1) {
      throw new BillingError('validation_error', { field: 'audio', reason: 'duration_unreadable' });
    }
    if (recordedSeconds > MAX_VOICE_RECORD_SECONDS) {
      throw new BillingError('validation_error', { field: 'audio', reason: 'too_long', limit: MAX_VOICE_RECORD_SECONDS });
    }
    const language = upload.language?.trim().toLowerCase() || 'en';
    if (language !== 'en' && language !== 'fr') throw new BillingError('validation_error', { field: 'language', reason: 'invalid' });
    if (!UUID.test(sessionId)) throw new BillingError('not_found');

    const sha256 = createHash('sha256').update(body).digest('hex');
    const fingerprint = fingerprintRequest({ kind: 'voice.record.audio', sessionId, sha256, contentType });
    const objectKey = `voice/${owner.workspaceId}/${personKey(owner.authUserId)}/${sessionId}/${randomUUID()}.${EXTENSION_FOR_TYPE[contentType]}`;

    // Queued before the file is written: if anything below fails and its own
    // cleanup fails too, the storage sweeper or an account deletion removes it.
    const queuedAt = this.clock.now();
    await this.pool.query(
      `INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, created_at, not_before) VALUES ($1, $2, $3, $4)`,
      [objectKey, owner.authUserId, queuedAt, new Date(queuedAt.getTime() + IN_PROGRESS_MS)],
    );
    let uploaded = false;
    let outcome: VoiceRecordResult & { audioRowId: string | null };
    try {
      outcome = await withTransaction(this.pool, async (db) => {
        const account = await lockAccount(db, owner.billingAccountId);
        const snapshot = await this.catalogs.get(db, account.catalog_version);
        await requireFeature(db, snapshot, 'voiceMinutes');
        const session = await this.owned(owner, sessionId, db);
        if (!(await this.hasConsent(owner, db))) {
          throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
        }
        const prior = await db.query<AudioRow>(
          `SELECT ${AUDIO_COLUMNS} FROM voice_audio_records
            WHERE billing_account_id = $1 AND idempotency_key = $2
            FOR UPDATE`,
          [account.id, key],
        );
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== fingerprint || prior.rows[0].session_id !== session.id) {
            throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
          }
          return {
            session: await this.sessionView(session, db),
            billedSeconds: prior.rows[0].duration_seconds,
            truncated: prior.rows[0].truncated,
            remainingSeconds: (await this.balanceFrom(db, account.id, account.allowance_period_start, snapshot, account.plan_id)).remainingSeconds,
            replayed: true,
            transcription: 'not_attempted' as const,
            audioRowId: null,
          };
        }
        const existing = await db.query<{ id: string }>(`SELECT id FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`, [session.id]);
        if (existing.rows[0]) throw new BillingError('validation_error', { field: 'recording', reason: 'already_recorded' });
        // Held until commit: an account deletion that starts now waits, and one already started refuses this.
        await requireLivePerson(db, owner.authUserId);

        const pools = await this.pools(db, account.id, account.allowance_period_start, snapshot, account.plan_id);
        if (!pools.planIncludesVoice) {
          throw new BillingError('plan_upgrade_required', { feature: 'voiceMinutes', minimumPlan: pools.minimumPlan });
        }
        const spend = applyVoiceSeconds({
          includedMinutes: pools.includedMinutes,
          packMinutes: pools.packMinutes,
          remainderSeconds: pools.remainderSeconds,
          recordedSeconds,
        });
        if (!spend) {
          throw new BillingError('quota_exhausted', {
            unit: 'voice_minute',
            remaining: 0,
            renewalDate: account.allowance_period_end,
          });
        }
        const now = this.clock.now();
        for (let minute = 0; minute < spend.minutesToDebit; minute += 1) {
          const reserved = await reserve(
            db,
            {
              billingAccountId: account.id,
              unit: 'voice_minute',
              quantity: 1,
              idempotencyKey: `${key}:${minute}`,
              requestFingerprint: fingerprint,
              requestId: randomUUID(),
              candidateAuthUserId: null,
            },
            (version) => this.catalogs.get(db, version),
            now,
          );
          await commit(db, account.id, reserved.ledger.id, now);
        }

        // Locked until commit, so the sweeper never claims this upload while it is in progress.
        await db.query(`SELECT 1 FROM stored_object_intents WHERE object_key = $1 FOR UPDATE`, [objectKey]);
        await this.storage.put(objectKey, body, contentType);
        uploaded = true;
        const pendingFeedback: InterviewFeedback = { relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' };
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO voice_audio_records
             (session_id, billing_account_id, idempotency_key, request_fingerprint, duration_seconds,
              requested_seconds, truncated, transcript, transcript_source, feedback,
              audio_object_key, audio_content_type, audio_size_bytes, measured_milliseconds, duration_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, '', 'pending', $8::jsonb, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            session.id,
            account.id,
            key,
            fingerprint,
            spend.billedSeconds,
            recordedSeconds,
            spend.truncated,
            JSON.stringify(pendingFeedback),
            objectKey,
            contentType,
            body.length,
            Math.max(1, Math.round(measured.milliseconds)),
            measured.source,
          ],
        );
        // The object is now owned by a row. The queue entry stays, never due,
        // so an account deletion (which deletes every queued key of the
        // person) also removes the audio; "Remove recording" drops it.
        await db.query(`UPDATE stored_object_intents SET not_before = 'infinity' WHERE object_key = $1`, [objectKey]);
        await db.query(
          `INSERT INTO voice_meter_remainders (billing_account_id, allowance_period_start, remainder_seconds)
           VALUES ($1, $2, $3)
           ON CONFLICT (billing_account_id, allowance_period_start)
           DO UPDATE SET remainder_seconds = EXCLUDED.remainder_seconds`,
          [account.id, account.allowance_period_start, spend.remainderSeconds],
        );
        const summary = voicePendingSummary(spend.billedSeconds);
        await db.query(`UPDATE voice_interview_sessions SET summary = $2, updated_at = $3 WHERE id = $1`, [session.id, summary, now]);
        session.summary = summary;
        return {
          session: await this.sessionView(session, db),
          billedSeconds: spend.billedSeconds,
          truncated: spend.truncated,
          remainingSeconds: spend.remainingSeconds,
          replayed: false,
          transcription: 'not_attempted' as const,
          audioRowId: inserted.rows[0].id,
        };
      });
    } catch (error) {
      await this.forget(objectKey, uploaded);
      throw error;
    }
    const { audioRowId, ...result } = outcome;
    if (result.replayed || audioRowId === null) {
      // Nothing new was written; the queued key belongs to no row.
      await this.forget(objectKey, false);
      return result;
    }

    const transcription = await this.autoTranscribe(owner, sessionId, audioRowId, body, contentType, language);
    if (transcription.outcome !== 'transcribed') return { ...result, transcription: transcription.outcome };
    return { ...result, session: transcription.session ?? result.session, transcription: 'transcribed' };
  }

  /**
   * Asks the transcription seam again for a session the caller owns.
   * Automatic transcription happens on upload, while the audio is in memory;
   * object storage here is write-and-link only, so this retry passes the
   * request shape alone. With no provider connected it is
   * `provider_unavailable`; no text is ever invented.
   */
  async transcribe(
    owner: ProfileOwner,
    sessionId: string,
    input: { language?: string; mimeType?: string | null; byteLength?: number },
  ): Promise<SpeechTranscribeResult> {
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      if (!(await this.hasConsent(owner, db))) {
        throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
      }
      const request = transcriptionRequest(input);
      if (!request) throw new BillingError('validation_error', { field: 'language', reason: 'invalid' });
      await this.owned(owner, sessionId, db);
      // This check-only endpoint carries no recording, so an adapter gets no
      // bytes and must refuse rather than return text. Real transcription
      // happens on upload (`record`), which passes the stored audio.
      return this.transcriber.transcribe({ ...request, audio: Buffer.alloc(0) });
    });
  }

  /**
   * The person types or corrects the transcript. Feedback and the session
   * summary are recomputed from the new words and saved; no time is spent.
   */
  async correctTranscript(owner: ProfileOwner, sessionId: string, transcript: string): Promise<VoiceSessionView> {
    const text = typeof transcript === 'string' ? transcript.trim() : '';
    if (text.length === 0 || text.length > MAX_TEXT) {
      throw new BillingError('validation_error', { field: 'transcript', reason: 'invalid' });
    }
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      const session = await this.owned(owner, sessionId, db);
      const audio = await db.query<AudioRow>(`SELECT ${AUDIO_COLUMNS} FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`, [session.id]);
      const row = audio.rows[0];
      if (!row) throw new BillingError('not_found');
      await this.saveTranscript(db, session, row.id, row.duration_seconds, text, 'typed');
      return this.sessionView(session, db);
    });
  }

  /**
   * Deletes the stored audio for good and keeps the transcript, feedback and
   * summary. The file goes first: if storage refuses, nothing is marked and
   * the request can be retried. Repeating it after success is harmless.
   */
  async deleteAudio(owner: ProfileOwner, sessionId: string): Promise<VoiceSessionView> {
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      const session = await this.owned(owner, sessionId, db);
      const audio = await db.query<AudioRow>(`SELECT ${AUDIO_COLUMNS} FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`, [session.id]);
      const row = audio.rows[0];
      if (!row) throw new BillingError('not_found');
      if (row.audio_object_key) {
        await this.storage.delete(row.audio_object_key);
        await db.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [row.audio_object_key]);
      }
      await db.query(
        `UPDATE voice_audio_records
            SET audio_object_key = NULL, audio_deleted_at = COALESCE(audio_deleted_at, $2)
          WHERE id = $1`,
        [row.id, this.clock.now()],
      );
      return this.sessionView(session, db);
    });
  }

  /** A five-minute playback link for the caller's own stored take. Free; works over the voice allowance. */
  async audioLink(owner: ProfileOwner, sessionId: string): Promise<{ url: string; expiresAt: string; contentType: string }> {
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      const session = await this.owned(owner, sessionId, db);
      const audio = await db.query<AudioRow>(`SELECT ${AUDIO_COLUMNS} FROM voice_audio_records WHERE session_id = $1`, [session.id]);
      const row = audio.rows[0];
      if (!row?.audio_object_key) throw new BillingError('not_found', { resource: 'voice_audio' });
      const contentType = voiceAudioContentType(row.audio_content_type) ?? 'audio/webm';
      const expiresAt = new Date(this.clock.now().getTime() + VOICE_AUDIO_LINK_TTL_MS);
      const url = await this.storage.signedUrl(row.audio_object_key, expiresAt, {
        fileName: `practice-recording.${EXTENSION_FOR_TYPE[contentType]}`,
        contentType,
      });
      return { url, expiresAt: expiresAt.toISOString(), contentType };
    });
  }

  private async autoTranscribe(
    owner: ProfileOwner,
    sessionId: string,
    audioRowId: string,
    audio: Buffer,
    contentType: VoiceAudioContentType,
    language: 'en' | 'fr',
  ): Promise<{ outcome: Exclude<VoiceTranscriptionOutcome, 'not_attempted'>; session?: VoiceSessionView }> {
    const mimeType = (TRANSCRIPTION_MIME_TYPES as readonly string[]).includes(contentType) ? contentType : null;
    const request: VoiceTranscriptionRequest = { language, mimeType, byteLength: audio.length, audio };
    let text: string;
    try {
      text = (await this.transcriber.transcribe(request)).text.trim();
    } catch (error) {
      return { outcome: isBillingError(error, 'provider_unavailable') ? 'unavailable' : 'failed' };
    }
    if (text.length === 0) return { outcome: 'failed' };
    const clipped = text.slice(0, MAX_TEXT);
    try {
      const session = await withTransaction(this.pool, async (db) => {
        const owned = await this.owned(owner, sessionId, db);
        const row = await db.query<AudioRow>(`SELECT ${AUDIO_COLUMNS} FROM voice_audio_records WHERE id = $1 FOR UPDATE`, [audioRowId]);
        // The person may have typed their own words meanwhile; theirs win.
        if (!row.rows[0] || row.rows[0].transcript_source !== 'pending') return this.sessionView(owned, db);
        await this.saveTranscript(db, owned, audioRowId, row.rows[0].duration_seconds, clipped, 'transcribed');
        return this.sessionView(owned, db);
      });
      return { outcome: 'transcribed', session };
    } catch {
      return { outcome: 'failed' };
    }
  }

  /** Saves words, their content feedback and the session summary together. The summary infers nothing about the speaker. */
  private async saveTranscript(
    db: Db,
    session: SessionRow,
    audioRowId: string,
    seconds: number,
    text: string,
    source: 'typed' | 'transcribed',
  ): Promise<void> {
    const judged = voiceSessionSummary(seconds, text, session.fact_text);
    await db.query(`UPDATE voice_audio_records SET transcript = $2, transcript_source = $3, feedback = $4::jsonb WHERE id = $1`, [
      audioRowId,
      text,
      source,
      JSON.stringify(judged.feedback),
    ]);
    await db.query(`UPDATE voice_interview_sessions SET summary = $2, updated_at = $3 WHERE id = $1`, [
      session.id,
      judged.summary,
      this.clock.now(),
    ]);
    session.summary = judged.summary;
  }

  /** After a failed upload: delete the object if it was written, and drop the queue row only once that worked. */
  private async forget(key: string, written: boolean): Promise<void> {
    try {
      if (written) await this.storage.delete(key);
      await this.pool.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [key]);
    } catch {
      // The upload is over, so the row is due now; the sweeper or the account deletion retries.
      await this.pool
        .query(`UPDATE stored_object_intents SET not_before = $2 WHERE object_key = $1`, [key, this.clock.now()])
        .catch(() => undefined);
    }
  }

  private async assertFeature(owner: ProfileOwner, db: Pool | Db = this.pool): Promise<void> {
    const account = await readAccount(db, owner.billingAccountId);
    const snapshot = await this.catalogs.get(db, account.catalog_version);
    await requireFeature(db, snapshot, 'voiceMinutes');
  }

  private async hasConsent(owner: ProfileOwner, db: Pool | Db = this.pool): Promise<boolean> {
    const rows = await db.query(
      `SELECT 1 FROM recording_consents
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND consent_version = $3`,
      [owner.workspaceId, owner.authUserId, VOICE_CONSENT_VERSION],
    );
    return rows.rows.length > 0;
  }

  private async readBalance(owner: ProfileOwner): Promise<{
    remainingSeconds: number;
    planIncludesVoice: boolean;
    minimumPlan: string | null;
    renewalDate: string | null;
  }> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const pools = await this.pools(this.pool, account.id, account.allowance_period_start, snapshot, account.plan_id);
      return {
        remainingSeconds: pools.planIncludesVoice
          ? voiceRemainingSeconds(pools.includedMinutes, pools.packMinutes, pools.remainderSeconds)
          : 0,
        planIncludesVoice: pools.planIncludesVoice,
        minimumPlan: pools.minimumPlan,
        renewalDate: account.allowance_period_end.toISOString(),
      };
    } catch (error) {
      if (error instanceof BillingError && error.code === 'not_found') {
        return { remainingSeconds: 0, planIncludesVoice: false, minimumPlan: 'professional', renewalDate: null };
      }
      throw error;
    }
  }

  private async balanceFrom(
    db: Db,
    accountId: string,
    periodStart: Date,
    snapshot: import('../billing/catalog').CatalogSnapshot,
    planId: string,
  ): Promise<{ remainingSeconds: number }> {
    const pools = await this.pools(db, accountId, periodStart, snapshot, planId);
    return {
      remainingSeconds: voiceRemainingSeconds(pools.includedMinutes, pools.packMinutes, pools.remainderSeconds),
    };
  }

  private async pools(
    db: Db,
    accountId: string,
    periodStart: Date,
    snapshot: import('../billing/catalog').CatalogSnapshot,
    planId: string,
  ): Promise<{
    includedMinutes: number;
    packMinutes: number;
    remainderSeconds: number;
    planIncludesVoice: boolean;
    minimumPlan: string | null;
  }> {
    const plan = snapshot.planOrder.find((id) => id === planId);
    const allowance = plan ? includedFor(snapshot, plan, 'voice_minute') : null;
    const stored = await db.query<{ included_remaining: number }>(
      `SELECT included_remaining FROM usage_balances
        WHERE billing_account_id = $1 AND unit = 'voice_minute' AND allowance_period_start = $2
          AND candidate_auth_user_id IS NULL`,
      [accountId, periodStart],
    );
    const packs = await db.query<{ remaining: number }>(
      `SELECT COALESCE(SUM(remaining_units), 0)::int AS remaining FROM packs
        WHERE billing_account_id = $1 AND unit = 'voice_minute' AND status = 'active' AND expires_at > $2`,
      [accountId, this.clock.now()],
    );
    const remainder = await db.query<{ remainder_seconds: number }>(
      `SELECT remainder_seconds FROM voice_meter_remainders
        WHERE billing_account_id = $1 AND allowance_period_start = $2`,
      [accountId, periodStart],
    );
    return {
      includedMinutes: allowance === null ? 0 : (stored.rows[0]?.included_remaining ?? allowance),
      packMinutes: allowance === null ? 0 : packs.rows[0].remaining,
      remainderSeconds: remainder.rows[0]?.remainder_seconds ?? 0,
      planIncludesVoice: allowance !== null,
      minimumPlan: minimumPlanFor(snapshot, 'voice_minute'),
    };
  }

  /** A shared listing, or a pasted one the caller owns; anyone else's pasted listing looks missing. */
  private async listing(owner: ProfileOwner, opportunityId: string): Promise<{ opportunityId: string; title: string }> {
    const rows = await this.pool.query<{ title: string }>(
      `SELECT r.title
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1
          AND (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $2)`,
      [opportunityId, owner.authUserId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    return { opportunityId, title: row.title };
  }

  private async confirmedLines(owner: ProfileOwner): Promise<Array<{ id: string; text: string }>> {
    const rows = await this.pool.query<{ id: string; fact_type: string; value: unknown; confirmation: string }>(
      `SELECT id, fact_type, value, confirmation FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const lines: Array<{ id: string; text: string }> = [];
    for (const row of rows.rows) {
      if (row.confirmation !== 'confirmed' || !isFactType(row.fact_type) || !isRecord(row.value)) continue;
      const fact: ResumeFactInput = {
        id: row.id,
        factType: row.fact_type,
        value: row.value,
        confirmation: 'confirmed',
        uncertain: {},
      };
      const text = factLineText(fact.factType, fact.value);
      if (text.length > 0) lines.push({ id: row.id, text });
    }
    return lines;
  }

  private async owned(owner: ProfileOwner, sessionId: string, db: Db): Promise<SessionRow> {
    if (!UUID.test(sessionId)) throw new BillingError('not_found');
    const rows = await db.query<SessionRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
              fact_text, guidance, summary, created_at
         FROM voice_interview_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async sessionView(row: SessionRow, db: Db = this.pool): Promise<VoiceSessionView> {
    const audio = await db.query<AudioRow>(`SELECT ${AUDIO_COLUMNS} FROM voice_audio_records WHERE session_id = $1`, [row.id]);
    const kind = row.kind === 'negotiation' ? 'negotiation' : 'practice';
    const stage = row.stage && isInterviewStage(row.stage) ? row.stage : null;
    return {
      id: row.id,
      kind,
      title: row.title,
      prompt: row.prompt,
      guidance: row.guidance,
      summary: row.summary,
      opportunityId: row.opportunity_id,
      stage,
      recording: audio.rows[0] ? recordingView(audio.rows[0]) : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}

function recordingView(row: AudioRow): VoiceRecordingView {
  const transcriptSource = row.transcript_source === 'transcribed' ? 'transcribed' : row.transcript_source === 'pending' ? 'pending' : 'typed';
  return {
    id: row.id,
    durationSeconds: row.duration_seconds,
    requestedSeconds: row.requested_seconds,
    truncated: row.truncated,
    transcript: row.transcript,
    transcriptSource,
    feedback: transcriptSource === 'pending' ? null : feedbackOf(row.feedback),
    audioStored: row.audio_object_key !== null,
    audioDeleted: row.audio_deleted_at !== null,
  };
}

function feedbackOf(value: unknown): InterviewFeedback {
  const empty: InterviewFeedback = { relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' };
  if (!isRecord(value)) return empty;
  const relevance = value.relevance === 'grounded' || value.relevance === 'partial' || value.relevance === 'missing' ? value.relevance : empty.relevance;
  const structure = value.structure === 'clear' || value.structure === 'thin' ? value.structure : empty.structure;
  const specificity = value.specificity === 'specific' || value.specificity === 'general' ? value.specificity : empty.specificity;
  const evidence = value.evidence === 'cited' || value.evidence === 'unstated' ? value.evidence : empty.evidence;
  return { relevance, structure, specificity, evidence };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
