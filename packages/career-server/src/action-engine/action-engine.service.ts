import { pooledCandidate } from '../remaining/business-sponsor';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  ACTION_PACK_LETTER_ATTEMPTS,
  DEFAULT_COVER_LETTER_TEMPLATE,
  DEFAULT_RESUME_TEMPLATE,
  MIN_LISTING_TEXT,
  applyActionPackEdit,
  coverLetterReady,
  defaultActionPackChecklist,
  defaultActionPackNextSteps,
  explainMatch,
  factLineText,
  isFactType,
  statedOrganization,
  tailorActionPackResume,
} from '@flacroncv/career-shared';
import type {
  ActionPack,
  ActionPackChecklistItem,
  ActionPackComponent,
  ActionPackFit,
  ActionPackLetter,
  ActionPackProfileFactSnapshot,
  ActionPackResume,
  ActionPackSavedDocuments,
  ActionPackStatus,
  ActionPackVacancySnapshot,
  FactType,
  MatchLine,
  MatchListing,
  ResumeBody,
  ResumeFactInput,
  ResumeSection,
} from '@flacroncv/career-shared';
import { lockAccount, readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { commit, release, reserve, unitBalance } from '../billing/entitlements';
import type { LedgerRow } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { fingerprintRequest } from '../billing/fingerprint';
import type { Clock } from '../billing/billing.service';
import { minimumPlanForField, requireFeature } from '../metering/access';
import type { JsonValue, MeteredResult, UsageView } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import { isLiveSpender } from '../privacy/live-person';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { TextModel } from '../ai/text-model';
import { confirmedFullName, generateCoverLetter } from '../writing/cover-letter-generation';
import { exportFileName, renderResumeDocx, renderResumePdf } from '../resumes/resume-document';
import type { ResumeFile } from '../resumes/resume.service';
import { renderCoverLetterDocx, renderCoverLetterPdf } from '../writing/writing-document';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KIND = 'action_engine.bundle';

/**
 * How long a partial pack keeps its one reservation for a retry. The job's
 * lease is set to this, so the worker's abandoned-job sweep releases the
 * credit when the person never comes back (spec: "a final failure releases
 * its pack reservation").
 */
export const ACTION_PACK_HOLD_MS = 24 * 60 * 60 * 1000;

/** A `generating` pack untouched this long belongs to a request that died; it may be retried. */
const STALE_GENERATING_MS = 5 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PACK_COLUMNS = `p.id, p.workspace_id, p.candidate_auth_user_id, p.opportunity_id, p.opportunity_revision_id,
              p.vacancy_snapshot, p.profile_snapshot, p.fit, p.tailored_resume, p.cover_letter,
              p.checklist, p.next_steps, p.created_at, p.updated_at, p.status, p.ledger_id, p.job_id,
              p.component_errors, p.letter_attempts, p.edited_components, p.saved_resume_id,
              p.saved_resume_version_id, p.saved_letter_document_id, l.state AS ledger_state`;

interface ActionPackRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  opportunity_id: string;
  opportunity_revision_id: string;
  vacancy_snapshot: ActionPackVacancySnapshot;
  profile_snapshot: ActionPackProfileFactSnapshot[];
  fit: ActionPackFit;
  tailored_resume: ActionPackResume;
  cover_letter: ActionPackLetter | null;
  checklist: ActionPackChecklistItem[];
  next_steps: string[];
  created_at: Date;
  updated_at: Date;
  status: 'generating' | 'partial' | 'complete';
  ledger_id: string | null;
  job_id: string | null;
  component_errors: Partial<Record<ActionPackComponent, string>>;
  letter_attempts: number;
  edited_components: string[];
  saved_resume_id: string | null;
  saved_resume_version_id: string | null;
  saved_letter_document_id: string | null;
  ledger_state: LedgerRow['state'] | null;
}

export interface ActionPackBalanceView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface ActionPackList {
  items: ActionPack[];
  actionPack: ActionPackBalanceView;
}

interface ListingRow {
  opportunity_id: string;
  revision_id: string;
  title: string;
  organization: string;
  description: string;
  source_url: string | null;
  deadline: string | null;
  locations: string[];
  eligibility: Record<string, unknown>;
  compensation: Record<string, unknown>;
  status: 'open' | 'closed';
  checked_at: Date;
}

const SYSTEM_CLOCK: Clock = { now: () => new Date() };

