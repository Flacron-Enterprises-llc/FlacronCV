import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { join } from 'path';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { CareerTopUpCharger } from '../career-metering/career-top-up';
import { CAREER_ADDONS, addonAllowedFor, addonPriceEnvName, careerPlanForV1, readAddonPrices } from './career-addons';
import { CAPACITY_SUBSCRIPTIONS, CareerBillingService, PACK_PURCHASES } from './career-billing.service';
import { billingReturnUrls } from './career-billing.controller';
import { ADDON_REQUIREMENTS, AvailabilitySource, PURCHASE_PROVIDERS } from './purchase-availability';

/** Every feature switched on and every provider ready, so these tests exercise the other checks. */
function allAvailable(): AvailabilitySource {
  const features = Object.fromEntries(Object.values(ADDON_REQUIREMENTS).map((r) => [r.feature, true]));
  const providers = Object.fromEntries(PURCHASE_PROVIDERS.map((p) => [p, true]));
  return { forCaller: async () => ({ features, providers }) };
}

/**
 * Packs and capacity add-ons sold through V1's Stripe (spec sections 9-11),
 * the price-derived career plan, and the opted-in automatic top-up. Stripe is
 * mocked; no Stripe resource is used.
 */
const APP = { app_id: 'flacron-cv' };
const PACK_PRICE = 'price_pack_document_s';
const ACTION_PRICE = 'price_pack_action_s';
const SEARCH_PRICE = 'price_saved_search_recurring';
const PRO_ADDON_PRICE = 'price_career_professional_month';
const CAREER_PRO_ADDON_PRICE = 'price_career_pro_month';

function config() {
  return { get: jest.fn((key: string) => ({ 'stripe.secretKey': '', 'stripe.appId': 'flacron-cv' } as Record<string, unknown>)[key]) } as any;
}

function users(firestore: InMemoryFirestore) {
  return {
    findByIdOrThrow: jest.fn(async (uid: string) => (await firestore.collection('users').doc(uid).get()).data()),
    updateSubscription: jest.fn(),
  } as any;
}

function stripeMock() {
  const prices: Record<string, any> = {
    [PACK_PRICE]: { id: PACK_PRICE, active: true, livemode: false, metadata: APP, currency: 'usd', unit_amount: 499, recurring: null },
    [ACTION_PRICE]: { id: ACTION_PRICE, active: true, livemode: false, metadata: APP, currency: 'usd', unit_amount: 799, recurring: null },
    [SEARCH_PRICE]: { id: SEARCH_PRICE, active: true, livemode: false, metadata: APP, currency: 'usd', unit_amount: 299, recurring: { interval: 'month' } },
  };
  const subs = new Map<string, any>();
  return {
    subs,
    prices: { retrieve: jest.fn(async (id: string) => prices[id]) },
    customers: {
      create: jest.fn(async () => ({ id: 'cus_new' })),
      retrieve: jest.fn(async (id: string) => ({ id, invoice_settings: { default_payment_method: 'pm_card' } })),
    },
    checkout: {
      sessions: {
        create: jest.fn(async () => ({ id: 'cs_new', url: 'https://checkout.example.test/cs_new' })),
        listLineItems: jest.fn(async () => ({ data: [{ price: { id: PACK_PRICE } }] })),
      },
    },
    subscriptions: {
      retrieve: jest.fn(async (id: string) => subs.get(id)),
      cancel: jest.fn(async (id: string) => ({ ...subs.get(id), status: 'canceled' })),
    },
    invoices: { retrieve: jest.fn() },
    charges: { retrieve: jest.fn(async (id: string) => ({ id, payment_intent: 'pi_pack', refunded: false })) },
    paymentIntents: {
      create: jest.fn(async (params: any) => ({ id: 'pi_topup', status: 'succeeded', amount: params.amount, amount_received: params.amount, currency: 'usd', created: 1_800_000_000 })),
    },
  };
}

