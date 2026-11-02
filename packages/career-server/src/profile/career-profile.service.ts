import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import {
  EMPTY_PREFERENCES,
  MAX_FACTS_PER_CANDIDATE,
  countFacts,
  importDay,
  isFactType,
  missingRequiredFields,
  validateFactValue,
  validatePreferences,
} from '@flacroncv/career-shared';
import type {
  CareerPreferences,
  FactConfirmation,
  FactCounts,
  FactSource,
  FactType,
  FactValue,
  UncertainFields,
} from '@flacroncv/career-shared';
import type { TextModel } from '../ai/text-model';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import type { Db } from '../billing/db';
import { BillingError } from '../billing/errors';
import type { Principal } from '../identity/identity.service';
import {
  RESUME_IMPORT_SCHEMA_VERSION,
  RESUME_IMPORT_TEMPLATE_VERSION,
  RESUME_TEXT_MAX,
  missingSections,
  parseResume,
} from './resume-import';
import type { ImportedFact } from './resume-import';

/** The caller's own profile: one workspace and one candidate. */
export type ProfileOwner = Pick<Principal, 'workspaceId' | 'authUserId' | 'billingAccountId'>;

export interface FactView {
  id: string;
  factType: FactType;
  value: FactValue;
  source: FactSource;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  /** Required fields still empty. Confirming needs them. */
  missingFields: string[];
  importId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
}

export interface FactRevisionView {
  revision: number;
  value: FactValue;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  change: 'created' | 'edited' | 'confirmed';
  changedAt: Date;
}

export interface ProfileView {
  /** 0 until the first fact or preference is saved. Match results are cached per version. */
  version: number;
  preferences: CareerPreferences;
  counts: FactCounts;
}

export interface ImportAllowance {
  limit: number;
  used: number;
  pending: number;
  remaining: number;
  resetsAt: Date;
}

export interface ImportResult {
  importId: string;
  facts: FactView[];
  /** Core sections the file did not contain. Not filled with a guess. */
  missing: FactType[];
  importsRemaining: number;
  resetsAt: Date;
}

export interface CreateFactInput {
  factType?: unknown;
  value?: unknown;
  source?: unknown;
  confirmation?: unknown;
}

export interface ImportInput {
  text?: unknown;
  fileName?: unknown;
  format?: unknown;
}

interface FactRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  fact_type: FactType;
  value: FactValue;
  source: FactSource;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  import_id: string | null;
  revision: number;
  created_at: Date;
  updated_at: Date;
  confirmed_at: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPORT_FORMATS = ['pdf', 'docx', 'text'] as const;
type ImportFormat = (typeof IMPORT_FORMATS)[number];

const systemClock: Clock = { now: () => new Date() };

/**
 * CV01 career facts and preferences (DATA_MODEL `career_facts`). Nothing
 * here writes `usage_ledger`: manual edits, confirmations and imports cost
 * no unit (API_CONTRACT "Units charged"). Import is limited per UTC day
 * instead.
 */
