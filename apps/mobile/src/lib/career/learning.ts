import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { RubricCheckInput, SkillGapReport } from '../../../../../packages/career-api-client/src/types';
import {
  isEssentialCredential,
  learningPlanCost,
  type LearningPlanMilestone,
  type SkillGapItem,
} from '../../../../../packages/career-shared/src/learning';
import { formatNumber, hasKey, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';
import { providerUnavailableMessage, type PillTone } from './action-packs';

/**
 * Pure view logic for the mobile skill-report / learning-plan screens
 * (tested in learning.test.ts). Mirrors the website's LearningScreen: a report
 * for a target role uses one skill-report credit; milestone ticks are free;
 * a ticked milestone can be recorded in the evidence vault.
 */

export const TIME_BUDGET_MIN = 2;
export const TIME_BUDGET_MAX = 30;
export const TIME_BUDGET_DEFAULT = 5;

export interface SkillReportForm {
  targetRole: string;
  targetIndustry: string;
  timeBudgetHoursPerWeek: number;
  /** Whole dollars as typed (the website's field is in dollars). */
  financialBudget: string;
  includeProjectBrief: boolean;
}

export const EMPTY_SKILL_REPORT_FORM: SkillReportForm = {
  targetRole: '',
  targetIndustry: '',
  timeBudgetHoursPerWeek: TIME_BUDGET_DEFAULT,
  financialBudget: '0',
  includeProjectBrief: true,
};

export function clampTimeBudget(hours: number): number {
  if (!Number.isFinite(hours)) return TIME_BUDGET_DEFAULT;
  return Math.min(TIME_BUDGET_MAX, Math.max(TIME_BUDGET_MIN, Math.round(hours)));
}

export type SkillReportInput = {
  targetRole: string;
  targetIndustry: string | null;
  timeBudgetHoursPerWeek: number;
  financialBudgetCents: number;
  includeProjectBrief: boolean;
};

/** Validates the form and builds the request body exactly as the website sends it. */
export function buildSkillReportInput(
  form: SkillReportForm,
): { ok: true; input: SkillReportInput } | { ok: false; field: 'targetRole' | 'financialBudget'; message: string } {
  const targetRole = form.targetRole.trim();
  if (targetRole.length === 0) return { ok: false, field: 'targetRole', message: t('careerPlans.learning.validation.roleRequired') };
  if (targetRole.length > 200) return { ok: false, field: 'targetRole', message: t('careerPlans.learning.validation.roleTooLong') };
  const budgetText = form.financialBudget.trim() === '' ? '0' : form.financialBudget.trim();
  if (!/^\d{1,7}$/.test(budgetText)) {
    return { ok: false, field: 'financialBudget', message: t('careerPlans.learning.validation.budgetInvalid') };
  }
  return {
    ok: true,
    input: {
      targetRole,
      targetIndustry: form.targetIndustry.trim() || null,
      timeBudgetHoursPerWeek: clampTimeBudget(form.timeBudgetHoursPerWeek),
      financialBudgetCents: Number(budgetText) * 100,
      includeProjectBrief: form.includeProjectBrief,
    },
  };
}

/** Stable signature of one "create report" action, for idempotency-key reuse on retry. */
export function skillReportSignature(input: SkillReportInput): string {
  return JSON.stringify([
    input.targetRole,
    input.targetIndustry,
    input.timeBudgetHoursPerWeek,
    input.financialBudgetCents,
    input.includeProjectBrief,
  ]);
}

export function wholeDollars(cents: number): string {
  return `$${formatNumber(Math.round(cents / 100))}`;
}

/** "Data Science · 5 hours/week · $0 budget" (same pieces as the website's report header). */
export function reportMeta(report: Pick<SkillGapReport, 'targetIndustry' | 'timeBudgetHoursPerWeek' | 'financialBudgetCents'>): string {
  const parts: string[] = [];
  if (report.targetIndustry) parts.push(report.targetIndustry);
  parts.push(t('careerPlans.learning.hoursPerWeek', { hours: report.timeBudgetHoursPerWeek }));
  parts.push(t('careerPlans.learning.metaBudget', { amount: wholeDollars(report.financialBudgetCents) }));
  return parts.join(' · ');
}

export function milestoneDone(report: Pick<SkillGapReport, 'progress'>, milestoneId: string): boolean {
  return report.progress.completedMilestoneIds.includes(milestoneId);
}

/**
 * "~6h · Cost unknown", "~6h · Free (stated 2026-05; check with the provider)"
 * or "~6h · about $40 (stated …)". The server sends a cost only together with
 * the date it was stated; without both the cost is unknown, never free.
 */
export function milestoneEffort(m: Pick<LearningPlanMilestone, 'estimatedHours' | 'estimatedCostCents' | 'costAsOf'>): string {
  const hours = t('careerPlans.learning.effortHours', { hours: m.estimatedHours });
  return `${hours} · ${milestoneCost(m)}`;
}

export function milestoneCost(m: Pick<LearningPlanMilestone, 'estimatedCostCents' | 'costAsOf'>): string {
  const cents = m.estimatedCostCents;
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0 || !m.costAsOf) return t('careerPlans.learning.costUnknown');
  const amount = cents === 0 ? t('careerPlans.learning.free') : t('careerPlans.learning.costAbout', { amount: wholeDollars(cents) });
  return t('careerPlans.learning.costAsOf', { amount, date: m.costAsOf });
}

