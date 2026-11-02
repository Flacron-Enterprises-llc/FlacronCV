import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import {
  documentFromBody,
  isDocumentLineId,
  letterHtmlToText,
  letterTextToHtml,
  parseSharedCvDocument,
  projectDocument,
  v2LetterTemplateFor,
  v2ResumeTemplateFor,
  COVER_LETTER_TEMPLATES,
} from '@flacroncv/career-shared';
import type { FactType, ResumeBody, ResumeTemplateId, SharedCvDocument } from '@flacroncv/career-shared';
import { withTransaction } from '../billing/db';
import { BillingError } from '../billing/errors';
import type { ProfileOwner } from '../profile/career-profile.service';

/**
 * The records V1 and V2 share (docs/SHARED_RECORDS.md), in V1's shapes.
 * V2's Postgres is the only store; nothing here copies to Firestore.
 *
 * Every write names the revision it read (`expectedRevision`, sent by the
 * client as `If-Match`). A different current revision is a
 * `revision_conflict` carrying the current one, so the caller re-reads and
 * re-applies its change instead of overwriting the other site's edit. A
 * deleted record answers `record_deleted` to reads and writes alike, so a
 * late retry cannot recreate it. A create with an idempotency key returns
 * the first attempt's record.
 *
 * Plan limits and credits are not checked here. They stay with the site
 * that sells them (V1 checks V1's plan before calling); see the doc.
 */

export interface SharedCvView {
  id: string;
  revision: number;
  /** The V2 template drawn by V2. V1 draws `document.templateId`. */
  v2TemplateId: string;
  language: 'en' | 'fr';
  createdAt: string;
  updatedAt: string;
  /** False when the latest version was composed by V2 from career facts; its document is derived. */
  documentBacked: boolean;
  document: SharedCvDocument;
}

export interface SharedLetter {
  title: string;
  content: string;
  templateId: string;
  linkedCVId: string | null;
  recipientName: string;
  recipientTitle: string;
  companyName: string;
  companyAddress: string;
  jobTitle: string;
  jobDescription: string;
  styling: Record<string, string>;
  status: 'draft' | 'final';
  aiGenerated: boolean;
  aiProvider: string | null;
}

export interface SharedLetterView {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  letter: SharedLetter;
}

type Kind = 'cv' | 'cover_letter';

interface ResumeRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  title: string;
  language: 'en' | 'fr';
  template_id: string;
  revision: number;
  created_at: Date;
}

interface VersionRow {
  id: string;
  body: Record<string, unknown>;
  created_at: Date;
}

interface LetterRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  title: string;
  body: string;
  template_id: string;
  linked_resume_id: string | null;
  confirmation: 'draft' | 'confirmed';
  shared_fields: Record<string, unknown>;
  revision: number;
  created_at: Date;
  updated_at: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const LETTER_TEXT = ['recipientName', 'recipientTitle', 'companyName', 'companyAddress', 'jobTitle'] as const;
const LETTER_TEMPLATE_IDS: readonly string[] = COVER_LETTER_TEMPLATES.map((template) => template.id);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function documentOf(body: Record<string, unknown>): SharedCvDocument | null {
  if (!isRecord(body.document)) return null;
  const parsed = parseSharedCvDocument(body.document);
  return parsed.ok ? parsed.document : null;
}

function expected(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BillingError('validation_error', { field: 'expectedRevision', reason: 'required' });
  }
  return value;
}

export class SharedRecordsService {
  constructor(private readonly pool: Pool) {}

  // ---- CVs -----------------------------------------------------------------

  async listCvs(owner: ProfileOwner): Promise<{ items: SharedCvView[] }> {
    const rows = await this.pool.query<ResumeRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, title, language, template_id, revision, created_at
         FROM resumes WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const items: SharedCvView[] = [];
    for (const row of rows.rows) items.push(await this.cvView(this.pool, row));
    return { items };
  }

  async getCv(owner: ProfileOwner, id: string): Promise<SharedCvView> {
    const resumeId = await this.resolve(this.pool, owner, 'cv', id);
    return this.cvView(this.pool, await this.ownedResume(this.pool, owner, resumeId, false));
  }

