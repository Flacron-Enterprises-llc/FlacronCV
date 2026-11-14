import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  applyVoiceSeconds,
  factLineText,
  interviewQuestions,
  isFactType,
  isInterviewStage,
  negotiationGuidance,
  transcriptionRequest,
  voiceRemainingSeconds,
  voiceSessionSummary,
  VOICE_CONSENT_VERSION,
  MAX_VOICE_RECORD_SECONDS,
} from '@flacroncv/career-shared';
import type { InterviewFeedback, InterviewStage, ResumeFactInput } from '@flacroncv/career-shared';
import { lockAccount, readAccount } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore, includedFor, minimumPlanFor } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { commit, reserve } from '../billing/entitlements';
import { BillingError } from '../billing/errors';
import { fingerprintRequest } from '../billing/fingerprint';
import { UnconfiguredSpeechTranscriber } from '../ai/speech-transcriber';
import type { SpeechTranscribeResult, SpeechTranscriber } from '../ai/speech-transcriber';
import { requireFeature } from '../metering/access';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 10_000;
const MAX_OFFER = 500;

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
  feedback: unknown;
  audio_deleted_at: Date | null;
  request_fingerprint: string;
}

export interface VoiceRecordingView {
  id: string;
  durationSeconds: number;
  requestedSeconds: number;
  truncated: boolean;
  transcript: string;
  feedback: InterviewFeedback;
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
}

export interface VoiceRecordResult {
  session: VoiceSessionView;
  billedSeconds: number;
  truncated: boolean;
  remainingSeconds: number;
  replayed: boolean;
}

/**
 * Spoken practice. Starting a session does not spend time.
 * Stopping the timer spends the recorded seconds. Transcription text is
 * included in that same spend. Deleting the recording keeps the summary.
 */
