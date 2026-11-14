import { createHash } from 'crypto';
import type { Pool } from 'pg';
import {
  MIN_LISTING_TEXT,
  UNSTATED_ORGANIZATION,
  computeTrustSignals,
  extractListingFields,
  statedOrganization,
  dedupeKey,
  listingLabel,
  localRadiusMiles,
  type ModerationStatus,
  type TrustSignalSummary,
} from '@flacroncv/career-shared';
import type { ListingCompensation, PlanId } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { WindowRateLimit } from '../http/rate-limit';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { NormalizedListing } from './normalize';
import { readViewerReport } from './opportunity-trust.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OpportunityItem {
  id: string;
  category: string;
  provider: string;
  title: string;
  organization: string | null;
  status: 'open' | 'closed';
  label: 'open' | 'expired';
  sourceUrl: string | null;
  checkedAt: string;
  deadline: string | null;
  locations: string[];
  compensation: ListingCompensation;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  moderationStatus: ModerationStatus;
}

export interface OpportunityDetail extends OpportunityItem {
  description: string;
  resumeAnalysis: {
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string | null;
  };
  trustSignals?: TrustSignalSummary;
}

export interface IngestCounts {
  inserted: number;
  revised: number;
  deduped: number;
  unchanged: number;
}

interface RevisionRow {
  id: string;
  opportunity_id: string;
  title: string;
  organization: string;
  description: string;
  locations: unknown;
  compensation: unknown;
  eligibility: unknown;
  deadline: string | null;
  source_url: string | null;
  checked_at: Date;
  status: string;
  category: string;
  provider: string;
  candidate_auth_user_id: string | null;
  moderation_status?: string;
}

/**
 * Shared listings from recorded feeds, plus a person's pasted vacancy.
 * The same employer and title from two feeds is one opportunity and a
 * new revision when the words change. Missing pay and sponsorship stay
 * unknown. No feed is called from here.
 */
