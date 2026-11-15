import type { BillingInterval, PlanId } from '../../../../packages/career-shared/src/catalog';
import { soldInStore } from './plan-catalog';

/**
 * Store product ids for the five-plan catalog (in-app purchase of Starter,
 * Professional and Career Pro, monthly and annual; Business is Contact Sales
 * only). They come from build variables, never from code:
 *
 *   EXPO_PUBLIC_IAP_<STARTER|PROFESSIONAL|CAREER_PRO>_<MONTHLY|ANNUAL>_<IOS|ANDROID>
 *
 * and must equal the API's APPLE_* / GOOGLE_* `_PRODUCT_ID` variables, which
 * decide the plan a purchase grants (the app never names a plan to the server).
 * An unset id means that plan/interval is not sold in the app on that platform:
 * its card says "Coming soon" — no dead button and no link to the website.
 *
 * Legacy Pro / Enterprise store products (src/config/iap-products.ts) are not
 * sold any more; existing subscribers keep them, manage them in the store and
 * can restore them.
 */

export type StorePlatform = 'ios' | 'android';
export type StorePlanId = Extract<PlanId, 'starter' | 'professional' | 'career_pro'>;

export const STORE_PLANS: readonly StorePlanId[] = ['starter', 'professional', 'career_pro'];
export const STORE_INTERVALS: readonly BillingInterval[] = ['monthly', 'annual'];

/** Build variable name for one product. */
export function iapEnvName(plan: StorePlanId, interval: BillingInterval, platform: StorePlatform): string {
  return `EXPO_PUBLIC_IAP_${plan.toUpperCase()}_${interval === 'annual' ? 'ANNUAL' : 'MONTHLY'}_${platform === 'ios' ? 'IOS' : 'ANDROID'}`;
}

/**
 * The build's values. Expo inlines `process.env.EXPO_PUBLIC_*` only when the
 * name is written out literally, so every variable is listed by name here.
 */
export const BUILD_IAP_ENV: Readonly<Record<string, string | undefined>> = {
  EXPO_PUBLIC_IAP_STARTER_MONTHLY_IOS: process.env.EXPO_PUBLIC_IAP_STARTER_MONTHLY_IOS,
  EXPO_PUBLIC_IAP_STARTER_ANNUAL_IOS: process.env.EXPO_PUBLIC_IAP_STARTER_ANNUAL_IOS,
  EXPO_PUBLIC_IAP_PROFESSIONAL_MONTHLY_IOS: process.env.EXPO_PUBLIC_IAP_PROFESSIONAL_MONTHLY_IOS,
  EXPO_PUBLIC_IAP_PROFESSIONAL_ANNUAL_IOS: process.env.EXPO_PUBLIC_IAP_PROFESSIONAL_ANNUAL_IOS,
  EXPO_PUBLIC_IAP_CAREER_PRO_MONTHLY_IOS: process.env.EXPO_PUBLIC_IAP_CAREER_PRO_MONTHLY_IOS,
  EXPO_PUBLIC_IAP_CAREER_PRO_ANNUAL_IOS: process.env.EXPO_PUBLIC_IAP_CAREER_PRO_ANNUAL_IOS,
  EXPO_PUBLIC_IAP_STARTER_MONTHLY_ANDROID: process.env.EXPO_PUBLIC_IAP_STARTER_MONTHLY_ANDROID,
  EXPO_PUBLIC_IAP_STARTER_ANNUAL_ANDROID: process.env.EXPO_PUBLIC_IAP_STARTER_ANNUAL_ANDROID,
  EXPO_PUBLIC_IAP_PROFESSIONAL_MONTHLY_ANDROID: process.env.EXPO_PUBLIC_IAP_PROFESSIONAL_MONTHLY_ANDROID,
  EXPO_PUBLIC_IAP_PROFESSIONAL_ANNUAL_ANDROID: process.env.EXPO_PUBLIC_IAP_PROFESSIONAL_ANNUAL_ANDROID,
  EXPO_PUBLIC_IAP_CAREER_PRO_MONTHLY_ANDROID: process.env.EXPO_PUBLIC_IAP_CAREER_PRO_MONTHLY_ANDROID,
  EXPO_PUBLIC_IAP_CAREER_PRO_ANNUAL_ANDROID: process.env.EXPO_PUBLIC_IAP_CAREER_PRO_ANNUAL_ANDROID,
};

export type StoreProductMap = Partial<Record<StorePlanId, Partial<Record<BillingInterval, string>>>>;

