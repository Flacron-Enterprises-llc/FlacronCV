import { createHash, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  EvidenceVerification,
  UpdateEvidenceInput,
  VerificationMethod,
  VerifiedLabel,
  defaultEvidenceLabel,
  effectiveEvidenceLabel,
  isEvidenceType,
  isVerifiedLabel,
  safeEvidenceUrl,
  verificationActive,
} from '@flacroncv/career-shared';
import type { Db } from '../billing/db';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { BillingError, isBillingError } from '../billing/errors';
import { checkCapacity, requireFeature } from '../metering/access';
import type { ProfileOwner } from '../profile/career-profile.service';
import { personKey, requireLivePerson } from '../privacy/live-person';
import { UnconfiguredObjectStorage, type ObjectStorage } from '../storage/object-storage';
import {
  DEFAULT_EVIDENCE_UPLOAD_MAX_BYTES,
  EVIDENCE_LINK_TTL_MS,
  baseContentType,
  cleanFileName,
  verifyEvidenceFile,
  type EvidenceFileType,
} from './evidence-files';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const DESC_MAX = 4000;
const OWNERSHIP_MAX = 2000;
const REDACTION_NOTE_MAX = 1000;
const LINKED_FACTS_MAX = 50;

interface EvidenceRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  title: string;
  description: string;
  evidence_type: EvidenceType;
  ownership_statement: string;
  linked_skills: unknown;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size_bytes: string | number | null;
  attachment_object_key: string | null;
  attachment_content_type: string | null;
  attachment_sha256: string | null;
  attachment_uploaded_at: Date | string | null;
  evidence_label: EvidenceLabel;
  verification_notes: string | null;
  verified_at: Date | string | null;
  verifier_name: string | null;
  is_portfolio_shared: boolean;
  linked_fact_ids: unknown;
  confidential: boolean | null;
  redaction_note: string | null;
  redaction_confirmed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface VerificationRow {
  id: string;
  evidence_id: string;
  label: VerifiedLabel;
  method: VerificationMethod;
  checked_on: string;
  scope: string;
  issuer_name: string;
  permission_evidence: string;
  expires_on: string | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  recorded_by: 'operator';
  created_at: Date;
}

/** Every recorded check for these items, newest first, keyed by item id. */
export async function verificationsFor(db: Db, evidenceIds: string[], today: string): Promise<Map<string, EvidenceVerification[]>> {
  const out = new Map<string, EvidenceVerification[]>();
  if (evidenceIds.length === 0) return out;
  const rows = await db.query<VerificationRow>(
    `SELECT id, evidence_id, label, method, checked_on::text AS checked_on, scope, issuer_name, permission_evidence,
            expires_on::text AS expires_on, revoked_at, revoked_reason, recorded_by, created_at
       FROM evidence_verifications WHERE evidence_id = ANY($1::uuid[])
      ORDER BY checked_on DESC, created_at DESC, id`,
    [evidenceIds],
  );
  for (const row of rows.rows) {
    const view: EvidenceVerification = {
      id: row.id,
      label: row.label,
      method: row.method,
      checkedOn: row.checked_on,
      scope: row.scope,
      issuerName: row.issuer_name,
      permissionEvidence: row.permission_evidence,
      expiresOn: row.expires_on,
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      revokedReason: row.revoked_reason,
      recordedBy: row.recorded_by,
      createdAt: row.created_at.toISOString(),
      active: false,
    };
    view.active = verificationActive(view, today);
    const list = out.get(row.evidence_id) ?? [];
    list.push(view);
    out.set(row.evidence_id, list);
  }
  return out;
}

/** The label to show for a stored row, given its checks. */
export function shownLabel(
  row: { evidence_label: EvidenceLabel; attachment_url: string | null; attachment_object_key: string | null },
  checks: EvidenceVerification[],
  today: string,
): EvidenceLabel {
  return effectiveEvidenceLabel(row.evidence_label, checks, today, Boolean(row.attachment_url || row.attachment_object_key));
}

export interface EvidenceFileUpload {
  body: unknown;
  contentType: string | undefined;
  fileName?: string;
}

