import type { Pool } from 'pg';
import {
  CandidateSpecialistMode,
  CreateLocationProfileInput,
  LocationProfile,
  RemoteFlexibility,
  SPECIALIST_MODES,
  SpecialistMode,
  TargetTimeline,
  UpdateLocationProfileInput,
  UpdateSpecialistModeInput,
  WorkAuthorization,
} from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { BillingError, isBillingError } from '../billing/errors';
import { checkCapacity } from '../metering/access';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_MAX = 200;
const NOTES_MAX = 2000;
const GUIDELINES_MAX = 2000;

interface LocationProfileRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  place: string;
  radius_miles: number;
  target_timeline: TargetTimeline;
  is_relocation: boolean;
  work_authorization: WorkAuthorization;
  commute_minutes_max: number;
  remote_flexibility: RemoteFlexibility;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SpecialistModeRow {
  candidate_auth_user_id: string;
  workspace_id: string;
  mode: SpecialistMode;
  focus_areas: unknown;
  custom_guidelines: string | null;
  updated_at: Date | string;
}

export class CareerModesService {
  constructor(
    private readonly pool: Pool,
    private readonly catalogs: CatalogStore = new CatalogStore(),
  ) {}

  private mapLocationRow(row: LocationProfileRow): LocationProfile {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      candidateAuthUserId: row.candidate_auth_user_id,
      place: row.place,
      radiusMiles: row.radius_miles,
      targetTimeline: row.target_timeline ?? 'not_relocating',
      isRelocation: Boolean(row.is_relocation),
      workAuthorization: row.work_authorization ?? 'authorized',
      commuteMinutesMax: row.commute_minutes_max ?? 45,
      remoteFlexibility: row.remote_flexibility ?? 'hybrid',
      notes: row.notes,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at ?? row.created_at).toISOString(),
    };
  }

  private mapSpecialistRow(
    row: SpecialistModeRow,
    owner: ProfileOwner,
  ): CandidateSpecialistMode {
    return {
      candidateAuthUserId: row.candidate_auth_user_id,
      workspaceId: row.workspace_id,
      mode: row.mode,
      focusAreas: Array.isArray(row.focus_areas) ? (row.focus_areas as string[]) : [],
      customGuidelines: row.custom_guidelines,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async getAccountPlan(owner: ProfileOwner) {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    let planId = 'free';
    try {
      planId = v2PlanOf(snapshot, account);
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      planId = 'free';
    }
    const allowances = snapshot.allowances[planId as keyof typeof snapshot.allowances];
    const baseCapacity = allowances.locationProfiles ?? 1;
    const allowedRadiusMiles = allowances.localRadiusMiles ?? 25;

    // Check for any purchased recurring extra location profile add-ons
    const extraRes = await this.pool.query<{ count: string | number }>(
      `SELECT count(*) as count FROM purchases
       WHERE billing_account_id = $1
         AND kind = 'capacity'
         AND sku LIKE '%location%'
         AND refunded_at IS NULL`,
      [owner.billingAccountId],
    );
    const extraPurchased = Number(extraRes.rows[0]?.count ?? 0);
    const totalCapacity = baseCapacity + extraPurchased;

    return {
      account,
      snapshot,
      planId,
      allowances,
      baseCapacity,
      extraPurchased,
      totalCapacity,
      allowedRadiusMiles,
    };
  }

  async listLocations(
    owner: ProfileOwner,
  ): Promise<{ items: LocationProfile[]; capacity: number; allowedRadiusMiles: number }> {
    const { totalCapacity, allowedRadiusMiles } = await this.getAccountPlan(owner);
    const res = await this.pool.query<LocationProfileRow>(
      `SELECT * FROM location_profiles
       WHERE workspace_id = $1 AND candidate_auth_user_id = $2
       ORDER BY created_at DESC`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: res.rows.map((row) => this.mapLocationRow(row)),
      capacity: totalCapacity,
      allowedRadiusMiles,
    };
  }

  async getLocation(owner: ProfileOwner, id: string): Promise<LocationProfile> {
    if (!UUID.test(id)) {
      throw new BillingError('not_found', { entity: 'location_profile', id });
    }
    const res = await this.pool.query<LocationProfileRow>(
      `SELECT * FROM location_profiles
       WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
      [id, owner.workspaceId, owner.authUserId],
    );
    const row = res.rows[0];
    if (!row) {
      throw new BillingError('not_found', { entity: 'location_profile', id });
    }
    return this.mapLocationRow(row);
  }

  async createLocation(
    owner: ProfileOwner,
    input: CreateLocationProfileInput,
  ): Promise<LocationProfile> {
    const place = input.place?.trim() ?? '';
    if (!place || place.length > PLACE_MAX) {
      throw new BillingError('validation_error', { field: 'place', reason: 'invalid_length' });
    }

    const { totalCapacity, allowedRadiusMiles } = await this.getAccountPlan(owner);

    const radius = Number(input.radiusMiles ?? 25);
    if (isNaN(radius) || radius < 0) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid_radius' });
    }
    if (radius > allowedRadiusMiles) {
      throw new BillingError('validation_error', {
        field: 'radiusMiles',
        reason: 'exceeds_plan_radius_cap',
        maxAllowed: allowedRadiusMiles,
      });
    }

    // Capacity check
    const usedRes = await this.pool.query<{ count: string | number }>(
      `SELECT count(*) as count FROM location_profiles
       WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const used = Number(usedRes.rows[0]?.count ?? 0);
    if (used + 1 > totalCapacity) {
      throw new BillingError('capacity_exceeded', {
        field: 'locationProfiles',
        limit: totalCapacity,
        used,
      });
    }

    const notes = input.notes?.trim() ?? null;
    if (notes && notes.length > NOTES_MAX) {
      throw new BillingError('validation_error', { field: 'notes', reason: 'invalid_length' });
    }

    const commute = Math.max(0, Math.min(240, Number(input.commuteMinutesMax ?? 45)));

    const res = await this.pool.query<LocationProfileRow>(
      `INSERT INTO location_profiles
         (workspace_id, candidate_auth_user_id, place, radius_miles, target_timeline,
          is_relocation, work_authorization, commute_minutes_max, remote_flexibility, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        owner.workspaceId,
        owner.authUserId,
        place,
        radius,
        input.targetTimeline ?? 'not_relocating',
        Boolean(input.isRelocation),
        input.workAuthorization ?? 'authorized',
        commute,
        input.remoteFlexibility ?? 'hybrid',
        notes,
      ],
    );

    return this.mapLocationRow(res.rows[0]);
  }

  async updateLocation(
    owner: ProfileOwner,
    id: string,
    input: UpdateLocationProfileInput,
  ): Promise<LocationProfile> {
    const existing = await this.getLocation(owner, id);
    const { allowedRadiusMiles } = await this.getAccountPlan(owner);

    const place = input.place !== undefined ? input.place.trim() : existing.place;
    if (!place || place.length > PLACE_MAX) {
      throw new BillingError('validation_error', { field: 'place', reason: 'invalid_length' });
    }

    const radius = input.radiusMiles !== undefined ? Number(input.radiusMiles) : existing.radiusMiles;
    if (isNaN(radius) || radius < 0) {
      throw new BillingError('validation_error', { field: 'radiusMiles', reason: 'invalid_radius' });
    }
    if (radius > allowedRadiusMiles) {
      throw new BillingError('validation_error', {
        field: 'radiusMiles',
        reason: 'exceeds_plan_radius_cap',
        maxAllowed: allowedRadiusMiles,
      });
    }

    const notes = input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes;
    if (notes && notes.length > NOTES_MAX) {
      throw new BillingError('validation_error', { field: 'notes', reason: 'invalid_length' });
    }

    const commute =
      input.commuteMinutesMax !== undefined
        ? Math.max(0, Math.min(240, Number(input.commuteMinutesMax)))
        : existing.commuteMinutesMax;

    const res = await this.pool.query<LocationProfileRow>(
      `UPDATE location_profiles
       SET place = $1,
           radius_miles = $2,
           target_timeline = $3,
           is_relocation = $4,
           work_authorization = $5,
           commute_minutes_max = $6,
           remote_flexibility = $7,
           notes = $8,
           updated_at = now()
       WHERE id = $9 AND workspace_id = $10 AND candidate_auth_user_id = $11
       RETURNING *`,
      [
        place,
        radius,
        input.targetTimeline ?? existing.targetTimeline,
        input.isRelocation !== undefined ? Boolean(input.isRelocation) : existing.isRelocation,
        input.workAuthorization ?? existing.workAuthorization,
        commute,
        input.remoteFlexibility ?? existing.remoteFlexibility,
        notes,
        id,
        owner.workspaceId,
        owner.authUserId,
      ],
    );

    return this.mapLocationRow(res.rows[0]);
  }

  async deleteLocation(owner: ProfileOwner, id: string): Promise<void> {
    await this.getLocation(owner, id);
    await this.pool.query(
      `DELETE FROM location_profiles
       WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
      [id, owner.workspaceId, owner.authUserId],
    );
  }

  async getSpecialistMode(owner: ProfileOwner): Promise<CandidateSpecialistMode> {
    const res = await this.pool.query<SpecialistModeRow>(
      `SELECT * FROM candidate_specialist_modes
       WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    if (!res.rows[0]) {
      return {
        candidateAuthUserId: owner.authUserId,
        workspaceId: owner.workspaceId,
        mode: 'general',
        focusAreas: SPECIALIST_MODES.general.recommendedFocus,
        customGuidelines: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return this.mapSpecialistRow(res.rows[0], owner);
  }

  async setSpecialistMode(
    owner: ProfileOwner,
    input: UpdateSpecialistModeInput,
  ): Promise<CandidateSpecialistMode> {
    const { allowances } = await this.getAccountPlan(owner);
    if (!allowances.specialistModes) {
      throw new BillingError('plan_upgrade_required', { feature: 'specialistModes' });
    }

    if (!SPECIALIST_MODES[input.mode]) {
      throw new BillingError('validation_error', { field: 'mode', reason: 'invalid_mode' });
    }

    const guidelines = input.customGuidelines?.trim() ?? null;
    if (guidelines && guidelines.length > GUIDELINES_MAX) {
      throw new BillingError('validation_error', { field: 'customGuidelines', reason: 'invalid_length' });
    }

    const focusAreas = Array.isArray(input.focusAreas)
      ? input.focusAreas.map((f) => String(f).trim()).filter(Boolean)
      : SPECIALIST_MODES[input.mode].recommendedFocus;

    const res = await this.pool.query<SpecialistModeRow>(
      `INSERT INTO candidate_specialist_modes
         (workspace_id, candidate_auth_user_id, mode, focus_areas, custom_guidelines, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (candidate_auth_user_id)
       DO UPDATE SET
         mode = EXCLUDED.mode,
         focus_areas = EXCLUDED.focus_areas,
         custom_guidelines = EXCLUDED.custom_guidelines,
         updated_at = now()
       RETURNING *`,
      [
        owner.workspaceId,
        owner.authUserId,
        input.mode,
        JSON.stringify(focusAreas),
        guidelines,
      ],
    );

    return this.mapSpecialistRow(res.rows[0], owner);
  }
}
