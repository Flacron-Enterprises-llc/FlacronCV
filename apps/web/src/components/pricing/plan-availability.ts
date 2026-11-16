'use client';

import { useQuery } from '@tanstack/react-query';
import { ADDONS, type BillingInterval, type PlanId } from '@flacroncv/career-shared';
import { api } from '@/lib/api';
import { PRICING_PLANS } from './plan-catalog';

/**
 * What can actually be bought right now. Prices and allowances come from the
 * shared catalog; whether a plan or pack is ON SALE depends on the V1 API
 * having a Stripe price for it (PLAN_CONTRACT "Selling"), which only the
 * server knows. This adapter is the one place the UI learns that, so swapping
 * the endpoint or its shape touches nothing else.
 *
 * Fail closed: an unreachable or unknown endpoint means nothing paid is on
 * sale, and the UI says "Coming soon" + Contact us instead of a dead button.
 */
export interface PlanAvailability {
  /** 'server' when GET /plans answered; 'unavailable' when it did not. */
  source: 'server' | 'unavailable';
  /** Catalog version the server sells from, when it says. */
  catalogVersion: string | null;
  plans: Record<PlanId, Record<BillingInterval, boolean>>;
  /** Add-on id → on sale (price configured AND the server says the feature can be bought). Missing ids are not on sale. */
  addons: Record<string, boolean>;
  /**
   * Add-on id → why the server will not sell it now (feature not built, switched off,
   * provider not connected, service unreachable). Only for add-ons the server reported.
   */
  addonBlocks: Record<string, AddonBlock>;
}

export type AddonBlockReason = 'not_built' | 'feature_off' | 'service_unavailable' | 'provider_missing';
export type AddonBlockProvider = 'ai' | 'speech' | 'objectStorage' | 'mapTiles' | 'jobFeeds';
export interface AddonBlock {
  reason: AddonBlockReason;
  provider: AddonBlockProvider | null;
}

const BLOCK_REASONS: readonly string[] = ['not_built', 'feature_off', 'service_unavailable', 'provider_missing'];
const BLOCK_PROVIDERS: readonly string[] = ['ai', 'speech', 'objectStorage', 'mapTiles', 'jobFeeds'];

export const PLANS_ENDPOINT = '/plans';
/** Signed-in only: which add-ons have a Stripe price (`addons[].onSale`). */
export const ADDON_STATUS_ENDPOINT = '/career-billing/status';
/** V1 API checkouts for add-ons; only called for add-ons reported on sale. */
export const PACK_CHECKOUT_ENDPOINT = '/career-billing/packs/checkout';
export const CAPACITY_CHECKOUT_ENDPOINT = '/career-billing/capacity/checkout';
export const PLAN_AVAILABILITY_QUERY_KEY = ['plan-availability'] as const;

function closedPlans(): PlanAvailability['plans'] {
  return Object.fromEntries(
    PRICING_PLANS.map((id) => [id, { monthly: id === 'free', annual: id === 'free' }]),
  ) as PlanAvailability['plans'];
}

