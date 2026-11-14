import { interviewFeedback } from './interview';
import type { InterviewFeedback } from './interview';

export const VOICE_CONSENT_VERSION = 'voice-recording-1';
export const MAX_VOICE_RECORD_SECONDS = 7200;
/** The recorder stops itself after this long, so one take stays well under the upload limit. */
export const MAX_VOICE_TAKE_SECONDS = 1200;
/** Containers browsers' MediaRecorder writes: WebM/Ogg Opus (Chrome, Edge, Firefox) and MP4 (Safari). */
export const VOICE_AUDIO_CONTENT_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'] as const;
export type VoiceAudioContentType = (typeof VOICE_AUDIO_CONTENT_TYPES)[number];
/** 25 MiB: twenty minutes of MediaRecorder Opus is a few MiB, so this only stops abuse. */
export const VOICE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
/** Summary text before any transcript exists (no feedback yet, nothing inferred). */
export const VOICE_NO_RECORDING_SUMMARY = 'No recording yet.';

/** `audio/webm;codecs=opus` → `audio/webm`; null for anything not in {@link VOICE_AUDIO_CONTENT_TYPES}. */
export function voiceAudioContentType(header: string | null | undefined): VoiceAudioContentType | null {
  const base = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return (VOICE_AUDIO_CONTENT_TYPES as readonly string[]).includes(base) ? (base as VoiceAudioContentType) : null;
}

/** Whole seconds billed for a measured length: rounded to the nearest second, never below one. */
export function voiceRecordingSeconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.max(1, Math.round(milliseconds / 1000));
}

/** The summary of a take whose transcript has not been typed or transcribed yet. */
export function voicePendingSummary(seconds: number): string {
  return `Recorded ${seconds} seconds. Add the transcript to get feedback.`;
}

const FORBIDDEN = /\b(emotion|honesty|honest|personality|nervous|confident|guaranteed|fraud)\b/i;

export interface VoiceSpend {
  billedSeconds: number;
  truncated: boolean;
  minutesToDebit: number;
  remainderSeconds: number;
  remainingSeconds: number;
}

/** Seconds still available. A remainder is time already practiced that has not filled another minute. */
export function voiceRemainingSeconds(includedMinutes: number, packMinutes: number, remainderSeconds: number): number {
  const pool = Math.max(0, Math.floor(includedMinutes)) + Math.max(0, Math.floor(packMinutes));
  const remainder = normalizeRemainder(remainderSeconds);
  return Math.max(0, pool * 60 - remainder);
}

/**
 * Apply a recorded duration to the minute pool.
 * 90 seconds spends 1 minute and leaves a 30-second remainder, so the balance drops by 90 seconds.
 * Returns null when no second remains.
 */
export function applyVoiceSeconds(input: {
  includedMinutes: number;
  packMinutes: number;
  remainderSeconds: number;
  recordedSeconds: number;
}): VoiceSpend | null {
  if (!Number.isInteger(input.recordedSeconds) || input.recordedSeconds < 1) return null;
  const remainder = normalizeRemainder(input.remainderSeconds);
  const available = voiceRemainingSeconds(input.includedMinutes, input.packMinutes, remainder);
  if (available < 1) return null;
  const billedSeconds = Math.min(input.recordedSeconds, available);
  const combined = remainder + billedSeconds;
  const included = Math.max(0, Math.floor(input.includedMinutes));
  const pack = Math.max(0, Math.floor(input.packMinutes));
  return {
    billedSeconds,
    truncated: billedSeconds < input.recordedSeconds,
    minutesToDebit: Math.floor(combined / 60),
    remainderSeconds: combined % 60,
    remainingSeconds: included * 60 + pack * 60 - combined,
  };
}

/** Content labels only. The wording does not infer emotion, honesty, or personality. */
export function voiceSummary(seconds: number, feedback: InterviewFeedback): string {
  const summary = `Recorded ${seconds} seconds. Relevance ${feedback.relevance}. Structure ${feedback.structure}. Specificity ${feedback.specificity}. Evidence ${feedback.evidence}.`;
  if (FORBIDDEN.test(summary)) throw new Error('voice summary used a forbidden inference');
  return summary;
}

export function voiceSessionSummary(seconds: number, transcript: string, factText: string): { feedback: InterviewFeedback; summary: string } {
  const feedback = interviewFeedback(transcript, factText);
  return { feedback, summary: voiceSummary(seconds, feedback) };
}

/** Quotes the offer and source the person supplied. It does not promise a different offer. */
export function negotiationGuidance(offer: string, salarySource: string): string {
  const pay = offer.trim();
  const source = salarySource.trim();
  const sourceLine = source.length > 0 ? `Salary source you supplied: ${source}.` : 'No salary source was supplied.';
  return `Assumption: the offer you entered is ${pay}. ${sourceLine} This does not promise a different offer.`;
}

function normalizeRemainder(value: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, 59);
}