/** Product ids configured for one platform (trimmed; blank and catalog-unsellable entries left out). */
export function storeProductMap(
  platform: StorePlatform,
  env: Readonly<Record<string, string | undefined>> = BUILD_IAP_ENV,
): StoreProductMap {
  const store = platform === 'ios' ? 'apple' : 'google';
  const out: StoreProductMap = {};
  for (const plan of STORE_PLANS) {
    for (const interval of STORE_INTERVALS) {
      const id = env[iapEnvName(plan, interval, platform)]?.trim();
      if (!id || !soldInStore(plan, interval, store)) continue;
      out[plan] = { ...out[plan], [interval]: id };
    }
  }
  return out;
}

export function isStorePlatform(os: string): os is StorePlatform {
  return os === 'ios' || os === 'android';
}

/** The product to buy for a plan/interval, or null when it is not sold in the app. */
export function skuFor(map: StoreProductMap, plan: PlanId, interval: BillingInterval): string | null {
  if (!(STORE_PLANS as readonly string[]).includes(plan)) return null;
  return map[plan as StorePlanId]?.[interval] ?? null;
}

/** Every configured product id (what to fetch from the store). */
export function allSkus(map: StoreProductMap): string[] {
  const out: string[] = [];
  for (const plan of STORE_PLANS) {
    for (const interval of STORE_INTERVALS) {
      const id = map[plan]?.[interval];
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Which plan a configured product id is (display only — the server decides what it grants). */
export function planForSku(map: StoreProductMap, sku: string): { plan: StorePlanId; interval: BillingInterval } | null {
  for (const plan of STORE_PLANS) {
    for (const interval of STORE_INTERVALS) {
      if (map[plan]?.[interval] === sku) return { plan, interval };
    }
  }
  return null;
}

/** True when at least one plan can be bought in the app on this platform. */
export function anyStoreProduct(map: StoreProductMap): boolean {
  return allSkus(map).length > 0;
}

/**
 * Minimal view of a store product the paywall reads (expo-iap
 * `ProductSubscription`): the store's localized price and whether the store
 * offers a free trial / introductory offer. Reading it here keeps the parsing
 * testable; unknown shapes read as "no trial".
 */
export interface StoreProductView {
  id: string;
  displayPrice: string | null;
  hasFreeTrial: boolean;
  /** Android only: the base-plan offer token required to buy. */
  offerToken: string | null;
}

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null;

function androidOffers(product: Loose): Loose[] {
  const offers = product.subscriptionOffers ?? product.subscriptionOfferDetailsAndroid;
  return Array.isArray(offers) ? offers.filter(isObject) : [];
}

function isFreePhase(phase: unknown): boolean {
  if (!isObject(phase)) return false;
  const micros = phase.priceAmountMicros;
  return micros === 0 || micros === '0';
}

function offerHasFreeTrial(offer: Loose): boolean {
  if (offer.paymentMode === 'free-trial' || offer.paymentMode === 'FREE_TRIAL' || offer.paymentMode === 'freeTrial') return true;
  if (offer.price === 0 || offer.priceAmount === 0) return offer.type === 'introductory' || offer.type === 'free-trial';
  const container = offer.pricingPhasesAndroid ?? offer.pricingPhases;
  const phases = isObject(container) && !Array.isArray(container) ? (container as Loose).pricingPhaseList : container;
  return Array.isArray(phases) && phases.some(isFreePhase);
}

export function readStoreProduct(raw: unknown): StoreProductView | null {
  if (!isObject(raw) || typeof raw.id !== 'string') return null;
  const offers = androidOffers(raw);
  const ios = isObject(raw.subscriptionInfoIOS) ? (raw.subscriptionInfoIOS as Loose) : null;
  const intro = ios && isObject(ios.introductoryOffer) ? (ios.introductoryOffer as Loose) : null;
  const iosTrial =
    !!intro && (intro.paymentMode === 'free-trial' || intro.paymentMode === 'FREE_TRIAL' || intro.paymentMode === 'freeTrial');
  const discounts = Array.isArray(raw.discountsIOS) ? raw.discountsIOS.filter(isObject) : [];
  const token = offers.map((offer) => offer.offerTokenAndroid ?? offer.offerToken).find((v): v is string => typeof v === 'string' && v.length > 0);
  return {
    id: raw.id,
    displayPrice: typeof raw.displayPrice === 'string' && raw.displayPrice ? raw.displayPrice : null,
    hasFreeTrial: iosTrial || offers.some(offerHasFreeTrial) || discounts.some(offerHasFreeTrial),
    offerToken: token ?? null,
  };
}
