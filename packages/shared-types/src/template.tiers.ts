import { SubscriptionPlan } from './enums';
import { CVLayout } from './cv.types';

/**
 * Single source of truth for template/layout entitlement tiers.
 *
 * The paid template paywall must be enforced SERVER-SIDE, not just hidden in the
 * UI — the render lever for a CV is `styling.layout` and for a cover letter is
 * `templateId`, both of which a client can set directly. These maps + helpers are
 * shared by the API (to block over-tier selections on save) and the web app (to
 * gate the pickers and to gracefully fall back at render/export time).
 */

/**
 * Which plan each CV layout requires. This reflects ACTUAL reachability, not the
 * old (inconsistent) Design-panel map: the FREE "Compact" template renders the
 * `compact` layout, so `compact` must be FREE. Only `top-bar` (used exclusively by
 * paid templates) and `slate-gold` (a Design-panel-only premium layout that no
 * template produces) are genuinely PRO.
 */
export const CV_LAYOUT_TIER: Record<CVLayout, SubscriptionPlan> = {
  classic: SubscriptionPlan.FREE,
  sidebar: SubscriptionPlan.FREE,
  compact: SubscriptionPlan.FREE,
  'top-bar': SubscriptionPlan.PRO,
  'slate-gold': SubscriptionPlan.PRO,
};

/**
 * Authoritative tier for the built-in CV templates (matches the seed catalog).
 * Used as the primary gating source so template access is enforced even if the
 * Firestore `templates` catalog hasn't been seeded yet (no fail-open). Unknown
 * ids (admin-created custom templates) fall back to the Firestore doc's tier.
 */
export const CV_TEMPLATE_TIER: Record<string, SubscriptionPlan> = {
  modern: SubscriptionPlan.FREE,
  classic: SubscriptionPlan.FREE,
  minimal: SubscriptionPlan.FREE,
  compact: SubscriptionPlan.FREE,
  academic: SubscriptionPlan.FREE,
  professional: SubscriptionPlan.PRO,
  creative: SubscriptionPlan.PRO,
  executive: SubscriptionPlan.PRO,
  'two-column': SubscriptionPlan.PRO,
  bold: SubscriptionPlan.ENTERPRISE,
};

/**
 * Cover-letter template tiers, keyed by the BARE ids the app actually stores on
 * the cover letter (`classic`/`modern`/…), not the backend `cl-*` seed slugs.
 */
export const COVER_LETTER_TEMPLATE_TIER: Record<string, SubscriptionPlan> = {
  classic: SubscriptionPlan.FREE,
  modern: SubscriptionPlan.FREE,
  standard: SubscriptionPlan.FREE, // legacy alias for 'modern'
  minimalist: SubscriptionPlan.PRO,
  creative: SubscriptionPlan.PRO,
  corporate: SubscriptionPlan.ENTERPRISE,
  executive: SubscriptionPlan.ENTERPRISE,
};

/** Ordinal rank of each plan, for "is plan >= required tier" comparisons. */
export const PLAN_RANK: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PRO]: 1,
  // Career Accelerator sits between Pro and Enterprise → it can use PRO-tier
  // templates/layouts but NOT ENTERPRISE-tier ones (ASSUMPTION).
  [SubscriptionPlan.CAREER_ACCELERATOR]: 2,
  [SubscriptionPlan.ENTERPRISE]: 3,
};

/** True when `plan` is at or above `requiredTier` (free < pro < career < enterprise). */
export function planMeetsTier(plan: SubscriptionPlan, requiredTier: SubscriptionPlan): boolean {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[requiredTier] ?? 0);
}

const DEFAULT_CV_LAYOUT: CVLayout = 'classic';
const DEFAULT_CL_TEMPLATE = 'modern';

/** Can this plan NEWLY SELECT this CV layout? (Unknown ids are treated as free.) */
export function canUseCvLayout(layout: string | null | undefined, plan: SubscriptionPlan): boolean {
  const tier = layout ? CV_LAYOUT_TIER[layout as CVLayout] : undefined;
  return tier ? planMeetsTier(plan, tier) : true;
}

/** Can this plan NEWLY SELECT this cover-letter template? (Unknown ids → free.) */
export function canUseCoverLetterTemplate(id: string | null | undefined, plan: SubscriptionPlan): boolean {
  const tier = id ? COVER_LETTER_TEMPLATE_TIER[id] : undefined;
  return tier ? planMeetsTier(plan, tier) : true;
}

/**
 * The CV layout to actually RENDER/EXPORT for a user on `plan`: the stored layout
 * if they can access it, else a graceful free fallback (no error, no data loss —
 * the stored value is untouched, so re-upgrading restores the design).
 */
export function effectiveCvLayout(
  storedLayout: string | null | undefined,
  plan: SubscriptionPlan,
): CVLayout {
  const layout = (storedLayout || DEFAULT_CV_LAYOUT) as CVLayout;
  const tier = CV_LAYOUT_TIER[layout];
  if (!tier) return DEFAULT_CV_LAYOUT; // unknown/removed layout → safe default
  return planMeetsTier(plan, tier) ? layout : DEFAULT_CV_LAYOUT;
}

/** The cover-letter template to actually render/export (graceful free fallback). */
export function effectiveCoverLetterTemplate(
  storedId: string | null | undefined,
  plan: SubscriptionPlan,
): string {
  const id = storedId || DEFAULT_CL_TEMPLATE;
  const tier = COVER_LETTER_TEMPLATE_TIER[id];
  if (!tier) return DEFAULT_CL_TEMPLATE;
  return planMeetsTier(plan, tier) ? id : DEFAULT_CL_TEMPLATE;
}