export const NOTHING_ON_SALE: PlanAvailability = {
  source: 'unavailable',
  catalogVersion: null,
  plans: closedPlans(),
  addons: {},
  addonBlocks: {},
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads `true` only from an explicit boolean; anything else is "not configured". */
function flag(value: unknown): boolean {
  return value === true;
}

function intervalsOf(entry: Json): Record<BillingInterval, boolean> {
  // Accepted shapes, most specific first:
  //   { intervals: { monthly: { configured: true }, annual: {...} } }
  //   { intervals: { monthly: true, annual: false } }
  //   { configured: { monthly: true, annual: false } }
  //   { monthlyConfigured: true, annualConfigured: false }
  //   { configured: true }   (both intervals)
  const read = (source: unknown, key: BillingInterval): boolean | null => {
    if (!isObject(source)) return null;
    // GET /plans sends { month, year }; older shapes used monthly/annual/yearly.
    const value = source[key] ?? source[key === 'annual' ? 'year' : 'month'] ?? (key === 'annual' ? source.yearly : undefined);
    if (isObject(value)) return flag(value.configured);
    return typeof value === 'boolean' ? value : null;
  };
  const both = (key: BillingInterval): boolean =>
    read(entry.intervals, key) ??
    read(entry.configured, key) ??
    (typeof entry[`${key}Configured`] === 'boolean'
      ? flag(entry[`${key}Configured`])
      : key === 'annual' && typeof entry.yearlyConfigured === 'boolean'
        ? flag(entry.yearlyConfigured)
        : flag(entry.configured));
  return { monthly: both('monthly'), annual: both('annual') };
}

/** Turns whatever GET /plans returned into the availability the UI needs. Never throws. */
export function normalizePlansResponse(raw: unknown): PlanAvailability {
  const body = isObject(raw) ? raw : {};
  const list = Array.isArray(raw) ? raw : Array.isArray(body.plans) ? body.plans : [];
  const plans = closedPlans();
  for (const entry of list) {
    if (!isObject(entry) || typeof entry.id !== 'string') continue;
    const id = entry.id as PlanId;
    // Legacy and unknown ids are ignored: they are never offered.
    if (!PRICING_PLANS.includes(id) || id === 'free') continue;
    plans[id] = intervalsOf(entry);
  }

  const addons: Record<string, boolean> = {};
  const addonBlocks: Record<string, AddonBlock> = {};
  const addonList = Array.isArray(body.addons) ? body.addons : Array.isArray(body.packs) ? body.packs : [];
  const known = new Set(ADDONS.map((addon) => addon.id));
  for (const entry of addonList) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !known.has(entry.id)) continue;
    // The server's purchase-availability decision is required: a price alone never puts a pack on sale.
    addons[entry.id] = (flag(entry.configured) || flag(entry.onSale)) && flag(entry.available);
    if (entry.available === false && typeof entry.unavailableReason === 'string' && BLOCK_REASONS.includes(entry.unavailableReason)) {
      const provider = typeof entry.unavailableProvider === 'string' && BLOCK_PROVIDERS.includes(entry.unavailableProvider)
        ? (entry.unavailableProvider as AddonBlockProvider)
        : null;
      addonBlocks[entry.id] = { reason: entry.unavailableReason as AddonBlockReason, provider };
    }
  }

  return {
    source: 'server',
    catalogVersion: typeof body.catalogVersion === 'string' ? body.catalogVersion : null,
    plans,
    addons,
    addonBlocks,
  };
}

/** Translation key (under plan_catalog) for why the server will not sell an add-on now. */
export function addonBlockKey(block: AddonBlock): string {
  if (block.reason === 'provider_missing' && block.provider) return `unavailable.provider_${block.provider}`;
  if (block.reason === 'provider_missing') return 'unavailable.provider';
  return `unavailable.${block.reason}`;
}

/** Why an add-on cannot be bought now, when the server said so. */
export function addonBlock(availability: PlanAvailability, addonId: string): AddonBlock | null {
  return availability.addonBlocks?.[addonId] ?? null;
}

export function planOnSale(availability: PlanAvailability, planId: PlanId, interval: BillingInterval): boolean {
  if (planId === 'free') return true;
  return availability.plans[planId]?.[interval] === true;
}

export function addonOnSale(availability: PlanAvailability, addonId: string): boolean {
  return availability.addons[addonId] === true;
}

export function anyAddonOnSale(availability: PlanAvailability): boolean {
  return Object.values(availability.addons).some(Boolean);
}

/**
 * Plans from public GET /plans; add-ons (signed-in only) from the career
 * billing status. Each half fails closed on its own.
 */
export async function fetchPlanAvailability(includeAddons = false): Promise<PlanAvailability> {
  const [plans, status] = await Promise.allSettled([
    api.get<unknown>(PLANS_ENDPOINT),
    includeAddons ? api.get<unknown>(ADDON_STATUS_ENDPOINT) : Promise.resolve(null),
  ]);
  const base = plans.status === 'fulfilled' ? normalizePlansResponse(plans.value) : { ...NOTHING_ON_SALE, plans: closedPlans() };
  const fromStatus = status.status === 'fulfilled' && status.value ? normalizePlansResponse({ addons: (status.value as Json).addons }) : null;
  return {
    ...base,
    addons: { ...base.addons, ...(fromStatus?.addons ?? {}) },
    addonBlocks: { ...base.addonBlocks, ...(fromStatus?.addonBlocks ?? {}) },
  };
}

/**
 * Public and signed-in. Resolves to NOTHING_ON_SALE while loading or on any
 * failure. `includeAddons` only for signed-in callers (the status needs a token).
 */
export function usePlanAvailability({ includeAddons = false }: { includeAddons?: boolean } = {}): {
  availability: PlanAvailability;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: [...PLAN_AVAILABILITY_QUERY_KEY, includeAddons],
    queryFn: () => fetchPlanAvailability(includeAddons),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { availability: query.data ?? NOTHING_ON_SALE, loading: query.isLoading };
}
