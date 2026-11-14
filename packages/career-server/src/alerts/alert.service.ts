import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  ALLOWANCES,
  REMINDER_KINDS,
  alertTierAtLeast,
  alertTierMinimumPlan,
  channelAllowed,
  channelMinimumPlan,
  companyMatches,
  digestAllowed,
  digestPeriodStart,
  distanceMiles,
  explainMatch,
  filterCategoryColumn,
  foldText,
  inQuietHours,
  isFilterCategory,
  isListingArrangement,
  isListingSchedule,
  isListingSeniority,
  localRadiusMiles,
  meetsRelevance,
  placeMatchesLocations,
  quietWindow,
  reminderDue,
  scheduleDue,
  scheduleWithinPlan,
  statedOrganization,
  validatePreferences,
  RELEVANCE_THRESHOLDS,
} from '@flacroncv/career-shared';
import type {
  AlertChannel,
  AlertReasonCode,
  AlertTier,
  DigestChoice,
  ListingArrangement,
  ListingCompensation,
  ListingSchedule,
  ListingSeniority,
  MatchCredential,
  MatchExplanation,
  MatchFit,
  MatchLabel,
  MatchLabelReason,
  MatchingSchedule,
  PlanId,
  RelevanceThreshold,
  ReminderKind,
} from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { RecordingMailer } from '../mail/mailer';
import type { Mailer } from '../mail/mailer';
import { createMailer } from '../mail/ses-mailer';
import { UnconfiguredGeocoder } from '../maps/geocoder';
import type { Geocoder } from '../maps/geocoder';
import { createLocationProfile, deleteLocationProfile, updateLocationProfile } from '../career-modes/career-modes.service';
import { checkCapacity, requireFeature } from '../metering/access';
import { MeteringService } from '../metering/metering.service';
import { matchListingOf, recentOpenListingsForCandidate } from '../opportunities/opportunity.service';
import type { ListingRecord } from '../opportunities/opportunity.service';
import { livePersonCondition, personKey } from '../privacy/live-person';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULES = ['weekly', 'daily', 'every_6_hours', 'hourly'] as const;
const DIGESTS = ['weekly', 'daily', 'immediate'] as const;
const CHANNELS: readonly AlertChannel[] = ['email', 'push', 'telegram'];

/** One run looks at this many recently checked listings. A later run sees the rest. */
const LISTING_LIMIT = 50;
/** A followed company keeps at most this many aliases, roles and places each. */
const COMPANY_LIST_MAX = 10;
/** V1 tracker dates synced for reminders in one call. */
const REMINDER_SYNC_MAX = 200;

export interface ChannelDelivery {
  channel: AlertChannel;
  recipientAuthUserId: string;
  /** The outbox subject: an alert item, a digest or a reminder id. */
  alertItemId: string;
  title: string;
  /** What is being sent, so an adapter can choose its template. */
  kind?: 'alert' | 'digest' | 'reminder';
  /**
   * Stable per logical message (outbox row). A provider that supports
   * idempotency must receive it as its idempotency key, so a retry of the
   * same message cannot be delivered twice.
   */
  messageId: string;
}

/**
 * Sends one message. Throw `NotificationSendError('not_sent')` when the
 * provider definitely did not accept it; any other failure (timeout,
 * connection reset after the request was written) counts as `uncertain`.
 */
export interface AlertNotifier {
  /** True only if the provider de-duplicates by `messageId`; then an uncertain send may be retried. */
  readonly idempotent?: boolean;
  /**
   * False when the channel has no configured provider. Nothing is attempted:
   * the outbox row stays queued with `provider_unavailable` and is sent once a
   * provider is configured. Absent means every channel is available.
   */
  available?(channel: AlertChannel): boolean;
  deliver(item: ChannelDelivery): Promise<void>;
}

export class NotificationSendError extends Error {
  constructor(readonly outcome: 'not_sent' | 'uncertain', readonly reason = 'provider_error') {
    super(`notification_${outcome}`);
    this.name = 'NotificationSendError';
  }
}

/** Test double: records a delivery in memory and calls no network. Never bind it in a running service. */
export class RecordingAlertNotifier implements AlertNotifier {
  readonly delivered: ChannelDelivery[] = [];
  readonly idempotent: boolean = false;

  async deliver(item: ChannelDelivery): Promise<void> {
    this.delivered.push(item);
  }
}

/** One channel's provider adapter (SES email, a push service, a Telegram bot). */
export interface ChannelSender {
  readonly idempotent?: boolean;
  send(item: ChannelDelivery): Promise<void>;
}

/**
 * The notifier a running service uses. A channel without an adapter is
 * reported as unavailable, so nothing is ever marked sent that did not leave
 * the process; queued rows wait for the adapter.
 */
export class ChannelAlertNotifier implements AlertNotifier {
  constructor(private readonly senders: Partial<Record<AlertChannel, ChannelSender>> = {}) {}

  get idempotent(): boolean {
    const bound = Object.values(this.senders);
    return bound.length > 0 && bound.every((sender) => sender?.idempotent === true);
  }

  available(channel: AlertChannel): boolean {
    return this.senders[channel] !== undefined;
  }

  async deliver(item: ChannelDelivery): Promise<void> {
    const sender = this.senders[item.channel];
    if (!sender) throw new NotificationSendError('not_sent', 'provider_unavailable');
    await sender.send(item);
  }
}

/**
 * Email through the configured mailer. The person's address comes from the
 * identity provider (`resolveAddress`); without one nothing is sent.
 */
export class MailerEmailSender implements ChannelSender {
  readonly idempotent = false;

  constructor(
    private readonly mailer: Mailer,
    private readonly resolveAddress: (authUserId: string) => Promise<string | null>,
  ) {}

  async send(item: ChannelDelivery): Promise<void> {
    const to = await this.resolveAddress(item.recipientAuthUserId);
    if (!to) throw new NotificationSendError('not_sent', 'no_address');
    const subject =
      item.kind === 'reminder' ? `FlacronCV reminder: ${item.title}` : item.kind === 'digest' ? 'Your FlacronCV opportunity digest' : `FlacronCV alert: ${item.title}`;
    const result = await this.mailer.send({ to, subject, text: `${item.title}\n\nOpen FlacronCV to see the details and why it was surfaced.` });
    if (!result.delivered) throw new NotificationSendError('not_sent', 'mail_not_delivered');
  }
}

/**
 * Binds only the channels that have a real provider. Email needs both a live
 * mailer (SES keys, see `createMailer`) and an address resolver; push and
 * Telegram have no adapter in this build, so they stay "not connected".
 */
export function createAlertNotifier(
  env: NodeJS.ProcessEnv = process.env,
  options: { resolveEmail?: (authUserId: string) => Promise<string | null>; mailer?: Mailer } = {},
): ChannelAlertNotifier {
  const mailer = options.mailer ?? createMailer(env);
  const senders: Partial<Record<AlertChannel, ChannelSender>> = {};
  if (!(mailer instanceof RecordingMailer) && options.resolveEmail) senders.email = new MailerEmailSender(mailer, options.resolveEmail);
  return new ChannelAlertNotifier(senders);
}

/**
 * Where an alert email goes: the address the person's own Firebase ID token
 * marked VERIFIED, recorded on their career `users` row at each sign-in
 * (`rememberErasureEmail`, kept current when it changes). The worker that
 * sends alerts has no Firebase Admin access, so this recorded copy is the
 * identity source both the API and the worker share. An unverified address is
 * never recorded, so mail never goes to an address the person has not proven;
 * a person being deleted gets nothing. No address → the email stays queued as
 * undeliverable rather than being guessed.
 */
export function createRecordedEmailResolver(pool: Pick<Pool, 'query'>): (authUserId: string) => Promise<string | null> {
  return async (authUserId: string) => {
    const res = await pool.query<{ erasure_email: string | null }>(
      `SELECT erasure_email FROM users WHERE auth_user_id = $1 AND deletion_requested_at IS NULL`,
      [authUserId],
    );
    return res.rows[0]?.erasure_email ?? null;
  };
}

/** Outbox limits. A claim older than this is considered abandoned (crash). */
export const DELIVERY_CLAIM_MS = 5 * 60_000;
export const DELIVERY_MAX_ATTEMPTS = 5;
const deliveryBackoffMs = (attempts: number) => Math.min(2 ** attempts * 60_000, 60 * 60_000);

type SendOutcome = 'sent' | 'retry' | 'failed' | 'uncertain';