/**
 * "Known costs: $40 · 1 step with unknown cost (not counted) · Cannot tell…".
 * Unknown costs are never added as 0 (career-shared learningPlanCost).
 */
export function planCostLine(report: Pick<SkillGapReport, 'learningPlan' | 'financialBudgetCents'>): string {
  const cost = learningPlanCost(report.learningPlan, report.financialBudgetCents);
  const parts = [t('careerPlans.learning.planCostKnown', { amount: wholeDollars(cost.knownTotalCents) })];
  if (cost.unknownCount > 0) parts.push(t('careerPlans.learning.planCostUnknownCount', { count: cost.unknownCount }));
  parts.push(
    cost.withinBudget === true
      ? t('careerPlans.learning.planWithinBudget')
      : cost.withinBudget === false
        ? t('careerPlans.learning.planOverBudget')
        : t('careerPlans.learning.planBudgetUnclear'),
  );
  return parts.join(' · ');
}

/** The badge for one requirement: an essential credential, a credential, or a skill gap by importance. */
export function gapBadge(gap: Pick<SkillGapItem, 'kind' | 'importance'>): { label: string; tone: PillTone } {
  if (isEssentialCredential(gap)) return { label: t('careerPlans.learning.essentialCredential'), tone: 'warning' };
  if (gap.kind === 'credential') {
    return { label: t('careerPlans.learning.credentialKind', { importance: importanceLabel(gap.importance) }), tone: 'default' };
  }
  return { label: importanceLabel(gap.importance), tone: IMPORTANCE_TONE[gap.importance] ?? 'default' };
}

export function hasEssentialCredential(report: Pick<SkillGapReport, 'skillGaps'>): boolean {
  return report.skillGaps.some((gap) => isEssentialCredential(gap));
}

/** The evidence-vault item already made from this milestone, if any (the server never duplicates it). */
export function milestoneEvidenceId(report: Pick<SkillGapReport, 'progress'>, milestoneId: string): string | null {
  return report.progress.evidenceByMilestone?.[milestoneId] ?? null;
}

/** The report with a milestone's evidence item recorded, as the server now stores it. */
export function withMilestoneEvidence(report: SkillGapReport, milestoneId: string, evidenceId: string): SkillGapReport {
  return {
    ...report,
    progress: { ...report.progress, evidenceByMilestone: { ...(report.progress.evidenceByMilestone ?? {}), [milestoneId]: evidenceId } },
  };
}

/**
 * The report with one milestone ticked or unticked and its percent recomputed
 * the way the server does (career-shared computeLearningProgress), for an
 * optimistic update before the server answers.
 */
export function withMilestone(report: SkillGapReport, milestoneId: string, completed: boolean): SkillGapReport {
  const valid = new Set(report.learningPlan.map((m) => m.id));
  const current = report.progress.completedMilestoneIds.filter((id) => id !== milestoneId);
  const next = completed ? [...current, milestoneId] : current;
  const kept = Array.from(new Set(next.filter((id) => valid.has(id))));
  const percent = report.learningPlan.length === 0 ? 100 : Math.min(100, Math.round((kept.length / report.learningPlan.length) * 100));
  return { ...report, progress: { ...report.progress, completedMilestoneIds: kept, percent } };
}

/** "CRITICAL GAP" etc. in the current language; an unknown importance is shown upper-cased. */
export function importanceLabel(importance: string): string {
  const key = `careerPlans.learning.importance.${importance}`;
  return hasKey(key) ? t(key) : importance.toUpperCase();
}

export const IMPORTANCE_TONE: Record<string, PillTone> = {
  critical: 'warning',
  preferred: 'brand',
  optional: 'default',
};

export function levelLabel(level: string): string {
  const key = `careerPlans.learning.level.${level}`;
  return hasKey(key) ? t(key) : level;
}

/** Only web links are opened from a learning resource. */
export function isOpenableUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

