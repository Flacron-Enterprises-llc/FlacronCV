import type { Pool } from 'pg';
import {
  LICENSE_TRANSFERS,
  LOCATION_KINDS,
  LOCATION_NOTES_MAX,
  LOCATION_PLACE_MAX,
  MAX_ACTIVE_MODES,
  REMOTE_FLEXIBILITIES,
  REMOTE_REGION_MAX,
  SPECIALIST_MODES,
  TARGET_TIMELINES,
  WORK_AUTHORIZATIONS,
  buildModeContext,
  isSpecialistMode,
  locationDateProblem,
} from '@flacroncv/career-shared';
import type {
  CandidateSpecialistMode,
  CreateLocationProfileInput,
  LicenseTransfer,
  LocationKind,
  LocationProfile,
  LocationProfileList,
  ModeContext,
  RemoteFlexibility,
  SpecialistMode,
  TargetTimeline,
  UpdateLocationProfileInput,
  UpdateSpecialistModeInput,
  WorkAuthorization,
} from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { withTransaction, type Db } from '../billing/db';
import { BillingError, isBillingError } from '../billing/errors';
import { capacityLimit, minimumPlanForField, requireFeature } from '../metering/access';
import type { Geocoder } from '../maps/geocoder';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GUIDELINES_MAX = 2000;
const FOCUS_MAX_ITEMS = 12;
const FOCUS_ITEM_MAX = 80;
const COMMUTE_MAX_MINUTES = 240;

interface LocationProfileRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  place: string;
  radius_miles: number;
  kind: LocationKind | null;
  target_timeline: TargetTimeline;
  is_relocation: boolean;
  move_date: string | null;
  available_from: string | null;
  remote_region: string | null;
  work_authorization: WorkAuthorization;
  license_transfer: LicenseTransfer | null;
  commute_minutes_max: number;
  remote_flexibility: RemoteFlexibility;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SpecialistModeRow {
  candidate_auth_user_id: string;
  workspace_id: string;
  mode: SpecialistMode | null;
  modes: unknown;
  focus_areas: unknown;
  custom_guidelines: string | null;
  updated_at: Date | string;
}

/** Date columns come back as text so a date never shifts with the server's time zone. */
const LOCATION_COLUMNS = `id, workspace_id, candidate_auth_user_id, place, radius_miles, kind, target_timeline, is_relocation,
  move_date::text AS move_date, available_from::text AS available_from, remote_region, work_authorization,
  license_transfer, commute_minutes_max, remote_flexibility, notes, created_at, updated_at`;

function mapLocationRow(row: LocationProfileRow): LocationProfile {
  const kind: LocationKind = row.kind ?? (row.is_relocation ? 'future' : 'current');
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    candidateAuthUserId: row.candidate_auth_user_id,
    place: row.place,
    radiusMiles: row.radius_miles,
    kind,
    targetTimeline: row.target_timeline ?? 'not_relocating',
    isRelocation: kind === 'future',
    moveDate: row.move_date,
    availableFrom: row.available_from,
    remoteRegion: row.remote_region,
    // Never assumed: a missing value is "not stated", not "authorized".
    workAuthorization: row.work_authorization ?? 'not_stated',
    licenseTransfer: row.license_transfer ?? 'not_stated',
    commuteMinutesMax: row.commute_minutes_max ?? 45,
    remoteFlexibility: row.remote_flexibility ?? 'hybrid',
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString(),
  };
}

interface LocationPlan {
  account: AccountRow;
  snapshot: CatalogSnapshot;
  planId: string;
  /** Null when the plan does not include location profiles. */
  capacity: number | null;
  allowedRadiusMiles: number;
}

