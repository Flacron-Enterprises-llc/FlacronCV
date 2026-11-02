import type { Pool } from 'pg';
import {
  UNSTATED_ORGANIZATION,
  applicationCalendar,
  isApplicationStatus,
  isDateOnly,
} from '@flacroncv/career-shared';
import type { ApplicationStatus, ChecklistItem } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { BillingError, isBillingError } from '../billing/errors';
import { checkCapacity, requireFeature } from '../metering/access';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHECKLIST = 50;
const MAX_NOTES = 10000;

export interface ApplicationContact {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface ApplicationDates {
  deadline: string | null;
  applied: string | null;
  interview: string | null;
}

export interface ApplicationSnapshot {
  title: string;
  organization: string | null;
  sourceUrl: string | null;
  description: string;
  checkedAt: string;
  provider: string;
  revisionId: string;
}

export interface ApplicationView {
  id: string;
  opportunityId: string;
  opportunityRevisionId: string;
  resumeVersionId: string | null;
  letterId: string | null;
  status: ApplicationStatus;
  contacts: ApplicationContact[];
  notes: string;
  dates: ApplicationDates;
  checklist: ChecklistItem[];
  snapshot: ApplicationSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderView {
  id: string;
  applicationId: string;
  remindAt: string;
  sentAt: string | null;
}

interface ApplicationRow {
  id: string;
  opportunity_id: string;
  opportunity_revision_id: string;
  resume_version_id: string | null;
  letter_version_id: string | null;
  status: string;
  contacts: unknown;
  notes: string;
  dates: unknown;
  checklist: unknown;
  source_snapshot: unknown;
  created_at: Date;
  updated_at: Date;
  workspace_id: string;
  candidate_auth_user_id: string;
}

/**
 * The application board. Creating and moving a card spends nothing.
 * The listing words are copied once, onto the snapshot.
 */
export class ApplicationService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async list(owner: ProfileOwner): Promise<{ items: ApplicationView[] }> {
    const rows = await this.pool.query<ApplicationRow>(
      `SELECT * FROM applications
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY updated_at DESC`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => this.view(row)) };
  }

  async get(owner: ProfileOwner, applicationId: string): Promise<ApplicationView> {
    return this.view(await this.owned(owner, applicationId));
  }

