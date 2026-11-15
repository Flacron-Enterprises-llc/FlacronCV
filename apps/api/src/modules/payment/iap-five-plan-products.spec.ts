import { BadRequestException } from '@nestjs/common';
import { BillingProvider, PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import {
  CURRENT_IAP_PRODUCT_ENV,
  currentIapProductsFromEnv,
  mapIapProductId,
} from './iap-product-map';
import { MobileBillingService } from './mobile-billing.service';
import { StoreWebhookService } from './store-webhook.service';
import { coerceStoreDate } from './store-receipt-verifier';

const FUTURE = new Date(Date.now() + 30 * 86400000);
const PERIOD_START = new Date('2026-11-01T10:00:00.000Z');

/** Legacy products from configuration.ts plus five-plan products from env, per store. */
const ENV: Record<string, string> = {
  APPLE_STARTER_MONTHLY_PRODUCT_ID: 'ios.starter.m',
  APPLE_STARTER_ANNUAL_PRODUCT_ID: 'ios.starter.y',
  APPLE_PROFESSIONAL_MONTHLY_PRODUCT_ID: 'ios.pro2.m',
  APPLE_PROFESSIONAL_ANNUAL_PRODUCT_ID: 'ios.pro2.y',
  APPLE_CAREER_PRO_MONTHLY_PRODUCT_ID: 'ios.cpro.m',
  APPLE_CAREER_PRO_ANNUAL_PRODUCT_ID: '  ios.cpro.y  ',
  GOOGLE_STARTER_MONTHLY_PRODUCT_ID: 'gp.starter.m',
  GOOGLE_PROFESSIONAL_ANNUAL_PRODUCT_ID: 'gp.pro2.y',
  GOOGLE_CAREER_PRO_MONTHLY_PRODUCT_ID: '',
};

function makeConfig(env: Record<string, string> = ENV) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'iap.apple.bundleId' || key === 'iap.google.packageName') return 'com.flacroncv.mobile';
      if (key === 'iap.apple.products' || key === 'iap.google.products') {
        return { proMonthly: 'pro_monthly', proYearly: 'pro_yearly', enterpriseMonthly: 'ent_monthly' };
      }
      return env[key];
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
    rolloverUsageIfDue: jest.fn().mockResolvedValue(true),
  } as any;
}

function makeAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logUserAction: jest.fn().mockResolvedValue(undefined),
    logSystemAction: jest.fn().mockResolvedValue(undefined),
  };
}

async function seedUser(firestore: InMemoryFirestore, uid: string, subscription: Record<string, unknown> = {}) {
  await firestore.collection('users').doc(uid).set({
    uid,
    email: `${uid}@example.com`,
    role: 'user',
    subscription: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      ...subscription,
    },
    usage: { aiCreditsUsed: 0, aiCreditsLimit: 3 },
  });
}