export class OpportunityService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly searchLimit = new WindowRateLimit(60, 60_000),
  ) {}

  async search(owner: ProfileOwner, query: { q?: string; category?: string; status?: string; radiusMiles?: number }): Promise<{ items: OpportunityItem[] }> {
    const gate = this.searchLimit.take(`opportunities:${owner.authUserId}`, this.clock.now());
    if (!gate.allowed) throw new BillingError('rate_limited', { limit: gate.limit, retryAt: gate.retryAt });
    const limit = await this.radiusLimit(owner);
    if (query.radiusMiles !== undefined && (!Number.isInteger(query.radiusMiles) || query.radiusMiles < 0)) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid' });
    }
    if (query.radiusMiles !== undefined && query.radiusMiles > limit) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'above_plan', limit });
    }
    const q = query.q?.trim() ?? '';
    const like = q.length > 0 ? `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const status = query.status === 'open' || query.status === 'closed' || query.status === 'expired' ? query.status : null;
    const today = this.today();
    const rows = await this.pool.query<RevisionRow>(
      `SELECT o.id AS opportunity_id, o.category, o.provider, o.status, o.candidate_auth_user_id,
              COALESCE(o.moderation_status, 'unflagged') AS moderation_status,
              r.id, r.title, r.organization, r.description, r.locations, r.compensation, r.eligibility,
              r.deadline, r.source_url, r.checked_at
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $1)
          AND (o.moderation_status IS NULL OR o.moderation_status <> 'suppressed')
          AND ($2::text IS NULL OR o.title ILIKE $2 ESCAPE '\\' OR o.organization ILIKE $2 ESCAPE '\\' OR r.description ILIKE $2 ESCAPE '\\')
          AND ($3::text IS NULL OR o.category = $3)
          AND (
            $4::text IS NULL
            OR ($4 = 'expired' AND (o.status = 'closed' OR (r.deadline IS NOT NULL AND r.deadline < $5)))
            OR ($4 = 'open' AND o.status = 'open' AND (r.deadline IS NULL OR r.deadline >= $5))
            OR ($4 = 'closed' AND o.status = 'closed')
          )
        ORDER BY r.checked_at DESC, o.id
        LIMIT 50`,
      [owner.authUserId, like, query.category?.trim() || null, status, today],
    );
    return { items: rows.rows.map((row) => this.item(row)) };
  }

  async get(owner: ProfileOwner, opportunityId: string): Promise<OpportunityDetail> {
    if (!UUID.test(opportunityId)) throw new BillingError('not_found');
    const rows = await this.pool.query<RevisionRow>(
      `SELECT o.id AS opportunity_id, o.category, o.provider, o.status, o.candidate_auth_user_id,
              COALESCE(o.moderation_status, 'unflagged') AS moderation_status,
              r.id, r.title, r.organization, r.description, r.locations, r.compensation, r.eligibility,
              r.deadline, r.source_url, r.checked_at
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

    const sourcesRes = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunity_sources WHERE opportunity_id = $1`,
      [opportunityId],
    );
    const sourcesCount = parseInt(sourcesRes.rows[0]?.count ?? '1', 10);

    const reportsRes = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opportunity_reports WHERE opportunity_id = $1 AND status = 'pending'`,
      [opportunityId],
    );
    const reportCount = parseInt(reportsRes.rows[0]?.count ?? '0', 10);
    const viewerReport = await readViewerReport(this.pool, opportunityId, owner.authUserId);

    const comp = row.compensation as { minimum?: number | null; maximum?: number | null } | null;
    const trustSignals = computeTrustSignals({
      moderationStatus: (row.moderation_status as ModerationStatus) ?? 'unflagged',
      checkedAtIso: row.checked_at.toISOString(),
      nowMs: this.clock.now().getTime(),
      sourcesCount,
      reportCount,
      provider: row.provider,
      description: row.description,
      compensation: comp ? { minimum: comp.minimum ?? null, maximum: comp.maximum ?? null } : undefined,
      viewerReport,
    });

    return {
      ...this.item(row),
      description: row.description,
      resumeAnalysis: await this.analysisCredit(owner),
      trustSignals,
    };
  }

  async paste(owner: ProfileOwner, input: { text?: string; sourceUrl?: string | null }): Promise<OpportunityDetail> {
    const text = input.text?.trim() ?? '';
    if (text.length > 20000) throw new BillingError('validation_error', { field: 'text', reason: 'invalid' });
    // A title alone ("abc") is not a vacancy: nothing can be matched or written from it.
    if (text.length < MIN_LISTING_TEXT) {
      throw new BillingError('validation_error', { field: 'text', reason: 'too_short', minimum: MIN_LISTING_TEXT });
    }
    const sourceUrl = input.sourceUrl?.trim() || null;
    if (sourceUrl !== null && !sourceUrl.startsWith('https://') && !sourceUrl.startsWith('http://')) {
      throw new BillingError('validation_error', { field: 'sourceUrl', reason: 'invalid' });
    }
    // Fields the paste states plainly (employer, place, pay, sponsorship); the rest stays unknown.
    const extracted = extractListingFields(text);
    const title = (extracted.title.length > 0 ? extracted.title : text).slice(0, 300);
    const sourceId = `${owner.authUserId}:${createHash('sha256').update(text.replace(/\s+/g, ' ').toLowerCase()).digest('hex')}`.slice(0, 255);
    const saved = await this.ingestOne(owner.authUserId, {
      provider: 'paste',
      sourceId,
      title,
      organization: extracted.organization ?? UNSTATED_ORGANIZATION,
      description: text,
      locations: extracted.locations,
      sourceUrl: sourceUrl === null ? null : sourceUrl.slice(0, 2000),
      deadline: null,
      compensation: extracted.compensation,
      category: 'job',
      status: 'open',
      sponsorship: extracted.sponsorship,
    });
    return this.get(owner, saved.id);
  }

  /** Feeds pass null for the owner. A paste passes the person's id. */
  async ingest(candidateAuthUserId: string | null, listings: NormalizedListing[]): Promise<IngestCounts> {
    const counts: IngestCounts = { inserted: 0, revised: 0, deduped: 0, unchanged: 0 };
    for (const listing of listings) {
      const outcome = await this.ingestOne(candidateAuthUserId, listing);
      if (outcome.kind === 'inserted') counts.inserted += 1;
      else if (outcome.kind === 'revised') counts.revised += 1;
      else if (outcome.kind === 'deduped') counts.deduped += 1;
      else counts.unchanged += 1;
    }
    return counts;
  }

  private async ingestOne(
    candidateAuthUserId: string | null,
    listing: NormalizedListing,
  ): Promise<{ kind: 'inserted' | 'revised' | 'deduped' | 'unchanged'; id: string }> {
    const key = dedupeKey(listing);
    const owner = listing.provider === 'paste' ? candidateAuthUserId : null;
    return withTransaction(this.pool, async (db) => {
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [key]);
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${listing.provider}:${listing.sourceId}`]);
      const existing = await db.query<{ opportunity_id: string }>(
        `SELECT opportunity_id FROM opportunity_sources WHERE provider = $1 AND source_id = $2`,
        [listing.provider, listing.sourceId],
      );
      const bySource = existing.rows[0]?.opportunity_id;
      if (bySource) {
        const changed = await this.revise(db, bySource, listing);
        return { kind: changed ? 'revised' : 'unchanged', id: bySource };
      }
      const same = await db.query<{ id: string }>(`SELECT id FROM opportunities WHERE dedupe_key = $1`, [key]);
      const match = same.rows[0]?.id;
      if (match) {
        await db.query(
          `INSERT INTO opportunity_sources (opportunity_id, provider, source_id, source_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (provider, source_id) DO NOTHING`,
          [match, listing.provider, listing.sourceId, listing.sourceUrl],
        );
        await this.revise(db, match, listing);
        return { kind: 'deduped', id: match };
      }
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO opportunities (category, provider, source_id, title, organization, status, dedupe_key, candidate_auth_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [listing.category, listing.provider, listing.sourceId, listing.title, listing.organization, listing.status, key, owner],
      );
      const id = inserted.rows[0].id;
      await this.insertRevision(db, id, 1, listing);
      await db.query(
        `INSERT INTO opportunity_sources (opportunity_id, provider, source_id, source_url) VALUES ($1, $2, $3, $4)`,
        [id, listing.provider, listing.sourceId, listing.sourceUrl],
      );
      return { kind: 'inserted', id };
    });
  }

  /** True when a new revision was stored. */
  private async revise(db: Db, opportunityId: string, listing: NormalizedListing): Promise<boolean> {
    const current = await db.query<{
      revision: number;
      title: string;
      organization: string;
      description: string;
      locations: unknown;
      compensation: unknown;
      deadline: string | null;
      source_url: string | null;
      status: string;
    }>(
      `SELECT r.revision, r.title, r.organization, r.description, r.locations, r.compensation, r.deadline, r.source_url, r.status
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = current.rows[0];
    if (row && this.same(row, listing)) {
      await db.query(
        `UPDATE opportunity_revisions SET checked_at = $2
          WHERE id = (SELECT current_revision_id FROM opportunities WHERE id = $1)`,
        [opportunityId, this.clock.now()],
      );
      return false;
    }
    const next = (row?.revision ?? 0) + 1;
    await this.insertRevision(db, opportunityId, next, listing);
    const key = dedupeKey(listing);
    const taken = await db.query(`SELECT id FROM opportunities WHERE dedupe_key = $1 AND id <> $2`, [key, opportunityId]);
    const nextKey =
      taken.rows[0] && row
        ? dedupeKey({ provider: listing.provider, organization: row.organization, title: row.title, sourceId: listing.sourceId })
        : key;
    await db.query(
      `UPDATE opportunities
          SET title = $2, organization = $3, status = $4, dedupe_key = $5
        WHERE id = $1`,
      [opportunityId, listing.title, listing.organization, listing.status, nextKey],
    );
    return true;
  }

  private async insertRevision(db: Db, opportunityId: string, revision: number, listing: NormalizedListing): Promise<void> {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO opportunity_revisions
         (opportunity_id, revision, title, organization, locations, eligibility, compensation, deadline, source_url, checked_at, material, status, description)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, true, $11, $12)
       RETURNING id`,
      [
        opportunityId,
        revision,
        listing.title,
        listing.organization,
        JSON.stringify(listing.locations),
        JSON.stringify({ sponsorship: listing.sponsorship ?? 'unknown' }),
        JSON.stringify(listing.compensation),
        listing.deadline,
        listing.sourceUrl,
        this.clock.now(),
        listing.status,
        listing.description,
      ],
    );
    await db.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunityId, inserted.rows[0].id]);
  }

  private same(
    row: {
      title: string;
      organization: string;
      description: string;
      locations: unknown;
      compensation: unknown;
      deadline: string | null;
      source_url: string | null;
      status: string;
    },
    listing: NormalizedListing,
  ): boolean {
    const current = JSON.stringify({
      title: row.title,
      organization: row.organization,
      description: row.description,
      locations: strings(row.locations).slice().sort(),
      compensation: compensationOf(row.compensation),
      deadline: row.deadline,
      sourceUrl: row.source_url,
      status: row.status,
    });
    const next = JSON.stringify({
      title: listing.title,
      organization: listing.organization,
      description: listing.description,
      locations: listing.locations.slice().sort(),
      compensation: listing.compensation,
      deadline: listing.deadline,
      sourceUrl: listing.sourceUrl,
      status: listing.status,
    });
    return current === next;
  }

  private async analysisCredit(owner: ProfileOwner): Promise<OpportunityDetail['resumeAnalysis']> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'resume_analysis', this.clock.now());
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

  private async radiusLimit(owner: ProfileOwner): Promise<number> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    try {
      return localRadiusMiles(v2PlanOf(snapshot, account));
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return localRadiusMiles('professional' as PlanId);
    }
  }

  private item(row: RevisionRow): OpportunityItem {
    const status = row.status === 'closed' ? 'closed' : 'open';
    return {
      id: row.opportunity_id,
      category: row.category,
      provider: row.provider,
      title: row.title,
      organization: statedOrganization(row.organization),
      status,
      label: listingLabel(status, row.deadline, this.today()),
      sourceUrl: row.source_url,
      checkedAt: row.checked_at.toISOString(),
      deadline: row.deadline,
      locations: strings(row.locations),
      compensation: compensationOf(row.compensation),
      sponsorship: sponsorshipOf(row.eligibility),
      moderationStatus: (row.moderation_status as ModerationStatus) ?? 'unflagged',
    };
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function compensationOf(value: unknown): ListingCompensation {
  if (!isRecord(value)) return { minimum: null, maximum: null, currency: null, period: null };
  return {
    minimum: numberOrNull(value.minimum),
    maximum: numberOrNull(value.maximum),
    currency: typeof value.currency === 'string' ? value.currency : null,
    period: typeof value.period === 'string' ? value.period : null,
  };
}

function sponsorshipOf(value: unknown): 'unknown' | 'stated_yes' | 'stated_no' {
  if (!isRecord(value)) return 'unknown';
  if (value.sponsorship === 'stated_yes' || value.sponsorship === 'stated_no') return value.sponsorship;
  return 'unknown';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