async function locationPlan(db: Db, owner: ProfileOwner, catalogs: CatalogStore): Promise<LocationPlan> {
  const account = await readAccount(db, owner.billingAccountId);
  const snapshot = await catalogs.get(db, account.catalog_version);
  let planId = 'free';
  try {
    planId = v2PlanOf(snapshot, account);
  } catch (error) {
    if (!isBillingError(error, 'not_found')) throw error;
  }
  const allowances = snapshot.allowances[planId as keyof typeof snapshot.allowances];
  // Plan allowance plus recurring "extra location" add-ons (spec section 9). Extras keep the plan's radius.
  const capacity = capacityLimit(snapshot, { ...account, plan_id: planId }, 'locationProfiles');
  return { account, snapshot, planId, capacity, allowedRadiusMiles: allowances.localRadiusMiles ?? 25 };
}

function radiusOrThrow(value: unknown, allowedRadiusMiles: number): number {
  const radius = Number(value);
  if (!Number.isInteger(radius) || radius < 0) {
    throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid_radius' });
  }
  if (radius > allowedRadiusMiles) {
    throw new BillingError('validation_error', {
      field: 'radiusMiles',
      reason: 'exceeds_plan_radius_cap',
      maxAllowed: allowedRadiusMiles,
      limit: allowedRadiusMiles,
    });
  }
  return radius;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BillingError('validation_error', { field, reason: 'invalid' });
  }
  return value as T;
}

function placeOrThrow(value: unknown): string {
  const place = typeof value === 'string' ? value.trim() : '';
  if (!place || place.length > LOCATION_PLACE_MAX) {
    throw new BillingError('validation_error', { field: 'place', reason: 'invalid_length' });
  }
  return place;
}

function optionalText(value: unknown, max: number, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BillingError('validation_error', { field, reason: 'invalid' });
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max) throw new BillingError('validation_error', { field, reason: 'invalid_length' });
  return text;
}

function commuteOrThrow(value: unknown): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > COMMUTE_MAX_MINUTES) {
    throw new BillingError('validation_error', { field: 'commuteMinutesMax', reason: 'invalid' });
  }
  return Math.round(minutes);
}

function datesOrThrow(input: { moveDate?: string | null; availableFrom?: string | null }): void {
  const bad = locationDateProblem(input);
  if (bad) throw new BillingError('validation_error', { field: bad, reason: 'invalid_date' });
}

interface GeoPoint {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Coordinates for a place from the geocoding adapter, so alert and search
 * radii can be measured. Null when no adapter is passed, it is not configured,
 * or it finds nothing: a place without coordinates is matched by name, and a
 * point is never invented.
 */
async function geocodePlace(geocoder: Geocoder | undefined, place: string): Promise<GeoPoint | null> {
  if (!geocoder) return null;
  try {
    const hit = await geocoder.lookup(place);
    return hit ? { latitude: hit.latitude, longitude: hit.longitude, label: hit.label } : null;
  } catch (error) {
    if (isBillingError(error, 'provider_unavailable')) return null;
    throw error;
  }
}

/**
 * One row lock per candidate while a location is written, so two concurrent
 * creates cannot both pass the capacity check.
 */
async function lockCandidate(db: Db, owner: ProfileOwner): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`location_profiles:${owner.workspaceId}:${owner.authUserId}`]);
}

