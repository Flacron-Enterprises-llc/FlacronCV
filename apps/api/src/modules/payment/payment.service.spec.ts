import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan, SubscriptionStatus, PLAN_CONFIGS, YEARLY_BILLING_ENABLED } from '@flacroncv/shared-types';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

function makeConfig(prices: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'stripe.secretKey': '', // empty — Stripe not initialized in tests
        'stripe.webhookSecret': 'whsec_test',
        'stripe.prices': prices,
      };
      return map[key];
    }),
  } as any;
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

async function seedUser(firestore: InMemoryFirestore, uid: string, overrides: Record<string, unknown> = {}) {
  await firestore.collection('users').doc(uid).set({
    uid,
    email: `${uid}@example.com`,
    displayName: 'Test',
    subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: null },
    usage: { aiCreditsUsed: 0, aiCreditsLimit: 5, exportsThisMonth: 0 },
    ...overrides,
  });
}

/**
 * Subscription lifecycle events are written to the audit trail, so the service
 * takes an AuditService. It is a fire-and-forget dependency here — the spies let
 * a test assert an event was recorded without any of them needing to.
 */
function makeAuditService() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logUserAction: jest.fn().mockResolvedValue(undefined),
    logSystemAction: jest.fn().mockResolvedValue(undefined),
  };
}