describe('five-plan store products (env)', () => {
  it('reads every product env name per store, trimmed, blank as unset', () => {
    expect(currentIapProductsFromEnv('apple', (name) => ENV[name])).toEqual({
      starterMonthly: 'ios.starter.m',
      starterAnnual: 'ios.starter.y',
      professionalMonthly: 'ios.pro2.m',
      professionalAnnual: 'ios.pro2.y',
      careerProMonthly: 'ios.cpro.m',
      careerProAnnual: 'ios.cpro.y',
    });
    expect(currentIapProductsFromEnv('google', (name) => ENV[name])).toEqual({
      starterMonthly: 'gp.starter.m',
      professionalAnnual: 'gp.pro2.y',
    });
    expect(currentIapProductsFromEnv('google', () => undefined)).toEqual({});
  });

  it('names one env variable per store, plan and interval, and none for Business', () => {
    const names = [...Object.values(CURRENT_IAP_PRODUCT_ENV.apple), ...Object.values(CURRENT_IAP_PRODUCT_ENV.google)];
    expect(new Set(names).size).toBe(12);
    expect(names.some((name) => /BUSINESS/.test(name))).toBe(false);
  });

  it('maps new products to the new plans and keeps legacy products on the legacy plans', () => {
    const products = {
      proMonthly: 'pro_monthly',
      proYearly: 'pro_yearly',
      enterpriseMonthly: 'ent_monthly',
      enterpriseYearly: 'ent_yearly',
      ...currentIapProductsFromEnv('apple', (name) => ENV[name]),
    };
    expect(mapIapProductId(products, 'ios.starter.m')).toBe(SubscriptionPlan.STARTER);
    expect(mapIapProductId(products, 'ios.starter.y')).toBe(SubscriptionPlan.STARTER);
    expect(mapIapProductId(products, 'ios.pro2.m')).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(mapIapProductId(products, 'ios.pro2.y')).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(mapIapProductId(products, 'ios.cpro.m')).toBe(SubscriptionPlan.CAREER_PRO);
    expect(mapIapProductId(products, 'ios.cpro.y')).toBe(SubscriptionPlan.CAREER_PRO);
    expect(mapIapProductId(products, 'pro_monthly')).toBe(SubscriptionPlan.PRO);
    expect(mapIapProductId(products, 'pro_yearly')).toBe(SubscriptionPlan.PRO);
    expect(mapIapProductId(products, 'ent_yearly')).toBe(SubscriptionPlan.ENTERPRISE);
    expect(mapIapProductId(products, 'unknown')).toBeNull();
    expect(mapIapProductId(products, '')).toBeNull();
  });

  it('grants nothing for an id configured for two different plans', () => {
    expect(mapIapProductId({ proMonthly: 'same', starterMonthly: 'same' }, 'same')).toBeNull();
    // The same id twice for one plan (monthly == annual by mistake) is still that plan.
    expect(mapIapProductId({ starterMonthly: 'same', starterAnnual: 'same' }, 'same')).toBe(SubscriptionPlan.STARTER);
  });
});

describe('MobileBillingService with five-plan products', () => {
  function makeService() {
    const firestore = new InMemoryFirestore();
    const users = makeUsersService(firestore);
    const storeVerifier = { verifyApple: jest.fn(), verifyGoogle: jest.fn() };
    const audit = makeAudit();
    const service = new MobileBillingService(makeConfig(), { firestore } as any, users, audit as any, storeVerifier as any);
    return { firestore, users, storeVerifier, service };
  }

  it('grants Professional from an Apple purchase and anchors the allowance on the period start', async () => {
    const { firestore, users, storeVerifier, service } = makeService();
    await seedUser(firestore, 'u1');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'ios.pro2.y',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-9',
      periodStart: PERIOD_START,
    });

    const result = await service.verify('u1', { provider: BillingProvider.APPLE, transactionId: 'tx-9' });

    expect(result.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    const stored = (await firestore.collection('users').doc('u1').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(stored.subscription.provider).toBe(BillingProvider.APPLE);
    expect(new Date(stored.subscription.currentPeriodStart).toISOString()).toBe(PERIOD_START.toISOString());
    expect(stored.usage.aiCreditsLimit).toBe(PLAN_CONFIGS[SubscriptionPlan.PROFESSIONAL].limits.aiCredits);
    expect(users.rolloverUsageIfDue).toHaveBeenCalledWith('u1');
  });

  it('grants Starter from a Google purchase token', async () => {
    const { firestore, service, storeVerifier } = makeService();
    await seedUser(firestore, 'u2');
    storeVerifier.verifyGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'gp.starter.m',
      expiresAt: FUTURE,
      purchaseToken: 'tok-2',
    });

    const result = await service.verify('u2', { provider: BillingProvider.GOOGLE, purchaseToken: 'tok-2' });
    expect(result.plan).toBe(SubscriptionPlan.STARTER);
    const stored = (await firestore.collection('users').doc('u2').get()).data() as any;
    expect(stored.subscription.purchaseToken).toBe('tok-2');
    // No period start from the store: nothing invented.
    expect(stored.subscription.currentPeriodStart).toBeUndefined();
  });

  it('does not grant an Apple product id on Google (ids are per store)', async () => {
    const { firestore, service, storeVerifier } = makeService();
    await seedUser(firestore, 'u3');
    storeVerifier.verifyGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'ios.starter.m',
      expiresAt: FUTURE,
      purchaseToken: 'tok-3',
    });
    await expect(service.verify('u3', { provider: BillingProvider.GOOGLE, purchaseToken: 'tok-3' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const stored = (await firestore.collection('users').doc('u3').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
  });

  it('keeps mapping a legacy Pro product to legacy Pro, without a usage rollover', async () => {
    const { firestore, users, service, storeVerifier } = makeService();
    await seedUser(firestore, 'u4');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-4',
    });
    const result = await service.verify('u4', { provider: BillingProvider.APPLE, transactionId: 'tx-4' });
    expect(result.plan).toBe(SubscriptionPlan.PRO);
    expect(users.rolloverUsageIfDue).not.toHaveBeenCalled();
  });

  it('a failing usage rollover does not undo the grant', async () => {
    const { firestore, users, service, storeVerifier } = makeService();
    users.rolloverUsageIfDue.mockRejectedValue(new Error('boom'));
    await seedUser(firestore, 'u5');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'ios.cpro.m',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-5',
    });
    await expect(service.verify('u5', { provider: BillingProvider.APPLE, transactionId: 'tx-5' })).resolves.toMatchObject({
      plan: SubscriptionPlan.CAREER_PRO,
    });
  });
});

