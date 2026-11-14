import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  DEFAULT_COVER_LETTER_TEMPLATE,
  coverLetterPromptFacts,
  coverLetterReady,
  factLineText,
  isCoverLetterTemplateId,
  isFactType,
  isWritingType,
  keptGenerateFactIds,
  writingBody,
  writingTitle,
  type CoverLetterTemplateId,
} from '@flacroncv/career-shared';
import type { ResumeFactInput, WritingType } from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { DocumentCreditView, ResumeFile } from '../resumes/resume.service';
import {
  COVER_LETTER_TEMPLATE,
  WRITING_SYSTEM,
  WRITING_TEMPLATE,
  parseWritingReply,
} from './writing-compose';
import { exportFileName, renderCoverLetterDocx, renderCoverLetterPdf } from './writing-document';
import { confirmedFullName, generateCoverLetter, targetOrganizationName } from './cover-letter-generation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 20_000;
const WRITING_COLUMNS = `id, document_type, title, body, fact_ids, opportunity_revision_id, confirmation,
              created_at, updated_at, workspace_id, candidate_auth_user_id, template_id, revision`;

interface Listing {
  revisionId: string;
  title: string;
  organization: string;
  description: string;
}

interface WritingRow {
  id: string;
  document_type: string;
  title: string;
  body: string;
  fact_ids: string[];
  opportunity_revision_id: string | null;
  confirmation: string;
  created_at: Date;
  updated_at: Date;
  workspace_id: string;
  candidate_auth_user_id: string;
  template_id: string;
  revision: number;
}

interface WritingOutput {
  title: string;
  body: string;
  factIds: string[];
  opportunityRevisionId: string | null;
  provider: string;
  model: string;
}

export interface WritingDocumentView {
  id: string;
  type: WritingType;
  title: string;
  body: string;
  factIds: string[];
  opportunityRevisionId: string | null;
  confirmation: 'draft' | 'confirmed';
  templateId: CoverLetterTemplateId;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency counter shared with V1 (docs/SHARED_RECORDS.md). */
  revision: number;
}

export interface WritingList {
  items: WritingDocumentView[];
  documentCredit: DocumentCreditView;
}

/**
 * Cover letters, bios, LinkedIn text, and outreach drafts.
 * The model picks fact ids. The body is those confirmed facts' own fields.
 * A completed generation spends one document credit. A later edit does not.
 * Nothing here sends the draft.
 */
