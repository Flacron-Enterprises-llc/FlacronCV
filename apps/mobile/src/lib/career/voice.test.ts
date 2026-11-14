import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceSession } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import {
  KIND_LABEL,
  TRANSCRIPT_MAX,
  VOICE_CONSENT_VERSION,
  clock,
  remainingLine,
  savedSummary,
  transcriptHelpKey,
  voiceErrorMessage,
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

describe('recording happens on the website', () => {
  it('says so honestly and keeps the server consent version', () => {
    expect(t('careerInterviews.voice.webOnlyBody')).toMatch(/website/);
    expect(t('careerInterviews.voice.webOnlyBody')).toMatch(/cannot record audio/);
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
