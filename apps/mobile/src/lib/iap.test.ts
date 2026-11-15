import { describe, expect, it } from 'vitest';
import {
  BUILD_IAP_ENV,
  allSkus,
  anyStoreProduct,
  iapEnvName,
  planForSku,
  readStoreProduct,
  skuFor,
  storeProductMap,
} from './iap';

const ENV = {
  EXPO_PUBLIC_IAP_STARTER_MONTHLY_IOS: ' ios.starter.m ',
  EXPO_PUBLIC_IAP_PROFESSIONAL_ANNUAL_IOS: 'ios.pro.y',
  EXPO_PUBLIC_IAP_CAREER_PRO_MONTHLY_IOS: '',
  EXPO_PUBLIC_IAP_STARTER_MONTHLY_ANDROID: 'gp.starter.m',
};

describe('store product ids (build variables)', () => {
  it('names one variable per plan, interval and platform, and lists each literally for Expo', () => {
    expect(iapEnvName('career_pro', 'annual', 'android')).toBe('EXPO_PUBLIC_IAP_CAREER_PRO_ANNUAL_ANDROID');
    expect(iapEnvName('starter', 'monthly', 'ios')).toBe('EXPO_PUBLIC_IAP_STARTER_MONTHLY_IOS');
    expect(Object.keys(BUILD_IAP_ENV)).toHaveLength(12);
    for (const plan of ['starter', 'professional', 'career_pro'] as const) {
      for (const interval of ['monthly', 'annual'] as const) {
        for (const platform of ['ios', 'android'] as const) {
          expect(Object.keys(BUILD_IAP_ENV)).toContain(iapEnvName(plan, interval, platform));
        }
      }
    }
  });

  it('reads only this platform, trimmed, with blanks left out', () => {
    const ios = storeProductMap('ios', ENV);
    expect(ios).toEqual({ starter: { monthly: 'ios.starter.m' }, professional: { annual: 'ios.pro.y' } });
    expect(storeProductMap('android', ENV)).toEqual({ starter: { monthly: 'gp.starter.m' } });
    expect(storeProductMap('ios', {})).toEqual({});
    expect(anyStoreProduct(storeProductMap('ios', {}))).toBe(false);
    expect(anyStoreProduct(ios)).toBe(true);
  });

  it('never sells Free or Business in the app, and an unset product is not for sale', () => {
    const ios = storeProductMap('ios', ENV);
    expect(skuFor(ios, 'starter', 'monthly')).toBe('ios.starter.m');
    expect(skuFor(ios, 'starter', 'annual')).toBeNull();
    expect(skuFor(ios, 'business', 'monthly')).toBeNull();
    expect(skuFor(ios, 'free', 'monthly')).toBeNull();
    expect(allSkus(ios)).toEqual(['ios.starter.m', 'ios.pro.y']);
    expect(planForSku(ios, 'ios.pro.y')).toEqual({ plan: 'professional', interval: 'annual' });
    expect(planForSku(ios, 'com.flacroncv.mobile.pro.monthly')).toBeNull();
  });
});

describe('store product view', () => {
  it('reads an iOS product with an introductory free trial', () => {
    expect(
      readStoreProduct({
        id: 'ios.pro.y',
        displayPrice: '$389.99',
        subscriptionOffers: [{ id: 'intro', type: 'introductory', paymentMode: 'free-trial', price: 0 }],
      }),
    ).toEqual({ id: 'ios.pro.y', displayPrice: '$389.99', hasFreeTrial: true, offerToken: null });
  });

  it('reads an Android base plan offer token and a free pricing phase', () => {
    const view = readStoreProduct({
      id: 'gp.starter.m',
      displayPrice: '21,99 €',
      subscriptionOffers: [
        {
          id: 'base',
          offerTokenAndroid: 'tok-1',
          price: 21.99,
          type: 'introductory',
          pricingPhasesAndroid: { pricingPhaseList: [{ priceAmountMicros: '0' }, { priceAmountMicros: '21990000' }] },
        },
      ],
    });
    expect(view).toEqual({ id: 'gp.starter.m', displayPrice: '21,99 €', hasFreeTrial: true, offerToken: 'tok-1' });
  });

  it('a product without an offer has no trial; junk is ignored', () => {
    expect(readStoreProduct({ id: 'x', displayPrice: '', subscriptionOffers: [{ offerTokenAndroid: 't', price: 5, type: 'introductory' }] })).toEqual({
      id: 'x',
      displayPrice: null,
      hasFreeTrial: false,
      offerToken: 't',
    });
    expect(readStoreProduct(null)).toBeNull();
    expect(readStoreProduct({ displayPrice: '$1' })).toBeNull();
  });
});
