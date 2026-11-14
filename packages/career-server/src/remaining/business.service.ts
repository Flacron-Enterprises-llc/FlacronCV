import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import {
  BUSINESS_INVITE_TTL_DAYS,
  BUSINESS_SCOPES,
  UNIT_ALLOWANCE_FIELD,
  isBusinessStaffRole,
  safeEvidenceUrl,
} from '@flacroncv/career-shared';
import type { BusinessCandidateStatus, BusinessRole, BusinessScope, BusinessStaffRole, UsageUnit } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { Principal } from '../identity/identity.service';
import { RecordingMailer, type Mailer } from '../mail/mailer';
import { capacityLimit, checkCapacity, checkReactivation, requireFeature } from '../metering/access';
import { normalizeInviteEmail, verifiedErasureEmail } from '../privacy/erasure-email';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_TOKEN = 'bst_';
const CANDIDATE_TOKEN = 'bca_';
const DAY_MS = 86_400_000;

/** Who may act in a workspace, decided per request so a removal takes effect at once. */
export interface BusinessContext {
  workspaceId: string;
  role: BusinessRole;
  scope: BusinessScope;
  /** The caller's staff row; null for the owner. */
  staffId: string | null;
  account: AccountRow;
  snapshot: CatalogSnapshot;
}

export interface BusinessStaffView {
  id: string;
  role: BusinessStaffRole;
  status: 'invited' | 'active' | 'expired' | 'revoked';
  /** Pending invitations show the invited address; accepted members show their sign-in id. */
  email: string | null;
  authUserId: string | null;
  expiresAt: string | null;
  assignedCandidateIds: string[];
}

export interface BusinessCandidateView {
  id: string;
  email: string;
  status: BusinessCandidateStatus;
  inviteState: 'pending' | 'expired' | 'revoked' | 'accepted' | 'none';
  shareProfile: boolean;
  expiresAt: string | null;
  counselorIds: string[];
}

export interface BusinessQueueItem {
  id: string;
  title: string;
  url: string | null;
  note: string;
  candidateId: string | null;
  status: 'open' | 'recommended' | 'closed';
  createdAt: string;
}

export interface BusinessOverview {
  workspaceId: string;
  role: BusinessRole;
  scope: BusinessScope;
  staff: BusinessStaffView[];
  candidates: BusinessCandidateView[];
  capacity: { staffSeats: number | null; staffUsed: number; activeCandidates: number | null; candidatesUsed: number };
}

export interface InvitationResult {
  id: string;
  /** Path on the website; the screen joins it to its own origin so the inviter can copy it. */
  invitePath: string;
  expiresAt: string;
  /** False until mail delivery is configured: the inviter shares the link themselves. */
  delivered: boolean;
}

export interface BusinessMemberships {
  /** True when the caller's own account is on the Business plan. */
  ownsWorkspace: boolean;
  ownWorkspaceId: string;
  staffOf: Array<{ workspaceId: string; role: BusinessStaffRole }>;
  candidateOf: Array<{ candidateId: string; workspaceId: string; status: BusinessCandidateStatus; shareProfile: boolean }>;
}

export interface CandidateDetail {
  id: string;
  email: string;
  status: BusinessCandidateStatus;
  shareProfile: boolean;
  /** Only with the candidate's consent and while active: titles and labels, never files. */
  shared: { evidence: Array<{ title: string; evidenceType: string; evidenceLabel: string }>; confirmedFacts: number } | null;
}

export interface BusinessUsage {
  units: Array<{ unit: string; granted: number; remaining: number }>;
  seats: BusinessOverview['capacity'];
  /** Billing scope only: purchases on the workspace account. Never candidate documents. */
  invoices: Array<{ sku: string; kind: string; amountCents: number | null; currency: string | null; purchasedAt: string; refunded: boolean }> | null;
}

export interface BusinessReport {
  candidates: Record<BusinessCandidateStatus, number>;
  staff: Record<BusinessStaffRole, number>;
  assignments: number;
  sharingCandidates: number;
  queue: Record<'open' | 'recommended' | 'closed', number>;
}

interface StaffRow {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  role: BusinessStaffRole;
  invite_email: string | null;
  invite_expires_at: Date | null;
  invite_revoked_at: Date | null;
  accepted_at: Date | null;
}

interface CandidateRow {
  id: string;
  workspace_id: string;
  email: string;
  status: BusinessCandidateStatus;
  invite_token_hash: string | null;
  invite_expires_at: Date | null;
  invite_revoked_at: Date | null;
  accepted_at: Date | null;
  member_user_id: string | null;
  share_profile: boolean;
}

