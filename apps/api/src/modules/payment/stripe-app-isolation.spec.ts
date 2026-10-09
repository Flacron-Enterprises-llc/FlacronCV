import { BadRequestException } from '@nestjs/common';
import { PaymentService, StripeEventInProgressError } from './payment.service';
import { BillingLedgerService } from './billing-ledger.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

/**
 * The Flacron Stripe standard, end to end through PaymentService: one Stripe
 * account shared by every Flacron app, so FlacronCV must stamp its own
 * objects, apply only its own events, and record every money movement with
 * its application_id — exactly once.
 */

const APP_ID = 'flacron-cv';
const OURS = { app_id: APP_ID };
const THEIRS = { app_id: 'flacron-ai' };
const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;

function makeConfig() {
  const map: Record<string, unknown> = {
    // A test-mode restricted key: the client is built but never reaches the network.
    'stripe.secretKey': 'rk_test_dummy',
    'stripe.webhookSecret': 'whsec_test',
    'stripe.prices': {},
    'stripe.appId': APP_ID,
  };
  return { get: jest.fn((key: string) => map[key]) } as any;
}

function makeUsersService(firestore: InMemoryFirestore) {
  return {
    findByIdOrThrow: jest.fn(async (uid: string) => {
      const doc = await firestore.collection('users').doc(uid).get();
      if (!doc.exists) throw new Error('User not found');
      return doc.data();
    }),
    updateSubscription: jest.fn().mockResolvedValue(undefined),
    updateUsage: jest.fn().mockResolvedValue(undefined),
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
  items: { data: [{ price: { id: PRO_PRICE, recurring: { interval: 'month' }, unit_amount: 2999 }, quantity: 1 }] },
  current_period_start: 1_700_000_000,
  current_period_end: 1_702_600_000,
  created: 1_700_000_000,
  currency: 'usd',
  ...overrides,
});

const event = (id: string, type: string, object: Record<string, unknown>, livemode = false) =>
  ({ id, type, livemode, data: { object } }) as any;

