import { Platform } from 'react-native';
import { BillingInterval, SubscriptionPlan } from '../types/enums';

/**
 * Store product ids for Apple IAP and Google Play Billing.
 *
 * Must match API env `APPLE_*_PRODUCT_ID` / `GOOGLE_*_PRODUCT_ID`.
 * The client never names a plan on verify.
 *
 * Google has no Enterprise yearly SKU (Play price cap). Do not list or
 * request one — `skuForPlan` / `allStoreSkus` omit it on Android.
 */
export const IAP_PRODUCT_IDS = {
  apple: {
    proMonthly: 'com.flacroncv.mobile.pro.monthly',
    proYearly: 'com.flacroncv.mobile.pro.yearly',
    enterpriseMonthly: 'com.flacroncv.mobile.enterprise.monthly',
    enterpriseYearly: 'com.flacroncv.mobile.enterprise.yearly',
  },
  google: {
    proMonthly: 'com.flacroncv.mobile.pro.monthly',
    proYearly: 'com.flacroncv.mobile.pro.yearly',
    enterpriseMonthly: 'com.flacroncv.mobile.enterprise.monthly',
  },
} as const;

export const IAP_ANDROID_PACKAGE = 'com.flacroncv.mobile';

export function storeProductIds():
  | (typeof IAP_PRODUCT_IDS)['apple']
  | (typeof IAP_PRODUCT_IDS)['google'] {
  return Platform.OS === 'ios' ? IAP_PRODUCT_IDS.apple : IAP_PRODUCT_IDS.google;
}

/** SKUs to fetch from the store for this platform (no unsellable ids). */
export function allStoreSkus(): string[] {
  const ids = storeProductIds();
  if (Platform.OS === 'ios') {
    const apple = ids as (typeof IAP_PRODUCT_IDS)['apple'];
    return [
      apple.proMonthly,
      apple.proYearly,
      apple.enterpriseMonthly,
      apple.enterpriseYearly,
    ];
  }
  const google = ids as (typeof IAP_PRODUCT_IDS)['google'];
  return [google.proMonthly, google.proYearly, google.enterpriseMonthly];
}

export function skuForPlan(
  plan: SubscriptionPlan,
  interval: BillingInterval,
): string | null {
  if (plan === SubscriptionPlan.FREE) return null;
  const ids = storeProductIds();
  if (plan === SubscriptionPlan.PRO) {
    return interval === BillingInterval.YEAR ? ids.proYearly : ids.proMonthly;
  }
  // Enterprise yearly exists on Apple only — Google Play price cap.
  if (interval === BillingInterval.YEAR) {
    if (Platform.OS !== 'ios') return null;
    return (ids as (typeof IAP_PRODUCT_IDS)['apple']).enterpriseYearly;
  }
  return ids.enterpriseMonthly;
}