  async createCv(owner: ProfileOwner, input: unknown, idempotencyKey: string | undefined): Promise<SharedCvView> {
    const document = this.parseCv(input);
    return withTransaction(this.pool, async (db) => {
      const replay = await this.replay(db, owner, 'cv', idempotencyKey, input);
      if (replay) return this.cvView(db, await this.ownedResume(db, owner, replay, false));
      const user = await db.query<{ locale: string }>(`SELECT locale FROM users WHERE auth_user_id = $1`, [owner.authUserId]);
      const language = user.rows[0]?.locale === 'fr' ? 'fr' : 'en';
      const templateId = v2ResumeTemplateFor(document);
      const resume = await db.query<ResumeRow>(
        `INSERT INTO resumes (workspace_id, candidate_auth_user_id, title, language, template_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, workspace_id, candidate_auth_user_id, title, language, template_id, revision, created_at`,
        [owner.workspaceId, owner.authUserId, document.title, language, templateId],
      );
      await db.query(
        `INSERT INTO resume_versions (resume_id, version_number, body, fact_ids) VALUES ($1, 1, $2::jsonb, '{}')`,
        [resume.rows[0].id, JSON.stringify(this.documentBody(document, templateId, 'draft'))],
      );
      await this.remember(db, owner, 'cv', idempotencyKey, input, resume.rows[0].id);
      return this.cvView(db, await this.ownedResume(db, owner, resume.rows[0].id, false));
    });
  }

  /** Replaces the CV's content with `input`, in place on the latest version (an edit is not a new version in V2 either). */
  async updateCv(owner: ProfileOwner, id: string, input: unknown, expectedRevision: unknown): Promise<SharedCvView> {
    const want = expected(expectedRevision);
    const document = this.parseCv(input);
    return withTransaction(this.pool, async (db) => {
      const resumeId = await this.resolve(db, owner, 'cv', id);
      const resume = await this.ownedResume(db, owner, resumeId, true);
      if (resume.revision !== want) throw new BillingError('revision_conflict', { currentRevision: resume.revision });
      const latest = await this.latest(db, resume.id);
      const before = latest ? documentOf(latest.body) : null;
      // V2 may draw a V2-only template that V1 cannot; keep it unless V1 changed its own choice.
      const templateId = before && before.templateId === document.templateId ? (resume.template_id as ResumeTemplateId) : v2ResumeTemplateFor(document);
      const confirmation = latest?.body.confirmation === 'confirmed' ? 'confirmed' : 'draft';
      const body = JSON.stringify(this.documentBody(document, templateId, confirmation));
      if (latest) {
        await db.query(`UPDATE resume_versions SET body = $2::jsonb, fact_ids = '{}' WHERE id = $1`, [latest.id, body]);
      } else {
        await db.query(`INSERT INTO resume_versions (resume_id, version_number, body, fact_ids) VALUES ($1, 1, $2::jsonb, '{}')`, [resume.id, body]);
      }
      await db.query(`UPDATE resumes SET title = $2, template_id = $3 WHERE id = $1 AND (title IS DISTINCT FROM $2 OR template_id IS DISTINCT FROM $3)`, [resume.id, document.title, templateId]);
      return this.cvView(db, await this.ownedResume(db, owner, resume.id, false));
    });
  }

  /**
   * Deletes the CV for both sites. Applications keep their row and lose
   * the link (V1 did the same with a dangling id); match results computed
   * from it go with it. A tombstone refuses any later write to this id.
   */
  async deleteCv(owner: ProfileOwner, id: string, expectedRevision: unknown): Promise<{ deleted: true }> {
    const want = expected(expectedRevision);
    return withTransaction(this.pool, async (db) => {
      const resumeId = await this.resolve(db, owner, 'cv', id);
      const resume = await this.ownedResume(db, owner, resumeId, true);
      if (resume.revision !== want) throw new BillingError('revision_conflict', { currentRevision: resume.revision });
      const versions = `SELECT id FROM resume_versions WHERE resume_id = $1`;
      await db.query(`UPDATE applications SET resume_version_id = NULL WHERE resume_version_id IN (${versions})`, [resume.id]);
      await db.query(`DELETE FROM match_results WHERE resume_version_id IN (${versions})`, [resume.id]);
      await db.query(
        `INSERT INTO shared_record_tombstones (kind, record_id, candidate_auth_user_id) VALUES ('cv', $1, $2)`,
        [resume.id, owner.authUserId],
      );
      await db.query(`DELETE FROM resumes WHERE id = $1`, [resume.id]);
      return { deleted: true as const };
    });
  }

  // ---- Cover letters -------------------------------------------------------

