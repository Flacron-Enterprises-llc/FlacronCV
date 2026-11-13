import { MAX_VOICE_RECORD_SECONDS, VOICE_CONSENT_VERSION } from '../../../../../packages/career-shared/src/voice';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceList, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for voice practice (tested in voice.test.ts). Same typed
 * path as the website: the app records no audio and sends nothing to a
 * transcription service; the user types what they said. Wording follows the
 * website (career.voice); the copy lives in `careerInterviews.voice` and is
 * read with `t()` in the current language.
 */

export { MAX_VOICE_RECORD_SECONDS, VOICE_CONSENT_VERSION };

/**
 * The website's consent wording (career.voice.consent / consent_help), copied
 * per language into careerInterviews.voice. The constants are evaluated once at
 * import (English); screens use the keys so the current language applies.
 */
export const VOICE_CONSENT_TEXT = t('careerInterviews.voice.consent');
export const VOICE_CONSENT_HELP = t('careerInterviews.voice.consentHelp');
export const VOICE_NOT_A_SCORE = t('careerInterviews.voice.notAScore');
export const NO_MICROPHONE = t('careerInterviews.voice.noMicrophone');

/** m:ss for a number of seconds (never negative). */
export function clock(total: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function remainingLine(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return t('careerInterviews.voice.remaining', { time: clock(safe), seconds: safe });
}

/** Whole seconds between start and stop: at least 1, at most the server's limit for one take. */
export function takeSeconds(startedAt: number, stoppedAt: number): number {
  const seconds = Math.round((stoppedAt - startedAt) / 1000);
  return Math.min(MAX_VOICE_RECORD_SECONDS, Math.max(1, Number.isFinite(seconds) ? seconds : 1));
}

/** The session summary, unless it is the server's placeholder for a session without a take. */
export function savedSummary(session: VoiceSession | null): string | null {
  if (!session) return null;
  return session.summary && session.summary !== 'No recording yet.' ? session.summary : null;
}

/** Session kinds in the current language (getters, read at render time). */
export const KIND_LABEL: Record<VoiceSession['kind'], string> = {
  get practice() {
    return t('careerInterviews.voice.kind.practice');
  },
  get negotiation() {
    return t('careerInterviews.voice.kind.negotiation');
  },
};

export type VoiceGate = 'ready' | 'needs_consent' | 'no_plan' | 'no_time';

/** Why starting a session is blocked, in the order the server checks. */
export function voiceGate(list: Pick<VoiceList, 'consent' | 'planIncludesVoice' | 'remainingSeconds'>): VoiceGate {
  if (!list.consent) return 'needs_consent';
  if (!list.planIncludesVoice) return 'no_plan';
  if (list.remainingSeconds < 1) return 'no_time';
  return 'ready';
}

export const OFFER_MAX = 500;

/** Local checks for the negotiation form; the server repeats them. */
export function negotiationErrors(offer: string, salarySource: string): { offer?: string; salarySource?: string } {
  const errors: { offer?: string; salarySource?: string } = {};
  const o = offer.trim();
  if (o.length === 0) errors.offer = t('careerInterviews.voice.offerRequired');
  else if (o.length > OFFER_MAX) errors.offer = t('careerInterviews.tooLong', { max: OFFER_MAX });
  if (salarySource.trim().length > OFFER_MAX) errors.salarySource = t('careerInterviews.tooLong', { max: OFFER_MAX });
  return errors;
}

export type VoiceAction = 'load' | 'consent' | 'start' | 'record' | 'correct' | 'delete';

const FALLBACK: Record<VoiceAction, () => string> = {
  load: () => t('careerInterviews.voice.fallback.load'),
  consent: () => t('careerInterviews.voice.fallback.consent'),
  start: () => t('careerInterviews.voice.fallback.start'),
  record: () => t('careerInterviews.voice.fallback.record'),
  correct: () => t('careerInterviews.voice.fallback.correct'),
  delete: () => t('careerInterviews.voice.fallback.delete'),
};

/** Message for a refused or failed voice request. Never claims that anything was saved. */
export function voiceErrorMessage(error: unknown, action: VoiceAction): string {
  if (error instanceof ApiError) {
    const field = error.body.field;
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'feature_unavailable') {
      return t('careerInterviews.voice.errors.featureUnavailable');
    }
    if (error.code === 'plan_upgrade_required') return t('careerInterviews.voice.errors.plan');
    if (error.code === 'quota_exhausted') return t('careerInterviews.voice.errors.quota');
    if (error.code === 'provider_unavailable') return t('careerInterviews.voice.errors.provider');
    if (error.code === 'idempotency_mismatch') return t('careerInterviews.voice.errors.idempotency');
    if (error.code === 'validation_error') {
      if (field === 'consent') return t('careerInterviews.voice.errors.consent');
      if (reason === 'no_confirmed_facts') return t('careerInterviews.errors.noFacts');
      if (reason === 'already_recorded') return t('careerInterviews.voice.errors.alreadyRecorded');
      if (field === 'offer') return t('careerInterviews.voice.errors.offer');
      if (field === 'salarySource') return t('careerInterviews.voice.errors.salarySource');
      if (field === 'transcript') return t('careerInterviews.voice.errors.transcript');
      if (field === 'opportunityId') return t('careerInterviews.errors.opportunityId');
    }
  }
  return careerErrorMessage(error, FALLBACK[action]());
}