async function ownedLocationRow(db: Db, owner: ProfileOwner, id: string): Promise<LocationProfileRow> {
  if (!UUID.test(id)) throw new BillingError('not_found', { entity: 'location_profile', id });
  const res = await db.query<LocationProfileRow>(
    `SELECT ${LOCATION_COLUMNS} FROM location_profiles WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
    [id, owner.workspaceId, owner.authUserId],
  );
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { entity: 'location_profile', id });
  return row;
}

// ---------------------------------------------------------------------------
// The single writer for `location_profiles`. Alerts and career modes both call
// these, so plan radius, capacity (plan + purchased extras), feature switch and
// the "never assume authorization" default apply the same way everywhere.

export async function listLocationProfiles(pool: Pool, owner: ProfileOwner, catalogs: CatalogStore = new CatalogStore()): Promise<LocationProfileList> {
  const plan = await locationPlan(pool, owner, catalogs);
  const res = await pool.query<LocationProfileRow>(
    `SELECT ${LOCATION_COLUMNS} FROM location_profiles
      WHERE workspace_id = $1 AND candidate_auth_user_id = $2
      ORDER BY kind, created_at, id`,
    [owner.workspaceId, owner.authUserId],
  );
  return { items: res.rows.map(mapLocationRow), capacity: plan.capacity ?? 0, allowedRadiusMiles: plan.allowedRadiusMiles };
}

export async function getLocationProfile(db: Db, owner: ProfileOwner, id: string): Promise<LocationProfile> {
  return mapLocationRow(await ownedLocationRow(db, owner, id));
}

export async function createLocationProfile(
  pool: Pool,
  owner: ProfileOwner,
  input: CreateLocationProfileInput,
  catalogs: CatalogStore = new CatalogStore(),
  geocoder?: Geocoder,
): Promise<LocationProfile> {
  const place = placeOrThrow(input.place);
  if (input.radiusMiles === undefined || input.radiusMiles === null) {
    throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'required' });
  }
  datesOrThrow(input);
  let point: GeoPoint | null = null;
  if (geocoder) {
    // Cheap plan checks first so a refused write never spends a geocoding
    // call; the lookup itself runs outside the transaction so no row lock is
    // held across a network request. The transaction below re-checks.
    const precheck = await locationPlan(pool, owner, catalogs);
    await requireFeature(pool, precheck.snapshot, 'locationProfiles');
    if (precheck.capacity !== null) radiusOrThrow(input.radiusMiles, precheck.allowedRadiusMiles);
    point = await geocodePlace(geocoder, place);
  }
  const kind: LocationKind = input.kind !== undefined ? oneOf(input.kind, LOCATION_KINDS, 'kind') : input.isRelocation ? 'future' : 'current';
  const timeline = input.targetTimeline !== undefined ? oneOf(input.targetTimeline, TARGET_TIMELINES, 'targetTimeline') : 'not_relocating';
  const authorization = input.workAuthorization !== undefined ? oneOf(input.workAuthorization, WORK_AUTHORIZATIONS, 'workAuthorization') : 'not_stated';
  const license = input.licenseTransfer !== undefined ? oneOf(input.licenseTransfer, LICENSE_TRANSFERS, 'licenseTransfer') : 'not_stated';
  const remote = input.remoteFlexibility !== undefined ? oneOf(input.remoteFlexibility, REMOTE_FLEXIBILITIES, 'remoteFlexibility') : 'hybrid';
  const commute = input.commuteMinutesMax !== undefined ? commuteOrThrow(input.commuteMinutesMax) : 45;
  const notes = optionalText(input.notes, LOCATION_NOTES_MAX, 'notes');
  const remoteRegion = optionalText(input.remoteRegion, REMOTE_REGION_MAX, 'remoteRegion');

  return withTransaction(pool, async (db) => {
    const plan = await locationPlan(db, owner, catalogs);
    await requireFeature(db, plan.snapshot, 'locationProfiles');
    if (plan.capacity === null) {
      throw new BillingError('plan_upgrade_required', { feature: 'locationProfiles', minimumPlan: minimumPlanForField(plan.snapshot, 'locationProfiles') });
    }
    const radius = radiusOrThrow(input.radiusMiles, plan.allowedRadiusMiles);
    await lockCandidate(db, owner);
    const used = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM location_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const count = used.rows[0]?.n ?? 0;
    if (count + 1 > plan.capacity) {
      throw new BillingError('capacity_exceeded', { field: 'locationProfiles', limit: plan.capacity, used: count });
    }
    const res = await db.query<LocationProfileRow>(
      `INSERT INTO location_profiles
         (workspace_id, candidate_auth_user_id, place, radius_miles, kind, target_timeline, is_relocation,
          move_date, available_from, remote_region, work_authorization, license_transfer,
          commute_minutes_max, remote_flexibility, notes, latitude, longitude, geocoded_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING ${LOCATION_COLUMNS}`,
      [
        owner.workspaceId,
        owner.authUserId,
        place,
        radius,
        kind,
        timeline,
        kind === 'future',
        input.moveDate ?? null,
        input.availableFrom ?? null,
        remoteRegion,
        authorization,
        license,
        commute,
        remote,
        notes,
        point?.latitude ?? null,
        point?.longitude ?? null,
        point?.label ?? null,
      ],
    );
    return mapLocationRow(res.rows[0]);
  });
}

/**
 * Changes a place. Saved applications and searches keep pointing at the same
 * row id, so a destination change updates future matching only. A radius
 * that the plan no longer allows (after a downgrade) must come down before
 * any other change is saved.
 */
export async function updateLocationProfile(
  pool: Pool,
  owner: ProfileOwner,
  id: string,
  input: UpdateLocationProfileInput,
  catalogs: CatalogStore = new CatalogStore(),
  geocoder?: Geocoder,
): Promise<LocationProfile> {
  const existing = mapLocationRow(await ownedLocationRow(pool, owner, id));
  const plan = await locationPlan(pool, owner, catalogs);
  const place = input.place !== undefined ? placeOrThrow(input.place) : existing.place;
  const radius = radiusOrThrow(input.radiusMiles !== undefined ? input.radiusMiles : existing.radiusMiles, plan.allowedRadiusMiles);
  datesOrThrow(input);
  // A renamed place must not keep the old point: the radius would be measured
  // from the wrong city. It gets the new place's coordinates, or none (matched
  // by name) when no geocoder is configured or it finds nothing.
  const placeChanged = place !== existing.place;
  const point = placeChanged ? await geocodePlace(geocoder, place) : null;
  const kind: LocationKind =
    input.kind !== undefined
      ? oneOf(input.kind, LOCATION_KINDS, 'kind')
      : input.isRelocation !== undefined
        ? input.isRelocation
          ? 'future'
          : 'current'
        : existing.kind;
  const res = await pool.query<LocationProfileRow>(
    `UPDATE location_profiles
        SET place = $1, radius_miles = $2, kind = $3, is_relocation = $4, target_timeline = $5,
            move_date = $6, available_from = $7, remote_region = $8, work_authorization = $9,
            license_transfer = $10, commute_minutes_max = $11, remote_flexibility = $12, notes = $13,
            latitude = CASE WHEN $17::boolean THEN $18::double precision ELSE latitude END,
            longitude = CASE WHEN $17::boolean THEN $19::double precision ELSE longitude END,
            geocoded_label = CASE WHEN $17::boolean THEN $20::text ELSE geocoded_label END,
            updated_at = now()
      WHERE id = $14 AND workspace_id = $15 AND candidate_auth_user_id = $16
      RETURNING ${LOCATION_COLUMNS}`,
    [
      place,
      radius,
      kind,
      kind === 'future',
      input.targetTimeline !== undefined ? oneOf(input.targetTimeline, TARGET_TIMELINES, 'targetTimeline') : existing.targetTimeline,
      input.moveDate !== undefined ? input.moveDate : existing.moveDate,
      input.availableFrom !== undefined ? input.availableFrom : existing.availableFrom,
      input.remoteRegion !== undefined ? optionalText(input.remoteRegion, REMOTE_REGION_MAX, 'remoteRegion') : existing.remoteRegion,
      input.workAuthorization !== undefined ? oneOf(input.workAuthorization, WORK_AUTHORIZATIONS, 'workAuthorization') : existing.workAuthorization,
      input.licenseTransfer !== undefined ? oneOf(input.licenseTransfer, LICENSE_TRANSFERS, 'licenseTransfer') : existing.licenseTransfer,
      input.commuteMinutesMax !== undefined ? commuteOrThrow(input.commuteMinutesMax) : existing.commuteMinutesMax,
      input.remoteFlexibility !== undefined ? oneOf(input.remoteFlexibility, REMOTE_FLEXIBILITIES, 'remoteFlexibility') : existing.remoteFlexibility,
      input.notes !== undefined ? optionalText(input.notes, LOCATION_NOTES_MAX, 'notes') : existing.notes,
      id,
      owner.workspaceId,
      owner.authUserId,
      placeChanged,
      point?.latitude ?? null,
      point?.longitude ?? null,
      point?.label ?? null,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new BillingError('not_found', { entity: 'location_profile', id });
  return mapLocationRow(row);
}

/** Saved searches that used the place keep running without it. */
export async function deleteLocationProfile(pool: Pool, owner: ProfileOwner, id: string): Promise<void> {
  await withTransaction(pool, async (db) => {
    await ownedLocationRow(db, owner, id);
    await db.query(`UPDATE saved_searches SET location_profile_id = NULL WHERE location_profile_id = $1`, [id]);
    await db.query(`DELETE FROM location_profiles WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`, [
      id,
      owner.workspaceId,
      owner.authUserId,
    ]);
  });
}

async function readModeRow(db: Db, owner: ProfileOwner): Promise<SpecialistModeRow | null> {
  const res = await db.query<SpecialistModeRow>(
    `SELECT * FROM candidate_specialist_modes WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
    [owner.workspaceId, owner.authUserId],
  );
  return res.rows[0] ?? null;
}

function modesOf(row: SpecialistModeRow | null): SpecialistMode[] {
  if (!row) return [];
  const stored = Array.isArray(row.modes) ? row.modes.filter(isSpecialistMode) : [];
  if (stored.length > 0) return stored;
  return row.mode && isSpecialistMode(row.mode) ? [row.mode] : [];
}

/**
 * The mode context for generators and searches (spec section 29: modes
 * configure wording and constraints, not separate profiles). Free to read,
 * charges nothing and grants nothing: callers still meter their own work.
 * On a plan without specialist modes the modes list is empty, but the
 * truthfulness rules and the person's location constraints still apply.
 */
export async function readModeContext(pool: Pool, owner: ProfileOwner, catalogs: CatalogStore = new CatalogStore()): Promise<ModeContext> {
  const account = await readAccount(pool, owner.billingAccountId);
  const snapshot = await catalogs.get(pool, account.catalog_version);
  let modesAllowed = false;
  try {
    modesAllowed = snapshot.allowances[v2PlanOf(snapshot, account)].specialistModes;
  } catch (error) {
    if (!isBillingError(error, 'not_found')) throw error;
  }
  const row = await readModeRow(pool, owner);
  const locations = await pool.query<LocationProfileRow>(
    `SELECT ${LOCATION_COLUMNS} FROM location_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at, id`,
    [owner.workspaceId, owner.authUserId],
  );
  return buildModeContext({
    modes: modesAllowed ? modesOf(row) : [],
    focusAreas: modesAllowed && Array.isArray(row?.focus_areas) ? (row?.focus_areas as string[]) : [],
    customGuidelines: modesAllowed ? row?.custom_guidelines ?? null : null,
    locations: locations.rows.map(mapLocationRow),
  });
}

export class CareerModesService {
  constructor(
    private readonly pool: Pool,
    private readonly catalogs: CatalogStore = new CatalogStore(),
    /** Optional: gives places coordinates so radii can be measured (alerts, searches). */
    private readonly geocoder?: Geocoder,
  ) {}

  listLocations(owner: ProfileOwner): Promise<LocationProfileList> {
    return listLocationProfiles(this.pool, owner, this.catalogs);
  }

  getLocation(owner: ProfileOwner, id: string): Promise<LocationProfile> {
    return getLocationProfile(this.pool, owner, id);
  }

  createLocation(owner: ProfileOwner, input: CreateLocationProfileInput): Promise<LocationProfile> {
    return createLocationProfile(this.pool, owner, input, this.catalogs, this.geocoder);
  }

  updateLocation(owner: ProfileOwner, id: string, input: UpdateLocationProfileInput): Promise<LocationProfile> {
    return updateLocationProfile(this.pool, owner, id, input, this.catalogs, this.geocoder);
  }

  deleteLocation(owner: ProfileOwner, id: string): Promise<void> {
    return deleteLocationProfile(this.pool, owner, id);
  }

  modeContext(owner: ProfileOwner): Promise<ModeContext> {
    return readModeContext(this.pool, owner, this.catalogs);
  }

  private async modesAllowed(owner: ProfileOwner): Promise<boolean> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    try {
      return snapshot.allowances[v2PlanOf(snapshot, account)].specialistModes;
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return false;
    }
  }

  async getSpecialistMode(owner: ProfileOwner): Promise<CandidateSpecialistMode & { available: boolean }> {
    const [row, available] = await Promise.all([readModeRow(this.pool, owner), this.modesAllowed(owner)]);
    const modes = modesOf(row);
    return {
      candidateAuthUserId: owner.authUserId,
      workspaceId: owner.workspaceId,
      mode: modes[0] ?? null,
      modes,
      focusAreas: Array.isArray(row?.focus_areas) ? (row?.focus_areas as string[]) : [],
      customGuidelines: row?.custom_guidelines ?? null,
      updatedAt: new Date(row?.updated_at ?? Date.now()).toISOString(),
      available,
    };
  }

  async setSpecialistMode(owner: ProfileOwner, input: UpdateSpecialistModeInput): Promise<CandidateSpecialistMode & { available: boolean }> {
    if (!(await this.modesAllowed(owner))) {
      throw new BillingError('plan_upgrade_required', { feature: 'specialistModes', minimumPlan: 'starter' });
    }
    const requested = input.modes !== undefined ? input.modes : input.mode === undefined ? undefined : input.mode === null ? [] : [input.mode];
    if (requested === undefined || !Array.isArray(requested)) {
      throw new BillingError('validation_error', { field: 'modes', reason: 'required' });
    }
    const modes: SpecialistMode[] = [];
    for (const mode of requested) {
      if (!isSpecialistMode(mode)) throw new BillingError('validation_error', { field: 'modes', reason: 'invalid_mode' });
      if (!modes.includes(mode)) modes.push(mode);
    }
    if (modes.length > MAX_ACTIVE_MODES) throw new BillingError('validation_error', { field: 'modes', reason: 'too_many', limit: MAX_ACTIVE_MODES });

    const guidelines = optionalText(input.customGuidelines, GUIDELINES_MAX, 'customGuidelines');
    let focusAreas: string[];
    if (Array.isArray(input.focusAreas)) {
      focusAreas = input.focusAreas.map((item) => String(item).trim()).filter(Boolean);
      if (focusAreas.length > FOCUS_MAX_ITEMS || focusAreas.some((item) => item.length > FOCUS_ITEM_MAX)) {
        throw new BillingError('validation_error', { field: 'focusAreas', reason: 'invalid_length' });
      }
    } else {
      focusAreas = modes.flatMap((mode) => SPECIALIST_MODES[mode].recommendedFocus);
    }

    await this.pool.query(
      `INSERT INTO candidate_specialist_modes
         (workspace_id, candidate_auth_user_id, mode, modes, focus_areas, custom_guidelines, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (candidate_auth_user_id)
       DO UPDATE SET mode = EXCLUDED.mode, modes = EXCLUDED.modes, focus_areas = EXCLUDED.focus_areas,
                     custom_guidelines = EXCLUDED.custom_guidelines, updated_at = now()`,
      [owner.workspaceId, owner.authUserId, modes[0] ?? null, JSON.stringify(modes), JSON.stringify(focusAreas), guidelines],
    );
    return this.getSpecialistMode(owner);
  }
}
