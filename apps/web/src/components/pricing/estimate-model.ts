import {
  ADDONS,
  addonById,
  estimate,
  includedUnits,
  planMeets,
  usagePacksFor,
  type BillingInterval,
  type Estimate,
  type PlanId,
  type UsageUnit,
} from '@flacroncv/career-shared';

/**
 * The spec §10A price calculator as plain data, so the arithmetic is testable
 * without a browser. All money comes from `estimate()` in career-shared — the
 * same catalog and least-cost pack selection the server uses at checkout.
 */

/** Extra usage the customer asks for, in units. Packs are chosen by least cost. */
export const USAGE_FIELDS = [
  { field: 'documents', unit: 'document_credit' },
  { field: 'alerts', unit: 'alert_item' },
  { field: 'actionPacks', unit: 'action_pack' },
  { field: 'voiceMinutes', unit: 'voice_minute' },
  { field: 'analyses', unit: 'resume_analysis' },
  { field: 'interviews', unit: 'text_interview' },
  { field: 'skillReports', unit: 'skill_report' },
  { field: 'scenarioReports', unit: 'scenario_report' },
  { field: 'coaching', unit: 'coaching_response' },
  { field: 'forms', unit: 'assisted_form' },
  { field: 'mapSessions', unit: 'map_session' },
] as const satisfies ReadonlyArray<{ field: string; unit: UsageUnit }>;

/**
 * Recurring capacity, entered as whole capacity units. `per` is how many of
 * those units one add-on grants, so 7 saved searches round up to two blocks of 5.
 */
export const CAPACITY_FIELDS = [
  { field: 'locations', addonId: 'location_extra', per: 1, scope: 'individual' },
  { field: 'savedSearches', addonId: 'saved_search_5', per: 5, scope: 'individual' },
  { field: 'portfolios', addonId: 'portfolio_extra', per: 1, scope: 'individual' },
  { field: 'storage10gb', addonId: 'storage_10gb', per: 1, scope: 'individual' },
  { field: 'staff', addonId: 'staff_seat', per: 1, scope: 'business' },
  { field: 'candidates25', addonId: 'candidates_25', per: 1, scope: 'business' },
  { field: 'candidates100', addonId: 'candidates_100', per: 1, scope: 'business' },
  { field: 'storage100gb', addonId: 'storage_100gb_business', per: 1, scope: 'business' },
] as const;

/** Prepaid messaging is entered in dollars and bought in whole top-ups. */
export const MESSAGING_ADDON_ID = 'messaging_topup';

export type UsageField = (typeof USAGE_FIELDS)[number]['field'];
export type CapacityField = (typeof CAPACITY_FIELDS)[number]['field'];
export type QuantityField = UsageField | CapacityField | 'messagingDollars';

export interface CalculatorState {
  planId: PlanId;
  interval: BillingInterval;
  quantities: Record<QuantityField, number>;
}

export const QUANTITY_CAP = 10_000;

export const EMPTY_QUANTITIES: Record<QuantityField, number> = Object.fromEntries(
  [...USAGE_FIELDS.map((f) => f.field), ...CAPACITY_FIELDS.map((f) => f.field), 'messagingDollars'].map((f) => [f, 0]),
) as Record<QuantityField, number>;

/** Whole numbers 0..10,000; anything else is refused (null) and leaves the field unchanged. */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed <= QUANTITY_CAP ? parsed : null;
}

function cheapestMinPlan(addonIds: string[]): PlanId {
  // The lowest plan any of the add-ons allows; Starter at the least (Free buys nothing).
  const order: PlanId[] = ['starter', 'professional', 'career_pro', 'business'];
  return order.find((plan) => addonIds.some((id) => addonById(id)?.minPlan === plan)) ?? 'business';
}

/** The lowest plan on which a field can be bought (spec §9 restrictions). */
export function requiredPlanFor(field: QuantityField): PlanId {
  const usage = USAGE_FIELDS.find((f) => f.field === field);
  if (usage) return cheapestMinPlan(usagePacksFor(usage.unit).map((pack) => pack.id));
  const capacity = CAPACITY_FIELDS.find((f) => f.field === field);
  if (capacity) return cheapestMinPlan([capacity.addonId]);
  return cheapestMinPlan([MESSAGING_ADDON_ID]);
}

