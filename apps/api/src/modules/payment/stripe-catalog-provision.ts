/**
 * Five-plan Stripe catalog provisioning (TEST MODE), app_id=flacron-cv.
 *
 * The desired catalog is built from the code's own sources, never typed here:
 * plan prices from `PLAN_CONFIGS` (packages/shared-types, kept equal to the
 * career catalog) and packs/add-ons from `CAREER_ADDONS` (kept equal to
 * packages/career-shared by career-addons.spec.ts). Env names come from
 * `CURRENT_PLAN_PRICE_ENV` and `addonPriceEnvName`, the exact names the API reads.
 *
 * Safety rules:
 * - Only objects tagged `app_id=flacron-cv` with the matching identifier are
 *   ever reused, and only when their whole configuration matches. Nothing is
 *   adopted, retagged, archived or updated: this module only CREATES.
 * - Untagged and other-app objects are never touched. If one of them holds a
 *   lookup key we need, that is a conflict and nothing is written.
 * - Any conflict stops the whole run before the first write.
 * - Writes carry deterministic idempotency keys, and a re-run finds what an
 *   interrupted run created, so interruptions never duplicate objects.
 * - Live mode is refused outright; the account id must match the expected one.
 *
 * Legacy plans (Pro, Career Accelerator, Enterprise) are out of scope and
 * untouched (scripts/stripe-sync-catalog.mjs still owns them). Free has no
 * Stripe price. messaging_topup, white_label, api_package and
 * career_maintenance are not in CAREER_ADDONS and are never provisioned.
 */
import { createHash } from 'crypto';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';
import { CAREER_ADDONS, addonPriceEnvName } from './career-addons';
import type { CareerAddon } from './career-addons';
import { CURRENT_PLAN_PRICE_ENV } from './plan-prices';

export const CATALOG_APP_ID = 'flacron-cv';

/** Items the spec lists but the product does not sell through automated checkout. */
export const NOT_PROVISIONED = ['messaging_topup', 'white_label', 'api_package', 'career_maintenance'] as const;

export interface StripeProductLike {
  id: string;
  name: string;
  active: boolean;
  livemode: boolean;
  metadata: Record<string, string> | null;
}

export interface StripePriceLike {
  id: string;
  product: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  unit_amount: number | null;
  type: 'one_time' | 'recurring';
  recurring: { interval: string; interval_count: number } | null;
  lookup_key: string | null;
  metadata: Record<string, string> | null;
}

/** What the runner needs from Stripe. GETs only, plus creating products/prices. */
export interface CatalogTransport {
  /** 'test' or 'live', from the key or the CLI flag the transport was built with. */
  readonly mode: 'test' | 'live';
  accountId(): Promise<string>;
  listProducts(): Promise<StripeProductLike[]>;
  listPrices(): Promise<StripePriceLike[]>;
  createProduct(params: DesiredProduct['create'], idempotencyKey: string): Promise<StripeProductLike>;
  createPrice(params: DesiredPrice['create'] & { product: string }, idempotencyKey: string): Promise<StripePriceLike>;
}

export interface DesiredPrice {
  lookupKey: string;
  envName: string;
  amountCents: number;
  currency: 'usd';
  /** null = one-time. */
  interval: 'month' | 'year' | null;
  metadata: Record<string, string>;
  create: {
    currency: 'usd';
    unit_amount: number;
    recurring?: { interval: 'month' | 'year'; interval_count: 1 };
    lookup_key: string;
    nickname: string;
    metadata: Record<string, string>;
  };
}

export interface DesiredProduct {
  /** `plan:starter` or `pack:document_s`. */
  key: string;
  /** Metadata identifier on the product: fcv_plan or fcv_pack. */
  idField: 'fcv_plan' | 'fcv_pack';
  idValue: string;
  name: string;
  metadata: Record<string, string>;
  create: { name: string; metadata: Record<string, string> };
  prices: DesiredPrice[];
}

const PAID_PLANS: { plan: SubscriptionPlan; label: string }[] = [
  { plan: SubscriptionPlan.STARTER, label: 'Starter' },
  { plan: SubscriptionPlan.PROFESSIONAL, label: 'Professional' },
  { plan: SubscriptionPlan.CAREER_PRO, label: 'Career Pro' },
  { plan: SubscriptionPlan.BUSINESS, label: 'Business' },
];

const GB = 1_000_000_000;

