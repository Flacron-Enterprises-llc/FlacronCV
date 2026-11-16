import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { runWithCaller } from '../career-metering/caller-context';
import { CAREER_ADDONS } from './career-addons';
import { CareerBillingController } from './career-billing.controller';
import { CareerBillingService, PACK_PURCHASES } from './career-billing.service';
import {
  ADDON_REQUIREMENTS,
  AvailabilityContext,
  AvailabilitySource,
  CareerAccessAvailabilitySource,
  addonAvailability,
  parseContext,
} from './purchase-availability';

/**
 * Server-side purchase availability: a configured Stripe price never makes an
 * unbuilt, switched-off or provider-less feature purchasable. Stripe is mocked.
 */

const APP = { app_id: 'flacron-cv' };
const allFeaturesOn = Object.fromEntries(Object.values(ADDON_REQUIREMENTS).map((r) => [r.feature, true]));

/** What a career service with an AI key and storage, and nothing else, reports today. */
const REALISTIC: AvailabilityContext = {
  features: allFeaturesOn,
  providers: { ai: true, objectStorage: true, speech: false, mapTiles: false, jobFeeds: false },
};

const source = (ctx: AvailabilityContext | null): AvailabilitySource & { forCaller: jest.Mock } => ({
  forCaller: jest.fn(async () => ctx),
});

describe('addonAvailability (pure)', () => {
  it('has exactly one requirement row per sellable add-on, so a new add-on is never sold by default', () => {
    expect(Object.keys(ADDON_REQUIREMENTS).sort()).toEqual(CAREER_ADDONS.map((a) => a.id).sort());
    expect(addonAvailability('not_a_pack', REALISTIC)).toEqual({ available: false, reason: 'unknown_addon' });
  });

  it('keeps voice, maps, assisted forms, alerts and saved searches closed even with every switch on', () => {
    const open = CAREER_ADDONS.filter((a) => addonAvailability(a.id, REALISTIC).available).map((a) => a.id);
    expect(open.sort()).toEqual(
      [
        'document_s', 'document_m', 'document_l', 'analysis_25', 'action_s', 'action_l', 'text_interview_5',
        'skill_5', 'scenario_3', 'coaching_100', 'location_extra', 'portfolio_extra', 'storage_10gb',
        'staff_seat', 'candidates_25', 'candidates_100', 'storage_100gb_business',
      ].sort(),
    );
    expect(addonAvailability('voice_s', REALISTIC)).toEqual({ available: false, reason: 'provider_missing', provider: 'speech' });
    expect(addonAvailability('map_200', REALISTIC)).toEqual({ available: false, reason: 'provider_missing', provider: 'mapTiles' });
    expect(addonAvailability('alert_s', REALISTIC)).toEqual({ available: false, reason: 'provider_missing', provider: 'jobFeeds' });
    expect(addonAvailability('saved_search_5', REALISTIC)).toEqual({ available: false, reason: 'provider_missing', provider: 'jobFeeds' });
    // Not built: refused even if a provider list were empty and every switch on.
    expect(addonAvailability('assisted_form_25', { features: allFeaturesOn, providers: { ai: true, objectStorage: true, speech: true, mapTiles: true, jobFeeds: true } })).toEqual({ available: false, reason: 'not_built' });
  });

  it('fails closed: no career service means nothing is on sale; a switched-off feature is closed', () => {
    for (const a of CAREER_ADDONS) expect(addonAvailability(a.id, null).available).toBe(false);
    expect(addonAvailability('document_s', null)).toEqual({ available: false, reason: 'service_unavailable' });
    expect(addonAvailability('coaching_100', { ...REALISTIC, features: { ...allFeaturesOn, coachingResponses: false } })).toEqual({ available: false, reason: 'feature_off' });
    expect(addonAvailability('document_s', { ...REALISTIC, providers: { ...REALISTIC.providers, ai: false } })).toEqual({ available: false, reason: 'provider_missing', provider: 'ai' });
  });

  it('only literal true counts in what the career service returns; an old service without providers vouches for none', () => {
    expect(parseContext({ features: { documentCredits: 'true', coachingResponses: 1, skillReports: true } as never, providers: { ai: 'yes' } as never })).toEqual({ features: { skillReports: true }, providers: {} });
    const old = parseContext({ features: allFeaturesOn });
    expect(addonAvailability('document_s', old)).toEqual({ available: false, reason: 'provider_missing', provider: 'ai' });
    expect(parseContext(null)).toBeNull();
  });
});

