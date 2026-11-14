import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  API_KEY_RATE_PER_MINUTE,
  API_READS_PER_PACKAGE,
  MAINTENANCE_DETAILS_MAX,
  MAINTENANCE_TITLE_MAX,
  REQUIRED_ATTRIBUTION,
  apiKeyPrefix,
  compareScenarios,
  credentialIsDue,
  credentialReminders,
  formFillPayload,
  formReviewResult,
  isApplicationStatus,
  isCalendarDate,
  isSupportedFormSite,
  learningLoopReport,
  salesInquiryInput,
} from '@flacroncv/career-shared';
import type {
  ApiKeyEnvironment,
  CredentialReminder,
  FormFillPayload,
  MaintenanceAchievement,
  MaintenanceCredential,
  MaintenancePromotionGoal,
  PromotionGoalStatus,
  SavedScenario,
  ScenarioComparison,
  ScenarioOptionInput,
} from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import type { Db } from '../billing/db';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import { RecordingMailer, type Mailer } from '../mail/mailer';
import { UnconfiguredMapTiles } from '../maps/map-tiles';
import type { MapTiles } from '../maps/map-tiles';
import { requireFeature } from '../metering/access';
import { MeteringService, type JsonValue, type MeteredResult } from '../metering/metering.service';
import type { FeatureId } from '@flacroncv/career-shared';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { ApplicationStatus } from '@flacroncv/career-shared';

/**
 * Where application outcomes come from. Inside V1 it is V1's Jobs tracker
 * (read-only); null means "no external tracker" and V2's own table is used.
 */
export type ApplicationOutcomeSource = (owner: ProfileOwner) => Promise<ApplicationStatus[] | null>;

/**
 * Writes the factual profile. Confirming a promotion goes through it so the
 * change keeps its revision history (CareerProfileService satisfies this).
 */
export interface FactWriter {
  createFact(owner: ProfileOwner, input: { factType: 'experience'; value: Record<string, unknown>; confirmation: 'confirmed' }): Promise<{ id: string }>;
  updateFact(owner: ProfileOwner, factId: string, patch: Record<string, unknown>): Promise<{ id: string }>;
}

const systemClock: Clock = { now: () => new Date() };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENARIO_TITLE_MAX = 120;

export interface DeveloperStatus {
  /** Whether the API package add-on is on this account; creating a key needs it. */
  apiPackage: boolean;
  /** Whether the white-label add-on is on this account; saving a brand needs it. */
  whiteLabel: boolean;
  brand: { brandName: string; attribution: string } | null;
  keys: ApiKeyView[];
  /** Requests per key per minute, by environment. */
  rateLimits: Record<ApiKeyEnvironment, number>;
}