async function seedUser(firestore: InMemoryFirestore, plan: SubscriptionPlan) {
  await firestore.collection('users').doc('u1').set({
    uid: 'u1',
    email: 'u1@example.test',
    subscription: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(Date.now() + 20 * 86400_000),
      stripeCustomerId: 'cus_shared',
      stripeSubscriptionId: 'sub_v1',
    },
  });
}

const ENV_KEYS = ['STRIPE_PRICE_PACK_DOCUMENT_S', 'STRIPE_PRICE_PACK_ACTION_S', 'STRIPE_PRICE_PACK_SAVED_SEARCH_5_RECURRING', 'CAREER_STRIPE_PRICES'];
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});
afterAll(() => {
  for (const key of ENV_KEYS) process.env[key] = saved[key];
});
function configurePrices(on = true) {
  process.env.STRIPE_PRICE_PACK_DOCUMENT_S = on ? PACK_PRICE : '';
  process.env.STRIPE_PRICE_PACK_ACTION_S = on ? ACTION_PRICE : '';
  process.env.STRIPE_PRICE_PACK_SAVED_SEARCH_5_RECURRING = on ? SEARCH_PRICE : '';
  process.env.CAREER_STRIPE_PRICES = JSON.stringify({ 'professional:month': PRO_ADDON_PRICE, 'career_pro:month': CAREER_PRO_ADDON_PRICE });
}

describe('career add-on catalog in V1', () => {
  it('matches the career catalog exactly (ids, units, prices, billing, plan minimum)', () => {
    // Loaded at test time (jest compiles it) so the API's own build never includes the career package.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ADDONS } = require(join(__dirname, '../../../../../packages/career-shared/src/catalog')) as {
      ADDONS: Array<{ id: string; kind: string; unit: string; units: number; priceCents: number; billing: string; minPlan: string; status: string; firmPrice: boolean }>;
    };
    const sellable = ADDONS.filter(
      (a) => a.status === 'active' && a.firmPrice && (a.kind === 'usage_pack' || a.kind === 'capacity' || (a.kind === 'organization' && ['staff_seat', 'active_candidate', 'storage_byte'].includes(a.unit))),
    );
    expect(CAREER_ADDONS.map((a) => ({ ...a }))).toEqual(
      sellable.map((a) => ({ id: a.id, kind: a.kind, unit: a.unit, units: a.units, priceCents: a.priceCents, billing: a.billing, minPlan: a.minPlan })),
    );
  });

  it('names env prices and treats blank as not on sale', () => {
    expect(addonPriceEnvName({ id: 'document_s', billing: 'one_time' })).toBe('STRIPE_PRICE_PACK_DOCUMENT_S');
    expect(addonPriceEnvName({ id: 'location_extra', billing: 'monthly' })).toBe('STRIPE_PRICE_PACK_LOCATION_EXTRA_RECURRING');
    expect(readAddonPrices({ STRIPE_PRICE_PACK_DOCUMENT_S: ' ' }).size).toBe(0);
    expect(() => readAddonPrices({ STRIPE_PRICE_PACK_DOCUMENT_S: 'prod_x' })).toThrow(/price id/);
  });

  it('Free upgrades first; Professional+ packs and Business add-ons have their minimum', () => {
    expect(addonAllowedFor('free', 'document_s')).toMatchObject({ ok: false, reason: 'UPGRADE_REQUIRED', minimumPlan: 'starter' });
    expect(addonAllowedFor('starter', 'document_s').ok).toBe(true);
    expect(addonAllowedFor('starter', 'voice_s')).toMatchObject({ ok: false, minimumPlan: 'professional' });
    expect(addonAllowedFor('professional', 'staff_seat')).toMatchObject({ ok: false, minimumPlan: 'business' });
    expect(addonAllowedFor('business', 'candidates_25').ok).toBe(true);
    expect(careerPlanForV1('pro')).toBe('starter');
    expect(careerPlanForV1('enterprise')).toBe('career_pro');
    expect(careerPlanForV1('professional')).toBe('professional');
  });
});

