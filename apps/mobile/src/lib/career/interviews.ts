import {
  INTERVIEW_STAGES,
  MAX_INTERVIEW_QUESTIONS,
  MAX_INTERVIEW_ROLE,
  MIN_INTERVIEW_QUESTIONS,
  interviewReport,
  type FeedbackDimension,
} from '../../../../../packages/career-shared/src/interview';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  InterviewFeedback,
  InterviewList,
  InterviewReport,
  InterviewSession,
  InterviewStage,
  StartInterviewInput,
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

export { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS, MAX_INTERVIEW_ROLE, MIN_INTERVIEW_QUESTIONS };

/** The choosable question counts (3 to 10), smallest first. */
export const QUESTION_COUNT_OPTIONS: readonly number[] = Array.from(
  { length: MAX_INTERVIEW_QUESTIONS - MIN_INTERVIEW_QUESTIONS + 1 },
  (_, i) => MIN_INTERVIEW_QUESTIONS + i,
);

/** A whole question count inside 3..10; anything unusable becomes the server default (10). */
export function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return MAX_INTERVIEW_QUESTIONS;
  return Math.min(MAX_INTERVIEW_QUESTIONS, Math.max(MIN_INTERVIEW_QUESTIONS, Math.round(value)));
}

export type InterviewTarget = { kind: 'listing'; opportunityId: string | null } | { kind: 'role'; role: string };

/**
 * The request body for starting a session, or a message saying what is
 * missing. Practice needs a saved listing or a typed role (2..120 characters);
 * the server repeats every check.
 */
export function startInterviewInput(
  target: InterviewTarget,
  stage: InterviewStage,
  questionCount: number,
): { ok: true; input: StartInterviewInput } | { ok: false; message: string } {
  const count = clampQuestionCount(questionCount);
  if (target.kind === 'listing') {
    if (!target.opportunityId) return { ok: false, message: t('careerInterviews.list.needsTarget') };
    return { ok: true, input: { opportunityId: target.opportunityId, stage, questionCount: count } };
  }
  const role = target.role.replace(/\s+/g, ' ').trim();
  if (role.length < 2) return { ok: false, message: t('careerInterviews.list.needsTarget') };
  if (role.length > MAX_INTERVIEW_ROLE) return { ok: false, message: t('careerInterviews.tooLong', { max: MAX_INTERVIEW_ROLE }) };
  return { ok: true, input: { role, stage, questionCount: count } };
}

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

/** A saved story as an editable draft. */
export function storyToDraft(story: StoryDraft): StoryDraft {
  return { situation: story.situation, task: story.task, action: story.action, result: story.result };
}

/** True when the edit differs from the saved story (trimmed, as it would be sent). */
export function storyChanged(draft: StoryDraft, saved: StoryDraft): boolean {
  return STORY_FIELDS.some((field) => draft[field].trim() !== saved[field].trim());
}

/** The story field the server refused, when it named one. */
export function storyErrorField(error: unknown): StoryField | null {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') return null;
  const field = error.body.field;
  return typeof field === 'string' && (STORY_FIELDS as readonly string[]).includes(field) ? (field as StoryField) : null;
}

export type InterviewAction = 'load' | 'start' | 'answer' | 'challenge' | 'story' | 'deleteStory';

const FALLBACK: Record<InterviewAction, () => string> = {
  load: () => t('careerInterviews.fallback.load'),
  start: () => t('careerInterviews.fallback.start'),
  answer: () => t('careerInterviews.fallback.answer'),
  challenge: () => t('careerInterviews.fallback.challenge'),
  story: () => t('careerInterviews.fallback.story'),
  deleteStory: () => t('careerInterviews.fallback.deleteStory'),
};

