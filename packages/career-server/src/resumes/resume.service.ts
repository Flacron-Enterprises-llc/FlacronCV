import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  applyModelOrderKeepingRequired,
  composeResume,
  generateProfileReady,
  isFactType,
  isLaunchLocale,
  isDocumentLineId,
  isResumeTemplateId,
  keptGenerateFactIds,
  parseSharedCvDocument,
  projectDocument,
  patchResumeBody,
  readabilityReport,
  resumeFactIds,
  v1TemplateAfter,
  DEFAULT_RESUME_TEMPLATE,
} from '@flacroncv/career-shared';
import type { ReadabilityReport } from '@flacroncv/career-shared';
import type { ResumeBody, ResumeFactInput, ResumeTemplateId, SharedCvDocument, UncertainFields } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { minimumPlanForField } from '../metering/access';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import { exportFileName, renderResumeDocx, renderResumePdf } from './resume-document';
import { RESUME_COMPOSE_SYSTEM, RESUME_COMPOSE_TEMPLATE, parseComposeReply } from './resume-compose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DocumentCreditView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface ResumeView {
  id: string;
  title: string;
  language: 'en' | 'fr';
  templateId: string;
  createdAt: string;
  currentVersionId: string | null;
  /** Optimistic-concurrency counter shared with V1 (docs/SHARED_RECORDS.md). */
  revision: number;
}

export interface ResumeVersionView {
  id: string;
  resumeId: string;
  versionNumber: number;
  body: ResumeBody;
  /** Set when the content is a V1-shaped shared document; edit it with PUT /shared/v1/cvs/:id, not line text. */
  document: SharedCvDocument | null;
  factIds: string[];
  opportunityRevisionId: string | null;
  createdAt: string;
}

