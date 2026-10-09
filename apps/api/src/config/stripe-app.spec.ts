import { checkStripeSecretKey, DEFAULT_APP_ID, isRestrictedStripeKey, resolveAppId, stripeKeyMode } from './stripe-app';

describe('stripe app identity', () => {
  it('uses flacron-cv unless APP_ID says otherwise', () => {
    expect(DEFAULT_APP_ID).toBe('flacron-cv');
    expect(resolveAppId({})).toBe('flacron-cv');
    expect(resolveAppId({ APP_ID: '  flacron-cv ' })).toBe('flacron-cv');
    expect(resolveAppId({ APP_ID: 'product-x' })).toBe('product-x');
  });

  it('rejects an APP_ID that is not a lowercase dashed id', () => {
    expect(() => resolveAppId({ APP_ID: 'FlacronCV' })).toThrow(/not a valid application id/);
    expect(() => resolveAppId({ APP_ID: 'flacron_cv' })).toThrow();
    expect(() => resolveAppId({ APP_ID: 'flacron cv' })).toThrow();
  });

  it('reads the mode from secret and restricted key prefixes only', () => {
    expect(stripeKeyMode('rk_live_abc')).toBe('live');
    expect(stripeKeyMode('sk_live_abc')).toBe('live');
    expect(stripeKeyMode('rk_test_abc')).toBe('test');
    expect(stripeKeyMode('sk_test_abc')).toBe('test');
    expect(stripeKeyMode('pk_live_abc')).toBeNull();
    expect(stripeKeyMode('whsec_abc')).toBeNull();
    expect(stripeKeyMode(undefined)).toBeNull();
  });

  it('accepts a restricted key silently and warns on an unrestricted one', () => {
    expect(isRestrictedStripeKey('rk_live_abc')).toBe(true);
    expect(checkStripeSecretKey('rk_live_abc').warning).toBeNull();
    expect(checkStripeSecretKey('rk_test_abc').warning).toBeNull();
    expect(checkStripeSecretKey('sk_test_abc').warning).toMatch(/restricted key/);
  });

  it('refuses a publishable key or anything else in STRIPE_SECRET_KEY', () => {
    expect(() => checkStripeSecretKey('pk_live_abc')).toThrow(/restricted key/);
    expect(() => checkStripeSecretKey('')).toThrow();
  });
});