  async listLetters(owner: ProfileOwner): Promise<{ items: SharedLetterView[] }> {
    const rows = await this.pool.query<LetterRow>(
      `${this.letterSelect()} WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND document_type = 'cover_letter' ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => this.letterView(row)) };
  }

  async getLetter(owner: ProfileOwner, id: string): Promise<SharedLetterView> {
    const letterId = await this.resolve(this.pool, owner, 'cover_letter', id);
    return this.letterView(await this.ownedLetter(this.pool, owner, letterId, false));
  }

  async createLetter(owner: ProfileOwner, input: unknown, idempotencyKey: string | undefined): Promise<SharedLetterView> {
    return withTransaction(this.pool, async (db) => {
      const replay = await this.replay(db, owner, 'cover_letter', idempotencyKey, input);
      if (replay) return this.letterView(await this.ownedLetter(db, owner, replay, false));
      const letter = await this.parseLetter(db, owner, input);
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO writing_documents (workspace_id, candidate_auth_user_id, document_type, title, body, fact_ids, linked_resume_id, confirmation, template_id, shared_fields)
         VALUES ($1, $2, 'cover_letter', $3, $4, '{}', $5, $6, $7, $8::jsonb) RETURNING id`,
        [owner.workspaceId, owner.authUserId, letter.title, letter.body, letter.linkedResumeId, letter.confirmation, letter.templateId, JSON.stringify(letter.sharedFields)],
      );
      await this.remember(db, owner, 'cover_letter', idempotencyKey, input, inserted.rows[0].id);
      return this.letterView(await this.ownedLetter(db, owner, inserted.rows[0].id, false));
    });
  }

  async updateLetter(owner: ProfileOwner, id: string, input: unknown, expectedRevision: unknown): Promise<SharedLetterView> {
    const want = expected(expectedRevision);
    return withTransaction(this.pool, async (db) => {
      const letterId = await this.resolve(db, owner, 'cover_letter', id);
      const current = await this.ownedLetter(db, owner, letterId, true);
      if (current.revision !== want) throw new BillingError('revision_conflict', { currentRevision: current.revision });
      const letter = await this.parseLetter(db, owner, input);
      await db.query(
        `UPDATE writing_documents
            SET title = $2, body = $3, linked_resume_id = $4, confirmation = $5, template_id = $6, shared_fields = $7::jsonb, updated_at = now()
          WHERE id = $1`,
        [current.id, letter.title, letter.body, letter.linkedResumeId, letter.confirmation, letter.templateId, JSON.stringify(letter.sharedFields)],
      );
      return this.letterView(await this.ownedLetter(db, owner, current.id, false));
    });
  }

  async deleteLetter(owner: ProfileOwner, id: string, expectedRevision: unknown): Promise<{ deleted: true }> {
    const want = expected(expectedRevision);
    return withTransaction(this.pool, async (db) => {
      const letterId = await this.resolve(db, owner, 'cover_letter', id);
      const current = await this.ownedLetter(db, owner, letterId, true);
      if (current.revision !== want) throw new BillingError('revision_conflict', { currentRevision: current.revision });
      await db.query(`UPDATE applications SET letter_version_id = NULL WHERE letter_version_id = $1`, [current.id]);
      await db.query(
        `INSERT INTO shared_record_tombstones (kind, record_id, candidate_auth_user_id) VALUES ('cover_letter', $1, $2)`,
        [current.id, owner.authUserId],
      );
      await db.query(`DELETE FROM writing_documents WHERE id = $1`, [current.id]);
      return { deleted: true as const };
    });
  }

  // ---- helpers -------------------------------------------------------------

  private parseCv(input: unknown): SharedCvDocument {
    const parsed = parseSharedCvDocument(input);
    if (!parsed.ok) throw new BillingError('validation_error', { field: parsed.field, reason: parsed.reason });
    return parsed.document;
  }

  private documentBody(document: SharedCvDocument, templateId: ResumeTemplateId, confirmation: 'draft' | 'confirmed'): ResumeBody & { document: SharedCvDocument } {
    return { ...projectDocument(document, templateId, confirmation), document };
  }

  /**
   * A V1 id from before the copy (Firestore auto id) is found through
   * `migration_keys`; a V2 uuid is used as is. A tombstoned id is gone.
   */
  private async resolve(db: Pool | PoolClient, owner: ProfileOwner, kind: Kind, id: string): Promise<string> {
    let recordId: string | null = null;
    if (UUID.test(id)) recordId = id.toLowerCase();
    else if (LEGACY_ID.test(id)) {
      const key = await db.query<{ destination_id: string }>(
        `SELECT destination_id FROM migration_keys WHERE origin_collection = $1 AND origin_id = $2`,
        [kind === 'cv' ? 'cvs' : 'cover_letters', id],
      );
      recordId = key.rows[0]?.destination_id ?? null;
    }
    if (!recordId) throw new BillingError('not_found');
    const tomb = await db.query<{ candidate_auth_user_id: string }>(
      `SELECT candidate_auth_user_id FROM shared_record_tombstones WHERE kind = $1 AND record_id = $2`,
      [kind, recordId],
    );
    if (tomb.rows[0]) {
      // Another person's deleted id is just not found; it says nothing about them.
      throw new BillingError(tomb.rows[0].candidate_auth_user_id === owner.authUserId ? 'record_deleted' : 'not_found');
    }
    return recordId;
  }

  private async ownedResume(db: Pool | PoolClient, owner: ProfileOwner, id: string, lock: boolean): Promise<ResumeRow> {
    const row = await db.query<ResumeRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, title, language, template_id, revision, created_at
         FROM resumes WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    const found = row.rows[0];
    if (!found) throw new BillingError('not_found');
    if (found.workspace_id !== owner.workspaceId || found.candidate_auth_user_id !== owner.authUserId) throw new BillingError('not_found');
    return found;
  }

  private async latest(db: Pool | PoolClient, resumeId: string): Promise<VersionRow | null> {
    const rows = await db.query<VersionRow>(
      `SELECT id, body, created_at FROM resume_versions WHERE resume_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [resumeId],
    );
    return rows.rows[0] ?? null;
  }

  private async cvView(db: Pool | PoolClient, resume: ResumeRow): Promise<SharedCvView> {
    const latest = await this.latest(db, resume.id);
    const stored = latest ? documentOf(latest.body) : null;
    let document = stored;
    if (!document) {
      const body = (latest?.body ?? { templateId: resume.template_id, confirmation: 'draft', sections: [] }) as unknown as ResumeBody;
      const ids = (body.sections ?? []).flatMap((section) => section.lines.map((line) => line.factId)).filter((factId) => !isDocumentLineId(factId) && UUID.test(factId));
      const facts = ids.length === 0
        ? { rows: [] as Array<{ id: string; fact_type: FactType; value: Record<string, unknown> }> }
        : await db.query<{ id: string; fact_type: FactType; value: Record<string, unknown> }>(
            `SELECT id, fact_type, value FROM career_facts WHERE id = ANY($1::uuid[]) AND candidate_auth_user_id = $2`,
            [ids, resume.candidate_auth_user_id],
          );
      document = documentFromBody(body, facts.rows.map((fact) => ({ id: fact.id, factType: fact.fact_type, value: fact.value })), { title: resume.title });
    }
    return {
      id: resume.id,
      revision: resume.revision,
      v2TemplateId: resume.template_id,
      language: resume.language,
      createdAt: resume.created_at.toISOString(),
      updatedAt: (latest?.created_at ?? resume.created_at).toISOString(),
      documentBacked: stored !== null,
      document: { ...document, title: resume.title },
    };
  }

  private letterSelect(): string {
    return `SELECT id, workspace_id, candidate_auth_user_id, title, body, template_id, linked_resume_id, confirmation, shared_fields, revision, created_at, updated_at
              FROM writing_documents`;
  }

  private async ownedLetter(db: Pool | PoolClient, owner: ProfileOwner, id: string, lock: boolean): Promise<LetterRow> {
    const rows = await db.query<LetterRow & { document_type: string }>(
      `SELECT id, workspace_id, candidate_auth_user_id, title, body, template_id, linked_resume_id, confirmation, shared_fields, revision, created_at, updated_at, document_type
         FROM writing_documents WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    const found = rows.rows[0];
    if (!found || found.document_type !== 'cover_letter') throw new BillingError('not_found');
    if (found.workspace_id !== owner.workspaceId || found.candidate_auth_user_id !== owner.authUserId) throw new BillingError('not_found');
    return found;
  }

  private letterView(row: LetterRow): SharedLetterView {
    const shared = row.shared_fields;
    const text = (key: string) => (typeof shared[key] === 'string' ? (shared[key] as string) : '');
    const html = text('contentHtml');
    // V1's HTML is returned only while it still says what the body says; after a V2 text edit it is rebuilt.
    const content = html && letterHtmlToText(html) === row.body.trim() ? html : letterTextToHtml(row.body);
    const v1Template = text('v1TemplateId');
    return {
      id: row.id,
      revision: row.revision,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      letter: {
        title: row.title,
        content,
        templateId: v1Template && v2LetterTemplateFor(v1Template) === row.template_id ? v1Template : row.template_id,
        linkedCVId: row.linked_resume_id,
        recipientName: text('recipientName'),
        recipientTitle: text('recipientTitle'),
        companyName: text('companyName'),
        companyAddress: text('companyAddress'),
        jobTitle: text('jobTitle'),
        jobDescription: text('jobDescription'),
        styling: isRecord(shared.styling) ? (shared.styling as Record<string, string>) : {},
        status: row.confirmation === 'confirmed' ? 'final' : 'draft',
        aiGenerated: shared.aiGenerated === true,
        aiProvider: text('aiProvider') || null,
      },
    };
  }

  private async parseLetter(db: PoolClient, owner: ProfileOwner, input: unknown) {
    if (!isRecord(input)) throw new BillingError('validation_error', { field: 'letter', reason: 'invalid' });
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length < 1 || title.length > 200) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    const html = input.content === undefined || input.content === null ? '' : input.content;
    if (typeof html !== 'string' || html.length > 60000) throw new BillingError('validation_error', { field: 'content', reason: 'invalid' });
    const body = letterHtmlToText(html);
    if (body.length > 20000) throw new BillingError('validation_error', { field: 'content', reason: 'too_long' });
    const v1TemplateId = typeof input.templateId === 'string' && input.templateId ? input.templateId : 'classic';
    const templateId = v2LetterTemplateFor(v1TemplateId);
    if (!LETTER_TEMPLATE_IDS.includes(templateId)) throw new BillingError('validation_error', { field: 'templateId', reason: 'invalid' });
    let linkedResumeId: string | null = null;
    if (typeof input.linkedCVId === 'string' && input.linkedCVId) {
      linkedResumeId = await this.resolve(db, owner, 'cv', input.linkedCVId);
      await this.ownedResume(db, owner, linkedResumeId, false);
    }
    const sharedFields: Record<string, unknown> = { contentHtml: html, v1TemplateId };
    for (const key of LETTER_TEXT) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > 300) throw new BillingError('validation_error', { field: key, reason: 'invalid' });
      sharedFields[key] = value;
    }
    if (input.jobDescription !== undefined && input.jobDescription !== null) {
      if (typeof input.jobDescription !== 'string' || input.jobDescription.length > 20000) throw new BillingError('validation_error', { field: 'jobDescription', reason: 'invalid' });
      sharedFields.jobDescription = input.jobDescription;
    }
    if (input.styling !== undefined) {
      if (!isRecord(input.styling) || Object.entries(input.styling).some(([key, value]) => key.length > 64 || typeof value !== 'string' || value.length > 200)) {
        throw new BillingError('validation_error', { field: 'styling', reason: 'invalid' });
      }
      sharedFields.styling = input.styling;
    }
    if (input.aiGenerated === true) sharedFields.aiGenerated = true;
    if (typeof input.aiProvider === 'string') sharedFields.aiProvider = input.aiProvider.slice(0, 64);
    return { title, body, templateId, linkedResumeId, confirmation: input.status === 'final' ? 'confirmed' : 'draft', sharedFields };
  }

  private async replay(db: PoolClient, owner: ProfileOwner, kind: Kind, key: string | undefined, input: unknown): Promise<string | null> {
    if (key === undefined) return null;
    if (key.length < 1 || key.length > 200) throw new BillingError('validation_error', { field: 'Idempotency-Key', reason: 'invalid' });
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`shared:${owner.authUserId}:${key}`]);
    const found = await db.query<{ kind: string; request_hash: string; record_id: string }>(
      `SELECT kind, request_hash, record_id FROM shared_record_requests WHERE auth_user_id = $1 AND idempotency_key = $2`,
      [owner.authUserId, key],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (row.kind !== kind || row.request_hash !== hashOf(input)) throw new BillingError('idempotency_mismatch');
    await this.resolve(db, owner, kind, row.record_id);
    return row.record_id;
  }

  private async remember(db: PoolClient, owner: ProfileOwner, kind: Kind, key: string | undefined, input: unknown, recordId: string): Promise<void> {
    if (key === undefined) return;
    await db.query(
      `INSERT INTO shared_record_requests (auth_user_id, idempotency_key, kind, request_hash, record_id) VALUES ($1, $2, $3, $4, $5)`,
      [owner.authUserId, key, kind, hashOf(input), recordId],
    );
  }
}
