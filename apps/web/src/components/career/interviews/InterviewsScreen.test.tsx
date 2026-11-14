import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type InterviewSession, type StarStory } from '@flacroncv/career-api-client';
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
const factId = '44444444-4444-4444-8444-444444444444';

const session: InterviewSession = {
  id: '33333333-3333-4333-8333-333333333333',
  opportunityId,
  opportunityRevisionId: '22222222-2222-4222-8222-222222222222',
  stage: 'behavioral',
  title: 'SQL analyst',
  questions: [{ index: 1, factId, prompt: 'behavioral: Walk through this confirmed line for SQL analyst. Confirmed line: SQL' }],
  answers: [],
  summary: 'No answers yet.',
  createdAt: '2026-10-16T09:00:00.000Z',
};

const grounded = { relevance: 'grounded' as const, structure: 'thin' as const, specificity: 'specific' as const, evidence: 'cited' as const };
const weak = { relevance: 'missing' as const, structure: 'thin' as const, specificity: 'general' as const, evidence: 'unstated' as const };

const story: StarStory = {
  id: '66666666-6666-4666-8666-666666666666',
  factIds: [factId],
  situation: 'Ledger was wrong',
  task: 'Fix it',
  action: 'Wrote checks',
  result: 'Reconciled the SQL ledger every week',
  createdAt: '2026-10-16T09:00:00.000Z',
};

const balance = (included: number) => ({ includedRemaining: included, packRemaining: 0, renewalDate: '2026-11-16T00:00:00.000Z' });

function renderScreen(api = testApi(), listing: string | null = opportunityId) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <InterviewsScreen api={api} user={user} ready signInHref="/en/sign-in" locale="en" opportunityId={listing} />
    </NextIntlClientProvider>,
  );
}

