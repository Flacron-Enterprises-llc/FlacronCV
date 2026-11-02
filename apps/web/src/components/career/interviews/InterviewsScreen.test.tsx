import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type InterviewSession } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { InterviewsScreen } from './InterviewsScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const opportunityId = '11111111-1111-4111-8111-111111111111';

const session: InterviewSession = {
  id: '33333333-3333-4333-8333-333333333333',
  opportunityId,
  opportunityRevisionId: '22222222-2222-4222-8222-222222222222',
  stage: 'behavioral',
  title: 'SQL analyst',
  questions: [{ index: 1, factId: '44444444-4444-4444-8444-444444444444', prompt: 'behavioral: Walk through this confirmed line for SQL analyst. Confirmed line: SQL' }],
  answers: [],
  summary: 'No answers yet.',
  createdAt: '2026-10-16T09:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <InterviewsScreen api={api} user={user} ready signInHref="/en/sign-in" locale="en" opportunityId={opportunityId} />
    </NextIntlClientProvider>,
  );
}

describe('InterviewsScreen', () => {
  it('asks before a session and does not ask again for an answer', async () => {
    const createInterview = vi.fn(async () => ({
      session,
      usage: { unit: 'text_interview', includedRemaining: 1, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z', ledgerState: 'committed' },
      jobId: 'job-1',
      replayed: false,
    }));
    const answerInterview = vi.fn(async () => ({
      ...session,
      answers: [{ id: '55555555-5555-4555-8555-555555555555', index: 1, answer: 'I used SQL.', feedback: { relevance: 'grounded' as const, structure: 'thin' as const, specificity: 'specific' as const, evidence: 'cited' as const }, challenge: null }],
      summary: '1 of 10 answered. Relevance grounded. Structure thin. Specificity specific. Evidence cited.',
    }));
    renderScreen(testApi({
      interviews: async () => ({ items: [], textInterview: { includedRemaining: 2, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' } }),
      starStories: async () => ({ items: [] }),
      createInterview,
      answerInterview,
    }));
    expect(await screen.findByText('Text interviews left: 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start a practice session' }));
    expect(await screen.findByText('Use 1 text interview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 text interview' }));
    expect(createInterview).toHaveBeenCalledWith({ opportunityId, stage: 'behavioral' }, expect.any(String));
    expect(await screen.findByText(/Confirmed line: SQL/)).toBeTruthy();
    expect(screen.queryByText('Use 1 text interview')).toBeNull();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I used SQL.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(answerInterview).toHaveBeenCalledWith(session.id, 'I used SQL.');
    expect(await screen.findByText(/1 of 10/)).toBeTruthy();
    expect(screen.queryByText('Use 1 text interview')).toBeNull();
  });

  it('shows the plan message on Free and keeps a story number that was rejected', async () => {
    const createInterview = vi.fn(async () => {
      throw new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required', feature: 'textInterviewSessions', minimumPlan: 'starter' });
    });
    const createStarStory = vi.fn(async () => {
      throw new ApiError(400, 'validation_error', { code: 'validation_error', field: 'result', reason: 'number_not_in_facts' });
    });
    renderScreen(testApi({
      interviews: async () => ({ items: [], textInterview: { includedRemaining: 0, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' } }),
      starStories: async () => ({ items: [] }),
      createInterview,
      createStarStory,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start a practice session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 text interview' }));
    expect(await screen.findByText('Text interview practice is not included in your current plan')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'raised 50 million' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }));
    expect(await screen.findByText('That number is not in your confirmed facts.')).toBeTruthy();
    expect(screen.getByLabelText('Result')).toHaveProperty('value', 'raised 50 million');
    expect(createStarStory).toHaveBeenCalledWith({ situation: '', task: '', action: '', result: 'raised 50 million' });
  });
});
