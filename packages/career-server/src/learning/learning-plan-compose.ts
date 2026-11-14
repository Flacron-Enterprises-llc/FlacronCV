import { factLineText } from '@flacroncv/career-shared';
import type {
  GapImportance,
  LearningPlanMilestone,
  LearningResource,
  ProjectBrief,
  ProjectRubricCriterion,
  RequiredSkillLevel,
  ResumeFactInput,
  SkillGapItem,
  SkillLevel,
} from '@flacroncv/career-shared';
import { extractJsonObject } from '../ai/text-model';

export const LEARNING_PLAN_TEMPLATE = 'learning-plan@2';

export const LEARNING_PLAN_SYSTEM = [
  'You plan how one person can grow into a target role.',
  'Reply with one JSON object only, no prose, shaped as:',
  '{"requirements":[{"skill":string,"importance":"critical"|"preferred"|"optional","requiredLevel":"intermediate"|"advanced"|"expert"}],',
  '"milestones":[{"title":string,"description":string,"targetSkill":string,"estimatedHours":integer,"estimatedCostCents":integer,',
  '"resources":[{"title":string,"provider":string,"type":"course"|"credential"|"book"|"documentation","isFree":boolean}]}],',
  '"projectBrief":{"title":string,"summary":string,"requirements":[string],"deliverables":[string],',
  '"rubrics":[{"name":string,"description":string,"weight":integer,"evidenceType":"project"|"work_sample"}],"estimatedHours":integer}|null}',
  'requirements: 3 to 8 skills that the target role itself needs, specific to that role and industry.',
  'milestones: 2 to 5, each for one requirement the person does not already show, sized to the weekly time budget and the money budget.',
  'Name only resources you are sure exist. Do not give links.',
  'Never describe the person or claim experience they did not list.',
].join(' ');

const IMPORTANCE: readonly GapImportance[] = ['critical', 'preferred', 'optional'];
const REQUIRED_LEVELS: readonly RequiredSkillLevel[] = ['intermediate', 'advanced', 'expert'];
const RESOURCE_TYPES: readonly LearningResource['type'][] = ['course', 'credential', 'book', 'documentation'];

export interface LearningPlanInput {
  targetRole: string;
  targetIndustry: string | null;
  timeBudgetHoursPerWeek: number;
  financialBudgetCents: number;
  includeProjectBrief: boolean;
  facts: ResumeFactInput[];
}

export interface LearningPlanOutput {
  skillGaps: SkillGapItem[];
  learningPlan: LearningPlanMilestone[];
  projectBrief: ProjectBrief | null;
}

/** The prompt holds the role, the budgets and the confirmed facts' text; never a draft fact. */
export function learningPlanPrompt(input: LearningPlanInput): string {
  return JSON.stringify({
    targetRole: input.targetRole,
    targetIndustry: input.targetIndustry,
    timeBudgetHoursPerWeek: input.timeBudgetHoursPerWeek,
    financialBudgetCents: input.financialBudgetCents,
    includeProjectBrief: input.includeProjectBrief,
    confirmedFacts: input.facts
      .filter((fact) => fact.confirmation === 'confirmed' && fact.factType !== 'contact')
      .map((fact) => ({ type: fact.factType, text: factLineText(fact.factType, fact.value) }))
      .filter((fact) => fact.text.length > 0),
  });
}

/**
 * The person's current level for a skill, from confirmed facts only: a
 * confirmed skill with that name is "intermediate", a confirmed job or
 * course that mentions it is "beginner", anything else is "none". The model
 * never sets this, so a plan cannot flatter or invent experience.
 */
export function currentSkillLevel(skill: string, facts: ResumeFactInput[]): SkillLevel {
  const wanted = fold(skill);
  if (wanted.length === 0) return 'none';
  let level: SkillLevel = 'none';
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    if (fact.factType === 'skill' && typeof fact.value.name === 'string' && fold(fact.value.name) === wanted) return 'intermediate';
    const text = fold(factLineText(fact.factType, fact.value));
    if (text.length > 0 && ` ${text} `.includes(` ${wanted} `)) level = 'beginner';
  }
  return level;
}

/**
 * Parses and bounds a model reply. Null when the reply is not a usable plan
 * (no requirements, no milestone), so the caller can release the credit.
 */