describe('InterviewsScreen', () => {
  it('shows operation, cost and balance before a session and does not ask again for an answer', async () => {
    const createInterview = vi.fn(async () => ({
      session,
      usage: { unit: 'text_interview', ...balance(1), renewalDate: '2026-11-16T00:00:00.000Z', ledgerState: 'committed' },
      jobId: 'job-1',
      replayed: false,
    }));
    const answerInterview = vi.fn(async () => ({
      ...session,
      answers: [{ id: '55555555-5555-4555-8555-555555555555', index: 1, answer: 'I used SQL.', feedback: grounded, challenge: null }],
      summary: '1 of 1 answered.',
    }));
    renderScreen(testApi({
      interviews: async () => ({ items: [], textInterview: balance(2) }),
      starStories: async () => ({ items: [] }),
      createInterview,
      answerInterview,
    }));
    expect(await screen.findByText('Text interviews left: 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Number of questions'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start a practice session' }));
    const notice = screen.getByRole('region', { name: 'Start this session' });
    expect(within(notice).getByText('Behavioral text interview, 5 questions')).toBeTruthy();
    expect(within(notice).getByText('1 text interview')).toBeTruthy();
    expect(within(notice).getByText('2 text interviews now, 1 after this session')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 text interview' }));
    expect(createInterview).toHaveBeenCalledWith({ opportunityId, stage: 'behavioral', questionCount: 5 }, expect.any(String));
    expect(await screen.findByText(/Confirmed line: SQL/)).toBeTruthy();
    expect(screen.queryByText('Use 1 text interview')).toBeNull();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I used SQL.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(answerInterview).toHaveBeenCalledWith(session.id, 'I used SQL.');
    // Per-answer feedback on all four rubric dimensions.
    const answered = await screen.findByTestId('answer-1');
    expect(within(answered).getByText('Uses your confirmed line')).toBeTruthy();
    expect(within(answered).getByText('Too short to follow')).toBeTruthy();
    expect(within(answered).getByText('Specific')).toBeTruthy();
    expect(within(answered).getByText('Cites confirmed evidence')).toBeTruthy();
    // The one-question session is complete: the summary shows strengths and gaps.
    expect(screen.getByText('Session summary')).toBeTruthy();
    expect(screen.getByText('Structure: met in 0 of 1 answers')).toBeTruthy();
    expect(screen.getByText('Every answer cited confirmed evidence.')).toBeTruthy();
    expect(screen.queryByText('Use 1 text interview')).toBeNull();
  });

  it('practises a typed role without a listing', async () => {
    const createInterview = vi.fn(async () => ({
      session: { ...session, opportunityId: null, opportunityRevisionId: null, title: 'Data analyst' },
      usage: { unit: 'text_interview', ...balance(0), renewalDate: '2026-11-16T00:00:00.000Z', ledgerState: 'committed' },
      jobId: 'job-2',
      replayed: false,
    }));
    renderScreen(
      testApi({
        interviews: async () => ({ items: [], textInterview: balance(1) }),
        starStories: async () => ({ items: [] }),
        createInterview,
      }),
      null,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start a practice session' }));
    expect(screen.getByText('Type a target role, or open a listing.')).toBeTruthy();
    expect(createInterview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Target role'), { target: { value: 'Data analyst' } });
    fireEvent.change(screen.getByLabelText('Stage'), { target: { value: 'recruiter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start a practice session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 text interview' }));
    expect(createInterview).toHaveBeenCalledWith({ role: 'Data analyst', stage: 'recruiter', questionCount: 10 }, expect.any(String));
    expect(await screen.findByText('Text interviews left: 0')).toBeTruthy();
  });

  it('resumes an older session from the picker, challenges feedback, and lists which answers lacked evidence', async () => {
    const older: InterviewSession = {
      ...session,
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Older role',
      questions: [
        { index: 1, factId, prompt: 'q1 Confirmed line: SQL' },
        { index: 2, factId, prompt: 'q2 Confirmed line: SQL' },
      ],
      answers: [
        { id: '88888888-8888-4888-8888-888888888888', index: 1, answer: 'I used SQL.', feedback: grounded, challenge: null },
        { id: '99999999-9999-4999-8999-999999999999', index: 2, answer: 'I talked.', feedback: weak, challenge: null },
      ],
    };
    const createInterview = vi.fn();
    const challengeInterview = vi.fn(async (_id: string, answerId: string, note: string) => ({
      ...older,
      answers: older.answers.map((item) => (item.id === answerId ? { ...item, challenge: note } : item)),
    }));
    renderScreen(testApi({
      interviews: async () => ({ items: [session, older], textInterview: balance(0) }),
      starStories: async () => ({ items: [] }),
      createInterview,
      challengeInterview,
    }));
    fireEvent.change(await screen.findByLabelText('Your sessions'), { target: { value: older.id } });
    expect(screen.getByText('Going back to a session does not use another text interview.')).toBeTruthy();
    expect(await screen.findByText('Answer 2 did not cite confirmed evidence.')).toBeTruthy();
    expect(screen.getByText('Relevance: met in 1 of 2 answers')).toBeTruthy();
    const second = screen.getByTestId('answer-2');
    fireEvent.click(within(second).getByRole('button', { name: 'Challenge this feedback' }));
    fireEvent.change(within(second).getByLabelText('What is wrong with this feedback?'), { target: { value: 'I did cite it.' } });
    fireEvent.click(within(second).getByRole('button', { name: 'Send challenge' }));
    expect(challengeInterview).toHaveBeenCalledWith(older.id, older.answers[1].id, 'I did cite it.');
    expect(await screen.findByText('Your challenge: I did cite it.')).toBeTruthy();
    expect(createInterview).not.toHaveBeenCalled();
  });

  it('shows the plan message on Free and keeps a story the server refused', async () => {
    const createInterview = vi.fn(async () => {
      throw new ApiError(403, 'plan_upgrade_required', { code: 'plan_upgrade_required', feature: 'textInterviewSessions', minimumPlan: 'starter' });
    });
    const createStarStory = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'result', reason: 'number_not_in_facts' }))
      .mockRejectedValueOnce(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'result', reason: 'result_not_in_facts' }));
    renderScreen(testApi({
      interviews: async () => ({ items: [], textInterview: balance(0) }),
      starStories: async () => ({ items: [] }),
      createInterview,
      createStarStory,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start a practice session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 1 text interview' }));
    expect(await screen.findByText('Text interview practice is not included in your current plan')).toBeTruthy();
    for (const [label, value] of [['Situation', 's'], ['Task', 't'], ['Action', 'a'], ['Result', 'raised 50 million']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }));
    expect(await screen.findByText('That number is not in your confirmed facts.')).toBeTruthy();
    expect(screen.getByLabelText('Result')).toHaveProperty('value', 'raised 50 million');
    expect(createStarStory).toHaveBeenCalledWith({ situation: 's', task: 't', action: 'a', result: 'raised 50 million' });
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'won the Innovation Award' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }));
    expect(await screen.findByText('That result is not in your confirmed achievements. Use the wording of a confirmed achievement.')).toBeTruthy();
  });

  it('lists saved stories without copying the newest into the form, edits and deletes them', async () => {
    const updateStarStory = vi.fn(async (_id: string, input: { situation: string; task: string; action: string; result: string }) => ({ ...story, ...input }));
    const deleteStarStory = vi.fn(async () => ({ deleted: true as const }));
    renderScreen(testApi({
      interviews: async () => ({ items: [], textInterview: balance(1) }),
      starStories: async () => ({ items: [story] }),
      updateStarStory,
      deleteStarStory,
    }));
    expect(await screen.findByText('Ledger was wrong')).toBeTruthy();
    expect(screen.getByLabelText('Situation')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'Edit story: Ledger was wrong' }));
    expect(screen.getByLabelText('Situation')).toHaveProperty('value', 'Ledger was wrong');
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'Rewrote checks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateStarStory).toHaveBeenCalledWith(story.id, {
      situation: 'Ledger was wrong',
      task: 'Fix it',
      action: 'Rewrote checks',
      result: 'Reconciled the SQL ledger every week',
      factIds: [factId],
    });
    expect(await screen.findByText('Story updated.')).toBeTruthy();
    expect(screen.getByText('Rewrote checks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete story: Ledger was wrong' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete story' }));
    expect(deleteStarStory).toHaveBeenCalledWith(story.id);
    expect(await screen.findByText('Story deleted.')).toBeTruthy();
    expect(screen.getByText('No stories yet.')).toBeTruthy();
  });

  it('starts a STAR story from an answer, linked to that question’s confirmed fact', async () => {
    const answeredSession: InterviewSession = {
      ...session,
      answers: [{ id: '55555555-5555-4555-8555-555555555555', index: 1, answer: 'I used SQL to fix the ledger.', feedback: grounded, challenge: null }],
    };
    const createStarStory = vi.fn(async () => story);
    renderScreen(testApi({
      interviews: async () => ({ items: [answeredSession], textInterview: balance(1) }),
      starStories: async () => ({ items: [] }),
      createStarStory,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save as STAR story' }));
    expect(screen.getByLabelText('Action')).toHaveProperty('value', 'I used SQL to fix the ledger.');
    expect(screen.getByLabelText('Result')).toHaveProperty('value', '');
    fireEvent.change(screen.getByLabelText('Situation'), { target: { value: 'Ledger was wrong' } });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Fix it' } });
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'Reconciled the SQL ledger every week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save story' }));
    expect(createStarStory).toHaveBeenCalledWith({
      situation: 'Ledger was wrong',
      task: 'Fix it',
      action: 'I used SQL to fix the ledger.',
      result: 'Reconciled the SQL ledger every week',
      factIds: [factId],
    });
    expect(await screen.findByText('Story saved.')).toBeTruthy();
  });
});
