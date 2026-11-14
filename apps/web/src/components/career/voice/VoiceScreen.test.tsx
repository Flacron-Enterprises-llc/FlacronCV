import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type VoiceList, type VoiceRecordResult, type VoiceSession } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { VoiceScreen } from './VoiceScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const opened: VoiceSession = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'practice',
  title: 'SQL analyst',
  prompt: 'behavioral: Walk through this confirmed line for SQL analyst. Confirmed line: SQL',
  guidance: null,
  summary: 'No recording yet.',
  opportunityId: '22222222-2222-4222-8222-222222222222',
  stage: 'behavioral',
  recording: null,
  createdAt: '2026-10-18T10:00:00.000Z',
};

const graded: VoiceSession = {
  ...opened,
  summary: 'Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
  recording: {
    id: '33333333-3333-4333-8333-333333333333',
    durationSeconds: 90,
    requestedSeconds: 90,
    truncated: false,
    transcript: 'I used SQL.',
    transcriptSource: 'typed',
    feedback: { relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' },
    audioStored: true,
    audioDeleted: false,
  },
};

function list(items: VoiceSession[], extra: Partial<VoiceList> = {}): VoiceList {
  return {
    items,
    consent: true,
    remainingSeconds: 1710,
    planIncludesVoice: true,
    renewalDate: '2026-11-18T00:00:00.000Z',
    transcriptionAvailable: false,
    ...extra,
  };
}

function renderScreen(api = testApi(), opportunityId: string | null = '22222222-2222-4222-8222-222222222222') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <VoiceScreen api={api} user={user} ready signInHref="/en/sign-in" opportunityId={opportunityId} />
    </NextIntlClientProvider>,
  );
}

