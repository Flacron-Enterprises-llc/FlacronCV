/**
 * LEGACY store products (Pro / Enterprise). They are no longer sold: the app
 * sells the five-plan catalog with product ids from build variables
 * (src/lib/iap.ts). These ids stay so existing store subscribers keep
 * managing and restoring what they bought; the API keeps mapping them to the
 * legacy plans (APPLE_PRO_* / GOOGLE_PRO_* … `_PRODUCT_ID`).
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
