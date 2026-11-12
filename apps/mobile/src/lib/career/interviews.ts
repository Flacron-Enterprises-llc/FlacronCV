import { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS } from '../../../../../packages/career-shared/src/interview';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  InterviewFeedback,
  InterviewList,
  InterviewSession,
  InterviewStage,
} from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for text interview practice and STAR stories (tested in
 * interviews.test.ts). Wording follows the website (career.interviews). The
 * career API decides quotas and validation; nothing here grants or charges.
 */

export { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS };

export const STAGE_LABEL: Record<InterviewStage, string> = {
  recruiter: 'Recruiter',
  behavioral: 'Behavioral',
  technical: 'Technical',
  panel: 'Panel',
  presentation: 'Presentation',
};

export const NOT_A_SCORE = 'This is practice. It is not a hiring probability.';
export const AI_PROVIDER_MISSING =
  'Needs the AI provider, which is not configured in this environment. Nothing was charged and no text interview was used.';

export function isStage(value: string): value is InterviewStage {
  return (INTERVIEW_STAGES as readonly string[]).includes(value);
}

/** Text interviews left (included + packs), never negative. */
export function interviewsLeft(list: InterviewList | undefined): number {
  if (!list) return 0;
  return Math.max(0, list.textInterview.includedRemaining) + Math.max(0, list.textInterview.packRemaining);
}

/** The question waiting for an answer, or null when the session is complete. */
export function nextQuestion(session: InterviewSession): InterviewSession['questions'][number] | null {
  if (session.answers.length >= session.questions.length) return null;
  return session.questions[session.answers.length] ?? null;
}

export function sessionProgress(session: InterviewSession): { answered: number; total: number; complete: boolean } {
  const total = session.questions.length;
  const answered = Math.min(session.answers.length, total);
  return { answered, total, complete: total > 0 && answered >= total };
}

/** Questions paired with their answer (by question index), in question order. */
export function pairedAnswers(session: InterviewSession): Array<{
  question: InterviewSession['questions'][number];
  answer: InterviewSession['answers'][number] | null;
}> {
  const byIndex = new Map(session.answers.map((a) => [a.index, a]));
  return [...session.questions]
    .sort((a, b) => a.index - b.index)
    .map((question) => ({ question, answer: byIndex.get(question.index) ?? null }));
}

/** Plain-words feedback lines. Feedback is about the words only, never a score. */
export function feedbackLines(feedback: InterviewFeedback): Array<{ label: string; text: string; good: boolean }> {
  return [
    {
      label: 'Relevance',
      text:
        feedback.relevance === 'grounded'
          ? 'Uses your confirmed fact.'
          : feedback.relevance === 'partial'
            ? 'Partly uses your confirmed fact.'
            : 'Does not use the confirmed fact behind this question.',
      good: feedback.relevance === 'grounded',
    },
    {
      label: 'Structure',
      text: feedback.structure === 'clear' ? 'Clear structure.' : 'Thin: add the situation, what you did, and the result.',
      good: feedback.structure === 'clear',
    },
    {
      label: 'Specificity',
      text: feedback.specificity === 'specific' ? 'Specific.' : 'General: name a concrete example.',
      good: feedback.specificity === 'specific',
    },
    {
      label: 'Evidence',
      text: feedback.evidence === 'cited' ? 'Cites evidence.' : 'No evidence stated.',
      good: feedback.evidence === 'cited',
    },
  ];
}

export const STORY_FIELDS = ['situation', 'task', 'action', 'result'] as const;
export type StoryField = (typeof STORY_FIELDS)[number];
export type StoryDraft = Record<StoryField, string>;
export const STORY_FIELD_LABEL: Record<StoryField, string> = {
  situation: 'Situation',
  task: 'Task',
  action: 'Action',
  result: 'Result',
};
export const STORY_MAX = 2000;
export const ANSWER_MAX = 10_000;
export const CHALLENGE_MAX = 2000;

export const EMPTY_STORY: StoryDraft = { situation: '', task: '', action: '', result: '' };

/** Local checks before sending; the server repeats them and also refuses numbers not in confirmed facts. */
export function storyFieldErrors(draft: StoryDraft): Partial<Record<StoryField, string>> {
  const errors: Partial<Record<StoryField, string>> = {};
  for (const field of STORY_FIELDS) {
    const text = draft[field].trim();
    if (text.length === 0) errors[field] = `Add the ${field}.`;
    else if (text.length > STORY_MAX) errors[field] = `Keep it under ${STORY_MAX} characters.`;
  }
  return errors;
}

export function storyIsDirty(draft: StoryDraft): boolean {
  return STORY_FIELDS.some((field) => draft[field].trim().length > 0);
}

/** The trimmed request body for createStarStory; factIds only when the user picked some. */
export function storyInput(draft: StoryDraft, factIds: string[]): {
  situation: string;
  task: string;
  action: string;
  result: string;
  factIds?: string[];
} {
  const body = {
    situation: draft.situation.trim(),
    task: draft.task.trim(),
    action: draft.action.trim(),
    result: draft.result.trim(),
  };
  return factIds.length > 0 ? { ...body, factIds: [...factIds] } : body;
}

/** The story field the server refused, when it named one. */
export function storyErrorField(error: unknown): StoryField | null {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') return null;
  const field = error.body.field;
  return typeof field === 'string' && (STORY_FIELDS as readonly string[]).includes(field) ? (field as StoryField) : null;
}

export type InterviewAction = 'load' | 'start' | 'answer' | 'challenge' | 'story';

const FALLBACK: Record<InterviewAction, string> = {
  load: 'Interview practice could not be loaded. Nothing was changed. Try again.',
  start: 'This session was not started. Nothing was used. Try again.',
  answer: 'That answer was not saved. The words you typed are still here. Nothing extra was used.',
  challenge: 'Your note was not saved. It is still here; try again.',
  story: 'The story was not saved. Your words are still here; try again.',
};

/** Message for a refused or failed interview request. Never claims that anything was saved. */
export function interviewErrorMessage(error: unknown, action: InterviewAction): string {
  if (error instanceof ApiError) {
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'provider_unavailable') return AI_PROVIDER_MISSING;
    if (error.code === 'plan_upgrade_required') {
      return action === 'story'
        ? 'Your career plan does not include this.'
        : 'Text interview practice is not included in your current plan. You can still save a STAR story from confirmed facts.';
    }
    if (error.code === 'quota_exhausted') return 'No text interviews left. This session was not started.';
    if (error.code === 'idempotency_mismatch') return 'This request changed while it was being retried. Start it again.';
    if (error.code === 'validation_error') {
      if (reason === 'no_confirmed_facts') return 'Confirm at least one fact in your career profile first.';
      if (reason === 'session_complete') return 'This session has its ten answers.';
      if (reason === 'number_not_in_facts') return 'That number is not in your confirmed facts.';
      if (reason === 'too_many') return 'You have the most stories one account can keep.';
      if (error.body.field === 'factIds') return 'Pick facts that are still confirmed in your profile.';
      if (error.body.field === 'opportunityId') return 'Pick a saved opportunity.';
      if (error.body.field === 'answer' || error.body.field === 'note') return 'Type something first (it can be long, but not empty).';
    }
  }
  return careerErrorMessage(error, FALLBACK[action]);
}

/** The newest session first, with a short status line for the list. */
export function sessionStatus(session: InterviewSession): string {
  const { answered, total, complete } = sessionProgress(session);
  return complete ? `Complete · ${total} answers` : `${answered} of ${total} answered`;
}
