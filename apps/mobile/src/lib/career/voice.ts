import {
  MAX_VOICE_TAKE_SECONDS,
  VOICE_CONSENT_VERSION,
  VOICE_NO_RECORDING_SUMMARY,
  VOICE_UPLOAD_MAX_BYTES,
} from '../../../../../packages/career-shared/src/voice';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { InterviewStage, VoiceRecordResult, VoiceRecording, VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for voice practice (tested in voice.test.ts). A take is a
 * real audio upload (AAC in an MP4/M4A container, recorded with expo-audio)
 * that the career API measures and bills by the second. Before recording the
 * person sees the time left and this take's cap; after recording they can
 * listen and discard before anything is uploaded. Copy lives in
 * `careerInterviews.voice`.
 */

export { MAX_VOICE_TAKE_SECONDS, VOICE_CONSENT_VERSION, VOICE_UPLOAD_MAX_BYTES };

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

// ------------------------------------------------------------ recording

/**
 * The container the app records: AAC in MPEG-4 (.m4a) on Android and iOS.
 * The career server accepts `audio/mp4` and measures the length from the
 * sample tables, so the declared type must say exactly that.
 */
export const VOICE_UPLOAD_TYPE = 'audio/mp4';

/**
 * expo-audio recording options (structurally its `RecordingOptions`; kept
 * here so this module stays free of native imports). Mono speech at
 * 64 kbit/s: twenty minutes is about 9.6 MB, under the 25 MiB upload limit.
 */
export const VOICE_RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  // IOSOutputFormat.MPEG4AAC is the FourCC 'aac '; AudioQuality.HIGH is 0x60.
  ios: { outputFormat: 'aac ', audioQuality: 0x60, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
} as const;

/** Seconds this take may last: the voice time left, capped per take; never negative. */
export function takeLimitSeconds(remainingSeconds: number): number {
  const left = Number.isFinite(remainingSeconds) ? Math.max(0, Math.floor(remainingSeconds)) : 0;
  return Math.min(left, MAX_VOICE_TAKE_SECONDS);
}

/** Whole seconds from the recorder's clock (display only; the server measures the file). */
export function elapsedSeconds(durationMillis: number): number {
  return Number.isFinite(durationMillis) && durationMillis > 0 ? Math.floor(durationMillis / 1000) : 0;
}

/** True once the recorder has reached the cap it was started with. */
export function reachedLimit(durationMillis: number, limitSeconds: number): boolean {
  return limitSeconds > 0 && elapsedSeconds(durationMillis) >= limitSeconds;
}

/** The language the server should transcribe in (it supports English and French). */
export function transcriptionLanguage(locale: string): 'en' | 'fr' {
  return locale === 'fr' ? 'fr' : 'en';
}

/** Whether a practice question can be opened: consent, plan, not recording, and a listing or a role. */
export function canOpenPractice(input: {
  consented: boolean;
  planIncludesVoice: boolean;
  recording: boolean;
  opportunityId: string | null;
  role: string;
}): boolean {
  if (!input.consented || !input.planIncludesVoice || input.recording) return false;
  return input.opportunityId !== null || input.role.trim().length >= 2;
}

export type VoiceStartInput =
  | { kind: 'practice'; opportunityId: string; stage: InterviewStage }
  | { kind: 'practice'; role: string; stage: InterviewStage }
  | { kind: 'negotiation'; offer: string; salarySource: string };

/** Body for opening a practice question (a listing wins over a typed role, as on the website). */
export function practiceInput(opportunityId: string | null, role: string, stage: InterviewStage): VoiceStartInput {
  return opportunityId ? { kind: 'practice', opportunityId, stage } : { kind: 'practice', role: role.trim(), stage };
}

/** Body for opening negotiation practice; null until an offer is typed. */
export function negotiationInput(offer: string, salarySource: string): VoiceStartInput | null {
  const typed = offer.trim();
  if (typed.length === 0) return null;
  return { kind: 'negotiation', offer: typed, salarySource: salarySource.trim() };
}

/** Notes shown after an action. Each one says what happened to time and to the take. */
export type VoiceNote =
  | 'upgrade'
  | 'quota'
  | 'actionFailed'
  | 'startFailed'
  | 'saveFailed'
  | 'aiDeclined'
  | 'unreadable'
  | 'tooLarge'
  | 'truncated'
  | 'deleted'
  | 'corrected'
  | 'withdrawn'
  | 'transcribed'
  | 'transcriptionUnavailable'
  | 'transcriptionFailed'
  | 'noFacts'
  | 'switchedOff'
  | 'playFailed'
  | 'backgroundStopped';

const NOTE_KEY: Record<VoiceNote, string> = {
  upgrade: 'careerInterviews.voice.errors.plan',
  quota: 'careerInterviews.voice.quotaBody',
  actionFailed: 'careerInterviews.voice.actionFailed',
  startFailed: 'careerInterviews.voice.startFailed',
  saveFailed: 'careerInterviews.voice.saveFailedBody',
  aiDeclined: 'common.aiConsent.declined',
  unreadable: 'careerInterviews.voice.audioUnreadable',
  tooLarge: 'careerInterviews.voice.audioTooLarge',
  truncated: 'careerInterviews.voice.truncated',
  deleted: 'careerInterviews.voice.audioDeleted',
  corrected: 'careerInterviews.voice.correctionSaved',
  withdrawn: 'careerInterviews.voice.consentWithdrawn',
  transcribed: 'careerInterviews.voice.transcribed',
  transcriptionUnavailable: 'careerInterviews.voice.transcriptionUnavailable',
  transcriptionFailed: 'careerInterviews.voice.transcriptionFailed',
  noFacts: 'careerInterviews.voice.noFacts',
  switchedOff: 'careerInterviews.voice.errors.featureUnavailable',
  playFailed: 'careerInterviews.voice.playFailed',
  backgroundStopped: 'careerInterviews.voice.backgroundStopped',
};

const INFO_NOTES = new Set<VoiceNote>(['deleted', 'corrected', 'withdrawn', 'transcribed', 'transcriptionUnavailable', 'backgroundStopped']);

export function voiceNote(note: VoiceNote): { text: string; tone: 'info' | 'warning' } {
  return { text: t(NOTE_KEY[note]), tone: INFO_NOTES.has(note) ? 'info' : 'warning' };
}

/** Opening a question failed: plan, allowance, no confirmed facts, switched off, or anything else. */
export function startErrorNote(error: unknown): VoiceNote {
  if (error instanceof ApiError) {
    if (error.code === 'plan_upgrade_required') return 'upgrade';
    if (error.code === 'quota_exhausted') return 'quota';
    if (error.code === 'feature_unavailable') return 'switchedOff';
    if (error.code === 'validation_error' && error.body.field === 'facts') return 'noFacts';
  }
  return 'startFailed';
}

/** Uploading a take failed. The take stays on the device so it can be saved again. */
export function recordErrorNote(error: unknown): VoiceNote {
  if (error instanceof ApiError) {
    if (error.code === 'ai_consent_declined') return 'aiDeclined';
    if (error.code === 'quota_exhausted') return 'quota';
    if (error.code === 'plan_upgrade_required') return 'upgrade';
    if (error.code === 'feature_unavailable') return 'switchedOff';
    if (error.code === 'validation_error') {
      const reason = error.body.reason;
      return reason === 'too_large' || reason === 'too_long' ? 'tooLarge' : 'unreadable';
    }
  }
  return 'saveFailed';
}

/** What to tell the person after a take was saved: truncation first, then transcription. */
export function recordResultNote(result: Pick<VoiceRecordResult, 'truncated' | 'transcription'>): VoiceNote | null {
  if (result.truncated) return 'truncated';
  if (result.transcription === 'transcribed') return 'transcribed';
  if (result.transcription === 'failed') return 'transcriptionFailed';
  if (result.transcription === 'unavailable') return 'transcriptionUnavailable';
  return null;
}

/** A take bigger than the server accepts is refused here, before anything is sent or billed. */
export function takeTooLarge(bytes: number): boolean {
  return bytes > VOICE_UPLOAD_MAX_BYTES;
}

/** A changed session replaces itself in place (the list does not jump); a new one goes on top. */
export function upsertSession(items: readonly VoiceSession[], next: VoiceSession): VoiceSession[] {
  return items.some((item) => item.id === next.id) ? items.map((item) => (item.id === next.id ? next : item)) : [next, ...items];
}
