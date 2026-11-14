import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import {
  computeLearningProgress,
  isFactType,
  type CreateSkillReportInput,
  type GapImportance,
  type LearningPlanMilestone,
  type LearningProgress,
  type LearningResource,
  type ProjectBrief,
  type ProjectRubricCriterion,
  type ResumeFactInput,
  type SkillGapItem,
  type SkillGapReport,
  type SkillLevel,
} from '@flacroncv/career-shared';
import { completeWithin } from '../ai/text-model';
import type { TextModel } from '../ai/text-model';
import { readAccount } from '../billing/accounts';
import { unitBalance } from '../billing/entitlements';
import { CatalogStore } from '../billing/catalog';
import { BillingError, isBillingError } from '../billing/errors';
import { MeteringService, type JsonValue, type MeteredResult } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';
import { LEARNING_PLAN_SYSTEM, LEARNING_PLAN_TEMPLATE, learningPlanPrompt, parseLearningPlan } from './learning-plan-compose';

interface SkillReportGeneratedData {
  skillGaps: SkillGapItem[];
  learningPlan: LearningPlanMilestone[];
  projectBrief: ProjectBrief | null;
  progress: LearningProgress;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export class SkillsLearningService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly model: TextModel,
  ) {}

  async list(owner: ProfileOwner): Promise<SkillReportList> {
    const rows = await this.pool.query<SkillGapReportRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, target_role, target_industry,
              time_budget_hours_per_week, financial_budget_cents, skill_gaps,
              learning_plan, project_brief, progress, created_at, updated_at
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
    const includeProjectBrief = input?.includeProjectBrief !== false;

    // Load candidate's confirmed career facts
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
        outputSchemaVersion: 'skill-report@2',
        inputVersions: {
          profileFactCount: confirmedFacts.length,
        },
      },
      execute: async () => {
        return this.generateReport(
          targetRole,
          input?.targetIndustry ?? null,
          timeBudget,
          financialBudget,
          includeProjectBrief,
          confirmedFacts,
        );
      },
      save: async (db, reportData) => {
        const res = await db.query<SkillGapReportRow>(
          `INSERT INTO skill_gap_reports
             (workspace_id, candidate_auth_user_id, target_role, target_industry,
              time_budget_hours_per_week, financial_budget_cents, skill_gaps,
              learning_plan, project_brief, progress)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, workspace_id, candidate_auth_user_id, target_role, target_industry,
                     time_budget_hours_per_week, financial_budget_cents, skill_gaps,
                     learning_plan, project_brief, progress, created_at, updated_at`,
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
    const current = await this.load(this.pool, owner, id);

    const existingIds =
      current.progress?.completedMilestoneIds ??
      (current.progress as unknown as { completedItemIds?: string[] })?.completedItemIds ??
      [];
    let completedIds = [...existingIds];
    if (completed) {
      if (!completedIds.includes(milestoneId)) completedIds.push(milestoneId);
    } else {
      completedIds = completedIds.filter((mId) => mId !== milestoneId);
    }

    const newProgress = computeLearningProgress(current.learning_plan, completedIds);

    const res = await this.pool.query<SkillGapReportRow>(
      `UPDATE skill_gap_reports
          SET progress = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, workspace_id, candidate_auth_user_id, target_role, target_industry,
                  time_budget_hours_per_week, financial_budget_cents, skill_gaps,
                  learning_plan, project_brief, progress, created_at, updated_at`,
      [current.id, JSON.stringify(newProgress)],
    );
    return this.view(res.rows[0]);
  }

  async convertToEvidence(
    owner: ProfileOwner,
    reportId: string,
    milestoneId: string,
  ): Promise<{ evidenceId: string }> {
    const report = await this.load(this.pool, owner, reportId);
    const milestone = report.learning_plan.find((m) => m.id === milestoneId);
    if (!milestone) throw new BillingError('not_found', { milestoneId });

    const title = `${milestone.title} Project`;
    const description = `Completed milestone for ${report.target_role}: ${milestone.description}`;
    const skills = [milestone.targetSkill];

    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO career_evidence
         (workspace_id, candidate_auth_user_id, title, description, evidence_type,
          ownership_statement, linked_skills, evidence_label, is_portfolio_shared)
       VALUES ($1, $2, $3, $4, 'project', 'Sole author / Primary contributor', $5, 'self_reported', false)
       RETURNING id`,
      [owner.workspaceId, owner.authUserId, title, description, JSON.stringify(skills)],
    );
    return { evidenceId: res.rows[0].id };
  }

  private async load(db: Pool, owner: ProfileOwner, id: string): Promise<SkillGapReportRow> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await db.query<SkillGapReportRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, target_role, target_industry,
              time_budget_hours_per_week, financial_budget_cents, skill_gaps,
              learning_plan, project_brief, progress, created_at, updated_at
         FROM skill_gap_reports
        WHERE id = $1`,
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
      maxTokens: 2000,
      temperature: 0,
    });
    const plan = parseLearningPlan(response.text, input);
    if (!plan) throw new BillingError('provider_unavailable', { reason: 'unusable_output' });
    return { ...plan, progress: { completedMilestoneIds: [], percent: 0 } };
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
    return {
      id: row.id,
      targetRole: row.target_role,
      targetIndustry: row.target_industry,
      timeBudgetHoursPerWeek: row.time_budget_hours_per_week,
      financialBudgetCents: row.financial_budget_cents,
      skillGaps: row.skill_gaps,
      learningPlan: row.learning_plan,
      projectBrief: row.project_brief,
      progress: {
        completedMilestoneIds:
          row.progress?.completedMilestoneIds ??
          (row.progress as unknown as { completedItemIds?: string[] })?.completedItemIds ??
          [],
        percent: row.progress?.percent ?? 0,
      },
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