/** Why a field is disabled on this plan (the plan it needs), or null when it can be bought. */
export function restrictionFor(field: QuantityField, planId: PlanId): PlanId | null {
  const required = requiredPlanFor(field);
  return planMeets(planId, required) ? null : required;
}

/** Fields shown for this plan. Business capacity appears only on Business; individual storage only off it. */
export function visibleFields(planId: PlanId): QuantityField[] {
  return [
    ...USAGE_FIELDS.map((f) => f.field),
    ...CAPACITY_FIELDS.filter((f) =>
      planId === 'business' ? f.field !== 'storage10gb' : f.scope === 'individual',
    ).map((f) => f.field),
    'messagingDollars',
  ];
}

function addMonthsUtc(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay)));
}

export interface IncludedVsPurchased {
  unit: UsageUnit;
  field: UsageField;
  included: number | null;
  purchased: number;
  requested: number;
}

export interface CalculatorResult {
  estimate: Estimate;
  /** Fields the customer filled in that this plan cannot buy, with the plan they need. */
  restricted: Array<{ field: QuantityField; requiredPlan: PlanId }>;
  included: IncludedVsPurchased[];
  /** When the base subscription next bills: a month or a year from today. Null on Free. */
  nextRenewal: Date | null;
  /** When included allowances next renew: always monthly (spec §5). Null on Free. */
  allowanceRenewal: Date | null;
  /** One-time packs expire twelve months after purchase (spec §9). Null when none are bought. */
  packExpiry: Date | null;
  messagingCents: number;
}

/** New-customer estimate (spec §10B). Restricted fields are left out, never silently charged. */
export function calculate(state: CalculatorState, now: Date = new Date()): CalculatorResult {
  const { planId, interval, quantities } = state;
  const restricted: CalculatorResult['restricted'] = [];
  const allowed = (field: QuantityField): number => {
    const quantity = quantities[field] ?? 0;
    if (quantity <= 0) return 0;
    if (!visibleFields(planId).includes(field)) return 0;
    const required = restrictionFor(field, planId);
    if (required) {
      restricted.push({ field, requiredPlan: required });
      return 0;
    }
    return quantity;
  };

  const desired = USAGE_FIELDS.map(({ field, unit }) => ({ unit, units: allowed(field) })).filter((d) => d.units > 0);
  const recurring = CAPACITY_FIELDS.map(({ field, addonId, per }) => ({
    addonId,
    quantity: Math.ceil(allowed(field) / per),
  })).filter((r) => r.quantity > 0);
  const messaging = addonById(MESSAGING_ADDON_ID);
  const topUps = messaging ? Math.ceil(allowed('messagingDollars') * 100 / messaging.priceCents) : 0;

  const result = estimate({
    planId,
    interval,
    desired,
    recurring,
    oneTime: topUps > 0 ? [{ addonId: MESSAGING_ADDON_ID, quantity: topUps }] : [],
  });

  const included = USAGE_FIELDS.map(({ field, unit }) => {
    const purchased = result.lines
      .filter((line) => line.billing === 'one_time' && addonById(line.id)?.unit === unit)
      .reduce((sum, line) => sum + (line.unitsPurchased ?? 0), 0);
    return { unit, field, included: includedUnits(planId, unit), purchased, requested: quantities[field] ?? 0 };
  }).filter((row) => row.included !== null || row.purchased > 0);

  const paid = planId !== 'free';
  const hasPacks = result.lines.some((line) => addonById(line.id)?.kind === 'usage_pack');
  return {
    estimate: result,
    restricted,
    included,
    nextRenewal: paid ? addMonthsUtc(now, interval === 'annual' ? 12 : 1) : null,
    allowanceRenewal: paid ? addMonthsUtc(now, 1) : null,
    packExpiry: hasPacks ? addMonthsUtc(now, 12) : null,
    messagingCents: messaging ? topUps * messaging.priceCents : 0,
  };
}

/** Whether the plan includes a usage unit at all (null allowance = not included). */
export function planIncludes(planId: PlanId, unit: UsageUnit): boolean {
  return includedUnits(planId, unit) !== null;
}

/** Every add-on shown in the public catalog list: active, firm-priced, not a future offer. */
export function catalogAddons() {
  return ADDONS.filter((addon) => addon.status === 'active' && addon.kind !== 'future_offer');
}
