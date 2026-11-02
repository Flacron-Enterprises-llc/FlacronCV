import { LiveStripeGateway, createStripeGateway, isStripeTestSecret } from './live-stripe';
import { UnconfiguredStripeGateway } from './checkout';

describe('LiveStripeGateway', () => {
  it('creates a checkout session on the test host', async () => {
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 }),
    );
    const stripe = new LiveStripeGateway('sk_test_123', 'http://localhost:3001', fetchImpl as typeof fetch);
    const session = await stripe.createCheckoutSession({
      mode: 'subscription',
      priceId: 'price_123',
      billingAccountId: 'acct-1',
      customerId: null,
      trialDays: 7,
      idempotencyKey: 'key-1',
      metadata: { billing_account_id: 'acct-1', sku: 'plan:starter:monthly', catalog_version: 'v2' },
    });
    expect(session.sessionId).toBe('cs_test_1');
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(String(init.body)).toContain('metadata%5Bapp_id%5D=flacroncv-v2');
    expect(String(init.body)).not.toContain('plan%3Aprofessional');
  });

  it('refuses a live key outside production', () => {
    expect(isStripeTestSecret('sk_test_abc')).toBe(true);
    expect(createStripeGateway({ STRIPE_SECRET_KEY: 'sk_live_abc', NODE_ENV: 'development' })).toBeInstanceOf(
      UnconfiguredStripeGateway,
    );
    expect(createStripeGateway({ STRIPE_SECRET_KEY: 'sk_test_abc', NODE_ENV: 'development' })).toBeInstanceOf(LiveStripeGateway);
    expect(createStripeGateway({ STRIPE_SECRET_KEY: 'rk_test_abc', NODE_ENV: 'development' })).toBeInstanceOf(LiveStripeGateway);
  });
});