function sendOutcomeOf(error: unknown): 'not_sent' | 'uncertain' {
  return error instanceof NotificationSendError ? error.outcome : 'uncertain';
}

/** Alert items and reminders share the outbox logic; only the table differs. */
interface Outbox {
  table: 'notification_deliveries' | 'reminder_deliveries';
  key: 'alert_item_id' | 'reminder_id';
  kind: 'alert' | 'reminder';
}
const ALERT_OUTBOX: Outbox = { table: 'notification_deliveries', key: 'alert_item_id', kind: 'alert' };
const REMINDER_OUTBOX: Outbox = { table: 'reminder_deliveries', key: 'reminder_id', kind: 'reminder' };

export interface SavedSearchFilters {
  minPay: number | null;
  payCurrency: string | null;
  payPeriod: string | null;
  workSchedule: ListingSchedule | null;
  seniority: ListingSeniority | null;
  arrangement: ListingArrangement | null;
  relevance: RelevanceThreshold;
}

export interface SavedSearchView {
  id: string;
  q: string | null;
  category: string | null;
  locationProfileId: string | null;
  radiusMiles: number | null;
  /** Matching schedule (how often the search runs), not the job's work schedule. */
  schedule: MatchingSchedule;
  paused: boolean;
  filters: SavedSearchFilters;
  /**
   * Filters stored on the search that the current plan's alert level does not
   * apply (after a downgrade). Shown to the person; never dropped silently.
   */
  inactiveFilters: Array<keyof SavedSearchFilters>;
  /** How the place is applied: by distance (both sides have coordinates) or by name. Null without a place. */
  locationMode: 'radius_or_name' | 'name' | null;
}

export interface LocationProfileView {
  id: string;
  place: string;
  radiusMiles: number;
  /** True when the geocoding adapter found coordinates, so a radius can be measured. */
  hasCoordinates: boolean;
  geocodedLabel: string | null;
}

export interface FollowedCompanyView {
  id: string;
  name: string;
  sourceUrl: string | null;
  aliases: string[];
  roles: string[];
  locations: string[];
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

export type ChannelConnection = 'connected' | 'not_connected';

export interface AlertReasonView {
  code: AlertReasonCode;
  /** The alert level the item was surfaced at. */
  tier: AlertTier;
  searchId: string | null;
  searchLabel: string | null;
  companyId: string | null;
  companyName: string | null;
  /** Enhanced and above. */
  fit: MatchFit | null;
  label: MatchLabel | null;
  labelReasons: MatchLabelReason[];
  gaps: string[];
  /** Advanced and above: how the opening connects to the person's goals and next steps. */
  advanced: {
    targetRole: string | null;
    promotionGoal: string | null;
    learningPlanId: string | null;
    actionPackId: string | null;
  } | null;
}

export interface AlertItemView {
  id: string;
  opportunityId: string;
  title: string;
  organization: string | null;
  revisionId: string;
  reason: AlertReasonView;
  /** Basic source details, shown at every alert level. */
  basic: {
    provider: string;
    category: string;
    locations: string[];
    sourceUrl: string | null;
    checkedAt: string;
    compensation: ListingCompensation;
    deadline: string | null;
  };
  read: boolean;
  deliveries: DeliveryView[];
  createdAt: string;
}

export interface DeliveryView {
  channel: AlertChannel;
  status: 'held' | 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed';
  /** `provider_unavailable` while no provider is configured for the channel. */
  lastError: string | null;
}

export interface AlertListView {
  items: AlertItemView[];
  unread: number;
  alertItem: { includedRemaining: number; packRemaining: number; renewalDate: string | null };
  settings: AlertSettingsView;
  channels: Record<AlertChannel, ChannelConnection>;
  tier: AlertTier;
}

export interface ReminderView {
  id: string;
  kind: ReminderKind;
  title: string;
  dueDate: string;
  link: string | null;
  read: boolean;
  createdAt: string;
  deliveries: DeliveryView[];
}

export interface ReminderListView {
  /** Due today or later, nearest first. */
  upcoming: ReminderView[];
  /** Dates already passed, most recent first. */
  history: ReminderView[];
  unread: number;
}

export interface V1ReminderInput {
  kind?: string;
  sourceKey?: string;
  title?: string;
  dueDate?: string;
  link?: string | null;
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

interface SearchRecord {
  id: string;
  filters: unknown;
  location_profile_id: string | null;
  radius_miles: number | null;
  schedule: string;
  paused: boolean;
}

interface SearchRule {
  id: string;
  label: string;
  q: string | null;
  category: string | null;
  filters: SavedSearchFilters;
  place: { place: string; radiusMiles: number | null; latitude: number | null; longitude: number | null } | null;
}

interface CompanyRule {
  id: string;
  name: string;
  names: string[];
  roles: string[];
  locations: string[];
}

interface Trigger {
  code: 'saved_search' | 'followed_company';
  searchId: string | null;
  searchLabel: string | null;
  companyId: string | null;
  companyName: string | null;
  relevance: RelevanceThreshold;
}

/**
 * Saved searches, company watch, the alert centre and reminders. The
 * scheduled pass reserves one `alert_item` per new listing revision; fit is
 * computed only from the Enhanced alert level up (spec section 7) and never
 * spends `resume_analysis`. Email, push, Telegram, digests and reminders do
 * not reserve anything.
 */
export class AlertService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly notifier: AlertNotifier = new ChannelAlertNotifier(),
    private readonly clock: Clock = { now: () => new Date() },
    private readonly geocoder: Geocoder = new UnconfiguredGeocoder(),
  ) {}

  // ---------------------------------------------------------------- searches

