import { SubscriptionPlan, allPlansForAdmin, asSubscriptionPlan, isLegacyPlan } from '@flacroncv/shared-types';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Every plan id for admin / CRM dropdowns, filters and stats: the five current
 * plans first, then the legacy ones (existing customers only). Never hard-code
 * a plan list in a page — use this.
 */
export const ADMIN_PLAN_OPTIONS: readonly SubscriptionPlan[] = allPlansForAdmin();

/**
 * A plan's name from the `crm` namespace (`crm.plan_<id>`), with legacy plans
 * marked — "Pro (legacy)" — so an operator never confuses a grandfathered
 * customer with a current plan. Unknown stored values are shown as stored.
 * `t` must be `useTranslations('crm')`.
 */
export function crmPlanLabel(t: Translate, plan: string | null | undefined): string {
  const id = asSubscriptionPlan(plan || SubscriptionPlan.FREE);
  if (!id) return plan ?? '';
  const name = t(`plan_${id}`);
  return isLegacyPlan(id) ? t('plan_legacy_label', { plan: name }) : name;
}

/** Badge colours per plan (CRM lists). Legacy plans keep their old colours. */
export const PLAN_BADGE_CLASSES: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  [SubscriptionPlan.STARTER]: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  [SubscriptionPlan.PROFESSIONAL]: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  [SubscriptionPlan.CAREER_PRO]: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  [SubscriptionPlan.BUSINESS]: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  [SubscriptionPlan.PRO]: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  [SubscriptionPlan.CAREER_ACCELERATOR]: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  [SubscriptionPlan.ENTERPRISE]: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

/** Badge colours for a stored plan string (unknown → Free colours). */
export function planBadgeClass(plan: string | null | undefined): string {
  const id = asSubscriptionPlan(plan);
  return id ? PLAN_BADGE_CLASSES[id] : PLAN_BADGE_CLASSES[SubscriptionPlan.FREE];
}
