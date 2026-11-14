import { GoneException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { CareerBillingService, readCareerBillingMode, readCareerStripePrices } from './career-billing.service';
import { PaymentService } from './payment.service';

/**
 * Career plans through V1 billing: an optional ADD-ON subscription with its own
 * career credits (approved model). Stripe is mocked; no Stripe resource is used.
 * Every webhook test also asserts the V1 plan, credits and V1 subscription are untouched.
 */
const APP = { app_id: 'flacron-cv' };
const CAREER_PRICE = 'price_career_professional_month';
const V1_SUB = 'sub_v1_pro';
const CAREER_SUB = 'sub_career_1';

function config() {
  return { get: jest.fn((key: string) => ({ 'stripe.secretKey': '', 'stripe.appId': 'flacron-cv', frontendUrl: 'http://localhost:3100' } as Record<string, unknown>)[key]) } as any;
}

function users(firestore: InMemoryFirestore) {
  return {
    findByIdOrThrow: jest.fn(async (uid: string) => (await firestore.collection('users').doc(uid).get()).data()),
    updateSubscription: jest.fn(async (uid: string, patch: Record<string, unknown>) => {
      const ref = firestore.collection('users').doc(uid);
      const current = (await ref.get()).data() as { subscription: Record<string, unknown> };
      await ref.update({ subscription: { ...current.subscription, ...patch } });
    }),
  } as any;
}

function careerSubscription(status: string, periodEnd: number, extra: Record<string, unknown> = {}) {
  return {
    id: CAREER_SUB,
    status,
    customer: 'cus_shared',
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    metadata: { ...APP, firebaseUid: 'u1', product: 'career', careerPlan: 'professional', interval: 'month' },
    items: { data: [{ price: { id: CAREER_PRICE, recurring: { interval: 'month' } } }] },
    ...extra,
  };
}

function stripeMock() {
  const subs = new Map<string, any>();
  return {
    subs,
    prices: { retrieve: jest.fn(async () => ({ id: CAREER_PRICE, active: true, currency: 'usd', unit_amount: 3899, recurring: { interval: 'month' }, metadata: APP })) },
    customers: { create: jest.fn(async () => ({ id: 'cus_new' })), retrieve: jest.fn(async (id: string) => ({ id, metadata: APP })) },
    checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_1', url: 'https://checkout.example.test/cs_1' })) } },
    subscriptions: {
      retrieve: jest.fn(async (id: string) => subs.get(id)),
      cancel: jest.fn(async (id: string) => {
        const sub = { ...subs.get(id), status: 'canceled' };
        subs.set(id, sub);
        return sub;
      }),
    },
    invoices: { retrieve: jest.fn(async (id: string) => ({ id, customer: 'cus_shared', subscription: CAREER_SUB, subscription_details: { metadata: { ...APP, product: 'career' } }, lines: { data: [] } })) },
    paymentIntents: { retrieve: jest.fn(async () => ({ metadata: APP })) },
    refunds: { list: jest.fn(async () => ({ data: [] })) },
    charges: { retrieve: jest.fn() },
  };
}

async function seedV1Pro(firestore: InMemoryFirestore) {
  await firestore.collection('users').doc('u1').set({
    uid: 'u1',
    email: 'u1@example.test',
    displayName: 'Fictional Person',
    subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_shared', stripeSubscriptionId: V1_SUB },
    usage: { aiCreditsUsed: 7, aiCreditsLimit: 100, exportsThisMonth: 2 },
  });
}

describe('career billing configuration', () => {
  it('is disabled by default and refuses the local fixture mode in production', () => {
    expect(readCareerBillingMode({})).toBe('disabled');
    expect(readCareerBillingMode({ CAREER_BILLING_MODE: 'addon', NODE_ENV: 'development' })).toBe('addon');
    expect(readCareerBillingMode({ CAREER_BILLING_MODE: 'addon', NODE_ENV: 'production' })).toBe('addon');
    expect(() => readCareerBillingMode({ CAREER_BILLING_MODE: 'addon_fixture' })).toThrow();
    expect(() => readCareerBillingMode({ CAREER_BILLING_MODE: 'live' })).toThrow();
    expect(() => readCareerStripePrices({ CAREER_STRIPE_PRICES: '{"platinum:month":"price_x"}' })).toThrow(/unknown key/);
  });
});

describe('career add-on checkout (retired by the five-plan model)', () => {
  const saved = { mode: process.env.CAREER_BILLING_MODE, prices: process.env.CAREER_STRIPE_PRICES };
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  const make = (mode: string) => {
    process.env.CAREER_BILLING_MODE = mode;
    process.env.CAREER_STRIPE_PRICES = JSON.stringify({ 'professional:month': CAREER_PRICE });
    return new CareerBillingService(config(), { firestore } as any, users(firestore), stripe as any);
  };
  const confirmBuy = (svc: CareerBillingService, amount = 3899) =>
    svc.createCheckout('u1', { plan: 'professional', interval: 'month', expectedAmountCents: amount, idempotencyKey: 'k1' }, { success: 's', cancel: 'c' });

  beforeEach(async () => {
    firestore = new InMemoryFirestore();
    stripe = stripeMock();
    await seedV1Pro(firestore);
  });
  afterAll(() => {
    process.env.CAREER_BILLING_MODE = saved.mode;
    process.env.CAREER_STRIPE_PRICES = saved.prices;
  });

  it('can no longer create a second subscription for features every plan includes, in any mode', async () => {
    for (const mode of ['disabled', 'addon']) {
      const error = await confirmBuy(make(mode)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GoneException);
      expect((error as GoneException).getResponse()).toMatchObject({ code: 'CAREER_ADDON_RETIRED' });
    }
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('status says the tools are included, shows the mapped career plan, and touches nothing', async () => {
    const status = await make('addon').status('u1');
    expect(status).toMatchObject({ model: 'included', purchasable: false, blockedReason: 'retired', careerPlan: 'starter' });
    expect(status.addons.find((a) => a.id === 'document_s')).toMatchObject({ onSale: false, allowed: true, priceCents: 499 });
    expect(status.addons.find((a) => a.id === 'action_s')).toMatchObject({ allowed: false, minPlan: 'professional' });
    const v1 = (await firestore.collection('users').doc('u1').get()).data() as any;
    expect(v1.subscription).toMatchObject({ plan: SubscriptionPlan.PRO, stripeSubscriptionId: V1_SUB, stripeCustomerId: 'cus_shared' });
    expect(v1.careerSubscription).toBeUndefined();
  });

  it('an existing add-on subscriber keeps the higher of the add-on and the mapped plan', async () => {
    const end = new Date(Date.now() + 10 * 86400_000);
    await firestore.collection('users').doc('u1').update({ careerSubscription: { plan: 'career_pro', status: 'active', currentPeriodEnd: end, stripeSubscriptionId: CAREER_SUB } });
    expect((await make('addon').status('u1')).careerPlan).toBe('career_pro');
    await firestore.collection('users').doc('u1').update({ careerSubscription: { plan: 'career_pro', status: 'canceled', currentPeriodEnd: new Date(Date.now() - 1000), stripeSubscriptionId: CAREER_SUB } });
    expect((await make('addon').status('u1')).careerPlan).toBe('starter');
  });
});

describe('career webhooks through V1 PaymentService', () => {
  const saved = { mode: process.env.CAREER_BILLING_MODE, prices: process.env.CAREER_STRIPE_PRICES };
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  let payments: PaymentService;
  const t0 = 1_800_000_000;
  const user = async () => (await firestore.collection('users').doc('u1').get()).data() as any;
  const event = (id: string, type: string, object: unknown, created: number) =>
    ({ id, type, created, livemode: false, data: { object } }) as any;

  beforeEach(async () => {
    process.env.CAREER_BILLING_MODE = 'disabled';
    process.env.CAREER_STRIPE_PRICES = JSON.stringify({ 'professional:month': CAREER_PRICE });
    firestore = new InMemoryFirestore();
    stripe = stripeMock();
    await seedV1Pro(firestore);
    const career = new CareerBillingService(config(), { firestore } as any, users(firestore), stripe as any);
    payments = new PaymentService(config(), { firestore } as any, users(firestore), { logSystemAction: jest.fn() } as any, undefined, career);
    (payments as any).stripe = stripe;
    stripe.subs.set(CAREER_SUB, careerSubscription('active', t0 + 30 * 86400));
  });
  afterAll(() => {
    process.env.CAREER_BILLING_MODE = saved.mode;
    process.env.CAREER_STRIPE_PRICES = saved.prices;
  });

  const expectV1Untouched = async () => {
    const u = await user();
    expect(u.subscription).toMatchObject({ plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, stripeSubscriptionId: V1_SUB });
    expect(u.usage).toEqual({ aiCreditsUsed: 7, aiCreditsLimit: 100, exportsThisMonth: 2 });
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalledWith(V1_SUB);
  };

  it('a completed checkout grants the career plan once; a replay changes nothing', async () => {
    const session = { id: 'cs_1', subscription: CAREER_SUB, customer: 'cus_shared', client_reference_id: 'u1', metadata: { ...APP, product: 'career', firebaseUid: 'u1' } };
    expect(await payments.handleWebhookEvent(event('evt_1', 'checkout.session.completed', session, t0))).toBe('applied');
    const granted = (await user()).careerSubscription;
    expect(granted).toMatchObject({ plan: 'professional', interval: 'month', status: 'active', stripeSubscriptionId: CAREER_SUB, source: 'stripe' });
    expect(await payments.handleWebhookEvent(event('evt_1', 'checkout.session.completed', session, t0))).toBe('duplicate');
    expect((await user()).careerSubscription.stateAt).toBe(granted.stateAt);
    await expectV1Untouched();
  });

  it('an older event delivered late never overwrites a newer state', async () => {
    await payments.handleWebhookEvent(event('evt_new', 'customer.subscription.updated', careerSubscription('active', t0 + 60 * 86400), t0 + 100));
    await payments.handleWebhookEvent(event('evt_old', 'customer.subscription.updated', careerSubscription('incomplete', t0 + 30 * 86400), t0 + 50));
    expect((await user()).careerSubscription).toMatchObject({ status: 'active', stateAt: t0 + 100 });
    await expectV1Untouched();
  });

  it('a failed career payment marks the career plan past due and leaves V1 alone', async () => {
    stripe.subs.set(CAREER_SUB, careerSubscription('past_due', t0 + 30 * 86400));
    const invoice = { id: 'in_1', customer: 'cus_shared', subscription: CAREER_SUB, subscription_details: { metadata: { ...APP, product: 'career' } }, lines: { data: [] } };
    expect(await payments.handleWebhookEvent(event('evt_fail', 'invoice.payment_failed', invoice, t0 + 10))).toBe('applied');
    expect((await user()).careerSubscription.status).toBe('past_due');
    await expectV1Untouched();
  });

  it('a full refund of a career charge ends career access now and never revokes the V1 plan', async () => {
    const charge = { id: 'ch_1', refunded: true, amount_refunded: 3899, customer: 'cus_shared', invoice: 'in_1', payment_intent: 'pi_1', metadata: APP };
    expect(await payments.handleWebhookEvent(event('evt_refund', 'charge.refunded', charge, t0 + 20))).toBe('applied');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(CAREER_SUB);
    const state = (await user()).careerSubscription;
    expect(state.status).toBe('canceled');
    expect(new Date(state.currentPeriodEnd).getTime()).toBe((t0 + 20) * 1000);
    await expectV1Untouched();
  });

  it('a partial refund changes no entitlement (V1 rule)', async () => {
    await payments.handleWebhookEvent(event('evt_ok', 'customer.subscription.updated', careerSubscription('active', t0 + 30 * 86400), t0));
    const charge = { id: 'ch_2', refunded: false, amount_refunded: 500, customer: 'cus_shared', invoice: 'in_1', payment_intent: 'pi_2', metadata: APP };
    await payments.handleWebhookEvent(event('evt_partial', 'charge.refunded', charge, t0 + 30));
    expect((await user()).careerSubscription.status).toBe('active');
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await expectV1Untouched();
  });

  it('cancellation at period end is recorded; deletion ends the career plan', async () => {
    await payments.handleWebhookEvent(event('evt_c1', 'customer.subscription.updated', careerSubscription('active', t0 + 30 * 86400, { cancel_at_period_end: true }), t0 + 1));
    expect((await user()).careerSubscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
    await payments.handleWebhookEvent(event('evt_c2', 'customer.subscription.deleted', careerSubscription('canceled', t0 + 30 * 86400), t0 + 2));
    expect((await user()).careerSubscription.status).toBe('canceled');
    await expectV1Untouched();
  });

  it('an abandoned or expired checkout grants nothing', async () => {
    const expired = { id: 'cs_x', subscription: null, metadata: { ...APP, product: 'career', firebaseUid: 'u1' } };
    expect(await payments.handleWebhookEvent(event('evt_exp', 'checkout.session.expired', expired, t0))).toBe('ignored');
    const completedWithoutSubscription = { ...expired, id: 'cs_y' };
    await payments.handleWebhookEvent(event('evt_nosub', 'checkout.session.completed', completedWithoutSubscription, t0));
    expect((await user()).careerSubscription).toBeUndefined();
    await expectV1Untouched();
  });

  it('a renewal extends the paid period once; replaying it changes nothing', async () => {
    await payments.handleWebhookEvent(event('evt_start', 'customer.subscription.updated', careerSubscription('active', t0 + 30 * 86400), t0));
    stripe.subs.set(CAREER_SUB, careerSubscription('active', t0 + 60 * 86400));
    const invoice = { id: 'in_2', customer: 'cus_shared', subscription: CAREER_SUB, subscription_details: { metadata: { ...APP, product: 'career' } }, lines: { data: [] } };
    await payments.handleWebhookEvent(event('evt_renew', 'invoice.paid', invoice, t0 + 30 * 86400));
    const renewed = (await user()).careerSubscription;
    expect(new Date(renewed.currentPeriodEnd).getTime()).toBe((t0 + 60 * 86400) * 1000);
    expect(await payments.handleWebhookEvent(event('evt_renew', 'invoice.paid', invoice, t0 + 30 * 86400))).toBe('duplicate');
    expect((await user()).careerSubscription.stateAt).toBe(renewed.stateAt);
    await expectV1Untouched();
  });

  it('closing the V1 account also cancels a live career subscription', async () => {
    await firestore.collection('users').doc('u1').update({ careerSubscription: { plan: 'professional', status: 'active', stripeSubscriptionId: CAREER_SUB } });
    (payments as any).revokeToFree = jest.fn();
    await payments.cancelBillingForUser('u1', 'account_deleted');
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(CAREER_SUB);
  });
});