  async searches(owner: ProfileOwner): Promise<{ items: SavedSearchView[] }> {
    const ctx = await this.context(owner);
    const rows = await this.pool.query<SearchRecord>(
      `SELECT id, filters, location_profile_id, radius_miles, schedule, paused
         FROM saved_searches
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    const places = await this.locationRows(owner);
    return { items: rows.rows.map((row) => this.searchView(row, ctx.tier, places)) };
  }

  async createSearch(
    owner: ProfileOwner,
    input: {
      q?: string;
      category?: string;
      locationProfileId?: string;
      radiusMiles?: number;
      schedule?: string;
    } & Partial<Record<keyof SavedSearchFilters, unknown>>,
  ): Promise<SavedSearchView> {
    const q = input.q?.trim() ?? '';
    const category = input.category?.trim() ?? '';
    if (q.length === 0 && category.length === 0) {
      throw new BillingError('validation_error', { field: 'q', reason: 'required' });
    }
    if (category.length > 0 && !isFilterCategory(category)) throw new BillingError('validation_error', { field: 'category', reason: 'invalid' });
    const ctx = await this.context(owner);
    const schedule = this.assertSchedule(ctx.planId, input.schedule);
    // A filter above the alert level is refused before capacity, so the upgrade prompt names the real reason.
    const filters = this.parseFilters(input, ctx.tier, emptyFilters());
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
        JSON.stringify({ q: q.length > 0 ? q : null, category: category.length > 0 ? category : null, ...filters }),
        input.locationProfileId ?? null,
        input.radiusMiles ?? null,
        schedule,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return this.searchView(row, ctx.tier, await this.locationRows(owner));
  }

  async updateSearch(
    owner: ProfileOwner,
    searchId: string,
    input: {
      q?: string;
      category?: string | null;
      paused?: boolean;
      schedule?: string;
      locationProfileId?: string | null;
      radiusMiles?: number | null;
    } & Partial<Record<keyof SavedSearchFilters, unknown>>,
  ): Promise<SavedSearchView> {
    const current = await this.ownedSearch(owner, searchId);
    const ctx = await this.context(owner);
    const stored = isRecord(current.filters) ? { ...current.filters } : {};
    if (input.q !== undefined) {
      const q = input.q.trim();
      if (q.length === 0 && !(typeof stored.category === 'string' && stored.category.length > 0)) {
        throw new BillingError('validation_error', { field: 'q', reason: 'required' });
      }
      stored.q = q.length > 0 ? q : null;
    }
    if (input.category !== undefined) {
      const category = input.category?.trim() ?? '';
      if (category.length > 0 && !isFilterCategory(category)) throw new BillingError('validation_error', { field: 'category', reason: 'invalid' });
      if (category.length === 0 && !(typeof stored.q === 'string' && stored.q.length > 0)) {
        throw new BillingError('validation_error', { field: 'q', reason: 'required' });
      }
      stored.category = category.length > 0 ? category : null;
    }
    const filters = this.parseFilters(input, ctx.tier, filtersOf(stored));
    const schedule = input.schedule !== undefined ? this.assertSchedule(ctx.planId, input.schedule) : current.schedule;
    const paused = input.paused ?? current.paused;
    let locationProfileId = current.location_profile_id;
    if (input.locationProfileId !== undefined) {
      if (input.locationProfileId !== null) await this.ownedLocation(owner, input.locationProfileId);
      locationProfileId = input.locationProfileId;
    }
    let radiusMiles = current.radius_miles;
    if (input.radiusMiles !== undefined) {
      if (input.radiusMiles !== null) this.assertRadius(ctx.planId, input.radiusMiles);
      radiusMiles = input.radiusMiles;
    }
    const updated = await this.pool.query<SearchRecord>(
      `UPDATE saved_searches SET filters = $2, schedule = $3, paused = $4, location_profile_id = $5, radius_miles = $6
        WHERE id = $1
        RETURNING id, filters, location_profile_id, radius_miles, schedule, paused`,
      [searchId, JSON.stringify({ ...stored, ...filters }), schedule, paused, locationProfileId, radiusMiles],
    );
    const row = updated.rows[0];
    if (!row) throw new BillingError('not_found');
    return this.searchView(row, ctx.tier, await this.locationRows(owner));
  }

  async deleteSearch(owner: ProfileOwner, searchId: string): Promise<{ ok: true }> {
    await this.ownedSearch(owner, searchId);
    await this.pool.query(`DELETE FROM saved_searches WHERE id = $1`, [searchId]);
    return { ok: true };
  }

  // --------------------------------------------------------------- locations

  async locations(owner: ProfileOwner): Promise<{ items: LocationProfileView[] }> {
    return { items: (await this.locationRows(owner)).map(locationView) };
  }

  // Writes go through the career-modes single writer for `location_profiles`,
  // so plan radius, capacity (plan + purchased extras), the feature switch and
  // the "never assume work authorization" defaults are identical whether a
  // place is added from Alerts or from Relocation & modes. Alerts only adds
  // its own wire contract on top (view shape and error reasons).

  async createLocation(owner: ProfileOwner, input: { place?: string; radiusMiles?: number }): Promise<LocationProfileView> {
    if ((input.place?.trim() ?? '').length === 0) throw new BillingError('validation_error', { field: 'place', reason: 'required' });
    const created = await alertsLocationContract(() =>
      createLocationProfile(this.pool, owner, { place: input.place ?? '', radiusMiles: input.radiusMiles as number }, this.catalogs, this.geocoder),
    );
    return this.locationViewById(created.id);
  }

  async updateLocation(owner: ProfileOwner, profileId: string, input: { place?: string; radiusMiles?: number }): Promise<LocationProfileView> {
    // Existence and ownership first, with the alerts' long-standing 403 for someone else's place.
    await this.ownedLocation(owner, profileId);
    if (input.place !== undefined && input.place.trim().length === 0) {
      throw new BillingError('validation_error', { field: 'place', reason: 'required' });
    }
    const updated = await alertsLocationContract(() =>
      updateLocationProfile(
        this.pool,
        owner,
        profileId,
        { ...(input.place !== undefined ? { place: input.place } : {}), ...(input.radiusMiles !== undefined ? { radiusMiles: input.radiusMiles } : {}) },
        this.catalogs,
        this.geocoder,
      ),
    );
    return this.locationViewById(updated.id);
  }

  async deleteLocation(owner: ProfileOwner, profileId: string): Promise<{ ok: true }> {
    await this.ownedLocation(owner, profileId);
    await deleteLocationProfile(this.pool, owner, profileId);
    return { ok: true };
  }

  /** The alerts view of a place (coordinates as a yes/no), read after the shared writer saved it. */
  private async locationViewById(id: string): Promise<LocationProfileView> {
    const rows = await this.pool.query<LocationRow>(
      `SELECT id, place, radius_miles, latitude, longitude, geocoded_label FROM location_profiles WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found', { entity: 'location_profile', id });
    return locationView(row);
  }

  // --------------------------------------------------------------- companies

  async companies(owner: ProfileOwner): Promise<{ items: FollowedCompanyView[] }> {
    const rows = await this.pool.query<CompanyRow>(
      `SELECT id, name, source_url, aliases, roles, locations FROM followed_companies
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map(companyView) };
  }

  async follow(
    owner: ProfileOwner,
    input: { name?: string; sourceUrl?: string; aliases?: unknown; roles?: unknown; locations?: unknown },
  ): Promise<FollowedCompanyView> {
    const name = input.name?.trim() ?? '';
    if (name.length === 0) throw new BillingError('validation_error', { field: 'name', reason: 'required' });
    const lists = companyLists(input);
    const ctx = await this.context(owner);
    checkCapacity(ctx.snapshot, ctx.account, 'followedCompanies', await this.count('followed_companies', owner));
    const inserted = await this.pool.query<CompanyRow>(
      `INSERT INTO followed_companies (workspace_id, candidate_auth_user_id, name, source_url, aliases, roles, locations)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, source_url, aliases, roles, locations`,
      [owner.workspaceId, owner.authUserId, name, input.sourceUrl?.trim() || null, lists.aliases ?? [], lists.roles ?? [], lists.locations ?? []],
    );
    const row = inserted.rows[0];
    if (!row) throw new BillingError('provider_unavailable');
    return companyView(row);
  }

  async updateCompany(
    owner: ProfileOwner,
    companyId: string,
    input: { name?: string; aliases?: unknown; roles?: unknown; locations?: unknown },
  ): Promise<FollowedCompanyView> {
    await this.ownedRow('followed_companies', owner, companyId);
    const name = input.name !== undefined ? input.name.trim() : null;
    if (name !== null && name.length === 0) throw new BillingError('validation_error', { field: 'name', reason: 'required' });
    const lists = companyLists(input);
    const updated = await this.pool.query<CompanyRow>(
      `UPDATE followed_companies
          SET name = COALESCE($2, name), aliases = COALESCE($3, aliases), roles = COALESCE($4, roles), locations = COALESCE($5, locations)
        WHERE id = $1
        RETURNING id, name, source_url, aliases, roles, locations`,
      [companyId, name, lists.aliases, lists.roles, lists.locations],
    );
    return companyView(updated.rows[0]!);
  }

  async unfollow(owner: ProfileOwner, companyId: string): Promise<{ ok: true }> {
    const row = await this.ownedRow('followed_companies', owner, companyId);
    if (!row) throw new BillingError('not_found');
    await this.pool.query(`DELETE FROM followed_companies WHERE id = $1`, [companyId]);
    return { ok: true };
  }

  // ------------------------------------------------------------ alert centre

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
      read_at: Date | null;
      provider: string;
      category: string;
      locations: unknown;
      source_url: string | null;
      checked_at: Date;
      compensation: unknown;
      deadline: string | null;
      deliveries: unknown;
    }>(
      `SELECT a.id, a.opportunity_id, r.title, r.organization, a.material_revision_id AS revision_id, a.reason, a.created_at, a.read_at,
              o.provider, o.category, r.locations, r.source_url, r.checked_at, r.compensation, r.deadline,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object('channel', d.channel, 'status', d.status, 'lastError', d.last_error) ORDER BY d.channel), '[]'::jsonb)
                 FROM notification_deliveries d WHERE d.alert_item_id = a.id) AS deliveries
         FROM alert_items a
         JOIN opportunity_revisions r ON r.id = a.material_revision_id
         JOIN opportunities o ON o.id = a.opportunity_id
        WHERE a.workspace_id = $1 AND a.recipient_auth_user_id = $2
        ORDER BY a.created_at DESC
        LIMIT 200`,
      [owner.workspaceId, owner.authUserId],
    );
    const unread = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alert_items WHERE workspace_id = $1 AND recipient_auth_user_id = $2 AND read_at IS NULL`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        opportunityId: row.opportunity_id,
        title: row.title,
        organization: statedOrganization(row.organization),
        revisionId: row.revision_id,
        reason: reasonOf(row.reason),
        basic: {
          provider: row.provider,
          category: row.category,
          locations: strings(row.locations),
          sourceUrl: row.source_url,
          checkedAt: row.checked_at.toISOString(),
          compensation: compensationOf(row.compensation),
          deadline: row.deadline,
        },
        read: row.read_at !== null,
        deliveries: deliveriesOf(row.deliveries),
        createdAt: row.created_at.toISOString(),
      })),
      unread: unread.rows[0]?.n ?? 0,
      alertItem: {
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        renewalDate: balance.renewalDate.toISOString(),
      },
      settings: settings.view,
      channels: this.channels(),
      tier: ctx.tier,
    };
  }

  async markRead(owner: ProfileOwner, alertId: string): Promise<{ id: string; read: true }> {
    if (!UUID.test(alertId)) throw new BillingError('not_found');
    const updated = await this.pool.query(
      `UPDATE alert_items SET read_at = COALESCE(read_at, $4)
        WHERE id = $1 AND workspace_id = $2 AND recipient_auth_user_id = $3`,
      [alertId, owner.workspaceId, owner.authUserId, this.clock.now()],
    );
    if (updated.rowCount === 0) throw new BillingError('not_found');
    return { id: alertId, read: true };
  }

  async markAllRead(owner: ProfileOwner): Promise<{ updated: number }> {
    const updated = await this.pool.query(
      `UPDATE alert_items SET read_at = $3 WHERE workspace_id = $1 AND recipient_auth_user_id = $2 AND read_at IS NULL`,
      [owner.workspaceId, owner.authUserId, this.clock.now()],
    );
    return { updated: updated.rowCount ?? 0 };
  }

  /** Whether each channel has a provider. Shown next to the switches so nobody expects a message that cannot leave. */
  channels(): Record<AlertChannel, ChannelConnection> {
    const status = (channel: AlertChannel): ChannelConnection =>
      this.notifier.available === undefined || this.notifier.available(channel) ? 'connected' : 'not_connected';
    return { email: status('email'), push: status('push'), telegram: status('telegram') };
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

  // ---------------------------------------------------------- scheduled pass

  /**
   * Scheduled matching. A new listing revision reserves one `alert_item`.
   * Quota stops new items for that person and leaves the rest. Fit (Enhanced
   * and above) writes `match_results` without reserving `resume_analysis`.
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
    const listings = await recentOpenListingsForCandidate(this.pool, person.authUserId, this.today(), LISTING_LIMIT);
    const searches = await this.searchRules(person);
    const companies = await this.companyRules(person);
    let surfaced = 0;
    for (const listing of listings) {
      const trigger = this.trigger(listing, searches, companies, ctx.tier);
      if (!trigger) continue;
      const already = await this.pool.query(
        `SELECT 1 FROM alert_items WHERE opportunity_id = $1 AND recipient_auth_user_id = $2 AND material_revision_id = $3`,
        [listing.opportunityId, person.authUserId, listing.revisionId],
      );
      if (already.rows.length > 0) continue;
      const prior = await this.pool.query(
        `SELECT 1 FROM alert_items WHERE opportunity_id = $1 AND recipient_auth_user_id = $2`,
        [listing.opportunityId, person.authUserId],
      );
      const code: AlertReasonCode = prior.rows.length > 0 ? 'material_update' : trigger.code;
      // Fit and gaps are Enhanced intelligence; Basic and Personalized alerts carry source details only.
      const explanation = alertTierAtLeast(ctx.tier, 'enhanced') ? await this.rememberMatch(person, listing) : null;
      if (trigger.relevance !== 'any' && alertTierAtLeast(ctx.tier, 'enhanced') && !meetsRelevance(explanation?.label ?? null, trigger.relevance)) {
        continue;
      }
      const reason: AlertReasonView = {
        code,
        tier: ctx.tier,
        searchId: trigger.searchId,
        searchLabel: trigger.searchLabel,
        companyId: trigger.companyId,
        companyName: trigger.companyName,
        fit: explanation?.fit ?? null,
        label: explanation?.label ?? null,
        labelReasons: explanation?.labelReasons ?? [],
        gaps: explanation ? explanation.gaps.slice(0, 5).map((gap) => gap.token) : [],
        advanced: alertTierAtLeast(ctx.tier, 'advanced') ? await this.advancedContext(person, listing) : null,
      };
      try {
        await this.reserveItem(person, listing, reason);
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

  private async reserveItem(person: Person, listing: ListingRecord, reason: AlertReasonView): Promise<void> {
    // The ledger keeps this key forever, so it carries a hash of the person, not their sign-in id.
    const key = `alert:${personKey(person.authUserId)}:${listing.revisionId}`;
    await this.metering.run({
      spender: { billingAccountId: person.billingAccountId, workspaceId: person.workspaceId, authUserId: person.authUserId },
      kind: 'alert.surface',
      unit: 'alert_item',
      feature: 'alertItems',
      idempotencyKey: key,
      body: { opportunityId: listing.opportunityId, revisionId: listing.revisionId },
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
          [person.workspaceId, listing.opportunityId, person.authUserId, listing.revisionId, ledgerId, JSON.stringify(output)],
        );
        return { id: inserted.rows[0]?.id ?? '', code: reason.code };
      },
    });
  }

  private async rememberMatch(person: Person, listing: ListingRecord): Promise<MatchExplanation | null> {
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
    const facts = await this.pool.query<{ id: string; confirmation: string; fact_type: string; value: unknown }>(
      `SELECT id, confirmation, fact_type, value FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    const confirmed = new Set(facts.rows.filter((fact) => fact.confirmation === 'confirmed').map((fact) => fact.id));
    const credentials: MatchCredential[] = facts.rows
      .filter((fact) => fact.fact_type === 'certification' && isRecord(fact.value) && typeof fact.value.name === 'string')
      .map((fact) => ({ factId: fact.id, name: String((fact.value as Record<string, unknown>).name), confirmed: fact.confirmation === 'confirmed' }));
    const profile = await this.pool.query<{ version: number; preferences: unknown }>(
      `SELECT version, preferences FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    const parsed = validatePreferences(isRecord(profile.rows[0]?.preferences) ? profile.rows[0]?.preferences : {});
    const lines = linesOf(version.body).map((line) => ({ ...line, confirmed: confirmed.has(line.factId) }));
    const explanation = explainMatch(matchListingOf(listing), lines, this.today(), {
      preferences: parsed.ok ? parsed.value : null,
      credentials,
    });
    await this.pool.query(
      `INSERT INTO match_results
         (workspace_id, candidate_auth_user_id, profile_version, opportunity_id, opportunity_revision_id,
          resume_version_id, fit, overlap, reasons, gaps, unknowns, preference_fit)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 WHERE ${livePersonCondition(2)}
       ON CONFLICT (candidate_auth_user_id, profile_version, opportunity_revision_id, resume_version_id) DO NOTHING`,
      [
        person.workspaceId,
        person.authUserId,
        profile.rows[0]?.version ?? 0,
        listing.opportunityId,
        listing.revisionId,
        version.id,
        explanation.fit,
        explanation.overlap,
        JSON.stringify(explanation.reasons),
        JSON.stringify(explanation.gaps),
        JSON.stringify(explanation.unknowns),
        JSON.stringify(explanation.preferenceFit),
      ],
    );
    return explanation;
  }

  /**
   * Advanced intelligence: what this opening has to do with the person's own
   * goals. Only links that exist are returned; nothing is inferred.
   */
  private async advancedContext(person: Person, listing: ListingRecord): Promise<NonNullable<AlertReasonView['advanced']>> {
    const title = ` ${foldText(listing.title)} `;
    const inTitle = (value: string) => {
      const folded = foldText(value);
      return folded.length > 0 && title.includes(` ${folded} `);
    };
    const profile = await this.pool.query<{ preferences: unknown }>(
      `SELECT preferences FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    const preferences = isRecord(profile.rows[0]?.preferences) ? profile.rows[0]!.preferences as Record<string, unknown> : {};
    const targetRole = strings(preferences.targetRoles).find(inTitle) ?? null;
    const goals = await this.pool.query<{ desired_title: string }>(
      `SELECT desired_title FROM career_promotion_goals WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [person.workspaceId, person.authUserId],
    );
    const promotionGoal = goals.rows.map((row) => row.desired_title).find(inTitle) ?? null;
    const plans = await this.pool.query<{ id: string; target_role: string }>(
      `SELECT id, target_role FROM skill_gap_reports WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [person.workspaceId, person.authUserId],
    );
    const learningPlanId = plans.rows.find((row) => inTitle(row.target_role))?.id ?? null;
    const packs = await this.pool.query<{ id: string }>(
      `SELECT id FROM action_packs WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND opportunity_id = $3 ORDER BY created_at DESC LIMIT 1`,
      [person.workspaceId, person.authUserId, listing.opportunityId],
    );
    return { targetRole, promotionGoal, learningPlanId, actionPackId: packs.rows[0]?.id ?? null };
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
        await this.enqueue(ALERT_OUTBOX, person, item, channel, quiet);
      }
    }
  }

  /** The outbox row exists before any send: one row per (subject, channel), unique. */
  private async enqueue(outbox: Outbox, person: Person, item: { id: string; title: string }, channel: AlertChannel, quiet: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${outbox.table} (${outbox.key}, channel, status)
       SELECT $1, $2, $3 WHERE ${livePersonCondition(4)}
       ON CONFLICT (${outbox.key}, channel) DO NOTHING`,
      [item.id, channel, quiet ? 'held' : 'pending', person.authUserId],
    );
    if (quiet) return;
    await this.sendDelivery(person, item, channel, outbox);
  }

  /**
   * Claim, send, acknowledge. The claim is a single UPDATE, so two workers
   * cannot both own a row. A claim left by a crashed worker (`sending`, past
   * `claimed_until`) is resent only by an idempotent notifier (same
   * `messageId`); otherwise it becomes `uncertain`, never silently `sent`.
   * A channel without a provider is not attempted at all: the row stays
   * queued, says `provider_unavailable`, and keeps its attempts for later.
   */
  private async sendDelivery(
    person: Person,
    item: { id: string; title: string },
    channel: AlertChannel,
    outbox: Outbox = ALERT_OUTBOX,
  ): Promise<SendOutcome | 'unavailable' | null> {
    const now = this.clock.now();
    if (this.notifier.available !== undefined && !this.notifier.available(channel)) {
      await this.pool.query(
        `UPDATE ${outbox.table} SET last_error = 'provider_unavailable'
          WHERE ${outbox.key} = $1 AND channel = $2 AND status IN ('held', 'pending')`,
        [item.id, channel],
      );
      return 'unavailable';
    }
    const token = randomUUID();
    if (this.notifier.idempotent !== true) {
      await this.pool.query(
        `UPDATE ${outbox.table} SET status = 'uncertain', claim_token = NULL, last_error = 'interrupted_send'
          WHERE ${outbox.key} = $1 AND channel = $2 AND status = 'sending' AND claimed_until <= $3`,
        [item.id, channel, now],
      );
    }
    const claimed = await this.pool.query<{ message_id: string; attempts: number }>(
      `UPDATE ${outbox.table}
          SET status = 'sending', claim_token = $3, claimed_until = $4, attempts = attempts + 1
        WHERE ${outbox.key} = $1 AND channel = $2 AND attempts < $5 AND ${livePersonCondition(6)}
          AND (
            (status IN ('held', 'pending') AND (claimed_until IS NULL OR claimed_until <= $7))
            OR (status = 'sending' AND claimed_until <= $7 AND $8::boolean)
            OR (status = 'uncertain' AND $8::boolean)
          )
        RETURNING message_id, attempts`,
      [item.id, channel, token, new Date(now.getTime() + DELIVERY_CLAIM_MS), DELIVERY_MAX_ATTEMPTS, person.authUserId, now, this.notifier.idempotent === true],
    );
    const row = claimed.rows[0];
    if (!row) return null;
    const outcome = await this.attemptSend(
      { channel, recipientAuthUserId: person.authUserId, alertItemId: item.id, title: item.title, kind: outbox.kind, messageId: row.message_id },
      row.attempts,
    );
    const finished = this.clock.now();
    const status = outcome === 'retry' ? 'pending' : outcome;
    await this.pool.query(
      `UPDATE ${outbox.table}
          SET status = $4,
              sent_at = CASE WHEN $4 = 'sent' THEN $5::timestamptz ELSE sent_at END,
              claim_token = NULL,
              claimed_until = CASE WHEN $4 = 'pending' THEN $6::timestamptz ELSE NULL END,
              last_error = CASE WHEN $4 = 'sent' THEN NULL ELSE $7 END
        WHERE ${outbox.key} = $1 AND channel = $2 AND claim_token = $3`,
      [item.id, channel, token, status, finished, new Date(finished.getTime() + deliveryBackoffMs(row.attempts)), outcome],
    );
    return outcome;
  }

  /** One provider call. A person whose deletion started is never sent to. */
  private async attemptSend(delivery: ChannelDelivery, attempts: number): Promise<SendOutcome> {
    if (!(await this.isLive(delivery.recipientAuthUserId))) return 'failed';
    try {
      await this.notifier.deliver(delivery);
      return 'sent';
    } catch (error) {
      if (sendOutcomeOf(error) === 'uncertain') return 'uncertain';
      return attempts >= DELIVERY_MAX_ATTEMPTS ? 'failed' : 'retry';
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
    const now = this.clock.now();
    // The digest row is the outbox entry: one per person, period and channel. No row for a person being deleted.
    await this.pool.query(
      `INSERT INTO digests (recipient_auth_user_id, period_start, channel, status, sent_at)
       SELECT $1, $2, 'email', 'pending', NULL WHERE ${livePersonCondition(1)}
       ON CONFLICT (recipient_auth_user_id, period_start, channel) DO NOTHING`,
      [person.authUserId, period],
    );
    if (this.notifier.available !== undefined && !this.notifier.available('email')) {
      // Not sent, and said so. The items keep no email row, so the next period's digest includes them.
      await this.pool.query(
        `UPDATE digests SET last_error = 'provider_unavailable'
          WHERE recipient_auth_user_id = $1 AND period_start = $2 AND channel = 'email' AND status = 'pending'`,
        [person.authUserId, period],
      );
      return false;
    }
    const idempotent = this.notifier.idempotent === true;
    if (!idempotent) {
      await this.pool.query(
        `UPDATE digests SET status = 'uncertain', claim_token = NULL, last_error = 'interrupted_send'
          WHERE recipient_auth_user_id = $1 AND period_start = $2 AND channel = 'email' AND status = 'sending' AND claimed_until <= $3`,
        [person.authUserId, period, now],
      );
    }
    const token = randomUUID();
    const claimed = await this.pool.query<{ id: string; message_id: string; attempts: number }>(
      `UPDATE digests SET status = 'sending', claim_token = $3, claimed_until = $4, attempts = attempts + 1
        WHERE recipient_auth_user_id = $1 AND period_start = $2 AND channel = 'email' AND attempts < $5 AND ${livePersonCondition(1)}
          AND (
            (status = 'pending' AND (claimed_until IS NULL OR claimed_until <= $6))
            OR (status IN ('sending', 'uncertain') AND (claimed_until IS NULL OR claimed_until <= $6) AND $7::boolean)
          )
        RETURNING id, message_id, attempts`,
      [person.authUserId, period, token, new Date(now.getTime() + DELIVERY_CLAIM_MS), DELIVERY_MAX_ATTEMPTS, now, idempotent],
    );
    const digest = claimed.rows[0];
    if (!digest) return false;
    const outcome = await this.attemptSend(
      {
        channel: 'email',
        recipientAuthUserId: person.authUserId,
        alertItemId: digest.id,
        title: `digest:${items.rows.length}`,
        kind: 'digest',
        messageId: digest.message_id,
      },
      digest.attempts,
    );
    const finished = this.clock.now();
    const status = outcome === 'retry' ? 'pending' : outcome;
    const acked = await this.pool.query(
      `UPDATE digests
          SET status = $3,
              sent_at = CASE WHEN $3 = 'sent' THEN $4::timestamptz ELSE NULL END,
              claim_token = NULL,
              claimed_until = CASE WHEN $3 = 'pending' THEN $5::timestamptz ELSE NULL END,
              last_error = CASE WHEN $3 = 'sent' THEN NULL ELSE $6 END
        WHERE id = $1 AND claim_token = $2`,
      [digest.id, token, status, finished, new Date(finished.getTime() + deliveryBackoffMs(digest.attempts)), outcome],
    );
    if (outcome !== 'sent' || acked.rowCount === 0) return false;
    for (const item of items.rows) {
      await this.pool.query(
        `INSERT INTO notification_deliveries (alert_item_id, channel, status, sent_at)
         SELECT $1, 'email', 'sent', $2 WHERE ${livePersonCondition(3)}
         ON CONFLICT (alert_item_id, channel) DO NOTHING`,
        [item.id, finished, person.authUserId],
      );
    }
    await this.pool.query(`UPDATE alert_settings SET last_digest_at = $2 WHERE candidate_auth_user_id = $1`, [
      person.authUserId,
      finished,
    ]);
    return true;
  }

  // --------------------------------------------------------------- reminders

  /**
   * In-app reminders with history. Refreshed on read, so a person sees their
   * reminders without waiting for the worker. Reminders never reserve an
   * alert item and never touch the usage ledger.
   */
  async reminders(owner: ProfileOwner): Promise<ReminderListView> {
    await this.refreshReminders(owner);
    const rows = await this.pool.query<ReminderRow>(
      `SELECT id, kind, title, due_date, link, read_at, created_at,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object('channel', d.channel, 'status', d.status, 'lastError', d.last_error) ORDER BY d.channel), '[]'::jsonb)
                 FROM reminder_deliveries d WHERE d.reminder_id = career_reminders.id) AS deliveries
         FROM career_reminders
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY due_date, created_at
        LIMIT 300`,
      [owner.workspaceId, owner.authUserId],
    );
    const today = this.today();
    const views = rows.rows.map(reminderView);
    return {
      upcoming: views.filter((item) => item.dueDate >= today),
      history: views.filter((item) => item.dueDate < today).reverse(),
      unread: views.filter((item) => !item.read && item.dueDate >= today).length,
    };
  }

  async markReminderRead(owner: ProfileOwner, reminderId: string): Promise<{ id: string; read: true }> {
    if (!UUID.test(reminderId)) throw new BillingError('not_found');
    const updated = await this.pool.query(
      `UPDATE career_reminders SET read_at = COALESCE(read_at, $4) WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
      [reminderId, owner.workspaceId, owner.authUserId, this.clock.now()],
    );
    if (updated.rowCount === 0) throw new BillingError('not_found');
    return { id: reminderId, read: true };
  }

  /**
   * Follow-up and interview dates from the V1 Jobs tracker, which lives in the
   * V1 service. The web reads them (read-only, as the dashboard does) and
   * passes the person's own dates here; only dates within the reminder lead
   * time are stored.
   */
  async syncTrackerReminders(owner: ProfileOwner, input: { items?: V1ReminderInput[] }): Promise<{ created: number }> {
    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length > REMINDER_SYNC_MAX) throw new BillingError('validation_error', { field: 'items', reason: 'too_many_items' });
    const today = this.today();
    let created = 0;
    for (const item of items) {
      const kind = item.kind === 'application_follow_up' || item.kind === 'interview' ? item.kind : null;
      const sourceKey = item.sourceKey?.trim() ?? '';
      const title = item.title?.trim() ?? '';
      const dueDate = item.dueDate?.trim().slice(0, 10) ?? '';
      if (!kind || sourceKey.length === 0 || sourceKey.length > 200 || title.length === 0 || !DAY.test(dueDate)) {
        throw new BillingError('validation_error', { field: 'items', reason: 'invalid' });
      }
      const link = item.link && item.link.startsWith('/') && item.link.length <= 500 ? item.link : null;
      if (!reminderDue(kind, dueDate, today)) continue;
      created += await this.insertReminder(owner, kind, `v1:${sourceKey}`, title.slice(0, 300), dueDate, link);
    }
    return { created };
  }

  /** The worker pass: refresh and deliver reminders for everyone who has a source of them. */
  async runReminders(): Promise<{ created: number; failed: number }> {
    const rows = await this.pool.query<{ auth_user_id: string; workspace_id: string; billing_account_id: string }>(
      `SELECT DISTINCT ON (people.auth_user_id) people.auth_user_id, people.workspace_id, b.id AS billing_account_id
         FROM (
           SELECT candidate_auth_user_id AS auth_user_id, workspace_id FROM saved_opportunities
           UNION SELECT candidate_auth_user_id, workspace_id FROM career_facts WHERE fact_type = 'certification'
           UNION SELECT candidate_auth_user_id, workspace_id FROM credential_reminders
           UNION SELECT candidate_auth_user_id, workspace_id FROM career_reminders
           UNION SELECT recipient_auth_user_id, workspace_id FROM alert_items
         ) people
         JOIN billing_accounts b ON b.workspace_id = people.workspace_id
        ORDER BY people.auth_user_id, b.id`,
    );
    let created = 0;
    let failed = 0;
    for (const row of rows.rows) {
      const person = { authUserId: row.auth_user_id, workspaceId: row.workspace_id, billingAccountId: row.billing_account_id };
      try {
        created += await this.refreshReminders(person);
        await this.deliverReminders(person);
      } catch {
        failed += 1;
      }
    }
    return { created, failed };
  }

  /** Stores reminders that have become due from saved or alerted listings, certifications and maintained credentials. */
  private async refreshReminders(person: Pick<Person, 'authUserId' | 'workspaceId'>): Promise<number> {
    const today = this.today();
    let created = 0;
    const listings = await this.pool.query<{ opportunity_id: string; title: string; deadline: string }>(
      `SELECT DISTINCT o.id AS opportunity_id, r.title, r.deadline
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE (o.candidate_auth_user_id IS NULL OR o.candidate_auth_user_id = $1)
          AND r.deadline IS NOT NULL AND r.deadline >= $2
          AND o.id IN (
            SELECT opportunity_id FROM saved_opportunities WHERE candidate_auth_user_id = $1
            UNION SELECT opportunity_id FROM alert_items WHERE recipient_auth_user_id = $1
          )`,
      [person.authUserId, today],
    );
    for (const row of listings.rows) {
      if (!reminderDue('listing_deadline', row.deadline, today)) continue;
      created += await this.insertReminder(person, 'listing_deadline', row.opportunity_id, row.title, row.deadline, `/career/opportunities/${row.opportunity_id}`);
    }
    const certifications = await this.pool.query<{ id: string; value: unknown }>(
      `SELECT id, value FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND fact_type = 'certification'`,
      [person.workspaceId, person.authUserId],
    );
    for (const row of certifications.rows) {
      const value = isRecord(row.value) ? row.value : {};
      const expiry = typeof value.expiryDate === 'string' ? value.expiryDate.slice(0, 10) : '';
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      if (!DAY.test(expiry) || name.length === 0 || !reminderDue('certification_expiry', expiry, today)) continue;
      created += await this.insertReminder(person, 'certification_expiry', row.id, name, expiry, '/career/profile');
    }
    const maintained = await this.pool.query<{ id: string; name: string; expires_on: string }>(
      `SELECT id, name, expires_on::text AS expires_on FROM credential_reminders WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [person.workspaceId, person.authUserId],
    );
    for (const row of maintained.rows) {
      if (!reminderDue('credential_maintenance', row.expires_on, today)) continue;
      created += await this.insertReminder(person, 'credential_maintenance', row.id, row.name, row.expires_on, '/career/maintenance');
    }
    return created;
  }

  private async insertReminder(
    person: Pick<Person, 'authUserId' | 'workspaceId'>,
    kind: ReminderKind,
    sourceKey: string,
    title: string,
    dueDate: string,
    link: string | null,
  ): Promise<number> {
    const inserted = await this.pool.query(
      `INSERT INTO career_reminders (workspace_id, candidate_auth_user_id, kind, source_key, title, due_date, link)
       SELECT $1, $2, $3, $4, $5, $6, $7 WHERE ${livePersonCondition(2)}
       ON CONFLICT (candidate_auth_user_id, kind, source_key, due_date) DO NOTHING`,
      [person.workspaceId, person.authUserId, kind, sourceKey.slice(0, 300), title.slice(0, 300), dueDate, link],
    );
    return inserted.rowCount ?? 0;
  }

  /** Off-box reminder delivery through the same honest outbox. Reminders use the person's enabled channels. */
  private async deliverReminders(person: Person): Promise<void> {
    if (!(await this.isLive(person.authUserId))) return;
    const ctx = await this.context(person);
    const settings = await this.readSettings(person.authUserId, ctx.planId);
    if (settings.view.paused) return;
    const quiet = inQuietHours(this.clock.now(), settings.view.quietStart, settings.view.quietEnd);
    const delivery = ALLOWANCES[ctx.planId].alertDelivery;
    const channels = CHANNELS.filter((channel) => settings.view[channel] && channelAllowed(delivery, channel));
    if (channels.length === 0) return;
    const due = await this.pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM career_reminders WHERE candidate_auth_user_id = $1 AND due_date >= $2`,
      [person.authUserId, this.today()],
    );
    for (const item of due.rows) {
      for (const channel of channels) await this.enqueue(REMINDER_OUTBOX, person, item, channel, quiet);
    }
  }

  // ----------------------------------------------------------------- matching

  /** Which saved search or followed company surfaces this listing, if any. */
  private trigger(listing: ListingRecord, searches: SearchRule[], companies: CompanyRule[], tier: AlertTier): Trigger | null {
    for (const search of searches) {
      if (!this.searchMatches(listing, search, tier)) continue;
      return {
        code: 'saved_search',
        searchId: search.id,
        searchLabel: search.label,
        companyId: null,
        companyName: null,
        relevance: alertTierAtLeast(tier, 'enhanced') ? search.filters.relevance : 'any',
      };
    }
    for (const company of companies) {
      if (companyMatches(listing.organization, company.names) === null) continue;
      if (company.roles.length > 0) {
        const title = ` ${foldText(listing.title)} `;
        if (!company.roles.some((role) => foldText(role).length > 0 && title.includes(` ${foldText(role)} `))) continue;
      }
      if (company.locations.length > 0 && !company.locations.some((place) => placeMatchesLocations(place, listing.locations))) continue;
      return { code: 'followed_company', searchId: null, searchLabel: null, companyId: company.id, companyName: company.name, relevance: 'any' };
    }
    return null;
  }

  private searchMatches(listing: ListingRecord, search: SearchRule, tier: AlertTier): boolean {
    if (search.category !== null && isFilterCategory(search.category)) {
      const column = filterCategoryColumn(search.category);
      const value = column === 'category' ? listing.category : column === 'schedule' ? listing.schedule : listing.arrangement;
      if (value !== search.category) return false;
    }
    if (search.q !== null) {
      const hay = `${listing.title} ${listing.organization} ${listing.description}`.toLowerCase();
      if (!hay.includes(search.q.toLowerCase())) return false;
    }
    if (search.place !== null) {
      // The radius is measured only when both sides have real coordinates; otherwise the place name must match.
      const { place, radiusMiles, latitude, longitude } = search.place;
      const measured =
        radiusMiles !== null && latitude !== null && longitude !== null && listing.latitude !== null && listing.longitude !== null
          ? distanceMiles({ latitude, longitude }, { latitude: listing.latitude, longitude: listing.longitude }) <= radiusMiles
          : null;
      if (measured === false) return false;
      if (measured === null && !placeMatchesLocations(place, listing.locations)) return false;
    }
    if (!alertTierAtLeast(tier, 'personalized')) return true;
    const f = search.filters;
    if (f.workSchedule !== null && listing.schedule !== f.workSchedule) return false;
    if (f.seniority !== null && listing.seniority !== f.seniority) return false;
    if (f.arrangement !== null && listing.arrangement !== f.arrangement) return false;
    if (f.minPay !== null) {
      const top = listing.compensation.maximum ?? listing.compensation.minimum;
      if (top === null || top < f.minPay) return false;
      if (f.payCurrency !== null && listing.compensation.currency !== f.payCurrency) return false;
      if (f.payPeriod !== null && listing.compensation.period !== f.payPeriod) return false;
    }
    return true;
  }

  private async searchRules(person: Person): Promise<SearchRule[]> {
    const rows = await this.pool.query<SearchRecord>(
      `SELECT id, filters, location_profile_id, radius_miles, schedule, paused FROM saved_searches
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND paused = false ORDER BY created_at`,
      [person.workspaceId, person.authUserId],
    );
    const places = new Map((await this.locationRows(person)).map((row) => [row.id, row]));
    const rules: SearchRule[] = [];
    for (const row of rows.rows) {
      const stored = isRecord(row.filters) ? row.filters : {};
      const q = typeof stored.q === 'string' && stored.q.trim().length > 0 ? stored.q.trim() : null;
      const category = typeof stored.category === 'string' && stored.category.trim().length > 0 ? stored.category.trim() : null;
      const location = row.location_profile_id ? places.get(row.location_profile_id) : undefined;
      if (q === null && category === null && !location) continue;
      rules.push({
        id: row.id,
        label: q ?? category ?? location?.place ?? '',
        q,
        category,
        filters: filtersOf(stored),
        place: location
          ? {
              place: location.place,
              radiusMiles: row.radius_miles ?? location.radius_miles,
              latitude: location.latitude,
              longitude: location.longitude,
            }
          : null,
      });
    }
    return rules;
  }

  private async companyRules(person: Person): Promise<CompanyRule[]> {
    const rows = await this.pool.query<CompanyRow>(
      `SELECT id, name, source_url, aliases, roles, locations FROM followed_companies
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [person.workspaceId, person.authUserId],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      names: [row.name, ...(row.aliases ?? [])],
      roles: row.roles ?? [],
      locations: row.locations ?? [],
    }));
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

  // ------------------------------------------------------------------ helpers

  private async context(
    owner: Pick<ProfileOwner, 'billingAccountId'>,
  ): Promise<{ account: AccountRow; snapshot: CatalogSnapshot; planId: PlanId; tier: AlertTier }> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const planId = this.planId(snapshot, account);
    // The alert level is read from the account's catalog version, like every other allowance.
    const tier = (snapshot.allowances[planId]?.alertIntelligence ?? ALLOWANCES[planId].alertIntelligence) as AlertTier;
    return { account, snapshot, planId, tier };
  }

  private planId(snapshot: CatalogSnapshot, account: AccountRow): PlanId {
    try {
      return v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return 'professional';
    }
  }

  /**
   * Personalized filters need Starter's alert level and a relevance threshold
   * needs Enhanced (it reads fit). Asking for one above the plan is refused
   * with the plan that includes it, never stored and ignored.
   */
  private parseFilters(
    input: Partial<Record<keyof SavedSearchFilters, unknown>>,
    tier: AlertTier,
    current: SavedSearchFilters,
  ): SavedSearchFilters {
    const next: SavedSearchFilters = { ...current };
    const need = (minimum: AlertTier) => {
      if (!alertTierAtLeast(tier, minimum)) {
        throw new BillingError('plan_upgrade_required', { feature: 'alertIntelligence', minimumPlan: alertTierMinimumPlan(minimum) });
      }
    };
    const present = (key: keyof SavedSearchFilters) => input[key] !== undefined && input[key] !== null && input[key] !== '';
    if (input.minPay !== undefined) {
      if (input.minPay === null || input.minPay === '') next.minPay = null;
      else {
        if (typeof input.minPay !== 'number' || !Number.isFinite(input.minPay) || input.minPay < 0) {
          throw new BillingError('validation_error', { field: 'minPay', reason: 'invalid' });
        }
        need('personalized');
        next.minPay = input.minPay;
      }
    }
    if (input.payCurrency !== undefined) {
      const value = typeof input.payCurrency === 'string' ? input.payCurrency.trim().toUpperCase() : '';
      if (value.length > 0 && !/^[A-Z]{3}$/.test(value)) throw new BillingError('validation_error', { field: 'payCurrency', reason: 'invalid' });
      next.payCurrency = value.length > 0 ? value : null;
    }
    if (input.payPeriod !== undefined) {
      const value = typeof input.payPeriod === 'string' ? input.payPeriod.trim() : '';
      if (value.length > 0 && !['hour', 'day', 'week', 'month', 'year'].includes(value)) {
        throw new BillingError('validation_error', { field: 'payPeriod', reason: 'invalid' });
      }
      next.payPeriod = value.length > 0 ? value : null;
    }
    if (input.workSchedule !== undefined) {
      if (present('workSchedule') && !isListingSchedule(input.workSchedule)) throw new BillingError('validation_error', { field: 'workSchedule', reason: 'invalid' });
      if (present('workSchedule')) need('personalized');
      next.workSchedule = isListingSchedule(input.workSchedule) ? input.workSchedule : null;
    }
    if (input.seniority !== undefined) {
      if (present('seniority') && !isListingSeniority(input.seniority)) throw new BillingError('validation_error', { field: 'seniority', reason: 'invalid' });
      if (present('seniority')) need('personalized');
      next.seniority = isListingSeniority(input.seniority) ? input.seniority : null;
    }
    if (input.arrangement !== undefined) {
      if (present('arrangement') && !isListingArrangement(input.arrangement)) throw new BillingError('validation_error', { field: 'arrangement', reason: 'invalid' });
      if (present('arrangement')) need('personalized');
      next.arrangement = isListingArrangement(input.arrangement) ? input.arrangement : null;
    }
    if (input.relevance !== undefined) {
      const value = input.relevance === null || input.relevance === '' ? 'any' : input.relevance;
      if (typeof value !== 'string' || !(RELEVANCE_THRESHOLDS as readonly string[]).includes(value)) {
        throw new BillingError('validation_error', { field: 'relevance', reason: 'invalid' });
      }
      if (value !== 'any') need('enhanced');
      next.relevance = value as RelevanceThreshold;
    }
    return next;
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

  private async locationRows(owner: Pick<Person, 'authUserId' | 'workspaceId'>): Promise<LocationRow[]> {
    const rows = await this.pool.query<LocationRow>(
      `SELECT id, place, radius_miles, latitude, longitude, geocoded_label FROM location_profiles
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    return rows.rows;
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

  private searchView(row: SearchRecord, tier: AlertTier, places: LocationRow[]): SavedSearchView {
    const stored = isRecord(row.filters) ? row.filters : {};
    const filters = filtersOf(stored);
    const inactive: Array<keyof SavedSearchFilters> = [];
    if (!alertTierAtLeast(tier, 'personalized')) {
      if (filters.minPay !== null) inactive.push('minPay');
      if (filters.workSchedule !== null) inactive.push('workSchedule');
      if (filters.seniority !== null) inactive.push('seniority');
      if (filters.arrangement !== null) inactive.push('arrangement');
    }
    if (!alertTierAtLeast(tier, 'enhanced') && filters.relevance !== 'any') inactive.push('relevance');
    const place = row.location_profile_id ? places.find((item) => item.id === row.location_profile_id) : undefined;
    return {
      id: row.id,
      q: typeof stored.q === 'string' ? stored.q : null,
      category: typeof stored.category === 'string' ? stored.category : null,
      locationProfileId: row.location_profile_id,
      radiusMiles: row.radius_miles,
      schedule: isSchedule(row.schedule) ? row.schedule : 'weekly',
      paused: row.paused,
      filters,
      inactiveFilters: inactive,
      locationMode: place ? (place.latitude !== null && place.longitude !== null ? 'radius_or_name' : 'name') : null,
    };
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

interface LocationRow {
  id: string;
  place: string;
  radius_miles: number;
  latitude: number | null;
  longitude: number | null;
  geocoded_label: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  source_url: string | null;
  aliases: string[] | null;
  roles: string[] | null;
  locations: string[] | null;
}

interface ReminderRow {
  id: string;
  kind: string;
  title: string;
  due_date: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
  deliveries: unknown;
}

/**
 * The shared location writer names a too-wide radius `exceeds_plan_radius_cap`;
 * the alerts API has always answered `above_plan` with `limit`, and the
 * released mobile app shows "up to N miles" from exactly that. Keep it.
 */
async function alertsLocationContract<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isBillingError(error, 'validation_error') && error.details?.field === 'radiusMiles') {
      const details = error.details as Record<string, unknown>;
      if (details.reason === 'exceeds_plan_radius_cap') {
        throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'above_plan', limit: details.limit });
      }
      if (details.reason === 'invalid_radius') {
        throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid' });
      }
    }
    throw error;
  }
}

function locationView(row: LocationRow): LocationProfileView {
  return {
    id: row.id,
    place: row.place,
    radiusMiles: row.radius_miles,
    hasCoordinates: row.latitude !== null && row.longitude !== null,
    geocodedLabel: row.geocoded_label,
  };
}

function companyView(row: CompanyRow): FollowedCompanyView {
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    aliases: row.aliases ?? [],
    roles: row.roles ?? [],
    locations: row.locations ?? [],
  };
}

function reminderView(row: ReminderRow): ReminderView {
  return {
    id: row.id,
    kind: (REMINDER_KINDS as readonly string[]).includes(row.kind) ? (row.kind as ReminderKind) : 'listing_deadline',
    title: row.title,
    dueDate: row.due_date,
    link: row.link,
    read: row.read_at !== null,
    createdAt: row.created_at.toISOString(),
    deliveries: deliveriesOf(row.deliveries),
  };
}

/** Aliases, roles and places for a followed company: short trimmed lists, or null when not given. */
function companyLists(input: { aliases?: unknown; roles?: unknown; locations?: unknown }): {
  aliases: string[] | null;
  roles: string[] | null;
  locations: string[] | null;
} {
  const list = (value: unknown, field: string): string[] | null => {
    if (value === undefined) return null;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new BillingError('validation_error', { field, reason: 'invalid' });
    }
    const items = [...new Set((value as string[]).map((item) => item.trim()).filter((item) => item.length > 0))];
    if (items.length > COMPANY_LIST_MAX || items.some((item) => item.length > 100)) {
      throw new BillingError('validation_error', { field, reason: 'too_many_items' });
    }
    return items;
  };
  return { aliases: list(input.aliases, 'aliases'), roles: list(input.roles, 'roles'), locations: list(input.locations, 'locations') };
}

function emptyFilters(): SavedSearchFilters {
  return { minPay: null, payCurrency: null, payPeriod: null, workSchedule: null, seniority: null, arrangement: null, relevance: 'any' };
}

function filtersOf(stored: Record<string, unknown>): SavedSearchFilters {
  return {
    minPay: typeof stored.minPay === 'number' && Number.isFinite(stored.minPay) ? stored.minPay : null,
    payCurrency: typeof stored.payCurrency === 'string' ? stored.payCurrency : null,
    payPeriod: typeof stored.payPeriod === 'string' ? stored.payPeriod : null,
    workSchedule: isListingSchedule(stored.workSchedule) ? stored.workSchedule : null,
    seniority: isListingSeniority(stored.seniority) ? stored.seniority : null,
    arrangement: isListingArrangement(stored.arrangement) ? stored.arrangement : null,
    relevance:
      typeof stored.relevance === 'string' && (RELEVANCE_THRESHOLDS as readonly string[]).includes(stored.relevance)
        ? (stored.relevance as RelevanceThreshold)
        : 'any',
  };
}

const LABELS: readonly string[] = ['strong_fit', 'possible_fit', 'stretch', 'expired'];
const LABEL_REASONS: readonly string[] = ['skills_overlap', 'little_overlap', 'no_overlap', 'credential_missing', 'preference_conflict', 'expired'];
const TIERS: readonly string[] = ['basic', 'personalized', 'enhanced', 'advanced', 'organization'];

/** Reads a stored reason. Items surfaced before tiers existed carried fit for every plan, so they read as Enhanced. */
function reasonOf(value: unknown): AlertReasonView {
  const record = isRecord(value) ? value : {};
  const code =
    record.code === 'saved_search' || record.code === 'followed_company' || record.code === 'material_update' ? record.code : 'saved_search';
  const fit =
    record.fit === 'blocked' || record.fit === 'none' || record.fit === 'partial' || record.fit === 'strong' ? record.fit : null;
  const text = (key: string) => (typeof record[key] === 'string' && (record[key] as string).length > 0 ? (record[key] as string) : null);
  const advanced = isRecord(record.advanced)
    ? {
        targetRole: typeof record.advanced.targetRole === 'string' ? record.advanced.targetRole : null,
        promotionGoal: typeof record.advanced.promotionGoal === 'string' ? record.advanced.promotionGoal : null,
        learningPlanId: typeof record.advanced.learningPlanId === 'string' ? record.advanced.learningPlanId : null,
        actionPackId: typeof record.advanced.actionPackId === 'string' ? record.advanced.actionPackId : null,
      }
    : null;
  return {
    code,
    tier: typeof record.tier === 'string' && TIERS.includes(record.tier) ? (record.tier as AlertTier) : 'enhanced',
    searchId: text('searchId'),
    searchLabel: text('searchLabel'),
    companyId: text('companyId'),
    companyName: text('companyName'),
    fit,
    label: typeof record.label === 'string' && LABELS.includes(record.label) ? (record.label as MatchLabel) : null,
    labelReasons: strings(record.labelReasons).filter((item): item is MatchLabelReason => LABEL_REASONS.includes(item)),
    gaps: strings(record.gaps).slice(0, 5),
    advanced,
  };
}

function deliveriesOf(value: unknown): DeliveryView[] {
  if (!Array.isArray(value)) return [];
  const statuses = ['held', 'pending', 'sending', 'sent', 'uncertain', 'failed'];
  const out: DeliveryView[] = [];
  for (const item of value) {
    if (!isRecord(item) || !CHANNELS.includes(item.channel as AlertChannel) || !statuses.includes(String(item.status))) continue;
    out.push({
      channel: item.channel as AlertChannel,
      status: item.status as DeliveryView['status'],
      lastError: typeof item.lastError === 'string' ? item.lastError : null,
    });
  }
  return out;
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

function compensationOf(value: unknown): ListingCompensation {
  if (!isRecord(value)) return { minimum: null, maximum: null, currency: null, period: null };
  const number = (item: unknown) => (typeof item === 'number' && Number.isFinite(item) ? item : null);
  return {
    minimum: number(value.minimum),
    maximum: number(value.maximum),
    currency: typeof value.currency === 'string' ? value.currency : null,
    period: typeof value.period === 'string' ? value.period : null,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