describe('Stripe app isolation (Flacron Stripe standard)', () => {
  let firestore: InMemoryFirestore;
  let usersService: ReturnType<typeof makeUsersService>;
  let service: PaymentService;
  let ledger: BillingLedgerService;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    usersService = makeUsersService(firestore);
    const firebase = { firestore } as any;
    ledger = new BillingLedgerService(firebase);
    service = new PaymentService(makeConfig(), firebase, usersService, audit(), ledger);
  });

  const docs = async (collection: string) => (await firestore.collection(collection).get()).docs.map((d) => d.data() as any);

  // ─── Outbound: every object FlacronCV creates carries its app_id ────────────

  describe('checkout', () => {
    function installStripe(priceMetadata: Record<string, string> = OURS, existingCustomer?: Record<string, unknown>) {
      const stripe = {
        prices: {
          retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: priceMetadata })),
        },
        customers: {
          retrieve: jest.fn(async (id: string) => ({ id, ...(existingCustomer ?? {}) })),
          create: jest.fn(async () => ({ id: 'cus_new', created: 1_700_000_000, livemode: false })),
          update: jest.fn(async () => ({})),
        },
        subscriptions: { list: jest.fn(async () => ({ data: [] })) },
        checkout: { sessions: { create: jest.fn(async (_params: any) => ({ id: 'cs_1', url: 'http://checkout' })) } },
      };
      (service as any).stripe = stripe;
      return stripe;
    }

    it('stamps app_id + internal_user_id on the customer, the session and the subscription', async () => {
      await seedUser(firestore, 'u1');
      const stripe = installStripe();

      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://cancel');

      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ app_id: APP_ID, internal_user_id: 'u1' }) }),
      );
      const params = stripe.checkout.sessions.create.mock.calls[0][0];
      expect(params.client_reference_id).toBe('u1');
      expect(params.metadata).toEqual(expect.objectContaining({ app_id: APP_ID, internal_user_id: 'u1' }));
      expect(params.subscription_data.metadata).toEqual(
        expect.objectContaining({ app_id: APP_ID, internal_user_id: 'u1' }),
      );
      const customers = await docs('billing_customers');
      expect(customers).toEqual([expect.objectContaining({ stripe_customer_id: 'cus_new', application_id: APP_ID })]);
    });

    it("refuses to sell another application's price", async () => {
      await seedUser(firestore, 'u1');
      const stripe = installStripe(THEIRS);

      await expect(
        service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('refuses an unstamped price (it could belong to anyone on the account)', async () => {
      await seedUser(firestore, 'u1');
      const stripe = installStripe({});

      await expect(
        service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://cancel'),
      ).rejects.toThrow('Unsupported plan selection.');
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("never reuses a stored customer that belongs to another application", async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_foreign' });
      const stripe = installStripe(OURS, { metadata: THEIRS });

      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://cancel');

      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
      expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe('cus_new');
    });

    it('claims a pre-standard customer for FlacronCV instead of replacing it', async () => {
      await seedUser(firestore, 'u1', { stripeCustomerId: 'cus_legacy' });
      const stripe = installStripe(OURS, { metadata: { firebaseUid: 'u1' } });

      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://cancel');

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.customers.update).toHaveBeenCalledWith('cus_legacy', {
        metadata: expect.objectContaining({ app_id: APP_ID, firebaseUid: 'u1' }),
      });
    });
  });

  it('verifySession rejects a session stamped for another application', async () => {
    await seedUser(firestore, 'u1');
    (service as any).stripe = {
      checkout: {
        sessions: {
          retrieve: jest.fn(async () => ({
            metadata: { firebaseUid: 'u1', ...THEIRS },
            payment_status: 'paid',
            subscription: sub(),
          })),
        },
      },
    };
    await expect(service.verifySession('u1', 'cs_x')).rejects.toThrow('Session does not belong to this application');
    expect(usersService.updateSubscription).not.toHaveBeenCalled();
  });

  // ─── Inbound: only FlacronCV's events are applied ───────────────────────────

  describe('webhook attribution', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', {
        plan: SubscriptionPlan.PRO,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      });
    });

    it("blocks and records another application's event (app_id mismatch)", async () => {
      const outcome = await service.handleWebhookEvent(
        event('evt_foreign', 'customer.subscription.updated', sub({ metadata: THEIRS, status: 'canceled' })),
      );

      expect(outcome).toBe('app_mismatch');
      expect(usersService.updateSubscription).not.toHaveBeenCalled();
      expect(await docs('billing_subscriptions')).toEqual([]);
      const recorded = (await firestore.collection('payment_events').doc('evt_foreign').get()).data() as any;
      expect(recorded).toMatchObject({
        status: 'processed',
        outcome: 'app_mismatch',
        application_id: 'flacron-ai',
        expected_application_id: APP_ID,
      });
    });

    it('does not assume an unstamped object is ours', async () => {
      const outcome = await service.handleWebhookEvent(
        event('evt_bare', 'customer.subscription.deleted', sub({ metadata: {} })),
      );
      expect(outcome).toBe('unattributed');
      expect(usersService.updateSubscription).not.toHaveBeenCalled();
    });

    it('does not apply an event from the other Stripe mode', async () => {
      const outcome = await service.handleWebhookEvent(
        event('evt_live', 'customer.subscription.deleted', sub(), /* livemode */ true),
      );
      expect(outcome).toBe('mode_mismatch');
      expect(usersService.updateSubscription).not.toHaveBeenCalled();
    });

    it('resolves an invoice through its subscription when the invoice carries no app_id', async () => {
      const retrieve = jest.fn(async () => sub({ metadata: THEIRS }));
      (service as any).stripe = { subscriptions: { retrieve } };

      const outcome = await service.handleWebhookEvent(
        event('evt_inv_foreign', 'invoice.paid', { id: 'in_1', customer: 'cus_1', subscription: 'sub_1' }),
      );

      expect(retrieve).toHaveBeenCalledWith('sub_1');
      expect(outcome).toBe('app_mismatch');
      expect(await docs('billing_payments')).toEqual([]);
    });
  });

  // ─── Idempotency ────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.PRO, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    });

    it('processes a redelivered event once', async () => {
      const e = event('evt_dup', 'customer.subscription.updated', sub({ status: 'past_due' }));
      expect(await service.handleWebhookEvent(e)).toBe('applied');
      expect(await service.handleWebhookEvent(e)).toBe('duplicate');
      expect(usersService.updateSubscription).toHaveBeenCalledTimes(1);
    });

    it('releases the claim when processing fails, so Stripe’s retry is applied', async () => {
      const e = event('evt_retry', 'customer.subscription.updated', sub({ status: 'past_due' }));
      usersService.updateSubscription.mockRejectedValueOnce(new Error('firestore down'));

      await expect(service.handleWebhookEvent(e)).rejects.toThrow('firestore down');
      expect((await firestore.collection('payment_events').doc('evt_retry').get()).exists).toBe(false);

      expect(await service.handleWebhookEvent(e)).toBe('applied');
    });

    it('refuses a concurrent delivery while the first is still processing', async () => {
      await firestore.collection('payment_events').doc('evt_busy').set({ status: 'processing', claimedAt: new Date() });
      await expect(
        service.handleWebhookEvent(event('evt_busy', 'customer.subscription.updated', sub())),
      ).rejects.toBeInstanceOf(StripeEventInProgressError);
    });

    it('takes over a claim abandoned by a crashed task', async () => {
      const stale = new Date(Date.now() - 60 * 60 * 1000);
      await firestore.collection('payment_events').doc('evt_stale').set({ status: 'processing', claimedAt: stale });
      expect(await service.handleWebhookEvent(event('evt_stale', 'customer.subscription.updated', sub()))).toBe('applied');
    });

    it('treats an event recorded before claims existed as already processed', async () => {
      await firestore.collection('payment_events').doc('evt_legacy').set({ type: 'invoice.paid', processedAt: new Date() });
      expect(await service.handleWebhookEvent(event('evt_legacy', 'customer.subscription.updated', sub()))).toBe('duplicate');
    });
  });

  // ─── Ledger: payments, failures, refunds ────────────────────────────────────

  describe('ledger', () => {
    beforeEach(async () => {
      await seedUser(firestore, 'u1', { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_1' });
    });

    const paymentIntent = (overrides: Record<string, unknown> = {}) => ({
      id: 'pi_1',
      status: 'succeeded',
      amount: 2999,
      amount_received: 2999,
      currency: 'usd',
      customer: 'cus_1',
      latest_charge: 'ch_1',
      livemode: false,
      created: 1_700_000_100,
      metadata: {},
      ...overrides,
    });

    it('records a renewal payment with application_id and stamps the PaymentIntent', async () => {
      const update = jest.fn(async (_id: string, params: any) => paymentIntent({ metadata: params.metadata }));
      (service as any).stripe = {
        subscriptions: { retrieve: jest.fn(async () => sub()) },
        paymentIntents: { retrieve: jest.fn(async () => paymentIntent()), update },
      };

      await service.handleWebhookEvent(
        event('evt_paid', 'invoice.paid', {
          id: 'in_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          subscription_details: { metadata: OURS },
          payment_intent: 'pi_1',
          status: 'paid',
          amount_due: 2999,
          amount_paid: 2999,
          currency: 'usd',
          billing_reason: 'subscription_cycle',
          livemode: false,
        }),
      );

      expect(update).toHaveBeenCalledWith('pi_1', {
        metadata: expect.objectContaining({ app_id: APP_ID, internal_user_id: 'u1', stripe_invoice_id: 'in_1' }),
      });
      expect(await docs('billing_payments')).toEqual([
        expect.objectContaining({
          stripe_payment_id: 'pi_1',
          application_id: APP_ID,
          customer_id: 'cus_1',
          amount: 2999,
          currency: 'usd',
          status: 'succeeded',
          stripe_invoice_id: 'in_1',
        }),
      ]);
      expect(await docs('billing_invoices')).toEqual([
        expect.objectContaining({ stripe_invoice_id: 'in_1', application_id: APP_ID, payment_id: 'pi_1' }),
      ]);
      expect(await docs('billing_subscriptions')).toEqual([
        expect.objectContaining({
          stripe_subscription_id: 'sub_1',
          application_id: APP_ID,
          stripe_customer_id: 'cus_1',
          plan: SubscriptionPlan.PRO,
          status: 'active',
          amount: 2999,
        }),
      ]);
    });

    it('records a declined payment as failed, does not grant paid access, and keeps its app_id', async () => {
      (service as any).stripe = {
        paymentIntents: {
          retrieve: jest.fn(async () =>
            paymentIntent({
              status: 'requires_payment_method',
              amount_received: 0,
              metadata: OURS,
              last_payment_error: { message: 'Your card was declined.' },
            }),
          ),
        },
      };

      await service.handleWebhookEvent(
        event('evt_failed', 'invoice.payment_failed', {
          id: 'in_2',
          customer: 'cus_1',
          subscription: 'sub_1',
          subscription_details: { metadata: OURS },
          payment_intent: 'pi_1',
          status: 'open',
          amount_due: 2999,
          amount_paid: 0,
          currency: 'usd',
        }),
      );

      expect(await docs('billing_payments')).toEqual([
        expect.objectContaining({
          application_id: APP_ID,
          status: 'failed',
          failure_message: 'Your card was declined.',
        }),
      ]);
      expect(usersService.updateSubscription).toHaveBeenCalledWith('u1', { status: SubscriptionStatus.PAST_DUE });
      expect(usersService.updateSubscription).not.toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      );
      const report = await ledger.revenueReport(APP_ID, false);
      expect(report.failed_payments).toBe(1);
      expect(report.totals.find((t) => t.currency === 'usd')?.gross_revenue ?? 0).toBe(0);
    });

    it('records a partial refund against the payment and nets it in the report', async () => {
      await ledger.upsertPayment({
        application_id: APP_ID,
        livemode: false,
        stripe_payment_id: 'pi_1',
        customer_id: 'cus_1',
        internal_user_id: 'u1',
        stripe_charge_id: 'ch_1',
        stripe_invoice_id: 'in_1',
        stripe_subscription_id: 'sub_1',
        amount: 10000,
        amount_refunded: 0,
        currency: 'usd',
        status: 'succeeded',
        failure_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      (service as any).stripe = {
        refunds: {
          list: jest.fn(async () => ({
            data: [
              { id: 're_1', amount: 3000, currency: 'usd', status: 'succeeded', payment_intent: 'pi_1', charge: 'ch_1', created: 1_700_000_200 },
            ],
          })),
        },
      };

      const outcome = await service.handleWebhookEvent(
        event('evt_refund', 'charge.refunded', {
          id: 'ch_1',
          payment_intent: 'pi_1',
          customer: 'cus_1',
          refunded: false,
          amount: 10000,
          amount_refunded: 3000,
          currency: 'usd',
          livemode: false,
        }),
      );

      // The charge has no metadata; it is attributed through our own payment row.
      expect(outcome).toBe('applied');
      expect(await docs('billing_refunds')).toEqual([
        expect.objectContaining({ stripe_refund_id: 're_1', application_id: APP_ID, payment_id: 'pi_1', amount: 3000 }),
      ]);
      const report = await ledger.revenueReport(APP_ID, false);
      expect(report.totals[0]).toMatchObject({ gross_revenue: 10000, refunds: 3000, net_revenue: 7000 });
      // A partial refund keeps access.
      expect(usersService.updateSubscription).not.toHaveBeenCalled();
    });
  });
});
