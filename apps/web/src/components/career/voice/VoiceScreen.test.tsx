import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type VoiceRecordResult, type VoiceSession } from '@flacroncv/career-api-client';
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

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <VoiceScreen api={api} user={user} ready signInHref="/en/sign-in" opportunityId="22222222-2222-4222-8222-222222222222" />
    </NextIntlClientProvider>,
  );
}

describe('VoiceScreen', () => {
  it('says voice practice is not open yet when the feature is switched off', async () => {
    renderScreen(testApi({
      voiceInterviews: async () => {
        throw new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable', feature: 'voiceMinutes' });
      },
    }));
    expect(await screen.findByText('Voice practice is not open yet')).toBeTruthy();
    expect(screen.queryByText('Voice practice could not be loaded')).toBeNull();
  });

  it('shows the remaining time before the timer and the summary only after the save', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let release: (value: VoiceRecordResult) => void = () => undefined;
    const recordVoice = vi.fn(
      () =>
        new Promise<VoiceRecordResult>((resolve) => {
          release = resolve;
        }),
    );
    const saved: VoiceSession = {
      ...opened,
      summary: 'Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
      recording: {
        id: '33333333-3333-4333-8333-333333333333',
        durationSeconds: 90,
        requestedSeconds: 90,
        truncated: false,
        transcript: 'I used SQL.',
        feedback: { relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' },
        audioDeleted: false,
      },
    };
    renderScreen(
      testApi({
        voiceInterviews: async () => ({
          items: [],
          consent: false,
          remainingSeconds: 1800,
          planIncludesVoice: true,
          renewalDate: '2026-11-18T00:00:00.000Z',
        }),
        consentVoice: async () => ({ consent: true, version: 'voice-recording-1' }),
        startVoice: async () => opened,
        recordVoice,
      }),
    );
    expect(await screen.findByText(/1800 seconds/)).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Start the timer' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to record this practice on my account.' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Start the timer' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Start the timer' }));
    fireEvent.change(await screen.findByLabelText('Typed transcript'), { target: { value: 'I used SQL.' } });
    now += 90_000;
    fireEvent.click(screen.getByRole('button', { name: 'Stop and save' }));
    expect(screen.queryByText(/Recorded 90 seconds/)).toBeNull();
    expect(recordVoice).toHaveBeenCalledTimes(1);
    expect(recordVoice).toHaveBeenCalledWith(opened.id, { durationSeconds: 90, transcript: 'I used SQL.' }, expect.any(String));
    release({ session: saved, billedSeconds: 90, truncated: false, remainingSeconds: 1710, replayed: false });
    expect(await screen.findByText(/Recorded 90 seconds/)).toBeTruthy();
    expect(screen.getByText(/1710 seconds/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('keeps the summary on screen after the recording is removed', async () => {
    let release: (value: VoiceSession) => void = () => undefined;
    const deleteVoiceAudio = vi.fn(
      () =>
        new Promise<VoiceSession>((resolve) => {
          release = resolve;
        }),
    );
    const recorded: VoiceSession = {
      ...opened,
      summary: 'Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
      recording: {
        id: '33333333-3333-4333-8333-333333333333',
        durationSeconds: 90,
        requestedSeconds: 90,
        truncated: false,
        transcript: 'I used SQL.',
        feedback: { relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' },
        audioDeleted: false,
      },
    };
    renderScreen(
      testApi({
        voiceInterviews: async () => ({
          items: [recorded],
          consent: true,
          remainingSeconds: 1710,
          planIncludesVoice: true,
          renewalDate: '2026-11-18T00:00:00.000Z',
        }),
        deleteVoiceAudio,
      }),
    );
    expect(await screen.findByText(/Recorded 90 seconds/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove this recording' }));
    expect(screen.queryByText('The recording is removed. The summary is still here.')).toBeNull();
    expect(screen.getByText(/Recorded 90 seconds/)).toBeTruthy();
    release({ ...recorded, recording: { ...recorded.recording!, audioDeleted: true } });
    expect(await screen.findByText('The recording is removed. The summary is still here.')).toBeTruthy();
    expect(screen.getByText(/Recorded 90 seconds/)).toBeTruthy();
  });

  it('saves a typed correction without starting another recording', async () => {
    const correctVoiceTranscript = vi.fn(async (): Promise<VoiceSession> => ({
      ...opened,
      summary: 'Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
      recording: {
        id: '33333333-3333-4333-8333-333333333333',
        durationSeconds: 90,
        requestedSeconds: 90,
        truncated: false,
        transcript: 'I helped the team.',
        feedback: { relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' },
        audioDeleted: false,
      },
    }));
    const recordVoice = vi.fn();
    renderScreen(
      testApi({
        voiceInterviews: async () => ({
          items: [
            {
              ...opened,
              summary: 'Recorded 90 seconds. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
              recording: {
                id: '33333333-3333-4333-8333-333333333333',
                durationSeconds: 90,
                requestedSeconds: 90,
                truncated: false,
                transcript: 'I used SQL.',
                feedback: { relevance: 'grounded', structure: 'thin', specificity: 'specific', evidence: 'cited' },
                audioDeleted: false,
              },
            },
          ],
          consent: true,
          remainingSeconds: 1710,
          planIncludesVoice: true,
          renewalDate: '2026-11-18T00:00:00.000Z',
        }),
        correctVoiceTranscript,
        recordVoice,
      }),
    );
    const field = await screen.findByLabelText('Saved typed transcript');
    expect((field as HTMLTextAreaElement).value).toBe('I used SQL.');
    fireEvent.change(field, { target: { value: 'I helped the team.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText('Correction saved. No extra time was used.')).toBeTruthy();
    expect(correctVoiceTranscript).toHaveBeenCalledTimes(1);
    expect(correctVoiceTranscript).toHaveBeenCalledWith(opened.id, 'I helped the team.');
    expect(recordVoice).not.toHaveBeenCalled();
    expect(screen.getByText(/1710 seconds/)).toBeTruthy();
  });
});