describe('store webhooks with five-plan products', () => {
  function jws(payload: unknown): string {
    return `hdr.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
  }

  function makeHarness() {
    const firestore = new InMemoryFirestore();
    const storeVerifier = { inspectApple: jest.fn(), inspectGoogle: jest.fn(), verifyApple: jest.fn(), verifyGoogle: jest.fn() };
    const mobileBilling = new MobileBillingService(
      makeConfig(),
      { firestore } as any,
      makeUsersService(firestore),
      makeAudit() as any,
      storeVerifier as any,
    );
    const webhooks = new StoreWebhookService(
      makeConfig(),
      { firestore } as any,
      storeVerifier as any,
      mobileBilling,
      { assert: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { firestore, storeVerifier, webhooks };
  }

  it('an Apple plan change (Starter → Career Pro) moves the account to the new plan', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-a', {
      plan: SubscriptionPlan.STARTER,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-a',
      currentPeriodEnd: FUTURE,
    });
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'ios.cpro.y',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-a',
      periodStart: PERIOD_START,
      found: true,
      entitled: true,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'DID_CHANGE_RENEWAL_PREF',
        notificationUUID: 'uuid-change',
        data: { bundleId: 'com.flacroncv.mobile', signedTransactionInfo: jws({ originalTransactionId: 'orig-a' }) },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-a').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.CAREER_PRO);
    expect(new Date(stored.subscription.currentPeriodStart).toISOString()).toBe(PERIOD_START.toISOString());
  });

  it('a Google renewal of an unconfigured product acks without changing the plan', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-g', {
      plan: SubscriptionPlan.STARTER,
      provider: BillingProvider.GOOGLE,
      purchaseToken: 'tok-g',
      currentPeriodEnd: FUTURE,
    });
    storeVerifier.inspectGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'gp.career_pro.m.not_configured',
      expiresAt: FUTURE,
      purchaseToken: 'tok-g',
      found: true,
      entitled: true,
    });

    await expect(
      webhooks.handleGoogleRtdn('Bearer x', {
        message: {
          data: Buffer.from(
            JSON.stringify({ packageName: 'com.flacroncv.mobile', subscriptionNotification: { notificationType: 2, purchaseToken: 'tok-g' } }),
          ).toString('base64'),
          messageId: 'm-1',
        },
      }),
    ).resolves.toEqual({ received: true });
    const stored = (await firestore.collection('users').doc('u-g').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.STARTER);
  });
});

describe('store period start parsing', () => {
  it('reads Apple millisecond and Google RFC 3339 dates', () => {
    expect(coerceStoreDate(PERIOD_START.getTime())?.toISOString()).toBe(PERIOD_START.toISOString());
    expect(coerceStoreDate('2026-11-01T10:00:00.000Z')?.toISOString()).toBe(PERIOD_START.toISOString());
    expect(coerceStoreDate(undefined)).toBeNull();
  });
});
