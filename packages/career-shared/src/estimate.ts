import {
  addonById,
  CATALOG_VERSION,
  PLANS,
  planMeets,
  type BillingInterval,
  type PlanId,
  type UsageUnit,
} from './catalog';
import { monthlyEquivalentCents } from './money';
import { selectCheapestPacks } from './packs';

export interface DesiredUnits {
  unit: UsageUnit;
  units: number;
}

export interface RecurringSelection {
  addonId: string;
  quantity: number;
}

/** Explicit one-time lines that are not usage packs. The messaging top-up is the Phase 1 case. */
export interface OneTimeSelection {
  addonId: string;
  quantity: number;
}

export interface EstimateInput {
  planId: PlanId;
  interval: BillingInterval;
  desired?: DesiredUnits[];
  recurring?: RecurringSelection[];
  oneTime?: OneTimeSelection[];
}

export interface EstimateLine {
  id: string;
  quantity: number;
  unitPriceCents: number;
  lineCents: number;
  billing: 'monthly' | 'annual_upfront' | 'one_time';
  unitsPurchased: number | null;
}

export interface EstimateNote {
  code: 'plan' | 'not_purchasable' | 'invalid_quantity' | 'no_pack';
  unit?: UsageUnit;
  addonId?: string;
}

export interface Estimate {
  catalogVersion: string;
  planId: PlanId;
  interval: BillingInterval;
  tax: 'excluded';
  baseCents: number;
  /** What keeps being billed each month after today. Annual base is not included. */
  recurringMonthlyCents: number;
  oneTimeCents: number;
  dueNowCents: number;
  /** Set for annual base plans. Display only. */
  monthlyEquivalentCents: number | null;
  lines: EstimateLine[];
  notes: EstimateNote[];
}

/**
 * New-customer arithmetic from spec section 10B.
 * Monthly due now = base + monthly add-ons + one-time packs.
 * Annual due now = annual base + the first month of capacity add-ons + one-time packs.
 * Mid-cycle proration and tax are not this function.
 */
export function estimate(input: EstimateInput): Estimate {
  const plan = PLANS[input.planId];
  const baseCents = input.interval === 'annual' ? plan.annualCents : plan.monthlyCents;
  const lines: EstimateLine[] = [
    {
      id: plan.id,
      quantity: 1,
      unitPriceCents: baseCents,
      lineCents: baseCents,
      billing: input.interval === 'annual' ? 'annual_upfront' : 'monthly',
      unitsPurchased: null,
    },
  ];
  const notes: EstimateNote[] = [];
  let oneTimeCents = 0;
  let monthlyAddonCents = 0;

  for (const desired of input.desired ?? []) {
    const selection = selectCheapestPacks(desired.unit, desired.units, input.planId);
    if (!selection.ok) {
      notes.push({ code: selection.reason, unit: desired.unit });
      continue;
    }
    for (const pack of selection.packs) {
      const lineCents = pack.priceCentsEach * pack.quantity;
      oneTimeCents += lineCents;
      lines.push({
        id: pack.addonId,
        quantity: pack.quantity,
        unitPriceCents: pack.priceCentsEach,
        lineCents,
        billing: 'one_time',
        unitsPurchased: pack.unitsEach * pack.quantity,
      });
    }
  }

  for (const extra of input.oneTime ?? []) {
    if (!Number.isInteger(extra.quantity) || extra.quantity < 0) {
      notes.push({ code: 'invalid_quantity', addonId: extra.addonId });
      continue;
    }
    if (extra.quantity === 0) continue;
    const addon = addonById(extra.addonId);
    // Usage packs stay on `desired`, so a caller cannot skip the least-cost combination.
    if (!addon || addon.status !== 'active' || addon.billing !== 'one_time' || !addon.firmPrice || addon.kind === 'usage_pack') {
      notes.push({ code: 'not_purchasable', addonId: extra.addonId });
      continue;
    }
    if (!planMeets(input.planId, addon.minPlan)) {
      notes.push({ code: 'plan', addonId: extra.addonId });
      continue;
    }
    const lineCents = addon.priceCents * extra.quantity;
    oneTimeCents += lineCents;
    lines.push({
      id: addon.id,
      quantity: extra.quantity,
      unitPriceCents: addon.priceCents,
      lineCents,
      billing: 'one_time',
      unitsPurchased: addon.units * extra.quantity,
    });
  }

  for (const recurring of input.recurring ?? []) {
    if (!Number.isInteger(recurring.quantity) || recurring.quantity < 0) {
      notes.push({ code: 'invalid_quantity', addonId: recurring.addonId });
      continue;
    }
    if (recurring.quantity === 0) continue;
    const addon = addonById(recurring.addonId);
    if (!addon || addon.status !== 'active' || addon.billing !== 'monthly' || !addon.firmPrice) {
      notes.push({ code: 'not_purchasable', addonId: recurring.addonId });
      continue;
    }
    if (!planMeets(input.planId, addon.minPlan)) {
      notes.push({ code: 'plan', addonId: recurring.addonId });
      continue;
    }
    const lineCents = addon.priceCents * recurring.quantity;
    monthlyAddonCents += lineCents;
    lines.push({
      id: addon.id,
      quantity: recurring.quantity,
      unitPriceCents: addon.priceCents,
      lineCents,
      billing: 'monthly',
      unitsPurchased: addon.units * recurring.quantity,
    });
  }

  return {
    catalogVersion: CATALOG_VERSION,
    planId: input.planId,
    interval: input.interval,
    tax: 'excluded',
    baseCents,
    recurringMonthlyCents: (input.interval === 'monthly' ? baseCents : 0) + monthlyAddonCents,
    oneTimeCents,
    dueNowCents: baseCents + monthlyAddonCents + oneTimeCents,
    monthlyEquivalentCents: input.interval === 'annual' ? monthlyEquivalentCents(plan.annualCents) : null,
    lines,
    notes,
  };
}