/**
 * CV12. One pack is one `action_pack` reservation for its whole life: the
 * deterministic parts (fit, tailored résumé, checklist, next steps) are built
 * and saved with the reservation, then the letter is written. If the letter
 * fails the pack is kept as `partial` and the same reservation is held, so a
 * retry of that one component is never charged again. The credit is
 * committed only when every component exists; a final failure (attempts
 * used up, the model not configured, the person cancelling, or the hold
 * running out) releases it. Edits, the copy into Documents and downloads
 * never charge.
 */
export class ActionEngineService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    // Kept for the provider wiring; the pack drives its own reservation (see class doc).
    private readonly metering: MeteringService,
    private readonly model: TextModel,
    private readonly clock: Clock = SYSTEM_CLOCK,
  ) {}

  async list(owner: ProfileOwner): Promise<ActionPackList> {
    const rows = await this.pool.query<ActionPackRow>(
      `SELECT ${PACK_COLUMNS}
         FROM action_packs p
         LEFT JOIN usage_ledger l ON l.id = p.ledger_id
        WHERE p.workspace_id = $1 AND p.candidate_auth_user_id = $2
        ORDER BY p.created_at DESC, p.id`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => this.view(row)),
      actionPack: await this.actionPackBalance(owner),
    };
  }

  async get(owner: ProfileOwner, id: string): Promise<ActionPack> {
    return this.view(await this.load(this.pool, owner, id));
  }

  async create(
    owner: ProfileOwner,
    input: { opportunityId?: string },
    idempotencyKey?: string,
  ): Promise<MeteredResult<JsonValue>> {
    const key = idempotencyKey?.trim() ?? '';
    if (key.length === 0 || key.length > 255) {
      throw new BillingError('validation_error', { field: 'Idempotency-Key' });
    }
    const opportunityId = typeof input?.opportunityId === 'string' ? input.opportunityId : '';
    if (!UUID.test(opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid_uuid' });
    }

    const listing = await this.loadListing(owner, opportunityId);
    // A title-only paste ("abc") gives the matcher and the letter nothing to work
    // from; refuse it before anything is charged.
    if (listing.description.trim().length < MIN_LISTING_TEXT) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'listing_too_short' });
    }
    const facts = await this.loadFacts(owner);
    const confirmedFacts = facts.filter((f) => f.confirmation === 'confirmed');
    if (confirmedFacts.length === 0) {
      throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    }
    // The letter needs the same facts as the writing studio's cover letter.
    const ready = coverLetterReady(facts);
    if (!ready.ok) throw new BillingError('validation_error', { field: ready.field, reason: ready.reason });

    const parts = this.composeParts(listing, confirmedFacts);
    const fingerprint = fingerprintRequest({ kind: KIND, body: { opportunityId } });

    const started = await withTransaction<{ replay: LedgerRow } | { packId: string; jobId: string }>(this.pool, async (db) => {
      const account = await lockAccount(db, owner.billingAccountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      const prior = await db.query<LedgerRow>(
        `SELECT * FROM usage_ledger WHERE billing_account_id = $1 AND idempotency_key = $2`,
        [account.id, key],
      );
      const priorLedger = prior.rows[0];
      if (priorLedger) {
        if (priorLedger.request_fingerprint !== fingerprint) {
          throw new BillingError('idempotency_mismatch', { idempotencyKey: key });
        }
        return { replay: priorLedger };
      }
      await requireFeature(db, snapshot, 'actionPacks');
      const reserved = await reserve(
        db,
        {
          billingAccountId: account.id,
          unit: 'action_pack',
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          requestId: randomUUID(),
          candidateAuthUserId: pooledCandidate(account, owner),
        },
        (version) => this.catalogs.get(db, version),
        this.clock.now(),
      );
      const now = this.clock.now();
      // The job records provenance and holds the reservation through its lease
      // (see ACTION_PACK_HOLD_MS); it is closed when the pack completes or fails.
      const job = await db.query<{ id: string }>(
        `INSERT INTO ai_jobs
           (billing_account_id, workspace_id, owner_auth_user_id, kind, unit, ledger_id, idempotency_key, status,
            input_versions, provider, prompt_template_version, output_schema_version, created_at,
            lease_token, lease_expires_at)
         VALUES ($1, $2, $3, $4, 'action_pack', $5, $6, 'running', $7, NULL, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          account.id,
          account.workspace_id,
          owner.authUserId,
          KIND,
          reserved.ledger.id,
          key,
          JSON.stringify({ opportunityRevisionId: listing.revision_id, profileFactCount: confirmedFacts.length }),
          'action-engine@2026-11-14',
          'action-pack@3',
          now,
          randomUUID(),
          new Date(now.getTime() + ACTION_PACK_HOLD_MS),
        ],
      );
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO action_packs
           (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
            vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
            checklist, next_steps, status, ledger_id, job_id, idempotency_key, letter_attempts,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, 'generating', $11, $12, $13, 1, $14, $14)
         RETURNING id`,
        [
          owner.workspaceId,
          owner.authUserId,
          listing.opportunity_id,
          listing.revision_id,
          JSON.stringify(parts.vacancySnapshot),
          JSON.stringify(parts.profileSnapshot),
          JSON.stringify(parts.fit),
          JSON.stringify(parts.tailoredResume),
          JSON.stringify(parts.checklist),
          JSON.stringify(parts.nextSteps),
          reserved.ledger.id,
          job.rows[0].id,
          key,
          now,
        ],
      );
      return { packId: inserted.rows[0].id, jobId: job.rows[0].id };
    });

    if ('replay' in started) return this.replay(owner, started.replay);
    return this.writeLetter(owner, started.packId, started.jobId, 1);
  }

  /**
   * Retries a failed component of a partial pack under the pack's existing
   * reservation. Only the letter can fail (the other components are
   * deterministic and were saved with the pack), so `component` must be
   * `coverLetter`. No new credit is reserved.
   */
  async retry(owner: ProfileOwner, id: string, component: string): Promise<MeteredResult<JsonValue>> {
    if (component !== 'coverLetter') {
      throw new BillingError('validation_error', { field: 'component', reason: 'invalid' });
    }
    const claimed = await withTransaction(this.pool, async (db) => {
      const row = await this.load(db, owner, id, true);
      const status = this.statusOf(row);
      if (status === 'complete') throw new BillingError('validation_error', { field: 'component', reason: 'already_complete' });
      if (status === 'expired') throw new BillingError('provider_unavailable', { released: true, reason: 'pack_expired' });
      const stale = row.updated_at.getTime() < this.clock.now().getTime() - STALE_GENERATING_MS;
      if (status === 'generating' && !stale) throw new BillingError('request_in_progress', { jobId: row.job_id });
      if (row.letter_attempts >= ACTION_PACK_LETTER_ATTEMPTS) {
        throw new BillingError('validation_error', { field: 'component', reason: 'attempts_used' });
      }
      const attempts = row.letter_attempts + 1;
      await db.query(
        `UPDATE action_packs SET status = 'generating', letter_attempts = $2, updated_at = $3 WHERE id = $1`,
        [row.id, attempts, this.clock.now()],
      );
      return { jobId: row.job_id as string, attempts };
    });
    return this.writeLetter(owner, id, claimed.jobId, claimed.attempts);
  }

  /** Gives up on a partial pack: the held credit goes back and the pack is removed. */
  async cancel(owner: ProfileOwner, id: string): Promise<{ released: boolean }> {
    return withTransaction(this.pool, async (db) => {
      await lockAccount(db, owner.billingAccountId);
      const row = await this.load(db, owner, id, true);
      const status = this.statusOf(row);
      if (status === 'complete') throw new BillingError('validation_error', { field: 'id', reason: 'already_complete' });
      const stale = row.updated_at.getTime() < this.clock.now().getTime() - STALE_GENERATING_MS;
      if (status === 'generating' && !stale) throw new BillingError('request_in_progress', { jobId: row.job_id });
      const released = await this.closeFailed(db, owner, row, 'cancelled');
      return { released };
    });
  }

  /** The person's edit to any component. Never charges; facts in the résumé stay the pack's confirmed ones. */
  async update(owner: ProfileOwner, id: string, edit: unknown): Promise<ActionPack> {
    return withTransaction(this.pool, async (db) => {
      const row = await this.load(db, owner, id, true);
      const status = this.statusOf(row);
      if (status !== 'complete' && status !== 'partial') {
        throw new BillingError('validation_error', { field: 'id', reason: status === 'expired' ? 'pack_expired' : 'not_ready' });
      }
      const result = applyActionPackEdit(
        {
          fit: row.fit,
          tailoredResume: row.tailored_resume,
          coverLetter: row.cover_letter,
          checklist: row.checklist,
          nextSteps: row.next_steps,
          profileSnapshot: row.profile_snapshot,
        },
        edit,
        () => `custom-${randomUUID()}`,
      );
      if (!result.ok) throw new BillingError('validation_error', { field: result.field, reason: result.reason });
      const edited = [...new Set([...row.edited_components, ...result.edited])];
      await db.query(
        `UPDATE action_packs
            SET fit = $2, tailored_resume = $3, cover_letter = $4, checklist = $5, next_steps = $6,
                edited_components = $7, updated_at = $8
          WHERE id = $1`,
        [
          row.id,
          JSON.stringify(result.parts.fit),
          JSON.stringify(result.parts.tailoredResume),
          result.parts.coverLetter ? JSON.stringify(result.parts.coverLetter) : null,
          JSON.stringify(result.parts.checklist),
          JSON.stringify(result.parts.nextSteps),
          edited,
          this.clock.now(),
        ],
      );
      return this.view(await this.load(db, owner, id));
    });
  }

  async updateChecklist(owner: ProfileOwner, id: string, checklistId: string, done: boolean): Promise<ActionPack> {
    return withTransaction(this.pool, async (db) => {
      const current = await this.load(db, owner, id, true);
      const updatedChecklist = current.checklist.map((item) => (item.id === checklistId ? { ...item, done } : item));
      await db.query(`UPDATE action_packs SET checklist = $2, updated_at = $3 WHERE id = $1`, [
        current.id,
        JSON.stringify(updatedChecklist),
        this.clock.now(),
      ]);
      return this.view(await this.load(db, owner, id));
    });
  }

  /**
   * Copies the pack's résumé and letter into Documents (the résumé studio and
   * writing studio tables). Saving again after an edit adds a résumé version
   * and updates the letter; saving unchanged content is a no-op. Never
   * charges: the documents were paid for by the pack. A résumé copy still
   * counts toward the plan's saved-version limit.
   */
  async saveToDocuments(
    owner: ProfileOwner,
    id: string,
    input: { components?: unknown },
  ): Promise<{ actionPack: ActionPack; savedDocuments: ActionPackSavedDocuments }> {
    const wanted = Array.isArray(input?.components) ? input.components : ['tailoredResume', 'coverLetter'];
    if (wanted.length === 0 || wanted.some((c) => c !== 'tailoredResume' && c !== 'coverLetter')) {
      throw new BillingError('validation_error', { field: 'components', reason: 'invalid' });
    }
    return withTransaction(this.pool, async (db) => {
      await lockAccount(db, owner.billingAccountId);
      const row = await this.load(db, owner, id, true);
      if (this.statusOf(row) !== 'complete' || !row.cover_letter) {
        throw new BillingError('validation_error', { field: 'id', reason: 'not_ready' });
      }
      let resumeId = row.saved_resume_id;
      let versionId = row.saved_resume_version_id;
      let letterId = row.saved_letter_document_id;

      if (wanted.includes('tailoredResume')) {
        const body = resumeBodyOf(row.tailored_resume);
        // jsonb equality ignores key order, so an unchanged body is recognised.
        const saved = versionId
          ? await db.query<{ same: boolean }>(`SELECT body = $2::jsonb AS same FROM resume_versions WHERE id = $1`, [
              versionId,
              JSON.stringify(body),
            ])
          : null;
        const unchanged = saved?.rows[0]?.same === true;
        if (!unchanged) {
          await this.assertResumeRoom(db, owner);
          if (!resumeId) {
            const created = await db.query<{ id: string }>(
              `INSERT INTO resumes (workspace_id, candidate_auth_user_id, title, language, template_id)
               VALUES ($1, $2, $3, 'en', $4) RETURNING id`,
              [owner.workspaceId, owner.authUserId, clip(row.tailored_resume.title, 200), DEFAULT_RESUME_TEMPLATE],
            );
            resumeId = created.rows[0].id;
          }
          const next = await db.query<{ n: number }>(
            `SELECT coalesce(max(version_number), 0)::int + 1 AS n FROM resume_versions WHERE resume_id = $1`,
            [resumeId],
          );
          const version = await db.query<{ id: string }>(
            `INSERT INTO resume_versions (resume_id, version_number, body, fact_ids, opportunity_revision_id)
             VALUES ($1, $2, $3, $4::uuid[], $5) RETURNING id`,
            [resumeId, next.rows[0].n, JSON.stringify(body), row.tailored_resume.factIds, row.opportunity_revision_id],
          );
          versionId = version.rows[0].id;
        }
      }

      if (wanted.includes('coverLetter')) {
        const letter = row.cover_letter;
        const title = clip(letter.title, 200);
        if (letterId) {
          await db.query(
            `UPDATE writing_documents SET title = $2, body = $3, updated_at = now()
              WHERE id = $1 AND (title <> $2 OR body <> $3)`,
            [letterId, title, letter.body],
          );
        } else {
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO writing_documents
               (workspace_id, candidate_auth_user_id, document_type, title, body, fact_ids, opportunity_revision_id, template_id)
             VALUES ($1, $2, 'cover_letter', $3, $4, $5::uuid[], $6, $7)
             RETURNING id`,
            [
              owner.workspaceId,
              owner.authUserId,
              title,
              letter.body,
              letter.factIds.filter((factId) => UUID.test(factId)),
              row.opportunity_revision_id,
              DEFAULT_COVER_LETTER_TEMPLATE,
            ],
          );
          letterId = inserted.rows[0].id;
        }
      }

      await db.query(
        `UPDATE action_packs SET saved_resume_id = $2, saved_resume_version_id = $3, saved_letter_document_id = $4 WHERE id = $1`,
        [row.id, resumeId, versionId, letterId],
      );
      const actionPack = this.view(await this.load(db, owner, id));
      return {
        actionPack,
        savedDocuments: { resumeId, resumeVersionId: versionId, letterDocumentId: letterId },
      };
    });
  }

  /** PDF or DOCX of the pack's résumé or letter through the studios' exporters and the plan's export policy. */
  async exportComponent(owner: ProfileOwner, id: string, component: string, format: string): Promise<ResumeFile> {
    if (format !== 'pdf' && format !== 'docx') throw new BillingError('validation_error', { field: 'format', reason: 'invalid' });
    if (component !== 'tailoredResume' && component !== 'coverLetter') {
      throw new BillingError('validation_error', { field: 'component', reason: 'invalid' });
    }
    const row = await this.load(this.pool, owner, id);
    if (this.statusOf(row) !== 'complete' || !row.cover_letter) {
      throw new BillingError('validation_error', { field: 'id', reason: 'not_ready' });
    }
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const policy = exportPolicy(snapshot, account);
    if (format === 'docx' && !policy.docx) {
      throw new BillingError('plan_upgrade_required', { feature: 'docxExport', minimumPlan: 'starter' });
    }
    const contentType =
      format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (component === 'tailoredResume') {
      const body = resumeBodyOf(row.tailored_resume);
      const title = row.tailored_resume.title;
      const bytes = format === 'pdf' ? renderResumePdf(body, title, policy.watermark) : renderResumeDocx(body, title, policy.watermark);
      return { fileName: exportFileName(title, format), contentType, bytes };
    }
    const letter = row.cover_letter;
    const sender = confirmedFullName(snapshotFacts(row.profile_snapshot));
    const bytes =
      format === 'pdf'
        ? renderCoverLetterPdf({ title: letter.title, body: letter.body, templateId: DEFAULT_COVER_LETTER_TEMPLATE, watermark: policy.watermark, sender })
        : renderCoverLetterDocx({ title: letter.title, body: letter.body, watermark: policy.watermark, sender });
    return { fileName: exportFileName(letter.title, format), contentType, bytes };
  }

  /**
   * One letter attempt for a pack that holds its reservation. Success
   * commits the credit; a failure keeps the pack partial (credit still held)
   * unless it is final, in which case the credit is released and the pack
   * removed, exactly like the old all-or-nothing run.
   */
  private async writeLetter(
    owner: ProfileOwner,
    packId: string,
    jobId: string,
    attempt: number,
  ): Promise<MeteredResult<JsonValue>> {
    const row = await this.load(this.pool, owner, packId);
    const facts = snapshotFacts(row.profile_snapshot);
    let letter: ActionPackLetter;
    let provider: { provider: string; model: string };
    try {
      const generated = await generateCoverLetter(this.model, facts, {
        title: row.vacancy_snapshot.title,
        organization: row.vacancy_snapshot.organization ?? '',
        description: row.vacancy_snapshot.description,
      });
      const signer = confirmedFullName(facts);
      const organization = row.vacancy_snapshot.organization;
      const title = row.vacancy_snapshot.title;
      letter = {
        title: organization ? `Cover Letter - ${title} at ${organization}` : `Cover Letter - ${title}`,
        body: signer ? `${generated.body}\n\n${signer}` : generated.body,
        factIds: generated.factIds,
      };
      provider = { provider: generated.provider, model: generated.model };
    } catch (error) {
      const reason = isBillingError(error) && typeof error.details.reason === 'string' ? error.details.reason : 'provider_error';
      // Not configured cannot succeed on retry, and an unexpected error is not a
      // provider hiccup: both are final, like the attempts running out.
      const final =
        !isBillingError(error, 'provider_unavailable') ||
        reason === 'ai_not_configured' ||
        attempt >= ACTION_PACK_LETTER_ATTEMPTS;
      const released = await withTransaction(this.pool, async (db) => {
        await lockAccount(db, owner.billingAccountId);
        const current = await this.load(db, owner, packId, true);
        if (final) return this.closeFailed(db, owner, current, reason);
        await db.query(
          `UPDATE action_packs SET status = 'partial', component_errors = $2, updated_at = $3 WHERE id = $1`,
          [packId, JSON.stringify({ coverLetter: reason }), this.clock.now()],
        );
        return false;
      });
      if (final) {
        if (isBillingError(error) && !isBillingError(error, 'provider_unavailable')) throw error;
        throw new BillingError('provider_unavailable', {
          released,
          jobId,
          reason,
          ...(isBillingError(error) && typeof error.details.claim === 'string' ? { claim: error.details.claim } : {}),
        });
      }
      const partial = await this.load(this.pool, owner, packId);
      return {
        result: this.view(partial) as unknown as JsonValue,
        usage: await this.usage(owner.billingAccountId, 'reserved'),
        jobId,
        replayed: false,
      };
    }

    const saved = await withTransaction(this.pool, async (db) => {
      await lockAccount(db, owner.billingAccountId);
      const current = await this.load(db, owner, packId, true);
      // Saved nothing for a person whose account is being deleted; the hold goes back.
      if (!(await isLiveSpender(db, owner))) {
        await this.closeFailed(db, owner, current, 'account_deleted');
        throw new BillingError('permission_denied', { reason: 'account_deleted' });
      }
      if (current.ledger_state !== 'reserved' || !current.ledger_id) {
        throw new BillingError('provider_unavailable', { released: true, reason: 'pack_expired' });
      }
      await db.query(
        `UPDATE action_packs SET cover_letter = $2, status = 'complete', component_errors = '{}'::jsonb, updated_at = $3
          WHERE id = $1`,
        [packId, JSON.stringify(letter), this.clock.now()],
      );
      await commit(db, owner.billingAccountId, current.ledger_id, this.clock.now());
      const view = this.view(await this.load(db, owner, packId));
      await db.query(
        `UPDATE ai_jobs SET status = 'succeeded', result = $2, finished_at = $3, provider = $4 WHERE id = $1`,
        [jobId, JSON.stringify(view), this.clock.now(), provider.provider],
      );
      return view;
    });
    return {
      result: saved as unknown as JsonValue,
      usage: await this.usage(owner.billingAccountId, 'committed'),
      jobId,
      replayed: false,
    };
  }

  /** Releases a held reservation (if still held), closes the job and removes the unfinished pack. */
  private async closeFailed(db: Db, owner: ProfileOwner, row: ActionPackRow, code: string): Promise<boolean> {
    let released = false;
    if (row.ledger_id && row.ledger_state === 'reserved') {
      await release(db, owner.billingAccountId, row.ledger_id, this.clock.now());
      released = true;
    } else if (row.ledger_state === 'released') {
      released = true;
    }
    if (row.job_id) {
      await db.query(
        `UPDATE ai_jobs SET status = 'failed', error_code = $2, finished_at = $3 WHERE id = $1 AND status = 'running'`,
        [row.job_id, code.slice(0, 64), this.clock.now()],
      );
    }
    await db.query(`DELETE FROM action_packs WHERE id = $1`, [row.id]);
    return released;
  }

  private async replay(owner: ProfileOwner, ledger: LedgerRow): Promise<MeteredResult<JsonValue>> {
    const rows = await this.pool.query<ActionPackRow>(
      `SELECT ${PACK_COLUMNS}
         FROM action_packs p
         LEFT JOIN usage_ledger l ON l.id = p.ledger_id
        WHERE p.ledger_id = $1 AND p.workspace_id = $2 AND p.candidate_auth_user_id = $3`,
      [ledger.id, owner.workspaceId, owner.authUserId],
    );
    const job = await this.pool.query<{ id: string }>(`SELECT id FROM ai_jobs WHERE ledger_id = $1`, [ledger.id]);
    const row = rows.rows[0];
    if (!row) {
      if (ledger.state === 'released') {
        throw new BillingError('provider_unavailable', { released: true, jobId: job.rows[0]?.id });
      }
      throw new BillingError('request_in_progress', { jobId: job.rows[0]?.id });
    }
    return {
      result: this.view(row) as unknown as JsonValue,
      usage: await this.usage(owner.billingAccountId, ledger.state),
      jobId: job.rows[0]?.id ?? row.job_id ?? '',
      replayed: true,
    };
  }

  private composeParts(listing: ListingRow, confirmedFacts: ResumeFactInput[]) {
    const organization = statedOrganization(listing.organization);
    // 1. Explainable match on the facts' readable text (not their JSON, whose
    // keys would otherwise "match" listing words).
    const matchLines: MatchLine[] = confirmedFacts
      .map((f) => ({ factId: f.id, text: factLineText(f.factType, f.value), confirmed: true }))
      .filter((line) => line.text.length > 0);
    const matchListing: MatchListing = {
      status: listing.status,
      deadline: listing.deadline,
      title: listing.title,
      description: listing.description,
      locations: Array.isArray(listing.locations) ? listing.locations : [],
      payKnown: compensationKnown(listing.compensation),
      sponsorship: sponsorshipOf(listing.eligibility),
    };
    const today = this.clock.now().toISOString().slice(0, 10);
    const explanation = explainMatch(matchListing, matchLines, today);
    const reasonTokens = [...new Set(explanation.reasons.map((r) => r.token))];
    const gapTokens = explanation.gaps.map((g) => g.token);
    const fit: ActionPackFit = {
      fit: explanation.fit,
      overlap: explanation.overlap,
      reasons: reasonTokens.map((token) => `Confirmed experience matching ${token}`),
      gaps: gapTokens.map((token) => `Missing direct evidence for ${token}`),
      unknowns: explanation.unknowns.map((u) => u.code),
      reasonTokens,
      gapTokens,
    };

    // 2. Résumé tailored to this listing from confirmed facts only: the most
    // relevant first, unmatched optional facts left out (and listed).
    const tailored = tailorActionPackResume(confirmedFacts, `${listing.title}\n${listing.description}`);
    const tailoredResume: ActionPackResume = {
      title: `Tailored Resume - ${listing.title}`,
      lines: tailored.lines,
      factIds: tailored.factIds,
      relevance: tailored.relevance,
      omittedFactIds: tailored.omittedFactIds,
    };

    const vacancySnapshot: ActionPackVacancySnapshot = {
      title: listing.title,
      organization,
      description: listing.description,
      sourceUrl: listing.source_url,
      deadline: listing.deadline,
      checkedAt: listing.checked_at.toISOString(),
      revisionId: listing.revision_id,
    };
    const profileSnapshot: ActionPackProfileFactSnapshot[] = confirmedFacts.map((f) => ({
      id: f.id,
      factType: f.factType,
      value: f.value,
    }));
    return {
      fit,
      tailoredResume,
      checklist: defaultActionPackChecklist(listing.title, organization),
      nextSteps: defaultActionPackNextSteps(fit.fit, gapTokens.length),
      vacancySnapshot,
      profileSnapshot,
    };
  }

  private async assertResumeRoom(db: Db, owner: ProfileOwner): Promise<void> {
    const account = await readAccount(db, owner.billingAccountId);
    const snapshot = await this.catalogs.get(db, account.catalog_version);
    let planId;
    try {
      planId = v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return;
    }
    const limit = snapshot.allowances[planId].resumeVersions;
    if (limit === null) {
      throw new BillingError('plan_upgrade_required', {
        feature: 'resumeVersions',
        minimumPlan: minimumPlanForField(snapshot, 'resumeVersions'),
      });
    }
    const scope = snapshot.allowances[planId].resumeVersionScope;
    const saved = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE r.workspace_id = $1
          AND ($2::text = 'account' OR r.candidate_auth_user_id = $3)`,
      [owner.workspaceId, scope, owner.authUserId],
    );
    if (saved.rows[0].n + 1 > limit) throw new BillingError('capacity_exceeded', { field: 'resumeVersions', limit });
  }

  private async load(db: Db | Pool, owner: ProfileOwner, id: string, forUpdate = false): Promise<ActionPackRow> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await db.query<ActionPackRow>(
      `SELECT ${PACK_COLUMNS}
         FROM action_packs p
         LEFT JOIN usage_ledger l ON l.id = p.ledger_id
        WHERE p.id = $1
        ${forUpdate ? 'FOR UPDATE OF p' : ''}`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async loadListing(owner: ProfileOwner, opportunityId: string): Promise<ListingRow> {
    const res = await this.pool.query<ListingRow>(
      `SELECT o.id AS opportunity_id, r.id AS revision_id, r.title, r.organization, r.description,
              r.source_url, r.deadline, r.locations, r.eligibility, r.compensation, r.status, r.checked_at
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1
          -- A pasted listing is private to the candidate who pasted it; another
          -- user's id must look exactly like a missing listing (no existence leak).
          AND (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $2)`,
      [opportunityId, owner.authUserId],
    );
    const row = res.rows[0];
    if (!row) throw new BillingError('not_found', { opportunityId });
    return row;
  }

  private async loadFacts(owner: ProfileOwner): Promise<ResumeFactInput[]> {
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

  private async usage(billingAccountId: string, ledgerState: LedgerRow['state']): Promise<UsageView> {
    const account = await readAccount(this.pool, billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const balance = await unitBalance(this.pool, account, snapshot, 'action_pack', this.clock.now());
    return {
      unit: 'action_pack',
      includedGranted: balance.includedGranted,
      includedRemaining: balance.includedRemaining,
      packRemaining: balance.packRemaining,
      packHeld: balance.packHeld,
      renewalDate: balance.renewalDate,
      ledgerState,
    };
  }

  private async actionPackBalance(owner: ProfileOwner): Promise<ActionPackBalanceView> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'action_pack', this.clock.now());
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

  /** A pack not yet complete whose reservation was released (hold ran out) is expired. */
  private statusOf(row: ActionPackRow): ActionPackStatus {
    if (row.status === 'complete') return 'complete';
    if (row.ledger_state === 'released') return 'expired';
    return row.status;
  }

  private view(row: ActionPackRow): ActionPack {
    return {
      id: row.id,
      status: this.statusOf(row),
      componentErrors: row.component_errors ?? {},
      letterAttempts: row.letter_attempts,
      editedComponents: (row.edited_components ?? []) as ActionPackComponent[],
      savedDocuments: {
        resumeId: row.saved_resume_id,
        resumeVersionId: row.saved_resume_version_id,
        letterDocumentId: row.saved_letter_document_id,
      },
      opportunityId: row.opportunity_id,
      opportunityRevisionId: row.opportunity_revision_id,
      // Packs saved before the fix may hold the storage marker; it is never shown.
      vacancySnapshot: { ...row.vacancy_snapshot, organization: statedOrganization(row.vacancy_snapshot.organization) },
      profileSnapshot: row.profile_snapshot,
      fit: row.fit,
      tailoredResume: row.tailored_resume,
      coverLetter: row.cover_letter,
      checklist: row.checklist,
      nextSteps: row.next_steps,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

/** The pack's frozen confirmed facts, as generator input. */
function snapshotFacts(snapshot: ActionPackProfileFactSnapshot[]): ResumeFactInput[] {
  return snapshot
    .filter((fact): fact is ActionPackProfileFactSnapshot & { factType: FactType } => isFactType(fact.factType))
    .map((fact) => ({ id: fact.id, factType: fact.factType, value: fact.value, confirmation: 'confirmed', uncertain: {} }));
}

/** Pack lines as a résumé body: one section per fact type, in the order the person left them. */
function resumeBodyOf(resume: ActionPackResume): ResumeBody {
  const sections: ResumeSection[] = [];
  for (const line of resume.lines) {
    let section = sections.find((s) => s.factType === line.factType);
    if (!section) {
      section = { factType: line.factType, lines: [] };
      sections.push(section);
    }
    section.lines.push({ ...line, uncertain: false });
  }
  return { templateId: DEFAULT_RESUME_TEMPLATE, confirmation: 'confirmed', sections };
}

function exportPolicy(snapshot: CatalogSnapshot, account: AccountRow): { docx: boolean; watermark: boolean } {
  // Same rule as the résumé and writing studios: Starter and above get DOCX and no watermark.
  try {
    const planId = v2PlanOf(snapshot, account);
    const paid = snapshot.planOrder.indexOf(planId) >= snapshot.planOrder.indexOf('starter');
    return { docx: paid, watermark: !paid };
  } catch (error) {
    if (!isBillingError(error, 'not_found')) throw error;
    return { docx: true, watermark: false };
  }
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function compensationKnown(value: Record<string, unknown> | null): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function sponsorshipOf(value: Record<string, unknown> | null): MatchListing['sponsorship'] {
  if (!isRecord(value)) return 'unknown';
  return value.sponsorship === 'stated_yes' || value.sponsorship === 'stated_no' ? value.sponsorship : 'unknown';
}
