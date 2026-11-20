import type { Pool } from 'pg';
import { CATALOG_VERSION, isCalendarDate, isVerificationMethod, isVerifiedLabel } from '@flacroncv/career-shared';
import type { EvidenceVerification, RecordVerificationInput } from '@flacroncv/career-shared';
import { shownLabel, verificationsFor } from '../evidence/evidence.service';
import type { Clock } from '../billing/billing.service';
import { CatalogStore, publishCatalog } from '../billing/catalog';
import { BillingError } from '../billing/errors';
import type { Principal } from '../identity/identity.service';
import { sesRoleAvailable, sesSettings } from '../mail/ses-mailer';

/** Fallback when nothing is bound. Health never pings a vendor. */
export const PROVIDER_HEALTH = [
  { name: 'stripe', status: 'unconfigured' },
  { name: 'apple', status: 'unconfigured' },
  { name: 'google', status: 'unconfigured' },
  { name: 'text_model', status: 'unconfigured' },
  { name: 'speech_transcription', status: 'unconfigured' },
  { name: 'job_feeds', status: 'unconfigured' },
  { name: 'map_tiles', status: 'unconfigured' },
  { name: 'geocoding', status: 'unconfigured' },
  { name: 'storage', status: 'unconfigured' },
  { name: 'email', status: 'unconfigured' },
] as const;

/** Binding status from env names only. No network call and no secret values. */
export function providerHealthFromEnv(env: NodeJS.ProcessEnv = process.env): Array<{ name: string; status: string }> {
  const stripeKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const stripe = /^(sk_test_|rk_test_)/.test(stripeKey)
    ? 'sandbox'
    : /^(sk_live_|rk_live_)/.test(stripeKey) && env.NODE_ENV === 'production'
      ? 'configured'
      : 'unconfigured';
  const text =
    env.AI_PROVIDER?.trim().toLowerCase() === 'openai' && (env.OPENAI_API_KEY?.trim() ?? '').length > 0
      ? 'configured'
      : 'unconfigured';
  const storageMode = env.OBJECT_STORAGE?.trim().toLowerCase() ?? '';
  const storage =
    storageMode === 'local'
      ? 'local'
      : storageMode === 's3' && (env.OBJECT_STORAGE_BUCKET?.trim() ?? '').length > 0
        ? 'configured'
        : 'unconfigured';
  const ses = sesSettings(env);
  const hasSes = ((ses.accessKeyId.length > 0 && ses.secretAccessKey.length > 0) || sesRoleAvailable(env)) && ses.fromEmail.length > 0;
  const delivery = env.MAIL_DELIVERY?.trim().toLowerCase() ?? '';
  const email =
    delivery === 'sandbox' && hasSes
      ? 'sandbox'
      : delivery === 'live' && env.NODE_ENV === 'production' && hasSes
        ? 'configured'
        : 'unconfigured';
  return [
    { name: 'stripe', status: stripe },
    { name: 'apple', status: 'unconfigured' },
    { name: 'google', status: 'unconfigured' },
    { name: 'text_model', status: text },
    { name: 'speech_transcription', status: 'unconfigured' },
    { name: 'job_feeds', status: 'unconfigured' },
    { name: 'map_tiles', status: 'unconfigured' },
    {
      name: 'geocoding',
      status:
        env.GEOCODING_PROVIDER?.trim().toLowerCase() === 'google' && (env.GEOCODING_API_KEY?.trim() ?? '').length > 0
          ? 'configured'
          : 'unconfigured',
    },
    { name: 'storage', status: storage },
    { name: 'email', status: email },
  ];
}

const systemClock: Clock = { now: () => new Date() };

export function adminUidSet(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 128);
  return new Set(ids);
}

/** What an operator sees of an item when recording a check: never the file or description. */
export interface AdminEvidenceView {
  id: string;
  title: string;
  evidenceType: string;
  evidenceLabel: string;
  verifications: EvidenceVerification[];
}

