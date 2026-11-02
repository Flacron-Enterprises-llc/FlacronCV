import { createHash, randomBytes, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  API_READS_PER_PACKAGE,
  REQUIRED_ATTRIBUTION,
  compareScenarios,
  credentialIsDue,
  formFillPayload,
  formReviewResult,
  isApplicationStatus,
  isSupportedFormSite,
  learningLoopReport,
  salesInquiryInput,
} from '@flacroncv/career-shared';
import type { FormFillPayload, ScenarioOptionInput } from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { AccountRow } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import type { CatalogSnapshot } from '../billing/catalog';
import { BillingError } from '../billing/errors';
import { RecordingMailer, type Mailer } from '../mail/mailer';
import { UnconfiguredMapTiles } from '../maps/map-tiles';
import type { MapTiles } from '../maps/map-tiles';
import { checkCapacity, requireFeature } from '../metering/access';
import { MeteringService, type JsonValue, type MeteredResult } from '../metering/metering.service';
import type { FeatureId } from '@flacroncv/career-shared';
import type { ProfileOwner } from '../profile/career-profile.service';
import type { ApplicationStatus } from '@flacroncv/career-shared';

/**
 * Where application outcomes come from. Inside V1 it is V1's Jobs tracker
 * (read-only); null means "no external tracker" and V2's own table is used.
 */
export type ApplicationOutcomeSource = (owner: ProfileOwner) => Promise<ApplicationStatus[] | null>;

const systemClock: Clock = { now: () => new Date() };

export const HUMAN_PROVIDERS = [
  { id: 'review-not-open', name: 'Named review desk', scope: 'A person reviews selected material', priceCents: null, bookingOpen: false },
] as const;

