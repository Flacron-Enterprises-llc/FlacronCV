import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Plan bullets for UI. PLAN_CONFIGS.features is English-only (API advertising
 * tests parse it); display must go through t() so all six locales match.
 * Counts come from the same limits object the API enforces.
 */
export function localizedPlanFeatures(
  plan: SubscriptionPlan,
  t: Translate,
  templateLine: string,
): string[] {
  const { limits } = PLAN_CONFIGS[plan];
  const monthly = plan !== SubscriptionPlan.FREE;
  const lines: string[] = [];

  if (limits.cvs === 'unlimited') lines.push(t('feat_cvs_unlimited'));
  else if (monthly) lines.push(t('feat_cvs_monthly', { count: limits.cvs }));
  else lines.push(t('feat_cvs', { count: limits.cvs }));

  if (limits.coverLetters === 'unlimited') lines.push(t('feat_letters_unlimited'));
  else if (monthly) lines.push(t('feat_letters_monthly', { count: limits.coverLetters }));
  else lines.push(t('feat_letters', { count: limits.coverLetters }));

  if (monthly) lines.push(t('feat_credits_monthly', { count: limits.aiCredits }));
  else lines.push(t('feat_credits', { count: limits.aiCredits }));

  lines.push(templateLine);

  if (limits.exports === 'unlimited') lines.push(t('feat_exports_unlimited'));
  else lines.push(t('feat_exports', { count: limits.exports }));

  if (plan === SubscriptionPlan.FREE) {
    lines.push(t('feat_pdf'));
  } else {
    lines.push(t('feat_pdf_docx'));
    if (plan === SubscriptionPlan.CAREER_ACCELERATOR) {
      lines.push(t('feat_engine_tools'));
    }
    lines.push(t('feat_priority_support'));
  }

  return lines;
}
