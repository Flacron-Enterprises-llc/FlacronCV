/**
 * Career packs and capacity add-ons sold through V1's Stripe account (spec
 * section 9 and 10). A copy of the purchasable rows of the career catalog
 * (`packages/career-shared/src/catalog.ts`, version 2026-10-10); the spec
 * test `career-addons.spec.ts` fails if the two ever disagree, so this copy
 * cannot drift. The career service re-checks every grant against its own
 * catalog snapshot.
 *
 * Stripe price ids come only from env, never from code:
 * - one-time pack:       STRIPE_PRICE_PACK_<ID>            e.g. STRIPE_PRICE_PACK_DOCUMENT_S
 * - recurring add-on:    STRIPE_PRICE_PACK_<ID>_RECURRING  e.g. STRIPE_PRICE_PACK_LOCATION_EXTRA_RECURRING
 * An unset variable means "not on sale yet" (`ADDON_NOT_ON_SALE`).
 */
export type CareerPlanId = 'free' | 'starter' | 'professional' | 'career_pro' | 'business';

export const CAREER_PLAN_ORDER: readonly CareerPlanId[] = ['free', 'starter', 'professional', 'career_pro', 'business'];

export interface CareerAddon {
  id: string;
  kind: 'usage_pack' | 'capacity' | 'organization';
  unit: string;
  units: number;
  priceCents: number;
  billing: 'one_time' | 'monthly';
  minPlan: CareerPlanId;
}

export const CAREER_ADDONS: readonly CareerAddon[] = [
  { id: 'document_s', kind: 'usage_pack', unit: 'document_credit', units: 10, priceCents: 499, billing: 'one_time', minPlan: 'starter' },
  { id: 'document_m', kind: 'usage_pack', unit: 'document_credit', units: 30, priceCents: 1299, billing: 'one_time', minPlan: 'starter' },
  { id: 'document_l', kind: 'usage_pack', unit: 'document_credit', units: 100, priceCents: 3499, billing: 'one_time', minPlan: 'starter' },
  { id: 'analysis_25', kind: 'usage_pack', unit: 'resume_analysis', units: 25, priceCents: 699, billing: 'one_time', minPlan: 'starter' },
  { id: 'action_s', kind: 'usage_pack', unit: 'action_pack', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'professional' },
  { id: 'action_l', kind: 'usage_pack', unit: 'action_pack', units: 20, priceCents: 2499, billing: 'one_time', minPlan: 'professional' },
  { id: 'alert_s', kind: 'usage_pack', unit: 'alert_item', units: 100, priceCents: 399, billing: 'one_time', minPlan: 'starter' },
  { id: 'alert_l', kind: 'usage_pack', unit: 'alert_item', units: 500, priceCents: 1499, billing: 'one_time', minPlan: 'starter' },
  { id: 'text_interview_5', kind: 'usage_pack', unit: 'text_interview', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'starter' },
  { id: 'voice_s', kind: 'usage_pack', unit: 'voice_minute', units: 60, priceCents: 999, billing: 'one_time', minPlan: 'professional' },
  { id: 'voice_l', kind: 'usage_pack', unit: 'voice_minute', units: 180, priceCents: 2499, billing: 'one_time', minPlan: 'professional' },
  { id: 'skill_5', kind: 'usage_pack', unit: 'skill_report', units: 5, priceCents: 799, billing: 'one_time', minPlan: 'starter' },
  { id: 'scenario_3', kind: 'usage_pack', unit: 'scenario_report', units: 3, priceCents: 999, billing: 'one_time', minPlan: 'professional' },
  { id: 'coaching_100', kind: 'usage_pack', unit: 'coaching_response', units: 100, priceCents: 999, billing: 'one_time', minPlan: 'starter' },
  { id: 'assisted_form_25', kind: 'usage_pack', unit: 'assisted_form', units: 25, priceCents: 699, billing: 'one_time', minPlan: 'professional' },
  { id: 'map_200', kind: 'usage_pack', unit: 'map_session', units: 200, priceCents: 399, billing: 'one_time', minPlan: 'professional' },
  { id: 'location_extra', kind: 'capacity', unit: 'location_profile', units: 1, priceCents: 199, billing: 'monthly', minPlan: 'starter' },
  { id: 'saved_search_5', kind: 'capacity', unit: 'saved_search', units: 5, priceCents: 299, billing: 'monthly', minPlan: 'starter' },
  { id: 'portfolio_extra', kind: 'capacity', unit: 'portfolio_page', units: 1, priceCents: 299, billing: 'monthly', minPlan: 'starter' },
  { id: 'storage_10gb', kind: 'capacity', unit: 'storage_byte', units: 10_000_000_000, priceCents: 299, billing: 'monthly', minPlan: 'starter' },
  { id: 'staff_seat', kind: 'organization', unit: 'staff_seat', units: 1, priceCents: 1900, billing: 'monthly', minPlan: 'business' },
  { id: 'candidates_25', kind: 'organization', unit: 'active_candidate', units: 25, priceCents: 4900, billing: 'monthly', minPlan: 'business' },
  { id: 'candidates_100', kind: 'organization', unit: 'active_candidate', units: 100, priceCents: 14900, billing: 'monthly', minPlan: 'business' },
  { id: 'storage_100gb_business', kind: 'organization', unit: 'storage_byte', units: 100_000_000_000, priceCents: 999, billing: 'monthly', minPlan: 'business' },
];