export interface AdminBusinessRow {
  workspaceId: string;
  staff: { manager: number; counselor: number; billing_admin: number };
  pendingStaffInvites: number;
  candidates: { invited: number; active: number; archived: number };
  pendingCandidateInvites: number;
  expiredInvites: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_MAX = { scope: 500, issuerName: 200, permissionEvidence: 500, reason: 500 } as const;

export interface AdminFlag {
  feature: string;
  enabled: boolean;
  source: 'flag' | 'phase';
}

/**
 * Platform admin tools. A uid that is not on the allowlist is refused
 * before any write. Prices are not accepted from the client. A published
 * catalog version is not rewritten.
 */
export class AdminService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly admins: ReadonlySet<string>,
    private readonly clock: Clock = systemClock,
  ) {}

  async catalog(owner: Principal): Promise<{ items: Array<{ version: string; publishedAt: string }> }> {
    this.assertAdmin(owner);
    const rows = await this.pool.query<{ version: string; published_at: Date }>(
      `SELECT version, published_at FROM catalog_versions ORDER BY published_at, version`,
    );
    return { items: rows.rows.map((row) => ({ version: row.version, publishedAt: row.published_at.toISOString() })) };
  }

  async publish(owner: Principal): Promise<{ result: 'inserted' | 'unchanged' }> {
    this.assertAdmin(owner);
    const result = await publishCatalog(this.pool, this.clock.now());
    await this.record(owner, `catalog.${result}`, CATALOG_VERSION);
    return { result };
  }

  async flags(owner: Principal): Promise<{ items: AdminFlag[] }> {
    this.assertAdmin(owner);
    return { items: await this.flagList() };
  }

  async setFlag(owner: Principal, feature: string | undefined, enabled: boolean | undefined): Promise<{ items: AdminFlag[] }> {
    this.assertAdmin(owner);
    if (typeof feature !== 'string' || feature.length === 0) {
      throw new BillingError('validation_error', { field: 'feature', reason: 'invalid' });
    }
    if (typeof enabled !== 'boolean') throw new BillingError('validation_error', { field: 'enabled', reason: 'invalid' });
    const snapshot = await this.catalogs.get(this.pool, CATALOG_VERSION);
    if (!Object.prototype.hasOwnProperty.call(snapshot.featurePhase, feature)) {
      throw new BillingError('validation_error', { field: 'feature', reason: 'unknown' });
    }
    await this.pool.query(
      `INSERT INTO feature_flags (feature, enabled, updated_at, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (feature) DO UPDATE
         SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [feature, enabled, this.clock.now(), owner.authUserId],
    );
    await this.record(owner, 'flag.set', feature);
    return { items: await this.flagList() };
  }

  async health(owner: Principal): Promise<{ providers: Array<{ name: string; status: string }> }> {
    this.assertAdmin(owner);
    return { providers: providerHealthFromEnv() };
  }

  async audit(owner: Principal): Promise<{ items: Array<{ id: string; actorAuthUserId: string; action: string; target: string; createdAt: string }> }> {
    this.assertAdmin(owner);
    const rows = await this.pool.query<{ id: string; actor_auth_user_id: string; action: string; target: string; created_at: Date }>(
      `SELECT id, actor_auth_user_id, action, target, created_at FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT 100`,
    );
    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        actorAuthUserId: row.actor_auth_user_id,
        action: row.action,
        target: row.target,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  /** Looks an item up by the id the person gave support. Audited; shows no file or description. */
  async evidence(owner: Principal, evidenceId: string): Promise<AdminEvidenceView> {
    this.assertAdmin(owner);
    const view = await this.evidenceView(evidenceId);
    await this.record(owner, 'evidence.lookup', evidenceId);
    return view;
  }

  /**
   * Records an issuer, assessment or reference check (spec section 25): the
   * method, date, scope, named issuer or assessment, and the permission
   * evidence are all required. A reference check applies only to a reference
   * item; an issuer check never to one. Audited.
   */
  async recordEvidenceVerification(owner: Principal, evidenceId: string, input: Partial<RecordVerificationInput>): Promise<AdminEvidenceView> {
    this.assertAdmin(owner);
    const item = await this.evidenceView(evidenceId);
    if (!isVerifiedLabel(input.label)) throw new BillingError('validation_error', { field: 'label', reason: 'invalid' });
    if (!isVerificationMethod(input.method)) throw new BillingError('validation_error', { field: 'method', reason: 'invalid' });
    if ((input.label === 'reference_confirmed') !== (item.evidenceType === 'reference')) {
      throw new BillingError('validation_error', { field: 'label', reason: 'does_not_fit_item' });
    }
    const today = this.clock.now().toISOString().slice(0, 10);
    if (!isCalendarDate(input.checkedOn) || input.checkedOn > today) {
      throw new BillingError('validation_error', { field: 'checkedOn', reason: 'invalid' });
    }
    const expiresOn = input.expiresOn ? input.expiresOn : null;
    if (expiresOn !== null && (!isCalendarDate(expiresOn) || expiresOn < input.checkedOn)) {
      throw new BillingError('validation_error', { field: 'expiresOn', reason: 'invalid' });
    }
    const scope = requiredText(input.scope, TEXT_MAX.scope, 'scope');
    const issuerName = requiredText(input.issuerName, TEXT_MAX.issuerName, 'issuerName');
    const permissionEvidence = requiredText(input.permissionEvidence, TEXT_MAX.permissionEvidence, 'permissionEvidence');
    await this.pool.query(
      `INSERT INTO evidence_verifications (evidence_id, label, method, checked_on, scope, issuer_name, permission_evidence, expires_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [evidenceId, input.label, input.method, input.checkedOn, scope, issuerName, permissionEvidence, expiresOn],
    );
    await this.record(owner, `evidence.verify.${input.label}`, evidenceId);
    return this.evidenceView(evidenceId);
  }

  /** A revoked check stays in the history and no longer raises the label. */
  async revokeEvidenceVerification(owner: Principal, verificationId: string, reason: string | undefined): Promise<AdminEvidenceView> {
    this.assertAdmin(owner);
    if (!UUID.test(verificationId)) throw new BillingError('not_found');
    const why = requiredText(reason, TEXT_MAX.reason, 'reason');
    const updated = await this.pool.query<{ evidence_id: string }>(
      `UPDATE evidence_verifications SET revoked_at = COALESCE(revoked_at, $2), revoked_reason = COALESCE(revoked_reason, $3)
        WHERE id = $1 RETURNING evidence_id`,
      [verificationId, this.clock.now(), why],
    );
    const row = updated.rows[0];
    if (!row) throw new BillingError('not_found');
    await this.record(owner, 'evidence.verify.revoke', verificationId);
    return this.evidenceView(row.evidence_id);
  }

  /** Invitation and role counts per Business workspace. Counts only: no addresses, no candidate data. */
  async businessWorkspaces(owner: Principal): Promise<{ items: AdminBusinessRow[] }> {
    this.assertAdmin(owner);
    const now = this.clock.now();
    const staff = await this.pool.query<{ workspace_id: string; role: 'manager' | 'counselor' | 'billing_admin'; active: number; pending: number; expired: number }>(
      `SELECT workspace_id, role,
              count(*) FILTER (WHERE accepted_at IS NOT NULL)::int AS active,
              count(*) FILTER (WHERE accepted_at IS NULL AND invite_revoked_at IS NULL AND (invite_expires_at IS NULL OR invite_expires_at > $1))::int AS pending,
              count(*) FILTER (WHERE accepted_at IS NULL AND invite_revoked_at IS NULL AND invite_expires_at <= $1)::int AS expired
         FROM business_staff GROUP BY workspace_id, role`,
      [now],
    );
    const candidates = await this.pool.query<{ workspace_id: string; status: 'invited' | 'active' | 'archived'; n: number; pending: number; expired: number }>(
      `SELECT workspace_id, status, count(*)::int AS n,
              count(*) FILTER (WHERE status = 'invited' AND invite_revoked_at IS NULL AND (invite_expires_at IS NULL OR invite_expires_at > $1))::int AS pending,
              count(*) FILTER (WHERE status = 'invited' AND invite_revoked_at IS NULL AND invite_expires_at <= $1)::int AS expired
         FROM business_candidates GROUP BY workspace_id, status`,
      [now],
    );
    const rows = new Map<string, AdminBusinessRow>();
    const get = (workspaceId: string): AdminBusinessRow => {
      let row = rows.get(workspaceId);
      if (!row) {
        row = {
          workspaceId,
          staff: { manager: 0, counselor: 0, billing_admin: 0 },
          pendingStaffInvites: 0,
          candidates: { invited: 0, active: 0, archived: 0 },
          pendingCandidateInvites: 0,
          expiredInvites: 0,
        };
        rows.set(workspaceId, row);
      }
      return row;
    };
    for (const r of staff.rows) {
      const row = get(r.workspace_id);
      row.staff[r.role] += r.active;
      row.pendingStaffInvites += r.pending;
      row.expiredInvites += r.expired;
    }
    for (const r of candidates.rows) {
      const row = get(r.workspace_id);
      row.candidates[r.status] += r.n;
      row.pendingCandidateInvites += r.pending;
      row.expiredInvites += r.expired;
    }
    await this.record(owner, 'business.overview', 'all');
    return { items: [...rows.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId)) };
  }

  /** Recruiting opt-ins for operators only (the candidate screen gets a count). Audited. */
  async recruitingOptIns(owner: Principal): Promise<{ count: number; items: Array<{ candidateAuthUserId: string; updatedAt: string }> }> {
    this.assertAdmin(owner);
    const rows = await this.pool.query<{ candidate_auth_user_id: string; updated_at: Date }>(
      `SELECT candidate_auth_user_id, updated_at FROM recruiting_opt_ins WHERE discoverable = true ORDER BY updated_at DESC LIMIT 500`,
    );
    await this.record(owner, 'recruiting.search', 'opt_ins');
    return {
      count: rows.rows.length,
      items: rows.rows.map((row) => ({ candidateAuthUserId: row.candidate_auth_user_id, updatedAt: row.updated_at.toISOString() })),
    };
  }

  private async evidenceView(evidenceId: string): Promise<AdminEvidenceView> {
    if (!UUID.test(evidenceId)) throw new BillingError('not_found');
    const rows = await this.pool.query<{ id: string; title: string; evidence_type: string; evidence_label: 'self_reported'; attachment_url: string | null; attachment_object_key: string | null }>(
      `SELECT id, title, evidence_type, evidence_label, attachment_url, attachment_object_key FROM career_evidence WHERE id = $1`,
      [evidenceId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    const today = this.clock.now().toISOString().slice(0, 10);
    const checks = (await verificationsFor(this.pool, [row.id], today)).get(row.id) ?? [];
    return { id: row.id, title: row.title, evidenceType: row.evidence_type, evidenceLabel: shownLabel(row, checks, today), verifications: checks };
  }

  private assertAdmin(owner: Principal): void {
    if (!this.admins.has(owner.authUserId)) throw new BillingError('permission_denied');
  }

  private async flagList(): Promise<AdminFlag[]> {
    const snapshot = await this.catalogs.get(this.pool, CATALOG_VERSION);
    const stored = await this.pool.query<{ feature: string; enabled: boolean }>(`SELECT feature, enabled FROM feature_flags`);
    const chosen = new Map(stored.rows.map((row) => [row.feature, row.enabled]));
    return Object.keys(snapshot.featurePhase).map((feature) => {
      const flag = chosen.get(feature);
      if (flag === undefined) return { feature, enabled: snapshot.featurePhase[feature] === 1, source: 'phase' as const };
      return { feature, enabled: flag, source: 'flag' as const };
    });
  }

  private async record(owner: Principal, action: string, target: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_audit (actor_auth_user_id, action, target) VALUES ($1, $2, $3)`,
      [owner.authUserId, action, target],
    );
  }
}

function requiredText(value: unknown, max: number, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > max) throw new BillingError('validation_error', { field, reason: 'invalid' });
  return text;
}
