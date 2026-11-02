import { planMeets, usagePacksFor, type PlanId, type UsageUnit } from './catalog';

export interface PackPick {
  addonId: string;
  quantity: number;
  unitsEach: number;
  priceCentsEach: number;
}

export type PackSelection =
  | {
      ok: true;
      unit: UsageUnit;
      unitsRequested: number;
      unitsPurchased: number;
      totalCents: number;
      packs: PackPick[];
    }
  | {
      ok: false;
      reason: 'plan' | 'no_pack' | 'invalid_quantity';
      unit: UsageUnit;
      unitsRequested: number;
    };

/**
 * Least-cost combination of whole packs that meets or exceeds `unitsNeeded`.
 * Spec section 10B. Ties keep the smaller credit total.
 */
export function selectCheapestPacks(unit: UsageUnit, unitsNeeded: number, planId: PlanId): PackSelection {
  if (!Number.isInteger(unitsNeeded) || unitsNeeded < 0) {
    return { ok: false, reason: 'invalid_quantity', unit, unitsRequested: unitsNeeded };
  }
  if (unitsNeeded === 0) {
    return { ok: true, unit, unitsRequested: 0, unitsPurchased: 0, totalCents: 0, packs: [] };
  }

  const all = usagePacksFor(unit);
  if (all.length === 0) {
    return { ok: false, reason: 'no_pack', unit, unitsRequested: unitsNeeded };
  }
  const packs = all.filter((pack) => planMeets(planId, pack.minPlan));
  if (packs.length === 0) {
    return { ok: false, reason: 'plan', unit, unitsRequested: unitsNeeded };
  }

  const maxUnits = Math.max(...packs.map((pack) => pack.units));
  const limit = unitsNeeded + maxUnits;
  const inf = Number.POSITIVE_INFINITY;
  const cost = new Array<number>(limit + 1).fill(inf);
  const via = new Array<number>(limit + 1).fill(-1);
  cost[0] = 0;

  for (let have = 0; have <= limit; have += 1) {
    if (cost[have] === inf) continue;
    for (let index = 0; index < packs.length; index += 1) {
      const next = have + packs[index].units;
      if (next > limit) continue;
      const nextCost = cost[have] + packs[index].priceCents;
      if (nextCost < cost[next]) {
        cost[next] = nextCost;
        via[next] = index;
      }
    }
  }

  let bestUnits = -1;
  let bestCost = inf;
  for (let have = unitsNeeded; have <= limit; have += 1) {
    if (cost[have] < bestCost) {
      bestCost = cost[have];
      bestUnits = have;
    }
  }
  if (bestUnits < 0) {
    return { ok: false, reason: 'no_pack', unit, unitsRequested: unitsNeeded };
  }

  const counts = new Map<string, number>();
  let cursor = bestUnits;
  while (cursor > 0) {
    const index = via[cursor];
    if (index < 0) {
      return { ok: false, reason: 'no_pack', unit, unitsRequested: unitsNeeded };
    }
    const pack = packs[index];
    counts.set(pack.id, (counts.get(pack.id) ?? 0) + 1);
    cursor -= pack.units;
  }

  const picks: PackPick[] = packs
    .filter((pack) => counts.has(pack.id))
    .map((pack) => ({
      addonId: pack.id,
      quantity: counts.get(pack.id) ?? 0,
      unitsEach: pack.units,
      priceCentsEach: pack.priceCents,
    }));

  const unitsPurchased = picks.reduce((sum, pick) => sum + pick.unitsEach * pick.quantity, 0);
  const totalCents = picks.reduce((sum, pick) => sum + pick.priceCentsEach * pick.quantity, 0);

  return {
    ok: true,
    unit,
    unitsRequested: unitsNeeded,
    unitsPurchased,
    totalCents,
    packs: picks,
  };
}