/** Plain-ASCII product names (they show on Stripe receipts and Checkout). */
export function addonLabel(addon: Pick<CareerAddon, 'unit' | 'units' | 'kind'>): string {
  const n = addon.units;
  if (addon.unit === 'storage_byte' && addon.kind === 'organization') return `Business ${n / GB} GB storage`;
  switch (addon.unit) {
    case 'document_credit': return `${n} AI document credits`;
    case 'resume_analysis': return `${n} resume analyses`;
    case 'action_pack': return `${n} action packs`;
    case 'alert_item': return `${n} job alerts`;
    case 'text_interview': return `${n} text interview sessions`;
    case 'voice_minute': return `${n} voice practice minutes`;
    case 'skill_report': return `${n} skill gap reports`;
    case 'scenario_report': return `${n} scenario reports`;
    case 'coaching_response': return `${n} career coach responses`;
    case 'assisted_form': return `${n} assisted forms`;
    case 'map_session': return `${n} map sessions`;
    case 'location_profile': return n === 1 ? 'Extra location profile' : `${n} extra location profiles`;
    case 'saved_search': return `${n} extra saved searches`;
    case 'portfolio_page': return n === 1 ? 'Extra portfolio page' : `${n} extra portfolio pages`;
    case 'storage_byte': return `Extra ${n / GB} GB storage`;
    case 'staff_seat': return n === 1 ? 'Business staff seat' : `${n} Business staff seats`;
    case 'active_candidate': return `${n} Business active candidates`;
    default: throw new Error(`No product label for unit ${addon.unit}`);
  }
}

function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** The full desired test catalog, derived from the code's catalog sources. */
export function desiredCatalog(): DesiredProduct[] {
  const out: DesiredProduct[] = [];
  for (const { plan, label } of PAID_PLANS) {
    const config = PLAN_CONFIGS[plan];
    const monthly = cents(config.priceMonthly);
    const annual = cents(config.priceYearly);
    if (!(monthly > 0) || annual !== monthly * 10) {
      throw new Error(`Catalog check failed for ${plan}: monthly ${monthly}, annual ${annual} (annual must be 10 x monthly)`);
    }
    const env = CURRENT_PLAN_PRICE_ENV[plan as keyof typeof CURRENT_PLAN_PRICE_ENV];
    const productMeta = { app_id: CATALOG_APP_ID, fcv_plan: plan };
    const name = `FlacronCV - ${label}`;
    const price = (interval: 'month' | 'year', key: 'monthly' | 'annual', amount: number, envName: string): DesiredPrice => {
      const metadata = { app_id: CATALOG_APP_ID, fcv_plan: plan, fcv_interval: key };
      const lookupKey = `fcv_${plan}_${key}`;
      return {
        lookupKey,
        envName,
        amountCents: amount,
        currency: 'usd',
        interval,
        metadata,
        create: {
          currency: 'usd',
          unit_amount: amount,
          recurring: { interval, interval_count: 1 },
          lookup_key: lookupKey,
          nickname: `${name} (${key})`,
          metadata,
        },
      };
    };
    out.push({
      key: `plan:${plan}`,
      idField: 'fcv_plan',
      idValue: plan,
      name,
      metadata: productMeta,
      create: { name, metadata: productMeta },
      prices: [price('month', 'monthly', monthly, env.month), price('year', 'annual', annual, env.year)],
    });
  }
  for (const addon of CAREER_ADDONS) {
    if ((NOT_PROVISIONED as readonly string[]).includes(addon.id)) continue;
    const name = `FlacronCV - ${addonLabel(addon)}`;
    const productMeta = { app_id: CATALOG_APP_ID, fcv_pack: addon.id };
    const interval = addon.billing === 'monthly' ? ('month' as const) : null;
    const lookupKey = `fcv_pack_${addon.id}`;
    out.push({
      key: `pack:${addon.id}`,
      idField: 'fcv_pack',
      idValue: addon.id,
      name,
      metadata: productMeta,
      create: { name, metadata: productMeta },
      prices: [
        {
          lookupKey,
          envName: addonPriceEnvName(addon),
          amountCents: addon.priceCents,
          currency: 'usd',
          interval,
          metadata: productMeta,
          create: {
            currency: 'usd',
            unit_amount: addon.priceCents,
            ...(interval ? { recurring: { interval, interval_count: 1 as const } } : {}),
            lookup_key: lookupKey,
            nickname: interval ? `${name} (monthly)` : name,
            metadata: productMeta,
          },
        },
      ],
    });
  }
  return out;
}

export type PlannedAction =
  | { kind: 'reuse_product'; key: string; productId: string; name: string }
  | { kind: 'create_product'; key: string; name: string; metadata: Record<string, string>; idempotencyKey: string }
  | { kind: 'reuse_price'; key: string; lookupKey: string; priceId: string; envName: string }
  | {
      kind: 'create_price';
      key: string;
      lookupKey: string;
      envName: string;
      amountCents: number;
      currency: string;
      interval: 'month' | 'year' | null;
      idempotencyKey: string;
    };

