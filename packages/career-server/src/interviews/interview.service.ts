import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  factLineText,
  interviewFeedback,
  interviewQuestions,
  interviewSummary,
  isFactType,
  isInterviewStage,
  numbersMissingFrom,
  MAX_INTERVIEW_QUESTIONS,
} from '@flacroncv/career-shared';
import type { InterviewFeedback, InterviewQuestion, InterviewStage, ResumeFactInput } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import { INTERVIEW_SYSTEM, INTERVIEW_TEMPLATE, parseInterviewReply } from './interview-compose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ANSWER = 10_000;
const MAX_NOTE = 2_000;
const MAX_STORIES = 200;

interface Listing {
  opportunityId: string;
  revisionId: string;
  title: string;
}

interface SessionRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  opportunity_id: string;
  opportunity_revision_id: string;
  stage: string;
  title: string;
  questions: unknown;
  summary: string;
  created_at: Date;
}

interface AnswerRow {
  id: string;
  session_id: string;
  question_index: number;
  answer: string;
  feedback: unknown;
  challenge: string | null;
}

interface StoryRow {
  id: string;
  fact_ids: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  created_at: Date;
  workspace_id: string;
  candidate_auth_user_id: string;
}

interface StartOutput {
  questions: InterviewQuestion[];
  provider: string;
  model: string;
}

export interface InterviewAnswerView {
  id: string;
  index: number;
  answer: string;
  feedback: InterviewFeedback;
  challenge: string | null;
}

export interface InterviewSessionView {
  id: string;
  opportunityId: string;
  opportunityRevisionId: string;
  stage: InterviewStage;
  title: string;
  questions: InterviewQuestion[];
  answers: InterviewAnswerView[];
  summary: string;
  createdAt: string;
}

export interface StarStoryView {
  id: string;
  factIds: string[];
  situation: string;
  task: string;
  action: string;
  result: string;
  createdAt: string;
}