  async create(owner: ProfileOwner, input: { opportunityId?: string; resumeVersionId?: string }): Promise<ApplicationView> {
    if (!input.opportunityId || !UUID.test(input.opportunityId)) throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    if (!input.resumeVersionId || !UUID.test(input.resumeVersionId)) {
      throw new BillingError('validation_error', { field: 'resumeVersionId', reason: 'invalid' });
    }
    const existing = await this.pool.query<ApplicationRow>(
      `SELECT * FROM applications WHERE candidate_auth_user_id = $1 AND opportunity_id = $2`,
      [owner.authUserId, input.opportunityId],
    );
    const prior = existing.rows[0];
    if (prior) {
      if (prior.workspace_id !== owner.workspaceId) throw new BillingError('permission_denied');
      return this.view(prior);
    }
    await this.ownedResume(owner, input.resumeVersionId);
    const listing = await this.listing(owner, input.opportunityId);
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, 'trackedApplications');
    const used = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM applications WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    let planAccount = account;
    try {
      v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      planAccount = { ...account, plan_id: 'professional' };
    }
    checkCapacity(snapshot, planAccount, 'trackedApplications', used.rows[0]?.n ?? 0);
    const inserted = await this.pool.query<ApplicationRow>(
      `INSERT INTO applications
         (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id, resume_version_id, source_snapshot, dates)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        owner.workspaceId,
        owner.authUserId,
        listing.opportunityId,
        listing.revisionId,
        input.resumeVersionId,
        JSON.stringify(listing.snapshot),
        JSON.stringify({ deadline: listing.deadline, applied: null, interview: null }),
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return this.view(row);
  }

  async update(
    owner: ProfileOwner,
    applicationId: string,
    patch: {
      status?: string;
      notes?: string;
      contacts?: Array<{ name: string; email?: string | null; phone?: string | null }>;
      dates?: Partial<ApplicationDates>;
      checklist?: ChecklistItem[];
      resumeVersionId?: string | null;
      letterId?: string | null;
    },
  ): Promise<ApplicationView> {
    const current = await this.owned(owner, applicationId);
    const status = patch.status ?? current.status;
    if (!isApplicationStatus(status)) throw new BillingError('validation_error', { field: 'status', reason: 'invalid' });
    const notes = patch.notes ?? current.notes;
    if (notes.length > MAX_NOTES) throw new BillingError('validation_error', { field: 'notes', reason: 'too_long' });
    const contacts = patch.contacts ? contactsOf(patch.contacts) : contactsOf(current.contacts);
    const dates = datesOf(current.dates);
    if (patch.dates) {
      for (const key of ['deadline', 'applied', 'interview'] as const) {
        if (patch.dates[key] === undefined) continue;
        const value = patch.dates[key];
        if (value !== null && (typeof value !== 'string' || !isDateOnly(value))) {
          throw new BillingError('validation_error', { field: key, reason: 'invalid' });
        }
        dates[key] = value;
      }
    }
    const checklist = patch.checklist ? checklistOf(patch.checklist, true) : checklistOf(current.checklist, false);
    let resumeVersionId = current.resume_version_id;
    if (patch.resumeVersionId !== undefined) {
      if (patch.resumeVersionId === null) resumeVersionId = null;
      else {
        await this.ownedResume(owner, patch.resumeVersionId);
        resumeVersionId = patch.resumeVersionId;
      }
    }
    let letterId = current.letter_version_id;
    if (patch.letterId !== undefined) {
      if (patch.letterId === null) letterId = null;
      else {
        await this.ownedLetter(owner, patch.letterId);
        letterId = patch.letterId;
      }
    }
    const updated = await this.pool.query<ApplicationRow>(
      `UPDATE applications
          SET status = $2, notes = $3, contacts = $4, dates = $5, checklist = $6,
              resume_version_id = $7, letter_version_id = $8, updated_at = $9
        WHERE id = $1
        RETURNING *`,
      [
        applicationId,
        status,
        notes,
        JSON.stringify(contacts),
        JSON.stringify(dates),
        JSON.stringify(checklist),
        resumeVersionId,
        letterId,
        this.clock.now(),
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new BillingError('not_found');
    return this.view(row);
  }

  async remind(owner: ProfileOwner, applicationId: string, input: { remindAt?: string }): Promise<ReminderView> {
    await this.owned(owner, applicationId);
    const when = input.remindAt ? new Date(input.remindAt) : new Date(NaN);
    if (Number.isNaN(when.getTime())) throw new BillingError('validation_error', { field: 'remindAt', reason: 'invalid' });
    if (when.getTime() < this.clock.now().getTime()) throw new BillingError('validation_error', { field: 'remindAt', reason: 'past' });
    const inserted = await this.pool.query<{ id: string; remind_at: Date; sent_at: Date | null }>(
      `INSERT INTO application_reminders (application_id, remind_at) VALUES ($1, $2) RETURNING id, remind_at, sent_at`,
      [applicationId, when],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return { id: row.id, applicationId, remindAt: row.remind_at.toISOString(), sentAt: null };
  }

  async calendar(owner: ProfileOwner, applicationId: string): Promise<{ filename: string; body: string }> {
    const application = await this.owned(owner, applicationId);
    const reminders = await this.pool.query<{ id: string; remind_at: Date }>(
      `SELECT id, remind_at FROM application_reminders WHERE application_id = $1 ORDER BY remind_at`,
      [applicationId],
    );
    const snapshot = snapshotOf(application.source_snapshot);
    const dates = datesOf(application.dates);
    return {
      filename: 'application.ics',
      body: applicationCalendar({
        applicationId,
        title: snapshot.title,
        deadline: dates.deadline,
        reminders: reminders.rows.map((row) => ({ id: row.id, remindAt: row.remind_at.toISOString() })),
      }),
    };
  }

  private async listing(owner: ProfileOwner, opportunityId: string): Promise<{ opportunityId: string; revisionId: string; deadline: string | null; snapshot: ApplicationSnapshot }> {
    const rows = await this.pool.query<{
      revision_id: string;
      title: string;
      organization: string;
      description: string;
      source_url: string | null;
      checked_at: Date;
      deadline: string | null;
      provider: string;
      candidate_auth_user_id: string | null;
    }>(
      `SELECT r.id AS revision_id, r.title, r.organization, r.description, r.source_url, r.checked_at,
              r.deadline, o.provider, o.candidate_auth_user_id
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
    return {
      opportunityId,
      revisionId: row.revision_id,
      deadline: row.deadline && isDateOnly(row.deadline) ? row.deadline : null,
      snapshot: {
        title: row.title,
        organization: row.organization === UNSTATED_ORGANIZATION ? null : row.organization,
        sourceUrl: row.source_url,
        description: row.description,
        checkedAt: row.checked_at.toISOString(),
        provider: row.provider,
        revisionId: row.revision_id,
      },
    };
  }