export function parseLearningPlan(text: string, input: LearningPlanInput): LearningPlanOutput | null {
  const reply = extractJsonObject(text);
  if (!reply) return null;

  const skillGaps: SkillGapItem[] = [];
  for (const raw of arrayOf(reply.requirements).slice(0, 8)) {
    const skill = textOf(raw.skill, 80);
    if (!skill || skillGaps.some((gap) => fold(gap.skill) === fold(skill))) continue;
    skillGaps.push({
      skill,
      currentLevel: currentSkillLevel(skill, input.facts),
      requiredLevel: pick(raw.requiredLevel, REQUIRED_LEVELS, 'intermediate'),
      importance: pick(raw.importance, IMPORTANCE, 'preferred'),
    });
  }
  if (skillGaps.length < 2) return null;

  const learningPlan: LearningPlanMilestone[] = [];
  for (const raw of arrayOf(reply.milestones).slice(0, 5)) {
    const title = textOf(raw.title, 120);
    const description = textOf(raw.description, 600);
    const targetSkill = textOf(raw.targetSkill, 80);
    if (!title || !description || !targetSkill) continue;
    const resources: LearningResource[] = [];
    for (const item of arrayOf(raw.resources).slice(0, 4)) {
      const resourceTitle = textOf(item.title, 160);
      const provider = textOf(item.provider, 120);
      if (!resourceTitle || !provider) continue;
      // Links are not taken from the model: an invented URL would look authoritative.
      resources.push({ title: resourceTitle, provider, url: '', type: pick(item.type, RESOURCE_TYPES, 'course'), isFree: item.isFree === true });
    }
    learningPlan.push({
      id: `milestone-${learningPlan.length + 1}`,
      title,
      description,
      targetSkill,
      estimatedHours: bounded(raw.estimatedHours, 1, 400, Math.max(4, input.timeBudgetHoursPerWeek * 2)),
      estimatedCostCents: Math.min(bounded(raw.estimatedCostCents, 0, 10_000_000, 0), Math.max(0, input.financialBudgetCents)),
      resources,
    });
  }
  if (learningPlan.length === 0) return null;

  let projectBrief: ProjectBrief | null = null;
  const brief = isRecord(reply.projectBrief) ? reply.projectBrief : null;
  if (input.includeProjectBrief && brief) {
    const title = textOf(brief.title, 160);
    const summary = textOf(brief.summary, 600);
    const requirements = arrayOfText(brief.requirements, 6, 300);
    const deliverables = arrayOfText(brief.deliverables, 6, 300);
    const rubrics: ProjectRubricCriterion[] = [];
    for (const raw of arrayOf(brief.rubrics).slice(0, 5)) {
      const name = textOf(raw.name, 120);
      const description = textOf(raw.description, 400);
      if (!name || !description) continue;
      rubrics.push({
        id: `rubric-${rubrics.length + 1}`,
        name,
        description,
        weight: bounded(raw.weight, 1, 100, 1),
        evidenceType: raw.evidenceType === 'work_sample' ? 'work_sample' : 'project',
      });
    }
    if (title && summary && requirements.length > 0 && deliverables.length > 0 && rubrics.length > 0) {
      projectBrief = {
        title,
        summary,
        requirements,
        deliverables,
        rubrics: normalizeWeights(rubrics),
        estimatedHours: bounded(brief.estimatedHours, 1, 400, Math.max(10, input.timeBudgetHoursPerWeek * 4)),
      };
    }
  }

  return { skillGaps, learningPlan, projectBrief };
}

/** Rubric weights are shown as percentages, so they always add up to 100. */
function normalizeWeights(rubrics: ProjectRubricCriterion[]): ProjectRubricCriterion[] {
  const total = rubrics.reduce((sum, rubric) => sum + rubric.weight, 0);
  const scaled = rubrics.map((rubric) => ({ ...rubric, weight: Math.max(1, Math.round((rubric.weight / total) * 100)) }));
  const drift = 100 - scaled.reduce((sum, rubric) => sum + rubric.weight, 0);
  scaled[0] = { ...scaled[0], weight: scaled[0].weight + drift };
  return scaled;
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfText(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textOf(item, length)).filter((item): item is string => item !== null).slice(0, max);
}

function textOf(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 0 ? clean.slice(0, max) : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
