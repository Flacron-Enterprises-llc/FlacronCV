import { CURRENT_PLANS, PLAN_CONFIGS, SubscriptionPlan, planMeetsTier } from '@flacroncv/shared-types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Plan bullets for UI. PLAN_CONFIGS.features is English-only (API advertising
 * tests parse it); display must go through t() so all six locales match.
 * Counts come from the same limits object the API enforces. `t` is the
 * `pricing` namespace.
 *
 * Current plans (Free, Starter, Professional, Career Pro, Business): CV and
 * letter counts are capacities, credits and analyses renew monthly (Free
 * included), PDF exports are unlimited, Free exports carry a small mark.
 * Legacy plans (Pro, Career Accelerator, Enterprise) keep their original lines.
 */
export function localizedPlanFeatures(
  plan: SubscriptionPlan,
  t: Translate,
  templateLine: string,
): string[] {
  const config = PLAN_CONFIGS[plan] ?? PLAN_CONFIGS[SubscriptionPlan.FREE];
  return config.legacy ? legacyPlanFeatures(plan, t, templateLine) : currentPlanFeatures(plan, t, templateLine);
}

function currentPlanFeatures(plan: SubscriptionPlan, t: Translate, templateLine: string): string[] {
  const { limits } = PLAN_CONFIGS[plan];
  const lines: string[] = [];
  lines.push(limits.cvs === 'unlimited' ? t('feat_cvs_unlimited') : t('feat_cv_capacity', { count: limits.cvs }));
  lines.push(
    limits.coverLetters === 'unlimited'
      ? t('feat_letters_unlimited')
      : t('feat_letter_capacity', { count: limits.coverLetters }),
  );
  lines.push(t('feat_credits_monthly', { count: limits.aiCredits }));
  if (typeof limits.analyses === 'number') lines.push(t('feat_analyses_monthly', { count: limits.analyses }));
  lines.push(templateLine);
  lines.push(t('feat_exports_pdf_unlimited'));
  lines.push(limits.docxExport ? t('feat_pdf_docx') : t('feat_pdf'));
  if (typeof limits.trackedApplications === 'number') {
    lines.push(t('feat_tracked_apps', { count: limits.trackedApplications }));
  }
  if (!limits.removeBranding) lines.push(t('feat_branding_mark'));
  return lines;
}

/** Unchanged wording for the plans existing customers keep. */
function legacyPlanFeatures(plan: SubscriptionPlan, t: Translate, templateLine: string): string[] {
  const { limits } = PLAN_CONFIGS[plan];
  const lines: string[] = [];

  if (limits.cvs === 'unlimited') lines.push(t('feat_cvs_unlimited'));
  else lines.push(t('feat_cvs_monthly', { count: limits.cvs }));

  if (limits.coverLetters === 'unlimited') lines.push(t('feat_letters_unlimited'));
  else lines.push(t('feat_letters_monthly', { count: limits.coverLetters }));

  lines.push(t('feat_credits_monthly', { count: limits.aiCredits }));

  lines.push(templateLine);

  if (limits.exports === 'unlimited') lines.push(t('feat_exports_unlimited'));
  else lines.push(t('feat_exports', { count: limits.exports }));

  lines.push(t('feat_pdf_docx'));
  if (plan === SubscriptionPlan.CAREER_ACCELERATOR) {
    lines.push(t('feat_engine_tools'));
  }
  lines.push(t('feat_priority_support'));

  return lines;
}

/**
 * The cheapest CURRENT plan that reaches a template tier — what an upgrade
 * prompt for a tier-gated template should advertise (never a legacy plan).
 */
export function cheapestPlanForTier(tier: SubscriptionPlan): SubscriptionPlan {
  return (
    CURRENT_PLANS.find((plan) => planMeetsTier(plan, tier)) ?? SubscriptionPlan.BUSINESS
  );
}