describe('PaymentService', () => {
  let firestore: InMemoryFirestore;
  let usersService: ReturnType<typeof makeUsersService>;
  let audit: ReturnType<typeof makeAuditService>;
  let service: PaymentService;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    usersService = makeUsersService(firestore);
    audit = makeAuditService();
    service = new PaymentService(
      makeConfig(),
      makeFirebaseAdmin(firestore),
      usersService,
      audit as any,
    );
  });

  // ─── createCheckoutSession ───────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    // A real monthly plan price ID (whitelisted) — passes the guard.
    const PRO_MONTHLY = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;
    const PRO_YEARLY = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdYearly;

    // Was "rejects a non-whitelisted price (the yearly-that-bills-monthly ID)".
    // A verified year-interval price is now configured and yearly billing is on,
    // so the annual id is legitimately purchasable — asserting it is REJECTED
    // would now be asserting the feature is broken. The property that still
    // matters is that the annual id tracks the feature flag, which is covered
    // by 'admits annual price ids exactly when yearly billing is enabled'.
    it('accepts the whitelisted yearly price when yearly billing is enabled', async () => {
      if (!YEARLY_BILLING_ENABLED) return;
      await seedUser(firestore, 'uid-1');
      await expect(
        service.createCheckoutSession('uid-1', PRO_YEARLY, 'http://ok', 'http://cancel'),
      ).rejects.not.toThrow('Unsupported plan selection.');
    });

    it('rejects an arbitrary/unknown price ID', async () => {
      await seedUser(firestore, 'uid-1');
      await expect(
        service.createCheckoutSession('uid-1', 'price_arbitrary', 'http://ok', 'http://cancel'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a whitelisted monthly price (then fails later because Stripe is not configured)', async () => {
      await seedUser(firestore, 'uid-1');
      // Passes the whitelist guard, so the error is NOT the "Unsupported plan" one.
      await expect(
        service.createCheckoutSession('uid-1', PRO_MONTHLY, 'http://ok', 'http://cancel'),
      ).rejects.not.toThrow('Unsupported plan selection.');
    });

    /**
     * The server must refuse an annual purchase on its own, not because the UI
     * hides the option.
     *
     * The ids in STRIPE_*_YEARLY_PRICE_ID are named "yearly" but point at
     * MONTH-interval Stripe prices ($359.99/mo and $1,199.00/mo — verified
     * against the API). Selling either as an annual plan bills roughly 14x the
     * advertised amount. The "Coming soon" label on the pricing page is a
     * presentation choice; this whitelist is the control that actually prevents
     * the charge, and it has to hold even if that label is removed.
     */
    it.each([
      ['pro yearly', 'STRIPE_PRO_YEARLY_PRICE_ID'],
      ['enterprise yearly', 'STRIPE_ENTERPRISE_YEARLY_PRICE_ID'],
    ])('refuses to check out with the %s price id while yearly billing is off', async (_label, envKey) => {
      // Only meaningful while the feature is gated; once a real year-interval
      // price exists and the flag is on, these ids become legitimate.
      if (YEARLY_BILLING_ENABLED) return;

      const priceId = process.env[envKey] ?? PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdYearly;
      if (!priceId) return;

      await seedUser(firestore, 'uid-1');
      await expect(
        service.createCheckoutSession('uid-1', priceId, 'http://ok', 'http://cancel'),
      ).rejects.toThrow('Unsupported plan selection.');
    });

    /**
     * The UI switch and the server whitelist must be the same switch.
     *
     * Before this, `allowedCheckoutPriceIds()` was monthly-only and
     * unconditional, so turning YEARLY_BILLING_ENABLED on would have shipped a
     * pricing page selling annual plans and a server rejecting every one of
     * them. Asserting the relationship — rather than the current value — keeps
     * this true after the flag flips.
     */
    it('admits annual price ids exactly when yearly billing is enabled', async () => {
      const ids: string[] = (service as never as {
        allowedCheckoutPriceIds(): string[];
      }).allowedCheckoutPriceIds();

      const yearly = Object.values(PLAN_CONFIGS)
        .map((c) => c.stripePriceIdYearly)
        .filter(Boolean) as string[];

      for (const id of yearly) {
        expect(ids.includes(id)).toBe(YEARLY_BILLING_ENABLED);
      }
      // Monthly must be admitted either way — this is the "don't break monthly"
      // guarantee, asserted rather than assumed.
      for (const c of Object.values(PLAN_CONFIGS)) {
        if (c.stripePriceIdMonthly) expect(ids).toContain(c.stripePriceIdMonthly);
      }
    });
  });

  // ─── constructEvent ──────────────────────────────────────────────────────────

  describe('constructEvent', () => {
    it('throws when Stripe is not initialized', () => {
      expect(() => service.constructEvent(Buffer.from('{}'), 'sig')).toThrow();
    });
  });

  // ─── handleWebhookEvent (via private handlers tested through public interface) ──

  describe('handleWebhookEvent', () => {
    it('is idempotent — skips already-processed events', async () => {
      const eventId = 'evt_idempotent';
      await firestore.collection('payment_events').doc(eventId).set({
        type: 'checkout.session.completed',
        processedAt: new Date(),
      });

      const fakeEvent = {
        id: eventId,
        type: 'checkout.session.completed',
        data: { object: {} },
      } as any;

      await service.handleWebhookEvent(fakeEvent);

      // usersService methods should NOT have been called since event was already processed
      expect(usersService.updateSubscription).not.toHaveBeenCalled();
    });

    it('processes a new event and marks it as processed', async () => {
      const fakeEvent = {
        id: 'evt_new',
        type: 'unknown_event_type',
        data: { object: {} },
      } as any;

      await service.handleWebhookEvent(fakeEvent);

      const processed = await firestore.collection('payment_events').doc('evt_new').get();
      expect(processed.exists).toBe(true);
    });

    it('downgrades a paid user to free on a full charge.refunded', async () => {
      await seedUser(firestore, 'refunded-user', {
        subscription: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_refund',
          stripeSubscriptionId: 'sub_refund',
        },
      });
      (service as any).stripe = { subscriptions: { cancel: jest.fn().mockResolvedValue({}) } };

      await service.handleWebhookEvent({
        id: 'evt_refund',
        type: 'charge.refunded',
        data: { object: { refunded: true, customer: 'cus_refund' } },
      } as any);

      // Stripe subscription cancelled + user downgraded to free.
      expect((service as any).stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_refund');
      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'refunded-user',
        expect.objectContaining({ plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELED }),
      );
    });

    it('ignores a partial charge.refunded', async () => {
      await seedUser(firestore, 'partial-user', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_partial' },
      });

      await service.handleWebhookEvent({
        id: 'evt_partial',
        type: 'charge.refunded',
        data: { object: { refunded: false, amount: 1000, amount_refunded: 200, customer: 'cus_partial' } },
      } as any);

      expect(usersService.updateSubscription).not.toHaveBeenCalled();
    });

    it('revokes access on charge.dispute.created (resolving customer via the charge)', async () => {
      await seedUser(firestore, 'disputed-user', {
        subscription: {
          plan: SubscriptionPlan.ENTERPRISE,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_dispute',
          stripeSubscriptionId: 'sub_dispute',
        },
      });
      (service as any).stripe = {
        subscriptions: { cancel: jest.fn().mockResolvedValue({}) },
        charges: { retrieve: jest.fn().mockResolvedValue({ customer: 'cus_dispute' }) },
      };

      await service.handleWebhookEvent({
        id: 'evt_dispute',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_1', charge: 'ch_1' } },
      } as any);

      expect((service as any).stripe.charges.retrieve).toHaveBeenCalledWith('ch_1');
      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'disputed-user',
        expect.objectContaining({ plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELED }),
      );
    });
  });

  // ─── createPortalSession ─────────────────────────────────────────────────────

  describe('createPortalSession', () => {
    it('throws BadRequestException when user has no Stripe customer ID', async () => {
      await seedUser(firestore, 'uid-2', {
        subscription: { stripeCustomerId: null, plan: SubscriptionPlan.FREE },
      });

      await expect(
        service.createPortalSession('uid-2', 'http://return'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getInvoices ─────────────────────────────────────────────────────────────

  describe('getInvoices', () => {
    it('returns [] when Stripe is not configured', async () => {
      await seedUser(firestore, 'uid-inv', {
        subscription: { plan: SubscriptionPlan.PRO, stripeCustomerId: 'cus_x' },
      });
      // The default service has no Stripe client (empty secret key in tests).
      expect(await service.getInvoices('uid-inv')).toEqual([]);
    });

    it('returns [] (without hitting Stripe) for a user with no Stripe customer', async () => {
      await seedUser(firestore, 'uid-free', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: null },
      });
      const list = jest.fn();
      (service as any).stripe = { invoices: { list } };

      expect(await service.getInvoices('uid-free')).toEqual([]);
      expect(list).not.toHaveBeenCalled();
    });

    it('maps Stripe invoices to slim BillingInvoice summaries', async () => {
      await seedUser(firestore, 'uid-paid', {
        subscription: { plan: SubscriptionPlan.PRO, stripeCustomerId: 'cus_paid' },
      });
      const list = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'in_1',
            number: 'A1-0001',
            status: 'paid',
            amount_paid: 2999,
            amount_due: 2999,
            currency: 'usd',
            created: 1_700_000_000,
            hosted_invoice_url: 'https://stripe.test/inv/1',
            invoice_pdf: 'https://stripe.test/inv/1.pdf',
          },
        ],
      });
      (service as any).stripe = { invoices: { list } };

      const result = await service.getInvoices('uid-paid');

      expect(list).toHaveBeenCalledWith({ customer: 'cus_paid', limit: 12 });
      expect(result).toEqual([
        {
          id: 'in_1',
          number: 'A1-0001',
          status: 'paid',
          amountPaid: 2999,
          amountDue: 2999,
          currency: 'usd',
          created: new Date(1_700_000_000 * 1000).toISOString(),
          hostedInvoiceUrl: 'https://stripe.test/inv/1',
          invoicePdf: 'https://stripe.test/inv/1.pdf',
        },
      ]);
    });
  });

  // ─── subscription lifecycle (webhooks + verifySession) ───────────────────────
  // The A5 "money paths": activation, renewal, payment failure, upgrade,
  // downgrade, and cancellation. (Refund + dispute are covered in
  // handleWebhookEvent above; expired/grace access in subscription-entitlements.spec.ts.)

  describe('subscription lifecycle', () => {
    const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;
    const ENT_PRICE = PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].stripePriceIdMonthly;

    // `status` is deliberately part of the default shape. It used to be absent,
    // which passed only because the service collapsed every status to ACTIVE —
    // the very bug that let a canceled or refunded subscription be replayed as
    // live. A fixture that omits it now maps to CANCELED, as Stripe's own
    // absent/unknown status should.
    const fakeSub = (priceId: string, overrides: Record<string, unknown> = {}) => ({
      id: 'sub_test',
      status: 'active',
      items: { data: [{ price: { id: priceId, recurring: { interval: 'month' }, unit_amount: 2999 } }] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_600_000,
      currency: 'usd',
      ...overrides,
    });

    it('activates a plan on checkout.session.completed (writes user + subscription record)', async () => {
      await seedUser(firestore, 'u-checkout', {
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_ck' },
      });
      (service as any).stripe = {
        subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSub(PRO_PRICE, { id: 'sub_ck' })) },
      };

      await service.handleWebhookEvent({
        id: 'evt_ck',
        type: 'checkout.session.completed',
        data: { object: { metadata: { firebaseUid: 'u-checkout' }, subscription: 'sub_ck', customer: 'cus_ck' } },
      } as any);

      const userDoc = await firestore.collection('users').doc('u-checkout').get();
      expect((userDoc.data() as any).subscription.plan).toBe(SubscriptionPlan.PRO);
      expect((userDoc.data() as any).subscription.status).toBe(SubscriptionStatus.ACTIVE);
      const subDoc = await firestore.collection('subscriptions').doc('sub_ck').get();
      expect(subDoc.exists).toBe(true);
      expect((subDoc.data() as any).plan).toBe(SubscriptionPlan.PRO);
    });

    it('activates the plan when a redirect session is verified (verifySession)', async () => {
      await seedUser(firestore, 'u-verify', {
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_v' },
      });
      (service as any).stripe = {
        checkout: {
          sessions: {
            retrieve: jest.fn().mockResolvedValue({
              metadata: { firebaseUid: 'u-verify' },
              payment_status: 'paid',
              customer: 'cus_v',
              currency: 'usd',
              subscription: fakeSub(PRO_PRICE, { id: 'sub_v' }),
            }),
          },
        },
      };

      const res = await service.verifySession('u-verify', 'cs_test');
      expect(res).toEqual({ plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE });
      const userDoc = await firestore.collection('users').doc('u-verify').get();
      expect((userDoc.data() as any).subscription.plan).toBe(SubscriptionPlan.PRO);
    });

    it('verifySession rejects a session that belongs to another user', async () => {
      await seedUser(firestore, 'u-a');
      (service as any).stripe = {
        checkout: {
          sessions: {
            retrieve: jest.fn().mockResolvedValue({ metadata: { firebaseUid: 'someone-else' }, payment_status: 'paid' }),
          },
        },
      };
      await expect(service.verifySession('u-a', 'cs_x')).rejects.toThrow(BadRequestException);
    });

    it('verifySession rejects an unpaid session', async () => {
      await seedUser(firestore, 'u-b');
      (service as any).stripe = {
        checkout: {
          sessions: {
            retrieve: jest.fn().mockResolvedValue({ metadata: { firebaseUid: 'u-b' }, payment_status: 'unpaid' }),
          },
        },
      };
      await expect(service.verifySession('u-b', 'cs_y')).rejects.toThrow(BadRequestException);
    });

    it('renews and resets monthly usage on invoice.paid', async () => {
      await seedUser(firestore, 'u-renew', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.PAST_DUE, stripeCustomerId: 'cus_r' },
      });
      (service as any).stripe = { subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSub(PRO_PRICE)) } };

      await service.handleWebhookEvent({
        id: 'evt_paid',
        type: 'invoice.paid',
        data: { object: { subscription: 'sub_r', customer: 'cus_r' } },
      } as any);

      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'u-renew',
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      );
      expect(usersService.updateUsage).toHaveBeenCalledWith(
        'u-renew',
        expect.objectContaining({ aiCreditsUsed: 0, exportsThisMonth: 0 }),
      );
    });

    it('marks the account past_due on invoice.payment_failed', async () => {
      await seedUser(firestore, 'u-fail', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_f' },
      });

      await service.handleWebhookEvent({
        id: 'evt_fail',
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_f' } },
      } as any);

      expect(usersService.updateSubscription).toHaveBeenCalledWith('u-fail', { status: SubscriptionStatus.PAST_DUE });
    });

    it('applies an upgrade on customer.subscription.updated (PRO → ENTERPRISE)', async () => {
      await seedUser(firestore, 'u-up', {
        subscription: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_u' },
      });

      await service.handleWebhookEvent({
        id: 'evt_up',
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_u',
            status: 'active',
            cancel_at_period_end: false,
            current_period_end: 1_702_600_000,
            items: { data: [{ price: { id: ENT_PRICE } }] },
          },
        },
      } as any);

      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'u-up',
        expect.objectContaining({ plan: SubscriptionPlan.ENTERPRISE, status: 'active' }),
      );
    });

    it('applies a downgrade on customer.subscription.updated (ENTERPRISE → PRO)', async () => {
      await seedUser(firestore, 'u-down', {
        subscription: { plan: SubscriptionPlan.ENTERPRISE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_d' },
      });

      await service.handleWebhookEvent({
        id: 'evt_down',
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_d',
            status: 'active',
            cancel_at_period_end: false,
            current_period_end: 1_702_600_000,
            items: { data: [{ price: { id: PRO_PRICE } }] },
          },
        },
      } as any);

      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'u-down',
        expect.objectContaining({ plan: SubscriptionPlan.PRO }),
      );
    });

    it('downgrades to free on customer.subscription.deleted (cancellation)', async () => {
      await seedUser(firestore, 'u-cancel', {
        subscription: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_x2',
          stripeSubscriptionId: 'sub_x2',
        },
      });

      await service.handleWebhookEvent({
        id: 'evt_del',
        type: 'customer.subscription.deleted',
        data: { object: { customer: 'cus_x2' } },
      } as any);

      expect(usersService.updateSubscription).toHaveBeenCalledWith(
        'u-cancel',
        expect.objectContaining({
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.CANCELED,
          stripeSubscriptionId: null,
        }),
      );
      expect(usersService.updateUsage).toHaveBeenCalledWith(
        'u-cancel',
        expect.objectContaining({ aiCreditsLimit: PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits }),
      );
    });
  });

  // ─── free trial ──────────────────────────────────────────────────────────────

  describe('free trial', () => {
    const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;

    it('does NOT re-offer a trial to a customer who has subscribed before', async () => {
      // The abuse this blocks: revoking access nulls stripeSubscriptionId, so
      // "have they ever subscribed?" answered no after every cancellation and
      // the same person could take a fresh 7-day trial forever.
      await seedUser(firestore, 'u-repeat', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_repeat', stripeSubscriptionId: null },
      });
      const create = jest.fn().mockResolvedValue({ id: 'cs_2', url: 'https://stripe.test/cs_2' });
      (service as any).stripe = {
        checkout: { sessions: { create } },
        subscriptions: { list: jest.fn().mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled' }] }) },
      };

      await service.createCheckoutSession('u-repeat', PRO_PRICE, 'http://ok', 'http://cancel');

      expect(create).toHaveBeenCalledWith(
        expect.not.objectContaining({ subscription_data: expect.anything() }),
      );
    });

    it('withholds the trial when Stripe cannot confirm eligibility', async () => {
      await seedUser(firestore, 'u-err', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_err', stripeSubscriptionId: null },
      });
      const create = jest.fn().mockResolvedValue({ id: 'cs_3', url: 'https://stripe.test/cs_3' });
      (service as any).stripe = {
        checkout: { sessions: { create } },
        subscriptions: { list: jest.fn().mockRejectedValue(new Error('stripe down')) },
      };

      await service.createCheckoutSession('u-err', PRO_PRICE, 'http://ok', 'http://cancel');

      // Fail closed — an outage must not become a free-trial dispenser.
      expect(create).toHaveBeenCalledWith(
        expect.not.objectContaining({ subscription_data: expect.anything() }),
      );
    });
  });

  describe('checkout session replay', () => {
    const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;

    /**
     * A Checkout Session is immutable: once completed it reports
     * payment_status:'paid' forever, and its id sits in the browser history
     * because the success URL carries it. Re-posting that id used to re-run the
     * grant, restoring a full paid plan after a refund, chargeback or
     * cancellation — reversing every revocation path in the service.
     */
    const replay = (subStatus: string) => {
      (service as any).stripe = {
        checkout: {
          sessions: {
            retrieve: jest.fn().mockResolvedValue({
              metadata: { firebaseUid: 'u-replay' },
              payment_status: 'paid',
              customer: 'cus_replay',
              currency: 'usd',
              subscription: {
                id: 'sub_replay',
                status: subStatus,
                items: { data: [{ price: { id: PRO_PRICE, recurring: { interval: 'month' }, unit_amount: 2999 } }] },
                current_period_start: 1_700_000_000,
                current_period_end: 1_702_600_000,
                currency: 'usd',
              },
            }),
          },
        },
      };
      return service.verifySession('u-replay', 'cs_replayed');
    };

    it.each(['canceled', 'unpaid', 'incomplete_expired', 'past_due'])(
      'refuses to re-grant a plan from a %s subscription',
      async (subStatus) => {
        await seedUser(firestore, 'u-replay', {
          subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELED, stripeCustomerId: 'cus_replay' },
        });

        await expect(replay(subStatus)).rejects.toThrow(/no longer active/i);

        const doc = await firestore.collection('users').doc('u-replay').get();
        expect((doc.data() as any).subscription.plan).toBe(SubscriptionPlan.FREE);
      },
    );

    it('still applies a genuinely live subscription', async () => {
      await seedUser(firestore, 'u-replay', {
        subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.CANCELED, stripeCustomerId: 'cus_replay' },
      });

      await expect(replay('active')).resolves.toEqual({
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
      });
    });
  });

  describe('free trial (legacy grouping)', () => {
    const PRO_PRICE = PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly;

    it('applies trial_period_days on checkout for a first-time subscriber', async () => {
      await seedUser(firestore, 'u-trial', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_t' }, // has customer, never subscribed
      });
      const create = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' });
      (service as any).stripe = {
        checkout: { sessions: { create } },
        // Trial eligibility is now decided from the customer's Stripe
        // subscription history, not from our own stripeSubscriptionId field —
        // that field is nulled on cancel, so it reset the guard and handed out
        // a fresh 7-day trial on every re-subscribe. Empty list = never subscribed.
        subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }) },
      };

      await service.createCheckoutSession('u-trial', PRO_PRICE, 'http://ok', 'http://cancel');

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_data: { trial_period_days: 7 } }),
      );
    });

    it('does NOT offer a trial to a returning subscriber (anti-abuse)', async () => {
      await seedUser(firestore, 'u-ret', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_r', stripeSubscriptionId: 'sub_old' },
      });
      const create = jest.fn().mockResolvedValue({ id: 'cs_2', url: 'x' });
      (service as any).stripe = { checkout: { sessions: { create } } };

      await service.createCheckoutSession('u-ret', PRO_PRICE, 'http://ok', 'http://cancel');

      expect(create.mock.calls[0][0].subscription_data).toBeUndefined();
    });

    it('records a TRIALING subscription when a trial checkout is verified (no immediate payment)', async () => {
      await seedUser(firestore, 'u-vt', {
        subscription: { plan: SubscriptionPlan.FREE, stripeCustomerId: 'cus_vt' },
      });
      (service as any).stripe = {
        checkout: {
          sessions: {
            retrieve: jest.fn().mockResolvedValue({
              metadata: { firebaseUid: 'u-vt' },
              payment_status: 'no_payment_required', // trial → nothing charged yet
              customer: 'cus_vt',
              currency: 'usd',
              subscription: {
                id: 'sub_vt',
                status: 'trialing',
                items: { data: [{ price: { id: PRO_PRICE, recurring: { interval: 'month' }, unit_amount: 2999 } }] },
                current_period_start: 1_700_000_000,
                current_period_end: 1_700_604_800,
                trial_start: 1_700_000_000,
                trial_end: 1_700_604_800,
                currency: 'usd',
              },
            }),
          },
        },
      };

      const res = await service.verifySession('u-vt', 'cs_vt');

      expect(res).toEqual({ plan: SubscriptionPlan.PRO, status: SubscriptionStatus.TRIALING });
      const userDoc = await firestore.collection('users').doc('u-vt').get();
      expect((userDoc.data() as any).subscription.status).toBe(SubscriptionStatus.TRIALING);
      expect((userDoc.data() as any).subscription.trialEnd).toBeTruthy();
    });
  });
});
