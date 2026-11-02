import type { Pool } from 'pg';
import {
  computeTrustSignals,
  type ModerationAction,
  type ModerationQueueItem,
  type ModerationStatus,
  type ReportOpportunityInput,
  type ReportReason,
  type TrustSignalSummary,
  type ViewerReport,
} from '@flacroncv/career-shared';
import type { Clock } from '../billing/billing.service';
import { withTransaction, type Db } from '../billing/db';
import { BillingError } from '../billing/errors';
import type { Principal } from '../identity/identity.service';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_REASONS: ReadonlySet<ReportReason> = new Set([
  'suspicious_fee',
  'misleading',
  'expired_closed',
  'duplicate',
  'scam',
  'other',
]);

const VALID_ACTIONS: ReadonlySet<ModerationAction> = new Set(['verify', 'suppress', 'dismiss']);

const VALID_STATUSES: ReadonlySet<ModerationStatus> = new Set([
  'unflagged',
  'flagged',
  'under_review',
  'verified',
  'suppressed',
]);

interface ListingAccessRow {
  id: string;
  moderation_status: ModerationStatus;
  candidate_auth_user_id: string | null;
  provider: string;
  checked_at: Date;
  description: string;
  compensation: unknown;
}

export class OpportunityTrustService {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly admins: ReadonlySet<string> = new Set(),
  ) {}

  async reportListing(
    owner: ProfileOwner,
    opportunityId: string,
    input: ReportOpportunityInput,
  ): Promise<{ reportId: string; status: 'reported'; reviewStatus: 'pending'; reason: ReportReason }> {
    if (!UUID.test(opportunityId)) throw new BillingError('not_found');
    if (!VALID_REASONS.has(input.reason)) {
      throw new BillingError('validation_error', { field: 'reason', reason: 'invalid' });
    }
    const notes = input.notes?.trim() ?? '';
    if (notes.length > 2000) {
      throw new BillingError('validation_error', { field: 'notes', reason: 'too_long' });
    }

    return withTransaction(this.pool, async (db) => {
      const row = await this.lockListing(db, opportunityId, owner);
      const existing = await db.query<{ id: string }>(
        `SELECT id FROM opportunity_reports
          WHERE opportunity_id = $1 AND candidate_auth_user_id = $2 AND status = 'pending'
          FOR UPDATE`,
        [opportunityId, owner.authUserId],
      );
      let reportId = existing.rows[0]?.id;
      if (reportId) {
        await db.query(
          `UPDATE opportunity_reports SET reason = $2, notes = $3 WHERE id = $1`,
          [reportId, input.reason, notes],
        );
      } else {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO opportunity_reports
             (opportunity_id, workspace_id, candidate_auth_user_id, reason, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [opportunityId, owner.workspaceId, owner.authUserId, input.reason, notes, this.clock.now()],
        );
        reportId = inserted.rows[0].id;
      }

      const count = await this.pendingCount(db, opportunityId);
      if (count >= 2 && (row.moderation_status === 'unflagged' || row.moderation_status === 'verified')) {
        await db.query(`UPDATE opportunities SET moderation_status = 'flagged' WHERE id = $1`, [opportunityId]);
      }

      return { reportId, status: 'reported' as const, reviewStatus: 'pending' as const, reason: input.reason };
    });
  }

  async getTrustSignals(owner: ProfileOwner, opportunityId: string): Promise<TrustSignalSummary> {
    if (!UUID.test(opportunityId)) throw new BillingError('not_found');
    const row = await this.readListing(this.pool, opportunityId, owner);
    const sourcesCount = await this.sourceCount(this.pool, opportunityId);
    const reportCount = await this.pendingCount(this.pool, opportunityId);
    const viewerReport = await readViewerReport(this.pool, opportunityId, owner.authUserId);
    return this.summary(row, sourcesCount, reportCount, viewerReport);
  }

  async listModerationQueue(
    admin: Principal,
    filter?: { status?: ModerationStatus },
  ): Promise<{ items: ModerationQueueItem[] }> {
    this.assertAdmin(admin);
    const statusFilter = filter?.status && VALID_STATUSES.has(filter.status) ? filter.status : null;

    const rows = await this.pool.query<{
      opportunity_id: string;
      title: string;
      organization: string | null;
      provider: string;
      moderation_status: ModerationStatus;
      checked_at: Date;
      report_count: string;
      latest_report_at: Date | null;
      reasons: unknown;
      notes: unknown;
    }>(
      `SELECT o.id AS opportunity_id, o.title, o.organization, o.provider, o.moderation_status,
              r.checked_at,
              COALESCE(rep.cnt, 0)::text AS report_count,
              rep.latest_report_at,
              COALESCE(rep.reasons, '[]'::jsonb) AS reasons,
              COALESCE(notes.notes, '[]'::jsonb) AS notes
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
         LEFT JOIN LATERAL (
           SELECT count(*) AS cnt,
                  max(created_at) AS latest_report_at,
                  jsonb_agg(DISTINCT reason) AS reasons
             FROM opportunity_reports
            WHERE opportunity_id = o.id AND status = 'pending'
         ) rep ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(jsonb_agg(recent.notes ORDER BY recent.created_at DESC), '[]'::jsonb) AS notes
             FROM (
               SELECT notes, created_at
                 FROM opportunity_reports
                WHERE opportunity_id = o.id AND status = 'pending' AND length(btrim(notes)) > 0
                ORDER BY created_at DESC
                LIMIT 3
             ) recent
         ) notes ON true
        WHERE ($1::text IS NULL AND (o.moderation_status IN ('flagged', 'under_review', 'suppressed') OR COALESCE(rep.cnt, 0) > 0))
           OR ($1::text IS NOT NULL AND o.moderation_status = $1)
        ORDER BY COALESCE(rep.cnt, 0) DESC, r.checked_at DESC
        LIMIT 100`,
      [statusFilter],
    );

    const items: ModerationQueueItem[] = rows.rows.map((row) => ({
      opportunityId: row.opportunity_id,
      title: row.title,
      organization: row.organization,
      provider: row.provider,
      moderationStatus: row.moderation_status,
      reportCount: parseInt(row.report_count, 10),
      latestReportAt: row.latest_report_at ? row.latest_report_at.toISOString() : row.checked_at.toISOString(),
      latestReasons: stringList(row.reasons).filter((reason): reason is ReportReason => VALID_REASONS.has(reason as ReportReason)),
      reportNotes: stringList(row.notes),
      checkedAt: row.checked_at.toISOString(),
    }));

    return { items };
  }

  async moderateListing(
    admin: Principal,
    opportunityId: string,
    input: { action: ModerationAction; notes?: string },
  ): Promise<{ opportunityId: string; moderationStatus: ModerationStatus }> {
    this.assertAdmin(admin);
    if (!UUID.test(opportunityId)) throw new BillingError('not_found');
    if (!VALID_ACTIONS.has(input.action)) {
      throw new BillingError('validation_error', { field: 'action', reason: 'invalid' });
    }
    const notes = input.notes?.trim() ?? '';
    if (notes.length > 2000) {
      throw new BillingError('validation_error', { field: 'notes', reason: 'too_long' });
    }

    const nextStatus: ModerationStatus =
      input.action === 'verify' ? 'verified' : input.action === 'suppress' ? 'suppressed' : 'unflagged';

    return withTransaction(this.pool, async (db) => {
      const opp = await db.query<{ id: string }>(
        `UPDATE opportunities SET moderation_status = $2 WHERE id = $1 RETURNING id`,
        [opportunityId, nextStatus],
      );
      if (!opp.rows[0]) throw new BillingError('not_found');

      const now = this.clock.now();
      await db.query(
        `UPDATE opportunity_reports
            SET status = 'reviewed',
                reviewed_at = $2,
                reviewer_auth_user_id = $3,
                review_action = $4,
                review_notes = $5
          WHERE opportunity_id = $1`,
        [opportunityId, now, admin.authUserId, input.action, notes || null],
      );
      await db.query(
        `INSERT INTO admin_audit (actor_auth_user_id, action, target, created_at)
         VALUES ($1, $2, $3, $4)`,
        [admin.authUserId, 'opportunity.moderate', `${opportunityId}:${input.action}`, now],
      );
      return { opportunityId, moderationStatus: nextStatus };
    });
  }

  private async lockListing(db: Db, opportunityId: string, owner: ProfileOwner): Promise<ListingAccessRow> {
    const rows = await db.query<ListingAccessRow>(
      `SELECT o.id, o.moderation_status, o.candidate_auth_user_id, o.provider,
              r.checked_at, r.description, r.compensation
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [opportunityId],
    );
    return this.visibleListing(rows.rows[0], owner);
  }

  private async readListing(db: Db, opportunityId: string, owner: ProfileOwner): Promise<ListingAccessRow> {
    const rows = await db.query<ListingAccessRow>(
      `SELECT o.id, o.moderation_status, o.candidate_auth_user_id, o.provider,
              r.checked_at, r.description, r.compensation
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    return this.visibleListing(rows.rows[0], owner);
  }

  private visibleListing(row: ListingAccessRow | undefined, owner: ProfileOwner): ListingAccessRow {
    if (!row) throw new BillingError('not_found');
    if (row.candidate_auth_user_id !== null && row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private summary(
    row: ListingAccessRow,
    sourcesCount: number,
    reportCount: number,
    viewerReport: ViewerReport | null,
  ): TrustSignalSummary {
    const compensation = row.compensation as { minimum?: number | null; maximum?: number | null } | null;
    return computeTrustSignals({
      moderationStatus: row.moderation_status,
      checkedAtIso: row.checked_at.toISOString(),
      nowMs: this.clock.now().getTime(),
      sourcesCount,
      reportCount,
      provider: row.provider,
      description: row.description,
      compensation: compensation ? { minimum: compensation.minimum ?? null, maximum: compensation.maximum ?? null } : undefined,
      viewerReport,
    });
  }

  private async sourceCount(db: Db, opportunityId: string): Promise<number> {
    const sources = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunity_sources WHERE opportunity_id = $1`,
      [opportunityId],
    );
    return parseInt(sources.rows[0]?.count ?? '1', 10);
  }

  private async pendingCount(db: Db, opportunityId: string): Promise<number> {
    const reports = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunity_reports WHERE opportunity_id = $1 AND status = 'pending'`,
      [opportunityId],
    );
    return parseInt(reports.rows[0]?.count ?? '0', 10);
  }

  private assertAdmin(admin: Principal): void {
    if (!this.admins.has(admin.authUserId)) {
      throw new BillingError('permission_denied');
    }
  }
}

export async function readViewerReport(db: Db, opportunityId: string, authUserId: string): Promise<ViewerReport | null> {
  const rows = await db.query<{
    id: string;
    reason: ReportReason;
    status: string;
    review_action: ModerationAction | null;
    created_at: Date;
  }>(
    `SELECT id, reason, status, review_action, created_at
       FROM opportunity_reports
      WHERE opportunity_id = $1 AND candidate_auth_user_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [opportunityId, authUserId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  return {
    reportId: row.id,
    reason: row.reason,
    status: row.status === 'pending' ? 'pending' : 'reviewed',
    reviewAction: row.review_action,
    createdAt: row.created_at.toISOString(),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}
