import { randomUUID } from 'crypto';
import { CATALOG_VERSION, PLANS } from '@flacroncv/career-shared';
import type { PurchaseChannel } from '@flacroncv/career-shared';
import { buildCatalogSnapshot } from '../billing/catalog';
import { BillingError } from '../billing/errors';
import type { AppleNotification, AppleNotificationVerifier } from '../billing/payments/apple';
import type { StripeCheckoutRequest, StripeGateway, StripeUpgradeQuoteRequest } from '../billing/payments/checkout';
import type {
  GooglePlayApi,
  GoogleProductPurchase,
  GooglePushVerifier,
  GoogleSubscriptionPurchase,
} from '../billing/payments/google';
import { PaymentsService } from '../billing/payments/payments.service';
import type { DeliveryOutcome } from '../billing/payments/processor';
import { ProviderSkus } from '../billing/payments/skus';
import type { ProviderReadiness } from '../integration/provider-readiness';
import { stripeSignatureHeader } from '../billing/payments/stripe';
import { BillingFixture, createBillingFixture } from './billing-fixture';

/** Local test value. Not a Stripe secret. */
export const TEST_STRIPE_WEBHOOK_SECRET = 'whsec_local_test_only';

const PAID = ['starter', 'professional', 'career_pro', 'business'] as const;

function planMap(prefix: string, sep: string, plans: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const plan of plans) {
    out[`plan:${plan}:monthly`] = `${prefix}${plan}${sep}monthly`;
    out[`plan:${plan}:annual`] = `${prefix}${plan}${sep}annual`;
  }
  return out;
}

/** What `STRIPE_PRICES`, `APPLE_PRODUCTS`, and `GOOGLE_PRODUCTS` look like. Ids are made up. */
export const TEST_SKU_JSON: Record<PurchaseChannel, string> = {
  stripe: JSON.stringify({
    ...planMap('price_test_', '_', PAID),
    'pack:document_s': 'price_test_document_s',
    'pack:action_s': 'price_test_action_s',
    'legacy:pro:monthly': 'price_test_v1_pro_monthly',
    'legacy:enterprise:monthly': 'price_test_v1_enterprise_monthly',
  }),
  apple: JSON.stringify({
    ...planMap('com.flacroncv.v2.', '.', ['starter', 'professional', 'career_pro']),
    'pack:document_s': 'com.flacroncv.v2.pack.document_s',
    'legacy:pro:monthly': 'com.flacroncv.pro.monthly',
    'legacy:enterprise:monthly': 'com.flacroncv.enterprise.monthly',
  }),
  google: JSON.stringify({
    ...planMap('flacroncv_', ':', ['starter', 'professional', 'career_pro']),
    'pack:document_s': 'flacroncv_pack_document_s',
    'legacy:pro:monthly': 'flacroncv_pro:monthly',
  }),
};

export function testSkus(): Record<PurchaseChannel, ProviderSkus> {
  const snapshot = buildCatalogSnapshot();
  // The fixtures include V1 prices so the dormant legacy-row code stays tested; real config refuses them.
  const options = { allowV1Prices: true };
  return {
    stripe: ProviderSkus.parse('stripe', 'STRIPE_PRICES', TEST_SKU_JSON.stripe, snapshot, options),
    apple: ProviderSkus.parse('apple', 'APPLE_PRODUCTS', TEST_SKU_JSON.apple, snapshot, options),
    google: ProviderSkus.parse('google', 'GOOGLE_PRODUCTS', TEST_SKU_JSON.google, snapshot, options),
  };
}

/** Records sessions; prorates like Stripe's default (price difference times the unused share of the period). */
export class FakeStripeGateway implements StripeGateway {
  readonly sessions: StripeCheckoutRequest[] = [];
  private readonly byKey = new Map<string, { sessionId: string; url: string }>();
  failNext = false;

  constructor(private readonly skus: ProviderSkus) {}

