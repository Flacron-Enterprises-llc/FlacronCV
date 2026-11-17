import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { BillingLedgerService } from './billing-ledger.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus, TRIAL_PERIOD_DAYS } from '@flacroncv/shared-types';
import { CHECKOUT_COORDINATION_COLLECTION, CHECKOUT_SESSION_TTL_SECONDS, CheckoutCoordinator } from './checkout-coordination';
import { resolveCheckoutCustomer } from './customer-ownership';

/**
 * Billing correctness on the shared Flacron Stripe account: event ordering,
 * which subscription an event may change, checkout coordination and trial
 * consumption, portal safety, disputes, refunds, untagged legacy events.
 *
 * The users service here PERSISTS to the in-memory Firestore, so every test
 * asserts the resulting user document, not only the calls made.
 */

const APP_ID = 'flacron-cv';
const OURS = { app_id: APP_ID };
const THEIRS = { app_id: 'flacron-ai' };
const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;

function makeConfig(extra: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    'stripe.secretKey': 'rk_test_dummy',
    'stripe.webhookSecret': 'whsec_test',
    'stripe.prices': {},
    'stripe.planPrices': {
      starter: { month: 'price_starter_m' },
      professional: { month: 'price_prof_m' },
      business: { month: 'price_business_m' },
    },
    'stripe.appId': APP_ID,
    'stripe.portalConfigurationId': 'bpc_flacroncv',
    frontendUrl: 'http://app',
    ...extra,
  };
  return { get: jest.fn((key: string) => map[key]) } as any;
}

function makeUsersService(firestore: InMemoryFirestore) {
  const write = (uid: string, prefix: string, patch: Record<string, unknown>) => {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) data[`${prefix}.${k}`] = v;
    return firestore.collection('users').doc(uid).update(data);
  };
  return {
    findByIdOrThrow: jest.fn(async (uid: string) => {
      const doc = await firestore.collection('users').doc(uid).get();
      if (!doc.exists) throw new Error('User not found');
      return doc.data();
    }),
    updateSubscription: jest.fn((uid: string, patch: Record<string, unknown>) => write(uid, 'subscription', patch)),
    updateUsage: jest.fn((uid: string, patch: Record<string, unknown>) => write(uid, 'usage', patch)),
    rolloverUsageIfDue: jest.fn().mockResolvedValue(true),
  } as any;
}

const audit = () => ({ logSystemAction: jest.fn().mockResolvedValue(undefined) }) as any;

async function seedUser(firestore: InMemoryFirestore, uid: string, subscription: Record<string, unknown> = {}) {
  await firestore.collection('users').doc(uid).set({
    uid,
    email: `${uid}@example.com`,
    displayName: 'Test',
    subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: null, ...subscription },
    usage: { aiCreditsUsed: 0, aiCreditsLimit: 5, exportsThisMonth: 0 },
  });
}

const sub = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  livemode: false,
  metadata: { ...OURS },
  items: { data: [{ id: 'si_1', price: { id: 'price_prof_m', recurring: { interval: 'month' }, unit_amount: 3899 }, quantity: 1 }] },
  current_period_start: 1_700_000_000,
  current_period_end: 1_702_600_000,
  cancel_at_period_end: false,
  created: 1_700_000_000,
  currency: 'usd',
  ...overrides,
});

const event = (id: string, type: string, object: Record<string, unknown>, created?: number) =>
  ({ id, type, livemode: false, ...(created !== undefined ? { created } : {}), data: { object } }) as any;

function missing() {
  return Object.assign(new Error('No such object'), { type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 404 });
}

/** A small stateful Stripe double: sessions can be created, retrieved, listed and expired. */
function fakeStripe() {
  const sessions = new Map<string, any>();
  const subscriptions = new Map<string, any>();
  let n = 0;
  const stripe = {
    prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: { ...OURS } })) },
    customers: {
      retrieve: jest.fn(async (id: string) => ({ id, metadata: { ...OURS } })),
      create: jest.fn(async (_params: any, _opts?: any) => ({ id: 'cus_new', created: 1_700_000_000, livemode: false, metadata: { ...OURS } })),
      update: jest.fn(async () => ({})),
    },
    subscriptions: {
      list: jest.fn(async (_params?: any) => ({ data: [] as any[] })),
      retrieve: jest.fn(async (id: string) => {
        const s = subscriptions.get(id);
        if (!s) throw missing();
        return s;
      }),
      cancel: jest.fn(async (id: string, _params?: any) => ({ id, status: 'canceled' })),
      update: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(async (params: any, _opts?: any) => {
          const s = {
            id: `cs_${++n}`,
            url: `http://checkout/${n}`,
            status: 'open',
            expires_at: params.expires_at,
            metadata: params.metadata,
            subscription: null as string | null,
          };
          sessions.set(s.id, s);
          return s;
        }),
        retrieve: jest.fn(async (id: string) => {
          const s = sessions.get(id);
          if (!s) throw missing();
          return { ...s };
        }),
        expire: jest.fn(async (id: string) => {
          const s = sessions.get(id);
          if (!s || s.status !== 'open') throw new Error('Only open sessions can be expired');
          s.status = 'expired';
          return { ...s };
        }),
        list: jest.fn(async (params: any) => ({ data: [...sessions.values()].filter((s) => s.status === params.status) })),
      },
    },
    invoices: { retrieve: jest.fn() },
    charges: { retrieve: jest.fn() },
    refunds: { list: jest.fn(async () => ({ data: [] })) },
    paymentIntents: { retrieve: jest.fn(), update: jest.fn() },
    billingPortal: { sessions: { create: jest.fn(async (_params: any) => ({ url: 'http://portal' })) } },
    subscriptionSchedules: { create: jest.fn(async () => ({ id: 'sched_1' })), update: jest.fn(async () => ({})), release: jest.fn() },
  };
  return { stripe, sessions, subscriptions };
}

