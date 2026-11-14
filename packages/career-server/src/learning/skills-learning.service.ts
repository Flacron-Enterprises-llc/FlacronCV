import { randomUUID } from 'crypto';
import { Pool, type PoolClient } from 'pg';
import {
  computeLearningProgress,
  isFactType,
  type BridgeRole,
  type CreateSkillReportInput,
  type LearningPlanMilestone,
  type LearningProgress,
  type ProjectBrief,
  type ResumeFactInput,
  type RubricCheckInput,
  type RubricCriterionCheck,
  type SkillGapItem,
  type SkillGapReport,
  type TransferableSkill,
} from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount, v2PlanOf } from '../billing/accounts';
import { unitBalance } from '../billing/entitlements';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { BillingError, isBillingError } from '../billing/errors';
import { EvidenceService } from '../evidence/evidence.service';
import { MeteringService, type JsonValue, type MeteredResult } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import {
  LEARNING_PLAN_SYSTEM,
  LEARNING_PLAN_TEMPLATE,
  SKILL_REPORT_SCHEMA,
  learningPlanPrompt,
  parseLearningPlan,
} from './learning-plan-compose';

interface SkillReportGeneratedData {
  skillGaps: SkillGapItem[];
  learningPlan: LearningPlanMilestone[];
  projectBrief: ProjectBrief | null;
  bridgeRoles: BridgeRole[];
  transferableSkills: TransferableSkill[];
  progress: LearningProgress;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Same bound as an evidence item's ownership statement. */
const OWNERSHIP_MAX = 2000;
const RUBRIC_NOTE_MAX = 1000;
const RUBRIC_EVIDENCE_MAX = 10;

const COLUMNS = `id, workspace_id, candidate_auth_user_id, target_role, target_industry,
       time_budget_hours_per_week, financial_budget_cents, skill_gaps,
       learning_plan, project_brief, bridge_roles, transferable_skills, progress, created_at, updated_at`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface SkillGapReportRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  target_role: string;
  target_industry: string | null;
  time_budget_hours_per_week: number;
  financial_budget_cents: number;
  skill_gaps: SkillGapItem[];
  learning_plan: LearningPlanMilestone[];
  project_brief: ProjectBrief | null;
  bridge_roles: BridgeRole[] | null;
  transferable_skills: TransferableSkill[] | null;
  progress: LearningProgress;
  created_at: Date;
  updated_at: Date;
}

export interface SkillReportBalanceView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface SkillReportList {
  items: SkillGapReport[];
  skillReport: SkillReportBalanceView;
}

/** `created` is false when the item already existed and was returned instead of duplicated. */
export interface LearningEvidenceResult {
  evidenceId: string;
  created: boolean;
}

