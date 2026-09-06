import { Platform } from 'react-native';
import { BillingInterval, SubscriptionPlan } from '../types/enums';

/**
 * Store product ids for Apple IAP and Google Play Billing.
 *
 * These are placeholders until App Store Connect / Play Console products exist.
 * Swap values here only — screens and hooks read through this file.
 * Must match API env `APPLE_*_PRODUCT_ID` / `GOOGLE_*_PRODUCT_ID` when those
 * are filled. The client never names a plan on verify.
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
    enterpriseYearly: 'com.flacroncv.mobile.enterprise.yearly',
  },
} as const;

export const IAP_ANDROID_PACKAGE = 'com.flacroncv.mobile';

export type IapProductIdSet = (typeof IAP_PRODUCT_IDS)['apple'];

export function storeProductIds(): IapProductIdSet {
  return Platform.OS === 'ios' ? IAP_PRODUCT_IDS.apple : IAP_PRODUCT_IDS.google;
}

export function allStoreSkus(): string[] {
  const ids = storeProductIds();
  return [ids.proMonthly, ids.proYearly, ids.enterpriseMonthly, ids.enterpriseYearly];
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
  return interval === BillingInterval.YEAR ? ids.enterpriseYearly : ids.enterpriseMonthly;
}