export class VoiceInterviewService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
    private readonly transcriber: SpeechTranscriber = new UnconfiguredSpeechTranscriber(),
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

  async start(
    owner: ProfileOwner,
    input: { kind?: string; opportunityId?: string; stage?: string; offer?: string; salarySource?: string },
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
         VALUES ($1, $2, 'negotiation', 'Negotiation', $3, $4, $3, 'No recording yet.')
         RETURNING id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
                   fact_text, guidance, summary, created_at`,
        [owner.workspaceId, owner.authUserId, guidance, `${offer}\n${salarySource}`],
      );
      return this.sessionView(inserted.rows[0]);
    }

    if (!input.opportunityId || !UUID.test(input.opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    if (!input.stage || !isInterviewStage(input.stage)) {
      throw new BillingError('validation_error', { field: 'stage', reason: 'invalid' });
    }
    const listing = await this.listing(owner, input.opportunityId);
    const facts = await this.confirmedLines(owner);
    if (facts.length === 0) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const questions = interviewQuestions({ title: listing.title, stage: input.stage, facts });
    const question = questions?.[0];
    if (!question) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const fact = facts.find((item) => item.id === question.factId) ?? facts[0];
    const inserted = await this.pool.query<SessionRow>(
      `INSERT INTO voice_interview_sessions
         (workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt, fact_text, summary)
       VALUES ($1, $2, 'practice', $3, $4, $5, $6, $7, 'No recording yet.')
       RETURNING id, workspace_id, candidate_auth_user_id, kind, opportunity_id, stage, title, prompt,
                 fact_text, guidance, summary, created_at`,
      [owner.workspaceId, owner.authUserId, listing.opportunityId, input.stage, listing.title, question.prompt, fact.text],
    );
    return this.sessionView(inserted.rows[0]);
  }

  async record(
    owner: ProfileOwner,
    sessionId: string,
    input: { durationSeconds?: number; transcript?: string },
    idempotencyKey: string | undefined,
  ): Promise<VoiceRecordResult> {
    const key = idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 200) throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    const transcript = input.transcript?.trim() ?? '';
    const requested = input.durationSeconds;
    if (!Number.isInteger(requested) || requested === undefined || requested < 1 || requested > MAX_VOICE_RECORD_SECONDS) {
      throw new BillingError('validation_error', { field: 'durationSeconds', reason: 'invalid' });
    }
    if (transcript.length === 0 || transcript.length > MAX_TEXT) {
      throw new BillingError('validation_error', { field: 'transcript', reason: 'invalid' });
    }
    const fingerprint = fingerprintRequest({ kind: 'voice.record', sessionId, durationSeconds: requested, transcript });

    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, owner.billingAccountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      await requireFeature(db, snapshot, 'voiceMinutes');
      const session = await this.owned(owner, sessionId, db);
      if (!(await this.hasConsent(owner, db))) {
        throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
      }
      const prior = await db.query<AudioRow & { idempotency_key: string }>(
        `SELECT id, session_id, duration_seconds, requested_seconds, truncated, transcript, feedback,
                audio_deleted_at, request_fingerprint, idempotency_key
           FROM voice_audio_records
          WHERE billing_account_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [account.id, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_fingerprint !== fingerprint) {
          throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
        }
        const view = await this.sessionView(session, db);
        return {
          session: view,
          billedSeconds: prior.rows[0].duration_seconds,
          truncated: prior.rows[0].truncated,
          remainingSeconds: (await this.balanceFrom(db, account.id, account.allowance_period_start, snapshot, account.plan_id)).remainingSeconds,
          replayed: true,
        };
      }
      const existing = await db.query<{ id: string }>(`SELECT id FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`, [session.id]);
      if (existing.rows[0]) throw new BillingError('validation_error', { field: 'recording', reason: 'already_recorded' });

      const pools = await this.pools(db, account.id, account.allowance_period_start, snapshot, account.plan_id);
      if (!pools.planIncludesVoice) {
        throw new BillingError('plan_upgrade_required', { feature: 'voiceMinutes', minimumPlan: pools.minimumPlan });
      }
      const spend = applyVoiceSeconds({
        includedMinutes: pools.includedMinutes,
        packMinutes: pools.packMinutes,
        remainderSeconds: pools.remainderSeconds,
        recordedSeconds: requested,
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
      const judged = voiceSessionSummary(spend.billedSeconds, transcript, session.fact_text);
      await db.query(
        `INSERT INTO voice_audio_records
           (session_id, billing_account_id, idempotency_key, request_fingerprint, duration_seconds,
            requested_seconds, truncated, transcript, feedback)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          session.id,
          account.id,
          key,
          fingerprint,
          spend.billedSeconds,
          requested,
          spend.truncated,
          transcript,
          JSON.stringify(judged.feedback),
        ],
      );
      await db.query(
        `INSERT INTO voice_meter_remainders (billing_account_id, allowance_period_start, remainder_seconds)
         VALUES ($1, $2, $3)
         ON CONFLICT (billing_account_id, allowance_period_start)
         DO UPDATE SET remainder_seconds = EXCLUDED.remainder_seconds`,
        [account.id, account.allowance_period_start, spend.remainderSeconds],
      );
      await db.query(`UPDATE voice_interview_sessions SET summary = $2, updated_at = $3 WHERE id = $1`, [
        session.id,
        judged.summary,
        now,
      ]);
      session.summary = judged.summary;
      return {
        session: await this.sessionView(session, db),
        billedSeconds: spend.billedSeconds,
        truncated: spend.truncated,
        remainingSeconds: spend.remainingSeconds,
        replayed: false,
      };
    });
  }

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
      return this.transcriber.transcribe(request);
    });
  }

  async correctTranscript(owner: ProfileOwner, sessionId: string, transcript: string): Promise<VoiceSessionView> {
    const text = transcript.trim();
    if (text.length === 0 || text.length > MAX_TEXT) {
      throw new BillingError('validation_error', { field: 'transcript', reason: 'invalid' });
    }
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      const session = await this.owned(owner, sessionId, db);
      const audio = await db.query<AudioRow>(
        `SELECT id, session_id, duration_seconds, requested_seconds, truncated, transcript, feedback, audio_deleted_at, request_fingerprint
           FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`,
        [session.id],
      );
      const row = audio.rows[0];
      if (!row) throw new BillingError('not_found');
      const judged = voiceSessionSummary(row.duration_seconds, text, session.fact_text);
      await db.query(`UPDATE voice_audio_records SET transcript = $2, feedback = $3::jsonb WHERE id = $1`, [
        row.id,
        text,
        JSON.stringify(judged.feedback),
      ]);
      return this.sessionView(session, db);
    });
  }

  async deleteAudio(owner: ProfileOwner, sessionId: string): Promise<VoiceSessionView> {
    return withTransaction(this.pool, async (db) => {
      await this.assertFeature(owner, db);
      const session = await this.owned(owner, sessionId, db);
      const audio = await db.query<{ id: string }>(`SELECT id FROM voice_audio_records WHERE session_id = $1 FOR UPDATE`, [session.id]);
      if (!audio.rows[0]) throw new BillingError('not_found');
      await db.query(`UPDATE voice_audio_records SET audio_deleted_at = $2 WHERE id = $1 AND audio_deleted_at IS NULL`, [
        audio.rows[0].id,
        this.clock.now(),
      ]);
      return this.sessionView(session, db);
    });
  }

  private async assertFeature(owner: ProfileOwner, db: Pool | import('../billing/db').Db = this.pool): Promise<void> {
    const account = await readAccount(db, owner.billingAccountId);
    const snapshot = await this.catalogs.get(db, account.catalog_version);
    await requireFeature(db, snapshot, 'voiceMinutes');
  }

  private async hasConsent(owner: ProfileOwner, db: Pool | import('../billing/db').Db = this.pool): Promise<boolean> {
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
    db: import('../billing/db').Db,
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
    db: import('../billing/db').Db,
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

  private async listing(owner: ProfileOwner, opportunityId: string): Promise<{ opportunityId: string; title: string }> {
    const rows = await this.pool.query<{ title: string; candidate_auth_user_id: string | null }>(
      `SELECT r.title, o.candidate_auth_user_id
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.candidate_auth_user_id !== null && row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
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

  private async owned(owner: ProfileOwner, sessionId: string, db: import('../billing/db').Db): Promise<SessionRow> {
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

  private async sessionView(row: SessionRow, db: import('../billing/db').Db = this.pool): Promise<VoiceSessionView> {
    const audio = await db.query<AudioRow>(
      `SELECT id, session_id, duration_seconds, requested_seconds, truncated, transcript, feedback, audio_deleted_at, request_fingerprint
         FROM voice_audio_records WHERE session_id = $1`,
      [row.id],
    );
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
  return {
    id: row.id,
    durationSeconds: row.duration_seconds,
    requestedSeconds: row.requested_seconds,
    truncated: row.truncated,
    transcript: row.transcript,
    feedback: feedbackOf(row.feedback),
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