describe('pack and capacity checkout', () => {
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  const make = () => new CareerBillingService(config(), { firestore } as any, users(firestore), stripe as any, allAvailable());
  const urls = { success: 's', cancel: 'c' };

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    stripe = stripeMock();
    configurePrices(true);
  });

  it('an unset price is "not on sale", without calling Stripe', async () => {
    configurePrices(false);
    await seedUser(firestore, SubscriptionPlan.STARTER);
    const error = await make().createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ADDON_NOT_ON_SALE' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('Free must upgrade; a Starter cannot buy a Professional pack', async () => {
    await seedUser(firestore, SubscriptionPlan.FREE);
    const free = await make().createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls).catch((e: unknown) => e);
    expect(free).toBeInstanceOf(ForbiddenException);
    expect((free as ForbiddenException).getResponse()).toMatchObject({ code: 'UPGRADE_REQUIRED', minimumPlan: 'starter' });
    await seedUser(firestore, SubscriptionPlan.STARTER);
    const low = await make().createPackCheckout('u1', { addonId: 'action_s', expectedAmountCents: 799 }, urls).catch((e: unknown) => e);
    expect((low as ForbiddenException).getResponse()).toMatchObject({ code: 'UPGRADE_REQUIRED', minimumPlan: 'professional' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('charges only the confirmed catalog amount, one-time, on the existing customer', async () => {
    await seedUser(firestore, SubscriptionPlan.STARTER);
    await expect(make().createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 399 }, urls)).rejects.toBeInstanceOf(ConflictException);
    const result = await make().createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499, idempotencyKey: 'k' }, urls);
    expect(result.sessionId).toBe('cs_new');
    const [params, options] = stripe.checkout.sessions.create.mock.calls[0] as any[];
    expect(params).toMatchObject({ mode: 'payment', customer: 'cus_shared', line_items: [{ price: PACK_PRICE, quantity: 1 }] });
    expect(params.metadata).toMatchObject({ product: 'career_pack', addonId: 'document_s', firebaseUid: 'u1', ...APP });
    expect(params.payment_intent_data.metadata).toMatchObject({ product: 'career_pack' });
    expect(options).toEqual({ idempotencyKey: 'career-pack:u1:k' });
  });

  it('a capacity add-on is its own subscription with a quantity; a second live one is refused', async () => {
    await seedUser(firestore, SubscriptionPlan.STARTER);
    await expect(make().createCapacityCheckout('u1', { addonId: 'saved_search_5', quantity: 2, expectedAmountCents: 299 }, urls)).rejects.toBeInstanceOf(ConflictException);
    await make().createCapacityCheckout('u1', { addonId: 'saved_search_5', quantity: 2, expectedAmountCents: 598 }, urls);
    const [params] = stripe.checkout.sessions.create.mock.calls[0] as any[];
    expect(params).toMatchObject({ mode: 'subscription', line_items: [{ price: SEARCH_PRICE, quantity: 2 }] });
    expect(params.subscription_data.metadata).toMatchObject({ product: 'career_capacity', addonId: 'saved_search_5' });
    await firestore.collection(CAPACITY_SUBSCRIPTIONS).doc('sub_cap').set({ uid: 'u1', addonId: 'saved_search_5', status: 'active' });
    const again = await make().createCapacityCheckout('u1', { addonId: 'saved_search_5', quantity: 1, expectedAmountCents: 299 }, urls).catch((e: unknown) => e);
    expect((again as ConflictException).getResponse()).toMatchObject({ code: 'ADDON_ALREADY_ACTIVE' });
  });
});

