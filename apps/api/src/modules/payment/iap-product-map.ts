import { SubscriptionPlan } from '@flacroncv/shared-types';

/**
 * Store product ids (App Store / Google Play) that grant a plan.
 *
 * LEGACY fields (pro*, enterprise*) come from `configuration.ts` (`iap.<store>.products`,
 * env APPLE_PRO_MONTHLY_PRODUCT_ID …) and keep mapping to the legacy plans exactly as
 * before, so existing store subscribers keep renewing into the plan they bought.
 *
 * Five-plan catalog fields (starter*, professional*, careerPro*) come only from env
 * (see {@link CURRENT_IAP_PRODUCT_ENV}). Business is never sold in the app (Contact
 * Sales), so there is no Business product. An unset variable means "not sold in the
 * app": verify answers "Unknown store product" and webhooks ack without a write.
 */
export type IapProductMap = {
  proMonthly?: string;
  proYearly?: string;
  enterpriseMonthly?: string;
  enterpriseYearly?: string;
  starterMonthly?: string;
  starterAnnual?: string;
  professionalMonthly?: string;
  professionalAnnual?: string;
  careerProMonthly?: string;
  careerProAnnual?: string;
};

export type IapStore = 'apple' | 'google';

/** Five-plan catalog keys of {@link IapProductMap}, in catalog order. */
type CurrentProductKey =
  | 'starterMonthly'
  | 'starterAnnual'
  | 'professionalMonthly'
  | 'professionalAnnual'
  | 'careerProMonthly'
  | 'careerProAnnual';

const CURRENT_PRODUCT_PLAN: Record<CurrentProductKey, SubscriptionPlan> = {
  starterMonthly: SubscriptionPlan.STARTER,
  starterAnnual: SubscriptionPlan.STARTER,
  professionalMonthly: SubscriptionPlan.PROFESSIONAL,
  professionalAnnual: SubscriptionPlan.PROFESSIONAL,
  careerProMonthly: SubscriptionPlan.CAREER_PRO,
  careerProAnnual: SubscriptionPlan.CAREER_PRO,
};

/**
 * Env variable per store and product, e.g. APPLE_STARTER_MONTHLY_PRODUCT_ID,
 * GOOGLE_CAREER_PRO_ANNUAL_PRODUCT_ID. The app reads the same ids from its own
 * EXPO_PUBLIC_IAP_<PLAN>_<MONTHLY|ANNUAL>_<IOS|ANDROID> build variables.
 */
export const CURRENT_IAP_PRODUCT_ENV: Record<IapStore, Record<CurrentProductKey, string>> = {
  apple: {
    starterMonthly: 'APPLE_STARTER_MONTHLY_PRODUCT_ID',
    starterAnnual: 'APPLE_STARTER_ANNUAL_PRODUCT_ID',
    professionalMonthly: 'APPLE_PROFESSIONAL_MONTHLY_PRODUCT_ID',
    professionalAnnual: 'APPLE_PROFESSIONAL_ANNUAL_PRODUCT_ID',
    careerProMonthly: 'APPLE_CAREER_PRO_MONTHLY_PRODUCT_ID',
    careerProAnnual: 'APPLE_CAREER_PRO_ANNUAL_PRODUCT_ID',
  },
  google: {
    starterMonthly: 'GOOGLE_STARTER_MONTHLY_PRODUCT_ID',
    starterAnnual: 'GOOGLE_STARTER_ANNUAL_PRODUCT_ID',
    professionalMonthly: 'GOOGLE_PROFESSIONAL_MONTHLY_PRODUCT_ID',
    professionalAnnual: 'GOOGLE_PROFESSIONAL_ANNUAL_PRODUCT_ID',
    careerProMonthly: 'GOOGLE_CAREER_PRO_MONTHLY_PRODUCT_ID',
    careerProAnnual: 'GOOGLE_CAREER_PRO_ANNUAL_PRODUCT_ID',
  },
};

/**
 * Read the five-plan product ids for one store. `read` is an env lookup
 * (`ConfigService.get` in the service, `process.env` by default). Blank → unset.
 */
export function currentIapProductsFromEnv(
  store: IapStore,
  read: (name: string) => string | undefined = (name) => process.env[name],
): IapProductMap {
  const out: IapProductMap = {};
  for (const [key, envName] of Object.entries(CURRENT_IAP_PRODUCT_ENV[store]) as Array<[CurrentProductKey, string]>) {
    const raw = read(envName);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Client cannot name a plan. Only env-configured store product ids grant.
 * Legacy Pro / Enterprise products keep mapping to the legacy plans; the
 * five-plan products map to Starter, Professional and Career Pro. An id
 * configured for two different plans (a configuration mistake) grants nothing
 * rather than guessing.
 */
export function mapIapProductId(
  products: IapProductMap | undefined,
  productId: string,
): SubscriptionPlan | null {
  if (!products || !productId) return null;
  const pairs: Array<[SubscriptionPlan, string | undefined]> = [
    [SubscriptionPlan.PRO, products.proMonthly],
    [SubscriptionPlan.PRO, products.proYearly],
    [SubscriptionPlan.ENTERPRISE, products.enterpriseMonthly],
    [SubscriptionPlan.ENTERPRISE, products.enterpriseYearly],
    ...(Object.keys(CURRENT_PRODUCT_PLAN) as CurrentProductKey[]).map(
      (key): [SubscriptionPlan, string | undefined] => [CURRENT_PRODUCT_PLAN[key], products[key]],
    ),
  ];
  const plans = new Set(pairs.filter(([, id]) => !!id && id === productId).map(([plan]) => plan));
  if (plans.size !== 1) return null;
  return [...plans][0];
}
