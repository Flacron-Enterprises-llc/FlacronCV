import type { Pool } from 'pg';
import {
  ALLOWANCES,
  UNSTATED_ORGANIZATION,
  channelAllowed,
  channelMinimumPlan,
  digestAllowed,
  digestPeriodStart,
  explainMatch,
  inQuietHours,
  localRadiusMiles,
  quietWindow,
  scheduleDue,
  scheduleWithinPlan,
} from '@flacroncv/career-shared';
import type { AlertChannel, AlertReasonCode, DigestChoice, MatchFit, MatchingSchedule, PlanId } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { checkCapacity, requireFeature } from '../metering/access';
import { MeteringService } from '../metering/metering.service';
import { livePersonCondition, personKey } from '../privacy/live-person';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEDULES = ['weekly', 'daily', 'every_6_hours', 'hourly'] as const;
const DIGESTS = ['weekly', 'daily', 'immediate'] as const;

/** One run looks at this many recently checked listings. A later run sees the rest. */
const LISTING_LIMIT = 50;

export interface ChannelDelivery {
  channel: AlertChannel;
  recipientAuthUserId: string;
  alertItemId: string;
  title: string;
}

/** Records a delivery. It does not call a network. */
export interface AlertNotifier {
  deliver(item: ChannelDelivery): Promise<void>;
}

export class RecordingAlertNotifier implements AlertNotifier {
  readonly delivered: ChannelDelivery[] = [];

  async deliver(item: ChannelDelivery): Promise<void> {
    this.delivered.push(item);
  }
}

export interface SavedSearchView {
  id: string;
  q: string | null;
  category: string | null;
  locationProfileId: string | null;
  radiusMiles: number | null;
  schedule: MatchingSchedule;
  paused: boolean;
}

export interface LocationProfileView {
  id: string;
  place: string;
  radiusMiles: number;
}

export interface FollowedCompanyView {
  id: string;
  name: string;
  sourceUrl: string | null;
}

export interface AlertSettingsView {
  email: boolean;
  push: boolean;
  telegram: boolean;
  digest: DigestChoice;
  quietStart: string | null;
  quietEnd: string | null;
  paused: boolean;
}

export interface AlertItemView {
  id: string;
  opportunityId: string;
  title: string;
  organization: string | null;
  revisionId: string;
  reason: { code: AlertReasonCode; fit: MatchFit | null };
  createdAt: string;
}

export interface AlertListView {
  items: AlertItemView[];
  alertItem: { includedRemaining: number; packRemaining: number; renewalDate: string | null };
  settings: AlertSettingsView;
}

interface Person {
  authUserId: string;
  workspaceId: string;
  billingAccountId: string;
}

interface SettingsRow {
  email: boolean;
  push: boolean;
  telegram: boolean;
  digest: string;
  quiet_start: string | null;
  quiet_end: string | null;
  paused: boolean;
  last_matched_at: Date | null;
  last_digest_at: Date | null;
}

interface ListingRow {
  opportunity_id: string;
  revision_id: string;
  title: string;
  organization: string;
  description: string;
  locations: unknown;
  compensation: unknown;
  eligibility: unknown;
  deadline: string | null;
  status: string;
  category: string;
}

interface SearchRow {
  id: string;
  filters: unknown;
  paused: boolean;
}

/**
 * Saved searches and the alert center. The scheduled pass writes a match
 * without spending `resume_analysis`, then reserves one `alert_item` per
 * new listing revision. Email, push, Telegram, and the digest do not reserve.
 */
