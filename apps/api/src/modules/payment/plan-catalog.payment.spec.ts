import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { currentPlanForPriceId, currentPlanPricesFromEnv, publicPlanCatalog } from './plan-prices';
import { isNativeMobileRequest } from './legacy-mobile-checkout';

/**
 * Five-plan catalog billing, and the legacy paths that must keep working for
 * existing paying customers (Pro / Career Accelerator / Enterprise).
 */
const OUR_METADATA = { app_id: 'flacron-cv' };
const PLAN_PRICES = {
  starter: { month: 'price_starter_m', year: 'price_starter_y' },
  professional: { month: 'price_prof_m', year: 'price_prof_y' },
  business: { month: 'price_business_m' },
  // career_pro deliberately unset.
};

function makeConfig(planPrices: unknown = PLAN_PRICES) {
  const map: Record<string, unknown> = {
    'stripe.secretKey': '',
    'stripe.webhookSecret': 'whsec_test',
    'stripe.prices': {},
    'stripe.planPrices': planPrices,
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
    rolloverUsageIfDue: jest.fn().mockResolvedValue(true),
  } as any;
}

const audit = { log: jest.fn(), logUserAction: jest.fn(), logSystemAction: jest.fn().mockResolvedValue(undefined) };

const fakeSub = (priceId: string, overrides: Record<string, unknown> = {}) => ({
  id: 'sub_test',
  status: 'active',
  items: { data: [{ price: { id: priceId, recurring: { interval: 'month' }, unit_amount: 3899 } }] },
  current_period_start: 1_700_000_000,
  current_period_end: 1_702_600_000,
  cancel_at_period_end: false,
  currency: 'usd',
  customer: 'cus_1',
  metadata: { ...OUR_METADATA },
  ...overrides,
});

