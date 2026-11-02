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
import { readAccount } from '../billing/accounts';
import { unitBalance } from '../billing/entitlements';
import { CatalogStore } from '../billing/catalog';
import { BillingError, isBillingError } from '../billing/errors';
import { MeteringService, type JsonValue, type MeteredResult } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';

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
        promptTemplateVersion: 'learning-plan@2026-10-10',
        outputSchemaVersion: 'skill-report@1',
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

  private generateReport(
    targetRole: string,
    targetIndustry: string | null,
    timeBudget: number,
    financialBudget: number,
    includeProjectBrief: boolean,
    facts: ResumeFactInput[],
  ) {
    const candidateSkillNames = new Set<string>();
    for (const f of facts) {
      if (f.factType === 'skill' && typeof f.value.name === 'string') {
        candidateSkillNames.add(f.value.name.toLowerCase());
      }
    }

    // Role-specific target skill competencies
    const standardRequirements: Array<{ skill: string; importance: GapImportance; requiredLevel: 'intermediate' | 'advanced' | 'expert' }> = [
      { skill: 'System Design', importance: 'critical', requiredLevel: 'advanced' },
      { skill: 'Distributed Consensus', importance: 'critical', requiredLevel: 'advanced' },
      { skill: 'PostgreSQL Internals', importance: 'preferred', requiredLevel: 'intermediate' },
      { skill: 'Cloud Architecture (AWS)', importance: 'preferred', requiredLevel: 'intermediate' },
      { skill: 'Observability & Telemetry', importance: 'optional', requiredLevel: 'intermediate' },
    ];

    const skillGaps: SkillGapItem[] = standardRequirements.map((req) => {
      const hasSkill = candidateSkillNames.has(req.skill.toLowerCase());
      const currentLevel: SkillLevel = hasSkill ? 'intermediate' : 'none';
      return {
        skill: req.skill,
        currentLevel,
        requiredLevel: req.requiredLevel,
        importance: req.importance,
      };
    });

    const learningPlan: LearningPlanMilestone[] = [
      {
        id: 'milestone-1',
        title: 'Core System Design & Scalability',
        description: `Bridge critical gap in System Design for ${targetRole}. Covers distributed consensus, data partitioning, and fault tolerance.`,
        targetSkill: 'System Design',
        estimatedHours: Math.max(10, timeBudget * 2),
        estimatedCostCents: financialBudget > 5000 ? 4900 : 0,
        resources: [
          {
            title: 'Designing Data-Intensive Applications',
            provider: 'O’Reilly Media',
            url: 'https://dataintensive.net',
            type: 'book',
            isFree: false,
          },
          {
            title: 'System Design Primer',
            provider: 'GitHub Open Source',
            url: 'https://github.com/donnemartin/system-design-primer',
            type: 'documentation',
            isFree: true,
          },
        ],
      },
      {
        id: 'milestone-2',
        title: 'Distributed Consensus & Replication',
        description: 'Practical study of Raft consensus, Paxos protocol, and replication logs.',
        targetSkill: 'Distributed Consensus',
        estimatedHours: Math.max(8, timeBudget * 2),
        estimatedCostCents: 0,
        resources: [
          {
            title: 'The Raft Consensus Algorithm',
            provider: 'Stanford University',
            url: 'https://raft.github.io',
            type: 'documentation',
            isFree: true,
          },
        ],
      },
      {
        id: 'milestone-3',
        title: 'High-Performance Relational Indexing',
        description: 'Query planning, EXPLAIN ANALYZE, and advanced index optimization.',
        targetSkill: 'PostgreSQL Internals',
        estimatedHours: Math.max(6, timeBudget),
        estimatedCostCents: 0,
        resources: [
          {
            title: 'Use The Index, Luke!',
            provider: 'Markus Winand',
            url: 'https://use-the-index-luke.com',
            type: 'documentation',
            isFree: true,
          },
        ],
      },
    ];

    let projectBrief: ProjectBrief | null = null;
    if (includeProjectBrief) {
      projectBrief = {
        title: `${targetRole} Capstone Implementation`,
        summary: `Practical reference implementation to produce verified career evidence for ${targetRole}.`,
        requirements: [
          'Design and implement a partition-tolerant distributed key-value store with Raft consensus.',
          'Provide automated chaos tests validating partition recovery and leader reelection.',
          'Integrate structured structured metrics and tracing conforming to OpenTelemetry standards.',
        ],
        deliverables: [
          'Working GitHub repository with unit, integration, and chaos test suites.',
          'Architecture RFC document detailing consistency tradeoffs and failure modes.',
          'Benchmark report demonstrating sub-10ms write latency under load.',
        ],
        rubrics: [
          {
            id: 'rubric-1',
            name: 'Consensus Correctness',
            description: 'Accurately implements leader election, log replication, and safe commit rules.',
            weight: 40,
            evidenceType: 'project',
          },
          {
            id: 'rubric-2',
            name: 'Fault Recovery & Robustness',
            description: 'Handles network partitions without split-brain or data loss.',
            weight: 35,
            evidenceType: 'project',
          },
          {
            id: 'rubric-3',
            name: 'Technical Documentation & Provenance',
            description: 'Provides clean architectural diagrams and reproducible test instructions.',
            weight: 25,
            evidenceType: 'work_sample',
          },
        ],
        estimatedHours: Math.max(20, timeBudget * 4),
      };
    }

    const progress: LearningProgress = {
      completedMilestoneIds: [],
      percent: 0,
    };

    return {
      skillGaps,
      learningPlan,
      projectBrief,
      progress,
    };
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