describe('PaymentService billing correctness', () => {
  let firestore: InMemoryFirestore;
  let users: ReturnType<typeof makeUsersService>;
  let service: PaymentService;
  let fake: ReturnType<typeof fakeStripe>;

  const build = (config = makeConfig()) => {
    const firebase = { firestore } as any;
    service = new PaymentService(config, firebase, users, audit(), new BillingLedgerService(firebase));
    fake = fakeStripe();
    (service as any).stripe = fake.stripe;
  };

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    users = makeUsersService(firestore);
    build();
  });

  const userDoc = async (uid = 'u1') => (await firestore.collection('users').doc(uid).get()).data() as any;
  const coordination = async (uid = 'u1') =>
    (await firestore.collection(CHECKOUT_COORDINATION_COLLECTION).doc(uid).get()).data() as any;
  const decision = async (eventId: string) =>
    ((await firestore.collection('payment_events').doc(eventId).get()).data() as any)?.entitlement_decision;

  // ─── 1. Stale / out-of-order / other-subscription events ─────────────────────

  describe('event ordering and the current subscription', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.PROFESSIONAL,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      });
    });

    it('a late subscription.updated(active) after deleted does not restore the plan', async () => {
      fake.subscriptions.set('sub_1', sub({ status: 'active' })); // even if Stripe still answered active
      await service.handleWebhookEvent(event('evt_del', 'customer.subscription.deleted', sub({ status: 'canceled' }), 200));
      expect((await userDoc()).subscription).toMatchObject({ plan: SubscriptionPlan.FREE, stripeSubscriptionId: null, stripeStateAt: 200 });

      await service.handleWebhookEvent(event('evt_late', 'customer.subscription.updated', sub({ status: 'active' }), 100));
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
      // Refused by the deletion tombstone, whatever Stripe answers and in any order.
      expect(await decision('evt_late')).toBe('subscription_ended');
    });

    it('a replayed updated(active) for a canceled subscription is re-read from Stripe and grants nothing', async () => {
      await service.handleWebhookEvent(event('evt_del', 'customer.subscription.deleted', sub({ status: 'canceled' })));
      fake.subscriptions.set('sub_1', sub({ status: 'canceled' }));
      // Newer timestamp, stale payload: Stripe's current state wins.
      await service.handleWebhookEvent(event('evt_replay', 'customer.subscription.updated', sub({ status: 'active' }), 999));
      expect(fake.stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(await decision('evt_replay')).toBe('subscription_ended');
    });

    it('deleting an OLD subscription does not downgrade a user on a newer one', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeSubscriptionId': 'sub_new' });
      await service.handleWebhookEvent(event('evt_old_del', 'customer.subscription.deleted', sub({ id: 'sub_old', status: 'canceled' })));
      const doc = await userDoc();
      expect(doc.subscription).toMatchObject({ plan: SubscriptionPlan.PROFESSIONAL, stripeSubscriptionId: 'sub_new' });
      expect(await decision('evt_old_del')).toBe('not_current_subscription');
    });

    it('updated / invoice.paid / payment_failed for another subscription change nothing', async () => {
      const other = sub({ id: 'sub_other', items: { data: [{ price: { id: 'price_business_m' } }] } });
      fake.subscriptions.set('sub_other', other);
      await service.handleWebhookEvent(event('evt_u', 'customer.subscription.updated', other));
      await service.handleWebhookEvent(
        event('evt_p', 'invoice.paid', { id: 'in_o', customer: 'cus_1', subscription: 'sub_other', subscription_details: { metadata: OURS } }),
      );
      await service.handleWebhookEvent(
        event('evt_f', 'invoice.payment_failed', { id: 'in_f', customer: 'cus_1', subscription: 'sub_other', subscription_details: { metadata: OURS } }),
      );
      expect(users.updateSubscription).not.toHaveBeenCalled();
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(await decision('evt_f')).toBe('not_current_subscription');
    });

    it('applies the current subscription and advances the state clock', async () => {
      fake.subscriptions.set('sub_1', sub({ items: { data: [{ price: { id: 'price_business_m' } }] } }));
      await service.handleWebhookEvent(event('evt_ok', 'customer.subscription.updated', sub(), 300));
      expect((await userDoc()).subscription).toMatchObject({ plan: SubscriptionPlan.BUSINESS, stripeStateAt: 300 });
    });

    it('adopts a live subscription of ours when the user has none (lost checkout webhook)', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeSubscriptionId': null, 'subscription.plan': 'free' });
      fake.subscriptions.set('sub_1', sub({ metadata: { ...OURS, internal_user_id: 'u1' } }));
      await service.handleWebhookEvent(event('evt_adopt', 'customer.subscription.updated', sub()));
      expect((await userDoc()).subscription).toMatchObject({ plan: SubscriptionPlan.PROFESSIONAL, stripeSubscriptionId: 'sub_1' });
    });

    it('never adopts a subscription stamped for another user', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeSubscriptionId': null, 'subscription.plan': 'free' });
      fake.subscriptions.set('sub_1', sub({ metadata: { ...OURS, internal_user_id: 'someone-else' } }));
      await service.handleWebhookEvent(event('evt_x', 'customer.subscription.updated', sub()));
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
    });
  });

  // ─── h2. Failed renewals do not extend the paid period ───────────────────────

  describe('failed renewal', () => {
    it('past_due keeps the paid period end and does not refresh credits; invoice.paid then advances once', async () => {
      const paidEnd = new Date(1_702_600_000 * 1000);
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.PROFESSIONAL,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: paidEnd,
      });
      const renewed = { current_period_start: 1_702_600_000, current_period_end: 1_705_200_000 };
      fake.subscriptions.set('sub_1', sub({ status: 'past_due', ...renewed }));

      await service.handleWebhookEvent(event('evt_pd', 'customer.subscription.updated', sub({ status: 'past_due', ...renewed }), 10));
      let doc = await userDoc();
      expect(doc.subscription.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(new Date(doc.subscription.currentPeriodEnd)).toEqual(paidEnd);
      expect(users.rolloverUsageIfDue).not.toHaveBeenCalled();
      expect(users.updateUsage).not.toHaveBeenCalled();

      fake.subscriptions.set('sub_1', sub({ status: 'active', ...renewed }));
      await service.handleWebhookEvent(
        event('evt_paid', 'invoice.paid', { id: 'in_r', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }, 20),
      );
      doc = await userDoc();
      expect(doc.subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(new Date(doc.subscription.currentPeriodEnd)).toEqual(new Date(1_705_200_000 * 1000));
      expect(users.rolloverUsageIfDue).toHaveBeenCalledTimes(1);
    });

    // Found in a REAL Stripe test-clock renewal: Stripe enters the new period while the
    // subscription is still `active`, with the renewal invoice only drafted/open.
    it('an active subscription whose renewal invoice is not paid yet keeps the paid period end and credits', async () => {
      const paidEnd = new Date(1_702_600_000 * 1000);
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.PROFESSIONAL,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: paidEnd,
      });
      const renewed = { current_period_start: 1_702_600_000, current_period_end: 1_705_200_000 };
      const invoices = new Map<string, Record<string, unknown>>([
        ['in_draft', { id: 'in_draft', status: 'draft', amount_due: 3899 }],
      ]);
      (fake as unknown as { invoices: { retrieve: jest.Mock } }).invoices = { retrieve: jest.fn(async (id: string) => invoices.get(id)) } as never;
      (service as unknown as { stripe: { invoices: unknown } }).stripe.invoices = (fake as unknown as { invoices: unknown }).invoices;
      fake.subscriptions.set('sub_1', sub({ status: 'active', latest_invoice: 'in_draft', ...renewed }));

      await service.handleWebhookEvent(event('evt_roll', 'customer.subscription.updated', sub({ status: 'active', latest_invoice: 'in_draft', ...renewed }), 10));
      let doc = await userDoc();
      expect(doc.subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(new Date(doc.subscription.currentPeriodEnd)).toEqual(paidEnd);
      expect(users.rolloverUsageIfDue).not.toHaveBeenCalled();

      // The renewal is paid: the period advances once.
      invoices.set('in_draft', { id: 'in_draft', status: 'paid', amount_due: 3899 });
      await service.handleWebhookEvent(event('evt_roll2', 'customer.subscription.updated', sub({ status: 'active', latest_invoice: 'in_draft', ...renewed }), 20));
      doc = await userDoc();
      expect(new Date(doc.subscription.currentPeriodEnd)).toEqual(new Date(1_705_200_000 * 1000));
      expect(users.rolloverUsageIfDue).toHaveBeenCalledTimes(1);
    });
  });

  // ─── h1. Upgrades apply only once paid ───────────────────────────────────────

  describe('upgrade payment', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.STARTER,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      });
      fake.subscriptions.set('sub_1', sub({ items: { data: [{ id: 'si_1', price: { id: 'price_starter_m', recurring: { interval: 'month' } } }] } }));
    });

    it('a failed proration payment leaves the plan unchanged (pending_if_incomplete)', async () => {
      fake.stripe.subscriptions.update.mockImplementation(async () =>
        sub({
          items: { data: [{ id: 'si_1', price: { id: 'price_starter_m', recurring: { interval: 'month' } } }] },
          pending_update: { subscription_items: [{ price: 'price_prof_m' }] },
        }),
      );
      const res = await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(fake.stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        expect.objectContaining({ payment_behavior: 'pending_if_incomplete', proration_behavior: 'always_invoice' }),
      );
      expect(res).toMatchObject({ plan: SubscriptionPlan.STARTER, paymentPending: true });
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.STARTER);
      // Metadata is not rewritten to the unpaid target plan.
      expect(fake.stripe.subscriptions.update).toHaveBeenCalledTimes(1);
    });

    it('a paid upgrade applies from the new price', async () => {
      fake.stripe.subscriptions.update.mockImplementation(async (_id: string, params: any) =>
        sub({ items: { data: [{ id: 'si_1', price: { id: params.items?.[0]?.price ?? 'price_prof_m', recurring: { interval: 'month' } } }] } }),
      );
      const res = await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(res.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    });

    it('stamps app_id metadata on the downgrade schedule', async () => {
      fake.subscriptions.set('sub_1', sub({ items: { data: [{ id: 'si_1', price: { id: 'price_prof_m', recurring: { interval: 'month' } } }] } }));
      await firestore.collection('users').doc('u1').update({ 'subscription.plan': SubscriptionPlan.PROFESSIONAL });
      await service.changePlan('u1', { plan: SubscriptionPlan.STARTER });
      const [, params] = fake.stripe.subscriptionSchedules.update.mock.calls[0] as any[];
      expect(params.metadata).toEqual(expect.objectContaining({ app_id: APP_ID, internal_user_id: 'u1' }));
    });
  });

  // ─── 2 + 3. Checkout coordination and trial consumption ──────────────────────

  describe('checkout coordination', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_1' });
    });

    const checkout = (plan = SubscriptionPlan.PROFESSIONAL, expectTrial?: boolean) =>
      service.createCheckoutSession('u1', { plan }, 'http://ok', 'http://cancel', expectTrial);

    it('a trial plan offers the trial without consuming eligibility, with expiry + idempotency key', async () => {
      const before = Math.floor(Date.now() / 1000);
      const res = await checkout();
      const [params, opts] = fake.stripe.checkout.sessions.create.mock.calls[0] as any[];
      expect(params.subscription_data.trial_period_days).toBe(TRIAL_PERIOD_DAYS);
      expect(params.expires_at).toBeGreaterThanOrEqual(before + 30 * 60);
      expect(params.expires_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS);
      expect(opts).toEqual({ idempotencyKey: 'flacroncv-checkout-u1-1' });
      expect((await userDoc()).subscription.hasUsedTrial).toBeUndefined();
      expect(await coordination()).toMatchObject({ status: 'open', sessionId: res.sessionId, offersTrial: true, generation: 1 });
    });

    it('a plan without a trial never sets trial_period_days and never touches eligibility', async () => {
      await checkout(SubscriptionPlan.STARTER);
      const [params] = fake.stripe.checkout.sessions.create.mock.calls[0] as any[];
      expect(params.subscription_data.trial_period_days).toBeUndefined();
      expect(fake.stripe.subscriptions.list).not.toHaveBeenCalled();
      expect(users.updateSubscription).not.toHaveBeenCalledWith('u1', expect.objectContaining({ hasUsedTrial: expect.anything() }));
      expect(await coordination()).toMatchObject({ offersTrial: false });
    });

    it('a concurrent second request is refused while the first is creating (no second session)', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const original = fake.stripe.checkout.sessions.create.getMockImplementation()!;
      fake.stripe.checkout.sessions.create.mockImplementationOnce(async (params: any, opts: any) => {
        await gate;
        return original(params, opts);
      });
      const first = checkout();
      // Let the first request take the lease.
      await new Promise((r) => setTimeout(r, 20));
      const second = checkout().catch((e) => e);
      const err = await second;
      release();
      await first;
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'CHECKOUT_IN_PROGRESS' });
      expect(fake.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it('a second request expires the previous open session BEFORE creating the replacement', async () => {
      const first = await checkout();
      const second = await checkout();
      expect(fake.stripe.checkout.sessions.expire).toHaveBeenCalledWith(first.sessionId);
      expect(fake.sessions.get(first.sessionId).status).toBe('expired');
      const expireOrder = fake.stripe.checkout.sessions.expire.mock.invocationCallOrder[0];
      const createOrder = fake.stripe.checkout.sessions.create.mock.invocationCallOrder[1];
      expect(expireOrder).toBeLessThan(createOrder);
      expect(fake.stripe.checkout.sessions.create.mock.calls[1][1]).toEqual({ idempotencyKey: 'flacroncv-checkout-u1-2' });
      // Exactly one open (trial-offering) session remains.
      expect([...fake.sessions.values()].filter((s) => s.status === 'open').map((s) => s.id)).toEqual([second.sessionId]);
      expect(await coordination()).toMatchObject({ sessionId: second.sessionId, generation: 2 });
    });

    it('if the previous session completed, its live subscription is authoritative (409, no second trial)', async () => {
      const first = await checkout();
      Object.assign(fake.sessions.get(first.sessionId), { status: 'complete', subscription: 'sub_paid' });
      fake.subscriptions.set('sub_paid', sub({ id: 'sub_paid', status: 'trialing', trial_start: 1_700_000_000 }));

      const err = await checkout().catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBSCRIBED' });
      expect(fake.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
      // The verified trial is recorded.
      expect((await userDoc()).subscription.hasUsedTrial).toBe(true);
      // The lease was released: the record is usable again.
      expect(await coordination()).toMatchObject({ status: 'idle' });
    });

    it('if expiring fails because the user just completed it, the completion wins (409)', async () => {
      const first = await checkout();
      fake.stripe.checkout.sessions.expire.mockImplementationOnce(async () => {
        Object.assign(fake.sessions.get(first.sessionId), { status: 'complete', subscription: 'sub_paid' });
        throw new Error('This Checkout Session is already complete');
      });
      fake.subscriptions.set('sub_paid', sub({ id: 'sub_paid', status: 'active' }));
      const err = await checkout().catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBSCRIBED' });
      expect(fake.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    });

    it('if the previous session cannot be expired, no replacement is created and the next request recovers', async () => {
      const first = await checkout();
      fake.stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('stripe down'));
      await expect(checkout()).rejects.toThrow('stripe down');
      expect(fake.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
      // The open record is re-resolved on the next request.
      const third = await checkout();
      expect(fake.sessions.get(first.sessionId).status).toBe('expired');
      expect(third.sessionId).not.toBe(first.sessionId);
    });

    it('takes over a lease abandoned by a crashed request and expires the session it left behind', async () => {
      fake.sessions.set('cs_orphan', { id: 'cs_orphan', status: 'open', metadata: { ...OURS, internal_user_id: 'u1' } });
      fake.sessions.set('cs_foreign', { id: 'cs_foreign', status: 'open', metadata: { ...THEIRS, internal_user_id: 'u1' } });
      await firestore.collection(CHECKOUT_COORDINATION_COLLECTION).doc('u1').set({
        uid: 'u1',
        generation: 3,
        status: 'creating',
        leaseId: 'dead',
        leaseUntil: Date.now() - 1,
        sessionId: null,
      });
      await checkout();
      expect(fake.sessions.get('cs_orphan').status).toBe('expired');
      expect(fake.sessions.get('cs_foreign').status).toBe('open'); // never another app's session
      expect(fake.stripe.checkout.sessions.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'flacroncv-checkout-u1-4' });
    });

    it('a crash after creating the customer reuses the SAME customer idempotency key on retry', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeCustomerId': null });
      users.updateSubscription.mockRejectedValueOnce(new Error('firestore down'));
      await expect(checkout()).rejects.toThrow('firestore down');
      await checkout();
      const keys = fake.stripe.customers.create.mock.calls.map((c: any[]) => c[1].idempotencyKey);
      expect(keys).toEqual(['flacroncv-customer-u1-1', 'flacroncv-customer-u1-1']);
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_new');
      expect((await coordination()).pendingCustomerKey).toBeNull();
    });

    it('an abandoned trial checkout keeps the user eligible for the trial', async () => {
      const first = await checkout(SubscriptionPlan.PROFESSIONAL, true);
      fake.sessions.get(first.sessionId).status = 'expired';
      await service.handleWebhookEvent(
        event('evt_exp', 'checkout.session.expired', { id: first.sessionId, metadata: { ...OURS, internal_user_id: 'u1' } }),
      );
      expect(await coordination()).toMatchObject({ sessionId: null, offersTrial: false, status: 'idle' });
      await checkout(SubscriptionPlan.PROFESSIONAL, true);
      const [params] = fake.stripe.checkout.sessions.create.mock.calls[1] as any[];
      expect(params.subscription_data.trial_period_days).toBe(TRIAL_PERIOD_DAYS);
    });

    it('checkout.session.expired for an old superseded session never clears the newer pending one', async () => {
      const first = await checkout();
      const second = await checkout();
      await service.handleWebhookEvent(
        event('evt_old_exp', 'checkout.session.expired', { id: first.sessionId, metadata: { ...OURS, internal_user_id: 'u1' } }),
      );
      expect(await coordination()).toMatchObject({ sessionId: second.sessionId, status: 'open', offersTrial: true });
      expect(await decision('evt_old_exp')).toBe('not_current_checkout_session');
    });

    it('checkout.session.expired from another application changes nothing', async () => {
      const first = await checkout();
      const outcome = await service.handleWebhookEvent(
        event('evt_foreign_exp', 'checkout.session.expired', { id: first.sessionId, metadata: { ...THEIRS, internal_user_id: 'u1' } }),
      );
      expect(outcome).toBe('app_mismatch');
      expect((await coordination()).sessionId).toBe(first.sessionId);
    });
  });

  // ─── 3. Trial recorded only from verified Stripe data ───────────────────────

  describe('trial consumption', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_1' });
    });

    const completed = (subscription = 'sub_1') => ({
      id: 'cs_1',
      subscription,
      customer: 'cus_1',
      payment_status: 'no_payment_required',
      metadata: { ...OURS, internal_user_id: 'u1', firebaseUid: 'u1' },
    });

    it('checkout.session.completed records the trial from OUR retrieved subscription, once across redeliveries', async () => {
      fake.subscriptions.set('sub_1', sub({ status: 'trialing', trial_start: 1_700_000_000, trial_end: 1_700_604_800 }));
      await service.handleWebhookEvent(event('evt_c1', 'checkout.session.completed', completed()));
      await service.handleWebhookEvent(event('evt_c1', 'checkout.session.completed', completed())); // redelivery
      await service.handleWebhookEvent(event('evt_c2', 'checkout.session.completed', completed())); // duplicate under another id
      const doc = await userDoc();
      expect(doc.subscription).toMatchObject({ hasUsedTrial: true, status: SubscriptionStatus.TRIALING, stripeSubscriptionId: 'sub_1' });
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('a paid (non-trial) checkout does not consume trial eligibility', async () => {
      fake.subscriptions.set('sub_1', sub({ status: 'active', trial_start: null }));
      await service.handleWebhookEvent(event('evt_paid', 'checkout.session.completed', { ...completed(), payment_status: 'paid' }));
      expect((await userDoc()).subscription.hasUsedTrial).toBeUndefined();
    });

    it('subscription.updated records a trial started on our subscription', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeSubscriptionId': 'sub_1' });
      fake.subscriptions.set('sub_1', sub({ status: 'trialing', trial_start: 1_700_000_000 }));
      await service.handleWebhookEvent(event('evt_tu', 'customer.subscription.updated', sub()));
      expect((await userDoc()).subscription.hasUsedTrial).toBe(true);
    });

    it('verifySession (no_payment_required) records the trial from the retrieved subscription', async () => {
      fake.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        ...completed(),
        subscription: sub({ status: 'trialing', trial_start: 1_700_000_000, trial_end: 1_700_604_800 }),
      } as any);
      await expect(service.verifySession('u1', 'cs_1')).resolves.toMatchObject({ status: SubscriptionStatus.TRIALING });
      expect((await userDoc()).subscription.hasUsedTrial).toBe(true);
    });

    it("verifySession rejects a subscription stamped for another application", async () => {
      fake.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        ...completed(),
        payment_status: 'paid',
        subscription: sub({ metadata: THEIRS }),
      } as any);
      await expect(service.verifySession('u1', 'cs_1')).rejects.toThrow(BadRequestException);
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
    });
  });

  // ─── 2. Duplicate live subscriptions ─────────────────────────────────────────

  describe('duplicate subscription at checkout completion', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.PROFESSIONAL,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_old',
      });
      fake.subscriptions.set('sub_old', sub({ id: 'sub_old', status: 'active' }));
    });

    const completedNew = { id: 'cs_dup', subscription: 'sub_new', customer: 'cus_1', metadata: { ...OURS, firebaseUid: 'u1' } };

    it('keeps the existing subscription and cancels an unpaid (trialing) duplicate of ours', async () => {
      fake.subscriptions.set('sub_new', sub({ id: 'sub_new', status: 'trialing', trial_start: 1 }));
      await service.handleWebhookEvent(event('evt_dup', 'checkout.session.completed', completedNew));
      expect((await userDoc()).subscription.stripeSubscriptionId).toBe('sub_old');
      expect(fake.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_new', expect.anything());
      const conflict = (await firestore.collection('billing_conflicts').doc('sub_new').get()).data() as any;
      expect(conflict).toMatchObject({
        type: 'duplicate_subscription',
        applicationId: APP_ID,
        existingSubscriptionId: 'sub_old',
        action: 'canceled_duplicate',
      });
      expect(await decision('evt_dup')).toBe('duplicate_subscription_canceled_duplicate');
    });

    it('flags a PAID duplicate for manual review instead of cancelling it', async () => {
      fake.subscriptions.set('sub_new', sub({ id: 'sub_new', status: 'active', latest_invoice: 'in_new' }));
      fake.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_new', amount_paid: 3899 });
      await service.handleWebhookEvent(event('evt_dup2', 'checkout.session.completed', completedNew));
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect((await userDoc()).subscription.stripeSubscriptionId).toBe('sub_old');
      const conflict = (await firestore.collection('billing_conflicts').doc('sub_new').get()).data() as any;
      expect(conflict.action).toBe('manual_review');
    });

    it('verifySession does not overwrite a different live subscription either', async () => {
      fake.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        ...completedNew,
        payment_status: 'paid',
        subscription: sub({ id: 'sub_new', status: 'active' }),
      } as any);
      await service.verifySession('u1', 'cs_dup');
      expect((await userDoc()).subscription.stripeSubscriptionId).toBe('sub_old');
    });

    it('replaces a stored subscription that is no longer live', async () => {
      fake.subscriptions.set('sub_old', sub({ id: 'sub_old', status: 'canceled' }));
      fake.subscriptions.set('sub_new', sub({ id: 'sub_new', status: 'active' }));
      await service.handleWebhookEvent(event('evt_rep', 'checkout.session.completed', completedNew));
      expect((await userDoc()).subscription.stripeSubscriptionId).toBe('sub_new');
    });
  });

  // ─── 4. Portal ───────────────────────────────────────────────────────────────

  describe('billing portal', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PROFESSIONAL, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    });

    it('refuses without FlacronCV’s own portal configuration (503 PORTAL_NOT_CONFIGURED)', async () => {
      build(makeConfig({ 'stripe.portalConfigurationId': undefined }));
      const err = await service.createPortalSession('u1', 'http://back').catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getResponse()).toMatchObject({ code: 'PORTAL_NOT_CONFIGURED' });
      expect(fake.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    });

    it('opens the portal with FlacronCV’s configuration for an owned customer', async () => {
      await expect(service.createPortalSession('u1', 'http://back')).resolves.toEqual({ url: 'http://portal' });
      expect(fake.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'http://back',
        configuration: 'bpc_flacroncv',
      });
    });

    it("refuses a customer stamped for another application", async () => {
      fake.stripe.customers.retrieve.mockResolvedValue({ id: 'cus_1', metadata: THEIRS } as any);
      await expect(service.createPortalSession('u1', 'http://back')).rejects.toThrow(BadRequestException);
      expect(fake.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    });

    it("refuses when the customer carries another application's subscription", async () => {
      fake.stripe.subscriptions.list.mockResolvedValue({ data: [sub(), sub({ id: 'sub_ai', metadata: THEIRS })] });
      const err = await service.createPortalSession('u1', 'http://back').catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'PORTAL_SHARED_CUSTOMER' });
      expect(fake.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    });
  });

  // ─── 5 + 6. Disputes and refunds ─────────────────────────────────────────────

  describe('disputes and refunds', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PROFESSIONAL, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    });

    const charge = (overrides: Record<string, unknown> = {}) => ({
      id: 'ch_1',
      customer: 'cus_1',
      invoice: 'in_1',
      payment_intent: 'pi_1',
      amount: 3899,
      currency: 'usd',
      livemode: false,
      metadata: { ...OURS },
      ...overrides,
    });
    const dispute = (overrides: Record<string, unknown> = {}) => ({
      id: 'dp_1',
      charge: 'ch_1',
      payment_intent: 'pi_1',
      amount: 3899,
      currency: 'usd',
      status: 'needs_response',
      reason: 'fraudulent',
      created: 1_700_000_500,
      livemode: false,
      ...overrides,
    });

    it('records the dispute in the ledger, revokes the current subscription, and updates it on close', async () => {
      fake.stripe.charges.retrieve.mockResolvedValue(charge());
      fake.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_1', subscription: 'sub_1' });

      await service.handleWebhookEvent(event('evt_dp', 'charge.dispute.created', dispute()));
      let row = (await firestore.collection('billing_disputes').doc('dp_1').get()).data() as any;
      expect(row).toMatchObject({ application_id: APP_ID, charge_id: 'ch_1', payment_id: 'pi_1', amount: 3899, status: 'needs_response' });
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(fake.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');

      expect(await service.handleWebhookEvent(event('evt_dp_closed', 'charge.dispute.closed', dispute({ status: 'lost' })))).toBe(
        'applied',
      );
      row = (await firestore.collection('billing_disputes').doc('dp_1').get()).data() as any;
      expect(row.status).toBe('lost');
    });

    it('routes a career-pack charge.dispute.closed to the career handler, never the V1 plan', async () => {
      const careerBilling = { isCareerEvent: jest.fn(async () => true), apply: jest.fn(async () => undefined) };
      const firebase = { firestore } as any;
      service = new PaymentService(makeConfig(), firebase, users, audit(), new BillingLedgerService(firebase), careerBilling as any);
      (service as any).stripe = fake.stripe;
      fake.stripe.charges.retrieve.mockResolvedValue(charge({ invoice: null }));
      const e = event('evt_pack_closed', 'charge.dispute.closed', dispute({ status: 'won' }));
      expect(await service.handleWebhookEvent(e)).toBe('applied');
      expect(careerBilling.apply).toHaveBeenCalledWith(e);
      expect((await firestore.collection('billing_disputes').doc('dp_1').get()).data()).toMatchObject({ status: 'won' });
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it("an unowned dispute writes nothing and revokes nothing", async () => {
      fake.stripe.charges.retrieve.mockResolvedValue(charge({ metadata: THEIRS }));
      const outcome = await service.handleWebhookEvent(event('evt_dp_x', 'charge.dispute.created', dispute()));
      expect(outcome).toBe('app_mismatch');
      expect((await firestore.collection('billing_disputes').doc('dp_1').get()).exists).toBe(false);
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    });

    it('a dispute on an OLD subscription’s charge does not revoke the current one', async () => {
      fake.stripe.charges.retrieve.mockResolvedValue(charge());
      fake.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_1', subscription: 'sub_old' });
      await service.handleWebhookEvent(event('evt_dp_old', 'charge.dispute.created', dispute()));
      expect((await firestore.collection('billing_disputes').doc('dp_1').get()).exists).toBe(true);
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('a full refund of an OLD subscription’s invoice does not cancel the current subscription', async () => {
      fake.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_old', subscription: 'sub_old' });
      await service.handleWebhookEvent(event('evt_rf', 'charge.refunded', charge({ invoice: 'in_old', refunded: true, amount_refunded: 3899 })));
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(await decision('evt_rf')).toBe('not_current_subscription');
    });

    it('a full refund of a charge with no invoice (not a subscription payment) revokes nothing', async () => {
      await service.handleWebhookEvent(event('evt_rf2', 'charge.refunded', charge({ invoice: null, refunded: true })));
      expect(fake.stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(await decision('evt_rf2')).toBe('charge_not_for_subscription');
    });

    it('a full refund of the CURRENT subscription’s invoice revokes it', async () => {
      fake.stripe.invoices.retrieve.mockResolvedValue({ id: 'in_1', subscription: 'sub_1' });
      await service.handleWebhookEvent(event('evt_rf3', 'charge.refunded', charge({ refunded: true })));
      expect(fake.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.FREE);
    });
  });

  // ─── 7. Untagged (pre-standard) events: verified mapping only ────────────────

  describe('untagged legacy events', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PRO, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    });

    const legacy = (overrides: Record<string, unknown> = {}) =>
      sub({ metadata: {}, items: { data: [{ price: { id: PRO_PRICE, recurring: { interval: 'month' } } }] }, ...overrides });

    it('is attributed when its subscription AND customer match one user’s stored ids', async () => {
      fake.subscriptions.set('sub_1', legacy({ status: 'past_due' }));
      const outcome = await service.handleWebhookEvent(event('evt_l1', 'customer.subscription.updated', legacy({ status: 'past_due' })));
      expect(outcome).toBe('applied');
      expect((await userDoc()).subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('stays unattributed when the customer does not match', async () => {
      const outcome = await service.handleWebhookEvent(
        event('evt_l2', 'customer.subscription.deleted', legacy({ customer: 'cus_other', status: 'canceled' })),
      );
      expect(outcome).toBe('unattributed');
      expect(users.updateSubscription).not.toHaveBeenCalled();
    });

    it('stays unattributed for a subscription id no user stores', async () => {
      const outcome = await service.handleWebhookEvent(event('evt_l3', 'customer.subscription.deleted', legacy({ id: 'sub_unknown' })));
      expect(outcome).toBe('unattributed');
    });

    it('attributes an untagged invoice through the verified subscription mapping', async () => {
      fake.subscriptions.set('sub_1', legacy());
      const outcome = await service.handleWebhookEvent(event('evt_l4', 'invoice.paid', { id: 'in_l', customer: 'cus_1', subscription: 'sub_1' }));
      expect(outcome).toBe('applied');
      const rows = (await firestore.collection('billing_invoices').get()).docs.map((d) => d.data() as any);
      expect(rows).toEqual([expect.objectContaining({ stripe_invoice_id: 'in_l', application_id: APP_ID })]);
    });

    it('a legacy-plan invoice.paid replay resets usage only once per invoice', async () => {
      fake.subscriptions.set('sub_1', legacy());
      const invoice = { id: 'in_same', customer: 'cus_1', subscription: 'sub_1' };
      await service.handleWebhookEvent(event('evt_r1', 'invoice.paid', invoice));
      await firestore.collection('users').doc('u1').update({ 'usage.aiCreditsUsed': 7 });
      await service.handleWebhookEvent(event('evt_r2', 'invoice.paid', invoice)); // same invoice, another event id
      expect((await userDoc()).usage.aiCreditsUsed).toBe(7);
      await service.handleWebhookEvent(event('evt_r3', 'invoice.paid', { ...invoice, id: 'in_next' }));
      expect((await userDoc()).usage.aiCreditsUsed).toBe(0);
    });
  });

  // ─── 8. Legacy subscriptions collection writes ───────────────────────────────

  it('lifecycle merges into `subscriptions` carry applicationId and livemode', async () => {
    await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PROFESSIONAL, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    fake.subscriptions.set('sub_1', sub({ status: 'past_due' }));
    await service.handleWebhookEvent(
      event('evt_pf', 'invoice.payment_failed', { id: 'in_f', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }),
    );
    const record = (await firestore.collection('subscriptions').doc('sub_1').get()).data() as any;
    expect(record).toMatchObject({ status: SubscriptionStatus.PAST_DUE, applicationId: APP_ID, livemode: false });
  });
  // ─── Review round 2 ──────────────────────────────────────────────────────────

  describe('ordering is per subscription and only for payload-driven handlers (R1)', () => {
    it('(A) invoice.paid processed before checkout.completed: the adopt path writes the plan, checkout still applies', async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_1' });
      fake.subscriptions.set('sub_1', sub({ metadata: { ...OURS, internal_user_id: 'u1' } }));
      await service.handleWebhookEvent(
        event('evt_paid_first', 'invoice.paid', { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }, 200),
      );
      expect((await userDoc()).subscription).toMatchObject({
        plan: SubscriptionPlan.PROFESSIONAL,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: 'sub_1',
      });
      await service.handleWebhookEvent(
        event('evt_ck_late', 'checkout.session.completed', { id: 'cs_1', subscription: 'sub_1', customer: 'cus_1', metadata: { ...OURS, firebaseUid: 'u1' } }, 100),
      );
      expect(await decision('evt_ck_late')).toBeUndefined();
      expect((await userDoc()).subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    });

    it('(B) a dunning event on the OLD subscription does not make the new checkout stale', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.STARTER, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_old' });
      fake.subscriptions.set('sub_old', sub({ id: 'sub_old', status: 'past_due' }));
      await service.handleWebhookEvent(
        event('evt_dun', 'invoice.payment_failed', { id: 'in_o', customer: 'cus_1', subscription: 'sub_old', subscription_details: { metadata: OURS } }, 300),
      );
      fake.subscriptions.set('sub_old', sub({ id: 'sub_old', status: 'canceled' }));
      fake.subscriptions.set('sub_new', sub({ id: 'sub_new' }));
      await service.handleWebhookEvent(
        event('evt_ck_new', 'checkout.session.completed', { id: 'cs_n', subscription: 'sub_new', customer: 'cus_1', metadata: { ...OURS, firebaseUid: 'u1' } }, 200),
      );
      expect((await userDoc()).subscription).toMatchObject({ stripeSubscriptionId: 'sub_new', plan: SubscriptionPlan.PROFESSIONAL });
    });

    it('(C) a newer subscription.updated does not make a retried renewal invoice.paid skip its usage reset', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PRO, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
      const legacy = sub({ items: { data: [{ price: { id: PRO_PRICE, recurring: { interval: 'month' } } }] } });
      fake.subscriptions.set('sub_1', legacy);
      await firestore.collection('users').doc('u1').update({ 'usage.aiCreditsUsed': 40 });
      await service.handleWebhookEvent(event('evt_upd_new', 'customer.subscription.updated', legacy, 300));
      await service.handleWebhookEvent(
        event('evt_renew_retry', 'invoice.paid', { id: 'in_renew', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }, 200),
      );
      expect((await userDoc()).usage.aiCreditsUsed).toBe(0);
    });

    it('a payload-driven payment_failed older than the last applied event of the SAME subscription is still skipped', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PROFESSIONAL, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
      fake.subscriptions.set('sub_1', sub());
      await service.handleWebhookEvent(event('evt_u300', 'customer.subscription.updated', sub(), 300));
      fake.subscriptions.set('sub_1', sub({ status: 'past_due' }));
      await service.handleWebhookEvent(
        event('evt_pf_old', 'invoice.payment_failed', { id: 'in_x', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }, 100),
      );
      expect(await decision('evt_pf_old')).toBe('stale_event');
      expect((await userDoc()).subscription.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('deletion is final, in any order (R2)', () => {
    it('invoice.paid adoption after the subscription was deleted is refused (tombstone)', async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_1' });
      // deleted(S) arrives while the user has no current subscription: nothing to downgrade...
      await service.handleWebhookEvent(event('evt_del_s', 'customer.subscription.deleted', sub({ status: 'canceled' })));
      expect(await decision('evt_del_s')).toBe('no_current_subscription');
      // ...then a renewal invoice.paid whose Stripe read was (racily) still live.
      fake.subscriptions.set('sub_1', sub({ status: 'active', metadata: { ...OURS, internal_user_id: 'u1' } }));
      await service.handleWebhookEvent(
        event('evt_paid_s', 'invoice.paid', { id: 'in_s', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }),
      );
      expect(await decision('evt_paid_s')).toBe('subscription_ended');
      expect((await userDoc()).subscription).toMatchObject({ plan: SubscriptionPlan.FREE });
      expect((await userDoc()).subscription.stripeSubscriptionId ?? null).toBeNull();
    });

    it('adoption is written inside the gate transaction (a deletion right after sees it as current)', async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_1' });
      fake.subscriptions.set('sub_1', sub({ metadata: { ...OURS, internal_user_id: 'u1' } }));
      await service.handleWebhookEvent(
        event('evt_adopt_tx', 'invoice.paid', { id: 'in_a', customer: 'cus_1', subscription: 'sub_1', subscription_details: { metadata: OURS } }),
      );
      await service.handleWebhookEvent(event('evt_del_after', 'customer.subscription.deleted', sub({ status: 'canceled' })));
      expect(await decision('evt_del_after')).toBeUndefined();
      expect((await userDoc()).subscription).toMatchObject({ plan: SubscriptionPlan.FREE, stripeSubscriptionId: null });
    });
  });

  describe('one customer across plan and career checkout (R3, R4)', () => {
    /** customers.create that honours idempotency keys the way Stripe does. */
    const idempotentCreate = () => {
      const byKey = new Map<string, { params: string; customer: any }>();
      let n = 0;
      return jest.fn(async (params: any, opts: any) => {
        await new Promise((r) => setTimeout(r, 5));
        const seen = byKey.get(opts.idempotencyKey);
        if (seen) {
          if (seen.params !== JSON.stringify(params)) {
            throw Object.assign(new Error('Keys for idempotent requests can only be used with the same parameters'), {
              type: 'StripeIdempotencyError',
            });
          }
          return seen.customer;
        }
        const customer = { id: `cus_${String.fromCharCode(65 + n++)}`, created: 1_700_000_000, livemode: false, metadata: { ...OURS } };
        byKey.set(opts.idempotencyKey, { params: JSON.stringify(params), customer });
        return customer;
      });
    };

    it('a concurrent plan checkout and career/pack checkout create ONE Stripe customer', async () => {
      await seedUser(firestore, 'u1');
      fake.stripe.customers.create = idempotentCreate();
      const keys = new CheckoutCoordinator(() => firestore as any);
      const [, careerCustomer] = await Promise.all([
        service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel'),
        resolveCheckoutCustomer(fake.stripe as any, {
          appId: APP_ID,
          userId: 'u1',
          email: 'u1@example.com',
          name: 'Test',
          storedCustomerId: null,
          saveCustomerId: (id) => users.updateSubscription('u1', { stripeCustomerId: id }),
          keys,
          log: { warn: () => undefined },
        }),
      ]);
      const results = await Promise.all(fake.stripe.customers.create.mock.results.map((r: any) => r.value));
      expect([...new Set(results.map((c: any) => c.id))]).toEqual(['cus_A']);
      expect(careerCustomer).toBe('cus_A');
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_A');
      expect((fake.stripe.checkout.sessions.create.mock.calls[0] as any[])[0].customer).toBe('cus_A');
    });

    it('checkout.session.completed stores the customer the subscription bills, so renewals find the user', async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_B' });
      fake.subscriptions.set('sub_1', sub({ customer: 'cus_A' }));
      await service.handleWebhookEvent(
        event('evt_ck_a', 'checkout.session.completed', { id: 'cs_a', subscription: 'sub_1', customer: 'cus_A', metadata: { ...OURS, firebaseUid: 'u1' } }),
      );
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_A');
      fake.subscriptions.set('sub_1', sub({ customer: 'cus_A', current_period_end: 1_705_200_000 }));
      await service.handleWebhookEvent(
        event('evt_renew_a', 'invoice.paid', { id: 'in_a', customer: 'cus_A', subscription: 'sub_1', subscription_details: { metadata: OURS } }),
      );
      expect(await decision('evt_renew_a')).toBeUndefined();
      expect(new Date((await userDoc()).subscription.currentPeriodEnd)).toEqual(new Date(1_705_200_000 * 1000));
    });

    it('a reused customer key is resent with its ORIGINAL parameters even after the profile changed', async () => {
      await seedUser(firestore, 'u1');
      fake.stripe.customers.create = idempotentCreate();
      users.updateSubscription.mockRejectedValueOnce(new Error('firestore down')); // crash after create
      await expect(service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel')).rejects.toThrow(
        'firestore down',
      );
      await firestore.collection('users').doc('u1').update({ email: 'changed@example.com', displayName: 'New Name' });
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel');
      const calls = fake.stripe.customers.create.mock.calls as any[];
      expect(calls.map((c) => c[1].idempotencyKey)).toEqual(['flacroncv-customer-u1-1', 'flacroncv-customer-u1-1']);
      expect(calls[1][0]).toEqual(calls[0][0]);
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_A');
    });

    it('an idempotency error from Stripe is recovered with a fresh key', async () => {
      await seedUser(firestore, 'u1');
      const create = idempotentCreate();
      fake.stripe.customers.create = jest.fn(async (params: any, opts: any) => {
        if (opts.idempotencyKey.endsWith('-1')) {
          throw Object.assign(new Error('idempotency key in use'), { type: 'StripeIdempotencyError' });
        }
        return create(params, opts);
      });
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel');
      expect((fake.stripe.customers.create.mock.calls as any[]).map((c) => c[1].idempotencyKey)).toEqual([
        'flacroncv-customer-u1-1',
        'flacroncv-customer-u1-2',
      ]);
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_A');
    });

    it('a key older than Stripe’s 24h retention is never replayed', async () => {
      await seedUser(firestore, 'u1');
      await firestore.collection(CHECKOUT_COORDINATION_COLLECTION).doc('u1').set({
        uid: 'u1',
        customerKeySeq: 4,
        pendingCustomerKey: 'flacroncv-customer-u1-4',
        pendingCustomerKeyAt: Date.now() - 25 * 60 * 60 * 1000,
        pendingCustomerEmail: 'old@example.com',
        pendingCustomerName: 'Old',
      });
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel');
      const [params, opts] = fake.stripe.customers.create.mock.calls[0] as any[];
      expect(opts.idempotencyKey).toBe('flacroncv-customer-u1-5');
      expect(params.email).toBe('u1@example.com');
    });

    it('a replayed customer that was deleted since is replaced with a fresh one', async () => {
      await seedUser(firestore, 'u1');
      await firestore.collection(CHECKOUT_COORDINATION_COLLECTION).doc('u1').set({
        uid: 'u1',
        customerKeySeq: 1,
        pendingCustomerKey: 'flacroncv-customer-u1-1',
        pendingCustomerKeyAt: Date.now() - 60_000,
        pendingCustomerEmail: 'u1@example.com',
        pendingCustomerName: 'Test',
      });
      fake.stripe.customers.create.mockImplementation(async (_p: any, opts: any) => ({
        id: opts.idempotencyKey.endsWith('-1') ? 'cus_gone' : 'cus_fresh',
        created: 1,
        livemode: false,
        metadata: { ...OURS },
      }));
      fake.stripe.customers.retrieve.mockImplementation(async (id: string) =>
        id === 'cus_gone' ? ({ id, deleted: true } as any) : ({ id, metadata: { ...OURS } } as any),
      );
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }, 'http://ok', 'http://cancel');
      expect((await userDoc()).subscription.stripeCustomerId).toBe('cus_fresh');
    });
  });

  describe('payment_failed writes the subscription’s real status (R5)', () => {
    it('a declined upgrade proration (subscription still active) does not mark the user PAST_DUE', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.STARTER, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
      fake.subscriptions.set('sub_1', sub({ status: 'active' }));
      await service.handleWebhookEvent(
        event('evt_upg_fail', 'invoice.payment_failed', {
          id: 'in_upg',
          customer: 'cus_1',
          subscription: 'sub_1',
          billing_reason: 'subscription_update',
          subscription_details: { metadata: OURS },
        }),
      );
      expect((await userDoc()).subscription.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('scheduled downgrade survives an unpaid upgrade (R6)', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.STARTER,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      });
      fake.subscriptions.set(
        'sub_1',
        sub({ schedule: 'sched_down', items: { data: [{ id: 'si_1', price: { id: 'price_starter_m', recurring: { interval: 'month' } } }] } }),
      );
    });

    it('a pending (unpaid) upgrade keeps the scheduled downgrade', async () => {
      fake.stripe.subscriptions.update.mockImplementation(async () =>
        sub({
          schedule: 'sched_down',
          items: { data: [{ id: 'si_1', price: { id: 'price_starter_m', recurring: { interval: 'month' } } }] },
          pending_update: { subscription_items: [] },
        }),
      );
      await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(fake.stripe.subscriptionSchedules.release).not.toHaveBeenCalled();
    });

    it('a paid upgrade releases the schedule only after the change applied', async () => {
      fake.stripe.subscriptions.update.mockImplementation(async (_id: string, params: any) =>
        sub({ items: { data: [{ id: 'si_1', price: { id: params.items?.[0]?.price ?? 'price_prof_m', recurring: { interval: 'month' } } }] } }),
      );
      await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(fake.stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_down');
      expect(fake.stripe.subscriptions.update.mock.invocationCallOrder[0]).toBeLessThan(
        fake.stripe.subscriptionSchedules.release.mock.invocationCallOrder[0],
      );
    });
  });

  describe('event claims are owned (R7)', () => {
    it('after a stale takeover, the original worker can neither complete nor release the new claim', async () => {
      const ledger = new BillingLedgerService({ firestore } as any);
      const evt = { id: 'evt_owned', type: 'invoice.paid', livemode: false };
      const first = await ledger.claimEventWithToken(evt);
      await firestore.collection('payment_events').doc('evt_owned').set(
        { claimedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { merge: true },
      );
      const second = await ledger.claimEventWithToken(evt);
      expect(second.claim).toBe('claimed');
      expect(second.token).not.toBe(first.token);

      const details = { applicationId: APP_ID, expectedApplicationId: APP_ID };
      expect(await ledger.completeEvent('evt_owned', 'applied', details, first.token)).toBe(false);
      await ledger.releaseEvent('evt_owned', first.token);
      const row = (await firestore.collection('payment_events').doc('evt_owned').get()).data() as any;
      expect(row).toMatchObject({ status: 'processing', claimToken: second.token });

      expect(await ledger.completeEvent('evt_owned', 'applied', details, second.token)).toBe(true);
      expect(((await firestore.collection('payment_events').doc('evt_owned').get()).data() as any).status).toBe('processed');
    });
  });

  describe('refunded totals (R8)', () => {
    const payment = (amountRefunded: number) => ({
      application_id: APP_ID,
      livemode: false,
      stripe_payment_id: 'pi_1',
      customer_id: 'cus_1',
      internal_user_id: 'u1',
      stripe_charge_id: 'ch_1',
      stripe_invoice_id: 'in_1',
      stripe_subscription_id: 'sub_1',
      amount: 10000,
      amount_refunded: amountRefunded,
      currency: 'usd',
      status: 'succeeded' as const,
      failure_message: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    it('a late charge.refunded snapshot cannot lower the refunded total (fresh refund list wins)', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_1' });
      const ledger = new BillingLedgerService({ firestore } as any);
      await ledger.upsertPayment(payment(5000));
      fake.stripe.refunds.list.mockResolvedValue({
        data: [
          { id: 're_1', amount: 3000, currency: 'usd', status: 'succeeded', payment_intent: 'pi_1', charge: 'ch_1', created: 1 },
          { id: 're_2', amount: 2000, currency: 'usd', status: 'succeeded', payment_intent: 'pi_1', charge: 'ch_1', created: 2 },
          { id: 're_3', amount: 999, currency: 'usd', status: 'failed', payment_intent: 'pi_1', charge: 'ch_1', created: 3 },
        ],
      } as any);
      await service.handleWebhookEvent(
        event('evt_old_refund', 'charge.refunded', {
          id: 'ch_1',
          payment_intent: 'pi_1',
          customer: 'cus_1',
          refunded: false,
          amount: 10000,
          amount_refunded: 3000, // the OLD snapshot
          currency: 'usd',
          livemode: false,
          metadata: OURS,
        }),
      );
      expect((await ledger.getPayment('pi_1'))?.amount_refunded).toBe(5000);
    });

    it('a payment upsert never rewrites amount_refunded on an existing row', async () => {
      const ledger = new BillingLedgerService({ firestore } as any);
      await ledger.upsertPayment(payment(5000));
      await ledger.upsertPaymentPreservingRefunds(payment(0));
      await ledger.recordPaymentIntent({
        paymentIntentId: 'pi_1',
        applicationId: APP_ID,
        livemode: false,
        amount: 10000,
        currency: 'usd',
        stripeStatus: 'succeeded',
        customerId: 'cus_1',
        internalUserId: 'u1',
        chargeId: 'ch_1',
      });
      expect((await ledger.getPayment('pi_1'))?.amount_refunded).toBe(5000);
    });
  });

  describe('deleted accounts (R9) and the trial invoice status', () => {
    it('a checkout for a deleted user is acknowledged with user_not_found, not retried', async () => {
      fake.subscriptions.set('sub_1', sub());
      const outcome = await service.handleWebhookEvent(
        event('evt_gone', 'checkout.session.completed', { id: 'cs_g', subscription: 'sub_1', customer: 'cus_1', metadata: { ...OURS, firebaseUid: 'ghost' } }),
      );
      expect(outcome).toBe('applied');
      expect(await decision('evt_gone')).toBe('user_not_found');
      expect(((await firestore.collection('payment_events').doc('evt_gone').get()).data() as any).status).toBe('processed');
    });

    it('the $0 trial-start invoice.paid records TRIALING, not ACTIVE', async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PROFESSIONAL, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
      fake.subscriptions.set('sub_1', sub({ status: 'trialing', trial_start: 1_700_000_000 }));
      await service.handleWebhookEvent(
        event('evt_trial_inv', 'invoice.paid', { id: 'in_t', customer: 'cus_1', subscription: 'sub_1', amount_paid: 0, subscription_details: { metadata: OURS } }),
      );
      expect((await userDoc()).subscription.status).toBe(SubscriptionStatus.TRIALING);
    });
  });
});