export function skillReportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'plan_upgrade_required':
        return t('careerPlans.learning.errors.planUpgrade');
      case 'quota_exhausted':
        return t('careerPlans.learning.errors.quota');
      case 'feature_unavailable':
        return t('careerPlans.learning.errors.featureOff');
      case 'provider_unavailable':
        return providerUnavailableMessage();
      case 'validation_error':
        return t('careerPlans.learning.errors.invalid');
      default:
        break;
    }
  }
  return careerErrorMessage(error, t('careerPlans.learning.errors.createFailed'));
}

export function progressErrorMessage(error: unknown): string {
  return careerErrorMessage(error, t('careerPlans.learning.errors.progressFailed'));
}

export function evidenceErrorMessage(error: unknown): string {
  // The server records only a ticked milestone (a repeat returns the existing item).
  if (error instanceof ApiError && error.code === 'validation_error' && error.body.reason === 'not_completed') {
    return t('careerPlans.learning.errors.tickFirst');
  }
  if (error instanceof ApiError && error.code === 'capacity_exceeded') return t('careerPlans.brief.evidence_capacity_exceeded');
  if (error instanceof ApiError && error.code === 'feature_unavailable') return t('careerPlans.brief.evidence_feature_unavailable');
  if (error instanceof ApiError && error.code === 'plan_upgrade_required') return t('careerPlans.brief.evidence_plan_upgrade');
  return careerErrorMessage(error, t('careerPlans.learning.errors.evidenceFailed'));
}

/** After "add to vault": a repeat returns the item already there instead of making a second one. */
export function evidenceResultMessage(created: boolean): string {
  return created ? t('careerPlans.learning.addedBanner') : t('careerPlans.brief.evidence_already_recorded');
}

// ---------------------------------------------------------------------------
// Charge notice before a paid report (spec section 21).

export function reportBalanceText(remaining: number | null): string {
  return remaining === null ? t('careerPlans.brief.charge_remaining_unknown') : t('careerPlans.brief.charge_remaining_value', { count: remaining });
}

// ---------------------------------------------------------------------------
// Project brief: the person's ownership statement, the finished project in
// the evidence vault, and a rubric self-check against delivered evidence
// (website ProjectBriefPanel). All free: the brief came with the report.

export const OWNERSHIP_MAX = 2000;
export const RUBRIC_NOTE_MAX = 1000;

type Brief = NonNullable<SkillGapReport['projectBrief']>;

export interface CriterionDraft {
  met: boolean;
  note: string;
}

/** Saved ownership statement ('' when none). It is never generated: only the person writes it. */
export function savedOwnership(brief: Pick<Brief, 'ownershipStatement'>): string {
  return brief.ownershipStatement ?? '';
}

/** Whether "Save statement" has something new to save. */
export function canSaveOwnership(draft: string, brief: Pick<Brief, 'ownershipStatement'>): boolean {
  const text = draft.trim();
  return text.length > 0 && text.length <= OWNERSHIP_MAX && text !== savedOwnership(brief);
}

/** The rubric drafts, starting from the saved self-check when there is one. */
export function initialCriteria(brief: Pick<Brief, 'rubrics' | 'rubricCheck'>): Record<string, CriterionDraft> {
  const out: Record<string, CriterionDraft> = {};
  for (const rubric of brief.rubrics) {
    const saved = brief.rubricCheck?.criteria.find((c) => c.criterionId === rubric.id);
    out[rubric.id] = { met: saved?.met ?? false, note: saved?.note ?? '' };
  }
  return out;
}

/** Every criterion of the brief, in order, with what the person marked. */
export function rubricCheckInput(
  brief: Pick<Brief, 'rubrics'>,
  criteria: Record<string, CriterionDraft>,
  evidenceIds: string[],
): RubricCheckInput {
  return {
    evidenceIds: Array.from(new Set(evidenceIds)),
    criteria: brief.rubrics.map((rubric) => ({
      criterionId: rubric.id,
      met: criteria[rubric.id]?.met ?? false,
      note: (criteria[rubric.id]?.note ?? '').trim(),
    })),
  };
}

/** Adds or removes one id (no duplicates). */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** "Self-check from 2 May 2026: 2 of 3 criteria met. Not an independent assessment." */
export function rubricStatusLine(check: NonNullable<Brief['rubricCheck']>, date: string): string {
  return t('careerPlans.brief.rubric_check_status', {
    met: check.criteria.filter((c) => c.met).length,
    total: check.criteria.length,
    date,
  });
}

/** Rubric weight as a percent in the current language. */
export function rubricWeight(weight: number): string {
  return `${formatNumber(weight)}%`;
}