export class CareerProfileService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly model: TextModel,
    private readonly clock: Clock = systemClock,
  ) {}

  async listFacts(owner: ProfileOwner): Promise<{ items: FactView[]; profileVersion: number }> {
    const res = await this.pool.query<FactRow>(
      `SELECT * FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY fact_type, created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return { items: res.rows.map(toView), profileVersion: await this.version(this.pool, owner) };
  }

  async getFact(owner: ProfileOwner, factId: string): Promise<FactView> {
    return toView(await this.ownFact(this.pool, owner, factId, false));
  }

  async history(owner: ProfileOwner, factId: string): Promise<FactRevisionView[]> {
    await this.ownFact(this.pool, owner, factId, false);
    const res = await this.pool.query<{
      revision: number;
      value: FactValue;
      confirmation: FactConfirmation;
      uncertain: UncertainFields;
      change: FactRevisionView['change'];
      changed_at: Date;
    }>(`SELECT * FROM career_fact_revisions WHERE fact_id = $1 ORDER BY revision`, [factId]);
    return res.rows.map((r) => ({
      revision: r.revision,
      value: r.value,
      confirmation: r.confirmation,
      uncertain: r.uncertain,
      change: r.change,
      changedAt: r.changed_at,
    }));
  }

  /**
   * A fact the person typed or pasted. It is a draft unless a manual fact
   * is sent already confirmed, which needs every required field.
   * `import` and `migrated` are not accepted here.
   */
  async createFact(owner: ProfileOwner, input: CreateFactInput): Promise<FactView> {
    if (!isFactType(input.factType)) throw new BillingError('validation_error', { field: 'factType' });
    const factType = input.factType;
    const source = input.source ?? 'manual';
    if (source !== 'manual' && source !== 'paste') throw new BillingError('validation_error', { field: 'source' });
    const confirmation = input.confirmation ?? 'draft';
    if (confirmation !== 'draft' && confirmation !== 'confirmed') {
      throw new BillingError('validation_error', { field: 'confirmation' });
    }
    if (confirmation === 'confirmed' && source !== 'manual') {
      throw new BillingError('validation_error', { field: 'confirmation', reason: 'paste_starts_as_draft' });
    }
    const value = checked(factType, input.value, confirmation);

    return withTransaction(this.pool, async (db) => {
      await this.lockProfile(db, owner);
      await this.bumpVersion(db, owner);
      await this.assertRoom(db, owner, 1);
      await this.assertExperienceLink(db, owner, factType, value);
      const now = this.clock.now();
      const row = await insertFact(db, owner, {
        factType,
        value,
        source,
        confirmation,
        uncertain: {},
        importId: null,
        now,
      });
      return toView(row);
    });
  }

  /**
   * Replaces the fields sent; a field sent as `null` is cleared. A field
   * the person edits is no longer uncertain. A confirmed fact stays
   * confirmed (the person typed the change) and must stay complete.
   */
  async updateFact(owner: ProfileOwner, factId: string, patch: unknown): Promise<FactView> {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new BillingError('validation_error', { field: 'value' });
    }
    return withTransaction(this.pool, async (db) => {
      await this.lockProfile(db, owner);
      const current = await this.ownFact(db, owner, factId, true);
      const changes = patch as Record<string, unknown>;
      const merged = { ...current.value, ...changes };
      const value = checked(current.fact_type, merged, current.confirmation);
      const uncertain = { ...current.uncertain };
      for (const field of Object.keys(changes)) delete uncertain[field];
      if (sameJson(value, current.value) && sameJson(uncertain, current.uncertain)) return toView(current);

      await this.bumpVersion(db, owner);
      await this.assertExperienceLink(db, owner, current.fact_type, value);
      const row = await updateFact(db, current, { value, uncertain, confirmation: current.confirmation }, 'edited', this.clock.now());
      return toView(row);
    });
  }

  /**
   * The person accepts the fact as it is now, including fields the import
   * flagged. Their flags are cleared. Incomplete facts are refused with
   * the missing fields.
   */
  async confirmFact(owner: ProfileOwner, factId: string): Promise<FactView> {
    return withTransaction(this.pool, async (db) => {
      await this.lockProfile(db, owner);
      const current = await this.ownFact(db, owner, factId, true);
      if (current.confirmation === 'confirmed') return toView(current);
      const value = checked(current.fact_type, current.value, 'confirmed');
      await this.bumpVersion(db, owner);
      await this.assertExperienceLink(db, owner, current.fact_type, value);
      const row = await updateFact(db, current, { value, uncertain: {}, confirmation: 'confirmed' }, 'confirmed', this.clock.now());
      return toView(row);
    });
  }

  /** Removes the fact and its history. Achievements that pointed at a deleted role lose the link. */
  async deleteFact(owner: ProfileOwner, factId: string): Promise<void> {
    await withTransaction(this.pool, async (db) => {
      await this.lockProfile(db, owner);
      const current = await this.ownFact(db, owner, factId, true);
      await this.bumpVersion(db, owner);
      if (current.fact_type === 'experience') {
        const linked = await db.query<FactRow>(
          `SELECT * FROM career_facts
            WHERE workspace_id = $1 AND candidate_auth_user_id = $2
              AND fact_type = 'achievement' AND value->>'experienceFactId' = $3
            FOR UPDATE`,
          [owner.workspaceId, owner.authUserId, current.id],
        );
        const now = this.clock.now();
        for (const achievement of linked.rows) {
          await updateFact(
            db,
            achievement,
            {
              value: { ...achievement.value, experienceFactId: null },
              uncertain: achievement.uncertain,
              confirmation: achievement.confirmation,
            },
            'edited',
            now,
          );
        }
      }
      await db.query(`DELETE FROM career_facts WHERE id = $1`, [current.id]);
    });
  }

  async profile(owner: ProfileOwner): Promise<ProfileView> {
    const res = await this.pool.query<{ version: number; preferences: Partial<CareerPreferences> }>(
      `SELECT version, preferences FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const facts = await this.pool.query<Pick<FactRow, 'fact_type' | 'confirmation' | 'uncertain'>>(
      `SELECT fact_type, confirmation, uncertain FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const row = res.rows[0];
    return {
      version: row?.version ?? 0,
      preferences: { ...EMPTY_PREFERENCES, ...(row?.preferences ?? {}) },
      counts: countFacts(
        facts.rows.map((f) => ({ factType: f.fact_type, confirmation: f.confirmation, uncertain: f.uncertain })),
      ),
    };
  }

  /** Replaces the whole preferences object. A key left out is its empty default. */
  async setPreferences(owner: ProfileOwner, raw: unknown): Promise<ProfileView> {
    const result = validatePreferences(raw);
    if (!result.ok) throw new BillingError('validation_error', { errors: result.errors });
    await withTransaction(this.pool, async (db) => {
      await this.lockProfile(db, owner);
      await this.bumpVersion(db, owner);
      await db.query(
        `UPDATE career_profiles SET preferences = $3 WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
        [owner.workspaceId, owner.authUserId, JSON.stringify(result.value)],
      );
    });
    return this.profile(owner);
  }

  async importAllowance(owner: ProfileOwner): Promise<ImportAllowance> {
    const limit = await this.dailyImportLimit(owner);
    const { day, resetsAt } = importDay(this.clock.now());
    const res = await this.pool.query<{ count: number; pending: number }>(
      `SELECT count, pending FROM import_daily_counts WHERE auth_user_id = $1 AND usage_date = $2`,
      [owner.authUserId, day],
    );
    const used = res.rows[0]?.count ?? 0;
    const pending = res.rows[0]?.pending ?? 0;
    return { limit, used, pending, remaining: Math.max(0, limit - used - pending), resetsAt };
  }

  /**
   * Resume text in, draft facts out (API_CONTRACT `POST /imports`). The
   * file is read on the device; the API receives its text. A slot for the
   * UTC day is held while the model runs; only a saved import counts.
   * Failure, timeout, or unusable output give the slot back and save
   * nothing. No unit is reserved.
   */
  async importResume(owner: ProfileOwner, input: ImportInput): Promise<ImportResult> {
    const { text, fileName, format } = checkImportInput(input);
    const limit = await this.dailyImportLimit(owner);
    const { day, resetsAt } = importDay(this.clock.now());
    await this.takeImportSlot(owner, day, limit, resetsAt);

    let counted = false;
    try {
      const parsed = await parseResume(this.model, text);
      const result = await withTransaction(this.pool, async (db) => {
        await this.lockProfile(db, owner);
        await this.bumpVersion(db, owner);
        const total = parsed.facts.reduce((n, f) => n + 1 + f.achievements.length, 0);
        await this.assertRoom(db, owner, total);
        const imported = await db.query<{ id: string }>(
          `INSERT INTO resume_imports
             (workspace_id, candidate_auth_user_id, file_name, format, text_sha256, char_count,
              provider, model, prompt_template_version, output_schema_version, fact_count, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            owner.workspaceId,
            owner.authUserId,
            fileName,
            format,
            createHash('sha256').update(text).digest('hex'),
            text.length,
            parsed.response.provider,
            parsed.response.model,
            RESUME_IMPORT_TEMPLATE_VERSION,
            RESUME_IMPORT_SCHEMA_VERSION,
            total,
            this.clock.now(),
          ],
        );
        const importId = imported.rows[0].id;
        const facts = await insertImported(db, owner, parsed.facts, importId, this.clock.now());
        const counts = await db.query<{ count: number }>(
          `UPDATE import_daily_counts SET count = count + 1, pending = pending - 1
            WHERE auth_user_id = $1 AND usage_date = $2
            RETURNING count`,
          [owner.authUserId, day],
        );
        return { importId, facts, used: counts.rows[0].count };
      });
      counted = true;
      return {
        importId: result.importId,
        facts: result.facts.map(toView),
        missing: missingSections(parsed.facts),
        importsRemaining: Math.max(0, limit - result.used - (await this.pendingFor(owner, day))),
        resetsAt,
      };
    } finally {
      if (!counted) {
        await this.pool
          .query(
            `UPDATE import_daily_counts SET pending = GREATEST(pending - 1, 0) WHERE auth_user_id = $1 AND usage_date = $2`,
            [owner.authUserId, day],
          )
          .catch(() => undefined);
      }
    }
  }

  private async takeImportSlot(owner: ProfileOwner, day: string, limit: number, resetsAt: Date): Promise<void> {
    if (limit > 0) {
      const taken = await this.pool.query(
        `INSERT INTO import_daily_counts (auth_user_id, usage_date, count, pending) VALUES ($1, $2, 0, 1)
         ON CONFLICT (auth_user_id, usage_date) DO UPDATE SET pending = import_daily_counts.pending + 1
          WHERE import_daily_counts.count + import_daily_counts.pending < $3`,
        [owner.authUserId, day, limit],
      );
      if (taken.rowCount === 1) return;
    }
    const res = await this.pool.query<{ count: number; pending: number }>(
      `SELECT count, pending FROM import_daily_counts WHERE auth_user_id = $1 AND usage_date = $2`,
      [owner.authUserId, day],
    );
    const used = (res.rows[0]?.count ?? 0) + (res.rows[0]?.pending ?? 0);
    throw new BillingError('import_daily_limit', { limit, used, resetsAt: resetsAt.toISOString() });
  }

  private async pendingFor(owner: ProfileOwner, day: string): Promise<number> {
    const res = await this.pool.query<{ pending: number }>(
      `SELECT pending FROM import_daily_counts WHERE auth_user_id = $1 AND usage_date = $2`,
      [owner.authUserId, day],
    );
    return res.rows[0]?.pending ?? 0;
  }

  private async dailyImportLimit(owner: ProfileOwner): Promise<number> {
    const res = await this.pool.query<{ catalog_version: string }>(
      `SELECT catalog_version FROM billing_accounts WHERE id = $1`,
      [owner.billingAccountId],
    );
    const version = res.rows[0]?.catalog_version;
    if (!version) throw new BillingError('not_found', { billingAccountId: owner.billingAccountId });
    return (await this.catalogs.get(this.pool, version)).dailyImportLimit;
  }

  /**
   * Every write transaction takes this first, before any row lock, so
   * writes to one profile run one at a time in one lock order and the
   * count check cannot race.
   */
  private async lockProfile(db: Db, owner: ProfileOwner): Promise<void> {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `profile:${owner.workspaceId}:${owner.authUserId}`,
    ]);
  }

  /** The profile moved to a new version; match results cached on the old one are stale. */
  private async bumpVersion(db: Db, owner: ProfileOwner): Promise<void> {
    await db.query(
      `INSERT INTO career_profiles (workspace_id, candidate_auth_user_id, version, updated_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (workspace_id, candidate_auth_user_id)
       DO UPDATE SET version = career_profiles.version + 1, updated_at = EXCLUDED.updated_at`,
      [owner.workspaceId, owner.authUserId, this.clock.now()],
    );
  }

  private async version(db: Db, owner: ProfileOwner): Promise<number> {
    const res = await db.query<{ version: number }>(
      `SELECT version FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    return res.rows[0]?.version ?? 0;
  }

  private async assertRoom(db: Db, owner: ProfileOwner, adding: number): Promise<void> {
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    if (res.rows[0].n + adding > MAX_FACTS_PER_CANDIDATE) {
      throw new BillingError('validation_error', { reason: 'too_many_facts', limit: MAX_FACTS_PER_CANDIDATE });
    }
  }

  /** An achievement may point only at one of this person's own roles. */
  private async assertExperienceLink(db: Db, owner: ProfileOwner, type: FactType, value: FactValue): Promise<void> {
    if (type !== 'achievement' || typeof value.experienceFactId !== 'string') return;
    const res = await db.query(
      `SELECT 1 FROM career_facts
        WHERE id = $1 AND workspace_id = $2 AND candidate_auth_user_id = $3 AND fact_type = 'experience'`,
      [value.experienceFactId, owner.workspaceId, owner.authUserId],
    );
    if (res.rowCount !== 1) throw new BillingError('validation_error', { field: 'experienceFactId' });
  }

  /** `not_found` for no such fact; `permission_denied` for someone else's. */
  private async ownFact(db: Db, owner: ProfileOwner, factId: string, lock: boolean): Promise<FactRow> {
    if (!UUID.test(factId)) throw new BillingError('not_found', { factId });
    const res = await db.query<FactRow>(`SELECT * FROM career_facts WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [factId]);
    const row = res.rows[0];
    if (!row) throw new BillingError('not_found', { factId });
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }
}

function checked(type: FactType, raw: unknown, mode: FactConfirmation): FactValue {
  const result = validateFactValue(type, raw, mode);
  if (!result.ok) throw new BillingError('validation_error', { errors: result.errors });
  return result.value;
}

function checkImportInput(input: ImportInput): { text: string; fileName: string | null; format: ImportFormat } {
  const text = typeof input.text === 'string' ? input.text.replace(/\r\n/g, '\n').trim() : '';
  if (text.length === 0) throw new BillingError('validation_error', { field: 'text', reason: 'empty' });
  if (text.length > RESUME_TEXT_MAX) throw new BillingError('validation_error', { field: 'text', reason: 'too_long' });
  const format = IMPORT_FORMATS.find((f) => f === (input.format ?? 'text'));
  if (format === undefined) throw new BillingError('validation_error', { field: 'format' });
  let fileName: string | null = null;
  if (input.fileName !== undefined && input.fileName !== null) {
    if (typeof input.fileName !== 'string' || input.fileName.length > 255) {
      throw new BillingError('validation_error', { field: 'fileName' });
    }
    fileName = input.fileName.trim() || null;
  }
  return { text, fileName, format };
}

interface NewFact {
  factType: FactType;
  value: FactValue;
  source: FactSource;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
  importId: string | null;
  now: Date;
}

async function insertFact(db: Db, owner: ProfileOwner, fact: NewFact): Promise<FactRow> {
  const res = await db.query<FactRow>(
    `INSERT INTO career_facts
       (workspace_id, candidate_auth_user_id, fact_type, value, source, confirmation, uncertain,
        import_id, revision, created_at, updated_at, confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9, $10)
     RETURNING *`,
    [
      owner.workspaceId,
      owner.authUserId,
      fact.factType,
      JSON.stringify(fact.value),
      fact.source,
      fact.confirmation,
      JSON.stringify(fact.uncertain),
      fact.importId,
      fact.now,
      fact.confirmation === 'confirmed' ? fact.now : null,
    ],
  );
  const row = res.rows[0];
  await recordRevision(db, row, 'created', fact.now);
  return row;
}

async function updateFact(
  db: Db,
  current: FactRow,
  next: { value: FactValue; uncertain: UncertainFields; confirmation: FactConfirmation },
  change: 'edited' | 'confirmed',
  now: Date,
): Promise<FactRow> {
  const res = await db.query<FactRow>(
    `UPDATE career_facts
        SET value = $2, uncertain = $3, confirmation = $4, revision = revision + 1, updated_at = $5,
            confirmed_at = CASE WHEN $4 = 'confirmed' THEN COALESCE(confirmed_at, $5) ELSE NULL END
      WHERE id = $1
      RETURNING *`,
    [current.id, JSON.stringify(next.value), JSON.stringify(next.uncertain), next.confirmation, now],
  );
  const row = res.rows[0];
  await recordRevision(db, row, change, now);
  return row;
}

async function recordRevision(db: Db, row: FactRow, change: FactRevisionView['change'], now: Date): Promise<void> {
  await db.query(
    `INSERT INTO career_fact_revisions (fact_id, revision, value, confirmation, uncertain, change, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.revision, JSON.stringify(row.value), row.confirmation, JSON.stringify(row.uncertain), change, now],
  );
}

async function insertImported(
  db: PoolClient,
  owner: ProfileOwner,
  facts: ImportedFact[],
  importId: string,
  now: Date,
): Promise<FactRow[]> {
  const rows: FactRow[] = [];
  for (const fact of facts) {
    const row = await insertFact(db, owner, {
      factType: fact.factType,
      value: fact.value,
      source: 'import',
      confirmation: 'draft',
      uncertain: fact.uncertain,
      importId,
      now,
    });
    rows.push(row);
    for (const achievement of fact.achievements) {
      rows.push(
        await insertFact(db, owner, {
          factType: 'achievement',
          value: { ...achievement.value, experienceFactId: row.id },
          source: 'import',
          confirmation: 'draft',
          uncertain: achievement.uncertain,
          importId,
          now,
        }),
      );
    }
  }
  return rows;
}

function toView(row: FactRow): FactView {
  return {
    id: row.id,
    factType: row.fact_type,
    value: row.value,
    source: row.source,
    confirmation: row.confirmation,
    uncertain: row.uncertain,
    missingFields: missingRequiredFields(row.fact_type, row.value),
    importId: row.import_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