  private async owned(owner: ProfileOwner, applicationId: string): Promise<ApplicationRow> {
    if (!UUID.test(applicationId)) throw new BillingError('not_found');
    const rows = await this.pool.query<ApplicationRow>(`SELECT * FROM applications WHERE id = $1`, [applicationId]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async ownedResume(owner: ProfileOwner, versionId: string): Promise<void> {
    if (!UUID.test(versionId)) throw new BillingError('validation_error', { field: 'resumeVersionId', reason: 'invalid' });
    const rows = await this.pool.query<{ workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT r.workspace_id, r.candidate_auth_user_id
         FROM resume_versions v JOIN resumes r ON r.id = v.resume_id
        WHERE v.id = $1`,
      [versionId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
  }

  private async ownedLetter(owner: ProfileOwner, documentId: string): Promise<void> {
    if (!UUID.test(documentId)) throw new BillingError('validation_error', { field: 'letterId', reason: 'invalid' });
    const rows = await this.pool.query<{ workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT workspace_id, candidate_auth_user_id FROM writing_documents WHERE id = $1`,
      [documentId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
  }

  private view(row: ApplicationRow): ApplicationView {
    const status = isApplicationStatus(row.status) ? row.status : 'saved';
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      opportunityRevisionId: row.opportunity_revision_id,
      resumeVersionId: row.resume_version_id,
      letterId: row.letter_version_id,
      status,
      contacts: contactsOf(row.contacts),
      notes: row.notes,
      dates: datesOf(row.dates),
      checklist: checklistOf(row.checklist, false),
      snapshot: snapshotOf(row.source_snapshot),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

function contactsOf(value: unknown): ApplicationContact[] {
  if (!Array.isArray(value)) return [];
  const contacts: ApplicationContact[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || item.name.trim().length === 0) {
      throw new BillingError('validation_error', { field: 'contacts', reason: 'invalid' });
    }
    contacts.push({
      name: item.name.trim().slice(0, 200),
      email: typeof item.email === 'string' && item.email.trim().length > 0 ? item.email.trim().slice(0, 200) : null,
      phone: typeof item.phone === 'string' && item.phone.trim().length > 0 ? item.phone.trim().slice(0, 40) : null,
    });
  }
  return contacts;
}

function datesOf(value: unknown): ApplicationDates {
  const record = isRecord(value) ? value : {};
  return {
    deadline: typeof record.deadline === 'string' && isDateOnly(record.deadline) ? record.deadline : null,
    applied: typeof record.applied === 'string' && isDateOnly(record.applied) ? record.applied : null,
    interview: typeof record.interview === 'string' && isDateOnly(record.interview) ? record.interview : null,
  };
}

function checklistOf(value: unknown, strict: boolean): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_CHECKLIST) throw new BillingError('validation_error', { field: 'checklist', reason: 'too_many', limit: MAX_CHECKLIST });
  const items: ChecklistItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.label !== 'string' || item.label.trim().length === 0 || typeof item.done !== 'boolean') {
      if (strict) throw new BillingError('validation_error', { field: 'checklist', reason: 'invalid' });
      continue;
    }
    items.push({ label: item.label.trim().slice(0, 200), done: item.done });
  }
  return items;
}

function snapshotOf(value: unknown): ApplicationSnapshot {
  const record = isRecord(value) ? value : {};
  return {
    title: typeof record.title === 'string' ? record.title : '',
    organization: typeof record.organization === 'string' ? record.organization : null,
    sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : null,
    description: typeof record.description === 'string' ? record.description : '',
    checkedAt: typeof record.checkedAt === 'string' ? record.checkedAt : '',
    provider: typeof record.provider === 'string' ? record.provider : '',
    revisionId: typeof record.revisionId === 'string' ? record.revisionId : '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
