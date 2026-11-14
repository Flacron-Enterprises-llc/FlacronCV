import { VOICE_CONSENT_VERSION, VOICE_NO_RECORDING_SUMMARY } from '../../../../../packages/career-shared/src/voice';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceRecording, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for voice practice (tested in voice.test.ts). A take is a
 * real audio upload that the career API measures and bills by its length. This
 * app has no audio recording module yet, so takes are recorded on the website;
 * the app lists the sessions, lets the person type or correct a transcript
 * (free) and remove a stored recording. Copy lives in `careerInterviews.voice`.
 */

export { VOICE_CONSENT_VERSION };

/** Longest transcript the career API accepts. */
export const TRANSCRIPT_MAX = 10_000;

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

/** The session summary, unless it is the server's placeholder for a session without a take. */
export function savedSummary(session: VoiceSession | null): string | null {
  if (!session) return null;
  return session.summary && session.summary !== VOICE_NO_RECORDING_SUMMARY ? session.summary : null;
}

/** Help text under the transcript box: where the words came from decides what to say. */
export function transcriptHelpKey(source: VoiceRecording['transcriptSource']): string {
  if (source === 'pending') return 'careerInterviews.voice.pendingTranscriptHelp';
  if (source === 'transcribed') return 'careerInterviews.voice.transcribedHelp';
  return 'careerInterviews.voice.savedTranscriptHelp';
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

export type VoiceAction = 'load' | 'correct' | 'delete';

const FALLBACK: Record<VoiceAction, () => string> = {
  load: () => t('careerInterviews.voice.fallback.load'),
  correct: () => t('careerInterviews.voice.fallback.correct'),
  delete: () => t('careerInterviews.voice.fallback.delete'),
};

/** Message for a refused or failed voice request. Never claims that anything was saved. */
export function voiceErrorMessage(error: unknown, action: VoiceAction): string {
  if (error instanceof ApiError) {
    if (error.code === 'feature_unavailable') return t('careerInterviews.voice.errors.featureUnavailable');
    if (error.code === 'plan_upgrade_required') return t('careerInterviews.voice.errors.plan');
    if (error.code === 'not_found' && action !== 'load') return t('careerInterviews.voice.errors.noTake');
    if (error.code === 'validation_error' && error.body.field === 'transcript') return t('careerInterviews.voice.errors.transcript');
  }
  return careerErrorMessage(error, FALLBACK[action]());
}