export interface EvidenceFileLink {
  url: string;
  expiresAt: string;
}

const systemClock: Clock = { now: () => new Date() };

/** A queued upload key becomes due for cleanup this long after the upload starts (uploads take seconds). */
const IN_PROGRESS_MS = 10 * 60 * 1000;

/**
 * Evidence items and their private files. A file is stored under a key the
 * server builds from ids (workspace, a hash of the candidate id, item, random
 * id), never from the file name. Every read, write, and delete first checks
 * that the item belongs to the caller's workspace and candidate. Storing or
 * downloading a file never touches document credits.
 */
export class EvidenceService {
  private readonly maxUploadBytes: number;
  private readonly clock: Clock;

  constructor(
    private readonly pool: Pool,
    private readonly catalogs: CatalogStore = new CatalogStore(),
    private readonly storage: ObjectStorage = new UnconfiguredObjectStorage(),
    options: { maxUploadBytes?: number; clock?: Clock } = {},
  ) {
    this.maxUploadBytes = options.maxUploadBytes ?? DEFAULT_EVIDENCE_UPLOAD_MAX_BYTES;
    this.clock = options.clock ?? systemClock;
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private async view(row: EvidenceRow): Promise<CareerEvidence> {
    const checks = (await verificationsFor(this.pool, [row.id], this.today())).get(row.id) ?? [];
    return this.mapRow(row, checks);
  }

  private mapRow(row: EvidenceRow, checks: EvidenceVerification[]): CareerEvidence {
    const latest = checks.find((check) => check.active) ?? null;
    return {
      id: row.id,
      candidateAuthUserId: row.candidate_auth_user_id,
      title: row.title,
      description: row.description,
      evidenceType: row.evidence_type,
      ownershipStatement: row.ownership_statement,
      linkedSkills: Array.isArray(row.linked_skills) ? (row.linked_skills as string[]) : [],
      attachmentUrl: row.attachment_url,
      attachmentName: row.attachment_name,
      attachmentSizeBytes: row.attachment_size_bytes !== null ? Number(row.attachment_size_bytes) : null,
      attachmentStored: Boolean(row.attachment_object_key),
      attachmentContentType: row.attachment_object_key ? row.attachment_content_type : null,
      evidenceLabel: shownLabel(row, checks, this.today()),
      verificationNotes: latest ? latest.scope : row.verification_notes,
      verifiedAt: latest ? latest.checkedOn : row.verified_at ? new Date(row.verified_at).toISOString() : null,
      verifierName: latest ? latest.issuerName : row.verifier_name,
      isPortfolioShared: row.is_portfolio_shared,
      linkedFactIds: Array.isArray(row.linked_fact_ids) ? row.linked_fact_ids.filter((id): id is string => typeof id === 'string') : [],
      confidential: Boolean(row.confidential),
      redactionNote: row.redaction_note ?? null,
      redactionConfirmedAt: row.redaction_confirmed_at ? new Date(row.redaction_confirmed_at).toISOString() : null,
      verifications: checks,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async owned(owner: ProfileOwner, id: string): Promise<EvidenceRow> {
    if (!UUID.test(id)) {
      throw new BillingError('validation_error', { field: 'id', reason: 'invalid_uuid' });
    }
    const res = await this.pool.query<EvidenceRow>(
      `SELECT * FROM career_evidence WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) {
      throw new BillingError('not_found', { resource: 'career_evidence', id });
    }
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  async list(owner: ProfileOwner): Promise<{ items: CareerEvidence[] }> {
    const res = await this.pool.query<EvidenceRow>(
      `SELECT * FROM career_evidence
       WHERE workspace_id = $1 AND candidate_auth_user_id = $2
       ORDER BY updated_at DESC`,
      [owner.workspaceId, owner.authUserId],
    );
    const checks = await verificationsFor(this.pool, res.rows.map((row) => row.id), this.today());
    return { items: res.rows.map((row) => this.mapRow(row, checks.get(row.id) ?? [])) };
  }

  async get(owner: ProfileOwner, id: string): Promise<CareerEvidence> {
    return this.view(await this.owned(owner, id));
  }

  /** Only the caller's own facts can be linked. */
  private async factIds(owner: ProfileOwner, value: unknown): Promise<string[]> {
    if (!Array.isArray(value)) throw new BillingError('validation_error', { field: 'linkedFactIds', reason: 'invalid' });
    const ids: string[] = [];
    for (const id of value) {
      if (typeof id !== 'string' || !UUID_ANY.test(id)) throw new BillingError('validation_error', { field: 'linkedFactIds', reason: 'invalid' });
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length > LINKED_FACTS_MAX) throw new BillingError('validation_error', { field: 'linkedFactIds', reason: 'too_many' });
    if (ids.length === 0) return ids;
    const found = await this.pool.query<{ id: string }>(
      `SELECT id FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND id = ANY($3::uuid[])`,
      [owner.workspaceId, owner.authUserId, ids],
    );
    if (found.rows.length !== ids.length) throw new BillingError('validation_error', { field: 'linkedFactIds', reason: 'unknown' });
    return ids;
  }

  /**
   * A confidential item is not shared until the person confirms the
   * redaction (spec section 25: redact confidential employer or client
   * material before sharing).
   */
  private assertShareable(shared: boolean, confidential: boolean, redactionConfirmed: boolean): void {
    if (shared && confidential && !redactionConfirmed) {
      throw new BillingError('validation_error', { field: 'redactionConfirmed', reason: 'required' });
    }
  }

  async create(owner: ProfileOwner, input: CreateEvidenceInput): Promise<CareerEvidence> {
    const title = input.title?.trim() ?? '';
    if (!title || title.length > TITLE_MAX) {
      throw new BillingError('validation_error', { field: 'title', reason: 'invalid_length' });
    }
    if (!isEvidenceType(input.evidenceType)) {
      throw new BillingError('validation_error', { field: 'evidenceType', reason: 'invalid_type' });
    }

    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, 'evidenceItems');

    const used = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM career_evidence
       WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );

    let planAccount = account;
    try {
      v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      planAccount = { ...account, plan_id: 'professional' };
    }

    checkCapacity(snapshot, planAccount, 'evidenceItems', used.rows[0]?.n ?? 0);

    const attachmentUrl = linkOrThrow(input.attachmentUrl);
    const label = defaultEvidenceLabel(input.evidenceType, attachmentUrl !== null);
    const linkedFactIds = input.linkedFactIds === undefined ? [] : await this.factIds(owner, input.linkedFactIds);
    const confidential = Boolean(input.confidential);
    const redactionNote = optionalNote(input.redactionNote);
    const redactionConfirmed = confidential && input.redactionConfirmed === true;
    this.assertShareable(Boolean(input.isPortfolioShared), confidential, redactionConfirmed);
    const description = (input.description ?? '').slice(0, DESC_MAX);
    const ownership = (input.ownershipStatement ?? '').slice(0, OWNERSHIP_MAX);
    const skills = Array.isArray(input.linkedSkills) ? input.linkedSkills : [];
    const shared = Boolean(input.isPortfolioShared);

    const res = await this.pool.query<EvidenceRow>(
      `INSERT INTO career_evidence (
         workspace_id, candidate_auth_user_id, title, description, evidence_type,
         ownership_statement, linked_skills, attachment_url, attachment_name,
         attachment_size_bytes, evidence_label, is_portfolio_shared,
         linked_fact_ids, confidential, redaction_note, redaction_confirmed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        owner.workspaceId,
        owner.authUserId,
        title,
        description,
        input.evidenceType,
        ownership,
        JSON.stringify(skills),
        attachmentUrl,
        attachmentUrl ? input.attachmentName ?? null : null,
        attachmentUrl ? input.attachmentSizeBytes ?? null : null,
        label,
        shared,
        JSON.stringify(linkedFactIds),
        confidential,
        redactionNote,
        redactionConfirmed ? this.clock.now() : null,
      ],
    );

    return this.view(res.rows[0]!);
  }

  async update(owner: ProfileOwner, id: string, input: UpdateEvidenceInput): Promise<CareerEvidence> {
    const prior = await this.owned(owner, id);

    let title = prior.title;
    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (!trimmed || trimmed.length > TITLE_MAX) {
        throw new BillingError('validation_error', { field: 'title', reason: 'invalid_length' });
      }
      title = trimmed;
    }

    const description = input.description !== undefined ? input.description.slice(0, DESC_MAX) : prior.description;
    const ownership = input.ownershipStatement !== undefined ? input.ownershipStatement.slice(0, OWNERSHIP_MAX) : prior.ownership_statement;
    const skills = input.linkedSkills !== undefined ? input.linkedSkills : prior.linked_skills;
    const shared = input.isPortfolioShared !== undefined ? input.isPortfolioShared : prior.is_portfolio_shared;
    const linkedFactIds = input.linkedFactIds !== undefined ? await this.factIds(owner, input.linkedFactIds) : prior.linked_fact_ids;
    const confidential = input.confidential !== undefined ? Boolean(input.confidential) : Boolean(prior.confidential);
    const redactionNote = input.redactionNote !== undefined ? optionalNote(input.redactionNote) : prior.redaction_note;
    let redactionConfirmedAt: Date | string | null = prior.redaction_confirmed_at;
    if (!confidential) redactionConfirmedAt = null;
    else if (input.redactionConfirmed === true) redactionConfirmedAt = this.clock.now();
    else if (input.redactionConfirmed === false) redactionConfirmedAt = null;
    // An item already shared must be confirmed again when it becomes confidential.
    this.assertShareable(shared, confidential, redactionConfirmedAt !== null);

    let attachmentUrl = prior.attachment_url;
    let attachmentName = prior.attachment_name;
    let attachmentSizeBytes = prior.attachment_size_bytes;
    let label = prior.evidence_label;
    let stored = {
      key: prior.attachment_object_key,
      type: prior.attachment_content_type,
      sha: prior.attachment_sha256,
      at: prior.attachment_uploaded_at,
    };

    if (input.attachmentUrl !== undefined) {
      const link = linkOrThrow(input.attachmentUrl);
      if (link !== null) {
        // A link replaces a stored file: the file is deleted first, so the row never points at a missing object.
        if (prior.attachment_object_key) {
          await this.storage.delete(prior.attachment_object_key);
          stored = { key: null, type: null, sha: null, at: null };
        }
        attachmentUrl = link;
        attachmentName = input.attachmentName ?? null;
        attachmentSizeBytes = input.attachmentSizeBytes ?? null;
      } else if (prior.attachment_url) {
        // Clearing the link leaves any stored file in place.
        attachmentUrl = null;
        attachmentName = stored.key ? prior.attachment_name : null;
        attachmentSizeBytes = stored.key ? prior.attachment_size_bytes : null;
      }
      // The base label follows what is actually attached; recorded checks are kept separately.
      if (!isVerifiedLabel(label)) label = defaultEvidenceLabel(prior.evidence_type, Boolean(attachmentUrl || stored.key));
    }

    const res = await this.pool.query<EvidenceRow>(
      `UPDATE career_evidence SET
         title = $1,
         description = $2,
         ownership_statement = $3,
         linked_skills = $4,
         attachment_url = $5,
         attachment_name = $6,
         attachment_size_bytes = $7,
         evidence_label = $8,
         is_portfolio_shared = $9,
         attachment_object_key = $11,
         attachment_content_type = $12,
         attachment_sha256 = $13,
         attachment_uploaded_at = $14,
         linked_fact_ids = $15,
         confidential = $16,
         redaction_note = $17,
         redaction_confirmed_at = $18,
         updated_at = now()
       WHERE id = $10
       RETURNING *`,
      [
        title,
        description,
        ownership,
        JSON.stringify(skills),
        attachmentUrl,
        attachmentName,
        attachmentSizeBytes,
        label,
        shared,
        id,
        stored.key,
        stored.type,
        stored.sha,
        stored.at,
        JSON.stringify(Array.isArray(linkedFactIds) ? linkedFactIds : []),
        confidential,
        redactionNote,
        redactionConfirmedAt,
      ],
    );

    return this.view(res.rows[0]!);
  }

  /** The stored file goes first; if storage refuses, the item stays so the delete can be retried. */
  async delete(owner: ProfileOwner, id: string): Promise<void> {
    const prior = await this.owned(owner, id);
    if (prior.attachment_object_key) await this.storage.delete(prior.attachment_object_key);
    await this.pool.query(
      `DELETE FROM career_evidence WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
      [id, owner.workspaceId, owner.authUserId],
    );
  }

  /**
   * Stores a private file for an item the caller owns. The type, size, and
   * signature are checked; retained bytes for the workspace must fit the
   * plan's storage allowance. A replaced file is deleted after the new one
   * is recorded. No document credit is reserved or spent.
   */
  async uploadAttachment(owner: ProfileOwner, id: string, file: EvidenceFileUpload): Promise<CareerEvidence> {
    const contentType = baseContentType(file.contentType);
    verifyEvidenceFile(file.body, contentType, this.maxUploadBytes);
    const body = file.body;
    const type = contentType as EvidenceFileType;
    await this.owned(owner, id);
    const { snapshot, planAccount } = await this.planContext(owner);
    await requireFeature(this.pool, snapshot, 'evidenceItems');

    const key = evidenceObjectKey(owner, id);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const fileName = cleanFileName(file.fileName, type);
    // Queued before the file is written and due only after IN_PROGRESS_MS: if anything below fails and
    // its cleanup fails too, the storage sweeper (or the account deletion) still finds and removes the object.
    const now = this.clock.now();
    await this.pool.query(
      `INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, created_at, not_before) VALUES ($1, $2, $3, $4)`,
      [key, owner.authUserId, now, new Date(now.getTime() + IN_PROGRESS_MS)],
    );
    let uploaded = false;
    let result: { row: EvidenceRow; replacedKey: string | null };
    try {
      result = await withTransaction(this.pool, async (tx) => {
        // One upload at a time per workspace, so two uploads cannot both fit the same remaining space.
        await tx.query(`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, [owner.workspaceId]);
        // Held until commit: an account deletion that starts now waits, and one already started refuses this.
        await requireLivePerson(tx, owner.authUserId);
        // Locked until commit, so the sweeper (FOR UPDATE SKIP LOCKED) never claims an upload in progress.
        await tx.query(`SELECT 1 FROM stored_object_intents WHERE object_key = $1 FOR UPDATE`, [key]);
        const current = await tx.query<EvidenceRow>(
          `SELECT * FROM career_evidence WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3 FOR UPDATE`,
          [id, owner.workspaceId, owner.authUserId],
        );
        const row = current.rows[0];
        if (!row) throw new BillingError('not_found', { resource: 'career_evidence', id });
        const used = await tx.query<{ bytes: string }>(
          `SELECT COALESCE(SUM(attachment_size_bytes), 0)::text AS bytes FROM career_evidence
            WHERE workspace_id = $1 AND attachment_object_key IS NOT NULL`,
          [owner.workspaceId],
        );
        const replacing = row.attachment_object_key ? Number(row.attachment_size_bytes ?? 0) : 0;
        checkCapacity(snapshot, planAccount, 'storageBytes', Number(used.rows[0]?.bytes ?? 0) - replacing, body.length);

        await this.storage.put(key, body, type);
        uploaded = true;
        const label = row.evidence_label === 'self_reported' ? 'evidence_attached' : row.evidence_label;
        const updated = await tx.query<EvidenceRow>(
          `UPDATE career_evidence SET
             attachment_url = NULL,
             attachment_name = $2,
             attachment_size_bytes = $3,
             attachment_object_key = $4,
             attachment_content_type = $5,
             attachment_sha256 = $6,
             attachment_uploaded_at = $7,
             evidence_label = $8,
             updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [id, fileName, body.length, key, type, sha256, this.clock.now(), label],
        );
        await tx.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [key]);
        return { row: updated.rows[0]!, replacedKey: row.attachment_object_key };
      });
    } catch (error) {
      // The row was not updated, so the new object must not stay behind.
      await this.forget(key, uploaded);
      throw error;
    }
    if (result.replacedKey) await this.discard(result.replacedKey, owner.authUserId);
    return this.view(result.row);
  }

  /** After a failed upload: delete the object if it was written, and drop the queue row only once that worked. */
  private async forget(key: string, written: boolean): Promise<void> {
    try {
      if (written) await this.storage.delete(key);
      await this.pool.query(`DELETE FROM stored_object_intents WHERE object_key = $1`, [key]);
    } catch {
      // The upload is over, so the row is due now; the sweeper or the account deletion retries.
      await this.pool
        .query(`UPDATE stored_object_intents SET not_before = $2 WHERE object_key = $1`, [key, this.clock.now()])
        .catch(() => undefined);
    }
  }

  /** A replaced object nothing points at any more. If storage refuses, it is listed for a later retry. */
  private async discard(key: string, authUserId: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      await this.pool
        .query(
          `INSERT INTO stored_object_intents (object_key, candidate_auth_user_id, created_at, not_before)
           VALUES ($1, $2, $3, $3) ON CONFLICT (object_key) DO NOTHING`,
          [key, authUserId, this.clock.now()],
        )
        .catch(() => undefined);
    }
  }

  /** A five-minute download link for the caller's own stored file. Reading is free and stays allowed over capacity. */
  async attachmentLink(owner: ProfileOwner, id: string): Promise<EvidenceFileLink> {
    const row = await this.owned(owner, id);
    if (!row.attachment_object_key) throw new BillingError('not_found', { resource: 'evidence_file', id });
    const expiresAt = new Date(this.clock.now().getTime() + EVIDENCE_LINK_TTL_MS);
    const url = await this.storage.signedUrl(row.attachment_object_key, expiresAt, {
      fileName: row.attachment_name ?? undefined,
      contentType: row.attachment_content_type ?? undefined,
    });
    return { url, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Clears the file from the item, then deletes the stored object. In that
   * order a failure never leaves the item pointing at a file that is gone:
   * if the update fails nothing changed, and if storage refuses the delete
   * the object is queued for the sweeper (`discard`). Repeating it is harmless.
   */
  async removeAttachment(owner: ProfileOwner, id: string): Promise<CareerEvidence> {
    const prior = await this.owned(owner, id);
    if (!prior.attachment_object_key) return this.view(prior);
    // An external link still attached keeps "evidence attached"; with nothing attached it is self reported.
    const label =
      prior.evidence_label === 'evidence_attached' ? defaultEvidenceLabel(prior.evidence_type, Boolean(prior.attachment_url)) : prior.evidence_label;
    const res = await this.pool.query<EvidenceRow>(
      `UPDATE career_evidence SET
         attachment_name = NULL,
         attachment_size_bytes = NULL,
         attachment_object_key = NULL,
         attachment_content_type = NULL,
         attachment_sha256 = NULL,
         attachment_uploaded_at = NULL,
         evidence_label = $2,
         updated_at = now()
       WHERE id = $1 AND workspace_id = $3 AND candidate_auth_user_id = $4
       RETURNING *`,
      [id, label, owner.workspaceId, owner.authUserId],
    );
    await this.discard(prior.attachment_object_key, owner.authUserId);
    return this.view(res.rows[0]!);
  }

  private async planContext(owner: ProfileOwner) {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    let planAccount = account;
    try {
      v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      planAccount = { ...account, plan_id: 'professional' };
    }
    return { snapshot, planAccount };
  }
}

/** http/https only; an empty value clears the link. */
function linkOrThrow(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) return null;
  const safe = safeEvidenceUrl(value);
  if (!safe) throw new BillingError('validation_error', { field: 'attachmentUrl', reason: 'unsafe_url' });
  return safe;
}

function optionalNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > REDACTION_NOTE_MAX) throw new BillingError('validation_error', { field: 'redactionNote', reason: 'invalid_length' });
  return text;
}

const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `evidence/<workspace>/<sha256(candidate) prefix>/<item>/<random>`: no names or personal ids in the key. */
export function evidenceObjectKey(owner: Pick<ProfileOwner, 'workspaceId' | 'authUserId'>, evidenceId: string): string {
  return `evidence/${owner.workspaceId}/${personKey(owner.authUserId)}/${evidenceId}/${randomUUID()}`;
}