export class WritingService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly model: TextModel,
    private readonly metering: MeteringService,
  ) {}

  async list(owner: ProfileOwner): Promise<WritingList> {
    const rows = await this.pool.query<WritingRow>(
      `SELECT ${WRITING_COLUMNS}
         FROM writing_documents
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => this.view(row)), documentCredit: await this.documentCredit(owner) };
  }

  async get(owner: ProfileOwner, documentId: string): Promise<WritingDocumentView> {
    return this.view(await this.load(this.pool, owner, documentId));
  }

  async update(
    owner: ProfileOwner,
    documentId: string,
    patch: { title?: string; body?: string; confirmation?: string; templateId?: string; expectedRevision?: number },
  ): Promise<WritingDocumentView> {
    const current = await this.load(this.pool, owner, documentId);
    const title = patch.title === undefined ? current.title : patch.title.trim();
    const body = patch.body === undefined ? current.body : patch.body.trim();
    const confirmation = patch.confirmation === undefined ? current.confirmation : patch.confirmation;
    const templateId =
      patch.templateId === undefined
        ? this.templateOf(current.template_id)
        : isCoverLetterTemplateId(patch.templateId)
          ? patch.templateId
          : DEFAULT_COVER_LETTER_TEMPLATE;
    if (title.length === 0 || title.length > 200) {
      throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    }
    if (body.length === 0 || body.length > MAX_BODY) {
      throw new BillingError('validation_error', { field: 'body', reason: 'invalid' });
    }
    if (confirmation !== 'draft' && confirmation !== 'confirmed') {
      throw new BillingError('validation_error', { field: 'confirmation', reason: 'invalid' });
    }
    const rows = await this.pool.query<WritingRow>(
      `UPDATE writing_documents
          SET title = $2, body = $3, confirmation = $4, template_id = $5, updated_at = now()
        WHERE id = $1 AND ($6::int IS NULL OR revision = $6)
        RETURNING ${WRITING_COLUMNS}`,
      [current.id, title, body, confirmation, templateId, patch.expectedRevision ?? null],
    );
    if (!rows.rows[0]) {
      // The other site (or another tab) saved since this one read it.
      const now = await this.load(this.pool, owner, documentId);
      throw new BillingError('revision_conflict', { currentRevision: now.revision });
    }
    return this.view(rows.rows[0]);
  }

  async create(
    owner: ProfileOwner,
    input: { type?: string; opportunityId?: string | null; templateId?: string },
    idempotencyKey: string | undefined,
  ): Promise<MeteredResult<JsonValue>> {
    if (!input.type || !isWritingType(input.type)) {
      throw new BillingError('validation_error', { field: 'type', reason: 'invalid' });
    }
    const type = input.type;
    const opportunityId = typeof input.opportunityId === 'string' ? input.opportunityId : null;
    if (input.opportunityId != null && input.opportunityId !== '' && !opportunityId) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    if (opportunityId !== null && !UUID.test(opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    const templateId = isCoverLetterTemplateId(input.templateId ?? '')
      ? input.templateId!
      : DEFAULT_COVER_LETTER_TEMPLATE;
    const listing = opportunityId ? await this.listing(opportunityId) : null;
    const facts = await this.facts(owner);
    const coverLetter = type === 'cover_letter';
    if (coverLetter) {
      const ready = coverLetterReady(facts);
      if (!ready.ok) throw new BillingError('validation_error', { field: ready.field, reason: ready.reason });
    } else {
      const available = writingBody(facts);
      if (available.body.length === 0) {
        throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
      }
    }
    const requiredIds = keptGenerateFactIds(facts);
    const targetOrganization = listing ? targetOrganizationName(listing) : null;
    const prompt = JSON.stringify({
      type,
      requiredFactIds: coverLetter ? requiredIds : undefined,
      facts: coverLetter
        ? coverLetterPromptFacts(facts)
        : facts
            .filter((fact) => fact.confirmation === 'confirmed')
            .map((fact) => ({ id: fact.id, text: factLineText(fact.factType, fact.value) }))
            .filter((fact) => fact.text.length > 0),
      listing: listing
        ? {
            title: listing.title,
            organization: targetOrganization,
            description: listing.description,
            role: 'target_employer',
          }
        : null,
    });
    const template = coverLetter ? COVER_LETTER_TEMPLATE : WRITING_TEMPLATE;
    return this.metering.run<WritingOutput, JsonValue>({
      spender: owner,
      kind: `writing.${type}`,
      unit: 'document_credit',
      feature: 'documentCredits',
      idempotencyKey,
      body: { type, opportunityId },
      requestId: randomUUID(),
      provenance: {
        promptTemplateVersion: template,
        outputSchemaVersion: coverLetter ? 'cover-letter@2' : 'writing-document@1',
        inputVersions: { opportunityRevisionId: listing?.revisionId ?? null },
      },
      execute: async () => {
        if (coverLetter) {
          const letter = await generateCoverLetter(this.model, facts, listing);
          return {
            title: writingTitle(type, targetOrganization),
            body: letter.body,
            factIds: letter.factIds,
            opportunityRevisionId: listing?.revisionId ?? null,
            provider: letter.provider,
            model: letter.model,
          };
        }
        const response = await completeWithin(this.model, {
          template,
          system: WRITING_SYSTEM,
          prompt,
          maxTokens: 800,
          temperature: 0,
        });
        const reply = parseWritingReply(response.text);
        if (!reply) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        const composed = writingBody(facts, reply.factIds);
        if (composed.body.length === 0 || composed.body.length > MAX_BODY) {
          throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
        }
        return {
          title: writingTitle(
            type,
            targetOrganization,
          ),
          body: composed.body,
          factIds: composed.factIds,
          opportunityRevisionId: listing?.revisionId ?? null,
          provider: response.provider,
          model: response.model,
        };
      },
      save: async (db, output) => {
        const inserted = await db.query<WritingRow>(
          `INSERT INTO writing_documents
             (workspace_id, candidate_auth_user_id, document_type, title, body, fact_ids, opportunity_revision_id, template_id)
           VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8)
           RETURNING ${WRITING_COLUMNS}`,
          [owner.workspaceId, owner.authUserId, type, output.title, output.body, output.factIds, output.opportunityRevisionId, templateId],
        );
        return this.documentJson(inserted.rows[0], output.provider, output.model);
      },
    });
  }

  async exportDocument(owner: ProfileOwner, documentId: string, format: string): Promise<ResumeFile> {
    if (format !== 'pdf' && format !== 'docx' && format !== 'txt') {
      throw new BillingError('validation_error', { field: 'format', reason: 'invalid' });
    }
    const row = await this.load(this.pool, owner, documentId);
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const policy = this.exportPolicy(snapshot, account);
    if (format === 'docx' && !policy.docx) {
      throw new BillingError('plan_upgrade_required', { feature: 'docxExport', minimumPlan: 'starter' });
    }
    if (format === 'txt') {
      return {
        fileName: exportFileName(row.title, 'txt'),
        contentType: 'text/plain; charset=utf-8',
        bytes: Buffer.from(row.body, 'utf8'),
      };
    }
    const templateId = this.templateOf(row.template_id);
    const sender = await this.senderName(owner);
    const bytes =
      format === 'pdf'
        ? renderCoverLetterPdf({
            title: row.title,
            body: row.body,
            templateId,
            watermark: policy.watermark,
            sender,
          })
        : renderCoverLetterDocx({
            title: row.title,
            body: row.body,
            watermark: policy.watermark,
            sender,
          });
    return {
      fileName: exportFileName(row.title, format),
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes,
    };
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

  private async senderName(owner: ProfileOwner): Promise<string | undefined> {
    return confirmedFullName(await this.facts(owner));
  }

  private async facts(owner: ProfileOwner): Promise<ResumeFactInput[]> {
    const rows = await this.pool.query<{
      id: string;
      fact_type: string;
      value: unknown;
      confirmation: string;
    }>(
      `SELECT id, fact_type, value, confirmation
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
        uncertain: {},
      });
    }
    return facts;
  }

  private async load(db: Pool, owner: ProfileOwner, documentId: string): Promise<WritingRow> {
    if (!UUID.test(documentId)) throw new BillingError('not_found');
    const rows = await db.query<WritingRow>(
      `SELECT ${WRITING_COLUMNS}
         FROM writing_documents WHERE id = $1`,
      [documentId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
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

  private templateOf(value: string): CoverLetterTemplateId {
    return isCoverLetterTemplateId(value) ? value : DEFAULT_COVER_LETTER_TEMPLATE;
  }

  private view(row: WritingRow): WritingDocumentView {
    if (!isWritingType(row.document_type)) throw new BillingError('not_found');
    return {
      id: row.id,
      type: row.document_type,
      title: row.title,
      body: row.body,
      factIds: row.fact_ids,
      opportunityRevisionId: row.opportunity_revision_id,
      confirmation: row.confirmation === 'confirmed' ? 'confirmed' : 'draft',
      templateId: this.templateOf(row.template_id),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      revision: row.revision,
    };
  }

  private documentJson(row: WritingRow, provider: string, model: string): JsonValue {
    const view = this.view(row);
    return {
      id: view.id,
      type: view.type,
      title: view.title,
      body: view.body,
      factIds: view.factIds,
      opportunityRevisionId: view.opportunityRevisionId,
      confirmation: view.confirmation,
      templateId: view.templateId,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      provider,
      model,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
