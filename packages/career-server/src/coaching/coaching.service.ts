import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  cleanCoachReply,
  coachTitle,
  factLineText,
  isCoachLocale,
  isFactType,
  normalizeCoachQuestion,
  COACH_HISTORY_MESSAGES,
  MAX_COACH_THREADS,
  MAX_COACH_TURNS,
} from '@flacroncv/career-shared';
import type { CoachLocale } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import type { Db } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import { COACH_TEMPLATE, coachPrompt, coachSystem } from './coaching-compose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD_COLUMNS = 'id, workspace_id, candidate_auth_user_id, opportunity_id, title, created_at, updated_at';

interface ThreadRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  opportunity_id: string | null;
  title: string;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  position: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

interface Listing {
  opportunityId: string;
  revisionId: string;
  title: string;
  organization: string | null;
  description: string | null;
}

interface ReplyOutput {
  text: string;
  provider: string;
  model: string;
}

export interface CoachMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface CoachThreadSummaryView {
  id: string;
  title: string;
  opportunityId: string | null;
  messageCount: number;
  updatedAt: string;
}

export interface CoachThreadView extends CoachThreadSummaryView {
  messages: CoachMessageView[];
}

export interface CoachBalance {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface CoachList {
  items: CoachThreadSummaryView[];
  coaching: CoachBalance;
}

export interface AskCoachInput {
  question?: unknown;
  threadId?: unknown;
  opportunityId?: unknown;
  locale?: unknown;
}

/**
 * Career coach (spec section 26). Every assistant reply spends one
 * `coaching_response`; reading, listing and deleting conversations are free.
 * A failed or unusable reply spends nothing (MeteringService releases the
 * reservation). Replies are grounded in the person's confirmed facts and, when
 * chosen, one saved listing; the person's text reaches the model as JSON data.
 */
export class CoachingService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly model: TextModel,
    private readonly metering: MeteringService,
  ) {}

  async list(owner: ProfileOwner): Promise<CoachList> {
    const rows = await this.pool.query<ThreadRow & { message_count: number }>(
      `SELECT t.id, t.workspace_id, t.candidate_auth_user_id, t.opportunity_id, t.title, t.created_at, t.updated_at,
              (SELECT count(*)::int FROM coaching_messages m WHERE m.thread_id = t.id) AS message_count
         FROM coaching_threads t
        WHERE t.workspace_id = $1 AND t.candidate_auth_user_id = $2
        ORDER BY t.updated_at DESC, t.id`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => summaryView(row, row.message_count)),
      coaching: await this.balance(owner),
    };
  }

  async get(owner: ProfileOwner, threadId: unknown): Promise<CoachThreadView> {
    const thread = await this.owned(this.pool, owner, threadId);
    return threadView(thread, await this.messages(this.pool, thread.id));
  }

  async remove(owner: ProfileOwner, threadId: unknown): Promise<{ deleted: true }> {
    const thread = await this.owned(this.pool, owner, threadId);
    await this.pool.query(`DELETE FROM coaching_threads WHERE id = $1`, [thread.id]);
    return { deleted: true };
  }

  /**
   * One question, one reply. Without `threadId` this starts a conversation
   * (optionally about a saved listing). Limits: MAX_COACH_THREADS
   * conversations (`thread_limit`) and MAX_COACH_TURNS questions in one
   * (`turn_limit`), both `validation_error`, checked before anything is spent.
   */
  async ask(owner: ProfileOwner, input: AskCoachInput, idempotencyKey: string | undefined): Promise<MeteredResult<JsonValue>> {
    const question = normalizeCoachQuestion(input.question);
    if (question === null) throw new BillingError('validation_error', { field: 'question', reason: 'invalid' });
    let locale: CoachLocale = 'en';
    if (input.locale !== undefined && input.locale !== null) {
      if (!isCoachLocale(input.locale)) throw new BillingError('validation_error', { field: 'locale', reason: 'invalid' });
      locale = input.locale;
    }
    const hasThread = input.threadId !== undefined && input.threadId !== null && input.threadId !== '';
    const hasListing = input.opportunityId !== undefined && input.opportunityId !== null && input.opportunityId !== '';
    if (hasThread && hasListing) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'only_on_new_thread' });
    }
    if (hasListing && (typeof input.opportunityId !== 'string' || !UUID.test(input.opportunityId))) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }

    const thread = hasThread ? await this.owned(this.pool, owner, input.threadId) : null;
    const opportunityId = thread ? thread.opportunity_id : hasListing ? (input.opportunityId as string) : null;
    const listing = opportunityId ? await this.listingOrNull(owner, opportunityId, !thread) : null;
    const history = thread ? await this.messages(this.pool, thread.id) : [];
    // Early, friendly refusals; checkCapacity repeats them under the account lock.
    await this.checkLimits(this.pool, owner, thread?.id ?? null);

    const facts = await this.confirmedLines(owner);
    const prompt = coachPrompt({
      locale,
      question,
      history: history.slice(-COACH_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
      facts,
      listing: listing ? { title: listing.title, organization: listing.organization, description: listing.description } : null,
    });

    return this.metering.run<ReplyOutput, JsonValue>({
      spender: owner,
      kind: 'coaching.reply',
      unit: 'coaching_response',
      feature: 'coachingResponses',
      idempotencyKey,
      body: { threadId: thread?.id ?? null, opportunityId: thread ? null : (listing?.opportunityId ?? null), question, locale },
      requestId: randomUUID(),
      checkCapacity: async ({ db }) => this.checkLimits(db, owner, thread?.id ?? null),
      provenance: {
        promptTemplateVersion: COACH_TEMPLATE,
        outputSchemaVersion: 'coach-reply@1',
        inputVersions: listing ? { opportunityRevisionId: listing.revisionId } : {},
      },
      execute: async () => {
        const response = await completeWithin(this.model, {
          template: COACH_TEMPLATE,
          system: coachSystem(locale),
          prompt,
          maxTokens: 700,
          temperature: 0.3,
        });
        const text = cleanCoachReply(response.text);
        if (text === null) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        return { text, provider: response.provider, model: response.model };
      },
      save: async (db, output) => {
        let saved: ThreadRow;
        if (thread) {
          // Locks the thread so two questions at once get distinct positions.
          const locked = await db.query<ThreadRow>(`SELECT ${THREAD_COLUMNS} FROM coaching_threads WHERE id = $1 FOR UPDATE`, [thread.id]);
          if (!locked.rows[0]) throw new BillingError('not_found');
          saved = locked.rows[0];
        } else {
          const inserted = await db.query<ThreadRow>(
            `INSERT INTO coaching_threads (workspace_id, candidate_auth_user_id, opportunity_id, title)
             VALUES ($1, $2, $3, $4) RETURNING ${THREAD_COLUMNS}`,
            [owner.workspaceId, owner.authUserId, listing?.opportunityId ?? null, coachTitle(question)],
          );
          saved = inserted.rows[0];
        }
        const last = await db.query<{ n: number }>(
          `SELECT coalesce(max(position), 0)::int AS n FROM coaching_messages WHERE thread_id = $1`,
          [saved.id],
        );
        const next = last.rows[0].n + 1;
        await db.query(
          `INSERT INTO coaching_messages (thread_id, position, role, content) VALUES ($1, $2, 'user', $3)`,
          [saved.id, next, question],
        );
        await db.query(
          `INSERT INTO coaching_messages (thread_id, position, role, content, provider, model) VALUES ($1, $2, 'assistant', $3, $4, $5)`,
          [saved.id, next + 1, output.text, output.provider, output.model],
        );
        const updated = await db.query<ThreadRow>(
          `UPDATE coaching_threads SET updated_at = now() WHERE id = $1 RETURNING ${THREAD_COLUMNS}`,
          [saved.id],
        );
        return threadJson(threadView(updated.rows[0], await this.messages(db, saved.id)));
      },
    });
  }

  private async checkLimits(db: Db, owner: ProfileOwner, threadId: string | null): Promise<void> {
    if (threadId) {
      const turns = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM coaching_messages WHERE thread_id = $1 AND role = 'user'`,
        [threadId],
      );
      if (turns.rows[0].n >= MAX_COACH_TURNS) {
        throw new BillingError('validation_error', { field: 'threadId', reason: 'turn_limit', limit: MAX_COACH_TURNS });
      }
      return;
    }
    const threads = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM coaching_threads WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    if (threads.rows[0].n >= MAX_COACH_THREADS) {
      throw new BillingError('validation_error', { field: 'threads', reason: 'thread_limit', limit: MAX_COACH_THREADS });
    }
  }

  /**
   * The listing a conversation is about. On a new conversation a missing or
   * someone else's listing is `not_found` (no existence leak). On an existing
   * one the listing may since have gone; the conversation simply continues
   * without it.
   */
  private async listingOrNull(owner: ProfileOwner, opportunityId: string, required: boolean): Promise<Listing | null> {
    const rows = await this.pool.query<{
      revision_id: string;
      title: string;
      organization: string;
      description: string;
      candidate_auth_user_id: string | null;
    }>(
      `SELECT r.id AS revision_id, r.title, r.organization, r.description, o.candidate_auth_user_id
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = rows.rows[0];
    if (!row || (row.candidate_auth_user_id !== null && row.candidate_auth_user_id !== owner.authUserId)) {
      if (required) throw new BillingError('not_found');
      return null;
    }
    return {
      opportunityId,
      revisionId: row.revision_id,
      title: row.title,
      organization: row.organization || null,
      description: row.description || null,
    };
  }

  private async confirmedLines(owner: ProfileOwner): Promise<string[]> {
    const rows = await this.pool.query<{ fact_type: string; value: unknown; confirmation: string }>(
      `SELECT fact_type, value, confirmation
         FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const lines: string[] = [];
    for (const row of rows.rows) {
      if (row.confirmation !== 'confirmed' || !isFactType(row.fact_type) || !isRecord(row.value)) continue;
      const text = factLineText(row.fact_type, row.value);
      if (text.length > 0) lines.push(text);
    }
    return lines;
  }

  private async owned(db: Db, owner: ProfileOwner, threadId: unknown): Promise<ThreadRow> {
    if (typeof threadId !== 'string' || !UUID.test(threadId)) throw new BillingError('not_found');
    const rows = await db.query<ThreadRow>(`SELECT ${THREAD_COLUMNS} FROM coaching_threads WHERE id = $1`, [threadId]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async messages(db: Db, threadId: string): Promise<MessageRow[]> {
    const rows = await db.query<MessageRow>(
      `SELECT id, position, role, content, created_at FROM coaching_messages WHERE thread_id = $1 ORDER BY position`,
      [threadId],
    );
    return rows.rows;
  }

  private async balance(owner: ProfileOwner): Promise<CoachBalance> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'coaching_response', new Date());
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

function summaryView(row: ThreadRow, messageCount: number): CoachThreadSummaryView {
  return {
    id: row.id,
    title: row.title,
    opportunityId: row.opportunity_id,
    messageCount,
    updatedAt: row.updated_at.toISOString(),
  };
}

function threadView(row: ThreadRow, messages: MessageRow[]): CoachThreadView {
  return {
    ...summaryView(row, messages.length),
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at.toISOString() })),
  };
}

function threadJson(view: CoachThreadView): JsonValue {
  return {
    id: view.id,
    title: view.title,
    opportunityId: view.opportunityId,
    messageCount: view.messageCount,
    updatedAt: view.updatedAt,
    messages: view.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