/** A stand-in for the browser recorder: it emits one chunk when stopped. */
class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  static last: FakeMediaRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const stopTrack = vi.fn();

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
  });
  stopTrack.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VoiceScreen', () => {
  it('says voice practice is not open yet when the feature is switched off', async () => {
    renderScreen(
      testApi({
        voiceInterviews: async () => {
          throw new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable', feature: 'voiceMinutes' });
        },
      }),
    );
    expect(await screen.findByText('Voice practice is not open yet')).toBeTruthy();
    expect(screen.queryByText('Voice practice could not be loaded')).toBeNull();
  });

  it('shows the cost and balance before recording, uploads the real take once, and asks for the typed words when transcription is off', async () => {
    let release: (value: VoiceRecordResult) => void = () => undefined;
    const recordVoice = vi.fn(
      (_id: string, _audio: Blob, _key: string, _language?: 'en' | 'fr') =>
        new Promise<VoiceRecordResult>((resolve) => {
          release = resolve;
        }),
    );
    const startVoice = vi.fn(async () => opened);
    const pending: VoiceSession = {
      ...opened,
      summary: 'Recorded 90 seconds. Add the transcript to get feedback.',
      recording: { ...graded.recording!, transcript: '', transcriptSource: 'pending', feedback: null },
    };
    renderScreen(
      testApi({
        voiceInterviews: async () => list([], { consent: false, remainingSeconds: 1800 }),
        consentVoice: async () => ({ consent: true, version: 'voice-recording-1' }),
        startVoice,
        recordVoice,
      }),
    );
    expect(await screen.findByText(/1800 seconds/)).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open a practice question' });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to record this practice on my account.' }));
    fireEvent.change(screen.getByLabelText('Interview stage'), { target: { value: 'technical' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Open a practice question' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Open a practice question' }));
    await waitFor(() => expect(startVoice).toHaveBeenCalledWith({ kind: 'practice', opportunityId: opened.opportunityId, stage: 'technical' }));

    // Charging principle: operation, what it uses, and the balance are on screen before anything is recorded.
    const charge = await screen.findByTestId('voice-charge');
    expect(charge.textContent).toContain('Before you record: voice practice recording');
    expect(charge.textContent).toContain('counted by the second from the audio file');
    expect(charge.textContent).toContain('stops by itself at 20:00');
    expect(charge.textContent).toContain('You have 30:00 left (1,800 seconds).');
    expect(charge.textContent).toContain('Automatic transcription is not connected yet');

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByText(/Recording 0:00 of 20:00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(stopTrack).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Save this take' })).toBeTruthy();
    expect(recordVoice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save this take' }));
    await waitFor(() => expect(recordVoice).toHaveBeenCalledTimes(1));
    const [sessionId, audio, key, language] = recordVoice.mock.calls[0];
    expect(sessionId).toBe(opened.id);
    expect(audio).toBeInstanceOf(Blob);
    expect(audio.type).toBe('audio/webm;codecs=opus');
    expect(key).toEqual(expect.any(String));
    expect(language).toBe('en');
    await act(async () => {
      release({ session: pending, billedSeconds: 90, truncated: false, remainingSeconds: 1710, replayed: false, transcription: 'unavailable' });
    });
    expect(await screen.findByText(/Automatic transcription is not connected yet, so type what you said below/)).toBeTruthy();
    expect(screen.getByText(/1710 seconds/)).toBeTruthy();
    expect(screen.getByText('Feedback appears once the words of your answer are saved.')).toBeTruthy();
    expect(screen.getByLabelText('Type what you said')).toBeTruthy();
  });

  it('discards a take without uploading, and keeps the same key when a failed upload is retried', async () => {
    const recordVoice = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'network_error', { code: 'network_error' }))
      .mockResolvedValueOnce({ session: graded, billedSeconds: 90, truncated: false, remainingSeconds: 1620, replayed: false, transcription: 'transcribed' });
    renderScreen(testApi({ voiceInterviews: async () => list([opened]), recordVoice }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and record again' }));
    expect(recordVoice).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save this take' }));
    expect(await screen.findByText('That take was not saved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save this take' }));
    expect(await screen.findByText(/The recording was transcribed/)).toBeTruthy();
    expect(recordVoice).toHaveBeenCalledTimes(2);
    expect(recordVoice.mock.calls[0][2]).toBe(recordVoice.mock.calls[1][2]);
  });

  it('practices for a named role and reports a refused microphone without spending', async () => {
    const startVoice = vi.fn(async () => ({ ...opened, opportunityId: null, title: 'Data analyst' }));
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const recordVoice = vi.fn();
    renderScreen(testApi({ voiceInterviews: async () => list([]), startVoice, recordVoice }), null);
    fireEvent.change(await screen.findByLabelText('Role you are practicing for'), { target: { value: 'Data analyst' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open a practice question' }));
    await waitFor(() => expect(startVoice).toHaveBeenCalledWith({ kind: 'practice', role: 'Data analyst', stage: 'behavioral' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start recording' }));
    expect(await screen.findByText(/Microphone access was refused/)).toBeTruthy();
    expect(recordVoice).not.toHaveBeenCalled();
  });

  it('shows per-rubric feedback and keeps the summary after the recording is removed (with confirmation)', async () => {
    let release: (value: VoiceSession) => void = () => undefined;
    const deleteVoiceAudio = vi.fn(
      () =>
        new Promise<VoiceSession>((resolve) => {
          release = resolve;
        }),
    );
    renderScreen(testApi({ voiceInterviews: async () => list([graded]), deleteVoiceAudio }));
    expect(await screen.findByText(/Recorded 90 seconds/)).toBeTruthy();
    const feedback = screen.getByTestId('voice-feedback');
    expect(feedback.textContent).toContain('Relevance: the answer uses your confirmed experience.');
    expect(feedback.textContent).toContain('Structure: add the situation, what you did and what happened.');
    expect(feedback.textContent).not.toMatch(/emotion|honest|personality|confident|nervous/i);
    fireEvent.click(screen.getByRole('button', { name: 'Remove recording' }));
    expect(deleteVoiceAudio).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove recording' }));
    await waitFor(() => expect(deleteVoiceAudio).toHaveBeenCalledTimes(1));
    await act(async () => {
      release({ ...graded, recording: { ...graded.recording!, audioStored: false, audioDeleted: true } });
    });
    expect(await screen.findByText('The recording was deleted. The transcript and summary are still here.')).toBeTruthy();
    expect(screen.getByText(/Recorded 90 seconds/)).toBeTruthy();
    expect(screen.getByText('Audio removed. The transcript and summary were kept.')).toBeTruthy();
  });

  it('saves a typed correction and shows the recomputed summary without recording again', async () => {
    const corrected: VoiceSession = {
      ...graded,
      summary: 'Recorded 90 seconds. Relevance missing. Structure thin. Specificity general. Evidence unstated.',
      recording: {
        ...graded.recording!,
        transcript: 'I helped the team.',
        feedback: { relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' },
      },
    };
    const correctVoiceTranscript = vi.fn(async () => corrected);
    const recordVoice = vi.fn();
    renderScreen(testApi({ voiceInterviews: async () => list([graded]), correctVoiceTranscript, recordVoice }));
    const field = await screen.findByLabelText('Saved transcript');
    expect((field as HTMLTextAreaElement).value).toBe('I used SQL.');
    fireEvent.change(field, { target: { value: 'I helped the team.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Correction saved. No extra time was used.')).toBeTruthy();
    expect(correctVoiceTranscript).toHaveBeenCalledWith(opened.id, 'I helped the team.');
    expect(screen.getByText(/Relevance missing\. Structure thin/)).toBeTruthy();
    expect(screen.getByTestId('voice-feedback').textContent).toContain('Evidence: no confirmed result or example is stated yet.');
    expect(recordVoice).not.toHaveBeenCalled();
  });

  it('lets the person reopen an earlier session for free', async () => {
    const older: VoiceSession = { ...graded, id: '44444444-4444-4444-8444-444444444444', title: 'Older role', stage: 'panel' };
    const recordVoice = vi.fn();
    renderScreen(testApi({ voiceInterviews: async () => list([opened, older]), recordVoice }));
    const pick = await screen.findByRole('button', { name: /Older role · Panel/ });
    fireEvent.click(pick);
    expect(await screen.findByText(/Recorded 90 seconds\. Relevance grounded/)).toBeTruthy();
    expect(recordVoice).not.toHaveBeenCalled();
  });
});
