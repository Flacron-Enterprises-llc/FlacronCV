import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { InterviewSession } from '../../../../../packages/career-api-client/src/types';
import {
  AI_PROVIDER_MISSING,
  EMPTY_STORY,
  INTERVIEW_STAGES,
  STAGE_LABEL,
  feedbackLines,
  interviewErrorMessage,
  interviewsLeft,
  isStage,
  nextQuestion,
  pairedAnswers,
  sessionProgress,
  sessionStatus,
  storyErrorField,
  storyFieldErrors,
  storyInput,
  storyIsDirty,
} from './interviews';

const feedback = { relevance: 'grounded', structure: 'clear', specificity: 'specific', evidence: 'cited' } as const;

function session(answered: number, total = 3): InterviewSession {
  return {
    id: 's1',
    opportunityId: 'o1',
    opportunityRevisionId: 'r1',
    stage: 'behavioral',
    title: 'Data Analyst (fixture)',
    questions: Array.from({ length: total }, (_, index) => ({ index, factId: `f${index}`, prompt: `Question ${index}` })),
    answers: Array.from({ length: answered }, (_, index) => ({
      id: `a${index}`,
      index,
      answer: `Answer ${index}`,
      feedback,
      challenge: null,
    })),
    summary: 'No answers yet.',
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

const err = (code: string, body: Record<string, unknown> = {}, status = 422) => new ApiError(status, code, { code, ...body });

describe('stages', () => {
  it('labels every stage the API accepts', () => {
    for (const stage of INTERVIEW_STAGES) expect(STAGE_LABEL[stage]).toBeTruthy();
    expect(isStage('panel')).toBe(true);
    expect(isStage('final')).toBe(false);
  });
});

describe('interviewsLeft', () => {
  it('adds included and pack sessions and never goes negative', () => {
    expect(interviewsLeft(undefined)).toBe(0);
    expect(interviewsLeft({ items: [], textInterview: { includedRemaining: 4, packRemaining: 2, renewalDate: null } })).toBe(6);
    expect(interviewsLeft({ items: [], textInterview: { includedRemaining: -1, packRemaining: 0, renewalDate: null } })).toBe(0);
  });
});

describe('session progress', () => {
  it('returns the next unanswered question', () => {
    expect(nextQuestion(session(0))?.prompt).toBe('Question 0');
    expect(nextQuestion(session(2))?.prompt).toBe('Question 2');
    expect(nextQuestion(session(3))).toBeNull();
  });

  it('reports progress and completion', () => {
    expect(sessionProgress(session(1))).toEqual({ answered: 1, total: 3, complete: false });
    expect(sessionProgress(session(3))).toEqual({ answered: 3, total: 3, complete: true });
    expect(sessionStatus(session(1))).toBe('1 of 3 answered');
    expect(sessionStatus(session(3))).toBe('Complete · 3 answers');
  });

  it('pairs answers with questions by index', () => {
    const pairs = pairedAnswers(session(2));
    expect(pairs.map((p) => p.answer?.id ?? null)).toEqual(['a0', 'a1', null]);
  });
});

describe('feedbackLines', () => {
  it('turns feedback into plain words without a score', () => {
    const lines = feedbackLines(feedback);
    expect(lines.map((l) => l.label)).toEqual(['Relevance', 'Structure', 'Specificity', 'Evidence']);
    expect(lines.every((l) => l.good)).toBe(true);
    const weak = feedbackLines({ relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' });
    expect(weak.every((l) => !l.good)).toBe(true);
    expect(weak.map((l) => l.text).join(' ')).not.toMatch(/\d+%|score/i);
  });
});

describe('STAR story drafts', () => {
  it('requires all four parts', () => {
    expect(Object.keys(storyFieldErrors(EMPTY_STORY))).toEqual(['situation', 'task', 'action', 'result']);
    const filled = { situation: 's', task: 't', action: 'a', result: 'r' };
    expect(storyFieldErrors(filled)).toEqual({});
    expect(storyFieldErrors({ ...filled, result: 'x'.repeat(2001) }).result).toMatch(/2000/);
  });

  it('is dirty once anything is typed', () => {
    expect(storyIsDirty(EMPTY_STORY)).toBe(false);
    expect(storyIsDirty({ ...EMPTY_STORY, task: ' x ' })).toBe(true);
  });

  it('trims the body and sends factIds only when picked', () => {
    const draft = { situation: ' s ', task: 't', action: 'a', result: 'r ' };
    expect(storyInput(draft, [])).toEqual({ situation: 's', task: 't', action: 'a', result: 'r' });
    expect(storyInput(draft, ['f1'])).toEqual({ situation: 's', task: 't', action: 'a', result: 'r', factIds: ['f1'] });
  });

  it('finds the refused field', () => {
    expect(storyErrorField(err('validation_error', { field: 'result', reason: 'number_not_in_facts' }))).toBe('result');
    expect(storyErrorField(err('validation_error', { field: 'factIds', reason: 'invalid' }))).toBeNull();
    expect(storyErrorField(new Error('x'))).toBeNull();
  });
});

describe('interviewErrorMessage', () => {
  it('explains the missing AI provider without claiming a charge', () => {
    expect(interviewErrorMessage(err('provider_unavailable', {}, 503), 'start')).toBe(AI_PROVIDER_MISSING);
    expect(AI_PROVIDER_MISSING).toMatch(/not configured/);
    expect(AI_PROVIDER_MISSING).toMatch(/Nothing was charged/);
  });

  it('maps plan, quota and validation refusals', () => {
    expect(interviewErrorMessage(err('plan_upgrade_required', {}, 402), 'start')).toMatch(/not included/);
    expect(interviewErrorMessage(err('quota_exhausted', {}, 402), 'start')).toMatch(/No text interviews left/);
    expect(interviewErrorMessage(err('validation_error', { field: 'result', reason: 'number_not_in_facts' }), 'story')).toBe(
      'That number is not in your confirmed facts.',
    );
    expect(interviewErrorMessage(err('validation_error', { field: 'answer', reason: 'session_complete' }), 'answer')).toMatch(/ten answers/);
    expect(interviewErrorMessage(err('validation_error', { field: 'facts', reason: 'no_confirmed_facts' }), 'start')).toMatch(/Confirm/);
  });

  it('falls back to the action message or the shared career messages', () => {
    expect(interviewErrorMessage(new Error('boom'), 'answer')).toMatch(/still here/);
    expect(interviewErrorMessage(err('network_error', {}, 0), 'load')).toMatch(/No connection/);
    expect(interviewErrorMessage(err('not_found', {}, 404), 'load')).toBe('This item no longer exists.');
  });
});