export interface ApiKeyView {
  id: string;
  prefix: string;
  environment: ApiKeyEnvironment;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface MaintenanceView {
  achievements: MaintenanceAchievement[];
  promotionGoals: MaintenancePromotionGoal[];
  credentials: MaintenanceCredential[];
  reminders: CredentialReminder[];
}

export interface ScenarioMeta {
  title?: string;
  locationProfileIds?: string[];
  skillReportIds?: string[];
}

export interface ScenarioList {
  items: Array<SavedScenario & { locationProfileIds: string[]; skillReportIds: string[] }>;
  /** Scenario reports left this period (plan + packs), or null when the plan has none. */
  remaining: number | null;
}

export const HUMAN_PROVIDERS = [
  { id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false },
] as const;

/**
 * The credential reminder feed for one person (CV21): expiry and review dates
 * within 90 days or already past, soonest first. Read-only; the reminder
 * centre (alerts) decides how and when to notify.
 */
export async function readCredentialReminders(db: Db, owner: Pick<ProfileOwner, 'workspaceId' | 'authUserId'>, today: string): Promise<CredentialReminder[]> {
  const rows = await db.query<{ id: string; name: string; issuer: string; region: string; expires_on: string; review_on: string | null }>(
    `SELECT id, name, issuer, region, expires_on::text AS expires_on, review_on::text AS review_on
       FROM credential_reminders WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
    [owner.workspaceId, owner.authUserId],
  );
  return credentialReminders(
    rows.rows.map((row) => ({ id: row.id, name: row.name, issuer: row.issuer, region: row.region, expiresOn: row.expires_on, reviewOn: row.review_on })),
    today,
  );
}

export class RemainingService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly clock: Clock = systemClock,
    private readonly tiles: MapTiles = new UnconfiguredMapTiles(),
    private readonly mailer: Mailer = new RecordingMailer(),
    private readonly outcomes: ApplicationOutcomeSource = async () => null,
    private readonly facts: FactWriter | null = null,
  ) {}

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  // -------------------------------------------------------------------------
  // CV18 scenarios

  async createScenario(owner: ProfileOwner, options: ScenarioOptionInput[], idempotencyKey?: string, meta: ScenarioMeta = {}): Promise<MeteredResult<JsonValue>> {
    const compared = compareScenarios(options);
    if (!compared) throw new BillingError('validation_error', { field: 'options', reason: 'invalid' });
    // Links are checked before anything is reserved, so a bad id never costs a credit.
    const links = await this.scenarioLinks(owner, compared, meta);
    const title = cleanTitle(meta.title, compared);
    return this.metering.run({
      spender: owner,
      kind: 'scenario.compare',
      unit: 'scenario_report',
      feature: 'scenarioReports',
      idempotencyKey,
      body: { options, title, ...links },
      requestId: randomUUID(),
      execute: async () => compared,
      save: async (db, output) => {
        const inserted = await db.query<{ id: string; created_at: Date }>(
          `INSERT INTO career_scenarios (workspace_id, candidate_auth_user_id, options, tradeoff, title, location_profile_ids, skill_report_ids)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb) RETURNING id, created_at`,
          [owner.workspaceId, owner.authUserId, JSON.stringify(output.options), output.tradeoff, title, JSON.stringify(links.locationProfileIds), JSON.stringify(links.skillReportIds)],
        );
        const at = inserted.rows[0].created_at.toISOString();
        return { id: inserted.rows[0].id, title, options: output.options, tradeoff: output.tradeoff, createdAt: at, updatedAt: at, ...links } as unknown as JsonValue;
      },
    });
  }

  async listScenarios(owner: ProfileOwner): Promise<ScenarioList> {
    const rows = await this.pool.query<ScenarioRow>(
      `SELECT * FROM career_scenarios WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at DESC, id LIMIT 100`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: rows.rows.map(scenarioView), remaining: await this.remainingUnits(owner, 'scenario_report') };
  }

  async getScenario(owner: ProfileOwner, id: string): Promise<ReturnType<typeof scenarioView>> {
    return scenarioView(await this.ownedScenario(owner, id));
  }

  /**
   * Editing assumptions recomputes the comparison from the person's own
   * values: no model runs and nothing is charged.
   */
  async updateScenario(owner: ProfileOwner, id: string, input: { options?: ScenarioOptionInput[] } & ScenarioMeta): Promise<ReturnType<typeof scenarioView>> {
    const current = scenarioView(await this.ownedScenario(owner, id));
    const compared = input.options !== undefined ? compareScenarios(input.options) : { options: current.options, tradeoff: current.tradeoff };
    if (!compared) throw new BillingError('validation_error', { field: 'options', reason: 'invalid' });
    const links = await this.scenarioLinks(owner, compared, {
      locationProfileIds: input.locationProfileIds ?? current.locationProfileIds,
      skillReportIds: input.skillReportIds ?? current.skillReportIds,
    });
    const title = input.title !== undefined ? cleanTitle(input.title, compared) : current.title;
    const rows = await this.pool.query<ScenarioRow>(
      `UPDATE career_scenarios SET options = $2::jsonb, tradeoff = $3, title = $4, location_profile_ids = $5::jsonb, skill_report_ids = $6::jsonb, updated_at = $7
        WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(compared.options), compared.tradeoff, title, JSON.stringify(links.locationProfileIds), JSON.stringify(links.skillReportIds), this.clock.now()],
    );
    return scenarioView(rows.rows[0]);
  }

  async deleteScenario(owner: ProfileOwner, id: string): Promise<{ ok: true }> {
    await this.ownedScenario(owner, id);
    await this.pool.query(`DELETE FROM career_scenarios WHERE id = $1`, [id]);
    return { ok: true };
  }

  private async ownedScenario(owner: ProfileOwner, id: string): Promise<ScenarioRow> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await this.pool.query<ScenarioRow>(`SELECT * FROM career_scenarios WHERE id = $1`, [id]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) throw new BillingError('permission_denied');
    return row;
  }

  /** Location profiles and skill reports a scenario points at must be the caller's own. */
  private async scenarioLinks(owner: ProfileOwner, compared: ScenarioComparison, meta: ScenarioMeta): Promise<{ locationProfileIds: string[]; skillReportIds: string[] }> {
    const locationProfileIds = uniqueIds([...(meta.locationProfileIds ?? []), ...compared.options.map((o) => o.locationProfileId).filter((v): v is string => !!v)], 'locationProfileIds');
    const skillReportIds = uniqueIds([...(meta.skillReportIds ?? []), ...compared.options.map((o) => o.skillReportId).filter((v): v is string => !!v)], 'skillReportIds');
    await this.assertOwned('location_profiles', owner, locationProfileIds, 'locationProfileIds');
    await this.assertOwned('skill_gap_reports', owner, skillReportIds, 'skillReportIds');
    return { locationProfileIds, skillReportIds };
  }

  private async assertOwned(
    table: 'location_profiles' | 'skill_gap_reports' | 'career_facts' | 'career_evidence',
    owner: ProfileOwner,
    ids: string[],
    field: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.pool.query(
      `SELECT id FROM ${table} WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND id = ANY($3::uuid[])`,
      [owner.workspaceId, owner.authUserId, ids],
    );
    if (found.rows.length !== ids.length) throw new BillingError('validation_error', { field, reason: 'unknown' });
  }

  private async remainingUnits(owner: ProfileOwner, unit: string): Promise<number | null> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, unit, this.clock.now());
      if (balance.includedGranted === 0 && balance.packRemaining === 0 && balance.includedRemaining === 0) {
        const plan = v2PlanOf(snapshot, account);
        if (snapshot.allowances[plan].scenarioReports === null) return null;
      }
      return balance.includedRemaining + balance.packRemaining;
    } catch (error) {
      if (isBillingError(error)) return null;
      throw error;
    }
  }

  // -------------------------------------------------------------------------

  async learningLoop(owner: ProfileOwner): Promise<ReturnType<typeof learningLoopReport>> {
    const { snapshot, planId } = await this.gate(owner, 'applicationAnalytics');
    const level = snapshot.allowances[planId].applicationAnalytics;
    if (level === 'none') {
      throw new BillingError('plan_upgrade_required', { feature: 'applicationAnalytics', minimumPlan: 'starter' });
    }
    const external = await this.outcomes(owner);
    if (external) return learningLoopReport(external.map((status) => ({ status })), level);
    const rows = await this.pool.query<{ status: string }>(
      `SELECT status FROM applications WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const input = [];
    for (const row of rows.rows) {
      if (isApplicationStatus(row.status)) input.push({ status: row.status });
    }
    return learningLoopReport(input, level);
  }

  async createForm(owner: ProfileOwner, site: string, idempotencyKey?: string): Promise<MeteredResult<JsonValue>> {
    if (!isSupportedFormSite(site)) throw new BillingError('validation_error', { field: 'site', reason: 'unsupported' });
    return this.metering.run({
      spender: owner,
      kind: 'form.preview',
      unit: 'assisted_form',
      feature: 'assistedForms',
      idempotencyKey,
      body: { site },
      requestId: randomUUID(),
      execute: async () => ({ site: site.trim().toLowerCase(), externalSubmitted: false as const }),
      save: async (db, output) => {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO assisted_form_sessions (workspace_id, candidate_auth_user_id, site)
           VALUES ($1, $2, $3) RETURNING id`,
          [owner.workspaceId, owner.authUserId, output.site],
        );
        return { id: inserted.rows[0].id, site: output.site, externalSubmitted: false, reviewed: false };
      },
    });
  }

  async reviewForm(owner: ProfileOwner, sessionId: string, confirmed: boolean): Promise<{ id: string; externalSubmitted: false; message: string }> {
    await this.gate(owner, 'assistedForms');
    const review = formReviewResult(confirmed);
    if (!review) throw new BillingError('validation_error', { field: 'confirmed', reason: 'required' });
    const rows = await this.pool.query<{ id: string; workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT id, workspace_id, candidate_auth_user_id FROM assisted_form_sessions WHERE id = $1`,
      [sessionId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    await this.pool.query(`UPDATE assisted_form_sessions SET reviewed_at = $2 WHERE id = $1`, [sessionId, this.clock.now()]);
    return { id: sessionId, ...review };
  }

  async fillForm(owner: ProfileOwner, sessionId: string): Promise<FormFillPayload> {
    await this.gate(owner, 'assistedForms');
    const rows = await this.pool.query<{
      id: string;
      site: string;
      reviewed_at: Date | null;
      workspace_id: string;
      candidate_auth_user_id: string;
    }>(
      `SELECT id, site, reviewed_at, workspace_id, candidate_auth_user_id FROM assisted_form_sessions WHERE id = $1`,
      [sessionId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    const facts = await this.pool.query<{ value: { fullName?: unknown; email?: unknown; phone?: unknown } }>(
      `SELECT value FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND fact_type = 'contact' AND confirmation = 'confirmed'
        ORDER BY updated_at DESC LIMIT 1`,
      [owner.workspaceId, owner.authUserId],
    );
    const value = facts.rows[0]?.value ?? {};
    const payload = formFillPayload({
      site: row.site,
      reviewed: row.reviewed_at !== null,
      fields: {
        full_name: typeof value.fullName === 'string' ? value.fullName : '',
        email: typeof value.email === 'string' ? value.email : '',
        phone: typeof value.phone === 'string' ? value.phone : '',
        notes: '',
      },
    });
    if (!payload) throw new BillingError('validation_error', { field: 'reviewed', reason: 'required' });
    return payload;
  }

  async submitSalesInquiry(input: {
    name?: string;
    email?: string;
    organization?: string;
    message?: string;
  }): Promise<{ id: string; delivered: boolean }> {
    const parsed = salesInquiryInput(input);
    if (!parsed) throw new BillingError('validation_error', { field: 'message', reason: 'invalid' });
    let delivered = false;
    try {
      delivered = (
        await this.mailer.send({
          to: parsed.email,
          subject: 'FlacronCV sales inquiry',
          text: `${parsed.name} (${parsed.organization})\n${parsed.email}\n\n${parsed.message}`,
        })
      ).delivered;
    } catch {
      delivered = false;
    }
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO sales_inquiries (name, email, organization, message, delivered)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [parsed.name, parsed.email, parsed.organization, parsed.message, delivered],
    );
    return { id: inserted.rows[0].id, delivered };
  }

  // -------------------------------------------------------------------------
  // CV21 career maintenance. Manual entries cost nothing.

  async maintenance(owner: ProfileOwner): Promise<MaintenanceView> {
    const achievements = await this.pool.query<AchievementRow>(
      `SELECT id, title, details, achieved_on::text AS achieved_on, fact_id, evidence_id FROM career_achievements
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY achieved_on DESC NULLS LAST, created_at DESC`,
      [owner.workspaceId, owner.authUserId],
    );
    const goals = await this.pool.query<GoalRow>(
      `SELECT id, desired_title, target_date::text AS target_date, status, confirmed_fact_id, confirmed_at FROM career_promotion_goals
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    const credentials = await this.pool.query<CredentialRow>(
      `SELECT id, name, issuer, region, expires_on::text AS expires_on, review_on::text AS review_on, fact_id, evidence_id FROM credential_reminders
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY expires_on, name`,
      [owner.workspaceId, owner.authUserId],
    );
    const today = this.today();
    const credentialViews = credentials.rows.map((row) => credentialView(row, today));
    return {
      achievements: achievements.rows.map(achievementView),
      promotionGoals: goals.rows.map(goalView),
      credentials: credentialViews,
      reminders: credentialReminders(credentialViews, today),
    };
  }

  credentialReminders(owner: ProfileOwner): Promise<CredentialReminder[]> {
    return readCredentialReminders(this.pool, owner, this.today());
  }

  async addAchievement(
    owner: ProfileOwner,
    input: string | { title: string; details?: string; achievedOn?: string | null; factId?: string | null; evidenceId?: string | null },
  ): Promise<MaintenanceAchievement> {
    const body = typeof input === 'string' ? { title: input } : input;
    const values = await this.achievementValues(owner, body, null);
    const inserted = await this.pool.query<AchievementRow>(
      `INSERT INTO career_achievements (workspace_id, candidate_auth_user_id, title, details, achieved_on, fact_id, evidence_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, details, achieved_on::text AS achieved_on, fact_id, evidence_id`,
      [owner.workspaceId, owner.authUserId, values.title, values.details, values.achievedOn, values.factId, values.evidenceId],
    );
    return achievementView(inserted.rows[0]);
  }

  async updateAchievement(
    owner: ProfileOwner,
    id: string,
    input: { title?: string; details?: string; achievedOn?: string | null; factId?: string | null; evidenceId?: string | null },
  ): Promise<MaintenanceAchievement> {
    const current = await this.ownedRow<AchievementRow>(
      'career_achievements',
      owner,
      id,
      `id, title, details, achieved_on::text AS achieved_on, fact_id, evidence_id`,
    );
    const values = await this.achievementValues(owner, input, achievementView(current));
    const rows = await this.pool.query<AchievementRow>(
      `UPDATE career_achievements SET title = $2, details = $3, achieved_on = $4, fact_id = $5, evidence_id = $6, updated_at = $7
        WHERE id = $1 RETURNING id, title, details, achieved_on::text AS achieved_on, fact_id, evidence_id`,
      [id, values.title, values.details, values.achievedOn, values.factId, values.evidenceId, this.clock.now()],
    );
    return achievementView(rows.rows[0]);
  }

  async deleteAchievement(owner: ProfileOwner, id: string): Promise<{ ok: true }> {
    await this.ownedRow('career_achievements', owner, id, 'id');
    await this.pool.query(`DELETE FROM career_achievements WHERE id = $1`, [id]);
    return { ok: true };
  }

  private async achievementValues(
    owner: ProfileOwner,
    input: { title?: string; details?: string; achievedOn?: string | null; factId?: string | null; evidenceId?: string | null },
    current: MaintenanceAchievement | null,
  ) {
    const title = input.title !== undefined ? requiredText(input.title, MAINTENANCE_TITLE_MAX, 'title') : current?.title ?? requiredText(undefined, MAINTENANCE_TITLE_MAX, 'title');
    const details = input.details !== undefined ? optionalText(input.details, MAINTENANCE_DETAILS_MAX, 'details') : current?.details ?? '';
    const achievedOn = input.achievedOn !== undefined ? optionalDate(input.achievedOn, 'achievedOn') : current?.achievedOn ?? null;
    const factId = input.factId !== undefined ? await this.optionalLink(owner, 'career_facts', input.factId, 'factId') : current?.factId ?? null;
    const evidenceId = input.evidenceId !== undefined ? await this.optionalLink(owner, 'career_evidence', input.evidenceId, 'evidenceId') : current?.evidenceId ?? null;
    return { title, details, achievedOn, factId, evidenceId };
  }

  async addPromotionGoal(owner: ProfileOwner, input: string | { desiredTitle: string; targetDate?: string | null }): Promise<MaintenancePromotionGoal> {
    const body = typeof input === 'string' ? { desiredTitle: input } : input;
    const desiredTitle = requiredText(body.desiredTitle, MAINTENANCE_TITLE_MAX, 'desiredTitle');
    const targetDate = optionalDate(body.targetDate ?? null, 'targetDate');
    const inserted = await this.pool.query<GoalRow>(
      `INSERT INTO career_promotion_goals (workspace_id, candidate_auth_user_id, desired_title, target_date) VALUES ($1, $2, $3, $4)
       RETURNING id, desired_title, target_date::text AS target_date, status, confirmed_fact_id, confirmed_at`,
      [owner.workspaceId, owner.authUserId, desiredTitle, targetDate],
    );
    return goalView(inserted.rows[0]);
  }

  async updatePromotionGoal(
    owner: ProfileOwner,
    id: string,
    input: { desiredTitle?: string; targetDate?: string | null; status?: 'open' | 'dropped' },
  ): Promise<MaintenancePromotionGoal> {
    const current = goalView(await this.ownedRow<GoalRow>('career_promotion_goals', owner, id, GOAL_COLUMNS));
    if (current.status === 'confirmed') throw new BillingError('validation_error', { field: 'status', reason: 'already_confirmed' });
    if (input.status !== undefined && input.status !== 'open' && input.status !== 'dropped') {
      throw new BillingError('validation_error', { field: 'status', reason: 'invalid' });
    }
    const rows = await this.pool.query<GoalRow>(
      `UPDATE career_promotion_goals SET desired_title = $2, target_date = $3, status = $4, updated_at = $5 WHERE id = $1
       RETURNING ${GOAL_COLUMNS}`,
      [
        id,
        input.desiredTitle !== undefined ? requiredText(input.desiredTitle, MAINTENANCE_TITLE_MAX, 'desiredTitle') : current.desiredTitle,
        input.targetDate !== undefined ? optionalDate(input.targetDate, 'targetDate') : current.targetDate,
        input.status ?? current.status,
        this.clock.now(),
      ],
    );
    return goalView(rows.rows[0]);
  }

  async deletePromotionGoal(owner: ProfileOwner, id: string): Promise<{ ok: true }> {
    await this.ownedRow('career_promotion_goals', owner, id, 'id');
    await this.pool.query(`DELETE FROM career_promotion_goals WHERE id = $1`, [id]);
    return { ok: true };
  }

  /**
   * The person confirms they got the promotion. Only then does the job title
   * enter the factual profile: either the position of an existing experience
   * fact changes (with its revision history), or a new confirmed experience
   * fact is added. Never automatic (spec section 28).
   */
  async confirmPromotion(
    owner: ProfileOwner,
    id: string,
    input: { confirmed: boolean; experienceFactId?: string | null; company?: string | null; startDate?: string | null },
  ): Promise<MaintenancePromotionGoal> {
    if (input.confirmed !== true) throw new BillingError('validation_error', { field: 'confirmed', reason: 'required' });
    if (!this.facts) throw new BillingError('provider_unavailable', { reason: 'profile_writer_missing' });
    const goal = goalView(await this.ownedRow<GoalRow>('career_promotion_goals', owner, id, GOAL_COLUMNS));
    if (goal.status !== 'open') throw new BillingError('validation_error', { field: 'status', reason: goal.status });
    let factId: string;
    if (input.experienceFactId) {
      if (!UUID.test(input.experienceFactId)) throw new BillingError('validation_error', { field: 'experienceFactId', reason: 'invalid' });
      const fact = await this.pool.query<{ fact_type: string }>(
        `SELECT fact_type FROM career_facts WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3`,
        [input.experienceFactId, owner.workspaceId, owner.authUserId],
      );
      if (fact.rows[0]?.fact_type !== 'experience') throw new BillingError('validation_error', { field: 'experienceFactId', reason: 'unknown' });
      factId = (await this.facts.updateFact(owner, input.experienceFactId, { position: goal.desiredTitle })).id;
    } else {
      const company = requiredText(input.company ?? undefined, MAINTENANCE_TITLE_MAX, 'company');
      const startDate = optionalDate(input.startDate ?? null, 'startDate');
      const value: Record<string, unknown> = { position: goal.desiredTitle, company, current: true };
      if (startDate) value.startDate = startDate;
      factId = (await this.facts.createFact(owner, { factType: 'experience', value, confirmation: 'confirmed' })).id;
    }
    const rows = await this.pool.query<GoalRow>(
      `UPDATE career_promotion_goals SET status = 'confirmed', confirmed_at = $2, confirmed_fact_id = $3, updated_at = $2 WHERE id = $1
       RETURNING ${GOAL_COLUMNS}`,
      [id, this.clock.now(), factId],
    );
    return goalView(rows.rows[0]);
  }

  async addCredential(
    owner: ProfileOwner,
    nameOrInput: string | CredentialInput,
    expiresOnArg?: string,
  ): Promise<MaintenanceCredential> {
    const input: CredentialInput = typeof nameOrInput === 'string' ? { name: nameOrInput, expiresOn: expiresOnArg ?? '' } : nameOrInput;
    const values = await this.credentialValues(owner, input, null);
    const inserted = await this.pool.query<CredentialRow>(
      `INSERT INTO credential_reminders (workspace_id, candidate_auth_user_id, name, issuer, region, expires_on, review_on, fact_id, evidence_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${CREDENTIAL_COLUMNS}`,
      [owner.workspaceId, owner.authUserId, values.name, values.issuer, values.region, values.expiresOn, values.reviewOn, values.factId, values.evidenceId],
    );
    return credentialView(inserted.rows[0], this.today());
  }

  async updateCredential(owner: ProfileOwner, id: string, input: Partial<CredentialInput>): Promise<MaintenanceCredential> {
    const current = credentialView(await this.ownedRow<CredentialRow>('credential_reminders', owner, id, CREDENTIAL_COLUMNS), this.today());
    const values = await this.credentialValues(owner, input, current);
    const rows = await this.pool.query<CredentialRow>(
      `UPDATE credential_reminders SET name = $2, issuer = $3, region = $4, expires_on = $5, review_on = $6, fact_id = $7, evidence_id = $8, updated_at = $9
        WHERE id = $1 RETURNING ${CREDENTIAL_COLUMNS}`,
      [id, values.name, values.issuer, values.region, values.expiresOn, values.reviewOn, values.factId, values.evidenceId, this.clock.now()],
    );
    return credentialView(rows.rows[0], this.today());
  }

  async deleteCredential(owner: ProfileOwner, id: string): Promise<{ ok: true }> {
    await this.ownedRow('credential_reminders', owner, id, 'id');
    await this.pool.query(`DELETE FROM credential_reminders WHERE id = $1`, [id]);
    return { ok: true };
  }

  private async credentialValues(owner: ProfileOwner, input: Partial<CredentialInput>, current: MaintenanceCredential | null) {
    const name = input.name !== undefined ? requiredText(input.name, MAINTENANCE_TITLE_MAX, 'name') : current?.name ?? requiredText(undefined, 1, 'name');
    const expiresOn = input.expiresOn !== undefined ? requiredDate(input.expiresOn, 'expiresOn') : current?.expiresOn ?? requiredDate(undefined, 'expiresOn');
    const reviewOn = input.reviewOn !== undefined ? optionalDate(input.reviewOn, 'reviewOn') : current?.reviewOn ?? null;
    const issuer = input.issuer !== undefined ? optionalText(input.issuer, MAINTENANCE_TITLE_MAX, 'issuer') : current?.issuer ?? '';
    const region = input.region !== undefined ? optionalText(input.region, MAINTENANCE_TITLE_MAX, 'region') : current?.region ?? '';
    const factId = input.factId !== undefined ? await this.optionalLink(owner, 'career_facts', input.factId, 'factId') : current?.factId ?? null;
    const evidenceId = input.evidenceId !== undefined ? await this.optionalLink(owner, 'career_evidence', input.evidenceId, 'evidenceId') : current?.evidenceId ?? null;
    return { name, expiresOn, reviewOn, issuer, region, factId, evidenceId };
  }

  private async optionalLink(owner: ProfileOwner, table: 'career_facts' | 'career_evidence', id: string | null, field: string): Promise<string | null> {
    if (id === null || id === '') return null;
    if (typeof id !== 'string' || !UUID.test(id)) throw new BillingError('validation_error', { field, reason: 'invalid' });
    await this.assertOwned(table, owner, [id], field);
    return id;
  }

  private async ownedRow<T>(
    table: 'career_achievements' | 'career_promotion_goals' | 'credential_reminders',
    owner: ProfileOwner,
    id: string,
    columns: string,
  ): Promise<T> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await this.pool.query<T & { workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT ${columns}, workspace_id, candidate_auth_user_id FROM ${table} WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) throw new BillingError('permission_denied');
    return row;
  }

  // -------------------------------------------------------------------------
  // Map discovery

  /** The list always works; the visual map needs a tile provider. */
  async mapList(owner: ProfileOwner): Promise<{
    items: Array<{ id: string; title: string; approximate: true; coordinates: null }>;
    tiles: null;
    attribution: null;
    provider: null;
    available: boolean;
  }> {
    await this.gate(owner, 'mapSessions');
    const view = this.tiles.sessionView();
    const rows = await this.pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM opportunities
        WHERE candidate_auth_user_id IS NULL OR candidate_auth_user_id = $1
        ORDER BY title LIMIT 20`,
      [owner.authUserId],
    );
    // Coordinates stay null here. A geocode hit is not a visual map.
    // Google lat/lng must not be drawn on a non-Google tile set.
    return {
      items: rows.rows.map((row) => ({ ...row, approximate: true as const, coordinates: null })),
      tiles: view.tiles,
      attribution: view.attribution,
      provider: view.provider,
      available: view.tiles !== null,
    };
  }

  /**
   * A map session is charged only when there is a map to show. With no tile
   * provider bound, nothing is reserved and the screen keeps the list.
   */
  async startMap(owner: ProfileOwner, idempotencyKey?: string): Promise<MeteredResult<JsonValue>> {
    const view = this.tiles.sessionView();
    if (view.tiles === null) throw new BillingError('provider_unavailable', { provider: 'map_tiles' });
    return this.metering.run({
      spender: owner,
      kind: 'map.session',
      unit: 'map_session',
      feature: 'mapSessions',
      idempotencyKey,
      body: {},
      requestId: randomUUID(),
      execute: async () => view,
      save: async (db, output) => {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO map_sessions (workspace_id, candidate_auth_user_id, minutes) VALUES ($1, $2, $3) RETURNING id`,
          [owner.workspaceId, owner.authUserId, output.minutes],
        );
        return { id: inserted.rows[0].id, ...output };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Human services and employer pilot: closed until terms are set.

  humanServices(): { items: Array<{ id: string; name: string; scope: string; priceCents: null; bookingOpen: false; note: string }> } {
    return {
      items: HUMAN_PROVIDERS.map((provider) => ({
        ...provider,
        note: 'This is not AI feedback. Booking stays closed until commercial terms are set.',
      })),
    };
  }

  bookHumanService(): never {
    throw new BillingError('not_purchasable', { reason: 'commercial_terms_required' });
  }

  /** The saved choice; a person who never chose is not discoverable. */
  async getOptIn(owner: ProfileOwner): Promise<{ discoverable: boolean }> {
    const rows = await this.pool.query<{ discoverable: boolean }>(
      `SELECT discoverable FROM recruiting_opt_ins WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    return { discoverable: rows.rows[0]?.discoverable === true };
  }

  async setOptIn(owner: ProfileOwner, discoverable: boolean): Promise<{ discoverable: boolean }> {
    await this.pool.query(
      `INSERT INTO recruiting_opt_ins (workspace_id, candidate_auth_user_id, discoverable)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, candidate_auth_user_id)
       DO UPDATE SET discoverable = EXCLUDED.discoverable, updated_at = now()`,
      [owner.workspaceId, owner.authUserId, discoverable],
    );
    return { discoverable };
  }

  /**
   * What a signed-in person may learn about the opt-in pool: how many people
   * opted in, nothing that identifies anyone. Identities are for platform
   * operators only (AdminService.recruitingOptIns), never for other candidates.
   */
  async recruitingCount(): Promise<{ count: number }> {
    const rows = await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM recruiting_opt_ins WHERE discoverable = true`);
    return { count: rows.rows[0]?.n ?? 0 };
  }

  employerCheckout(): never {
    throw new BillingError('not_purchasable', { reason: 'employer_pricing_not_set' });
  }

  // -------------------------------------------------------------------------
  // API package and white label (spec section 30)

  /**
   * A key belongs to one environment: `flc_test_` keys are for integration
   * work and never spend paid reads; `flc_live_` keys do. Only a hash is kept.
   */
  async createApiKey(owner: ProfileOwner, environment: ApiKeyEnvironment = 'live'): Promise<{ id: string; token: string; prefix: string; environment: ApiKeyEnvironment }> {
    if (environment !== 'test' && environment !== 'live') throw new BillingError('validation_error', { field: 'environment', reason: 'invalid' });
    const entitlement = await this.entitlement(owner, 'api_package');
    if (!entitlement) throw new BillingError('not_purchasable', { addonId: 'api_package', priceCents: 9900 });
    const token = `${apiKeyPrefix(environment)}${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(token).digest('hex');
    const prefix = token.slice(0, apiKeyPrefix(environment).length + 4);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO api_keys (workspace_id, billing_account_id, key_hash, key_prefix, environment) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [owner.workspaceId, owner.billingAccountId, keyHash, prefix, environment],
    );
    return { id: inserted.rows[0].id, token, prefix, environment };
  }

  async revokeApiKey(owner: ProfileOwner, keyId: string): Promise<{ ok: true }> {
    if (!UUID.test(keyId)) throw new BillingError('not_found');
    const updated = await this.pool.query(
      `UPDATE api_keys SET revoked_at = COALESCE(revoked_at, $3) WHERE id = $1 AND workspace_id = $2`,
      [keyId, owner.workspaceId, this.clock.now()],
    );
    if (updated.rowCount === 0) throw new BillingError('not_found');
    return { ok: true };
  }

  /**
   * One read through a key. Tenant check first (the key's workspace must be
   * the caller's and the requested one), then the per-key rate window, then
   * the paid read. Test keys are rate limited but never spend reads.
   */
  async consumeRead(owner: ProfileOwner, token: string, workspaceId: string): Promise<{ readsRemaining: number; environment: ApiKeyEnvironment }> {
    const keyHash = createHash('sha256').update(token).digest('hex');
    const keys = await this.pool.query<{ id: string; workspace_id: string; billing_account_id: string; environment: ApiKeyEnvironment; revoked_at: Date | null }>(
      `SELECT id, workspace_id, billing_account_id, environment, revoked_at FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );
    const key = keys.rows[0];
    if (!key || key.revoked_at) throw new BillingError('permission_denied');
    if (key.workspace_id !== workspaceId || key.workspace_id !== owner.workspaceId) throw new BillingError('permission_denied');
    const now = this.clock.now();
    const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const limit = API_KEY_RATE_PER_MINUTE[key.environment];
    const counted = await this.pool.query<{ requests: number }>(
      `INSERT INTO api_key_windows (key_id, window_start, requests) VALUES ($1, $2, 1)
       ON CONFLICT (key_id, window_start) DO UPDATE SET requests = api_key_windows.requests + 1
       RETURNING requests`,
      [key.id, windowStart],
    );
    if ((counted.rows[0]?.requests ?? 0) > limit) {
      throw new BillingError('rate_limited', { limit, retryAt: new Date(windowStart.getTime() + 60_000).toISOString() });
    }
    // Old windows are not needed once a new minute starts.
    await this.pool.query(`DELETE FROM api_key_windows WHERE key_id = $1 AND window_start < $2`, [key.id, windowStart]);
    await this.pool.query(`UPDATE api_keys SET last_used_at = $2 WHERE id = $1`, [key.id, now]);
    if (key.environment === 'test') {
      const current = await this.pool.query<{ reads_remaining: number | null }>(
        `SELECT reads_remaining FROM organization_entitlements WHERE billing_account_id = $1 AND addon_id = 'api_package'`,
        [key.billing_account_id],
      );
      return { readsRemaining: current.rows[0]?.reads_remaining ?? 0, environment: 'test' };
    }
    const updated = await this.pool.query<{ reads_remaining: number }>(
      `UPDATE organization_entitlements
          SET reads_remaining = reads_remaining - 1
        WHERE billing_account_id = $1 AND addon_id = 'api_package' AND reads_remaining > 0
        RETURNING reads_remaining`,
      [key.billing_account_id],
    );
    if (!updated.rows[0]) throw new BillingError('quota_exhausted', { unit: 'api_read', remaining: 0 });
    return { readsRemaining: updated.rows[0].reads_remaining, environment: 'live' };
  }

  /**
   * What the Developer page can offer: each action is enabled only when its
   * add-on is on the account, and a saved brand is shown again after reload.
   */
  async developerStatus(owner: ProfileOwner): Promise<DeveloperStatus> {
    const [apiPackage, whiteLabel] = await Promise.all([this.entitlement(owner, 'api_package'), this.entitlement(owner, 'white_label')]);
    const brand = await this.pool.query<{ brand_name: string; attribution: string }>(
      `SELECT brand_name, attribution FROM white_label_configs WHERE workspace_id = $1`,
      [owner.workspaceId],
    );
    const keys = await this.pool.query<{ id: string; key_prefix: string; environment: ApiKeyEnvironment; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>(
      `SELECT id, key_prefix, environment, created_at, last_used_at, revoked_at FROM api_keys WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [owner.workspaceId],
    );
    const row = brand.rows[0];
    return {
      apiPackage,
      whiteLabel,
      brand: row ? { brandName: row.brand_name, attribution: row.attribution } : null,
      keys: keys.rows.map((key) => ({
        id: key.id,
        prefix: key.key_prefix,
        environment: key.environment,
        createdAt: key.created_at.toISOString(),
        lastUsedAt: key.last_used_at ? key.last_used_at.toISOString() : null,
        revokedAt: key.revoked_at ? key.revoked_at.toISOString() : null,
      })),
      rateLimits: { ...API_KEY_RATE_PER_MINUTE },
    };
  }

  async setWhiteLabel(owner: ProfileOwner, brandName: string, attribution: string): Promise<{ brandName: string; attribution: string }> {
    const entitlement = await this.entitlement(owner, 'white_label');
    if (!entitlement) throw new BillingError('not_purchasable', { addonId: 'white_label', priceCents: 9900 });
    if (!attribution.includes('FlacronCV')) throw new BillingError('validation_error', { field: 'attribution', reason: 'attribution_required' });
    const clean = brandName.trim();
    if (clean.length === 0) throw new BillingError('validation_error', { field: 'brandName', reason: 'invalid' });
    await this.pool.query(
      `INSERT INTO white_label_configs (workspace_id, brand_name, attribution) VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id) DO UPDATE SET brand_name = EXCLUDED.brand_name, attribution = EXCLUDED.attribution`,
      [owner.workspaceId, clean, attribution],
    );
    return { brandName: clean, attribution };
  }

  private async gate(owner: ProfileOwner, feature: FeatureId): Promise<{ account: AccountRow; snapshot: CatalogSnapshot; planId: ReturnType<typeof v2PlanOf> }> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, feature);
    return { account, snapshot, planId: v2PlanOf(snapshot, account) };
  }

  private async entitlement(owner: ProfileOwner, addonId: string): Promise<boolean> {
    const rows = await this.pool.query(
      `SELECT 1 FROM organization_entitlements WHERE billing_account_id = $1 AND addon_id = $2`,
      [owner.billingAccountId, addonId],
    );
    return rows.rows.length > 0;
  }
}

// ---------------------------------------------------------------------------

interface ScenarioRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  options: ScenarioComparison['options'];
  tradeoff: string;
  title: string;
  location_profile_ids: unknown;
  skill_report_ids: unknown;
  created_at: Date;
  updated_at: Date;
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Older rows lack the newer per-option fields; they read as unknown, never as the person's own figures. */
function scenarioView(row: ScenarioRow): SavedScenario & { locationProfileIds: string[]; skillReportIds: string[] } {
  const options = (Array.isArray(row.options) ? row.options : []).map((option) => ({
    ...option,
    sourceName: option.sourceName ?? null,
    sourceDate: option.sourceDate ?? null,
    uncertainty: option.uncertainty ?? 'unknown',
    requirements: option.requirements ?? null,
    locationProfileId: option.locationProfileId ?? null,
    skillReportId: option.skillReportId ?? null,
    wageLabel:
      option.wageCents === null || option.wageCents === undefined
        ? ('unknown' as const)
        : option.source === 'market'
          ? ('market_data' as const)
          : option.source === 'estimate'
            ? ('estimate' as const)
            : ('user_supplied' as const),
  }));
  return {
    id: row.id,
    title: row.title || options.map((option) => option.name).join(' / '),
    options,
    tradeoff: row.tradeoff,
    locationProfileIds: idList(row.location_profile_ids),
    skillReportIds: idList(row.skill_report_ids),
    createdAt: row.created_at.toISOString(),
    updatedAt: (row.updated_at ?? row.created_at).toISOString(),
  };
}

function cleanTitle(value: string | undefined, compared: ScenarioComparison): string {
  const text = (value ?? '').trim();
  if (text.length > SCENARIO_TITLE_MAX) throw new BillingError('validation_error', { field: 'title', reason: 'too_long' });
  return text || compared.options.map((option) => option.name).join(' / ').slice(0, SCENARIO_TITLE_MAX);
}

function uniqueIds(values: unknown[], field: string): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !UUID.test(value)) throw new BillingError('validation_error', { field, reason: 'invalid' });
    if (!out.includes(value)) out.push(value);
  }
  if (out.length > 10) throw new BillingError('validation_error', { field, reason: 'too_many' });
  return out;
}

interface CredentialInput {
  name: string;
  expiresOn: string;
  reviewOn?: string | null;
  issuer?: string;
  region?: string;
  factId?: string | null;
  evidenceId?: string | null;
}

interface AchievementRow {
  id: string;
  title: string;
  details: string;
  achieved_on: string | null;
  fact_id: string | null;
  evidence_id: string | null;
}

interface GoalRow {
  id: string;
  desired_title: string;
  target_date: string | null;
  status: PromotionGoalStatus;
  confirmed_fact_id: string | null;
  confirmed_at: Date | null;
}

interface CredentialRow {
  id: string;
  name: string;
  issuer: string;
  region: string;
  expires_on: string;
  review_on: string | null;
  fact_id: string | null;
  evidence_id: string | null;
}

const GOAL_COLUMNS = `id, desired_title, target_date::text AS target_date, status, confirmed_fact_id, confirmed_at`;
const CREDENTIAL_COLUMNS = `id, name, issuer, region, expires_on::text AS expires_on, review_on::text AS review_on, fact_id, evidence_id`;

function achievementView(row: AchievementRow): MaintenanceAchievement {
  return { id: row.id, title: row.title, details: row.details ?? '', achievedOn: row.achieved_on, factId: row.fact_id, evidenceId: row.evidence_id };
}

function goalView(row: GoalRow): MaintenancePromotionGoal {
  return {
    id: row.id,
    desiredTitle: row.desired_title,
    targetDate: row.target_date,
    status: row.status ?? 'open',
    confirmedFactId: row.confirmed_fact_id,
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
  };
}

function credentialView(row: CredentialRow, today: string): MaintenanceCredential {
  const nearest = row.review_on && row.review_on < row.expires_on ? row.review_on : row.expires_on;
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer ?? '',
    region: row.region ?? '',
    expiresOn: row.expires_on,
    reviewOn: row.review_on,
    due: credentialIsDue(nearest, today),
    factId: row.fact_id,
    evidenceId: row.evidence_id,
  };
}

function requiredText(value: string | undefined, max: number, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0 || text.length > max) throw new BillingError('validation_error', { field, reason: 'invalid' });
  return text;
}

function optionalText(value: string | undefined, max: number, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BillingError('validation_error', { field, reason: 'invalid' });
  const text = value.trim();
  if (text.length > max) throw new BillingError('validation_error', { field, reason: 'too_long' });
  return text;
}

/** Impossible dates (2026-02-31) are refused here rather than by the database. */
function requiredDate(value: string | undefined, field: string): string {
  if (!isCalendarDate(value)) throw new BillingError('validation_error', { field, reason: 'invalid' });
  return value;
}

function optionalDate(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredDate(value, field);
}

export const API_PACKAGE_READS = API_READS_PER_PACKAGE;
export const WHITE_LABEL_ATTRIBUTION = REQUIRED_ATTRIBUTION;