  async createCheckoutSession(request: StripeCheckoutRequest) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fake Stripe outage');
    }
    const existing = this.byKey.get(request.idempotencyKey);
    if (existing) return existing;
    this.sessions.push(request);
    const sessionId = `cs_test_${this.sessions.length}_${randomUUID().slice(0, 8)}`;
    const session = { sessionId, url: `https://checkout.stripe.test/${sessionId}` };
    this.byKey.set(request.idempotencyKey, session);
    return session;
  }

  async createBillingPortal(request: { billingAccountId: string; customerId: string | null }) {
    return { url: `https://billing.example.test/portal/${request.billingAccountId}` };
  }

  async quoteUpgrade(request: StripeUpgradeQuoteRequest) {
    const total = request.periodEnd.getTime() - request.periodStart.getTime();
    const unused = Math.max(request.periodEnd.getTime() - request.at.getTime(), 0);
    const diff = this.cents(request.newPriceId) - this.cents(request.currentPriceId);
    return { proratedCents: Math.round((diff * unused) / total) };
  }

  private cents(priceId: string): number {
    const sku = this.skus.skuFor(priceId);
    if (!sku || sku.kind !== 'plan') throw new Error(`fake Stripe has no price ${priceId}`);
    return sku.interval === 'annual' ? PLANS[sku.planId].annualCents : PLANS[sku.planId].monthlyCents;
  }
}

const FAKE_APPLE_PREFIX = 'fake-apple.';

/** Accepts only payloads made by `fakeAppleSignedPayload`. */
export class FakeAppleVerifier implements AppleNotificationVerifier {
  async verify(signedPayload: string): Promise<AppleNotification> {
    if (!signedPayload.startsWith(FAKE_APPLE_PREFIX)) {
      throw new BillingError('unauthenticated', { reason: 'bad_apple_signature' });
    }
    const json: unknown = JSON.parse(Buffer.from(signedPayload.slice(FAKE_APPLE_PREFIX.length), 'base64url').toString());
    return json as AppleNotification;
  }
}

export function fakeAppleSignedPayload(notification: AppleNotification): string {
  return FAKE_APPLE_PREFIX + Buffer.from(JSON.stringify(notification)).toString('base64url');
}

export const FAKE_GOOGLE_AUTHORIZATION = 'Bearer fake-google-push';

export class FakeGooglePush implements GooglePushVerifier {
  async verify(authorization: string | undefined): Promise<void> {
    if (authorization !== FAKE_GOOGLE_AUTHORIZATION) {
      throw new BillingError('unauthenticated', { reason: 'bad_google_token' });
    }
  }
}

export class FakeGooglePlay implements GooglePlayApi {
  readonly subscriptions = new Map<string, GoogleSubscriptionPurchase>();
  readonly products = new Map<string, GoogleProductPurchase>();
  readonly acknowledged: string[] = [];

  async getSubscription(token: string) {
    const sub = this.subscriptions.get(token);
    if (!sub) throw new BillingError('not_found', { reason: 'unknown_token' });
    return sub;
  }
  async getProduct(productId: string, token: string) {
    const product = this.products.get(`${productId}/${token}`);
    if (!product) throw new BillingError('not_found', { reason: 'unknown_token' });
    return product;
  }
  async acknowledgeSubscription(token: string) {
    this.acknowledged.push(token);
  }
  async acknowledgeProduct(productId: string, token: string) {
    this.acknowledged.push(`${productId}/${token}`);
  }
}