export interface CatalogPlan {
  accountId: string;
  actions: PlannedAction[];
  conflicts: string[];
  /** Objects seen and deliberately left alone (counts only; never details of other apps). */
  ignored: { untaggedProducts: number; untaggedPrices: number; otherAppProducts: number; otherAppPrices: number };
}

function stableKey(kind: string, params: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 32);
  return `flacroncv-catalog-${kind}-${digest}`;
}

const tag = (o: { metadata: Record<string, string> | null }) => o.metadata?.app_id ?? null;
const isOurs = (o: { metadata: Record<string, string> | null }) => tag(o) === CATALOG_APP_ID;

function metadataMatches(actual: Record<string, string> | null, wanted: Record<string, string>): boolean {
  return Object.entries(wanted).every(([k, v]) => actual?.[k] === v);
}

function priceMatches(p: StripePriceLike, want: DesiredPrice, productId: string): string | null {
  if (!isOurs(p)) return `price ${p.id} holds lookup key ${want.lookupKey} but is not tagged app_id=${CATALOG_APP_ID}`;
  if (p.product !== productId) return `price ${p.id} (${want.lookupKey}) belongs to product ${p.product}, expected ${productId}`;
  if (!p.active) return `price ${p.id} (${want.lookupKey}) is inactive`;
  if (p.currency !== want.currency) return `price ${p.id} (${want.lookupKey}) currency ${p.currency}, expected ${want.currency}`;
  if (p.unit_amount !== want.amountCents) return `price ${p.id} (${want.lookupKey}) amount ${p.unit_amount}, expected ${want.amountCents}`;
  if (want.interval === null) {
    if (p.type !== 'one_time' || p.recurring) return `price ${p.id} (${want.lookupKey}) is recurring, expected one-time`;
  } else if (p.type !== 'recurring' || p.recurring?.interval !== want.interval || p.recurring.interval_count !== 1) {
    return `price ${p.id} (${want.lookupKey}) interval ${p.recurring?.interval ?? 'one_time'}/${p.recurring?.interval_count ?? '-'}, expected ${want.interval}/1`;
  }
  if (!metadataMatches(p.metadata, want.metadata)) return `price ${p.id} (${want.lookupKey}) metadata does not match`;
  return null;
}

/** Read-only: compare Stripe with the desired catalog. Never writes. */
export async function planCatalog(
  transport: CatalogTransport,
  expectedAccountId: string,
  desired: DesiredProduct[] = desiredCatalog(),
): Promise<CatalogPlan> {
  if (transport.mode !== 'test') throw new Error('Refusing: this provisioning step runs in Stripe TEST mode only.');
  const accountId = await transport.accountId();
  if (!expectedAccountId || accountId !== expectedAccountId) {
    throw new Error(`Refusing: connected account ${accountId} is not the expected account ${expectedAccountId || '(none given)'}.`);
  }
  const products = await transport.listProducts();
  const prices = await transport.listPrices();
  if ([...products, ...prices].some((o) => o.livemode)) {
    throw new Error('Refusing: Stripe returned live-mode objects; this step runs in TEST mode only.');
  }

  const conflicts: string[] = [];
  const actions: PlannedAction[] = [];
  const wantedLookups = new Set(desired.flatMap((d) => d.prices.map((p) => p.lookupKey)));

  for (const d of desired) {
    const candidates = products.filter((p) => isOurs(p) && p.metadata?.[d.idField] === d.idValue);
    let productId: string | null = null;
    if (candidates.length > 1) {
      conflicts.push(`${d.key}: ${candidates.length} products tagged ${CATALOG_APP_ID} with ${d.idField}=${d.idValue} (${candidates.map((c) => c.id).join(', ')})`);
    } else if (candidates.length === 1) {
      const p = candidates[0]!;
      if (!p.active) conflicts.push(`${d.key}: product ${p.id} is archived`);
      else if (p.name !== d.name) conflicts.push(`${d.key}: product ${p.id} is named "${p.name}", expected "${d.name}"`);
      else if (!metadataMatches(p.metadata, d.metadata)) conflicts.push(`${d.key}: product ${p.id} metadata does not match`);
      else {
        productId = p.id;
        actions.push({ kind: 'reuse_product', key: d.key, productId: p.id, name: p.name });
      }
    } else {
      actions.push({ kind: 'create_product', key: d.key, name: d.name, metadata: d.metadata, idempotencyKey: stableKey('product', d.create) });
    }

    for (const want of d.prices) {
      const holders = prices.filter((p) => p.lookup_key === want.lookupKey);
      // A price of ours for this slot that lost or never had the lookup key is a stray duplicate.
      const strays = prices.filter(
        (p) => isOurs(p) && p.lookup_key !== want.lookupKey && metadataMatches(p.metadata, want.metadata) &&
          (productId === null || p.product === productId) && p.active,
      );
      if (strays.length > 0) {
        conflicts.push(`${want.lookupKey}: active price(s) ${strays.map((s) => s.id).join(', ')} tagged for this slot without the lookup key`);
      }
      if (holders.length > 1) {
        conflicts.push(`${want.lookupKey}: held by ${holders.length} prices`);
        continue;
      }
      if (holders.length === 1) {
        const holder = holders[0]!;
        if (productId === null) {
          conflicts.push(
            isOurs(holder)
              ? `${want.lookupKey}: price ${holder.id} exists but its product is not a reusable ${CATALOG_APP_ID} product for ${d.key}`
              : `${want.lookupKey}: lookup key is already used by a price that is not tagged app_id=${CATALOG_APP_ID} (${holder.id}); not adopting it`,
          );
          continue;
        }
        const problem = priceMatches(holder, want, productId);
        if (problem) conflicts.push(problem);
        else actions.push({ kind: 'reuse_price', key: d.key, lookupKey: want.lookupKey, priceId: holder.id, envName: want.envName });
        continue;
      }
      actions.push({
        kind: 'create_price',
        key: d.key,
        lookupKey: want.lookupKey,
        envName: want.envName,
        amountCents: want.amountCents,
        currency: want.currency,
        interval: want.interval,
        idempotencyKey: stableKey('price', { ...want.create, productKey: d.key }),
      });
    }
  }

  // Our tagged prices on lookup keys this catalog does not know (e.g. a typo'd earlier run).
  for (const p of prices) {
    if (isOurs(p) && p.lookup_key?.startsWith('fcv_pack_') && !wantedLookups.has(p.lookup_key)) {
      conflicts.push(`price ${p.id} has unknown catalog lookup key ${p.lookup_key}`);
    }
  }

  const untagged = (o: { metadata: Record<string, string> | null }) => !tag(o);
  const otherApp = (o: { metadata: Record<string, string> | null }) => !!tag(o) && !isOurs(o);
  return {
    accountId,
    actions,
    conflicts,
    ignored: {
      untaggedProducts: products.filter(untagged).length,
      untaggedPrices: prices.filter(untagged).length,
      otherAppProducts: products.filter(otherApp).length,
      otherAppPrices: prices.filter(otherApp).length,
    },
  };
}

