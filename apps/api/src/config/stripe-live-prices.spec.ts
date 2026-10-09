import {
  assertLiveStripePricesConfigured,
  isLiveStripeSecretKey,
  LIVE_STRIPE_PRICE_ENV_KEYS,
  missingLiveStripePriceEnv,
} from './stripe-live-prices';

const ALL_SET = Object.fromEntries(
  LIVE_STRIPE_PRICE_ENV_KEYS.map((key) => [key, `price_live_${key}`]),
) as Record<string, string>;

describe('stripe live price env', () => {
  it('treats the sk_live_ and rk_live_ prefixes as live (trimmed)', () => {
    expect(isLiveStripeSecretKey('sk_live_x')).toBe(true);
    expect(isLiveStripeSecretKey('rk_live_x')).toBe(true);
    expect(isLiveStripeSecretKey('rk_test_x')).toBe(false);
    expect(isLiveStripeSecretKey('pk_live_x')).toBe(false);
    expect(isLiveStripeSecretKey('  sk_live_x  ')).toBe(true);
    expect(isLiveStripeSecretKey('sk_test_x')).toBe(false);
    expect(isLiveStripeSecretKey('')).toBe(false);
    expect(isLiveStripeSecretKey(undefined)).toBe(false);
  });

  it('lists blank or missing live price env keys', () => {
    expect(missingLiveStripePriceEnv({})).toEqual([...LIVE_STRIPE_PRICE_ENV_KEYS]);
    expect(missingLiveStripePriceEnv({ STRIPE_PRO_MONTHLY_PRICE_ID: '  ' })).toEqual([
      ...LIVE_STRIPE_PRICE_ENV_KEYS,
    ]);
    expect(missingLiveStripePriceEnv(ALL_SET)).toEqual([]);
  });

  it('does not throw for a test secret even with no price env', () => {
    expect(() => assertLiveStripePricesConfigured('sk_test_x', {})).not.toThrow();
  });

  it('gates a live restricted key exactly like a live secret key', () => {
    expect(() => assertLiveStripePricesConfigured('rk_live_x', {})).toThrow(/STRIPE_PRO_MONTHLY_PRICE_ID/);
    expect(() => assertLiveStripePricesConfigured('rk_live_x', ALL_SET)).not.toThrow();
  });

  it('does not throw for a live secret when all four prices are set', () => {
    expect(() => assertLiveStripePricesConfigured('sk_live_x', ALL_SET)).not.toThrow();
  });

  it('throws a boot message naming the missing vars and that the API will not start', () => {
    expect(() => assertLiveStripePricesConfigured('sk_live_x', {})).toThrow(
      /The API will not start until these env vars are set: STRIPE_PRO_MONTHLY_PRICE_ID/,
    );
    expect(() =>
      assertLiveStripePricesConfigured('sk_live_x', {
        STRIPE_PRO_MONTHLY_PRICE_ID: 'price_a',
      }),
    ).toThrow(/STRIPE_PRO_YEARLY_PRICE_ID/);
    expect(() => assertLiveStripePricesConfigured('sk_live_x', {})).toThrow(
      /compiled PLAN_CONFIGS price ids/,
    );
  });
});
