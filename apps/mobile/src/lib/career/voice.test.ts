import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { VoiceSession } from '../../../../../packages/career-api-client/src/types';
import {
  MAX_VOICE_RECORD_SECONDS,
  NO_MICROPHONE,
  VOICE_CONSENT_TEXT,
  VOICE_CONSENT_VERSION,
  clock,
  negotiationErrors,
  remainingLine,
  savedSummary,
  takeSeconds,
  voiceErrorMessage,
  voiceGate,
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

describe('takeSeconds', () => {
  it('counts at least one second and at most the per-take limit', () => {
    expect(takeSeconds(1000, 1000)).toBe(1);
    expect(takeSeconds(0, 90_400)).toBe(90);
    expect(takeSeconds(0, (MAX_VOICE_RECORD_SECONDS + 100) * 1000)).toBe(MAX_VOICE_RECORD_SECONDS);
  });
});

describe('savedSummary', () => {
  it('hides the server placeholder', () => {
    expect(savedSummary(null)).toBeNull();
    expect(savedSummary(voiceSession('No recording yet.'))).toBeNull();
    expect(savedSummary(voiceSession('Took 90 seconds.'))).toBe('Took 90 seconds.');
  });
});

describe('voiceGate', () => {
  it('checks consent, then plan, then time', () => {
    expect(voiceGate({ consent: false, planIncludesVoice: false, remainingSeconds: 0 })).toBe('needs_consent');
    expect(voiceGate({ consent: true, planIncludesVoice: false, remainingSeconds: 100 })).toBe('no_plan');
    expect(voiceGate({ consent: true, planIncludesVoice: true, remainingSeconds: 0 })).toBe('no_time');
    expect(voiceGate({ consent: true, planIncludesVoice: true, remainingSeconds: 1 })).toBe('ready');
  });
});

describe('consent and microphone wording', () => {
  it('uses the website wording and the server consent version', () => {
    expect(VOICE_CONSENT_TEXT).toBe('I agree to record this practice on my account.');
    expect(VOICE_CONSENT_VERSION).toBe('voice-recording-1');
    expect(NO_MICROPHONE).toMatch(/does not record audio/);
  });
});

describe('negotiationErrors', () => {
  it('requires an offer and bounds both fields', () => {
    expect(negotiationErrors('', '')).toEqual({ offer: 'Enter the offer you received.' });
    expect(negotiationErrors('CAD 70,000', '')).toEqual({});
    expect(negotiationErrors('x'.repeat(501), 'y'.repeat(501))).toEqual({
      offer: 'Keep it under 500 characters.',
      salarySource: 'Keep it under 500 characters.',
    });
  });
});

describe('voiceErrorMessage', () => {
  it('maps the server refusals', () => {
    expect(voiceErrorMessage(err('validation_error', { field: 'consent', reason: 'required' }), 'start')).toMatch(/Agree/);
    expect(voiceErrorMessage(err('feature_unavailable', {}, 403), 'load')).toMatch(/switched off/);
    expect(voiceErrorMessage(err('plan_upgrade_required', {}, 402), 'start')).toMatch(/not included/);
    expect(voiceErrorMessage(err('quota_exhausted', {}, 402), 'record')).toMatch(/No voice time left/);
    expect(voiceErrorMessage(err('validation_error', { field: 'recording', reason: 'already_recorded' }), 'record')).toMatch(/already/);
    expect(voiceErrorMessage(err('validation_error', { field: 'offer', reason: 'invalid' }), 'start')).toMatch(/offer/);
  });

  it('falls back without claiming a save', () => {
    expect(voiceErrorMessage(new Error('x'), 'record')).toMatch(/not saved/);
    expect(voiceErrorMessage(err('not_found', {}, 404), 'delete')).toBe('This item no longer exists.');
  });
});