export interface ApplyResult {
  created: { products: number; prices: number };
  /** envName → price id, in catalog order. */
  env: [string, string][];
}

/**
 * Applies a plan computed by planCatalog. Refuses when there are conflicts.
 * Re-checks account and mode first. Creates products before their prices.
 */
export async function applyCatalog(
  transport: CatalogTransport,
  expectedAccountId: string,
  desired: DesiredProduct[] = desiredCatalog(),
): Promise<ApplyResult> {
  const plan = await planCatalog(transport, expectedAccountId, desired);
  if (plan.conflicts.length > 0) {
    throw new Error(`Refusing to write: ${plan.conflicts.length} conflict(s).\n- ${plan.conflicts.join('\n- ')}`);
  }
  const created = { products: 0, prices: 0 };
  const productIds = new Map<string, string>();
  const env: [string, string][] = [];
  for (const a of plan.actions) if (a.kind === 'reuse_product') productIds.set(a.key, a.productId);

  for (const d of desired) {
    for (const a of plan.actions) {
      if (a.key !== d.key) continue;
      if (a.kind === 'create_product') {
        const product = await transport.createProduct(d.create, a.idempotencyKey);
        if (product.livemode) throw new Error('Refusing: Stripe created a live-mode object.');
        productIds.set(d.key, product.id);
        created.products += 1;
      }
    }
    for (const want of d.prices) {
      const a = plan.actions.find((x) => (x.kind === 'reuse_price' || x.kind === 'create_price') && x.lookupKey === want.lookupKey);
      if (!a) throw new Error(`Internal: no action for ${want.lookupKey}`);
      if (a.kind === 'reuse_price') {
        env.push([want.envName, a.priceId]);
        continue;
      }
      if (a.kind !== 'create_price') continue;
      const productId = productIds.get(d.key);
      if (!productId) throw new Error(`Internal: no product for ${d.key}`);
      const price = await transport.createPrice({ ...want.create, product: productId }, a.idempotencyKey);
      if (price.livemode) throw new Error('Refusing: Stripe created a live-mode object.');
      created.prices += 1;
      env.push([want.envName, price.id]);
    }
  }
  return { created, env };
}

/** Env lines in the API's naming (`STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>`, `STRIPE_PRICE_PACK_<ID>[_RECURRING]`). */
export function envLines(env: [string, string][]): string[] {
  return env.map(([name, id]) => `${name}=${id}`);
}
