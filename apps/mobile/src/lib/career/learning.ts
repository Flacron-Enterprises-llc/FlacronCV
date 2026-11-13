import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { SkillGapReport } from '../../../../../packages/career-api-client/src/types';
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

/** "~6h · Free" or "~6h · about $40". */
export function milestoneEffort(m: { estimatedHours: number; estimatedCostCents: number }): string {
  const hours = t('careerPlans.learning.effortHours', { hours: m.estimatedHours });
  const cost = m.estimatedCostCents > 0 ? t('careerPlans.learning.costAbout', { amount: wholeDollars(m.estimatedCostCents) }) : t('careerPlans.learning.free');
  return `${hours} · ${cost}`;
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
  return { ...report, progress: { completedMilestoneIds: kept, percent } };
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
  return careerErrorMessage(error, t('careerPlans.learning.errors.evidenceFailed'));
}