export class SkillsLearningService {
  private readonly catalogs = new CatalogStore();
  private readonly evidence: EvidenceService;

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly model: TextModel,
    evidence?: EvidenceService,
  ) {
    // Evidence items are created through the Evidence Vault service so its
    // feature switch and plan capacity apply exactly as they do on the vault page.
    this.evidence = evidence ?? new EvidenceService(pool);
  }

  async list(owner: ProfileOwner): Promise<SkillReportList> {
    const rows = await this.pool.query<SkillGapReportRow>(
      `SELECT ${COLUMNS}
         FROM skill_gap_reports
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => this.view(row)),
      skillReport: await this.skillReportBalance(owner),
    };
  }

  async get(owner: ProfileOwner, id: string): Promise<SkillGapReport> {
    const row = await this.load(this.pool, owner, id);
    return this.view(row);
  }

  async create(
    owner: ProfileOwner,
    input: CreateSkillReportInput,
    idempotencyKey?: string,
  ): Promise<MeteredResult<{ report: SkillGapReport }>> {
    const targetRole = typeof input?.targetRole === 'string' ? input.targetRole.trim() : '';
    if (!targetRole) {
      throw new BillingError('validation_error', { field: 'targetRole', reason: 'required' });
    }

    const timeBudget = Number.isInteger(input?.timeBudgetHoursPerWeek) && Number(input.timeBudgetHoursPerWeek) > 0
      ? Number(input.timeBudgetHoursPerWeek)
      : 5;
    const financialBudget = Number.isInteger(input?.financialBudgetCents) && Number(input.financialBudgetCents) >= 0
      ? Number(input.financialBudgetCents)
      : 0;
    // The catalog decides whether a report may carry a project brief (Free: no;
    // Free also has no skill reports, so this is a guard, not a visible change).
    const includeProjectBrief = input?.includeProjectBrief !== false && (await this.projectBriefAllowed(owner));

    const facts = await this.loadFacts(owner);
    const confirmedFacts = facts.filter((f) => f.confirmation === 'confirmed');

    const body = {
      targetRole,
      targetIndustry: input?.targetIndustry ?? null,
      timeBudget,
      financialBudget,
      includeProjectBrief,
    };

    const result = await this.metering.run<SkillReportGeneratedData, JsonValue>({
      spender: owner,
      kind: 'learning.skill_report',
      unit: 'skill_report',
      feature: 'skillReports',
      idempotencyKey,
      body,
      requestId: randomUUID(),
      provenance: {
        promptTemplateVersion: LEARNING_PLAN_TEMPLATE,
        outputSchemaVersion: SKILL_REPORT_SCHEMA,
        inputVersions: {
          profileFactCount: confirmedFacts.length,
        },
      },
      execute: async () =>
        this.generateReport(targetRole, input?.targetIndustry ?? null, timeBudget, financialBudget, includeProjectBrief, confirmedFacts),
      save: async (db, reportData) => {
        const res = await db.query<SkillGapReportRow>(
          `INSERT INTO skill_gap_reports
             (workspace_id, candidate_auth_user_id, target_role, target_industry,
              time_budget_hours_per_week, financial_budget_cents, skill_gaps,
              learning_plan, project_brief, bridge_roles, transferable_skills, progress)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING ${COLUMNS}`,
          [
            owner.workspaceId,
            owner.authUserId,
            targetRole,
            input?.targetIndustry ?? null,
            timeBudget,
            financialBudget,
            JSON.stringify(reportData.skillGaps),
            JSON.stringify(reportData.learningPlan),
            reportData.projectBrief ? JSON.stringify(reportData.projectBrief) : null,
            JSON.stringify(reportData.bridgeRoles),
            JSON.stringify(reportData.transferableSkills),
            JSON.stringify(reportData.progress),
          ],
        );
        return { report: this.view(res.rows[0]) } as unknown as JsonValue;
      },
    });

    return result as unknown as MeteredResult<{ report: SkillGapReport }>;
  }

  async updateProgress(
    owner: ProfileOwner,
    id: string,
    milestoneId: string,
    completed: boolean,
  ): Promise<SkillGapReport> {
    return withTransaction(this.pool, async (tx) => {
      const current = await this.load(tx, owner, id, true);
      if (!current.learning_plan.some((m) => m.id === milestoneId)) throw new BillingError('not_found', { milestoneId });
      const progress = progressOf(current);
      let completedIds = [...progress.completedMilestoneIds];
      if (completed) {
        if (!completedIds.includes(milestoneId)) completedIds.push(milestoneId);
      } else {
        completedIds = completedIds.filter((mId) => mId !== milestoneId);
      }
      // Evidence already recorded for a milestone stays linked even if the box
      // is unticked, so ticking it again cannot create a second item.
      const next: LearningProgress = {
        ...computeLearningProgress(current.learning_plan, completedIds),
        evidenceByMilestone: progress.evidenceByMilestone ?? {},
      };
      return this.view(await this.saveProgress(tx, current.id, next));
    });
  }

  /**
   * Records a completed milestone in the Evidence Vault. The ownership
   * statement is the person's own text (or empty); nothing is written for
   * them. A repeat returns the item already created instead of a duplicate,
   * unless the person deleted it from the vault.
   */
  async convertToEvidence(
    owner: ProfileOwner,
    reportId: string,
    milestoneId: string,
    input: { ownershipStatement?: string } = {},
  ): Promise<LearningEvidenceResult> {
    const ownership = ownershipText(input?.ownershipStatement, false);
    return withTransaction(this.pool, async (tx) => {
      const report = await this.load(tx, owner, reportId, true);
      const milestone = report.learning_plan.find((m) => m.id === milestoneId);
      if (!milestone) throw new BillingError('not_found', { milestoneId });
      const progress = progressOf(report);
      if (!progress.completedMilestoneIds.includes(milestoneId)) {
        throw new BillingError('validation_error', { field: 'milestoneId', reason: 'not_completed' });
      }
      const linked = progress.evidenceByMilestone?.[milestoneId];
      if (linked && (await this.ownsEvidence(tx, owner, [linked]))) return { evidenceId: linked, created: false };

      const created = await this.evidence.create(owner, {
        title: `${milestone.title}`.slice(0, 200),
        // Completing a learning step is recorded as learning, never as an
        // accredited credential (spec 27).
        description: `Learning step completed toward ${report.target_role}: ${milestone.description}`,
        evidenceType: 'project',
        ownershipStatement: ownership,
        linkedSkills: [milestone.targetSkill],
      });
      await this.saveProgress(tx, report.id, {
        ...progress,
        evidenceByMilestone: { ...(progress.evidenceByMilestone ?? {}), [milestoneId]: created.id },
      });
      return { evidenceId: created.id, created: true };
    });
  }

  /** Saves the person's own statement of who did the project work. */
  async setOwnershipStatement(owner: ProfileOwner, reportId: string, statement: unknown): Promise<SkillGapReport> {
    const text = ownershipText(statement, true);
    return withTransaction(this.pool, async (tx) => {
      const report = await this.load(tx, owner, reportId, true);
      const brief = briefOf(report);
      return this.view(await this.saveBrief(tx, report.id, { ...brief, ownershipStatement: text }));
    });
  }

  /**
   * Adds the finished project to the Evidence Vault, once. Needs the person's
   * ownership statement first: an item without one would say nothing about
   * who did the work.
   */
  async addProjectToEvidence(owner: ProfileOwner, reportId: string): Promise<LearningEvidenceResult> {
    return withTransaction(this.pool, async (tx) => {
      const report = await this.load(tx, owner, reportId, true);
      const brief = briefOf(report);
      if (!brief.ownershipStatement) {
        throw new BillingError('validation_error', { field: 'ownershipStatement', reason: 'required' });
      }
      if (brief.evidenceId && (await this.ownsEvidence(tx, owner, [brief.evidenceId]))) {
        return { evidenceId: brief.evidenceId, created: false };
      }
      const skills = Array.from(new Set(report.skill_gaps.map((gap) => gap.skill))).slice(0, 10);
      const created = await this.evidence.create(owner, {
        title: brief.title.slice(0, 200),
        description: `Project built from a learning brief for ${report.target_role}: ${brief.summary}`,
        evidenceType: 'project',
        ownershipStatement: brief.ownershipStatement,
        linkedSkills: skills,
      });
      await this.saveBrief(tx, report.id, { ...brief, evidenceId: created.id });
      return { evidenceId: created.id, created: true };
    });
  }

  /**
   * The person's own rubric check of the work they delivered. Every rubric
   * criterion must be answered once, and the delivered work must be Evidence
   * Vault items the person owns. It is stored as a self-check: it never marks
   * any evidence as independently assessed.
   */
  async saveRubricCheck(owner: ProfileOwner, reportId: string, input: RubricCheckInput): Promise<SkillGapReport> {
    const evidenceIds = Array.isArray(input?.evidenceIds)
      ? Array.from(new Set(input.evidenceIds.filter((value): value is string => typeof value === 'string')))
      : [];
    if (evidenceIds.length === 0 || evidenceIds.length > RUBRIC_EVIDENCE_MAX || evidenceIds.some((value) => !UUID.test(value))) {
      throw new BillingError('validation_error', { field: 'evidenceIds', reason: 'invalid' });
    }
    return withTransaction(this.pool, async (tx) => {
      const report = await this.load(tx, owner, reportId, true);
      const brief = briefOf(report);
      if (!brief.ownershipStatement) {
        throw new BillingError('validation_error', { field: 'ownershipStatement', reason: 'required' });
      }
      const rawCriteria = Array.isArray(input?.criteria) ? input.criteria : [];
      const criteria: RubricCriterionCheck[] = [];
      for (const rubric of brief.rubrics) {
        const answers = rawCriteria.filter((item) => isRecord(item) && item.criterionId === rubric.id);
        if (answers.length !== 1 || typeof answers[0].met !== 'boolean') {
          throw new BillingError('validation_error', { field: 'criteria', reason: 'every_criterion_once' });
        }
        const note = typeof answers[0].note === 'string' ? answers[0].note.trim().slice(0, RUBRIC_NOTE_MAX) : '';
        criteria.push({ criterionId: rubric.id, met: answers[0].met, note });
      }
      if (rawCriteria.length !== brief.rubrics.length) {
        throw new BillingError('validation_error', { field: 'criteria', reason: 'every_criterion_once' });
      }
      // Another person's evidence id looks exactly like a missing one.
      if (!(await this.ownsEvidence(tx, owner, evidenceIds))) {
        throw new BillingError('validation_error', { field: 'evidenceIds', reason: 'not_found' });
      }
      return this.view(
        await this.saveBrief(tx, report.id, {
          ...brief,
          rubricCheck: { assessment: 'self_check', evidenceIds, criteria, checkedAt: new Date().toISOString() },
        }),
      );
    });
  }

  private async ownsEvidence(db: Pick<PoolClient, 'query'>, owner: ProfileOwner, ids: string[]): Promise<boolean> {
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM career_evidence
        WHERE id = ANY($1::uuid[]) AND workspace_id = $2 AND candidate_auth_user_id = $3`,
      [ids, owner.workspaceId, owner.authUserId],
    );
    return (rows.rows[0]?.n ?? 0) === ids.length;
  }

  private async saveProgress(db: Pick<PoolClient, 'query'>, id: string, progress: LearningProgress): Promise<SkillGapReportRow> {
    const res = await db.query<SkillGapReportRow>(
      `UPDATE skill_gap_reports SET progress = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, JSON.stringify(progress)],
    );
    return res.rows[0];
  }

  private async saveBrief(db: Pick<PoolClient, 'query'>, id: string, brief: ProjectBrief): Promise<SkillGapReportRow> {
    const res = await db.query<SkillGapReportRow>(
      `UPDATE skill_gap_reports SET project_brief = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, JSON.stringify(brief)],
    );
    return res.rows[0];
  }

  private async load(
    db: Pick<PoolClient, 'query'>,
    owner: ProfileOwner,
    id: string,
    forUpdate = false,
  ): Promise<SkillGapReportRow> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await db.query<SkillGapReportRow>(
      `SELECT ${COLUMNS}
         FROM skill_gap_reports
        WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async loadFacts(owner: ProfileOwner): Promise<ResumeFactInput[]> {
    const rows = await this.pool.query<{
      id: string;
      fact_type: string;
      value: unknown;
      confirmation: string;
    }>(
      `SELECT id, fact_type, value, confirmation
         FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const facts: ResumeFactInput[] = [];
    for (const row of rows.rows) {
      if (!isFactType(row.fact_type) || !isRecord(row.value)) continue;
      facts.push({
        id: row.id,
        factType: row.fact_type,
        value: row.value,
        confirmation: row.confirmation === 'confirmed' ? 'confirmed' : 'draft',
        uncertain: {},
      });
    }
    return facts;
  }

  /**
   * The plan comes from the text model and is specific to the role; the
   * person's current level for each skill is read from confirmed facts only
   * (`currentSkillLevel`). A missing model or an unusable reply is
   * `provider_unavailable`, so the metering run releases the credit: a
   * generic plan is never charged for.
   */
  private async generateReport(
    targetRole: string,
    targetIndustry: string | null,
    timeBudget: number,
    financialBudget: number,
    includeProjectBrief: boolean,
    facts: ResumeFactInput[],
  ): Promise<SkillReportGeneratedData> {
    const input = {
      targetRole,
      targetIndustry,
      timeBudgetHoursPerWeek: timeBudget,
      financialBudgetCents: financialBudget,
      includeProjectBrief,
      facts,
    };
    const response = await completeWithin(this.model, {
      template: LEARNING_PLAN_TEMPLATE,
      system: LEARNING_PLAN_SYSTEM,
      prompt: learningPlanPrompt(input),
      maxTokens: 2400,
      temperature: 0,
    });
    const plan = parseLearningPlan(response.text, input);
    if (!plan) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
    return { ...plan, progress: { completedMilestoneIds: [], percent: 0, evidenceByMilestone: {} } };
  }

  private async projectBriefAllowed(owner: ProfileOwner): Promise<boolean> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    try {
      return snapshot.allowances[v2PlanOf(snapshot, account)].projectBriefInSkillReport === true;
    } catch (error) {
      if (isBillingError(error, 'not_found')) return false;
      throw error;
    }
  }

  private async skillReportBalance(owner: ProfileOwner): Promise<SkillReportBalanceView> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'skill_report', new Date());
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

  private view(row: SkillGapReportRow): SkillGapReport {
    const brief = row.project_brief;
    return {
      id: row.id,
      targetRole: row.target_role,
      targetIndustry: row.target_industry,
      timeBudgetHoursPerWeek: row.time_budget_hours_per_week,
      financialBudgetCents: row.financial_budget_cents,
      skillGaps: (row.skill_gaps ?? []).map((gap) => ({ ...gap, kind: gap.kind ?? 'skill' })),
      learningPlan: (row.learning_plan ?? []).map((milestone) => ({
        ...milestone,
        // A cost without the date it was stated is not a source cost. Reports
        // made before costs carried a date stored a missing cost as 0 (and
        // capped others to the budget), so those read as unknown too.
        estimatedCostCents:
          typeof milestone.estimatedCostCents === 'number' && milestone.costAsOf ? milestone.estimatedCostCents : null,
        costAsOf: milestone.estimatedCostCents !== null && milestone.costAsOf ? milestone.costAsOf : null,
        prerequisites: milestone.prerequisites ?? [],
      })),
      projectBrief: brief
        ? {
            ...brief,
            steps: brief.steps ?? [],
            tools: brief.tools ?? [],
            ownershipStatement: brief.ownershipStatement ?? null,
            origin: 'ai_assisted',
            rubricCheck: brief.rubricCheck ?? null,
            evidenceId: brief.evidenceId ?? null,
          }
        : null,
      bridgeRoles: row.bridge_roles ?? [],
      transferableSkills: row.transferable_skills ?? [],
      progress: progressOf(row),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

/** Progress as stored, including the older `completedItemIds` spelling. */
function progressOf(row: Pick<SkillGapReportRow, 'progress'>): LearningProgress {
  const stored = row.progress as (LearningProgress & { completedItemIds?: string[] }) | null;
  return {
    completedMilestoneIds: stored?.completedMilestoneIds ?? stored?.completedItemIds ?? [],
    percent: stored?.percent ?? 0,
    evidenceByMilestone: isRecord(stored?.evidenceByMilestone) ? (stored.evidenceByMilestone as Record<string, string>) : {},
  };
}

function briefOf(row: SkillGapReportRow): ProjectBrief {
  if (!row.project_brief) throw new BillingError('not_found', { field: 'projectBrief' });
  return row.project_brief;
}

/** The person's own words, trimmed and bounded. `required` refuses an empty statement. */
function ownershipText(value: unknown, required: boolean): string {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new BillingError('validation_error', { field: 'ownershipStatement', reason: 'invalid' });
  }
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (required && text.length === 0) throw new BillingError('validation_error', { field: 'ownershipStatement', reason: 'required' });
  if (text.length > OWNERSHIP_MAX) throw new BillingError('validation_error', { field: 'ownershipStatement', reason: 'too_long' });
  return text;
}