export function careerAddon(id: string): CareerAddon | null {
  return CAREER_ADDONS.find((a) => a.id === id) ?? null;
}

/** Env variable naming the Stripe price of an add-on. */
export function addonPriceEnvName(addon: Pick<CareerAddon, 'id' | 'billing'>): string {
  const base = `STRIPE_PRICE_PACK_${addon.id.toUpperCase()}`;
  return addon.billing === 'monthly' ? `${base}_RECURRING` : base;
}

/** `addonId → price id` for the add-ons whose price is configured. Blank values are unset. */
export function readAddonPrices(env: Record<string, string | undefined> = process.env): Map<string, string> {
  const out = new Map<string, string>();
  for (const addon of CAREER_ADDONS) {
    const value = env[addonPriceEnvName(addon)]?.trim();
    if (!value) continue;
    if (!value.startsWith('price_')) throw new Error(`${addonPriceEnvName(addon)} must be a Stripe price id`);
    out.set(addon.id, value);
  }
  return out;
}

/** PLAN_CONTRACT default map: the five plans 1:1, legacy plans to the closest career plan. */
const V1_TO_CAREER: Record<string, CareerPlanId> = {
  free: 'free',
  starter: 'starter',
  professional: 'professional',
  career_pro: 'career_pro',
  business: 'business',
  pro: 'starter',
  career_accelerator: 'professional',
  enterprise: 'career_pro',
};

export function careerPlanForV1(plan: string | null | undefined): CareerPlanId {
  return (plan && V1_TO_CAREER[plan]) || 'free';
}

export function careerPlanRank(plan: CareerPlanId): number {
  return CAREER_PLAN_ORDER.indexOf(plan);
}

/** The higher of two career plans. */
export function higherCareerPlan(a: CareerPlanId, b: CareerPlanId | null): CareerPlanId {
  return b && careerPlanRank(b) > careerPlanRank(a) ? b : a;
}

export type AddonRefusal = 'UNKNOWN_ADDON' | 'UPGRADE_REQUIRED';

/**
 * Section 9: Free upgrades first; each add-on has a plan minimum (action,
 * voice, scenario, form and map packs need Professional; Business add-ons
 * need Business).
 */
export function addonAllowedFor(plan: CareerPlanId, addonId: string): { ok: true; addon: CareerAddon } | { ok: false; reason: AddonRefusal; minimumPlan?: CareerPlanId } {
  const addon = careerAddon(addonId);
  if (!addon) return { ok: false, reason: 'UNKNOWN_ADDON' };
  if (plan === 'free' || careerPlanRank(plan) < careerPlanRank(addon.minPlan)) {
    return { ok: false, reason: 'UPGRADE_REQUIRED', minimumPlan: plan === 'free' && addon.minPlan === 'free' ? 'starter' : addon.minPlan };
  }
  return { ok: true, addon };
}
