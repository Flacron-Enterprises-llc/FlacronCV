import { TEST_SKU_JSON } from '../../testing/fake-payments';
import { buildCatalogSnapshot } from '../catalog';
import { BillingError } from '../errors';
import { ProviderSkus } from './skus';
import { stripeDelivery, stripeSignatureHeader, verifyStripeSignature } from './stripe';

const snapshot = buildCatalogSnapshot();

describe('provider SKU maps', () => {
  it('reads both directions and refuses ids that are not mapped', () => {
    const stripe = ProviderSkus.parse('stripe', 'STRIPE_PRICES', TEST_SKU_JSON.stripe, snapshot, { allowV1Prices: true });
    expect(stripe.refFor({ kind: 'plan', planId: 'business', interval: 'annual' })).toBe('price_test_business_annual');
    expect(stripe.skuFor('price_test_professional_monthly')).toEqual({
      kind: 'plan',
      planId: 'professional',
      interval: 'monthly',
    });
    expect(stripe.skuFor('price_test_v1_pro_monthly')).toEqual({ kind: 'legacy', legacyPlan: 'pro', interval: 'monthly' });
    expect(stripe.skuFor('price_somebody_else')).toBeNull();
  });

  it('refuses to map Business to a store product, in both intervals', () => {
    for (const provider of ['apple', 'google'] as const) {
      for (const interval of ['monthly', 'annual']) {
        const json = JSON.stringify({ [`plan:business:${interval}`]: 'com.example.business' });
        expect(() => ProviderSkus.parse(provider, 'X_PRODUCTS', json, snapshot)).toThrow(
          `X_PRODUCTS: plan:business:${interval} is not sold on ${provider}`,
        );
      }
    }
  });

  it('refuses Free, unknown keys, capacity add-ons, reused ids, and non-objects without printing values', () => {
    const parse = (json: string) => () => ProviderSkus.parse('stripe', 'STRIPE_PRICES', json, snapshot);
    expect(parse('{"plan:free:monthly":"price_secretish"}')).toThrow('plan:free:monthly is not a paid plan');
    expect(parse('{"plan:gold:monthly":"price_secretish"}')).toThrow('plan:gold:monthly is not a known SKU key');
    expect(parse('{"pack:storage_10gb":"price_secretish"}')).toThrow('is not a one-time usage pack for sale');
    expect(parse('{"plan:starter:monthly":"price_x","plan:starter:annual":"price_x"}')).toThrow('reuses an id');
    expect(parse('["price_x"]')).toThrow('STRIPE_PRICES must be a JSON object');
    expect(parse('{"plan:starter:monthly":"price_secretish","x":1}')).toThrow(/^(?!.*price_secretish).*$/);
  });

  it('refuses every V1 price, so no V1 subscription can be recognised or grant V2 benefits', () => {
    for (const provider of ['stripe', 'apple', 'google'] as const) {
      for (const key of ['legacy:pro:monthly', 'legacy:enterprise:annual', 'legacy:career_accelerator:monthly']) {
        expect(() => ProviderSkus.parse(provider, 'X_PRICES', JSON.stringify({ [key]: 'v1_ref' }), snapshot)).toThrow(
          `X_PRICES: ${key} is a FlacronCV V1 price`,
        );
      }
    }
    // The real fixture map (which carries V1 prices for the dormant legacy tests) is refused too.
    expect(() => ProviderSkus.parse('stripe', 'STRIPE_PRICES', TEST_SKU_JSON.stripe, snapshot)).toThrow(/V1 price/);
  });

  it('is empty when the variable is not set', () => {
    const empty = ProviderSkus.parse('stripe', 'STRIPE_PRICES', undefined, snapshot);
    expect(empty.refFor({ kind: 'plan', planId: 'starter', interval: 'monthly' })).toBeNull();
  });
});

describe('Stripe signature', () => {
  const secret = 'whsec_local_test_only';
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const at = new Date('2026-10-16T12:00:00Z');

  function code(fn: () => void): string {
    try {
      fn();
    } catch (error) {
      if (error instanceof BillingError) return `${error.code}:${String(error.details.reason)}`;
      throw error;
    }
    return 'ok';
  }

  it('accepts the header Stripe would send, including during secret rotation', () => {
    const header = stripeSignatureHeader(body, secret, at);
    expect(code(() => verifyStripeSignature(body, header, secret, at))).toBe('ok');
    const rotated = `${header},v1=${'0'.repeat(64)}`;
    expect(code(() => verifyStripeSignature(body, rotated, secret, at))).toBe('ok');
  });

  it('refuses a changed body, another secret, an old timestamp, and a missing header', () => {
    const header = stripeSignatureHeader(body, secret, at);
    expect(code(() => verifyStripeSignature(body.replace('evt_1', 'evt_2'), header, secret, at))).toBe(
      'unauthenticated:bad_signature',
    );
    expect(code(() => verifyStripeSignature(body, header, 'whsec_other', at))).toBe('unauthenticated:bad_signature');
    const later = new Date(at.getTime() + 301_000);
    expect(code(() => verifyStripeSignature(body, header, secret, later))).toBe('unauthenticated:signature_too_old');
    expect(code(() => verifyStripeSignature(body, undefined, secret, at))).toBe('unauthenticated:missing_signature');
    expect(code(() => verifyStripeSignature(body, 'v1=abc', secret, at))).toBe('unauthenticated:malformed_signature');
  });

  it('maps an unknown price to a null SKU and an unhandled type to ignored', () => {
    const skus = ProviderSkus.parse('stripe', 'STRIPE_PRICES', TEST_SKU_JSON.stripe, snapshot, { allowV1Prices: true });
    const sub = {
      id: 'sub_1',
      status: 'active',
      current_period_start: 1,
      current_period_end: 2,
      items: { data: [{ price: { id: 'price_not_ours' } }] },
    };
    const mapped = stripeDelivery({ id: 'evt_1', type: 'customer.subscription.updated', created: 1, data: { object: sub } }, skus);
    expect(mapped.events[0]).toMatchObject({ type: 'subscription_state', sku: null, providerRef: 'price_not_ours' });
    const other = stripeDelivery({ id: 'evt_2', type: 'customer.created', created: 1, data: { object: {} } }, skus);
    expect(other.events).toEqual([{ type: 'ignored', reason: 'unhandled:customer.created' }]);
  });

  it('ignores a Stripe object tagged for another app, even one using a V2 price', () => {
    const skus = ProviderSkus.parse('stripe', 'STRIPE_PRICES', TEST_SKU_JSON.stripe, snapshot, { allowV1Prices: true });
    const sub = (appId: string) => ({
      id: 'sub_v1',
      status: 'active',
      current_period_start: 1,
      current_period_end: 2,
      metadata: { app_id: appId, billing_account_id: '00000000-0000-0000-0000-000000000000' },
      items: { data: [{ price: { id: 'price_test_professional_monthly' } }] },
    });
    const v1 = stripeDelivery({ id: 'evt_v1', type: 'customer.subscription.updated', created: 1, data: { object: sub('flacroncv-v1') } }, skus);
    expect(v1.events).toEqual([{ type: 'ignored', reason: 'other_app' }]);
    const ours = stripeDelivery({ id: 'evt_v2', type: 'customer.subscription.updated', created: 1, data: { object: sub('flacroncv-v2') } }, skus);
    expect(ours.events[0]).toMatchObject({ type: 'subscription_state', sku: { kind: 'plan', planId: 'professional' } });
  });
});
