import { createHash } from 'crypto';
import type { Pool } from 'pg';
import {
  MIN_LISTING_TEXT,
  UNSTATED_ORGANIZATION,
  companyMatches,
  computeTrustSignals,
  dedupeKey,
  distanceMiles,
  extractListingFields,
  filterCategoryColumn,
  isFilterCategory,
  isListingArrangement,
  isListingSchedule,
  isListingSeniority,
  isOpportunityCategory,
  isStaleListing,
  listingDetailsOf,
  listingLabel,
  localRadiusMiles,
  parseStatedDate,
  placeMatchesLocations,
  statedOrganization,
  LISTING_DETAIL_FIELDS,
  type ListingArrangement,
  type ListingDetails,
  type ListingSchedule,
  type ListingSeniority,
  type MatchListing,
  type ModerationStatus,
  type OpportunityCategory,
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
import { UnconfiguredGeocoder } from '../maps/geocoder';
import type { Geocoder } from '../maps/geocoder';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { NormalizedListing } from './normalize';
import { readViewerReport } from './opportunity-trust.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Rows read before the filters that need code (followed companies, place, radius) are applied. */
const SEARCH_SCAN = 300;
const SEARCH_PAGE = 50;

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
  /** True when the last check is older than STALE_LISTING_DAYS. */
  stale: boolean;
  publishedAt: string | null;
  deadline: string | null;
  locations: string[];
  compensation: ListingCompensation;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  /** The listing's own words limiting where a remote worker may live; null when not stated. */
  remoteRestriction: string | null;
  schedule: ListingSchedule | null;
  arrangement: ListingArrangement | null;
  seniority: ListingSeniority | null;
  details: ListingDetails;
  moderationStatus: ModerationStatus;
  /** The viewer saved this listing. */
  saved: boolean;
}

export interface OpportunityDetail extends OpportunityItem {
  description: string;
  revisionId: string;
  resumeAnalysis: {
    includedRemaining: number;
    packRemaining: number;
    renewalDate: string | null;
  };
  trustSignals?: TrustSignalSummary;
}

/**
 * One listing as another service may use it, read through the owner check.
 * `organization` is the stored value (it may be the unstated marker); use
 * `statedOrganization` before showing or writing it.
 */
export interface ListingRecord {
  opportunityId: string;
  revisionId: string;
  category: string;
  provider: string;
  title: string;
  organization: string;
  description: string;
  sourceUrl: string | null;
  deadline: string | null;
  publishedAt: string | null;
  locations: string[];
  compensation: ListingCompensation;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  remoteRestriction: string | null;
  schedule: ListingSchedule | null;
  arrangement: ListingArrangement | null;
  seniority: ListingSeniority | null;
  details: ListingDetails;
  status: 'open' | 'closed';
  checkedAt: Date;
  /** Raw stored JSON, for callers that snapshot the revision as it is. */
  eligibility: unknown;
  /** Null for a shared feed listing; the pasting person's id for a private paste. */
  candidateAuthUserId: string | null;
  moderationStatus: ModerationStatus;
  /** Real coordinates from the source, or null. Never estimated. */
  latitude: number | null;
  longitude: number | null;
}

export interface OpportunitySearchQuery {
  q?: string;
  /** Title only ("role"). */
  role?: string;
  category?: string;
  status?: string;
  /** Default true (listings past their deadline are shown and labelled expired). */
  includeExpired?: boolean;
  payStated?: boolean;
  minPay?: number;
  payCurrency?: string;
  payPeriod?: string;
  schedule?: string;
  seniority?: string;
  /** Text place; with radiusMiles, a radius is applied where coordinates exist. */
  place?: string;
  radiusMiles?: number;
  /** `restricted`: a remote limit is stated. `unrestricted`: remote with no stated limit. */
  remote?: string;
  postedWithinDays?: number;
  deadlineBefore?: string;
  followedOnly?: boolean;
  provider?: string;
}