describe('career webhooks for packs, capacity and price-derived plans', () => {
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  let svc: CareerBillingService;
  const t0 = 1_800_000_000;
  const event = (type: string, object: unknown, created = t0) => ({ id: `evt_${Math.random()}`, type, created, livemode: false, data: { object } }) as any;
  const pack = async (id: string) => (await firestore.collection(PACK_PURCHASES).doc(id).get()).data() as any;

  beforeEach(async () => {
    firestore = new InMemoryFirestore();
    stripe = stripeMock();
    configurePrices(true);
    await seedUser(firestore, SubscriptionPlan.STARTER);
    svc = new CareerBillingService(config(), { firestore } as any, users(firestore), stripe as any, allAvailable());
  });

  const paidSession = { id: 'cs_pack', payment_status: 'paid', amount_total: 499, currency: 'usd', payment_intent: 'pi_pack', metadata: { ...APP, product: 'career_pack', addonId: 'action_l', firebaseUid: 'u1' } };

  it('a paid pack checkout is recorded once, as the pack its PRICE says (not the metadata)', async () => {
    const completed = event('checkout.session.completed', paidSession);
    expect(await svc.isCareerEvent(completed)).toBe(true);
    await svc.apply(completed);
    await svc.apply(completed);
    expect(await pack('cs_pack')).toMatchObject({ uid: 'u1', addonId: 'document_s', amountCents: 499, status: 'paid', paymentIntentId: 'pi_pack', autoTopup: false });
  });

  it('an unpaid or unknown-price session grants nothing', async () => {
    await svc.apply(event('checkout.session.completed', { ...paidSession, id: 'cs_unpaid', payment_status: 'unpaid' }));
    stripe.checkout.sessions.listLineItems.mockResolvedValueOnce({ data: [{ price: { id: 'price_unknown' } }] });
    await svc.apply(event('checkout.session.completed', { ...paidSession, id: 'cs_unknown' }));
    expect(await pack('cs_unpaid')).toBeUndefined();
    expect(await pack('cs_unknown')).toBeUndefined();
  });

  it('a full refund or a dispute marks the pack so the career ledger revokes the unused units; a partial refund changes nothing', async () => {
    await svc.apply(event('checkout.session.completed', paidSession));
    const partial = event('charge.refunded', { id: 'ch_1', refunded: false, amount_refunded: 100, payment_intent: 'pi_pack', invoice: null });
    expect(await svc.isCareerEvent(partial)).toBe(true);
    await svc.apply(partial);
    expect((await pack('cs_pack')).status).toBe('paid');
    await svc.apply(event('charge.dispute.created', { id: 'dp_1', charge: 'ch_1' }));
    expect((await pack('cs_pack')).status).toBe('disputed');
    await svc.apply(event('charge.refunded', { id: 'ch_1', refunded: true, payment_intent: 'pi_pack', invoice: null }));
    expect((await pack('cs_pack')).status).toBe('refunded');
  });

  it('a capacity subscription is stored as a state from its price; older events never overwrite newer ones', async () => {
    const sub = (status: string, quantity: number) => ({
      id: 'sub_cap',
      status,
      current_period_end: t0 + 30 * 86400,
      cancel_at_period_end: false,
      metadata: { ...APP, product: 'career_capacity', firebaseUid: 'u1', addonId: 'storage_10gb' },
      items: { data: [{ quantity, price: { id: SEARCH_PRICE, recurring: { interval: 'month' } } }] },
    });
    await svc.apply(event('customer.subscription.updated', sub('active', 3), t0 + 10));
    await svc.apply(event('customer.subscription.updated', sub('incomplete', 1), t0 + 5));
    const state = (await firestore.collection(CAPACITY_SUBSCRIPTIONS).doc('sub_cap').get()).data() as any;
    expect(state).toMatchObject({ uid: 'u1', addonId: 'saved_search_5', quantity: 3, status: 'active', stateAt: t0 + 10 });
  });

  it('an existing add-on follows its PRICE after a portal switch; metadata is only the legacy fallback', () => {
    const sub = (price: string, careerPlan = 'professional') =>
      ({ id: 'sub_c', metadata: { product: 'career', careerPlan }, items: { data: [{ price: { id: price } }] } }) as any;
    expect(svc.planForSubscription(sub(CAREER_PRO_ADDON_PRICE))).toBe('career_pro');
    expect(svc.planForSubscription(sub(PRO_ADDON_PRICE, 'career_pro'))).toBe('professional');
    expect(svc.planForSubscription(sub('price_old_unlisted', 'starter'))).toBe('starter');
    expect(svc.planForSubscription(sub('price_old_unlisted', 'platinum'))).toBeNull();
  });

  it('a portal switch on an existing add-on grants the new plan on the next update event', async () => {
    await svc.apply(
      event('customer.subscription.updated', {
        id: 'sub_c',
        status: 'active',
        current_period_end: t0 + 30 * 86400,
        metadata: { ...APP, product: 'career', firebaseUid: 'u1', careerPlan: 'professional' },
        items: { data: [{ price: { id: CAREER_PRO_ADDON_PRICE, recurring: { interval: 'month' } } }] },
      }),
    );
    const user = (await firestore.collection('users').doc('u1').get()).data() as any;
    expect(user.careerSubscription).toMatchObject({ plan: 'career_pro', status: 'active' });
  });
});