describe('CareerAccessAvailabilitySource', () => {
  const ok = (body: unknown) => jest.fn(async () => ({ status: 200, json: async () => body }));

  it('asks GET /access on the career API path with the caller\'s own token', async () => {
    const fetch = ok({ features: { documentCredits: true }, providers: { ai: true } });
    const ctx = await new CareerAccessAvailabilitySource('https://api.example.test/', fetch).forCaller('id-token');
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/api/career/v1/access', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer id-token' } }));
    expect(ctx).toEqual({ features: { documentCredits: true }, providers: { ai: true } });
  });

  it('returns null (closed) without a URL, without a token, on a non-200, on an error and on a timeout', async () => {
    const fetch = ok({});
    expect(await new CareerAccessAvailabilitySource('', fetch).forCaller('t')).toBeNull();
    expect(await new CareerAccessAvailabilitySource(undefined, fetch).forCaller('t')).toBeNull();
    expect(await new CareerAccessAvailabilitySource('https://x.test', fetch).forCaller(null)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await new CareerAccessAvailabilitySource('https://x.test', jest.fn(async () => ({ status: 401, json: async () => ({}) }))).forCaller('t')).toBeNull();
    expect(await new CareerAccessAvailabilitySource('https://x.test', jest.fn(async () => { throw new Error('ECONNREFUSED'); })).forCaller('t')).toBeNull();
    const hang = jest.fn((_url: string, init: { signal?: AbortSignal }) => new Promise<never>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    expect(await new CareerAccessAvailabilitySource('https://x.test', hang as never, 20).forCaller('t')).toBeNull();
  });
});