export interface ResumeFile {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

interface ResumeRow {
  id: string;
  title: string;
  language: 'en' | 'fr';
  template_id: string;
  created_at: Date;
  workspace_id: string;
  candidate_auth_user_id: string;
  revision: number;
}

interface VersionRow {
  id: string;
  resume_id: string;
  version_number: number;
  body: unknown;
  fact_ids: string[];
  opportunity_revision_id: string | null;
  created_at: Date;
  workspace_id: string;
  candidate_auth_user_id: string;
  title: string;
  /** Present on the export lookup; headings follow the resume's language. */
  language?: 'en' | 'fr';
}

interface Listing {
  revisionId: string;
  title: string;
  organization: string;
  description: string;
}

/**
 * Resumes, named versions, and exports. Creating and editing spend
 * nothing. Generate and tailor spend one document credit and insert a
 * new version. The model picks fact ids; the line text stays the fact's
 * or the person's.
 */
export class ResumeStudioService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly model: TextModel,
    private readonly metering: MeteringService,
  ) {}

  async list(owner: ProfileOwner): Promise<{ items: ResumeView[]; documentCredit: DocumentCreditView }> {
    const items = await this.pool.query<ResumeRow & { current_version_id: string | null }>(
      `SELECT r.id, r.title, r.language, r.template_id, r.created_at, r.workspace_id, r.candidate_auth_user_id, r.revision,
              (SELECT v.id FROM resume_versions v WHERE v.resume_id = r.id ORDER BY v.version_number DESC LIMIT 1) AS current_version_id
         FROM resumes r
        WHERE r.workspace_id = $1 AND r.candidate_auth_user_id = $2
        ORDER BY r.created_at, r.id`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: items.rows.map((row) => this.resumeView(row, row.current_version_id)),
      documentCredit: await this.documentCredit(owner),
    };
  }

  async create(owner: ProfileOwner, input: { title?: string; language?: string; templateId?: string }): Promise<ResumeView & { version: ResumeVersionView }> {
    const title = this.title(input.title);
    const language = this.language(input.language);
    const templateId = this.template(input.templateId);
    return withTransaction(this.pool, async (db) => {
      await this.lock(db, owner);
      await this.assertRoom(db, owner);
      const facts = await this.facts(db, owner);
      const body = composeResume(facts, templateId);
      const resume = await db.query<ResumeRow>(
        `INSERT INTO resumes (workspace_id, candidate_auth_user_id, title, language, template_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, language, template_id, created_at, workspace_id, candidate_auth_user_id, revision`,
        [owner.workspaceId, owner.authUserId, title, language, templateId],
      );
      const version = this.versionView(await this.insertVersion(db, resume.rows[0].id, body, null));
      // The first version's insert bumps the revision (trigger), so return the stored one, not the INSERT's.
      const stored = await db.query<{ revision: number }>(`SELECT revision FROM resumes WHERE id = $1`, [resume.rows[0].id]);
      return { ...this.resumeView({ ...resume.rows[0], revision: stored.rows[0].revision }, version.id), version };
    });
  }

  async get(owner: ProfileOwner, resumeId: string): Promise<ResumeView & { version: ResumeVersionView | null }> {
    const resume = await this.resume(owner, resumeId);
    const version = await this.latest(resume.id);
    return { ...this.resumeView(resume, version?.id ?? null), version };
  }

  async versions(owner: ProfileOwner, resumeId: string): Promise<{ items: ResumeVersionView[] }> {
    const resume = await this.resume(owner, resumeId);
    const rows = await this.pool.query<VersionRow>(
      `SELECT v.id, v.resume_id, v.version_number, v.body, v.fact_ids, v.opportunity_revision_id, v.created_at,
              r.workspace_id, r.candidate_auth_user_id, r.title
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE v.resume_id = $1
        ORDER BY v.version_number DESC`,
      [resume.id],
    );
    return { items: rows.rows.map((row) => this.versionView(row)) };
  }

  async updateVersion(
    owner: ProfileOwner,
    versionId: string,
    patch: { templateId?: string; confirmation?: string; lines?: Array<{ factId?: string; text?: string }>; expectedRevision?: number },
  ): Promise<ResumeVersionView> {
    const confirmation = patch.confirmation === undefined ? undefined : this.confirmation(patch.confirmation);
    const lines = (patch.lines ?? []).map((line) => ({
      factId: typeof line.factId === 'string' ? line.factId : '',
      text: typeof line.text === 'string' ? line.text : '',
    }));
    return withTransaction(this.pool, async (db) => {
      await this.lock(db, owner);
      const current = await this.versionIn(db, owner, versionId);
      if (patch.expectedRevision !== undefined) {
        const resume = await db.query<{ revision: number }>(`SELECT revision FROM resumes WHERE id = $1 FOR UPDATE`, [current.resume_id]);
        if (resume.rows[0]?.revision !== patch.expectedRevision) {
          throw new BillingError('revision_conflict', { currentRevision: resume.rows[0]?.revision });
        }
      }
      const shared = documentIn(current.body);
      // A projected line cannot be split back into V1's fields; shared documents are edited field by field.
      if (shared && lines.length > 0) throw new BillingError('validation_error', { field: 'lines', reason: 'structured_document' });
      const next = patchResumeBody(readBody(current.body), { templateId: patch.templateId, confirmation, lines });
      if (!next.ok) throw new BillingError('validation_error', { field: next.field, reason: next.reason });
      let stored: ResumeBody & { document?: SharedCvDocument } = next.body;
      if (shared) {
        const document = { ...shared, templateId: v1TemplateAfter(shared.templateId, next.body.templateId) };
        stored = { ...projectDocument(document, next.body.templateId, next.body.confirmation), document };
      }
      const saved = await db.query<VersionRow>(
        `UPDATE resume_versions v
            SET body = $2::jsonb, fact_ids = $3::uuid[]
           FROM resumes r
          WHERE v.id = $1 AND r.id = v.resume_id
          RETURNING v.id, v.resume_id, v.version_number, v.body, v.fact_ids, v.opportunity_revision_id, v.created_at,
                    r.workspace_id, r.candidate_auth_user_id, r.title`,
        [current.id, JSON.stringify(stored), storedFactIds(stored)],
      );
      if (patch.templateId && saved.rows[0]) {
        await db.query(`UPDATE resumes SET template_id = $2 WHERE id = $1`, [saved.rows[0].resume_id, next.body.templateId]);
      }
      return this.versionView(saved.rows[0]);
    });
  }

  async generate(
    owner: ProfileOwner,
    resumeId: string,
    input: { instructions?: string },
    idempotencyKey: string | undefined,
  ): Promise<MeteredResult<JsonValue>> {
    const instructions = this.instructions(input.instructions);
    const resume = await this.resume(owner, resumeId);
    const facts = await this.facts(this.pool, owner);
    return this.compose(owner, resume, facts, instructions, null, 'resume.generate', { instructions }, idempotencyKey);
  }

  async tailor(
    owner: ProfileOwner,
    resumeId: string,
    input: { opportunityId?: string },
    idempotencyKey: string | undefined,
  ): Promise<MeteredResult<JsonValue>> {
    if (!input.opportunityId || !UUID.test(input.opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    const resume = await this.resume(owner, resumeId);
    const listing = await this.listing(input.opportunityId);
    const facts = await this.facts(this.pool, owner);
    return this.compose(
      owner,
      resume,
      facts,
      '',
      listing,
      'resume.tailor',
      { opportunityId: input.opportunityId },
      idempotencyKey,
    );
  }

  /** Parsing issues on this version. No model, no job, no ledger row, no score. */
  async readability(owner: ProfileOwner, versionId: string): Promise<ReadabilityReport & { versionId: string }> {
    const version = await this.version(owner, versionId);
    return { versionId: version.id, ...readabilityReport(readBody(version.body)) };
  }

  async exportVersion(owner: ProfileOwner, versionId: string, format: string): Promise<ResumeFile> {
    if (format !== 'pdf' && format !== 'docx') throw new BillingError('validation_error', { field: 'format', reason: 'invalid' });
    const version = await this.version(owner, versionId);
    const body = readBody(version.body);
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const policy = this.exportPolicy(snapshot, account);
    if (format === 'docx' && !policy.docx) {
      throw new BillingError('plan_upgrade_required', { feature: 'docxExport', minimumPlan: 'starter' });
    }
    const bytes =
      format === 'pdf'
        ? renderResumePdf(body, version.title, policy.watermark, version.language)
        : renderResumeDocx(body, version.title, policy.watermark, version.language);
    return {
      fileName: exportFileName(version.title, format),
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes,
    };
  }

  private async compose(
    owner: ProfileOwner,
    resume: ResumeRow,
    facts: ResumeFactInput[],
    instructions: string,
    listing: Listing | null,
    kind: 'resume.generate' | 'resume.tailor',
    body: { instructions?: string; opportunityId?: string },
    idempotencyKey: string | undefined,
  ): Promise<MeteredResult<JsonValue>> {
    const templateId = isResumeTemplateId(resume.template_id) ? resume.template_id : DEFAULT_RESUME_TEMPLATE;
    const drafted = composeResume(facts, templateId);
    if (drafted.sections.length === 0) throw new BillingError('validation_error', { field: 'facts', reason: 'no_facts' });
    const ready = generateProfileReady(facts);
    if (!ready.ok) throw new BillingError('validation_error', { field: ready.field, reason: ready.reason });
    const requiredIds = keptGenerateFactIds(facts);
    const prompt = JSON.stringify({
      instructions,
      templateId,
      requiredFactIds: requiredIds,
      facts: drafted.sections.flatMap((section) => section.lines.map((line) => ({ id: line.factId, text: line.text }))),
      listing: listing ? { title: listing.title, organization: listing.organization, description: listing.description } : null,
    });
    return this.metering.run<ComposeOutput, JsonValue>({
      spender: owner,
      kind,
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey,
      body,
      requestId: randomUUID(),
      provenance: { promptTemplateVersion: RESUME_COMPOSE_TEMPLATE, outputSchemaVersion: 'resume-body@1' },
      checkCapacity: async ({ db }) => {
        await this.assertRoom(db, owner);
      },
      execute: async () => {
        const response = await completeWithin(this.model, {
          template: RESUME_COMPOSE_TEMPLATE,
          system: RESUME_COMPOSE_SYSTEM,
          prompt,
          maxTokens: 800,
          temperature: 0,
        });
        const reply = parseComposeReply(response.text);
        if (!reply) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        const ordered = applyModelOrderKeepingRequired(drafted, reply.factIds, requiredIds);
        const next: ResumeBody = { ...ordered, templateId: reply.templateId ?? ordered.templateId };
        const kept = new Set(resumeFactIds(next));
        if (next.sections.length === 0 || requiredIds.some((id) => !kept.has(id))) {
          throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        }
        return { body: next, provider: response.provider, model: response.model };
      },
      save: async (db, output) => {
        await this.lock(db, owner);
        const version = await this.insertVersion(db, resume.id, output.body, listing?.revisionId ?? null);
        if (output.body.templateId !== resume.template_id) {
          await db.query(`UPDATE resumes SET template_id = $2 WHERE id = $1`, [resume.id, output.body.templateId]);
        }
        return this.versionJson(version, output.provider, output.model);
      },
    });
  }

  private async assertRoom(db: Db, owner: ProfileOwner): Promise<void> {
    const account = await readAccount(db, owner.billingAccountId);
    const snapshot = await this.catalogs.get(db, account.catalog_version);
    const planId = this.planId(snapshot, account);
    const scope = snapshot.allowances[planId].resumeVersionScope;
    const saved = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE r.workspace_id = $1
          AND ($2::text = 'account' OR r.candidate_auth_user_id = $3)`,
      [owner.workspaceId, scope, owner.authUserId],
    );
    const running = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai_jobs
        WHERE billing_account_id = $1
          AND kind IN ('resume.generate', 'resume.tailor')
          AND status IN ('queued', 'running')`,
      [owner.billingAccountId],
    );
    const limit = snapshot.allowances[planId].resumeVersions;
    const used = saved.rows[0].n + running.rows[0].n;
    if (limit === null) {
      throw new BillingError('plan_upgrade_required', {
        feature: 'resumeVersions',
        minimumPlan: minimumPlanForField(snapshot, 'resumeVersions'),
      });
    }
    if (used + 1 > limit) throw new BillingError('capacity_exceeded', { field: 'resumeVersions', limit });
  }

  private planId(snapshot: CatalogSnapshot, account: AccountRow) {
    try {
      return v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return 'professional' as const;
    }
  }

  private exportPolicy(snapshot: CatalogSnapshot, account: AccountRow): { docx: boolean; watermark: boolean } {
    try {
      const planId = v2PlanOf(snapshot, account);
      const paid = snapshot.planOrder.indexOf(planId) >= snapshot.planOrder.indexOf('starter');
      return { docx: paid, watermark: !paid };
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return { docx: true, watermark: false };
    }
  }

  private async documentCredit(owner: ProfileOwner): Promise<DocumentCreditView> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'document_credit', new Date());
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

  private async facts(db: Db | Pool, owner: ProfileOwner): Promise<ResumeFactInput[]> {
    const rows = await db.query<{
      id: string;
      fact_type: string;
      value: unknown;
      confirmation: string;
      uncertain: unknown;
    }>(
      `SELECT id, fact_type, value, confirmation, uncertain
         FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const facts: ResumeFactInput[] = [];
    for (const row of rows.rows) {
      if (!isFactType(row.fact_type) || !isRecord(row.value)) continue;
      facts.push({
        id: row.id,
        factType: row.fact_type,
        value: row.value,
        confirmation: row.confirmation === 'confirmed' ? 'confirmed' : 'draft',
        uncertain: uncertainOf(row.uncertain),
      });
    }
    return facts;
  }

  private async listing(opportunityId: string): Promise<Listing> {
    const rows = await this.pool.query<{ id: string; title: string; organization: string; description: string }>(
      `SELECT r.id, r.title, r.organization, r.description
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found', { opportunityId });
    return { revisionId: row.id, title: row.title, organization: row.organization, description: row.description };
  }

  private async insertVersion(db: Db, resumeId: string, body: ResumeBody, opportunityRevisionId: string | null): Promise<VersionRow> {
    const numbers = await db.query<{ n: number }>(
      `SELECT coalesce(max(version_number), 0)::int AS n FROM resume_versions WHERE resume_id = $1`,
      [resumeId],
    );
    const inserted = await db.query<VersionRow>(
      `INSERT INTO resume_versions (resume_id, version_number, body, fact_ids, opportunity_revision_id)
       VALUES ($1, $2, $3::jsonb, $4::uuid[], $5)
       RETURNING id, resume_id, version_number, body, fact_ids, opportunity_revision_id, created_at,
                 (SELECT workspace_id FROM resumes WHERE id = $1) AS workspace_id,
                 (SELECT candidate_auth_user_id FROM resumes WHERE id = $1) AS candidate_auth_user_id,
                 (SELECT title FROM resumes WHERE id = $1) AS title`,
      [resumeId, numbers.rows[0].n + 1, JSON.stringify(body), storedFactIds(body), opportunityRevisionId],
    );
    return inserted.rows[0];
  }

  private async resume(owner: ProfileOwner, resumeId: string): Promise<ResumeRow> {
    if (!UUID.test(resumeId)) throw new BillingError('not_found');
    const rows = await this.pool.query<ResumeRow>(
      `SELECT id, title, language, template_id, created_at, workspace_id, candidate_auth_user_id, revision
         FROM resumes WHERE id = $1`,
      [resumeId],
    );
    return this.owned(rows.rows[0], owner);
  }

  private async version(owner: ProfileOwner, versionId: string): Promise<VersionRow> {
    if (!UUID.test(versionId)) throw new BillingError('not_found');
    const rows = await this.pool.query<VersionRow>(
      `SELECT v.id, v.resume_id, v.version_number, v.body, v.fact_ids, v.opportunity_revision_id, v.created_at,
              r.workspace_id, r.candidate_auth_user_id, r.title, r.language
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE v.id = $1`,
      [versionId],
    );
    return this.owned(rows.rows[0], owner);
  }

  private async versionIn(db: Db, owner: ProfileOwner, versionId: string): Promise<VersionRow> {
    if (!UUID.test(versionId)) throw new BillingError('not_found');
    const rows = await db.query<VersionRow>(
      `SELECT v.id, v.resume_id, v.version_number, v.body, v.fact_ids, v.opportunity_revision_id, v.created_at,
              r.workspace_id, r.candidate_auth_user_id, r.title
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE v.id = $1`,
      [versionId],
    );
    return this.owned(rows.rows[0], owner);
  }

  private async latest(resumeId: string): Promise<ResumeVersionView | null> {
    const rows = await this.pool.query<VersionRow>(
      `SELECT v.id, v.resume_id, v.version_number, v.body, v.fact_ids, v.opportunity_revision_id, v.created_at,
              r.workspace_id, r.candidate_auth_user_id, r.title
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE v.resume_id = $1
        ORDER BY v.version_number DESC
        LIMIT 1`,
      [resumeId],
    );
    return rows.rows[0] ? this.versionView(rows.rows[0]) : null;
  }

  private owned<T extends { workspace_id: string; candidate_auth_user_id: string }>(row: T | undefined, owner: ProfileOwner): T {
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private resumeView(row: ResumeRow, currentVersionId: string | null): ResumeView {
    return {
      id: row.id,
      title: row.title,
      language: row.language,
      templateId: row.template_id,
      createdAt: row.created_at.toISOString(),
      currentVersionId,
      revision: row.revision,
    };
  }

  private versionView(row: VersionRow): ResumeVersionView {
    return {
      id: row.id,
      resumeId: row.resume_id,
      versionNumber: row.version_number,
      body: readBody(row.body),
      document: documentIn(row.body),
      factIds: row.fact_ids,
      opportunityRevisionId: row.opportunity_revision_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  private versionJson(version: VersionRow, provider: string, model: string): JsonValue {
    const view = this.versionView(version);
    return {
      id: view.id,
      resumeId: view.resumeId,
      versionNumber: view.versionNumber,
      body: {
        templateId: view.body.templateId,
        confirmation: view.body.confirmation,
        sections: view.body.sections.map((section) => ({
          factType: section.factType,
          lines: section.lines.map((line) => ({
            factId: line.factId,
            factType: line.factType,
            text: line.text,
            uncertain: line.uncertain,
          })),
        })),
      },
      factIds: view.factIds,
      opportunityRevisionId: view.opportunityRevisionId,
      createdAt: view.createdAt,
      provider,
      model,
    };
  }

  private title(value: string | undefined): string {
    const title = value?.trim() ?? '';
    if (title.length < 1 || title.length > 200) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    return title;
  }

  private language(value: string | undefined): 'en' | 'fr' {
    if (!value || !isLaunchLocale(value)) throw new BillingError('validation_error', { field: 'language', reason: 'invalid' });
    return value;
  }

  private template(value: string | undefined): ResumeTemplateId {
    if (value === undefined) return DEFAULT_RESUME_TEMPLATE;
    if (!isResumeTemplateId(value)) throw new BillingError('validation_error', { field: 'templateId', reason: 'invalid' });
    return value;
  }

  private confirmation(value: string): 'draft' | 'confirmed' {
    if (value !== 'draft' && value !== 'confirmed') {
      throw new BillingError('validation_error', { field: 'confirmation', reason: 'invalid' });
    }
    return value;
  }

  private instructions(value: string | undefined): string {
    if (value === undefined) return '';
    if (value.length > 2000) throw new BillingError('validation_error', { field: 'instructions', reason: 'too_long' });
    return value;
  }

  private async lock(db: Db, owner: ProfileOwner): Promise<void> {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`resumes:${owner.workspaceId}`]);
  }
}

interface ComposeOutput {
  body: ResumeBody;
  provider: string;
  model: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uncertainOf(value: unknown): UncertainFields {
  if (!isRecord(value)) return {};
  const fields: UncertainFields = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.reason !== 'string') continue;
    const reason = entry.reason;
    if (
      reason === 'model_flagged' ||
      reason === 'unparsed_date' ||
      reason === 'date_order' ||
      reason === 'not_found_in_source' ||
      reason === 'number_not_in_source' ||
      reason === 'truncated' ||
      reason === 'invalid_format'
    ) {
      fields[key] = typeof entry.raw === 'string' ? { reason, raw: entry.raw } : { reason };
    }
  }
  return fields;
}

