import { factLineText } from '@flacroncv/career-shared';
import type {
  BridgeRole,
  GapImportance,
  LearningPlanMilestone,
  LearningResource,
  ProjectBrief,
  ProjectRubricCriterion,
  RequiredSkillLevel,
  RequirementKind,
  ResumeFactInput,
  SkillGapItem,
  SkillLevel,
  TransferableSkill,
} from '@flacroncv/career-shared';
import { extractJsonObject } from '../ai/text-model';

export const LEARNING_PLAN_TEMPLATE = 'learning-plan@3';
export const SKILL_REPORT_SCHEMA = 'skill-report@3';

export const LEARNING_PLAN_SYSTEM = [
  'You plan how one person can grow into a target role.',
  'Reply with one JSON object only, no prose, shaped as:',
  '{"requirements":[{"skill":string,"kind":"skill"|"credential","importance":"critical"|"preferred"|"optional","requiredLevel":"intermediate"|"advanced"|"expert"}],',
  '"milestones":[{"title":string,"description":string,"targetSkill":string,"estimatedHours":integer,"estimatedCostCents":integer|null,"costAsOf":"YYYY-MM"|null,',
  '"prerequisites":[string],',
  '"resources":[{"title":string,"provider":string,"type":"course"|"credential"|"book"|"documentation","isFree":boolean}]}],',
  '"bridgeRoles":[{"title":string,"reason":string}],',
  '"transferableSkills":[string],',
  '"projectBrief":{"title":string,"summary":string,"requirements":[string],"steps":[string],"tools":[string],"deliverables":[string],',
  '"rubrics":[{"name":string,"description":string,"weight":integer,"evidenceType":"project"|"work_sample"}],"estimatedHours":integer}|null}',
  'requirements: 3 to 8 needs of the target role itself, specific to that role and industry.',
  'Use kind "credential" only for a licence or certification; mark it "critical" only when the role cannot be done without it.',
  'milestones: 2 to 5, each for one requirement the person does not already show, sized to the weekly time budget.',
  'estimatedCostCents and costAsOf: give a cost only when you know the provider\'s published price and when it was stated; otherwise null for both. Never guess a price.',
  'bridgeRoles: 0 to 3 roles that are a realistic step toward the target, each with a short reason.',
  'transferableSkills: only skills that appear in the confirmed facts and carry over to the target role.',
  'projectBrief steps: the order of work; tools: what the work uses. Do not write an ownership statement: the person writes it.',
  'Name only resources you are sure exist. Do not give links.',
  'Never describe the person or claim experience they did not list.',
].join(' ');

const IMPORTANCE: readonly GapImportance[] = ['critical', 'preferred', 'optional'];
const REQUIRED_LEVELS: readonly RequiredSkillLevel[] = ['intermediate', 'advanced', 'expert'];
const KINDS: readonly RequirementKind[] = ['skill', 'credential'];
const RESOURCE_TYPES: readonly LearningResource['type'][] = ['course', 'credential', 'book', 'documentation'];
/** A stated price month (or day). Anything else is not a source date. */
const COST_DATE = /^(\d{4})-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

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
  bridgeRoles: BridgeRole[];
  transferableSkills: TransferableSkill[];
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
  return skillSupport(skill, facts).level;
}

/** The level plus the confirmed facts that show the skill. */
function skillSupport(skill: string, facts: ResumeFactInput[]): { level: SkillLevel; factIds: string[] } {
  const wanted = fold(skill);
  if (wanted.length === 0) return { level: 'none', factIds: [] };
  let level: SkillLevel = 'none';
  const factIds: string[] = [];
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    if (fact.factType === 'skill' && typeof fact.value.name === 'string' && fold(fact.value.name) === wanted) {
      level = 'intermediate';
      factIds.push(fact.id);
      continue;
    }
    const text = fold(factLineText(fact.factType, fact.value));
    if (text.length > 0 && ` ${text} `.includes(` ${wanted} `)) {
      if (level === 'none') level = 'beginner';
      factIds.push(fact.id);
    }
  }
  return { level, factIds };
}

/**
 * A stated cost needs both a number and the date it was stated; otherwise the
 * cost is unknown (null). It is never capped to the budget, so an expensive
 * step is shown as expensive instead of looking affordable.
 */
function statedCost(raw: Record<string, unknown>): { cents: number | null; asOf: string | null } {
  const cents = raw.estimatedCostCents;
  const asOf = typeof raw.costAsOf === 'string' ? raw.costAsOf.trim() : '';
  const date = COST_DATE.exec(asOf);
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0 || cents > 10_000_000) return { cents: null, asOf: null };
  if (!date || Number(date[1]) < 2000) return { cents: null, asOf: null };
  return { cents: Math.round(cents), asOf };
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
      kind: pick(raw.kind, KINDS, 'skill'),
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
    const cost = statedCost(raw);
    learningPlan.push({
      id: `milestone-${learningPlan.length + 1}`,
      title,
      description,
      targetSkill,
      estimatedHours: bounded(raw.estimatedHours, 1, 400, Math.max(4, input.timeBudgetHoursPerWeek * 2)),
      estimatedCostCents: cost.cents,
      costAsOf: cost.asOf,
      prerequisites: arrayOfText(raw.prerequisites, 5, 160),
      resources,
    });
  }
  if (learningPlan.length === 0) return null;

  const bridgeRoles: BridgeRole[] = [];
  for (const raw of arrayOf(reply.bridgeRoles).slice(0, 3)) {
    const title = textOf(raw.title, 120);
    const reason = textOf(raw.reason, 300);
    if (title && reason && !bridgeRoles.some((role) => fold(role.title) === fold(title))) bridgeRoles.push({ title, reason });
  }

  // A transferable skill is kept only when a confirmed fact shows it, and the
  // facts that do are recorded, so the model cannot hand the person a skill.
  const transferableSkills: TransferableSkill[] = [];
  for (const skill of arrayOfText(reply.transferableSkills, 8, 80)) {
    if (transferableSkills.some((item) => fold(item.skill) === fold(skill))) continue;
    const support = skillSupport(skill, input.facts);
    if (support.factIds.length > 0) transferableSkills.push({ skill, factIds: support.factIds });
  }

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
        steps: arrayOfText(brief.steps, 10, 300),
        tools: arrayOfText(brief.tools, 10, 80),
        deliverables,
        rubrics: normalizeWeights(rubrics),
        estimatedHours: bounded(brief.estimatedHours, 1, 400, Math.max(10, input.timeBudgetHoursPerWeek * 4)),
        // Whatever the model sent as an ownership statement is dropped: only
        // the person can say who did the work.
        ownershipStatement: null,
        origin: 'ai_assisted',
        rubricCheck: null,
        evidenceId: null,
      };
    }
  }

  return { skillGaps, learningPlan, projectBrief, bridgeRoles, transferableSkills };
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
