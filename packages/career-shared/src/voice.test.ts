import { describe, expect, it } from 'vitest';
import {
  applyVoiceSeconds,
  negotiationGuidance,
  voiceAudioContentType,
  voicePendingSummary,
  voiceRecordingSeconds,
  voiceRemainingSeconds,
  voiceSessionSummary,
} from './voice';

describe('voice metering', () => {
  it('drops the balance by the recorded seconds', () => {
    expect(voiceRemainingSeconds(30, 0, 0)).toBe(1800);
    const spent = applyVoiceSeconds({ includedMinutes: 30, packMinutes: 0, remainderSeconds: 0, recordedSeconds: 90 });
    expect(spent).toEqual({
      billedSeconds: 90,
      truncated: false,
      minutesToDebit: 1,
      remainderSeconds: 30,
      remainingSeconds: 1710,
    });
    const next = applyVoiceSeconds({ includedMinutes: 29, packMinutes: 0, remainderSeconds: 30, recordedSeconds: 40 });
    expect(next).toMatchObject({ billedSeconds: 40, minutesToDebit: 1, remainderSeconds: 10, remainingSeconds: 1670 });
  });

  it('stops at the seconds that are left', () => {
    expect(applyVoiceSeconds({ includedMinutes: 0, packMinutes: 0, remainderSeconds: 0, recordedSeconds: 30 })).toBeNull();
    const cut = applyVoiceSeconds({ includedMinutes: 1, packMinutes: 0, remainderSeconds: 50, recordedSeconds: 30 });
    expect(cut).toEqual({
      billedSeconds: 10,
      truncated: true,
      minutesToDebit: 1,
      remainderSeconds: 0,
      remainingSeconds: 0,
    });
  });

  it('does not infer emotion or promise a better offer', () => {
    const practice = voiceSessionSummary(90, 'I used SQL on the ledger.', 'SQL');
    expect(practice.summary).toBe('Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.');
    expect(practice.summary).not.toMatch(/emotion|honesty|personality|guaranteed/i);
    const guidance = negotiationGuidance('80000 USD', 'the pasted posting');
    expect(guidance).toContain('Assumption:');
    expect(guidance).toContain('80000 USD');
    expect(guidance).toContain('the pasted posting');
    expect(guidance).not.toMatch(/emotion|honesty|personality|guaranteed/i);
  });
});

describe('recorded audio', () => {
  it('accepts only the MediaRecorder containers, ignoring codec parameters', () => {
    expect(voiceAudioContentType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceAudioContentType('AUDIO/OGG')).toBe('audio/ogg');
    expect(voiceAudioContentType('audio/mp4')).toBe('audio/mp4');
    expect(voiceAudioContentType('audio/wav')).toBeNull();
    expect(voiceAudioContentType(undefined)).toBeNull();
  });

  it('bills whole seconds from the measured length, at least one', () => {
    expect(voiceRecordingSeconds(90_000)).toBe(90);
    expect(voiceRecordingSeconds(89_499)).toBe(89);
    expect(voiceRecordingSeconds(200)).toBe(1);
    expect(voiceRecordingSeconds(0)).toBe(0);
    expect(voiceRecordingSeconds(Number.NaN)).toBe(0);
  });

  it('a pending summary states the time only and infers nothing', () => {
    expect(voicePendingSummary(12)).toBe('Recorded 12 seconds. Add the transcript to get feedback.');
    expect(voicePendingSummary(12)).not.toMatch(/emotion|honesty|personality|confident|nervous/i);
  });
});