export class AlertService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly notifier: AlertNotifier = new RecordingAlertNotifier(),
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async searches(owner: ProfileOwner): Promise<{ items: SavedSearchView[] }> {
    const rows = await this.pool.query<SearchRecord>(
      `SELECT id, filters, location_profile_id, radius_miles, schedule, paused
         FROM saved_searches
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => this.searchView(row)) };
  }

  async createSearch(
    owner: ProfileOwner,
    input: { q?: string; category?: string; locationProfileId?: string; radiusMiles?: number; schedule?: string },
  ): Promise<SavedSearchView> {
    const q = input.q?.trim() ?? '';
    const category = input.category?.trim() ?? '';
    if (q.length === 0 && category.length === 0) {
      throw new BillingError('validation_error', { field: 'q', reason: 'required' });
    }
    const ctx = await this.context(owner);
    const schedule = this.assertSchedule(ctx.planId, input.schedule);
    await requireFeature(this.pool, ctx.snapshot, 'savedSearches');
    const used = await this.count('saved_searches', owner);
    checkCapacity(ctx.snapshot, ctx.account, 'savedSearches', used);
    if (input.radiusMiles !== undefined) this.assertRadius(ctx.planId, input.radiusMiles);
    if (input.locationProfileId !== undefined) await this.ownedLocation(owner, input.locationProfileId);
    const inserted = await this.pool.query<SearchRecord>(
      `INSERT INTO saved_searches
         (workspace_id, candidate_auth_user_id, filters, location_profile_id, radius_miles, schedule)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, filters, location_profile_id, radius_miles, schedule, paused`,
      [
        owner.workspaceId,
        owner.authUserId,
        JSON.stringify({ q: q.length > 0 ? q : null, category: category.length > 0 ? category : null }),
        input.locationProfileId ?? null,
        input.radiusMiles ?? null,
        schedule,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return this.searchView(row);
  }

  async updateSearch(owner: ProfileOwner, searchId: string, input: { q?: string; paused?: boolean; schedule?: string }): Promise<SavedSearchView> {
    const current = await this.ownedSearch(owner, searchId);
    const ctx = await this.context(owner);
    const filters = isRecord(current.filters) ? { ...current.filters } : {};
    if (input.q !== undefined) {
      const q = input.q.trim();
      if (q.length === 0) throw new BillingError('validation_error', { field: 'q', reason: 'required' });
      filters.q = q;
    }
    const schedule = input.schedule !== undefined ? this.assertSchedule(ctx.planId, input.schedule) : current.schedule;
    const paused = input.paused ?? current.paused;
    const updated = await this.pool.query<SearchRecord>(
      `UPDATE saved_searches SET filters = $2, schedule = $3, paused = $4
        WHERE id = $1
        RETURNING id, filters, location_profile_id, radius_miles, schedule, paused`,
      [searchId, JSON.stringify(filters), schedule, paused],
    );
    const row = updated.rows[0];
    if (!row) throw new BillingError('not_found');
    return this.searchView(row);
  }

  async deleteSearch(owner: ProfileOwner, searchId: string): Promise<{ ok: true }> {
    await this.ownedSearch(owner, searchId);
    await this.pool.query(`DELETE FROM saved_searches WHERE id = $1`, [searchId]);
    return { ok: true };
  }

  async locations(owner: ProfileOwner): Promise<{ items: LocationProfileView[] }> {
    const rows = await this.pool.query<LocationProfileView & { radius_miles: number }>(
      `SELECT id, place, radius_miles FROM location_profiles
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => ({ id: row.id, place: row.place, radiusMiles: row.radius_miles })) };
  }

  async createLocation(owner: ProfileOwner, input: { place?: string; radiusMiles?: number }): Promise<LocationProfileView> {
    const place = input.place?.trim() ?? '';
    if (place.length === 0) throw new BillingError('validation_error', { field: 'place', reason: 'required' });
    if (input.radiusMiles === undefined) throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'required' });
    const ctx = await this.context(owner);
    await requireFeature(this.pool, ctx.snapshot, 'locationProfiles');
    checkCapacity(ctx.snapshot, ctx.account, 'locationProfiles', await this.count('location_profiles', owner));
    this.assertRadius(ctx.planId, input.radiusMiles);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO location_profiles (workspace_id, candidate_auth_user_id, place, radius_miles)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner.workspaceId, owner.authUserId, place, input.radiusMiles],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return { id: row.id, place, radiusMiles: input.radiusMiles };
  }

  async updateLocation(owner: ProfileOwner, profileId: string, input: { place?: string; radiusMiles?: number }): Promise<LocationProfileView> {
    const current = await this.ownedLocation(owner, profileId);
    const ctx = await this.context(owner);
    const place = input.place !== undefined ? input.place.trim() : current.place;
    if (place.length === 0) throw new BillingError('validation_error', { field: 'place', reason: 'required' });
    const radiusMiles = input.radiusMiles ?? current.radius_miles;
    this.assertRadius(ctx.planId, radiusMiles);
    await this.pool.query(`UPDATE location_profiles SET place = $2, radius_miles = $3 WHERE id = $1`, [profileId, place, radiusMiles]);
    return { id: profileId, place, radiusMiles };
  }

  async deleteLocation(owner: ProfileOwner, profileId: string): Promise<{ ok: true }> {
    await this.ownedLocation(owner, profileId);
    await this.pool.query(`UPDATE saved_searches SET location_profile_id = NULL WHERE location_profile_id = $1`, [profileId]);
    await this.pool.query(`DELETE FROM location_profiles WHERE id = $1`, [profileId]);
    return { ok: true };
  }

  async companies(owner: ProfileOwner): Promise<{ items: FollowedCompanyView[] }> {
    const rows = await this.pool.query<FollowedCompanyView & { source_url: string | null }>(
      `SELECT id, name, source_url FROM followed_companies
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map((row) => ({ id: row.id, name: row.name, sourceUrl: row.source_url })) };
  }

  async follow(owner: ProfileOwner, input: { name?: string; sourceUrl?: string }): Promise<FollowedCompanyView> {
    const name = input.name?.trim() ?? '';
    if (name.length === 0) throw new BillingError('validation_error', { field: 'name', reason: 'required' });
    const ctx = await this.context(owner);
    checkCapacity(ctx.snapshot, ctx.account, 'followedCompanies', await this.count('followed_companies', owner));
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO followed_companies (workspace_id, candidate_auth_user_id, name, source_url)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner.workspaceId, owner.authUserId, name, input.sourceUrl?.trim() || null],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return { id: row.id, name, sourceUrl: input.sourceUrl?.trim() || null };
  }

  async unfollow(owner: ProfileOwner, companyId: string): Promise<{ ok: true }> {
    const row = await this.ownedRow('followed_companies', owner, companyId);
    if (!row) throw new BillingError('not_found');
    await this.pool.query(`DELETE FROM followed_companies WHERE id = $1`, [companyId]);
    return { ok: true };
  }

  async alerts(owner: ProfileOwner): Promise<AlertListView> {
    const ctx = await this.context(owner);
    const balance = await unitBalance(this.pool, ctx.account, ctx.snapshot, 'alert_item', this.clock.now());
    const settings = await this.readSettings(owner.authUserId, ctx.planId);
    const rows = await this.pool.query<{
      id: string;
      opportunity_id: string;
      title: string;
      organization: string;
      revision_id: string;
      reason: unknown;
      created_at: Date;
    }>(
      `SELECT a.id, a.opportunity_id, r.title, r.organization, a.material_revision_id AS revision_id, a.reason, a.created_at
         FROM alert_items a
         JOIN opportunity_revisions r ON r.id = a.material_revision_id
        WHERE a.workspace_id = $1 AND a.recipient_auth_user_id = $2
        ORDER BY a.created_at DESC`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        opportunityId: row.opportunity_id,
        title: row.title,
        organization: row.organization === UNSTATED_ORGANIZATION ? null : row.organization,
        revisionId: row.revision_id,
        reason: reasonOf(row.reason),
        createdAt: row.created_at.toISOString(),
      })),
      alertItem: {
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        renewalDate: balance.renewalDate.toISOString(),
      },
      settings: settings.view,
    };
  }

  async updateSettings(
    owner: ProfileOwner,
    patch: {
      email?: boolean;
      push?: boolean;
      telegram?: boolean;
      digest?: string;
      quietStart?: string | null;
      quietEnd?: string | null;
      paused?: boolean;
    },
  ): Promise<AlertSettingsView> {
    const ctx = await this.context(owner);
    const current = await this.readSettings(owner.authUserId, ctx.planId);
    const delivery = ALLOWANCES[ctx.planId].alertDelivery;
    const email = patch.email ?? current.view.email;
    const push = patch.push ?? current.view.push;
    const telegram = patch.telegram ?? current.view.telegram;
    const digest = patch.digest ?? current.view.digest;
    if (!isDigest(digest)) throw new BillingError('validation_error', { field: 'digest', reason: 'invalid' });
    if (push && !channelAllowed(delivery, 'push')) {
      throw new BillingError('plan_upgrade_required', { feature: 'alertDelivery', minimumPlan: channelMinimumPlan('push') });
    }
    if (telegram && !channelAllowed(delivery, 'telegram')) {
      throw new BillingError('plan_upgrade_required', { feature: 'alertDelivery', minimumPlan: channelMinimumPlan('telegram') });
    }
    if ((digest === 'daily' || digest === 'immediate') && !digestAllowed(delivery, digest)) {
      throw new BillingError('plan_upgrade_required', {
        feature: 'alertDelivery',
        minimumPlan: channelMinimumPlan(digest === 'daily' ? 'daily' : 'immediate'),
      });
    }
    let quietStart = current.view.quietStart;
    let quietEnd = current.view.quietEnd;
    if (patch.quietStart !== undefined || patch.quietEnd !== undefined) {
      const window = quietWindow(patch.quietStart ?? null, patch.quietEnd ?? null);
      if (!window.ok) throw new BillingError('validation_error', { field: 'quietHours', reason: 'invalid' });
      quietStart = window.start;
      quietEnd = window.end;
    }
    const paused = patch.paused ?? current.view.paused;
    await this.pool.query(
      `INSERT INTO alert_settings
         (candidate_auth_user_id, workspace_id, email, push, telegram, digest, quiet_start, quiet_end, paused)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (candidate_auth_user_id) DO UPDATE
         SET email = EXCLUDED.email, push = EXCLUDED.push, telegram = EXCLUDED.telegram, digest = EXCLUDED.digest,
             quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end, paused = EXCLUDED.paused`,
      [owner.authUserId, owner.workspaceId, email, push, telegram, digest, quietStart, quietEnd, paused],
    );
    return { email, push, telegram, digest, quietStart, quietEnd, paused };
  }

  /**
   * Scheduled matching. Writes `match_results` when a resume exists and does
   * not reserve `resume_analysis`. A new listing revision reserves one
   * `alert_item`. Quota stops new items for that person and leaves the rest.
   */
  async runDue(): Promise<{ surfaced: number; paused: number; failed: number }> {
    const people = await this.candidates();
    let surfaced = 0;
    let paused = 0;
    let failed = 0;
    for (const person of people) {
      // One person's failure (a deletion in progress, a replayed failed key, a
      // database error) must not stop matching for everyone after them; their
      // own work is retried on the next run.
      try {
        const outcome = await this.surfacePerson(person);
        surfaced += outcome.surfaced;
        if (outcome.paused) paused += 1;
        if (!outcome.skipped) await this.deliverPending(person);
      } catch {
        failed += 1;
      }
    }
    return { surfaced, paused, failed };
  }

  /** One digest for the items that have no email row yet. It does not reserve. */
  async sendDigests(): Promise<{ sent: number; failed: number }> {
    const people = await this.pool.query<{ recipient_auth_user_id: string; workspace_id: string; billing_account_id: string }>(
      `SELECT DISTINCT a.recipient_auth_user_id, a.workspace_id, b.id AS billing_account_id
         FROM alert_items a
         JOIN billing_accounts b ON b.workspace_id = a.workspace_id
        ORDER BY a.recipient_auth_user_id, b.id`,
    );
    let sent = 0;
    let failed = 0;
    const seen = new Set<string>();
    for (const row of people.rows) {
      if (seen.has(row.recipient_auth_user_id)) continue;
      seen.add(row.recipient_auth_user_id);
      try {
        const did = await this.digestPerson({
          authUserId: row.recipient_auth_user_id,
          workspaceId: row.workspace_id,
          billingAccountId: row.billing_account_id,
        });
        if (did) sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  }

  private async surfacePerson(person: Person): Promise<{ surfaced: number; paused: boolean; skipped: boolean }> {
    const ctx = await this.context(person);
    const settings = await this.readSettings(person.authUserId, ctx.planId);
    if (settings.view.paused) return { surfaced: 0, paused: false, skipped: true };
    const schedule = ALLOWANCES[ctx.planId].matchingSchedule;
    if (!scheduleDue(settings.lastMatchedAt, schedule, this.clock.now())) {
      return { surfaced: 0, paused: false, skipped: false };
    }
    const listings = await this.listings(person);
    const searches = await this.pool.query<SearchRow>(
      `SELECT id, filters, paused FROM saved_searches
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND paused = false`,
      [person.workspaceId, person.authUserId],
    );
    const companies = await this.pool.query<{ name: string }>(
      `SELECT name FROM followed_companies WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    let surfaced = 0;
    for (const listing of listings) {
      const why = this.why(listing, searches.rows, companies.rows.map((row) => row.name));
      if (!why) continue;
      const already = await this.pool.query(
        `SELECT 1 FROM alert_items WHERE opportunity_id = $1 AND recipient_auth_user_id = $2 AND material_revision_id = $3`,
        [listing.opportunity_id, person.authUserId, listing.revision_id],
      );
      if (already.rows.length > 0) continue;
      const prior = await this.pool.query(
        `SELECT 1 FROM alert_items WHERE opportunity_id = $1 AND recipient_auth_user_id = $2`,
        [listing.opportunity_id, person.authUserId],
      );
      const code: AlertReasonCode = prior.rows.length > 0 ? 'material_update' : why;
      const fit = await this.rememberMatch(person, listing);
      try {
        await this.reserveItem(person, listing, { code, fit });
        surfaced += 1;
      } catch (error) {
        if (isBillingError(error, 'quota_exhausted')) {
          await this.touchMatched(person);
          return { surfaced, paused: true, skipped: false };
        }
        throw error;
      }
    }
    await this.touchMatched(person);
    return { surfaced, paused: false, skipped: false };
  }

  private async reserveItem(person: Person, listing: ListingRow, reason: { code: AlertReasonCode; fit: MatchFit | null }): Promise<void> {
    // The ledger keeps this key forever, so it carries a hash of the person, not their sign-in id.
    const key = `alert:${personKey(person.authUserId)}:${listing.revision_id}`;
    await this.metering.run({
      spender: { billingAccountId: person.billingAccountId, workspaceId: person.workspaceId, authUserId: person.authUserId },
      kind: 'alert.surface',
      unit: 'alert_item',
      feature: 'alertItems',
      idempotencyKey: key,
      body: { opportunityId: listing.opportunity_id, revisionId: listing.revision_id },
      requestId: key,
      execute: async () => reason,
      save: async (db, output) => {
        const ledger = await db.query<{ id: string }>(
          `SELECT id FROM usage_ledger WHERE billing_account_id = $1 AND idempotency_key = $2`,
          [person.billingAccountId, key],
        );
        const ledgerId = ledger.rows[0]?.id;
        if (!ledgerId) throw new BillingError('not_found');
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO alert_items
             (workspace_id, opportunity_id, recipient_auth_user_id, material_revision_id, ledger_id, reason)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [person.workspaceId, listing.opportunity_id, person.authUserId, listing.revision_id, ledgerId, JSON.stringify(output)],
        );
        return { id: inserted.rows[0]?.id ?? '', code: output.code };
      },
    });
  }

  private async rememberMatch(person: Person, listing: ListingRow): Promise<MatchFit | null> {
    const resume = await this.pool.query<{ id: string; body: unknown }>(
      `SELECT v.id, v.body FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE r.workspace_id = $1 AND r.candidate_auth_user_id = $2
        ORDER BY v.version_number DESC, v.created_at DESC
        LIMIT 1`,
      [person.workspaceId, person.authUserId],
    );
    const version = resume.rows[0];
    if (!version) return null;
    const facts = await this.pool.query<{ id: string }>(
      `SELECT id FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND confirmation = 'confirmed'`,
      [person.workspaceId, person.authUserId],
    );
    const confirmed = new Set(facts.rows.map((fact) => fact.id));
    const profile = await this.pool.query<{ version: number }>(
      `SELECT version FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    const lines = linesOf(version.body).map((line) => ({ ...line, confirmed: confirmed.has(line.factId) }));
    const compensation = isRecord(listing.compensation) ? listing.compensation : {};
    const eligibility = isRecord(listing.eligibility) ? listing.eligibility : {};
    const sponsorship = eligibility.sponsorship === 'stated_yes' || eligibility.sponsorship === 'stated_no' ? eligibility.sponsorship : 'unknown';
    const explanation = explainMatch(
      {
        status: listing.status === 'closed' ? 'closed' : 'open',
        deadline: listing.deadline,
        title: listing.title,
        description: listing.description,
        locations: strings(listing.locations),
        payKnown: typeof compensation.minimum === 'number' || typeof compensation.maximum === 'number',
        sponsorship,
      },
      lines,
      this.today(),
    );
    await this.pool.query(
      `INSERT INTO match_results
         (workspace_id, candidate_auth_user_id, profile_version, opportunity_id, opportunity_revision_id,
          resume_version_id, fit, overlap, reasons, gaps, unknowns)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 WHERE ${livePersonCondition(2)}
       ON CONFLICT (candidate_auth_user_id, profile_version, opportunity_revision_id, resume_version_id) DO NOTHING`,
      [
        person.workspaceId,
        person.authUserId,
        profile.rows[0]?.version ?? 0,
        listing.opportunity_id,
        listing.revision_id,
        version.id,
        explanation.fit,
        explanation.overlap,
        JSON.stringify(explanation.reasons),
        JSON.stringify(explanation.gaps),
        JSON.stringify(explanation.unknowns),
      ],
    );
    return explanation.fit;
  }

  private async deliverPending(person: Person): Promise<void> {
    if (!(await this.isLive(person.authUserId))) return;
    const ctx = await this.context(person);
    const settings = await this.readSettings(person.authUserId, ctx.planId);
    if (settings.view.paused) return;
    const quiet = inQuietHours(this.clock.now(), settings.view.quietStart, settings.view.quietEnd);
    const delivery = ALLOWANCES[ctx.planId].alertDelivery;
    const channels: AlertChannel[] = [];
    if (settings.view.digest === 'immediate' && settings.view.email && channelAllowed(delivery, 'email')) channels.push('email');
    if (settings.view.push && channelAllowed(delivery, 'push')) channels.push('push');
    if (settings.view.telegram && channelAllowed(delivery, 'telegram')) channels.push('telegram');
    if (channels.length === 0) return;
    const items = await this.pool.query<{ id: string; title: string }>(
      `SELECT a.id, r.title FROM alert_items a
         JOIN opportunity_revisions r ON r.id = a.material_revision_id
        WHERE a.recipient_auth_user_id = $1`,
      [person.authUserId],
    );
    for (const item of items.rows) {
      for (const channel of channels) {
        const existing = await this.pool.query<{ status: string }>(
          `SELECT status FROM notification_deliveries WHERE alert_item_id = $1 AND channel = $2`,
          [item.id, channel],
        );
        const status = existing.rows[0]?.status;
        if (status === 'sent') continue;
        if (quiet) {
          if (!status) {
            await this.pool.query(
              `INSERT INTO notification_deliveries (alert_item_id, channel, status) VALUES ($1, $2, 'held')`,
              [item.id, channel],
            );
          }
          continue;
        }
        await this.notifier.deliver({
          channel,
          recipientAuthUserId: person.authUserId,
          alertItemId: item.id,
          title: item.title,
        });
        if (status === 'held') {
          await this.pool.query(
            `UPDATE notification_deliveries SET status = 'sent', sent_at = $3 WHERE alert_item_id = $1 AND channel = $2`,
            [item.id, channel, this.clock.now()],
          );
        } else {
          await this.pool.query(
            `INSERT INTO notification_deliveries (alert_item_id, channel, status, sent_at) VALUES ($1, $2, 'sent', $3)`,
            [item.id, channel, this.clock.now()],
          );
        }
      }
    }
  }

  /** Background sends and saves skip a person who is deleted or whose deletion has started. */
  private async isLive(authUserId: string): Promise<boolean> {
    const res = await this.pool.query<{ live: boolean }>(`SELECT ${livePersonCondition(1)} AS live`, [authUserId]);
    return res.rows[0]?.live === true;
  }

  private async digestPerson(person: Person): Promise<boolean> {
    const ctx = await this.context(person);
    const settings = await this.readSettings(person.authUserId, ctx.planId);
    if (settings.view.paused || !settings.view.email) return false;
    if (settings.view.digest !== 'weekly' && settings.view.digest !== 'daily') return false;
    if (inQuietHours(this.clock.now(), settings.view.quietStart, settings.view.quietEnd)) return false;
    const items = await this.pool.query<{ id: string; title: string }>(
      `SELECT a.id, r.title FROM alert_items a
         JOIN opportunity_revisions r ON r.id = a.material_revision_id
        WHERE a.recipient_auth_user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM notification_deliveries d WHERE d.alert_item_id = a.id AND d.channel = 'email'
          )
        ORDER BY a.created_at`,
      [person.authUserId],
    );
    if (items.rows.length === 0) return false;
    const period = digestPeriodStart(this.clock.now(), settings.view.digest);
    // No digest row or mail for a person who is deleted or being deleted.
    const digest = await this.pool.query<{ id: string }>(
      `INSERT INTO digests (recipient_auth_user_id, period_start, channel)
       SELECT $1, $2, 'email' WHERE ${livePersonCondition(1)}
       ON CONFLICT (recipient_auth_user_id, period_start, channel) DO NOTHING
       RETURNING id`,
      [person.authUserId, period],
    );
    const digestId = digest.rows[0]?.id;
    if (!digestId) return false;
    await this.notifier.deliver({
      channel: 'email',
      recipientAuthUserId: person.authUserId,
      alertItemId: digestId,
      title: `digest:${items.rows.length}`,
    });
    for (const item of items.rows) {
      await this.pool.query(
        `INSERT INTO notification_deliveries (alert_item_id, channel, status, sent_at)
         VALUES ($1, 'email', 'sent', $2)
         ON CONFLICT (alert_item_id, channel) DO NOTHING`,
        [item.id, this.clock.now()],
      );
    }
    await this.pool.query(`UPDATE alert_settings SET last_digest_at = $2 WHERE candidate_auth_user_id = $1`, [
      person.authUserId,
      this.clock.now(),
    ]);
    return true;
  }

  private why(listing: ListingRow, searches: SearchRow[], companies: string[]): AlertReasonCode | null {
    for (const search of searches) {
      if (search.paused) continue;
      const filters = isRecord(search.filters) ? search.filters : {};
      const q = typeof filters.q === 'string' ? filters.q.trim().toLowerCase() : '';
      const category = typeof filters.category === 'string' ? filters.category.trim() : '';
      if (q.length === 0 && category.length === 0) continue;
      if (category.length > 0 && category !== listing.category) continue;
      const hay = `${listing.title} ${listing.organization} ${listing.description}`.toLowerCase();
      if (q.length > 0 && !hay.includes(q)) continue;
      return 'saved_search';
    }
    for (const name of companies) {
      const company = fold(name);
      if (company.length > 0 && fold(listing.organization).includes(company)) return 'followed_company';
    }
    return null;
  }

  private async listings(person: Person): Promise<ListingRow[]> {
    const rows = await this.pool.query<ListingRow>(
      `SELECT o.id AS opportunity_id, r.id AS revision_id, r.title, r.organization, r.description,
              r.locations, r.compensation, r.eligibility, r.deadline::text AS deadline, o.status, o.category
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $1)
          AND o.status = 'open'
          AND (r.deadline IS NULL OR r.deadline::text >= $2)
        ORDER BY r.checked_at DESC
        LIMIT ${LISTING_LIMIT}`,
      [person.authUserId, this.today()],
    );
    return rows.rows;
  }

  private async candidates(): Promise<Person[]> {
    const rows = await this.pool.query<{ auth_user_id: string; workspace_id: string; billing_account_id: string }>(
      `SELECT DISTINCT ON (people.auth_user_id)
              people.auth_user_id, people.workspace_id, b.id AS billing_account_id
         FROM (
           SELECT candidate_auth_user_id AS auth_user_id, workspace_id FROM saved_searches WHERE paused = false
           UNION
           SELECT candidate_auth_user_id, workspace_id FROM followed_companies
         ) people
         JOIN billing_accounts b ON b.workspace_id = people.workspace_id
        ORDER BY people.auth_user_id, b.id`,
    );
    return rows.rows.map((row) => ({
      authUserId: row.auth_user_id,
      workspaceId: row.workspace_id,
      billingAccountId: row.billing_account_id,
    }));
  }

  private async touchMatched(person: Person): Promise<void> {
    // Never re-creates a settings row for a person whose erasure has started or finished.
    await this.pool.query(
      `INSERT INTO alert_settings (candidate_auth_user_id, workspace_id, last_matched_at)
       SELECT $1, $2, $3 WHERE ${livePersonCondition(1)}
       ON CONFLICT (candidate_auth_user_id) DO UPDATE SET last_matched_at = EXCLUDED.last_matched_at`,
      [person.authUserId, person.workspaceId, this.clock.now()],
    );
  }

  private async context(owner: Pick<ProfileOwner, 'billingAccountId'>): Promise<{ account: AccountRow; snapshot: CatalogSnapshot; planId: PlanId }> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    return { account, snapshot, planId: this.planId(snapshot, account) };
  }

  private planId(snapshot: CatalogSnapshot, account: AccountRow): PlanId {
    try {
      return v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return 'professional';
    }
  }

  private assertRadius(planId: PlanId, radiusMiles: number): void {
    if (!Number.isInteger(radiusMiles) || radiusMiles < 0) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid' });
    }
    const limit = localRadiusMiles(planId);
    if (radiusMiles > limit) throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'above_plan', limit });
  }

  private assertSchedule(planId: PlanId, asked: string | undefined): MatchingSchedule {
    const plan = ALLOWANCES[planId].matchingSchedule;
    if (asked === undefined) return plan;
    if (!isSchedule(asked)) throw new BillingError('validation_error', { field: 'schedule', reason: 'invalid' });
    if (!scheduleWithinPlan(plan, asked)) {
      throw new BillingError('validation_error', { field: 'schedule', reason: 'above_plan', limit: plan });
    }
    return asked;
  }

  private async count(table: 'saved_searches' | 'location_profiles' | 'followed_companies', owner: ProfileOwner): Promise<number> {
    const rows = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    return rows.rows[0]?.n ?? 0;
  }

  private async ownedSearch(owner: ProfileOwner, searchId: string): Promise<SearchRecord> {
    if (!UUID.test(searchId)) throw new BillingError('not_found');
    const rows = await this.pool.query<SearchRecord & { workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT id, filters, location_profile_id, radius_miles, schedule, paused, workspace_id, candidate_auth_user_id
         FROM saved_searches WHERE id = $1`,
      [searchId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async ownedLocation(owner: ProfileOwner, profileId: string): Promise<{ place: string; radius_miles: number }> {
    if (!UUID.test(profileId)) throw new BillingError('not_found');
    const rows = await this.pool.query<{ place: string; radius_miles: number; workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT place, radius_miles, workspace_id, candidate_auth_user_id FROM location_profiles WHERE id = $1`,
      [profileId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async ownedRow(table: 'followed_companies', owner: ProfileOwner, id: string): Promise<boolean> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await this.pool.query<{ workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT workspace_id, candidate_auth_user_id FROM ${table} WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return true;
  }

  private async readSettings(
    authUserId: string,
    planId: PlanId,
  ): Promise<{ view: AlertSettingsView; lastMatchedAt: Date | null; lastDigestAt: Date | null }> {
    const rows = await this.pool.query<SettingsRow>(
      `SELECT email, push, telegram, digest, quiet_start, quiet_end, paused, last_matched_at, last_digest_at
         FROM alert_settings WHERE candidate_auth_user_id = $1`,
      [authUserId],
    );
    const row = rows.rows[0];
    if (!row) {
      const delivery = ALLOWANCES[planId].alertDelivery;
      const digest: DigestChoice = delivery === 'immediate_optional' ? 'immediate' : delivery === 'daily_email' ? 'daily' : 'weekly';
      return {
        view: { email: true, push: false, telegram: false, digest, quietStart: null, quietEnd: null, paused: false },
        lastMatchedAt: null,
        lastDigestAt: null,
      };
    }
    return {
      view: {
        email: row.email,
        push: row.push,
        telegram: row.telegram,
        digest: isDigest(row.digest) ? row.digest : 'weekly',
        quietStart: row.quiet_start,
        quietEnd: row.quiet_end,
        paused: row.paused,
      },
      lastMatchedAt: row.last_matched_at,
      lastDigestAt: row.last_digest_at,
    };
  }

  private searchView(row: SearchRecord): SavedSearchView {
    const filters = isRecord(row.filters) ? row.filters : {};
    return {
      id: row.id,
      q: typeof filters.q === 'string' ? filters.q : null,
      category: typeof filters.category === 'string' ? filters.category : null,
      locationProfileId: row.location_profile_id,
      radiusMiles: row.radius_miles,
      schedule: isSchedule(row.schedule) ? row.schedule : 'weekly',
      paused: row.paused,
    };
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

interface SearchRecord {
  id: string;
  filters: unknown;
  location_profile_id: string | null;
  radius_miles: number | null;
  schedule: string;
  paused: boolean;
}

function reasonOf(value: unknown): { code: AlertReasonCode; fit: MatchFit | null } {
  const code = isRecord(value) && (value.code === 'saved_search' || value.code === 'followed_company' || value.code === 'material_update')
    ? value.code
    : 'saved_search';
  const fit = isRecord(value) && (value.fit === 'blocked' || value.fit === 'none' || value.fit === 'partial' || value.fit === 'strong') ? value.fit : null;
  return { code, fit };
}

function linesOf(body: unknown): Array<{ factId: string; text: string }> {
  if (!isRecord(body) || !Array.isArray(body.sections)) return [];
  const lines: Array<{ factId: string; text: string }> = [];
  for (const section of body.sections) {
    if (!isRecord(section) || !Array.isArray(section.lines)) continue;
    for (const line of section.lines) {
      if (!isRecord(line) || typeof line.factId !== 'string' || typeof line.text !== 'string') continue;
      lines.push({ factId: line.factId, text: line.text });
    }
  }
  return lines;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isSchedule(value: string): value is MatchingSchedule {
  return (SCHEDULES as readonly string[]).includes(value);
}

function isDigest(value: string): value is DigestChoice {
  return (DIGESTS as readonly string[]).includes(value);
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