function documentIn(value: unknown): SharedCvDocument | null {
  if (!isRecord(value) || value.document === undefined) return null;
  const parsed = parseSharedCvDocument(value.document);
  return parsed.ok ? parsed.document : null;
}

/** Career-fact ids only; projected shared-document lines are not facts. */
function storedFactIds(body: ResumeBody): string[] {
  return resumeFactIds(body).filter((id) => !isDocumentLineId(id));
}

function readBody(value: unknown): ResumeBody {
  if (!isRecord(value) || typeof value.templateId !== 'string' || !isResumeTemplateId(value.templateId)) {
    throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
  }
  if (value.confirmation !== 'draft' && value.confirmation !== 'confirmed') {
    throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
  }
  if (!Array.isArray(value.sections)) throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
  const sections = value.sections.map((section) => {
    if (!isRecord(section) || !isFactType(section.factType) || !Array.isArray(section.lines)) {
      throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
    }
    return {
      factType: section.factType,
      lines: section.lines.map((line) => {
        if (!isRecord(line) || typeof line.factId !== 'string' || typeof line.text !== 'string' || typeof line.uncertain !== 'boolean') {
          throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
        }
        if (!isFactType(line.factType)) throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
        return { factId: line.factId, factType: line.factType, text: line.text, uncertain: line.uncertain };
      }),
    };
  });
  return { templateId: value.templateId, confirmation: value.confirmation, sections };
}
