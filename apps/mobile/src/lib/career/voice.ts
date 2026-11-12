import { MAX_VOICE_RECORD_SECONDS, VOICE_CONSENT_VERSION } from '../../../../../packages/career-shared/src/voice';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceList, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for voice practice (tested in voice.test.ts). Same typed
 * path as the website: the app records no audio and sends nothing to a
 * transcription service; the user types what they said. Wording follows the
 * website (career.voice).
 */

export { MAX_VOICE_RECORD_SECONDS, VOICE_CONSENT_VERSION };

/** The website's consent wording (career.voice.consent / consent_help). */
export const VOICE_CONSENT_TEXT = 'I agree to record this practice on my account.';
export const VOICE_CONSENT_HELP = 'Recording waits for this agreement.';
export const VOICE_NOT_A_SCORE = 'Feedback covers the words only. It does not judge emotion, honesty, or personality.';
export const NO_MICROPHONE =
  'This app does not record audio and no speech service is connected. Start the timer, practice out loud, then type the words you said. Nothing is sent to a transcription service.';

/** m:ss for a number of seconds (never negative). */
export function clock(total: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function remainingLine(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `Voice time left: ${clock(safe)} (${safe} seconds).`;
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

export const KIND_LABEL: Record<VoiceSession['kind'], string> = { practice: 'Practice', negotiation: 'Negotiation' };

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
  if (o.length === 0) errors.offer = 'Enter the offer you received.';
  else if (o.length > OFFER_MAX) errors.offer = `Keep it under ${OFFER_MAX} characters.`;
  if (salarySource.trim().length > OFFER_MAX) errors.salarySource = `Keep it under ${OFFER_MAX} characters.`;
  return errors;
}

export type VoiceAction = 'load' | 'consent' | 'start' | 'record' | 'correct' | 'delete';

const FALLBACK: Record<VoiceAction, string> = {
  load: 'Voice practice could not be loaded. Nothing was changed. Try again.',
  consent: 'Your agreement was not saved. Try again.',
  start: 'The session was not started. Try again.',
  record: 'That take was not saved. The words you typed are still here.',
  correct: 'The correction was not saved. Your words are still here.',
  delete: 'The recording was not removed. Try again.',
};

/** Message for a refused or failed voice request. Never claims that anything was saved. */
export function voiceErrorMessage(error: unknown, action: VoiceAction): string {
  if (error instanceof ApiError) {
    const field = error.body.field;
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'feature_unavailable') {
      return 'Voice practice is not open yet. It is switched off in this preview. Text practice stays available, and no credit was used.';
    }
    if (error.code === 'plan_upgrade_required') return 'Voice practice is not included in your current plan.';
    if (error.code === 'quota_exhausted') return 'No voice time left. This take was not saved.';
    if (error.code === 'provider_unavailable') return 'This needs a speech service, which is not configured. Nothing was charged.';
    if (error.code === 'idempotency_mismatch') return 'This take changed while it was being retried. Stop and save it again.';
    if (error.code === 'validation_error') {
      if (field === 'consent') return 'Agree to record this practice first.';
      if (reason === 'no_confirmed_facts') return 'Confirm at least one fact in your career profile first.';
      if (reason === 'already_recorded') return 'This session already has its take. Start a new session to practice again.';
      if (field === 'offer') return 'Enter the offer you received (up to 500 characters).';
      if (field === 'salarySource') return 'Keep the salary source under 500 characters.';
      if (field === 'transcript') return 'Type the words you said first (up to 10,000 characters).';
      if (field === 'opportunityId') return 'Pick a saved opportunity.';
    }
  }
  return careerErrorMessage(error, FALLBACK[action]);
}