describe('pack checkout refuses unavailable features before touching Stripe', () => {
  const PRICES: Record<string, string> = {
    STRIPE_PRICE_PACK_DOCUMENT_S: 'price_doc_s',
    STRIPE_PRICE_PACK_VOICE_S: 'price_voice_s',
    STRIPE_PRICE_PACK_MAP_200: 'price_map_200',
    STRIPE_PRICE_PACK_ASSISTED_FORM_25: 'price_forms_25',
    STRIPE_PRICE_PACK_ALERT_S: 'price_alert_s',
    STRIPE_PRICE_PACK_SAVED_SEARCH_5_RECURRING: 'price_search_5',
  };
  const saved: Record<string, string | undefined> = {};
  let firestore: InMemoryFirestore;
  let stripe: ReturnType<typeof stripeMock>;
  const urls = { success: 's', cancel: 'c' };

  function stripeMock() {
    const prices: Record<string, any> = {
      price_doc_s: { id: 'price_doc_s', active: true, livemode: false, metadata: APP, currency: 'usd', unit_amount: 499, recurring: null },
      price_voice_s: { id: 'price_voice_s', active: true, livemode: false, metadata: APP, currency: 'usd', unit_amount: 999, recurring: null },
    };
    // `prices_` is the backing store; withRetrieve() puts a jest `prices.retrieve` over it.
    return {
      prices_: prices,
      customers: { create: jest.fn(async () => ({ id: 'cus_new' })), retrieve: jest.fn() },
      checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_new', url: 'https://checkout.example.test/cs_new' })), listLineItems: jest.fn() } },
      subscriptions: { retrieve: jest.fn(), cancel: jest.fn() },
      invoices: { retrieve: jest.fn() },
      charges: { retrieve: jest.fn() },
      paymentIntents: { create: jest.fn() },
    } as any;
  }

  const config = (secretKey = '') =>
    ({ get: jest.fn((key: string) => ({ 'stripe.secretKey': secretKey, 'stripe.appId': 'flacron-cv', frontendUrl: 'https://flacroncv.test' } as Record<string, unknown>)[key]) }) as any;
  const users = () =>
    ({
      findByIdOrThrow: jest.fn(async (uid: string) => (await firestore.collection('users').doc(uid).get()).data()),
      updateSubscription: jest.fn(),
    }) as any;

  async function seedUser(plan: SubscriptionPlan) {
    await firestore.collection('users').doc('u1').set({
      uid: 'u1',
      email: 'u1@example.test',
      subscription: { plan, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date(Date.now() + 20 * 86400_000), stripeCustomerId: 'cus_shared', stripeSubscriptionId: 'sub_v1' },
    });
  }

  function withRetrieve(s: any) {
    s.prices = { retrieve: jest.fn(async (id: string) => s.prices_[id]) };
    return s;
  }

  const make = (ctx: AvailabilityContext | null, secretKey = '') => {
    const avail = source(ctx);
    const svc = new CareerBillingService(config(secretKey), { firestore } as any, users(), stripe, avail);
    return { svc, avail };
  };

  async function nothingHappened() {
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect((await firestore.collection(PACK_PURCHASES).get()).docs).toHaveLength(0);
  }

  beforeAll(() => {
    for (const k of Object.keys(PRICES)) saved[k] = process.env[k];
  });
  afterAll(() => {
    for (const k of Object.keys(PRICES)) process.env[k] = saved[k];
  });
  beforeEach(() => {
    Object.assign(process.env, PRICES);
    firestore = new InMemoryFirestore();
    stripe = withRetrieve(stripeMock());
  });

  it('refuses voice, map, assisted-forms and alert packs although their Stripe prices are configured', async () => {
    await seedUser(SubscriptionPlan.CAREER_PRO);
    const { svc } = make(REALISTIC);
    const cases: [string, number, object][] = [
      ['voice_s', 999, { reason: 'provider_missing', provider: 'speech' }],
      ['map_200', 399, { reason: 'provider_missing', provider: 'mapTiles' }],
      ['assisted_form_25', 699, { reason: 'not_built' }],
      ['alert_s', 399, { reason: 'provider_missing', provider: 'jobFeeds' }],
    ];
    for (const [addonId, cents, detail] of cases) {
      const err = await svc.createPackCheckout('u1', { addonId, expectedAmountCents: cents }, urls).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ADDON_UNAVAILABLE', ...detail });
    }
    const capacity = await svc.createCapacityCheckout('u1', { addonId: 'saved_search_5', quantity: 1, expectedAmountCents: 299 }, urls).catch((e: unknown) => e);
    expect((capacity as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ADDON_UNAVAILABLE', provider: 'jobFeeds' });
    await nothingHappened();
  });

  it('a direct API request cannot bypass the restriction the web shows', async () => {
    await seedUser(SubscriptionPlan.CAREER_PRO);
    const { svc } = make(REALISTIC);
    const controller = new CareerBillingController(svc, config());
    const user = { uid: 'u1' } as any;
    const body = { addonId: 'voice_s', expectedAmountCents: 999, confirmed: true as const, locale: 'en' };
    const err = await runWithCaller({ idToken: 'tok', uid: 'u1', idempotencyKey: null }, () => controller.packCheckout(user, body as any, 'k1')).catch((e: unknown) => e);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ADDON_UNAVAILABLE' });
    // The status the web reads says the same thing for the same caller.
    const status = await runWithCaller({ idToken: 'tok', uid: 'u1', idempotencyKey: null }, () => controller.status(user));
    expect(status.addons.find((a) => a.id === 'voice_s')).toMatchObject({ onSale: true, available: false, unavailableReason: 'provider_missing', unavailableProvider: 'speech' });
    expect(status.addons.find((a) => a.id === 'document_s')).toMatchObject({ onSale: true, available: true, unavailableReason: null });
    await nothingHappened();
  });

  it('passes the caller\'s own ID token to the availability source', async () => {
    await seedUser(SubscriptionPlan.STARTER);
    const { svc, avail } = make(REALISTIC);
    await runWithCaller({ idToken: 'their-token', uid: 'u1', idempotencyKey: null }, () => svc.createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls));
    expect(avail.forCaller).toHaveBeenCalledWith('their-token');
  });

  it('with the career service unreachable nothing can be bought, not even a built pack', async () => {
    await seedUser(SubscriptionPlan.STARTER);
    const err = await make(null).svc.createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls).catch((e: unknown) => e);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'ADDON_UNAVAILABLE', reason: 'service_unavailable' });
    await nothingHappened();
  });

  it('an available pack still enforces plan eligibility', async () => {
    await seedUser(SubscriptionPlan.FREE);
    const err = await make(REALISTIC).svc.createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'UPGRADE_REQUIRED', minimumPlan: 'starter' });
    await nothingHappened();
  });

  it('refuses another app\'s price, an untagged price, a live price under a test key and an inactive price; no session', async () => {
    await seedUser(SubscriptionPlan.STARTER);
    const variants: [string, object, string][] = [
      ['other app', { metadata: { app_id: 'other-app' } }, 'ADDON_NOT_ON_SALE'],
      ['untagged', { metadata: {} }, 'ADDON_NOT_ON_SALE'],
      ['live under test key', { livemode: true }, 'ADDON_NOT_ON_SALE'],
      ['inactive', { active: false }, 'ADDON_PRICE_CHANGED'],
    ];
    for (const [, patch, code] of variants) {
      stripe = withRetrieve(stripeMock());
      Object.assign(stripe.prices_.price_doc_s, patch);
      const err = await make(REALISTIC, 'rk_test_dummy').svc.createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls).catch((e: unknown) => e);
      expect((err as { getResponse(): unknown }).getResponse()).toMatchObject({ code });
      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    }
    // The correct price still goes through.
    stripe = withRetrieve(stripeMock());
    const okResult = await make(REALISTIC, 'rk_test_dummy').svc.createPackCheckout('u1', { addonId: 'document_s', expectedAmountCents: 499 }, urls);
    expect(okResult.sessionId).toBe('cs_new');
    expect((await firestore.collection(PACK_PURCHASES).get()).docs).toHaveLength(0); // a session alone grants nothing
  });

  it('a pack already paid for is still granted after its feature becomes unavailable (only new purchases are guarded)', async () => {
    await seedUser(SubscriptionPlan.PROFESSIONAL);
    const { svc, avail } = make(null);
    stripe.checkout.sessions.listLineItems.mockResolvedValue({ data: [{ price: { id: 'price_voice_s' } }] });
    const event = {
      id: 'evt_voice', type: 'checkout.session.completed', created: 1_800_000_000, livemode: false,
      data: { object: { id: 'cs_voice', payment_status: 'paid', amount_total: 999, currency: 'usd', payment_intent: 'pi_voice', metadata: { ...APP, product: 'career_pack', addonId: 'voice_s', firebaseUid: 'u1' } } },
    } as any;
    expect(await svc.isCareerEvent(event)).toBe(true);
    await svc.apply(event);
    expect((await firestore.collection(PACK_PURCHASES).doc('cs_voice').get()).data()).toMatchObject({ uid: 'u1', addonId: 'voice_s', status: 'paid' });
    expect(avail.forCaller).not.toHaveBeenCalled();
  });
});