export interface TextInterviewBalance {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface InterviewList {
  items: InterviewSessionView[];
  textInterview: TextInterviewBalance;
}

/**
 * A text practice session. Starting it spends one text_interview.
 * Later answers, a challenge, and a saved STAR story spend nothing.
 * Questions are openings plus a confirmed fact line. A story cannot
 * introduce a number that is not already in a confirmed fact.
 */
export class InterviewService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly model: TextModel,
    private readonly metering: MeteringService,
  ) {}

  async list(owner: ProfileOwner): Promise<InterviewList> {
    const rows = await this.pool.query<SessionRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
              stage, title, questions, summary, created_at
         FROM interview_sessions
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const items: InterviewSessionView[] = [];
    for (const row of rows.rows) items.push(await this.sessionView(row));
    return { items, textInterview: await this.balance(owner) };
  }

  async get(owner: ProfileOwner, sessionId: string): Promise<InterviewSessionView> {
    return this.sessionView(await this.owned(owner, sessionId));
  }

  async start(
    owner: ProfileOwner,
    input: { opportunityId?: string; stage?: string },
    idempotencyKey: string | undefined,
  ): Promise<MeteredResult<JsonValue>> {
    if (!input.opportunityId || !UUID.test(input.opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    if (!input.stage || !isInterviewStage(input.stage)) {
      throw new BillingError('validation_error', { field: 'stage', reason: 'invalid' });
    }
    const stage = input.stage;
    const listing = await this.listing(owner, input.opportunityId);
    const facts = await this.confirmedLines(owner);
    if (facts.length === 0) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const prompt = JSON.stringify({ stage, title: listing.title, facts });
    return this.metering.run<StartOutput, JsonValue>({
      spender: owner,
      kind: 'interview.text',
      unit: 'text_interview',
      feature: 'textInterviewSessions',
      idempotencyKey,
      body: { opportunityId: listing.opportunityId, stage },
      requestId: randomUUID(),
      provenance: {
        promptTemplateVersion: INTERVIEW_TEMPLATE,
        outputSchemaVersion: 'interview-session@1',
        inputVersions: { opportunityRevisionId: listing.revisionId },
      },
      execute: async () => {
        const response = await completeWithin(this.model, {
          template: INTERVIEW_TEMPLATE,
          system: INTERVIEW_SYSTEM,
          prompt,
          maxTokens: 400,
          temperature: 0,
        });
        const reply = parseInterviewReply(response.text);
        if (!reply) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        const questions = interviewQuestions({ title: listing.title, stage, facts, factIds: reply.factIds });
        if (!questions || questions.length !== MAX_INTERVIEW_QUESTIONS) {
          throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        }
        return { questions, provider: response.provider, model: response.model };
      },
      save: async (db, output) => {
        const inserted = await db.query<SessionRow>(
          `INSERT INTO interview_sessions
             (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, stage, title, questions, summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'No answers yet.')
           RETURNING id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
                     stage, title, questions, summary, created_at`,
          [
            owner.workspaceId,
            owner.authUserId,
            listing.opportunityId,
            listing.revisionId,
            stage,
            listing.title,
            JSON.stringify(output.questions),
          ],
        );
        return this.sessionJson(inserted.rows[0], [], output.provider, output.model);
      },
    });
  }

  async answer(owner: ProfileOwner, sessionId: string, input: { answer?: string }): Promise<InterviewSessionView> {
    const session = await this.owned(owner, sessionId);
    const text = input.answer?.trim() ?? '';
    if (text.length === 0 || text.length > MAX_ANSWER) {
      throw new BillingError('validation_error', { field: 'answer', reason: 'invalid' });
    }
    const questions = questionsOf(session.questions);
    const existing = await this.answers(session.id);
    if (existing.length >= MAX_INTERVIEW_QUESTIONS) {
      throw new BillingError('validation_error', { field: 'answer', reason: 'session_complete' });
    }
    const question = questions[existing.length];
    if (!question) throw new BillingError('validation_error', { field: 'answer', reason: 'session_complete' });
    const factText = (await this.confirmedLines(owner)).find((fact) => fact.id === question.factId)?.text ?? '';
    const feedback = interviewFeedback(text, factText);
    const summary = interviewSummary(existing.length + 1, feedback);
    await this.pool.query(
      `INSERT INTO interview_answers (session_id, question_index, answer, feedback)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [session.id, question.index, text, JSON.stringify(feedback)],
    );
    await this.pool.query(`UPDATE interview_sessions SET summary = $2, updated_at = now() WHERE id = $1`, [session.id, summary]);
    return this.get(owner, session.id);
  }

  async challenge(owner: ProfileOwner, sessionId: string, input: { answerId?: string; note?: string }): Promise<InterviewSessionView> {
    const session = await this.owned(owner, sessionId);
    if (!input.answerId || !UUID.test(input.answerId)) {
      throw new BillingError('validation_error', { field: 'answerId', reason: 'invalid' });
    }
    const note = input.note?.trim() ?? '';
    if (note.length === 0 || note.length > MAX_NOTE) {
      throw new BillingError('validation_error', { field: 'note', reason: 'invalid' });
    }
    const updated = await this.pool.query(
      `UPDATE interview_answers SET challenge = $3 WHERE id = $1 AND session_id = $2`,
      [input.answerId, session.id, note],
    );
    if (updated.rowCount !== 1) throw new BillingError('not_found');
    return this.get(owner, session.id);
  }

  async stories(owner: ProfileOwner): Promise<{ items: StarStoryView[] }> {
    const rows = await this.pool.query<StoryRow>(
      `SELECT id, fact_ids, situation, task, action, result, created_at, workspace_id, candidate_auth_user_id
         FROM star_stories
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => this.storyView(row)) };
  }

  async createStory(
    owner: ProfileOwner,
    input: { situation?: string; task?: string; action?: string; result?: string; factIds?: string[] },
  ): Promise<StarStoryView> {
    const lines = await this.confirmedLines(owner);
    if (lines.length === 0) throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    const allowed = lines.map((line) => line.text).join('\n');
    const fields = ['situation', 'task', 'action', 'result'] as const;
    const stored: Record<(typeof fields)[number], string> = { situation: '', task: '', action: '', result: '' };
    for (const field of fields) {
      const text = input[field]?.trim() ?? '';
      if (text.length === 0 || text.length > MAX_NOTE) {
        throw new BillingError('validation_error', { field, reason: 'invalid' });
      }
      if (numbersMissingFrom(text, allowed).length > 0) {
        throw new BillingError('validation_error', { field, reason: 'number_not_in_facts' });
      }
      stored[field] = text;
    }
    const known = new Set(lines.map((line) => line.id));
    const requested = input.factIds ?? lines.map((line) => line.id);
    if (requested.length === 0 || requested.some((id) => !known.has(id))) {
      throw new BillingError('validation_error', { field: 'factIds', reason: 'invalid' });
    }
    const count = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM star_stories WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    if (count.rows[0].n >= MAX_STORIES) {
      throw new BillingError('validation_error', { field: 'stories', reason: 'too_many', limit: MAX_STORIES });
    }
    const inserted = await this.pool.query<StoryRow>(
      `INSERT INTO star_stories
         (workspace_id, candidate_auth_user_id, fact_ids, situation, task, action, result)
       VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7)
       RETURNING id, fact_ids, situation, task, action, result, created_at, workspace_id, candidate_auth_user_id`,
      [owner.workspaceId, owner.authUserId, requested, stored.situation, stored.task, stored.action, stored.result],
    );
    return this.storyView(inserted.rows[0]);
  }

  private async listing(owner: ProfileOwner, opportunityId: string): Promise<Listing> {
    const rows = await this.pool.query<{
      revision_id: string;
      title: string;
      candidate_auth_user_id: string | null;
    }>(
      `SELECT r.id AS revision_id, r.title, o.candidate_auth_user_id
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.candidate_auth_user_id !== null && row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return { opportunityId, revisionId: row.revision_id, title: row.title };
  }

  private async confirmedLines(owner: ProfileOwner): Promise<Array<{ id: string; text: string }>> {
    const rows = await this.pool.query<{ id: string; fact_type: string; value: unknown; confirmation: string }>(
      `SELECT id, fact_type, value, confirmation
         FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const lines: Array<{ id: string; text: string }> = [];
    for (const row of rows.rows) {
      if (row.confirmation !== 'confirmed' || !isFactType(row.fact_type) || !isRecord(row.value)) continue;
      const fact: ResumeFactInput = {
        id: row.id,
        factType: row.fact_type,
        value: row.value,
        confirmation: 'confirmed',
        uncertain: {},
      };
      const text = factLineText(fact.factType, fact.value);
      if (text.length > 0) lines.push({ id: row.id, text });
    }
    return lines;
  }

  private async owned(owner: ProfileOwner, sessionId: string): Promise<SessionRow> {
    if (!UUID.test(sessionId)) throw new BillingError('not_found');
    const rows = await this.pool.query<SessionRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
              stage, title, questions, summary, created_at
         FROM interview_sessions WHERE id = $1`,
      [sessionId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async answers(sessionId: string): Promise<AnswerRow[]> {
    const rows = await this.pool.query<AnswerRow>(
      `SELECT id, session_id, question_index, answer, feedback, challenge
         FROM interview_answers WHERE session_id = $1 ORDER BY question_index, id`,
      [sessionId],
    );
    return rows.rows;
  }

  private async sessionView(row: SessionRow): Promise<InterviewSessionView> {
    return this.view(row, await this.answers(row.id));
  }

  private view(row: SessionRow, answers: AnswerRow[]): InterviewSessionView {
    if (!isInterviewStage(row.stage)) throw new BillingError('not_found');
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      opportunityRevisionId: row.opportunity_revision_id,
      stage: row.stage,
      title: row.title,
      questions: questionsOf(row.questions),
      answers: answers.map((answer) => ({
        id: answer.id,
        index: answer.question_index,
        answer: answer.answer,
        feedback: feedbackOf(answer.feedback),
        challenge: answer.challenge,
      })),
      summary: row.summary,
      createdAt: row.created_at.toISOString(),
    };
  }

  private sessionJson(row: SessionRow, answers: AnswerRow[], provider: string, model: string): JsonValue {
    const view = this.view(row, answers);
    return {
      id: view.id,
      opportunityId: view.opportunityId,
      opportunityRevisionId: view.opportunityRevisionId,
      stage: view.stage,
      title: view.title,
      questions: view.questions.map((question) => ({ index: question.index, factId: question.factId, prompt: question.prompt })),
      answers: view.answers.map((item) => ({
        id: item.id,
        index: item.index,
        answer: item.answer,
        feedback: {
          relevance: item.feedback.relevance,
          structure: item.feedback.structure,
          specificity: item.feedback.specificity,
          evidence: item.feedback.evidence,
        },
        challenge: item.challenge,
      })),
      summary: view.summary,
      createdAt: view.createdAt,
      provider,
      model,
    };
  }

  private storyView(row: StoryRow): StarStoryView {
    return {
      id: row.id,
      factIds: row.fact_ids,
      situation: row.situation,
      task: row.task,
      action: row.action,
      result: row.result,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async balance(owner: ProfileOwner): Promise<TextInterviewBalance> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'text_interview', new Date());
      return {
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        renewalDate: balance.renewalDate.toISOString(),
      };
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return { includedRemaining: 0, packRemaining: 0, renewalDate: null };
    }
  }
}

function questionsOf(value: unknown): InterviewQuestion[] {
  if (!Array.isArray(value)) return [];
  const questions: InterviewQuestion[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.index !== 'number' || typeof item.factId !== 'string' || typeof item.prompt !== 'string') continue;
    questions.push({ index: item.index, factId: item.factId, prompt: item.prompt });
  }
  return questions;
}

function feedbackOf(value: unknown): InterviewFeedback {
  const empty: InterviewFeedback = { relevance: 'missing', structure: 'thin', specificity: 'general', evidence: 'unstated' };
  if (!isRecord(value)) return empty;
  const relevance = value.relevance === 'grounded' || value.relevance === 'partial' || value.relevance === 'missing' ? value.relevance : empty.relevance;
  const structure = value.structure === 'clear' || value.structure === 'thin' ? value.structure : empty.structure;
  const specificity = value.specificity === 'specific' || value.specificity === 'general' ? value.specificity : empty.specificity;
  const evidence = value.evidence === 'cited' || value.evidence === 'unstated' ? value.evidence : empty.evidence;
  return { relevance, structure, specificity, evidence };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