/** A filter the search could not apply, and why. A filter is never dropped silently. */
export interface NotAppliedFilter {
  filter: 'radiusMiles' | 'followedOnly';
  reason: 'no_place' | 'geocoding_unavailable' | 'no_followed_companies' | 'place_not_found';
}

export interface OpportunitySearchResult {
  items: OpportunityItem[];
  notApplied: NotAppliedFilter[];
}

export interface PasteInput {
  text?: string;
  sourceUrl?: string | null;
  /** The person's choice wins over what the text suggests. */
  category?: string;
  deadline?: string | null;
  publishedAt?: string | null;
  remoteRestriction?: string | null;
  details?: Partial<Record<keyof ListingDetails, string | null>>;
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
  published_at: string | null;
  remote_restriction: string | null;
  schedule: string | null;
  arrangement: string | null;
  seniority: string | null;
  details: unknown;
  latitude: number | null;
  longitude: number | null;
  saved?: boolean;
}

const REVISION_COLUMNS = `o.id AS opportunity_id, o.category, o.provider, o.status, o.candidate_auth_user_id,
              COALESCE(o.moderation_status, 'unflagged') AS moderation_status,
              r.id, r.title, r.organization, r.description, r.locations, r.compensation, r.eligibility,
              r.deadline, r.source_url, r.checked_at, r.published_at, r.remote_restriction, r.schedule,
              r.arrangement, r.seniority, r.details, r.latitude, r.longitude`;

/**
 * The single owner-checked way to read a listing for a person. A shared feed
 * listing is readable by everyone; a pasted listing only by the person who
 * pasted it. Anyone else gets `not_found`, exactly like a missing id, so the
 * existence of another person's paste never leaks. Every service that reads a
 * listing on a person's behalf (matching, action packs, writing, resumes,
 * applications, interviews) should load it through here.
 */
export async function readOpportunityForCandidate(db: Db, authUserId: string, opportunityId: string): Promise<ListingRecord> {
  if (!UUID.test(opportunityId)) throw new BillingError('not_found', { opportunityId });
  const rows = await db.query<RevisionRow>(
    `SELECT ${REVISION_COLUMNS}
       FROM opportunities o
       JOIN opportunity_revisions r ON r.id = o.current_revision_id
      WHERE o.id = $1
        AND (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $2)`,
    [opportunityId, authUserId],
  );
  const row = rows.rows[0];
  if (!row) throw new BillingError('not_found', { opportunityId });
  return recordOf(row);
}

/**
 * Open, unexpired, unsuppressed listings a person can see, most recently
 * checked first. Scheduled alert matching reads through this so it applies
 * the same owner rule as every other read.
 */
export async function recentOpenListingsForCandidate(db: Db, authUserId: string, today: string, limit: number): Promise<ListingRecord[]> {
  const rows = await db.query<RevisionRow>(
    `SELECT ${REVISION_COLUMNS}
       FROM opportunities o
       JOIN opportunity_revisions r ON r.id = o.current_revision_id
      WHERE (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $1)
        AND (o.moderation_status IS NULL OR o.moderation_status <> 'suppressed')
        AND o.status = 'open'
        AND (r.deadline IS NULL OR r.deadline >= $2)
      ORDER BY r.checked_at DESC, o.id
      LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`,
    [authUserId, today],
  );
  return rows.rows.map(recordOf);
}

/**
 * Shared listings from recorded feeds, plus a person's pasted vacancy.
 * The same employer, title and place from two feeds is one opportunity and a
 * new revision when a stated fact changes. Missing pay and sponsorship stay
 * unknown. No feed is called from here.
 */
