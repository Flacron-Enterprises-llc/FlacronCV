import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import {
  KIND_LABEL,
  MAX_VOICE_TAKE_SECONDS,
  TRANSCRIPT_MAX,
  VOICE_CONSENT_VERSION,
  VOICE_RECORDING_OPTIONS,
  VOICE_UPLOAD_MAX_BYTES,
  VOICE_UPLOAD_TYPE,
  canOpenPractice,
  clock,
  elapsedSeconds,
  negotiationInput,
  practiceInput,
  reachedLimit,
  recordErrorNote,
  recordResultNote,
  remainingLine,
  savedSummary,
  startErrorNote,
  takeLimitSeconds,
  takeTooLarge,
  transcriptHelpKey,
  transcriptionLanguage,
  upsertSession,
  voiceErrorMessage,
  voiceNote,
} from './voice';

const err = (code: string, body: Record<string, unknown> = {}, status = 422) => new ApiError(status, code, { code, ...body });

function voiceSession(summary: string): VoiceSession {
  return {
    id: 'v1',
    kind: 'practice',
    title: 'Data Analyst (fixture)',
    prompt: 'Tell me about a time…',
    guidance: null,
    summary,
    opportunityId: 'o1',
    stage: 'behavioral',
    recording: null,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('clock', () => {
  it('formats m:ss and never goes negative', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65)).toBe('1:05');
    expect(clock(1800)).toBe('30:00');
    expect(clock(-5)).toBe('0:00');
    expect(clock(Number.NaN)).toBe('0:00');
    expect(remainingLine(1800)).toBe('Voice time left: 30:00 (1800 seconds).');
  });
});

describe('savedSummary', () => {
  it('hides the server placeholder', () => {
    expect(savedSummary(null)).toBeNull();
    expect(savedSummary(voiceSession('No recording yet.'))).toBeNull();
    expect(savedSummary(voiceSession('Recorded 90 seconds. Add the transcript to get feedback.'))).toBe(
      'Recorded 90 seconds. Add the transcript to get feedback.',
    );
  });
});

describe('recording in the app', () => {
  it('records what the server measures, and keeps the server consent version', () => {
    expect(VOICE_UPLOAD_TYPE).toBe('audio/mp4');
    expect(VOICE_RECORDING_OPTIONS.extension).toBe('.m4a');
    expect(VOICE_RECORDING_OPTIONS.android).toEqual({ outputFormat: 'mpeg4', audioEncoder: 'aac' });
    // 'aac ' is IOSOutputFormat.MPEG4AAC.
    expect(VOICE_RECORDING_OPTIONS.ios.outputFormat).toBe('aac ');
    // A full twenty-minute take stays under the upload limit.
    expect((VOICE_RECORDING_OPTIONS.bitRate / 8) * MAX_VOICE_TAKE_SECONDS).toBeLessThan(VOICE_UPLOAD_MAX_BYTES);
    expect(VOICE_CONSENT_VERSION).toBe('voice-recording-1');
    expect(TRANSCRIPT_MAX).toBe(10_000);
    expect(KIND_LABEL.negotiation).toBe('Negotiation');
  });

  it('picks transcript help by where the words came from', () => {
    expect(t(transcriptHelpKey('pending'))).toMatch(/no transcript yet/);
    expect(t(transcriptHelpKey('typed'))).toMatch(/typed/);
    expect(t(transcriptHelpKey('transcribed'))).toMatch(/automatic transcription/);
  });
});

describe('voiceErrorMessage', () => {
  it('maps the server refusals', () => {
    expect(voiceErrorMessage(err('feature_unavailable', {}, 403), 'load')).toMatch(/switched off/);
    expect(voiceErrorMessage(err('plan_upgrade_required', {}, 402), 'correct')).toMatch(/not included/);
    expect(voiceErrorMessage(err('validation_error', { field: 'transcript', reason: 'invalid' }), 'correct')).toMatch(/Type the words/);
    expect(voiceErrorMessage(err('not_found', {}, 404), 'correct')).toMatch(/no recording/);
  });

  it('falls back without claiming a save', () => {
    expect(voiceErrorMessage(new Error('x'), 'correct')).toMatch(/not saved/);
    expect(voiceErrorMessage(new Error('x'), 'delete')).toMatch(/not removed/);
    expect(voiceErrorMessage(err('not_found', {}, 404), 'load')).toBe('This item no longer exists.');
  });
});

