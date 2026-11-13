import { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS } from '../../../../../packages/career-shared/src/interview';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  InterviewFeedback,
  InterviewList,
  InterviewSession,
  InterviewStage,
} from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for text interview practice and STAR stories (tested in
 * interviews.test.ts). Wording follows the website (career.interviews); the
 * copy lives in the `careerInterviews` namespace and is read with `t()` in the
 * current language. The career API decides quotas and validation; nothing
 * here grants or charges.
 */

export { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS };

/** Stage names in the current language (getters, so they are read at render time). */
export const STAGE_LABEL: Record<InterviewStage, string> = {
  get recruiter() {
    return t('careerInterviews.stages.recruiter');
  },
  get behavioral() {
    return t('careerInterviews.stages.behavioral');
  },
  get technical() {
    return t('careerInterviews.stages.technical');
  },
  get panel() {
    return t('careerInterviews.stages.panel');
  },
  get presentation() {
    return t('careerInterviews.stages.presentation');
  },
};

/** Evaluated once at import (English); screens call notAScore() for the current language. */
export const NOT_A_SCORE = t('careerInterviews.notAScore');
export const AI_PROVIDER_MISSING = t('careerInterviews.aiProviderMissing');

export function notAScore(): string {
  return t('careerInterviews.notAScore');
}

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
      label: t('careerInterviews.feedback.relevance'),
      text:
        feedback.relevance === 'grounded'
          ? t('careerInterviews.feedback.relevanceGrounded')
          : feedback.relevance === 'partial'
            ? t('careerInterviews.feedback.relevancePartial')
            : t('careerInterviews.feedback.relevanceMissing'),
      good: feedback.relevance === 'grounded',
    },
    {
      label: t('careerInterviews.feedback.structure'),
      text:
        feedback.structure === 'clear'
          ? t('careerInterviews.feedback.structureClear')
          : t('careerInterviews.feedback.structureThin'),
      good: feedback.structure === 'clear',
    },
    {
      label: t('careerInterviews.feedback.specificity'),
      text:
        feedback.specificity === 'specific'
          ? t('careerInterviews.feedback.specificitySpecific')
          : t('careerInterviews.feedback.specificityGeneral'),
      good: feedback.specificity === 'specific',
    },
    {
      label: t('careerInterviews.feedback.evidence'),
      text: feedback.evidence === 'cited' ? t('careerInterviews.feedback.evidenceCited') : t('careerInterviews.feedback.evidenceUnstated'),
      good: feedback.evidence === 'cited',
    },
  ];
}

export const STORY_FIELDS = ['situation', 'task', 'action', 'result'] as const;
export type StoryField = (typeof STORY_FIELDS)[number];
export type StoryDraft = Record<StoryField, string>;
/** STAR field names in the current language (getters, read at render time). */
export const STORY_FIELD_LABEL: Record<StoryField, string> = {
  get situation() {
    return t('careerInterviews.story.fields.situation');
  },
  get task() {
    return t('careerInterviews.story.fields.task');
  },
  get action() {
    return t('careerInterviews.story.fields.action');
  },
  get result() {
    return t('careerInterviews.story.fields.result');
  },
};

const STORY_REQUIRED: Record<StoryField, () => string> = {
  situation: () => t('careerInterviews.story.required.situation'),
  task: () => t('careerInterviews.story.required.task'),
  action: () => t('careerInterviews.story.required.action'),
  result: () => t('careerInterviews.story.required.result'),
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
    if (text.length === 0) errors[field] = STORY_REQUIRED[field]();
    else if (text.length > STORY_MAX) errors[field] = t('careerInterviews.tooLong', { max: STORY_MAX });
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

const FALLBACK: Record<InterviewAction, () => string> = {
  load: () => t('careerInterviews.fallback.load'),
  start: () => t('careerInterviews.fallback.start'),
  answer: () => t('careerInterviews.fallback.answer'),
  challenge: () => t('careerInterviews.fallback.challenge'),
  story: () => t('careerInterviews.fallback.story'),
};

/** Message for a refused or failed interview request. Never claims that anything was saved. */
export function interviewErrorMessage(error: unknown, action: InterviewAction): string {
  if (error instanceof ApiError) {
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'provider_unavailable') return t('careerInterviews.aiProviderMissing');
    if (error.code === 'plan_upgrade_required') {
      return action === 'story'
        ? t('careerInterviews.errors.planStory')
        : t('careerInterviews.errors.planText');
    }
    if (error.code === 'quota_exhausted') return t('careerInterviews.errors.quota');
    if (error.code === 'idempotency_mismatch') return t('careerInterviews.errors.idempotency');
    if (error.code === 'validation_error') {
      if (reason === 'no_confirmed_facts') return t('careerInterviews.errors.noFacts');
      if (reason === 'session_complete') return t('careerInterviews.errors.sessionComplete');
      if (reason === 'number_not_in_facts') return t('careerInterviews.errors.numberNotInFacts');
      if (reason === 'too_many') return t('careerInterviews.errors.tooManyStories');
      if (error.body.field === 'factIds') return t('careerInterviews.errors.factIds');
      if (error.body.field === 'opportunityId') return t('careerInterviews.errors.opportunityId');
      if (error.body.field === 'answer' || error.body.field === 'note') return t('careerInterviews.errors.emptyText');
    }
  }
  return careerErrorMessage(error, FALLBACK[action]());
}

/** The newest session first, with a short status line for the list. */
export function sessionStatus(session: InterviewSession): string {
  const { answered, total, complete } = sessionProgress(session);
  return complete ? t('careerInterviews.status.complete', { total }) : t('careerInterviews.status.progress', { answered, total });
}
