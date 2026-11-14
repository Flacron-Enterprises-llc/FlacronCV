/**
 * CV13: Skill gaps, learning plans, course/credential links,
 * time/budget constraints, practical project briefs and rubrics,
 * progress tracking, and resulting evidence mapping.
 */

export type SkillLevel = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type RequiredSkillLevel = 'intermediate' | 'advanced' | 'expert';
export type GapImportance = 'critical' | 'preferred' | 'optional';
/**
 * A requirement is either a skill or a credential (licence, certification).
 * An essential credential (`credential` + `critical`) is a gate the person
 * cannot learn around; a preferred skill is not. Older reports have no kind
 * and read as `skill`.
 */
export type RequirementKind = 'skill' | 'credential';

export interface SkillGapItem {
  skill: string;
  currentLevel: SkillLevel;
  requiredLevel: RequiredSkillLevel;
  importance: GapImportance;
  kind?: RequirementKind;
}

export interface LearningResource {
  title: string;
  provider: string;
  url: string;
  type: 'course' | 'credential' | 'book' | 'documentation';
  isFree: boolean;
}

export interface LearningPlanMilestone {
  id: string;
  title: string;
  description: string;
  targetSkill: string;
  estimatedHours: number;
  /**
   * Null when no source states a cost: an unknown cost is shown as unknown,
   * never as free and never counted as 0 in a budget total.
   */
  estimatedCostCents: number | null;
  /** When the cost was stated (YYYY-MM or YYYY-MM-DD); null when unknown. */
  costAsOf?: string | null;
  /** What the person should already know before starting this step. */
  prerequisites?: string[];
  resources: LearningResource[];
}

export interface ProjectRubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  evidenceType: 'project' | 'work_sample';
}

/** One rubric criterion as the person judged their own delivered work. */
export interface RubricCriterionCheck {
  criterionId: string;
  met: boolean;
  note: string;
}

/**
 * The person's own check of delivered work against the rubric. It is a
 * self-check, never an independent assessment: it does not change an
 * evidence item's label to `assessment_completed`.
 */
export interface RubricSelfCheck {
  assessment: 'self_check';
  /** Evidence Vault items the person delivered for this brief. */
  evidenceIds: string[];
  criteria: RubricCriterionCheck[];
  checkedAt: string;
}

export interface ProjectBrief {
  title: string;
  summary: string;
  requirements: string[];
  deliverables: string[];
  rubrics: ProjectRubricCriterion[];
  estimatedHours: number;
  steps?: string[];
  tools?: string[];
  /**
   * Who did the work, in the person's own words. Never generated: null until
   * the person writes it.
   */
  ownershipStatement?: string | null;
  /** The brief itself was written with AI assistance; work done on it is assessed separately. */
  origin?: 'ai_assisted';
  rubricCheck?: RubricSelfCheck | null;
  /** The Evidence Vault item created for the finished project, if any. */
  evidenceId?: string | null;
}

/** A role that is a realistic step toward the target, with why. */
export interface BridgeRole {
  title: string;
  reason: string;
}

/** A skill the person already shows in confirmed facts that carries over to the target role. */
export interface TransferableSkill {
  skill: string;
  factIds: string[];
}

export interface LearningProgress {
  completedMilestoneIds: string[];
  percent: number;
  /** Milestone id -> Evidence Vault item already created for it (no duplicates). */
  evidenceByMilestone?: Record<string, string>;
}

export interface SkillGapReport {
  id: string;
  targetRole: string;
  targetIndustry: string | null;
  timeBudgetHoursPerWeek: number;
  financialBudgetCents: number;
  skillGaps: SkillGapItem[];
  learningPlan: LearningPlanMilestone[];
  projectBrief: ProjectBrief | null;
  bridgeRoles?: BridgeRole[];
  transferableSkills?: TransferableSkill[];
  progress: LearningProgress;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillReportInput {
  targetRole: string;
  targetIndustry?: string | null;
  timeBudgetHoursPerWeek?: number;
  financialBudgetCents?: number;
  includeProjectBrief?: boolean;
}

export interface UpdateLearningProgressInput {
  milestoneId: string;
  completed: boolean;
}

export interface LearningPlanCost {
  /** Sum of the milestones whose cost is known. */
  knownTotalCents: number;
  /** Milestones whose cost is unknown; they are not counted in the total. */
  unknownCount: number;
  /**
   * true: every cost is known and fits; false: the known costs alone exceed
   * the budget; null: cannot tell, because some costs are unknown.
   */
  withinBudget: boolean | null;
}

/**
 * Budget arithmetic that never treats an unknown cost as 0. A cost counts as
 * known only together with the date it was stated (`costAsOf`).
 */
export function learningPlanCost(milestones: LearningPlanMilestone[], budgetCents: number): LearningPlanCost {
  let knownTotalCents = 0;
  let unknownCount = 0;
  for (const milestone of milestones) {
    const cost = milestone.estimatedCostCents;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 && milestone.costAsOf) knownTotalCents += cost;
    else unknownCount += 1;
  }
  const withinBudget = knownTotalCents > budgetCents ? false : unknownCount > 0 ? null : true;
  return { knownTotalCents, unknownCount, withinBudget };
}

/** An essential credential is a credential the role treats as critical. */
export function isEssentialCredential(gap: Pick<SkillGapItem, 'kind' | 'importance'>): boolean {
  return gap.kind === 'credential' && gap.importance === 'critical';
}

export interface RubricCheckInput {
  evidenceIds: string[];
  criteria: RubricCriterionCheck[];
}

export function computeLearningProgress(
  milestones: LearningPlanMilestone[],
  completedIds: string[],
): LearningProgress {
  if (milestones.length === 0) {
    return { completedMilestoneIds: [], percent: 100 };
  }
  const validIds = new Set(milestones.map((m) => m.id));
  const activeCompleted = Array.from(new Set(completedIds.filter((id) => validIds.has(id))));
  const percent = Math.min(100, Math.round((activeCompleted.length / milestones.length) * 100));
  return {
    completedMilestoneIds: activeCompleted,
    percent,
  };
}
