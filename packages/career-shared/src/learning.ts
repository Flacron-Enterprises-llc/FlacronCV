/**
 * CV13: Skill gaps, learning plans, course/credential links,
 * time/budget constraints, practical project briefs and rubrics,
 * progress tracking, and resulting evidence mapping.
 */

export type SkillLevel = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type RequiredSkillLevel = 'intermediate' | 'advanced' | 'expert';
export type GapImportance = 'critical' | 'preferred' | 'optional';

export interface SkillGapItem {
  skill: string;
  currentLevel: SkillLevel;
  requiredLevel: RequiredSkillLevel;
  importance: GapImportance;
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
  estimatedCostCents: number;
  resources: LearningResource[];
}

export interface ProjectRubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  evidenceType: 'project' | 'work_sample';
}

export interface ProjectBrief {
  title: string;
  summary: string;
  requirements: string[];
  deliverables: string[];
  rubrics: ProjectRubricCriterion[];
  estimatedHours: number;
}

export interface LearningProgress {
  completedMilestoneIds: string[];
  percent: number;
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