describe('CareerTopUpCharger', () => {
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  beforeEach(async () => {
    firestore = new InMemoryFirestore();
    stripe = stripeMock();
    await seedUser(firestore, SubscriptionPlan.STARTER);
  });

  it('charges one configured pack off-session at the catalog price and records it as an automatic top-up', async () => {
    const charger = new CareerTopUpCharger(stripe as any, firestore as any, 'flacron-cv', { STRIPE_PRICE_PACK_DOCUMENT_S: PACK_PRICE });
    expect(await charger.charge('u1', 'document_s', 'key-1')).toBe(true);
    const [params, options] = stripe.paymentIntents.create.mock.calls[0] as any[];
    expect(params).toMatchObject({ amount: 499, currency: 'usd', customer: 'cus_shared', payment_method: 'pm_card', off_session: true, confirm: true });
    expect(params.metadata).toMatchObject({ product: 'career_pack', autoTopup: 'true', firebaseUid: 'u1', ...APP });
    expect(options).toEqual({ idempotencyKey: 'career-topup:u1:key-1' });
    const record = (await firestore.collection(PACK_PURCHASES).doc('pi_topup').get()).data() as any;
    expect(record).toMatchObject({ uid: 'u1', addonId: 'document_s', autoTopup: true, status: 'paid', amountCents: 499 });
  });

  it('buys nothing without a configured price, a saved card, or for a non-pack add-on', async () => {
    expect(await new CareerTopUpCharger(stripe as any, firestore as any, 'flacron-cv', {}).charge('u1', 'document_s', 'k')).toBe(false);
    const charger = new CareerTopUpCharger(stripe as any, firestore as any, 'flacron-cv', { STRIPE_PRICE_PACK_DOCUMENT_S: PACK_PRICE });
    expect(await charger.charge('u1', 'location_extra', 'k')).toBe(false);
    stripe.customers.retrieve.mockResolvedValueOnce({ id: 'cus_shared', invoice_settings: { default_payment_method: null } } as any);
    stripe.subs.set('sub_v1', { id: 'sub_v1', default_payment_method: null });
    expect(await charger.charge('u1', 'document_s', 'k2')).toBe(false);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('a declined card buys nothing and frees the lock', async () => {
    const charger = new CareerTopUpCharger(stripe as any, firestore as any, 'flacron-cv', { STRIPE_PRICE_PACK_DOCUMENT_S: PACK_PRICE });
    stripe.paymentIntents.create.mockRejectedValueOnce(Object.assign(new Error('declined'), { code: 'card_declined' }));
    expect(await charger.charge('u1', 'document_s', 'k')).toBe(false);
    expect(await charger.charge('u1', 'document_s', 'k2')).toBe(true);
  });
});

describe('pack / add-on checkout return URLs', () => {
  it('returns to the billing page in the person\'s locale, defaulting to en', () => {
    expect(billingReturnUrls('https://app.test', 'fr', 'pack')).toEqual({
      success: 'https://app.test/fr/settings/billing?pack=success&session_id={CHECKOUT_SESSION_ID}',
      cancel: 'https://app.test/fr/settings/billing?pack=canceled',
    });
    expect(billingReturnUrls('https://app.test', undefined, 'addon').cancel).toBe('https://app.test/en/settings/billing?addon=canceled');
    expect(billingReturnUrls('https://app.test', 'xx', 'addon').success).toContain('/en/settings/billing?addon=success');
  });
});