export class OpportunityService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = { now: () => new Date() },
    private readonly searchLimit = new WindowRateLimit(60, 60_000),
    private readonly geocoder: Geocoder = new UnconfiguredGeocoder(),
  ) {}

  /** Owner-checked loader; see `readOpportunityForCandidate`. */
  async readForCandidate(owner: Pick<ProfileOwner, 'authUserId'>, opportunityId: string): Promise<ListingRecord> {
    return readOpportunityForCandidate(this.pool, owner.authUserId, opportunityId);
  }

  async search(owner: ProfileOwner, query: OpportunitySearchQuery): Promise<OpportunitySearchResult> {
    const gate = this.searchLimit.take(`opportunities:${owner.authUserId}`, this.clock.now());
    if (!gate.allowed) throw new BillingError('rate_limited', { limit: gate.limit, retryAt: gate.retryAt });
    const limit = await this.radiusLimit(owner);
    if (query.radiusMiles !== undefined && (!Number.isInteger(query.radiusMiles) || query.radiusMiles < 0)) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid' });
    }
    if (query.radiusMiles !== undefined && query.radiusMiles > limit) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'above_plan', limit });
    }
    const filters = this.validFilters(query);
    const today = this.today();
    const posted = filters.postedWithinDays === null ? null : addDays(today, -filters.postedWithinDays);
    const rows = await this.pool.query<RevisionRow>(
      `SELECT ${REVISION_COLUMNS},
              EXISTS (SELECT 1 FROM saved_opportunities s WHERE s.opportunity_id = o.id AND s.candidate_auth_user_id = $1) AS saved
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
          AND ($6::text IS NULL OR o.title ILIKE $6 ESCAPE '\\')
          AND ($7::text IS NULL OR r.schedule = $7)
          AND ($8::text IS NULL OR r.arrangement = $8)
          AND ($9::text IS NULL OR r.seniority = $9)
          AND ($10::boolean IS NOT TRUE OR (r.compensation->>'minimum' IS NOT NULL OR r.compensation->>'maximum' IS NOT NULL))
          AND ($11::numeric IS NULL OR COALESCE((r.compensation->>'maximum')::numeric, (r.compensation->>'minimum')::numeric) >= $11)
          AND ($12::text IS NULL OR r.compensation->>'currency' = $12)
          AND ($13::text IS NULL OR r.compensation->>'period' = $13)
          AND (
            $14::text IS NULL
            OR ($14 = 'restricted' AND r.remote_restriction IS NOT NULL)
            OR ($14 = 'unrestricted' AND r.arrangement = 'remote' AND r.remote_restriction IS NULL)
          )
          AND ($15::text IS NULL OR r.published_at >= $15)
          AND ($16::text IS NULL OR (r.deadline IS NOT NULL AND r.deadline <= $16))
          AND ($17::text IS NULL OR o.provider = $17)
          AND ($18::boolean IS NOT FALSE OR (o.status = 'open' AND (r.deadline IS NULL OR r.deadline >= $5)))
        ORDER BY r.checked_at DESC, o.id
        LIMIT ${SEARCH_SCAN}`,
      [
        owner.authUserId,
        likePattern(filters.q),
        filters.category?.column === 'category' ? filters.category.value : null,
        filters.status,
        today,
        likePattern(filters.role),
        filters.category?.column === 'schedule' ? filters.category.value : filters.schedule,
        filters.category?.column === 'arrangement' ? filters.category.value : null,
        filters.seniority,
        filters.payStated,
        filters.minPay,
        filters.payCurrency,
        filters.payPeriod,
        filters.remote,
        posted,
        filters.deadlineBefore,
        filters.provider,
        filters.includeExpired,
      ],
    );
    const notApplied: NotAppliedFilter[] = [];
    let candidates = rows.rows;

    if (filters.followedOnly) {
      const names = await this.followedNames(owner);
      if (names.length === 0) {
        notApplied.push({ filter: 'followedOnly', reason: 'no_followed_companies' });
      } else {
        candidates = candidates.filter((row) => companyMatches(row.organization, names) !== null);
      }
    }

    if (filters.place !== null) {
      const place = filters.place;
      const center = query.radiusMiles !== undefined ? await this.center(place, notApplied) : null;
      candidates = candidates.filter((row) => {
        // A radius is applied only where both sides have real coordinates; the text match always counts.
        if (center && row.latitude !== null && row.longitude !== null) {
          return distanceMiles(center, { latitude: row.latitude, longitude: row.longitude }) <= (query.radiusMiles ?? 0);
        }
        return placeMatchesLocations(place, strings(row.locations));
      });
    } else if (query.radiusMiles !== undefined) {
      notApplied.push({ filter: 'radiusMiles', reason: 'no_place' });
    }

    return { items: candidates.slice(0, SEARCH_PAGE).map((row) => this.item(row)), notApplied };
  }

  async get(owner: ProfileOwner, opportunityId: string): Promise<OpportunityDetail> {
    const record = await this.readForCandidate(owner, opportunityId);
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
    const saved = await this.isSaved(owner, opportunityId);

    const trustSignals = computeTrustSignals({
      moderationStatus: record.moderationStatus,
      checkedAtIso: record.checkedAt.toISOString(),
      nowMs: this.clock.now().getTime(),
      sourcesCount,
      reportCount,
      provider: record.provider,
      description: record.description,
      compensation: { minimum: record.compensation.minimum, maximum: record.compensation.maximum },
      viewerReport,
    });

    return {
      ...this.itemOf(record, saved),
      description: record.description,
      revisionId: record.revisionId,
      resumeAnalysis: await this.analysisCredit(owner),
      trustSignals,
    };
  }

  async paste(owner: ProfileOwner, input: PasteInput): Promise<OpportunityDetail> {
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
    if (input.category !== undefined && input.category !== '' && !isOpportunityCategory(input.category)) {
      throw new BillingError('validation_error', { field: 'category', reason: 'invalid' });
    }
    const deadline = optionalDay(input.deadline, 'deadline');
    const publishedAt = optionalDay(input.publishedAt, 'publishedAt');
    // Fields the paste states plainly; the rest stays unknown. What the person typed wins.
    const extracted = extractListingFields(text);
    const details: ListingDetails = { ...extracted.details };
    for (const field of LISTING_DETAIL_FIELDS) {
      const typed = input.details?.[field];
      if (typed === undefined) continue;
      const clean = typeof typed === 'string' ? typed.trim().slice(0, 300) : '';
      details[field] = clean.length > 0 ? (field === 'eventDate' ? parseStatedDate(clean) : clean) : null;
    }
    const remoteRestriction =
      input.remoteRestriction !== undefined ? (input.remoteRestriction?.trim().slice(0, 300) || null) : extracted.remoteRestriction;
    const title = (extracted.title.length > 0 ? extracted.title : text).slice(0, 300);
    const category: OpportunityCategory = isOpportunityCategory(input.category) ? input.category : (extracted.category ?? 'job');
    // The id covers the person's own choices too, so re-pasting with a different category is a new revision of the same paste.
    const sourceId = `${owner.authUserId}:${createHash('sha256').update(text.replace(/\s+/g, ' ').toLowerCase()).digest('hex')}`.slice(0, 255);
    const saved = await this.ingestOne(owner.authUserId, {
      provider: 'paste',
      sourceId,
      title,
      organization: extracted.organization ?? UNSTATED_ORGANIZATION,
      description: text,
      locations: extracted.locations,
      sourceUrl: sourceUrl === null ? null : sourceUrl.slice(0, 2000),
      deadline: deadline !== undefined ? deadline : extracted.deadline,
      compensation: extracted.compensation,
      category,
      status: 'open',
      sponsorship: extracted.sponsorship,
      publishedAt: publishedAt !== undefined ? publishedAt : extracted.publishedAt,
      remoteRestriction,
      schedule: extracted.schedule,
      arrangement: extracted.arrangement,
      seniority: extracted.seniority,
      details,
    });
    return this.get(owner, saved.id);
  }

  /** Bookmark a listing the person can see. Free of quota; saving twice is one save. */
  async save(owner: ProfileOwner, opportunityId: string): Promise<{ opportunityId: string; saved: true }> {
    await this.readForCandidate(owner, opportunityId);
    await this.pool.query(
      `INSERT INTO saved_opportunities (workspace_id, candidate_auth_user_id, opportunity_id)
       VALUES ($1, $2, $3) ON CONFLICT (candidate_auth_user_id, opportunity_id) DO NOTHING`,
      [owner.workspaceId, owner.authUserId, opportunityId],
    );
    return { opportunityId, saved: true };
  }

  async unsave(owner: ProfileOwner, opportunityId: string): Promise<{ opportunityId: string; saved: false }> {
    if (!UUID.test(opportunityId)) throw new BillingError('not_found');
    await this.pool.query(`DELETE FROM saved_opportunities WHERE candidate_auth_user_id = $1 AND opportunity_id = $2`, [
      owner.authUserId,
      opportunityId,
    ]);
    return { opportunityId, saved: false };
  }

  /** Saved listings, nearest real deadline first, then most recently saved. */
  async saved(owner: ProfileOwner): Promise<{ items: OpportunityItem[] }> {
    const rows = await this.pool.query<RevisionRow>(
      `SELECT ${REVISION_COLUMNS}, true AS saved
         FROM saved_opportunities s
         JOIN opportunities o ON o.id = s.opportunity_id
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE s.candidate_auth_user_id = $1 AND s.workspace_id = $2
          AND (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $1)
        ORDER BY r.deadline ASC NULLS LAST, s.created_at DESC
        LIMIT 100`,
      [owner.authUserId, owner.workspaceId],
    );
    return { items: rows.rows.map((row) => this.item(row)) };
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
    const current = await db.query<RevisionRow & { revision: number }>(
      `SELECT r.revision, ${REVISION_COLUMNS}
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = current.rows[0];
    if (row && materialFingerprint(recordOf(row)) === materialFingerprint(listingAsRecord(listing))) {
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
        ? dedupeKey({
            provider: listing.provider,
            organization: row.organization,
            title: row.title,
            sourceId: listing.sourceId,
            locations: strings(row.locations),
          })
        : key;
    await db.query(
      `UPDATE opportunities
          SET title = $2, organization = $3, status = $4, dedupe_key = $5, category = $6
        WHERE id = $1`,
      [opportunityId, listing.title, listing.organization, listing.status, nextKey, listing.category],
    );
    return true;
  }

  private async insertRevision(db: Db, opportunityId: string, revision: number, listing: NormalizedListing): Promise<void> {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO opportunity_revisions
         (opportunity_id, revision, title, organization, locations, eligibility, compensation, deadline, source_url, checked_at,
          material, status, description, published_at, remote_restriction, schedule, arrangement, seniority, details, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, true, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20)
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
        dayOrNull(listing.publishedAt),
        listing.remoteRestriction?.slice(0, 300) ?? null,
        listing.schedule ?? null,
        listing.arrangement ?? null,
        listing.seniority ?? null,
        JSON.stringify(compactDetails(listing.details)),
        listing.latitude ?? null,
        listing.longitude ?? null,
      ],
    );
    await db.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [opportunityId, inserted.rows[0].id]);
  }

  private validFilters(query: OpportunitySearchQuery) {
    const text = (value: string | undefined, max = 200) => {
      const clean = value?.trim() ?? '';
      return clean.length > 0 ? clean.slice(0, max) : null;
    };
    const category = text(query.category, 64);
    if (category !== null && !isFilterCategory(category)) {
      throw new BillingError('validation_error', { field: 'category', reason: 'invalid' });
    }
    const schedule = text(query.schedule, 32);
    if (schedule !== null && !isListingSchedule(schedule)) throw new BillingError('validation_error', { field: 'schedule', reason: 'invalid' });
    const seniority = text(query.seniority, 32);
    if (seniority !== null && !isListingSeniority(seniority)) throw new BillingError('validation_error', { field: 'seniority', reason: 'invalid' });
    const remote = text(query.remote, 32);
    if (remote !== null && remote !== 'restricted' && remote !== 'unrestricted') {
      throw new BillingError('validation_error', { field: 'remote', reason: 'invalid' });
    }
    if (query.minPay !== undefined && (!Number.isFinite(query.minPay) || query.minPay < 0)) {
      throw new BillingError('validation_error', { field: 'minPay', reason: 'invalid' });
    }
    if (query.postedWithinDays !== undefined && (!Number.isInteger(query.postedWithinDays) || query.postedWithinDays < 0 || query.postedWithinDays > 3650)) {
      throw new BillingError('validation_error', { field: 'postedWithinDays', reason: 'invalid' });
    }
    const deadlineBefore = text(query.deadlineBefore, 10);
    if (deadlineBefore !== null && !DAY.test(deadlineBefore)) throw new BillingError('validation_error', { field: 'deadlineBefore', reason: 'invalid' });
    const status = query.status === 'open' || query.status === 'closed' || query.status === 'expired' ? query.status : null;
    const payCurrency = text(query.payCurrency, 3)?.toUpperCase() ?? null;
    const payPeriod = text(query.payPeriod, 16);
    return {
      q: text(query.q),
      role: text(query.role),
      category: category !== null && isFilterCategory(category) ? { column: filterCategoryColumn(category), value: category } : null,
      status,
      includeExpired: query.includeExpired ?? true,
      payStated: query.payStated === true,
      minPay: query.minPay ?? null,
      payCurrency,
      payPeriod,
      schedule,
      seniority,
      place: text(query.place),
      remote,
      postedWithinDays: query.postedWithinDays ?? null,
      deadlineBefore,
      followedOnly: query.followedOnly === true,
      provider: text(query.provider, 64),
    };
  }

  private async followedNames(owner: ProfileOwner): Promise<string[]> {
    const rows = await this.pool.query<{ name: string; aliases: string[] | null }>(
      `SELECT name, aliases FROM followed_companies WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    return rows.rows.flatMap((row) => [row.name, ...(row.aliases ?? [])]);
  }

  /** Coordinates for a radius search, or null with the reason recorded. Never invents a point. */
  private async center(place: string, notApplied: NotAppliedFilter[]): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const hit = await this.geocoder.lookup(place);
      if (!hit) {
        notApplied.push({ filter: 'radiusMiles', reason: 'place_not_found' });
        return null;
      }
      return { latitude: hit.latitude, longitude: hit.longitude };
    } catch (error) {
      if (!isBillingError(error, 'provider_unavailable')) throw error;
      notApplied.push({ filter: 'radiusMiles', reason: 'geocoding_unavailable' });
      return null;
    }
  }

  private async isSaved(owner: ProfileOwner, opportunityId: string): Promise<boolean> {
    const rows = await this.pool.query(
      `SELECT 1 FROM saved_opportunities WHERE candidate_auth_user_id = $1 AND opportunity_id = $2`,
      [owner.authUserId, opportunityId],
    );
    return rows.rows.length > 0;
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
    return this.itemOf(recordOf(row), row.saved === true);
  }

  private itemOf(record: ListingRecord, saved: boolean): OpportunityItem {
    return {
      id: record.opportunityId,
      category: record.category,
      provider: record.provider,
      title: record.title,
      organization: statedOrganization(record.organization),
      status: record.status,
      label: listingLabel(record.status, record.deadline, this.today()),
      sourceUrl: record.sourceUrl,
      checkedAt: record.checkedAt.toISOString(),
      stale: isStaleListing(record.checkedAt.toISOString(), this.clock.now().getTime()),
      publishedAt: record.publishedAt,
      deadline: record.deadline,
      locations: record.locations,
      compensation: record.compensation,
      sponsorship: record.sponsorship,
      remoteRestriction: record.remoteRestriction,
      schedule: record.schedule,
      arrangement: record.arrangement,
      seniority: record.seniority,
      details: record.details,
      moderationStatus: record.moderationStatus,
      saved,
    };
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

/** The listing facts the matcher compares, from one owner-checked record. */
export function matchListingOf(record: ListingRecord): MatchListing {
  return {
    status: record.status,
    deadline: record.deadline,
    title: record.title,
    description: record.description,
    locations: record.locations,
    payKnown: record.compensation.minimum !== null || record.compensation.maximum !== null,
    sponsorship: record.sponsorship,
    category: record.category,
    arrangement: record.arrangement,
    schedule: record.schedule,
    seniority: record.seniority,
    remoteRestriction: record.remoteRestriction,
    compensation: record.compensation,
  };
}

function recordOf(row: RevisionRow): ListingRecord {
  return {
    opportunityId: row.opportunity_id,
    revisionId: row.id,
    category: row.category,
    provider: row.provider,
    title: row.title,
    organization: row.organization,
    description: row.description,
    sourceUrl: row.source_url,
    deadline: row.deadline,
    publishedAt: row.published_at ?? null,
    locations: strings(row.locations),
    compensation: compensationOf(row.compensation),
    sponsorship: sponsorshipOf(row.eligibility),
    remoteRestriction: row.remote_restriction ?? null,
    schedule: isListingSchedule(row.schedule) ? row.schedule : null,
    arrangement: isListingArrangement(row.arrangement) ? row.arrangement : null,
    seniority: isListingSeniority(row.seniority) ? row.seniority : null,
    details: listingDetailsOf(row.details),
    status: row.status === 'closed' ? 'closed' : 'open',
    checkedAt: row.checked_at,
    eligibility: row.eligibility,
    candidateAuthUserId: row.candidate_auth_user_id,
    moderationStatus: (row.moderation_status as ModerationStatus | undefined) ?? 'unflagged',
    latitude: typeof row.latitude === 'number' ? row.latitude : null,
    longitude: typeof row.longitude === 'number' ? row.longitude : null,
  };
}

function listingAsRecord(listing: NormalizedListing): ListingRecord {
  return {
    opportunityId: '',
    revisionId: '',
    category: listing.category,
    provider: listing.provider,
    title: listing.title,
    organization: listing.organization,
    description: listing.description,
    sourceUrl: listing.sourceUrl,
    deadline: listing.deadline,
    publishedAt: dayOrNull(listing.publishedAt),
    locations: listing.locations,
    compensation: compensationOf(listing.compensation),
    sponsorship: listing.sponsorship ?? 'unknown',
    remoteRestriction: listing.remoteRestriction?.slice(0, 300) ?? null,
    schedule: listing.schedule ?? null,
    arrangement: listing.arrangement ?? null,
    seniority: listing.seniority ?? null,
    details: listingDetailsOf(compactDetails(listing.details)),
    status: listing.status,
    checkedAt: new Date(0),
    eligibility: null,
    candidateAuthUserId: null,
    moderationStatus: 'unflagged',
    latitude: null,
    longitude: null,
  };
}

/**
 * Everything a person relies on. A change to any of these is a material
 * revision (a labelled update in the alert centre); a re-check with the same
 * facts only moves `checked_at`. Sponsorship is included: a listing that
 * stops offering sponsorship has changed in a way that matters.
 */
function materialFingerprint(record: ListingRecord): string {
  return JSON.stringify({
    title: record.title,
    organization: record.organization,
    description: record.description,
    locations: record.locations.slice().sort(),
    compensation: record.compensation,
    deadline: record.deadline,
    sourceUrl: record.sourceUrl,
    status: record.status,
    sponsorship: record.sponsorship,
    remoteRestriction: record.remoteRestriction,
    schedule: record.schedule,
    arrangement: record.arrangement,
    seniority: record.seniority,
    category: record.category,
    details: record.details,
  });
}

/** Only stated detail fields are stored. */
function compactDetails(details: ListingDetails | undefined): Partial<ListingDetails> {
  const out: Partial<ListingDetails> = {};
  if (!details) return out;
  for (const field of LISTING_DETAIL_FIELDS) {
    const value = details[field];
    if (typeof value === 'string' && value.trim().length > 0) out[field] = value.trim().slice(0, 300);
  }
  return out;
}

function likePattern(value: string | null): string | null {
  return value === null ? null : `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function optionalDay(value: string | null | undefined, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  if (!DAY.test(value.trim()) || dayOrNull(value.trim()) === null) throw new BillingError('validation_error', { field, reason: 'invalid' });
  return value.trim();
}

function dayOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