export function googlePushBody(rtdn: Record<string, unknown>, publishTime: Date, messageId: string = randomUUID()) {
  return {
    message: {
      messageId,
      publishTime: publishTime.toISOString(),
      data: Buffer.from(JSON.stringify(rtdn)).toString('base64'),
    },
    subscription: 'projects/test/subscriptions/play-rtdn',
  };
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/** Stripe event payloads in the shapes of API version 2024-06-20. Only the fields we read. */
export const stripeFixtures = {
  event(type: string, object: Record<string, unknown>, created: Date, id: string = `evt_${randomUUID()}`) {
    return { id, object: 'event', type, created: unix(created), api_version: '2024-06-20', data: { object } };
  },
  subscription(input: {
    id: string;
    priceId: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    accountId?: string;
    trialEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    customer?: string;
  }) {
    return {
      id: input.id,
      object: 'subscription',
      customer: input.customer ?? 'cus_test_1',
      status: input.status,
      current_period_start: unix(input.periodStart),
      current_period_end: unix(input.periodEnd),
      trial_end: input.trialEnd ? unix(input.trialEnd) : null,
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      metadata: input.accountId ? { billing_account_id: input.accountId } : {},
      items: { object: 'list', data: [{ id: 'si_test', price: { id: input.priceId } }] },
    };
  },
  invoice(input: { subscriptionId: string; priceId: string; amountPaid: number; paymentIntent: string; paidAt: Date; accountId?: string }) {
    return {
      id: `in_${randomUUID().slice(0, 12)}`,
      object: 'invoice',
      subscription: input.subscriptionId,
      amount_paid: input.amountPaid,
      currency: 'usd',
      payment_intent: input.paymentIntent,
      status_transitions: { paid_at: unix(input.paidAt) },
      subscription_details: { metadata: input.accountId ? { billing_account_id: input.accountId } : {} },
      lines: { object: 'list', data: [{ price: { id: input.priceId } }] },
    };
  },
  packCheckout(input: { sessionId: string; accountId: string; paymentIntent: string; amountTotal: number }) {
    return {
      id: input.sessionId,
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      client_reference_id: input.accountId,
      payment_intent: input.paymentIntent,
      amount_total: input.amountTotal,
      currency: 'usd',
      metadata: {},
    };
  },
  charge(input: { paymentIntent: string; amount: number; amountRefunded: number }) {
    return {
      id: `ch_${randomUUID().slice(0, 12)}`,
      object: 'charge',
      payment_intent: input.paymentIntent,
      amount: input.amount,
      amount_refunded: input.amountRefunded,
    };
  },
};

export interface PaymentsFixture extends BillingFixture {
  payments: PaymentsService;
  stripe: FakeStripeGateway;
  googlePlay: FakeGooglePlay;
  skus: Record<PurchaseChannel, ProviderSkus>;
  /** Provider readiness the pack checkout reads; tests may flip entries. */
  readiness: ProviderReadiness;
  /** Signs the event with the test secret at the clock's time and delivers it. */
  deliverStripe(event: { id: string }): Promise<DeliveryOutcome>;
  deliverApple(notification: AppleNotification): Promise<DeliveryOutcome>;
  deliverGoogle(rtdn: Record<string, unknown>, messageId?: string): Promise<DeliveryOutcome>;
}

export async function createPaymentsFixture(label: string, startIso: string): Promise<PaymentsFixture> {
  const base = await createBillingFixture(label, startIso);
  const skus = testSkus();
  const stripe = new FakeStripeGateway(skus.stripe);
  const googlePlay = new FakeGooglePlay();
  // AI and storage ready, as in a configured deployment; speech, map tiles and job feeds have no live adapter.
  const readiness: ProviderReadiness = { ai: true, objectStorage: true, speech: false, mapTiles: false, jobFeeds: false };
  const payments = new PaymentsService(
    base.db.pool,
    { stripe, apple: new FakeAppleVerifier(), googlePush: new FakeGooglePush(), googlePlay },
    { stripeWebhookSecret: TEST_STRIPE_WEBHOOK_SECRET, skus, currentCatalogVersion: CATALOG_VERSION, providerReadiness: readiness },
    base.clock,
  );
  return {
    ...base,
    payments,
    stripe,
    googlePlay,
    skus,
    readiness,
    deliverStripe(event) {
      const rawBody = JSON.stringify(event);
      return payments.stripeWebhook(rawBody, stripeSignatureHeader(rawBody, TEST_STRIPE_WEBHOOK_SECRET, base.clock.now()));
    },
    deliverApple(notification) {
      return payments.appleWebhook({ signedPayload: fakeAppleSignedPayload(notification) });
    },
    deliverGoogle(rtdn, messageId) {
      return payments.googleWebhook(googlePushBody(rtdn, base.clock.now(), messageId), FAKE_GOOGLE_AUTHORIZATION);
    },
  };
}