describe('PaymentService — five-plan catalog', () => {
  let firestore: InMemoryFirestore;
  let users: ReturnType<typeof makeUsersService>;
  let service: PaymentService;

  beforeEach(async () => {
    firestore = new InMemoryFirestore();
    users = makeUsersService(firestore);
    service = new PaymentService(makeConfig(), { firestore } as any, users, audit as any);
    await firestore.collection('users').doc('u1').set({
      uid: 'u1',
      email: 'u1@example.com',
      subscription: { plan: SubscriptionPlan.FREE, status: SubscriptionStatus.ACTIVE, stripeCustomerId: 'cus_1' },
      usage: { aiCreditsUsed: 0, aiCreditsLimit: 3 },
    });
  });

  describe('checkout', () => {
    it.each([SubscriptionPlan.PRO, SubscriptionPlan.CAREER_ACCELERATOR, SubscriptionPlan.ENTERPRISE])(
      'refuses a NEW checkout for legacy %s (PLAN_NOT_AVAILABLE)',
      async (plan) => {
        const err: any = await service.createCheckoutSession('u1', { plan }).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_AVAILABLE' });
      },
    );

    describe('live mobile app compatibility (legacy Pro / Enterprise)', () => {
      const stripeWith = (create: jest.Mock, list: jest.Mock = jest.fn().mockResolvedValue({ data: [] })) => ({
        prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: OUR_METADATA })) },
        customers: { retrieve: jest.fn(async (id: string) => ({ id, metadata: OUR_METADATA })) },
        subscriptions: { list },
        checkout: { sessions: { create } },
      });

      it('sells legacy Pro to the native mobile app at the legacy price, with its old first-time trial', async () => {
        const create = jest.fn().mockResolvedValue({ id: 'cs_m', url: 'https://checkout' });
        (service as any).stripe = stripeWith(create);
        await service.createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, undefined, undefined, false, {
          nativeMobile: true,
        });
        const args = create.mock.calls[0][0];
        expect(args.line_items).toEqual([{ price: PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly, quantity: 1 }]);
        expect(args.metadata.plan).toBe(SubscriptionPlan.PRO);
        expect(args.subscription_data.trial_period_days).toBe(7);
        // The webhook grants the plan from that price id: legacy Pro, unchanged.
        expect((service as any).determinePlan(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly)).toBe(
          SubscriptionPlan.PRO,
        );
      });

      it('sells legacy Enterprise to the native mobile app with no trial', async () => {
        const create = jest.fn().mockResolvedValue({ id: 'cs_e', url: 'https://checkout' });
        (service as any).stripe = stripeWith(create);
        await service.createCheckoutSession('u1', { plan: SubscriptionPlan.ENTERPRISE }, undefined, undefined, false, {
          nativeMobile: true,
        });
        const args = create.mock.calls[0][0];
        expect(args.line_items).toEqual([
          { price: PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].stripePriceIdMonthly, quantity: 1 },
        ]);
        expect(args.subscription_data.trial_period_days).toBeUndefined();
      });

      it('still refuses Career Accelerator to the mobile app (it never offered it)', async () => {
        const err: any = await service
          .createCheckoutSession('u1', { plan: SubscriptionPlan.CAREER_ACCELERATOR }, undefined, undefined, false, {
            nativeMobile: true,
          })
          .catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_AVAILABLE' });
      });

      it('still refuses legacy Pro to the web', async () => {
        const err: any = await service
          .createCheckoutSession('u1', { plan: SubscriptionPlan.PRO }, 'http://ok', 'http://no', false, {
            nativeMobile: false,
          })
          .catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_AVAILABLE' });
      });

      it('identifies the native app by X-Device-Token without a browser Origin', () => {
        expect(isNativeMobileRequest({ 'x-device-token': 'dev-1' })).toBe(true);
        // The web app sends X-Device-Token too, but a browser always sends Origin on a POST.
        expect(isNativeMobileRequest({ 'x-device-token': 'dev-1', origin: 'https://flacroncv.com' })).toBe(false);
        expect(isNativeMobileRequest({})).toBe(false);
        expect(isNativeMobileRequest({ 'x-device-token': '  ' })).toBe(false);
      });
    });

    it('answers 503 PLAN_NOT_CONFIGURED for a current plan whose price env is unset (never guesses an id)', async () => {
      const err: any = await service.createCheckoutSession('u1', { plan: SubscriptionPlan.CAREER_PRO }).catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.getStatus()).toBe(503);
      expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_CONFIGURED' });
    });

    it('PLAN_NOT_CONFIGURED for an unset annual price too', async () => {
      const err: any = await service
        .createCheckoutSession('u1', { plan: SubscriptionPlan.BUSINESS, interval: 'year' })
        .catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_CONFIGURED' });
    });

    it('Free is not a checkout', async () => {
      await expect(service.createCheckoutSession('u1', { plan: SubscriptionPlan.FREE })).rejects.toThrow(
        'Unsupported plan selection.',
      );
    });

    it('refuses a second subscription for a live Stripe subscriber (no double billing)', async () => {
      await firestore.collection('users').doc('u1').update({
        subscription: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_live',
          currentPeriodEnd: new Date(Date.now() + 10 * 86400000),
        },
      });
      (service as any).stripe = {
        prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: OUR_METADATA })) },
      };
      const err: any = await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ code: 'ALREADY_SUBSCRIBED' });
    });

    it('sells Professional at the env price with the catalog 7-day trial for a first-time subscriber', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout' });
      (service as any).stripe = {
        prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: OUR_METADATA })) },
        customers: { retrieve: jest.fn(async (id: string) => ({ id, metadata: OUR_METADATA })) },
        subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }) },
        checkout: { sessions: { create } },
      };
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.PROFESSIONAL }, 'http://ok', 'http://no');
      const args = create.mock.calls[0][0];
      expect(args.line_items).toEqual([{ price: 'price_prof_m', quantity: 1 }]);
      expect(args.subscription_data.trial_period_days).toBe(7);
      expect(args.metadata.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    });

    it('Starter has no trial', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'cs_2', url: 'https://checkout' });
      (service as any).stripe = {
        prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: OUR_METADATA })) },
        customers: { retrieve: jest.fn(async (id: string) => ({ id, metadata: OUR_METADATA })) },
        subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }) },
        checkout: { sessions: { create } },
      };
      await service.createCheckoutSession('u1', { plan: SubscriptionPlan.STARTER, interval: 'yearly' }, 'http://ok', 'http://no');
      const args = create.mock.calls[0][0];
      expect(args.line_items).toEqual([{ price: 'price_starter_y', quantity: 1 }]);
      expect(args.subscription_data.trial_period_days).toBeUndefined();
    });
  });

  describe('price id → plan (webhooks never trust metadata)', () => {
    const determine = (s: PaymentService, priceId: string) => (s as any).determinePlan(priceId);

    it('maps every configured current price to its plan', () => {
      expect(determine(service, 'price_starter_m')).toBe(SubscriptionPlan.STARTER);
      expect(determine(service, 'price_starter_y')).toBe(SubscriptionPlan.STARTER);
      expect(determine(service, 'price_prof_y')).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(determine(service, 'price_business_m')).toBe(SubscriptionPlan.BUSINESS);
    });

    it('still maps the LEGACY compiled and env price ids', () => {
      expect(determine(service, PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly)).toBe(SubscriptionPlan.PRO);
      expect(determine(service, PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdYearly)).toBe(SubscriptionPlan.PRO);
      expect(determine(service, PLAN_CONFIGS[SubscriptionPlan.ENTERPRISE].stripePriceIdMonthly)).toBe(
        SubscriptionPlan.ENTERPRISE,
      );
      const cfg = makeConfig();
      const get = cfg.get;
      cfg.get = jest.fn((key: string) =>
        key === 'stripe.prices' ? { proMonthly: 'price_env_pro', enterpriseYearly: 'price_env_ent' } : get(key),
      );
      const s = new PaymentService(cfg, { firestore } as any, users, audit as any);
      expect(determine(s, 'price_env_pro')).toBe(SubscriptionPlan.PRO);
      expect(determine(s, 'price_env_ent')).toBe(SubscriptionPlan.ENTERPRISE);
    });

    it('an unknown price stays Free (unchanged)', () => {
      expect(determine(service, 'price_nobody')).toBe(SubscriptionPlan.FREE);
    });
  });

  describe('webhooks', () => {
    const event = (type: string, object: unknown, id = 'evt_' + Math.random()) =>
      ({ id, type, data: { object } }) as any;

    it('portal upgrade Starter → Professional resolves the plan from the new price and stores the period start', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.plan': SubscriptionPlan.STARTER });
      await service.handleWebhookEvent(event('customer.subscription.updated', fakeSub('price_prof_m', {
        metadata: { ...OUR_METADATA, plan: 'business' }, // metadata is ignored
      })));
      expect(users.updateSubscription).toHaveBeenCalledWith('u1', expect.objectContaining({
        plan: SubscriptionPlan.PROFESSIONAL,
        currentPeriodStart: new Date(1_700_000_000 * 1000),
      }));
      expect(users.updateUsage).toHaveBeenCalledWith('u1', { aiCreditsLimit: 60 });
      expect(users.rolloverUsageIfDue).toHaveBeenCalledWith('u1');
    });

    it('LEGACY Pro subscription.updated keeps its plan and touches no usage counters', async () => {
      await service.handleWebhookEvent(event('customer.subscription.updated',
        fakeSub(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly)));
      expect(users.updateSubscription).toHaveBeenCalledWith('u1', expect.objectContaining({ plan: SubscriptionPlan.PRO }));
      expect(users.updateUsage).not.toHaveBeenCalled();
      expect(users.rolloverUsageIfDue).not.toHaveBeenCalled();
    });

    it('LEGACY Pro invoice.paid still resets the counters on every paid invoice', async () => {
      (service as any).stripe = {
        subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSub(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly)) },
      };
      await service.handleWebhookEvent(event('invoice.paid', { subscription: 'sub_test', customer: 'cus_1', ...{ subscription_details: { metadata: OUR_METADATA } } }));
      expect(users.updateUsage).toHaveBeenCalledWith('u1', expect.objectContaining({ aiCreditsUsed: 0, exportsThisMonth: 0, aiCreditsLimit: 100 }));
    });

    it('current-plan invoice.paid (e.g. a proration invoice) does NOT hand out a fresh allowance', async () => {
      (service as any).stripe = { subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSub('price_prof_m')) } };
      await service.handleWebhookEvent(event('invoice.paid', { subscription: 'sub_test', customer: 'cus_1', subscription_details: { metadata: OUR_METADATA } }));
      expect(users.updateUsage).toHaveBeenCalledWith('u1', { aiCreditsLimit: 60 });
      expect(users.updateUsage).not.toHaveBeenCalledWith('u1', expect.objectContaining({ aiCreditsUsed: 0 }));
      expect(users.updateSubscription).toHaveBeenCalledWith('u1', expect.objectContaining({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(1_700_000_000 * 1000),
      }));
    });

    it('checkout.session.completed for Business writes the plan, its credit limit and the period start', async () => {
      (service as any).stripe = {
        subscriptions: { retrieve: jest.fn().mockResolvedValue(fakeSub('price_business_m', { id: 'sub_b' })) },
      };
      await service.handleWebhookEvent(event('checkout.session.completed', {
        metadata: { firebaseUid: 'u1', ...OUR_METADATA, plan: 'starter' },
        subscription: 'sub_b',
        customer: 'cus_1',
      }));
      const doc = (await firestore.collection('users').doc('u1').get()).data() as any;
      expect(doc.subscription.plan).toBe(SubscriptionPlan.BUSINESS);
      expect(doc.usage.aiCreditsLimit).toBe(500);
      expect(new Date(doc.subscription.currentPeriodStart)).toEqual(new Date(1_700_000_000 * 1000));
    });

    it('cancellation (subscription.deleted) returns a current-plan customer to Free', async () => {
      await firestore.collection('users').doc('u1').update({ 'subscription.plan': SubscriptionPlan.PROFESSIONAL });
      await service.handleWebhookEvent(event('customer.subscription.deleted', fakeSub('price_prof_m')));
      expect(users.updateSubscription).toHaveBeenCalledWith('u1', expect.objectContaining({
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELED,
      }));
      expect(users.updateUsage).toHaveBeenCalledWith('u1', { aiCreditsLimit: 3 });
    });
  });

  describe('in-app plan change', () => {
    const liveSubscriber = (plan: SubscriptionPlan) =>
      firestore.collection('users').doc('u1').update({
        subscription: {
          plan,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_test',
          currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
        },
      });
    const stripeWith = (currentPrice: string) => {
      const sub = fakeSub(currentPrice, {
        items: { data: [{ id: 'si_1', price: { id: currentPrice, recurring: { interval: 'month' } } }] },
      });
      const stripe = {
        prices: { retrieve: jest.fn(async (id: string) => ({ id, active: true, livemode: false, metadata: OUR_METADATA })) },
        subscriptions: {
          retrieve: jest.fn().mockResolvedValue(sub),
          update: jest.fn(async (_id: string, params: any) =>
            fakeSub(params.items[0].price, {
              items: { data: [{ id: 'si_1', price: { id: params.items[0].price, recurring: { interval: 'month' } } }] },
            })),
        },
        invoices: {
          retrieveUpcoming: jest.fn().mockResolvedValue({
            currency: 'usd',
            amount_due: 1700,
            lines: { data: [{ proration: true, amount: -2199 }, { proration: true, amount: 3899 }, { proration: false, amount: 3899 }] },
          }),
        },
      };
      (service as any).stripe = stripe;
      return stripe;
    };

    it('previews the proration for Starter → Professional', async () => {
      await liveSubscriber(SubscriptionPlan.STARTER);
      const stripe = stripeWith('price_starter_m');
      const preview = await service.previewPlanChange('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(preview).toMatchObject({ fromPlan: 'starter', toPlan: 'professional', prorationAmount: 1700, amountDue: 1700, currency: 'usd' });
      expect(stripe.invoices.retrieveUpcoming).toHaveBeenCalledWith(expect.objectContaining({
        subscription: 'sub_test',
        subscription_items: [{ id: 'si_1', price: 'price_prof_m' }],
        subscription_proration_behavior: 'always_invoice',
      }));
    });

    it('switches the plan and grants it from the new price id', async () => {
      await liveSubscriber(SubscriptionPlan.STARTER);
      const stripe = stripeWith('price_starter_m');
      const res = await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL, interval: 'year' });
      expect(res.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_test', expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_prof_y' }],
        proration_behavior: 'always_invoice',
      }));
      expect(users.updateSubscription).toHaveBeenCalledWith('u1', expect.objectContaining({ plan: SubscriptionPlan.PROFESSIONAL }));
    });

    it('schedules a downgrade for the period end: no proration, the plan and V1 counters stay as paid', async () => {
      await liveSubscriber(SubscriptionPlan.PROFESSIONAL);
      const stripe: any = stripeWith('price_prof_m');
      stripe.subscriptionSchedules = {
        create: jest.fn().mockResolvedValue({ id: 'sub_sched_1' }),
        update: jest.fn().mockResolvedValue({ id: 'sub_sched_1' }),
        release: jest.fn(),
      };
      const preview = await service.previewPlanChange('u1', { plan: SubscriptionPlan.STARTER });
      expect(preview).toMatchObject({ timing: 'at_period_end', prorationAmount: 0, amountDue: 0 });
      expect(stripe.invoices.retrieveUpcoming).not.toHaveBeenCalled();

      const res = await service.changePlan('u1', { plan: SubscriptionPlan.STARTER });
      expect(res).toMatchObject({ plan: SubscriptionPlan.PROFESSIONAL, scheduledPlan: SubscriptionPlan.STARTER });
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(stripe.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_test' });
      const [, params] = stripe.subscriptionSchedules.update.mock.calls[0];
      expect(params).toMatchObject({ end_behavior: 'release', proration_behavior: 'none' });
      expect(params.phases[0]).toMatchObject({ items: [{ price: 'price_prof_m', quantity: 1 }], end_date: 1_702_600_000 });
      expect(params.phases[1]).toMatchObject({ items: [{ price: 'price_starter_m', quantity: 1 }], iterations: 1 });
      expect(users.updateSubscription).not.toHaveBeenCalledWith('u1', expect.objectContaining({ plan: SubscriptionPlan.STARTER }));
    });

    it('an upgrade releases a pending scheduled downgrade and switches now', async () => {
      await liveSubscriber(SubscriptionPlan.STARTER);
      const stripe: any = stripeWith('price_starter_m');
      stripe.subscriptions.retrieve.mockResolvedValue(
        fakeSub('price_starter_m', {
          schedule: 'sub_sched_9',
          items: { data: [{ id: 'si_1', price: { id: 'price_starter_m', recurring: { interval: 'month' } } }] },
        }),
      );
      stripe.subscriptionSchedules = { release: jest.fn().mockResolvedValue({}) };
      await service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL });
      expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_9');
      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_test', expect.objectContaining({ proration_behavior: 'always_invoice' }));
    });

    it('a legacy Pro subscriber may move to a current plan (up now, down at the period end)', async () => {
      await liveSubscriber(SubscriptionPlan.PRO);
      const stripe: any = stripeWith(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly);
      await expect(service.changePlan('u1', { plan: SubscriptionPlan.PROFESSIONAL })).resolves.toMatchObject({ plan: 'professional' });
      stripe.subscriptionSchedules = { create: jest.fn().mockResolvedValue({ id: 'sched' }), update: jest.fn().mockResolvedValue({}) };
      await expect(service.changePlan('u1', { plan: SubscriptionPlan.STARTER })).resolves.toMatchObject({
        plan: 'pro',
        scheduledPlan: 'starter',
      });
    });

    it.each([SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE, SubscriptionPlan.CAREER_ACCELERATOR])(
      'refuses a legacy target %s (legacy → legacy included)',
      async (plan) => {
        await liveSubscriber(SubscriptionPlan.PRO);
        stripeWith(PLAN_CONFIGS[SubscriptionPlan.PRO].stripePriceIdMonthly);
        const err: any = await service.changePlan('u1', { plan }).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'PLAN_NOT_AVAILABLE' });
      },
    );

    it('refuses the plan already billed, an unconfigured plan, and a non-subscriber', async () => {
      await liveSubscriber(SubscriptionPlan.STARTER);
      stripeWith('price_starter_m');
      expect((await service.changePlan('u1', { plan: SubscriptionPlan.STARTER }).catch((e) => e)).getResponse())
        .toMatchObject({ code: 'SAME_PLAN' });
      expect((await service.changePlan('u1', { plan: SubscriptionPlan.CAREER_PRO }).catch((e) => e)).getResponse())
        .toMatchObject({ code: 'PLAN_NOT_CONFIGURED' });
      await firestore.collection('users').doc('u1').update({ 'subscription.stripeSubscriptionId': null, 'subscription.plan': 'free' });
      expect((await service.changePlan('u1', { plan: SubscriptionPlan.BUSINESS }).catch((e) => e)).getResponse())
        .toMatchObject({ code: 'NO_SUBSCRIPTION' });
    });
  });

  describe('GET /plans catalog', () => {
    it('lists the five current plans, never a legacy one, with configured flags per interval', () => {
      const catalog = service.getPublicCatalog();
      expect(catalog.plans.map((p) => p.id)).toEqual(['free', 'starter', 'professional', 'career_pro', 'business']);
      const by = Object.fromEntries(catalog.plans.map((p) => [p.id, p]));
      expect(by.free.configured).toEqual({ month: false, year: false });
      expect(by.starter.configured).toEqual({ month: true, year: catalog.yearlyBillingEnabled });
      expect(by.career_pro.configured).toEqual({ month: false, year: false });
      expect(by.business.configured).toEqual({ month: true, year: false });
      expect(by.business.contactSales).toBe(true);
      expect(by.professional).toMatchObject({ recommended: true, trialDays: 7, priceMonthly: 38.99, priceAnnual: 389.9 });
      expect(by.starter.trialDays).toBeNull();
    });

    it('with no env at all every paid plan reads "not configured"', () => {
      const catalog = publicPlanCatalog(currentPlanPricesFromEnv({}), true);
      for (const p of catalog.plans) expect(p.configured).toEqual({ month: false, year: false });
    });
  });

  describe('plan-prices env parsing', () => {
    it('reads STRIPE_PRICE_<PLAN>_MONTHLY / _ANNUAL, trimming and dropping blanks', () => {
      const prices = currentPlanPricesFromEnv({
        STRIPE_PRICE_STARTER_MONTHLY: ' price_a ',
        STRIPE_PRICE_STARTER_ANNUAL: '   ',
        STRIPE_PRICE_CAREER_PRO_ANNUAL: 'price_b',
      });
      expect(prices.starter).toEqual({ month: 'price_a', year: undefined });
      expect(prices.career_pro).toEqual({ month: undefined, year: 'price_b' });
      expect(currentPlanForPriceId(prices, 'price_b')).toBe(SubscriptionPlan.CAREER_PRO);
      expect(currentPlanForPriceId(prices, '')).toBeNull();
    });
  });
});