describe('the take limit', () => {
  it('is the time left, capped per take, never negative', () => {
    expect(takeLimitSeconds(90.7)).toBe(90);
    expect(takeLimitSeconds(99_999)).toBe(MAX_VOICE_TAKE_SECONDS);
    expect(takeLimitSeconds(-3)).toBe(0);
    expect(takeLimitSeconds(Number.NaN)).toBe(0);
  });

  it('stops the recorder at the cap it was started with', () => {
    expect(elapsedSeconds(1999)).toBe(1);
    expect(elapsedSeconds(-1)).toBe(0);
    expect(reachedLimit(59_999, 60)).toBe(false);
    expect(reachedLimit(60_000, 60)).toBe(true);
    expect(reachedLimit(5_000, 0)).toBe(false);
  });

  it('refuses a file over the upload limit before sending it', () => {
    expect(takeTooLarge(VOICE_UPLOAD_MAX_BYTES)).toBe(false);
    expect(takeTooLarge(VOICE_UPLOAD_MAX_BYTES + 1)).toBe(true);
  });
});

describe('opening a question', () => {
  const base = { consented: true, planIncludesVoice: true, recording: false, opportunityId: null, role: 'Analyst' };

  it('needs consent, the plan, no take in progress, and a listing or a role', () => {
    expect(canOpenPractice(base)).toBe(true);
    expect(canOpenPractice({ ...base, consented: false })).toBe(false);
    expect(canOpenPractice({ ...base, planIncludesVoice: false })).toBe(false);
    expect(canOpenPractice({ ...base, recording: true })).toBe(false);
    expect(canOpenPractice({ ...base, role: ' a ' })).toBe(false);
    expect(canOpenPractice({ ...base, role: '', opportunityId: 'o1' })).toBe(true);
  });

  it('builds the request bodies like the website', () => {
    expect(practiceInput('o1', 'ignored', 'panel')).toEqual({ kind: 'practice', opportunityId: 'o1', stage: 'panel' });
    expect(practiceInput(null, '  Analyst ', 'technical')).toEqual({ kind: 'practice', role: 'Analyst', stage: 'technical' });
    expect(negotiationInput('  ', 'x')).toBeNull();
    expect(negotiationInput(' 60k ', ' Levels survey ')).toEqual({ kind: 'negotiation', offer: '60k', salarySource: 'Levels survey' });
  });

  it('transcribes in French only for French', () => {
    expect(transcriptionLanguage('fr')).toBe('fr');
    expect(transcriptionLanguage('ar')).toBe('en');
  });
});

describe('notes after an action', () => {
  it('maps refusals to open a question', () => {
    expect(startErrorNote(err('plan_upgrade_required', {}, 402))).toBe('upgrade');
    expect(startErrorNote(err('quota_exhausted', {}, 402))).toBe('quota');
    expect(startErrorNote(err('validation_error', { field: 'facts' }))).toBe('noFacts');
    expect(startErrorNote(err('feature_unavailable', {}, 403))).toBe('switchedOff');
    expect(startErrorNote(new Error('offline'))).toBe('startFailed');
  });

  it('maps upload refusals; nothing is claimed as saved', () => {
    expect(recordErrorNote(err('validation_error', { field: 'audio', reason: 'too_large' }))).toBe('tooLarge');
    expect(recordErrorNote(err('validation_error', { field: 'audio', reason: 'too_long' }))).toBe('tooLarge');
    expect(recordErrorNote(err('validation_error', { field: 'audio', reason: 'unreadable' }))).toBe('unreadable');
    expect(recordErrorNote(err('quota_exhausted', {}, 402))).toBe('quota');
    expect(recordErrorNote(new ApiError(403, 'ai_consent_declined', { code: 'ai_consent_declined' }))).toBe('aiDeclined');
    expect(recordErrorNote(new Error('offline'))).toBe('saveFailed');
    expect(voiceNote('saveFailed')).toEqual({ tone: 'warning', text: expect.stringMatching(/No time was used/) });
  });

  it('reports truncation first, then the honest transcription state', () => {
    expect(recordResultNote({ truncated: true, transcription: 'transcribed' })).toBe('truncated');
    expect(recordResultNote({ truncated: false, transcription: 'transcribed' })).toBe('transcribed');
    expect(recordResultNote({ truncated: false, transcription: 'failed' })).toBe('transcriptionFailed');
    expect(recordResultNote({ truncated: false, transcription: 'unavailable' })).toBe('transcriptionUnavailable');
    expect(recordResultNote({ truncated: false, transcription: 'not_attempted' })).toBeNull();
    expect(voiceNote('transcriptionUnavailable').text).toMatch(/not connected/);
    expect(voiceNote('transcriptionUnavailable').tone).toBe('info');
  });
});

describe('upsertSession', () => {
  it('replaces a changed session in place and puts a new one on top', () => {
    const a = voiceSession('A');
    const b = { ...voiceSession('B'), id: 'v2' };
    expect(upsertSession([a, b], { ...b, summary: 'B2' }).map((s) => s.summary)).toEqual(['A', 'B2']);
    expect(upsertSession([a], b).map((s) => s.id)).toEqual(['v2', 'v1']);
  });
});