export class RemainingService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly clock: Clock = systemClock,
    private readonly tiles: MapTiles = new UnconfiguredMapTiles(),
    private readonly mailer: Mailer = new RecordingMailer(),
    private readonly outcomes: ApplicationOutcomeSource = async () => null,
  ) {}

  async createScenario(owner: ProfileOwner, options: ScenarioOptionInput[], idempotencyKey?: string): Promise<MeteredResult<JsonValue>> {
    const compared = compareScenarios(options);
    if (!compared) throw new BillingError('validation_error', { field: 'options', reason: 'invalid' });
    return this.metering.run({
      spender: owner,
      kind: 'scenario.compare',
      unit: 'scenario_report',
      feature: 'scenarioReports',
      idempotencyKey,
      body: { options },
      requestId: randomUUID(),
      execute: async () => compared,
      save: async (db, output) => {
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO career_scenarios (workspace_id, candidate_auth_user_id, options, tradeoff)
           VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
          [owner.workspaceId, owner.authUserId, JSON.stringify(output.options), output.tradeoff],
        );
        return { id: inserted.rows[0].id, options: output.options, tradeoff: output.tradeoff } as unknown as JsonValue;
      },
    });
  }

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

  async maintenance(owner: ProfileOwner): Promise<{
    achievements: Array<{ id: string; title: string }>;
    promotionGoals: Array<{ id: string; desiredTitle: string }>;
    credentials: Array<{ id: string; name: string; expiresOn: string; due: boolean }>;
  }> {
    const achievements = await this.pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM career_achievements WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    const goals = await this.pool.query<{ id: string; desired_title: string }>(
      `SELECT id, desired_title FROM career_promotion_goals WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY created_at`,
      [owner.workspaceId, owner.authUserId],
    );
    const credentials = await this.pool.query<{ id: string; name: string; expires_on: string }>(
      `SELECT id, name, expires_on::text FROM credential_reminders WHERE workspace_id = $1 AND candidate_auth_user_id = $2 ORDER BY expires_on`,
      [owner.workspaceId, owner.authUserId],
    );
    const today = this.clock.now().toISOString().slice(0, 10);
    return {
      achievements: achievements.rows,
      promotionGoals: goals.rows.map((row) => ({ id: row.id, desiredTitle: row.desired_title })),
      credentials: credentials.rows.map((row) => ({
        id: row.id,
        name: row.name,
        expiresOn: row.expires_on,
        due: credentialIsDue(row.expires_on, today),
      })),
    };
  }

  async addAchievement(owner: ProfileOwner, title: string): Promise<{ id: string; title: string }> {
    const clean = title.trim();
    if (clean.length === 0 || clean.length > 200) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO career_achievements (workspace_id, candidate_auth_user_id, title) VALUES ($1, $2, $3) RETURNING id`,
      [owner.workspaceId, owner.authUserId, clean],
    );
    return { id: inserted.rows[0].id, title: clean };
  }

  async addPromotionGoal(owner: ProfileOwner, desiredTitle: string): Promise<{ id: string; desiredTitle: string }> {
    const clean = desiredTitle.trim();
    if (clean.length === 0 || clean.length > 200) throw new BillingError('validation_error', { field: 'desiredTitle', reason: 'invalid' });
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO career_promotion_goals (workspace_id, candidate_auth_user_id, desired_title) VALUES ($1, $2, $3) RETURNING id`,
      [owner.workspaceId, owner.authUserId, clean],
    );
    return { id: inserted.rows[0].id, desiredTitle: clean };
  }

  async addCredential(owner: ProfileOwner, name: string, expiresOn: string): Promise<{ id: string; name: string; expiresOn: string; due: boolean }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new BillingError('validation_error', { field: 'expiresOn', reason: 'invalid' });
    const clean = name.trim();
    if (clean.length === 0) throw new BillingError('validation_error', { field: 'name', reason: 'invalid' });
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO credential_reminders (workspace_id, candidate_auth_user_id, name, expires_on) VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner.workspaceId, owner.authUserId, clean, expiresOn],
    );
    const today = this.clock.now().toISOString().slice(0, 10);
    return { id: inserted.rows[0].id, name: clean, expiresOn, due: credentialIsDue(expiresOn, today) };
  }

  async mapList(owner: ProfileOwner): Promise<{
    items: Array<{ id: string; title: string; approximate: true; coordinates: null }>;
    tiles: null;
    attribution: null;
    provider: null;
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
    };
  }

  async startMap(owner: ProfileOwner, idempotencyKey?: string): Promise<MeteredResult<JsonValue>> {
    const view = this.tiles.sessionView();
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

  async addStaff(owner: ProfileOwner, authUserId: string, role: string): Promise<{ id: string }> {
    const { snapshot, account } = await this.gate(owner, 'staffSeats');
    if (role !== 'counselor' && role !== 'manager') throw new BillingError('validation_error', { field: 'role', reason: 'invalid' });
    const used = await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM business_staff WHERE workspace_id = $1`, [owner.workspaceId]);
    checkCapacity(snapshot, account, 'staffSeats', used.rows[0].n, 1);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO business_staff (workspace_id, auth_user_id, role) VALUES ($1, $2, $3) RETURNING id`,
      [owner.workspaceId, authUserId, role],
    );
    return { id: inserted.rows[0].id };
  }

  async inviteCandidate(owner: ProfileOwner, email: string, consent: boolean): Promise<{ id: string }> {
    const { snapshot, account } = await this.gate(owner, 'activeCandidates');
    if (!consent) throw new BillingError('validation_error', { field: 'consent', reason: 'required' });
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) throw new BillingError('validation_error', { field: 'email', reason: 'invalid' });
    const used = await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM business_candidates WHERE workspace_id = $1`, [owner.workspaceId]);
    checkCapacity(snapshot, account, 'activeCandidates', used.rows[0].n, 1);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO business_candidates (workspace_id, email, consent) VALUES ($1, $2, true) RETURNING id`,
      [owner.workspaceId, clean],
    );
    return { id: inserted.rows[0].id };
  }

  async assignCounselor(owner: ProfileOwner, staffId: string, candidateId: string): Promise<{ ok: true }> {
    await this.gate(owner, 'staffSeats');
    const staff = await this.ownedStaff(owner, staffId);
    const candidate = await this.ownedCandidate(owner, candidateId);
    if (staff.role !== 'counselor') throw new BillingError('validation_error', { field: 'staffId', reason: 'not_counselor' });
    await this.pool.query(
      `INSERT INTO business_assignments (staff_id, candidate_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [staff.id, candidate.id],
    );
    return { ok: true };
  }

  async getCandidate(owner: ProfileOwner, candidateId: string): Promise<{ id: string; email: string }> {
    const rows = await this.pool.query<{ id: string; email: string; workspace_id: string }>(
      `SELECT id, email, workspace_id FROM business_candidates WHERE id = $1`,
      [candidateId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    const account = await this.pool.query<{ auth_user_id: string }>(
      `SELECT auth_user_id FROM billing_accounts WHERE workspace_id = $1`,
      [row.workspace_id],
    );
    if (account.rows[0]?.auth_user_id === owner.authUserId) return { id: row.id, email: row.email };
    const staff = await this.pool.query<{ id: string; role: string }>(
      `SELECT id, role FROM business_staff WHERE workspace_id = $1 AND auth_user_id = $2`,
      [row.workspace_id, owner.authUserId],
    );
    if (staff.rows[0]?.role === 'counselor') {
      const assigned = await this.pool.query(
        `SELECT 1 FROM business_assignments WHERE staff_id = $1 AND candidate_id = $2`,
        [staff.rows[0].id, row.id],
      );
      if (assigned.rows.length > 0) return { id: row.id, email: row.email };
    }
    throw new BillingError('permission_denied');
  }

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

  async recruitingSearch(): Promise<{ items: Array<{ candidateAuthUserId: string; label: string }> }> {
    const rows = await this.pool.query<{ candidate_auth_user_id: string }>(
      `SELECT candidate_auth_user_id FROM recruiting_opt_ins WHERE discoverable = true ORDER BY candidate_auth_user_id`,
    );
    return { items: rows.rows.map((row) => ({ candidateAuthUserId: row.candidate_auth_user_id, label: 'Opted-in candidate' })) };
  }

  employerCheckout(): never {
    throw new BillingError('not_purchasable', { reason: 'employer_pricing_not_set' });
  }

  async createApiKey(owner: ProfileOwner): Promise<{ id: string; token: string; prefix: string }> {
    const entitlement = await this.entitlement(owner, 'api_package');
    if (!entitlement) throw new BillingError('not_purchasable', { addonId: 'api_package', priceCents: 9900 });
    const token = `flc_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(token).digest('hex');
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO api_keys (workspace_id, billing_account_id, key_hash, key_prefix) VALUES ($1, $2, $3, $4) RETURNING id`,
      [owner.workspaceId, owner.billingAccountId, keyHash, token.slice(0, 8)],
    );
    return { id: inserted.rows[0].id, token, prefix: token.slice(0, 8) };
  }

  async consumeRead(owner: ProfileOwner, token: string, workspaceId: string): Promise<{ readsRemaining: number }> {
    const keyHash = createHash('sha256').update(token).digest('hex');
    const keys = await this.pool.query<{ workspace_id: string; billing_account_id: string }>(
      `SELECT workspace_id, billing_account_id FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );
    const key = keys.rows[0];
    if (!key) throw new BillingError('permission_denied');
    if (key.workspace_id !== workspaceId || key.workspace_id !== owner.workspaceId) throw new BillingError('permission_denied');
    const updated = await this.pool.query<{ reads_remaining: number }>(
      `UPDATE organization_entitlements
          SET reads_remaining = reads_remaining - 1
        WHERE billing_account_id = $1 AND addon_id = 'api_package' AND reads_remaining > 0
        RETURNING reads_remaining`,
      [key.billing_account_id],
    );
    if (!updated.rows[0]) throw new BillingError('quota_exhausted', { unit: 'api_read', remaining: 0 });
    return { readsRemaining: updated.rows[0].reads_remaining };
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

  private async ownedStaff(owner: ProfileOwner, staffId: string): Promise<{ id: string; role: string }> {
    const rows = await this.pool.query<{ id: string; role: string; workspace_id: string }>(
      `SELECT id, role, workspace_id FROM business_staff WHERE id = $1`,
      [staffId],
    );
    const row = rows.rows[0];
    if (!row || row.workspace_id !== owner.workspaceId) throw new BillingError('permission_denied');
    return row;
  }

  private async ownedCandidate(owner: ProfileOwner, candidateId: string): Promise<{ id: string }> {
    const rows = await this.pool.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM business_candidates WHERE id = $1`,
      [candidateId],
    );
    const row = rows.rows[0];
    if (!row || row.workspace_id !== owner.workspaceId) throw new BillingError('permission_denied');
    return row;
  }
}

export const API_PACKAGE_READS = API_READS_PER_PACKAGE;
export const WHITE_LABEL_ATTRIBUTION = REQUIRED_ATTRIBUTION;
