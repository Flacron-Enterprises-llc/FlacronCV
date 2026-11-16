import { PLAN_ORDER } from '@flacroncv/career-shared';
import type { BillingInterval, PlanId, PurchaseChannel } from '@flacroncv/career-shared';
import type { ProviderReadiness } from '../../integration/provider-readiness';
import { CatalogSnapshot, isV2Plan } from '../catalog';
import { staticAddonAvailability } from '../purchase-availability';

export type LegacyPlan = 'pro' | 'enterprise' | 'career_accelerator';

/** What we sell, independent of the provider's ids. */
export type Sku =
  | { kind: 'plan'; planId: PlanId; interval: BillingInterval }
  | { kind: 'legacy'; legacyPlan: LegacyPlan; interval: BillingInterval }
  | { kind: 'pack'; addonId: string };

const LEGACY_PLANS: readonly LegacyPlan[] = ['pro', 'enterprise', 'career_accelerator'];
const INTERVALS: readonly BillingInterval[] = ['monthly', 'annual'];

export function skuKey(sku: Sku): string {
  switch (sku.kind) {
    case 'plan':
      return `plan:${sku.planId}:${sku.interval}`;
    case 'legacy':
      return `legacy:${sku.legacyPlan}:${sku.interval}`;
    case 'pack':
      return `pack:${sku.addonId}`;
  }
}

/**
 * One provider's ids for our SKUs: Stripe price ids, App Store product
 * ids, or Google Play `productId:basePlanId` (subscriptions) and
 * `productId` (one-time). Read from `STRIPE_PRICES`, `APPLE_PRODUCTS`, and
 * `GOOGLE_PRODUCTS` as a JSON object keyed by `skuKey`.
 *
 * Loading refuses a SKU the catalog does not sell on that provider, so a
 * Business price can never be mapped to a store product. A provider id
 * that is not in the map is not ours and is rejected by the webhooks.
 */
export class ProviderSkus {
  private constructor(
    readonly provider: PurchaseChannel,
    private readonly refsByKey: ReadonlyMap<string, string>,
    private readonly skusByRef: ReadonlyMap<string, Sku>,
  ) {}

  static empty(provider: PurchaseChannel): ProviderSkus {
    return new ProviderSkus(provider, new Map(), new Map());
  }

  /**
   * Throws an error that names the variable and the key, never a value.
   *
   * `legacy:*` keys (V1 Pro, Enterprise, Career Accelerator prices) are
   * refused: V2 billing is independent and never recognises a V1
   * subscription. Only the tests of the dormant legacy-row code pass
   * `allowV1Prices`.
   *
   * With `readiness`, a store (Apple/Google) pack product whose feature is not
   * built or whose provider is not ready is refused too: the store sells the
   * product without asking this server, so the map is where it is stopped.
   * (Stripe packs are checked per checkout, operator switch included.)
   */
  static parse(
    provider: PurchaseChannel,
    variable: string,
    json: string | undefined,
    snapshot: CatalogSnapshot,
    options: { allowV1Prices?: boolean; readiness?: ProviderReadiness } = {},
  ) {
    const raw = json?.trim() ?? '';
    if (raw.length === 0) return ProviderSkus.empty(provider);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${variable} must be a JSON object`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${variable} must be a JSON object`);
    }
    const refsByKey = new Map<string, string>();
    const skusByRef = new Map<string, Sku>();
    for (const [key, ref] of Object.entries(parsed)) {
      if (typeof ref !== 'string' || ref.trim().length === 0) {
        throw new Error(`${variable}: ${key} must be a non-empty string`);
      }
      const sku = parseSkuKey(key);
      if (!sku) throw new Error(`${variable}: ${key} is not a known SKU key`);
      if (sku.kind === 'legacy' && !options.allowV1Prices) {
        throw new Error(`${variable}: ${key} is a FlacronCV V1 price; V2 billing does not recognise V1 subscriptions`);
      }
      const problem = unsellable(sku, provider, snapshot) ?? unavailableInStore(sku, provider, options.readiness);
      if (problem) throw new Error(`${variable}: ${key} ${problem}`);
      if (skusByRef.has(ref)) throw new Error(`${variable}: ${key} reuses an id already mapped to another SKU`);
      refsByKey.set(skuKey(sku), ref);
      skusByRef.set(ref, sku);
    }
    return new ProviderSkus(provider, refsByKey, skusByRef);
  }

  refFor(sku: Sku): string | null {
    return this.refsByKey.get(skuKey(sku)) ?? null;
  }

  skuFor(ref: string): Sku | null {
    return this.skusByRef.get(ref) ?? null;
  }
}

export function parseSkuKey(key: string): Sku | null {
  const parts = key.split(':');
  if (parts[0] === 'plan' && parts.length === 3) {
    const planId = PLAN_ORDER.find((p) => p === parts[1]);
    const interval = INTERVALS.find((i) => i === parts[2]);
    return planId && interval ? { kind: 'plan', planId, interval } : null;
  }
  if (parts[0] === 'legacy' && parts.length === 3) {
    const legacyPlan = LEGACY_PLANS.find((p) => p === parts[1]);
    const interval = INTERVALS.find((i) => i === parts[2]);
    return legacyPlan && interval ? { kind: 'legacy', legacyPlan, interval } : null;
  }
  if (parts[0] === 'pack' && parts.length === 2 && parts[1].length > 0) {
    return { kind: 'pack', addonId: parts[1] };
  }
  return null;
}

function unavailableInStore(sku: Sku, provider: PurchaseChannel, readiness: ProviderReadiness | undefined): string | null {
  if (!readiness || provider === 'stripe' || sku.kind !== 'pack') return null;
  const availability = staticAddonAvailability(sku.addonId, readiness);
  if (availability.available) return null;
  return `is not available for sale (${availability.reason}${availability.provider ? `:${availability.provider}` : ''})`;
}

function unsellable(sku: Sku, provider: PurchaseChannel, snapshot: CatalogSnapshot): string | null {
  if (sku.kind === 'plan') {
    if (!isV2Plan(snapshot, sku.planId) || sku.planId === 'free') return 'is not a paid plan';
    if (!snapshot.purchaseChannels[sku.planId][sku.interval].includes(provider)) {
      return `is not sold on ${provider}`;
    }
    return null;
  }
  if (sku.kind === 'pack') {
    const addon = snapshot.addons.find((a) => a.id === sku.addonId);
    if (!addon || addon.kind !== 'usage_pack' || addon.billing !== 'one_time' || addon.status !== 'active') {
      return 'is not a one-time usage pack for sale';
    }
    return null;
  }
  return null;
}