/** Message for a refused or failed interview request. Never claims that anything was saved. */
export function interviewErrorMessage(error: unknown, action: InterviewAction): string {
  if (error instanceof ApiError) {
    const reason = typeof error.body.reason === 'string' ? error.body.reason : null;
    if (error.code === 'provider_unavailable') return t('careerInterviews.aiProviderMissing');
    if (error.code === 'plan_upgrade_required') {
      return action === 'story' || action === 'deleteStory'
        ? t('careerInterviews.errors.planStory')
        : t('careerInterviews.errors.planText');
    }
    if (error.code === 'quota_exhausted') return t('careerInterviews.errors.quota');
    if (error.code === 'idempotency_mismatch') return t('careerInterviews.errors.idempotency');
    if (error.code === 'validation_error') {
      if (reason === 'no_confirmed_facts') return t('careerInterviews.errors.noFacts');
      if (reason === 'session_complete') return t('careerInterviews.errors.sessionComplete');
      if (reason === 'number_not_in_facts') return t('careerInterviews.errors.numberNotInFacts');
      // STAR results must come from a confirmed achievement (server: field "result").
      if (reason === 'no_confirmed_result') return t('careerInterviews.errors.noConfirmedResult');
      if (reason === 'result_not_in_facts') return t('careerInterviews.errors.resultNotInFacts');
      if (reason === 'too_many') return t('careerInterviews.errors.tooManyStories');
      if (error.body.field === 'factIds') return t('careerInterviews.errors.factIds');
      if (error.body.field === 'opportunityId') return t('careerInterviews.errors.opportunityId');
      if (error.body.field === 'role') return t('careerInterviews.list.needsTarget');
      if (error.body.field === 'questionCount') return t('careerInterviews.errors.questionCount', { min: MIN_INTERVIEW_QUESTIONS, max: MAX_INTERVIEW_QUESTIONS });
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

// ------------------------------------------------------------ session report

/**
 * The end-of-session report: the server's when it sent one, else rebuilt
 * from the stored labels with career-shared's `interviewReport` (an older
 * session replayed without `report`), exactly as the website does.
 */
export function sessionReport(session: InterviewSession): InterviewReport {
  return session.report ?? interviewReport(session.answers, session.questions.length);
}

/** Report lines in the current language: strengths, gaps, and the answers that lacked evidence. */
export function reportLines(report: InterviewReport): { strengths: string[]; gaps: string[]; evidence: string } {
  const line = (item: InterviewReport['dimensions'][number]) =>
    t('careerInterviews.session.reportDimension', { dimension: DIMENSION_LABEL[item.dimension], met: item.met, answered: item.answered });
  return {
    strengths: report.dimensions.filter((item) => item.verdict === 'strength').map(line),
    gaps: report.dimensions.filter((item) => item.verdict === 'gap').map(line),
    evidence:
      report.lackingEvidence.length > 0
        ? t('careerInterviews.session.reportLacking', { count: report.lackingEvidence.length, list: report.lackingEvidence.join(', ') })
        : t('careerInterviews.session.reportAllEvidence'),
  };
}

const DIMENSION_LABEL: Record<FeedbackDimension, string> = {
  get relevance() {
    return t('careerInterviews.feedback.relevance');
  },
  get structure() {
    return t('careerInterviews.feedback.structure');
  },
  get specificity() {
    return t('careerInterviews.feedback.specificity');
  },
  get evidence() {
    return t('careerInterviews.feedback.evidence');
  },
};

// ------------------------------------------------------------ answer → STAR story

export interface StoryPrefill {
  draft: StoryDraft;
  factIds: string[];
  /** The question number the answer was given to (1-based, as the server numbers them). */
  index: number;
}

/**
 * A STAR story started from one saved answer, as on the website: only the
 * candidate's own words go in (as the action), linked to the confirmed fact
 * the question was built from. The result stays empty because it must come
 * from a confirmed achievement, which the candidate chooses.
 */
export function storyPrefill(session: InterviewSession, answerId: string): StoryPrefill | null {
  const answer = session.answers.find((item) => item.id === answerId);
  if (!answer) return null;
  const question = session.questions.find((item) => item.index === answer.index);
  return {
    draft: { ...EMPTY_STORY, action: answer.answer.slice(0, STORY_MAX) },
    factIds: question ? [question.factId] : [],
    index: answer.index,
  };
}
