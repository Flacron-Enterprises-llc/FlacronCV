import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient, type CoachThread, type PaidCoachReply } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { CoachScreen } from './CoachScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const opportunityId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';

const thread: CoachThread = {
  id: threadId,
  title: 'How should I prepare for my next interview?',
  opportunityId,
  messageCount: 2,
  updatedAt: '2026-11-15T09:00:00.000Z',
  messages: [
    { id: 'm1', role: 'user', content: 'How should I prepare for my next interview?', createdAt: '2026-11-15T09:00:00.000Z' },
    { id: 'm2', role: 'assistant', content: 'Start with the listing.\n\n- Review your SQL work\n- Prepare two stories', createdAt: '2026-11-15T09:00:01.000Z' },
  ],
};

const balance = (included: number, packs = 0) => ({ includedRemaining: included, packRemaining: packs, renewalDate: '2026-12-01T00:00:00.000Z' });

function paid(next: CoachThread, included: number): PaidCoachReply {
  return {
    thread: next,
    usage: { unit: 'coaching_response', includedRemaining: included, packRemaining: 0, renewalDate: '2026-12-01T00:00:00.000Z', ledgerState: 'committed' },
    jobId: 'job-1',
    replayed: false,
  };
}

const noFacts = async () => ({ items: [] }) as unknown as Awaited<ReturnType<ApiClient['facts']>>;
const savedJobs = async () =>
  ({ items: [{ id: opportunityId, title: 'SQL analyst' }] }) as unknown as Awaited<ReturnType<ApiClient['savedOpportunities']>>;

function renderScreen(api: ApiClient) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CoachScreen api={api} user={user} ready signInHref="/en/login" locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('CoachScreen', () => {
  it('starts a conversation about a saved job, shows the reply and the new balance', async () => {
    const askCoach = vi.fn(async () => paid(thread, 4));
    renderScreen(
      testApi({
        coachThreads: async () => ({ items: [], coaching: balance(5) }),
        savedOpportunities: savedJobs,
        facts: noFacts,
        askCoach,
      }),
    );
    expect(await screen.findByText('5 coaching responses left')).toBeTruthy();
    // No confirmed facts: the coach still works but says why answers are general.
    expect(await screen.findByText('Add confirmed facts for better answers')).toBeTruthy();
    expect(screen.getByText(/Each reply uses 1 coaching response/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'How should I prepare for my next interview?' }));
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('How should I prepare for my next interview?');
    fireEvent.change(await screen.findByLabelText('About a saved job (optional)'), { target: { value: opportunityId } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));

    expect(askCoach).toHaveBeenCalledWith(
      { question: 'How should I prepare for my next interview?', opportunityId, locale: 'en' },
      expect.any(String),
    );
    // The pending question shows first; wait for the stored reply.
    expect(await screen.findByText('Review your SQL work')).toBeTruthy();
    expect(screen.getByText('About: SQL analyst')).toBeTruthy();
    expect(screen.getByText('4 coaching responses left')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Conversations' })).getByText(thread.title)).toBeTruthy();
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
  });

  it('keeps the question and reuses the same key when a reply fails, so a retry is never charged twice', async () => {
    const askCoach = vi
      .fn<ApiClient['askCoach']>()
      .mockRejectedValueOnce(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))
      .mockResolvedValueOnce(paid(thread, 4));
    renderScreen(testApi({ coachThreads: async () => ({ items: [], coaching: balance(5) }), savedOpportunities: savedJobs, facts: noFacts, askCoach }));
    await screen.findByText('5 coaching responses left');
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Should I take the offer?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    expect(await screen.findByText('The coach is not available right now')).toBeTruthy();
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Should I take the offer?');
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    await screen.findByText('Prepare two stories');
    expect(askCoach).toHaveBeenCalledTimes(2);
    expect(askCoach.mock.calls[0][1]).toBe(askCoach.mock.calls[1][1]);
  });

  it('continues an existing conversation and links to packs when the allowance is used up', async () => {
    const askCoach = vi.fn(async () => {
      throw new ApiError(402, 'quota_exhausted', { code: 'quota_exhausted' });
    });
    renderScreen(
      testApi({
        coachThreads: async () => ({ items: [{ ...thread, messages: undefined } as never], coaching: balance(1) }),
        coachThread: async () => thread,
        savedOpportunities: savedJobs,
        facts: noFacts,
        askCoach,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /How should I prepare for my next interview\?.*2 messages/ }));
    await screen.findByText('Prepare two stories');
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'And the salary question?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask the coach' }));
    expect(await screen.findByText('No coaching responses left')).toBeTruthy();
    expect(askCoach).toHaveBeenCalledWith({ question: 'And the salary question?', threadId, locale: 'en' }, expect.any(String));
    expect(screen.getByRole('link', { name: 'See plans and packs' }).getAttribute('href')).toBe('/en/settings/billing');
  });

  it('deletes a conversation after confirming', async () => {
    const deleteCoachThread = vi.fn(async () => ({ deleted: true as const }));
    renderScreen(
      testApi({
        coachThreads: async () => ({ items: [{ ...thread, messages: undefined } as never], coaching: balance(5) }),
        savedOpportunities: savedJobs,
        facts: noFacts,
        deleteCoachThread,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: `Delete conversation “${thread.title}”` }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteCoachThread).toHaveBeenCalledWith(threadId));
    await waitFor(() => expect(screen.getByText('No conversations yet.')).toBeTruthy());
  });
});