const systemClock: Clock = { now: () => new Date() };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * CV23 Business workspace (spec sections 4, 19, 29). Gated as before: only a
 * workspace whose account is on the Business plan, with the staff-seat switch
 * on. Every call resolves the caller's role from the database, so removing a
 * staff member or archiving a candidate takes effect on the next request.
 *
 * Invitations are single-use tokens (only a hash is stored) that expire after
 * BUSINESS_INVITE_TTL_DAYS and can be revoked. Accepting needs a signed-in
 * person whose verified address is the invited one.
 */
export class BusinessService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
    private readonly mailer: Mailer = new RecordingMailer(),
    /** Absolute website origin for links in invitation emails; null sends no mail. */
    private readonly inviteOrigin: string | null = null,
  ) {}

  // -------------------------------------------------------------------------
  // Access

  async context(principal: Principal, workspaceId?: string): Promise<BusinessContext> {
    const target = workspaceId && workspaceId !== principal.workspaceId ? workspaceId : principal.workspaceId;
    if (target !== principal.workspaceId && !UUID.test(target)) throw new BillingError('permission_denied');
    let role: BusinessRole = 'owner';
    let staffId: string | null = null;
    if (target !== principal.workspaceId) {
      const staff = await this.pool.query<{ id: string; role: BusinessStaffRole }>(
        `SELECT id, role FROM business_staff WHERE workspace_id = $1 AND auth_user_id = $2 AND accepted_at IS NOT NULL`,
        [target, principal.authUserId],
      );
      const row = staff.rows[0];
      if (!row) throw new BillingError('permission_denied');
      role = row.role;
      staffId = row.id;
    }
    const accounts = await this.pool.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE workspace_id = $1`, [target]);
    if (!accounts.rows[0]) throw new BillingError('permission_denied');
    const account = await readAccount(this.pool, accounts.rows[0].id);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, 'staffSeats');
    let plan: string | null = null;
    try {
      plan = v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
    }
    if (plan !== 'business') {
      if (role === 'owner') throw new BillingError('plan_upgrade_required', { feature: 'staffSeats', minimumPlan: 'business' });
      // The workspace left the Business plan: staff keep no access to it.
      throw new BillingError('permission_denied', { reason: 'workspace_not_business' });
    }
    return { workspaceId: target, role, scope: BUSINESS_SCOPES[role], staffId, account, snapshot };
  }

  private require(ctx: BusinessContext, need: keyof Omit<BusinessScope, 'candidates'>): void {
    if (!ctx.scope[need]) throw new BillingError('permission_denied', { reason: `role_${ctx.role}` });
  }

  /** The candidate ids this role may open: all, those assigned to the caller, or none. */
  private async visibleCandidateIds(ctx: BusinessContext): Promise<Set<string> | 'all'> {
    if (ctx.scope.candidates === 'all') return 'all';
    if (ctx.scope.candidates === 'none' || !ctx.staffId) return new Set();
    const rows = await this.pool.query<{ candidate_id: string }>(`SELECT candidate_id FROM business_assignments WHERE staff_id = $1`, [ctx.staffId]);
    return new Set(rows.rows.map((row) => row.candidate_id));
  }

  async memberships(principal: Principal): Promise<BusinessMemberships> {
    const staff = await this.pool.query<{ workspace_id: string; role: BusinessStaffRole }>(
      `SELECT workspace_id, role FROM business_staff WHERE auth_user_id = $1 AND accepted_at IS NOT NULL ORDER BY created_at`,
      [principal.authUserId],
    );
    const candidates = await this.pool.query<CandidateRow>(
      `SELECT * FROM business_candidates WHERE member_user_id = $1 ORDER BY created_at`,
      [principal.userId],
    );
    let ownsWorkspace = false;
    try {
      await this.context(principal);
      ownsWorkspace = true;
    } catch (error) {
      if (!isBillingError(error)) throw error;
    }
    return {
      ownsWorkspace,
      ownWorkspaceId: principal.workspaceId,
      staffOf: staff.rows.map((row) => ({ workspaceId: row.workspace_id, role: row.role })),
      candidateOf: candidates.rows.map((row) => ({
        candidateId: row.id,
        workspaceId: row.workspace_id,
        status: row.status,
        shareProfile: row.share_profile,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Overview

  async overview(principal: Principal, workspaceId?: string): Promise<BusinessOverview> {
    const ctx = await this.context(principal, workspaceId);
    const now = this.clock.now();
    const visible = await this.visibleCandidateIds(ctx);
    const assignments = await this.pool.query<{ staff_id: string; candidate_id: string }>(
      `SELECT a.staff_id, a.candidate_id FROM business_assignments a JOIN business_staff s ON s.id = a.staff_id WHERE s.workspace_id = $1`,
      [ctx.workspaceId],
    );
    let staff: BusinessStaffView[] = [];
    if (ctx.scope.manageWorkspace) {
      const rows = await this.pool.query<StaffRow>(`SELECT * FROM business_staff WHERE workspace_id = $1 ORDER BY created_at, id`, [ctx.workspaceId]);
      staff = rows.rows.map((row) => ({
        id: row.id,
        role: row.role,
        status: row.accepted_at ? 'active' : row.invite_revoked_at ? 'revoked' : row.invite_expires_at && row.invite_expires_at <= now ? 'expired' : 'invited',
        email: row.accepted_at ? null : row.invite_email,
        authUserId: row.auth_user_id,
        expiresAt: row.accepted_at ? null : row.invite_expires_at?.toISOString() ?? null,
        assignedCandidateIds: assignments.rows.filter((a) => a.staff_id === row.id).map((a) => a.candidate_id),
      }));
    }
    let candidates: BusinessCandidateView[] = [];
    if (visible === 'all' || visible.size > 0) {
      const rows = await this.pool.query<CandidateRow>(`SELECT * FROM business_candidates WHERE workspace_id = $1 ORDER BY created_at, id`, [ctx.workspaceId]);
      candidates = rows.rows
        .filter((row) => visible === 'all' || visible.has(row.id))
        .map((row) => this.candidateView(row, now, assignments.rows));
    }
    return { workspaceId: ctx.workspaceId, role: ctx.role, scope: ctx.scope, staff, candidates, capacity: await this.capacity(ctx) };
  }

  private candidateView(row: CandidateRow, now: Date, assignments: Array<{ staff_id: string; candidate_id: string }>): BusinessCandidateView {
    const inviteState: BusinessCandidateView['inviteState'] = row.accepted_at
      ? 'accepted'
      : row.invite_revoked_at
        ? 'revoked'
        : !row.invite_token_hash
          ? 'none'
          : row.invite_expires_at && row.invite_expires_at <= now
            ? 'expired'
            : 'pending';
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      inviteState,
      shareProfile: row.share_profile,
      expiresAt: row.accepted_at ? null : row.invite_expires_at?.toISOString() ?? null,
      counselorIds: assignments.filter((a) => a.candidate_id === row.id).map((a) => a.staff_id),
    };
  }

  private async capacity(ctx: BusinessContext): Promise<BusinessOverview['capacity']> {
    // Plan caps plus seat and candidate add-ons.
    return {
      staffSeats: capacityLimit(ctx.snapshot, ctx.account, 'staffSeats'),
      staffUsed: await this.staffUsed(ctx.workspaceId),
      activeCandidates: capacityLimit(ctx.snapshot, ctx.account, 'activeCandidates'),
      candidatesUsed: await this.candidatesUsed(ctx.workspaceId),
    };
  }

  /** Accepted staff and invitations that can still be accepted hold a seat. */
  private async staffUsed(workspaceId: string, db: Pick<Pool, 'query'> = this.pool): Promise<number> {
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM business_staff
        WHERE workspace_id = $1
          AND (accepted_at IS NOT NULL OR (invite_revoked_at IS NULL AND (invite_expires_at IS NULL OR invite_expires_at > $2)))`,
      [workspaceId, this.clock.now()],
    );
    return res.rows[0]?.n ?? 0;
  }

  /** Archived candidates and dead invitations do not count as active candidates. */
  private async candidatesUsed(workspaceId: string, db: Pick<Pool, 'query'> = this.pool): Promise<number> {
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM business_candidates
        WHERE workspace_id = $1 AND status <> 'archived'
          AND (status = 'active' OR (invite_revoked_at IS NULL AND (invite_expires_at IS NULL OR invite_expires_at > $2)))`,
      [workspaceId, this.clock.now()],
    );
    return res.rows[0]?.n ?? 0;
  }

  // -------------------------------------------------------------------------
  // Staff

  async inviteStaff(principal: Principal, workspaceId: string | undefined, email: string, role: string): Promise<InvitationResult> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    if (!isBusinessStaffRole(role)) throw new BillingError('validation_error', { field: 'role', reason: 'invalid' });
    const clean = normalizeInviteEmail(email);
    if (!clean || clean.length > 200) throw new BillingError('validation_error', { field: 'email', reason: 'invalid' });
    const token = `${STAFF_TOKEN}${randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(this.clock.now().getTime() + BUSINESS_INVITE_TTL_DAYS * DAY_MS);
    const id = await withTransaction(this.pool, async (db) => {
      await db.query(`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, [ctx.workspaceId]);
      checkCapacity(ctx.snapshot, ctx.account, 'staffSeats', await this.staffUsed(ctx.workspaceId, db), 1);
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO business_staff (workspace_id, role, invite_email, invite_token_hash, invite_expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ctx.workspaceId, role, clean, hashToken(token), expiresAt],
      );
      return inserted.rows[0].id;
    });
    return this.sendInvite(clean, token, expiresAt, id, 'staff');
  }

  /** Revokes a pending invitation, or removes an accepted member at once. Assignments go with it. */
  async removeStaff(principal: Principal, workspaceId: string | undefined, staffId: string): Promise<{ ok: true }> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    const row = await this.staffRow(ctx, staffId);
    if (ctx.staffId === row.id) throw new BillingError('validation_error', { field: 'staffId', reason: 'cannot_remove_self' });
    await withTransaction(this.pool, async (db) => {
      await db.query(`UPDATE business_queue_items SET added_by_staff_id = NULL WHERE added_by_staff_id = $1`, [row.id]);
      await db.query(`DELETE FROM business_assignments WHERE staff_id = $1`, [row.id]);
      await db.query(`DELETE FROM business_staff WHERE id = $1 AND workspace_id = $2`, [row.id, ctx.workspaceId]);
    });
    return { ok: true };
  }

  private async staffRow(ctx: BusinessContext, staffId: string): Promise<StaffRow> {
    if (!UUID.test(staffId)) throw new BillingError('not_found');
    const rows = await this.pool.query<StaffRow>(`SELECT * FROM business_staff WHERE id = $1`, [staffId]);
    const row = rows.rows[0];
    if (!row || row.workspace_id !== ctx.workspaceId) throw new BillingError('permission_denied');
    return row;
  }

  // -------------------------------------------------------------------------
  // Candidates

  async inviteCandidate(principal: Principal, workspaceId: string | undefined, email: string, consent: boolean): Promise<InvitationResult> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    if (consent !== true) throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
    const clean = normalizeInviteEmail(email);
    if (!clean || clean.length > 200) throw new BillingError('validation_error', { field: 'email', reason: 'invalid' });
    const token = `${CANDIDATE_TOKEN}${randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(this.clock.now().getTime() + BUSINESS_INVITE_TTL_DAYS * DAY_MS);
    const id = await withTransaction(this.pool, async (db) => {
      await db.query(`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, [ctx.workspaceId]);
      const existing = await db.query<CandidateRow>(`SELECT * FROM business_candidates WHERE workspace_id = $1 AND email = $2`, [ctx.workspaceId, clean]);
      const row = existing.rows[0];
      if (row && row.status === 'active') throw new BillingError('validation_error', { field: 'email', reason: 'already_member' });
      if (row && row.status === 'archived' && row.accepted_at) throw new BillingError('validation_error', { field: 'email', reason: 'archived_reactivate' });
      // A dead invitation for the same address is renewed rather than duplicated.
      const holdsSeat = row && row.status === 'invited' && !row.invite_revoked_at && (!row.invite_expires_at || row.invite_expires_at > this.clock.now());
      checkCapacity(ctx.snapshot, ctx.account, 'activeCandidates', (await this.candidatesUsed(ctx.workspaceId, db)) - (holdsSeat ? 1 : 0), 1);
      if (row) {
        await db.query(
          `UPDATE business_candidates
              SET status = 'invited', consent = true, invite_token_hash = $2, invite_expires_at = $3, invite_revoked_at = NULL, archived_at = NULL
            WHERE id = $1`,
          [row.id, hashToken(token), expiresAt],
        );
        return row.id;
      }
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO business_candidates (workspace_id, email, consent, status, invite_token_hash, invite_expires_at)
         VALUES ($1, $2, true, 'invited', $3, $4) RETURNING id`,
        [ctx.workspaceId, clean, hashToken(token), expiresAt],
      );
      return inserted.rows[0].id;
    });
    return this.sendInvite(clean, token, expiresAt, id, 'candidate');
  }

  async revokeCandidateInvite(principal: Principal, workspaceId: string | undefined, candidateId: string): Promise<{ ok: true }> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    const row = await this.candidateRow(ctx, candidateId);
    if (row.accepted_at) throw new BillingError('validation_error', { field: 'candidateId', reason: 'already_accepted' });
    await this.pool.query(`UPDATE business_candidates SET invite_revoked_at = $2, invite_token_hash = NULL WHERE id = $1`, [row.id, this.clock.now()]);
    return { ok: true };
  }

  /** Archived candidates keep their record but receive no services: no queue items and no assignments. */
  async setCandidateArchived(principal: Principal, workspaceId: string | undefined, candidateId: string, archived: boolean): Promise<BusinessCandidateView> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    await withTransaction(this.pool, async (db) => {
      await db.query(`SELECT id FROM workspaces WHERE id = $1 FOR UPDATE`, [ctx.workspaceId]);
      const row = await this.candidateRow(ctx, candidateId, db);
      if (archived) {
        await db.query(`UPDATE business_candidates SET status = 'archived', archived_at = $2, invite_token_hash = NULL WHERE id = $1`, [row.id, this.clock.now()]);
        return;
      }
      if (row.status !== 'archived') return;
      if (!row.accepted_at) throw new BillingError('validation_error', { field: 'candidateId', reason: 'invite_again' });
      // The archived row is not counted in candidatesUsed, so this is "active now, excluding it".
      checkReactivation(ctx.snapshot, ctx.account, 'activeCandidates', await this.candidatesUsed(ctx.workspaceId, db));
      await db.query(`UPDATE business_candidates SET status = 'active', archived_at = NULL WHERE id = $1`, [row.id]);
    });
    const assignments = await this.pool.query<{ staff_id: string; candidate_id: string }>(`SELECT staff_id, candidate_id FROM business_assignments WHERE candidate_id = $1`, [candidateId]);
    return this.candidateView(await this.candidateRow(ctx, candidateId), this.clock.now(), assignments.rows);
  }

  private async candidateRow(ctx: BusinessContext, candidateId: string, db: Pick<Pool, 'query'> = this.pool): Promise<CandidateRow> {
    if (!UUID.test(candidateId)) throw new BillingError('not_found');
    const rows = await db.query<CandidateRow>(`SELECT * FROM business_candidates WHERE id = $1`, [candidateId]);
    const row = rows.rows[0];
    if (!row || row.workspace_id !== ctx.workspaceId) throw new BillingError('permission_denied');
    return row;
  }

  /**
   * A counselor sees only assigned candidates; a billing administrator sees
   * none. Shared material appears only with the candidate's consent.
   */
  async candidate(principal: Principal, workspaceId: string | undefined, candidateId: string): Promise<CandidateDetail> {
    const ctx = await this.context(principal, workspaceId);
    const row = await this.candidateRow(ctx, candidateId);
    const visible = await this.visibleCandidateIds(ctx);
    if (visible !== 'all' && !visible.has(row.id)) throw new BillingError('permission_denied');
    let shared: CandidateDetail['shared'] = null;
    if (row.share_profile && row.status === 'active' && row.member_user_id) {
      const member = await this.pool.query<{ auth_user_id: string; workspace_id: string }>(
        `SELECT u.auth_user_id, w.id AS workspace_id FROM users u JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual' WHERE u.id = $1`,
        [row.member_user_id],
      );
      const person = member.rows[0];
      if (person) {
        const evidence = await this.pool.query<{ title: string; evidence_type: string; evidence_label: string }>(
          `SELECT title, evidence_type, evidence_label FROM career_evidence
            WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND is_portfolio_shared = TRUE
              AND (confidential = FALSE OR redaction_confirmed_at IS NOT NULL)
            ORDER BY updated_at DESC LIMIT 50`,
          [person.workspace_id, person.auth_user_id],
        );
        const facts = await this.pool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND confirmation = 'confirmed'`,
          [person.workspace_id, person.auth_user_id],
        );
        shared = {
          evidence: evidence.rows.map((item) => ({ title: item.title, evidenceType: item.evidence_type, evidenceLabel: item.evidence_label })),
          confirmedFacts: facts.rows[0]?.n ?? 0,
        };
      }
    }
    return { id: row.id, email: row.email, status: row.status, shareProfile: row.share_profile, shared };
  }

  async assignCounselor(principal: Principal, workspaceId: string | undefined, staffId: string, candidateId: string, assigned = true): Promise<{ ok: true }> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'manageWorkspace');
    const staff = await this.staffRow(ctx, staffId);
    const candidate = await this.candidateRow(ctx, candidateId);
    if (!assigned) {
      await this.pool.query(`DELETE FROM business_assignments WHERE staff_id = $1 AND candidate_id = $2`, [staff.id, candidate.id]);
      return { ok: true };
    }
    if (staff.role !== 'counselor' || !staff.accepted_at) throw new BillingError('validation_error', { field: 'staffId', reason: 'not_counselor' });
    if (candidate.status === 'archived') throw new BillingError('validation_error', { field: 'candidateId', reason: 'archived' });
    await this.pool.query(`INSERT INTO business_assignments (staff_id, candidate_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [staff.id, candidate.id]);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Invitations: accept, and the candidate's own view

  async acceptInvitation(principal: Principal, token: string): Promise<{ kind: 'staff' | 'candidate'; workspaceId: string }> {
    if (typeof token !== 'string' || token.length < 10 || token.length > 200) throw new BillingError('not_found');
    const email = verifiedErasureEmail(principal.identity);
    if (!email) throw new BillingError('permission_denied', { reason: 'email_not_verified' });
    const hash = hashToken(token);
    const now = this.clock.now();
    if (token.startsWith(STAFF_TOKEN)) {
      return withTransaction(this.pool, async (db) => {
        const rows = await db.query<StaffRow>(`SELECT * FROM business_staff WHERE invite_token_hash = $1 FOR UPDATE`, [hash]);
        const row = rows.rows[0];
        if (!row || row.accepted_at || row.invite_revoked_at) throw new BillingError('not_found');
        if (row.invite_expires_at && row.invite_expires_at <= now) throw new BillingError('not_found', { reason: 'invitation_expired' });
        if (row.invite_email !== email) throw new BillingError('permission_denied', { reason: 'email_mismatch' });
        if (row.workspace_id === principal.workspaceId) throw new BillingError('validation_error', { field: 'token', reason: 'own_workspace' });
        const already = await db.query(`SELECT 1 FROM business_staff WHERE workspace_id = $1 AND auth_user_id = $2`, [row.workspace_id, principal.authUserId]);
        if (already.rows.length > 0) throw new BillingError('validation_error', { field: 'token', reason: 'already_member' });
        // The address and token are not kept once the invitation is used.
        await db.query(
          `UPDATE business_staff SET auth_user_id = $2, accepted_at = $3, invite_token_hash = NULL, invite_email = NULL WHERE id = $1`,
          [row.id, principal.authUserId, now],
        );
        return { kind: 'staff' as const, workspaceId: row.workspace_id };
      });
    }
    if (token.startsWith(CANDIDATE_TOKEN)) {
      return withTransaction(this.pool, async (db) => {
        const rows = await db.query<CandidateRow>(`SELECT * FROM business_candidates WHERE invite_token_hash = $1 FOR UPDATE`, [hash]);
        const row = rows.rows[0];
        if (!row || row.accepted_at || row.invite_revoked_at || row.status === 'archived') throw new BillingError('not_found');
        if (row.invite_expires_at && row.invite_expires_at <= now) throw new BillingError('not_found', { reason: 'invitation_expired' });
        if (row.email !== email) throw new BillingError('permission_denied', { reason: 'email_mismatch' });
        await db.query(
          `UPDATE business_candidates SET status = 'active', accepted_at = $2, member_user_id = $3, invite_token_hash = NULL WHERE id = $1`,
          [row.id, now, principal.userId],
        );
        return { kind: 'candidate' as const, workspaceId: row.workspace_id };
      });
    }
    throw new BillingError('not_found');
  }

  /** The invited candidate decides whether staff may see their shared material. */
  async setShareProfile(principal: Principal, candidateId: string, share: boolean): Promise<{ shareProfile: boolean }> {
    const row = await this.ownCandidacy(principal, candidateId);
    await this.pool.query(`UPDATE business_candidates SET share_profile = $2 WHERE id = $1`, [row.id, share]);
    return { shareProfile: share };
  }

  /** The candidate leaves the workspace; their own profile is untouched. */
  async leave(principal: Principal, candidateId: string): Promise<{ ok: true }> {
    const row = await this.ownCandidacy(principal, candidateId);
    await withTransaction(this.pool, async (db) => {
      await db.query(`DELETE FROM business_assignments WHERE candidate_id = $1`, [row.id]);
      await db.query(
        `UPDATE business_candidates SET status = 'archived', archived_at = $2, share_profile = false, member_user_id = NULL WHERE id = $1`,
        [row.id, this.clock.now()],
      );
    });
    return { ok: true };
  }

  private async ownCandidacy(principal: Principal, candidateId: string): Promise<CandidateRow> {
    if (!UUID.test(candidateId)) throw new BillingError('not_found');
    const rows = await this.pool.query<CandidateRow>(`SELECT * FROM business_candidates WHERE id = $1 AND member_user_id = $2`, [candidateId, principal.userId]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    return row;
  }

  // -------------------------------------------------------------------------
  // Shared opportunity queue

  async queue(principal: Principal, workspaceId?: string): Promise<{ items: BusinessQueueItem[] }> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'queue');
    const visible = await this.visibleCandidateIds(ctx);
    const rows = await this.pool.query<{ id: string; title: string; url: string | null; note: string; candidate_id: string | null; status: BusinessQueueItem['status']; created_at: Date }>(
      `SELECT id, title, url, note, candidate_id, status, created_at FROM business_queue_items WHERE workspace_id = $1 ORDER BY created_at DESC, id LIMIT 200`,
      [ctx.workspaceId],
    );
    return {
      items: rows.rows
        .filter((row) => row.candidate_id === null || visible === 'all' || visible.has(row.candidate_id))
        .map((row) => ({ id: row.id, title: row.title, url: row.url, note: row.note, candidateId: row.candidate_id, status: row.status, createdAt: row.created_at.toISOString() })),
    };
  }

  async addQueueItem(
    principal: Principal,
    workspaceId: string | undefined,
    input: { title?: string; url?: string | null; note?: string; candidateId?: string | null },
  ): Promise<BusinessQueueItem> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'queue');
    const title = input.title?.trim() ?? '';
    if (title.length === 0 || title.length > 200) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    let url: string | null = null;
    if (input.url && input.url.trim()) {
      url = safeEvidenceUrl(input.url);
      if (!url || url.length > 500) throw new BillingError('validation_error', { field: 'url', reason: 'unsafe_url' });
    }
    const note = (input.note ?? '').trim();
    if (note.length > 2000) throw new BillingError('validation_error', { field: 'note', reason: 'too_long' });
    let candidateId: string | null = null;
    if (input.candidateId) {
      const candidate = await this.candidateRow(ctx, input.candidateId);
      const visible = await this.visibleCandidateIds(ctx);
      if (visible !== 'all' && !visible.has(candidate.id)) throw new BillingError('permission_denied');
      if (candidate.status !== 'active') throw new BillingError('validation_error', { field: 'candidateId', reason: 'not_active' });
      candidateId = candidate.id;
    }
    const inserted = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO business_queue_items (workspace_id, title, url, note, candidate_id, added_by_staff_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [ctx.workspaceId, title, url, note, candidateId, ctx.staffId, candidateId ? 'recommended' : 'open'],
    );
    return { id: inserted.rows[0].id, title, url, note, candidateId, status: candidateId ? 'recommended' : 'open', createdAt: inserted.rows[0].created_at.toISOString() };
  }

  async removeQueueItem(principal: Principal, workspaceId: string | undefined, itemId: string): Promise<{ ok: true }> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'queue');
    if (!UUID.test(itemId)) throw new BillingError('not_found');
    const rows = await this.pool.query<{ workspace_id: string; added_by_staff_id: string | null }>(`SELECT workspace_id, added_by_staff_id FROM business_queue_items WHERE id = $1`, [itemId]);
    const row = rows.rows[0];
    if (!row || row.workspace_id !== ctx.workspaceId) throw new BillingError('permission_denied');
    if (!ctx.scope.manageWorkspace && row.added_by_staff_id !== ctx.staffId) throw new BillingError('permission_denied');
    await this.pool.query(`DELETE FROM business_queue_items WHERE id = $1`, [itemId]);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Usage, invoices and aggregate reports (counts only)

  async usage(principal: Principal, workspaceId?: string): Promise<BusinessUsage> {
    const ctx = await this.context(principal, workspaceId);
    if (!ctx.scope.billing && !ctx.scope.manageWorkspace) throw new BillingError('permission_denied');
    const now = this.clock.now();
    const units: BusinessUsage['units'] = [];
    for (const unit of Object.keys(UNIT_ALLOWANCE_FIELD) as UsageUnit[]) {
      if (!UNIT_ALLOWANCE_FIELD[unit]) continue;
      try {
        const balance = await unitBalance(this.pool, ctx.account, ctx.snapshot, unit, now);
        units.push({ unit, granted: balance.includedGranted, remaining: balance.includedRemaining + balance.packRemaining });
      } catch (error) {
        if (!isBillingError(error)) throw error;
      }
    }
    let invoices: BusinessUsage['invoices'] = null;
    if (ctx.scope.billing) {
      const rows = await this.pool.query<{ sku: string; kind: string; amount_cents: number | null; currency: string | null; purchased_at: Date; refunded_at: Date | null }>(
        `SELECT sku, kind, amount_cents, currency, purchased_at, refunded_at FROM purchases WHERE billing_account_id = $1 ORDER BY purchased_at DESC LIMIT 100`,
        [ctx.account.id],
      );
      invoices = rows.rows.map((row) => ({
        sku: row.sku,
        kind: row.kind,
        amountCents: row.amount_cents,
        currency: row.currency,
        purchasedAt: row.purchased_at.toISOString(),
        refunded: row.refunded_at !== null,
      }));
    }
    return { units, seats: await this.capacity(ctx), invoices };
  }

  async report(principal: Principal, workspaceId?: string): Promise<BusinessReport> {
    const ctx = await this.context(principal, workspaceId);
    this.require(ctx, 'reports');
    const candidates = await this.pool.query<{ status: BusinessCandidateStatus; n: number; sharing: number }>(
      `SELECT status, count(*)::int AS n, count(*) FILTER (WHERE share_profile)::int AS sharing FROM business_candidates WHERE workspace_id = $1 GROUP BY status`,
      [ctx.workspaceId],
    );
    const staff = await this.pool.query<{ role: BusinessStaffRole; n: number }>(
      `SELECT role, count(*)::int AS n FROM business_staff WHERE workspace_id = $1 AND accepted_at IS NOT NULL GROUP BY role`,
      [ctx.workspaceId],
    );
    const assignments = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM business_assignments a JOIN business_staff s ON s.id = a.staff_id WHERE s.workspace_id = $1`,
      [ctx.workspaceId],
    );
    const queue = await this.pool.query<{ status: 'open' | 'recommended' | 'closed'; n: number }>(
      `SELECT status, count(*)::int AS n FROM business_queue_items WHERE workspace_id = $1 GROUP BY status`,
      [ctx.workspaceId],
    );
    const report: BusinessReport = {
      candidates: { invited: 0, active: 0, archived: 0 },
      staff: { manager: 0, counselor: 0, billing_admin: 0 },
      assignments: assignments.rows[0]?.n ?? 0,
      sharingCandidates: 0,
      queue: { open: 0, recommended: 0, closed: 0 },
    };
    for (const row of candidates.rows) {
      report.candidates[row.status] = row.n;
      report.sharingCandidates += row.sharing;
    }
    for (const row of staff.rows) report.staff[row.role] = row.n;
    for (const row of queue.rows) report.queue[row.status] = row.n;
    return report;
  }

  // -------------------------------------------------------------------------

  /**
   * Sends the invitation through the mailer. With no mail delivery configured
   * the mailer reports `delivered: false` and nothing leaves the server; the
   * screen then shows the link for the inviter to share.
   */
  private async sendInvite(email: string, token: string, expiresAt: Date, id: string, kind: 'staff' | 'candidate'): Promise<InvitationResult> {
    const invitePath = `/career/business/join?token=${encodeURIComponent(token)}`;
    let delivered = false;
    if (this.inviteOrigin) {
      try {
        delivered = (
          await this.mailer.send({
            to: email,
            subject: kind === 'staff' ? 'You are invited to a FlacronCV career-services workspace' : 'Your career-services invitation on FlacronCV',
            text: `You have been invited to join a FlacronCV career-services workspace${kind === 'staff' ? ' as staff' : ''}.\n\nSign in with this address and open:\n${this.inviteOrigin}${invitePath}\n\nThe invitation expires on ${expiresAt.toISOString().slice(0, 10)}. If you did not expect it, ignore this email.`,
          })
        ).delivered;
      } catch {
        delivered = false;
      }
    }
    return { id, invitePath, expiresAt: expiresAt.toISOString(), delivered };
  }
}
