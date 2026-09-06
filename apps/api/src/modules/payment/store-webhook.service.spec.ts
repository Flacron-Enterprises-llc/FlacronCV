import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { BillingProvider, PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { StoreWebhookService } from './store-webhook.service';
import { MobileBillingService } from './mobile-billing.service';
import { GoogleRtdnUnauthorizedError } from './google-rtdn-auth';
import { StoreUnavailableError } from './store-receipt-verifier';
import { AuditAction } from '../audit/audit-actions';

const FUTURE = new Date('2026-10-15T00:00:00.000Z');

function jws(payload: unknown): string {
  return `hdr.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
}

function makeConfig() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'iap.apple.bundleId') return 'com.flacroncv.mobile';
      if (key === 'iap.google.packageName') return 'com.flacroncv.mobile';
      if (key === 'iap.apple.products' || key === 'iap.google.products') {
        return { proMonthly: 'pro_monthly', proYearly: 'pro_yearly' };
      }
      return undefined;
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
  } as any;
}

function makeAudit() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logUserAction: jest.fn().mockResolvedValue(undefined),
    logSystemAction: jest.fn().mockResolvedValue(undefined),
  };
}

async function seedUser(
  firestore: InMemoryFirestore,
  uid: string,
  subscription: Record<string, unknown> = {},
) {
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
    usage: { aiCreditsUsed: 0, aiCreditsLimit: 5 },
  });
}

function makeHarness() {
  const firestore = new InMemoryFirestore();
  const audit = makeAudit();
  const storeVerifier = {
    inspectApple: jest.fn(),
    inspectGoogle: jest.fn(),
    verifyApple: jest.fn(),
    verifyGoogle: jest.fn(),
  };
  const googleRtdnAuth = { assert: jest.fn().mockResolvedValue(undefined) };
  const mobileBilling = new MobileBillingService(
    makeConfig(),
    { firestore } as any,
    makeUsersService(firestore),
    audit as any,
    storeVerifier as any,
  );
  const webhooks = new StoreWebhookService(
    makeConfig(),
    { firestore } as any,
    storeVerifier as any,
    mobileBilling,
    googleRtdnAuth as any,
  );
  return { firestore, audit, storeVerifier, googleRtdnAuth, webhooks };
}

describe('StoreWebhookService.handleAppleNotification', () => {
  it('acks TEST without calling the store', async () => {
    const { storeVerifier, webhooks, firestore } = makeHarness();
    await expect(
      webhooks.handleAppleNotification(
        jws({ notificationType: 'TEST', notificationUUID: 'uuid-test' }),
      ),
    ).resolves.toEqual({ received: true });
    expect(storeVerifier.inspectApple).not.toHaveBeenCalled();
    const evt = await firestore.collection('payment_events').doc('iap_apple_uuid-test').get();
    expect(evt.exists).toBe(true);
  });

  it('renews an Apple subscriber from store state', async () => {
    const { firestore, storeVerifier, webhooks, audit } = makeHarness();
    await seedUser(firestore, 'u-apple', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-1',
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-1',
      found: true,
      entitled: true,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'DID_RENEW',
        notificationUUID: 'uuid-renew',
        data: {
          bundleId: 'com.flacroncv.mobile',
          signedTransactionInfo: jws({ transactionId: 'tx-1', originalTransactionId: 'orig-1' }),
        },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-apple').get()).data() as any;
    expect(stored.subscription.currentPeriodEnd).toBe(FUTURE.toISOString());
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
    expect(audit.logSystemAction).toHaveBeenCalledWith(
      AuditAction.SUBSCRIPTION_CHANGED,
      'subscription',
      'u-apple',
      expect.anything(),
    );
  });

  it('revokes on a refund without touching leftover Stripe customer id', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-apple', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-1',
      stripeCustomerId: 'cus_old',
      currentPeriodEnd: FUTURE,
    });
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-1',
      found: true,
      entitled: false,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'REFUND',
        notificationUUID: 'uuid-refund',
        data: {
          bundleId: 'com.flacroncv.mobile',
          signedTransactionInfo: jws({ originalTransactionId: 'orig-1' }),
        },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-apple').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
    expect(stored.subscription.status).toBe(SubscriptionStatus.CANCELED);
    expect(stored.subscription.stripeCustomerId).toBe('cus_old');
    expect(stored.subscription.originalTransactionId).toBe('orig-1');
    expect(stored.subscription.currentPeriodEnd).toBeNull();
    expect(stored.usage.aiCreditsLimit).toBe(PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits);
  });

  it('acks when no user is linked yet', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-free');
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-unknown',
      found: true,
      entitled: true,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'SUBSCRIBED',
        notificationUUID: 'uuid-orphan',
        data: {
          bundleId: 'com.flacroncv.mobile',
          signedTransactionInfo: jws({ originalTransactionId: 'orig-unknown' }),
        },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-free').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
  });

  it('renews when provider is omitted but store ids are live (stale Stripe label)', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-apple', {
      plan: SubscriptionPlan.PRO,
      originalTransactionId: 'orig-1',
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-1',
      found: true,
      entitled: true,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'DID_RENEW',
        notificationUUID: 'uuid-omitted',
        data: {
          bundleId: 'com.flacroncv.mobile',
          signedTransactionInfo: jws({ originalTransactionId: 'orig-1' }),
        },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-apple').get()).data() as any;
    expect(stored.subscription.currentPeriodEnd).toBe(FUTURE.toISOString());
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
  });

  it('does not clobber a live Stripe subscriber with a stale store id and no period', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-stripe', {
      plan: SubscriptionPlan.PRO,
      stripeSubscriptionId: 'sub_live',
      originalTransactionId: 'orig-stale',
      currentPeriodEnd: null,
    });
    storeVerifier.inspectApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-stale',
      found: true,
      entitled: false,
    });

    await webhooks.handleAppleNotification(
      jws({
        notificationType: 'REFUND',
        notificationUUID: 'uuid-stripe',
        data: {
          bundleId: 'com.flacroncv.mobile',
          signedTransactionInfo: jws({ originalTransactionId: 'orig-stale' }),
        },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-stripe').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
    expect(stored.subscription.stripeSubscriptionId).toBe('sub_live');
  });

  it('is idempotent on notificationUUID', async () => {
    const { storeVerifier, webhooks } = makeHarness();
    const payload = jws({ notificationType: 'TEST', notificationUUID: 'uuid-dup' });
    await webhooks.handleAppleNotification(payload);
    await webhooks.handleAppleNotification(payload);
    expect(storeVerifier.inspectApple).not.toHaveBeenCalled();
  });

  it('rejects a malformed signedPayload', async () => {
    const { webhooks } = makeHarness();
    await expect(webhooks.handleAppleNotification('not-jws')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps a store outage to 503 so Apple retries', async () => {
    const { storeVerifier, webhooks } = makeHarness();
    storeVerifier.inspectApple.mockRejectedValue(new StoreUnavailableError('down'));
    await expect(
      webhooks.handleAppleNotification(
        jws({
          notificationType: 'DID_RENEW',
          notificationUUID: 'uuid-503',
          data: { signedTransactionInfo: jws({ transactionId: 'tx' }) },
        }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StoreWebhookService.handleGoogleRtdn', () => {
  function pubsub(data: unknown, messageId = 'msg-1') {
    return {
      message: {
        data: Buffer.from(JSON.stringify(data)).toString('base64'),
        messageId,
      },
    };
  }

  it('rejects a missing/invalid push token before touching the store', async () => {
    const { googleRtdnAuth, storeVerifier, webhooks } = makeHarness();
    googleRtdnAuth.assert.mockRejectedValue(new GoogleRtdnUnauthorizedError());
    await expect(webhooks.handleGoogleRtdn(undefined, pubsub({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(storeVerifier.inspectGoogle).not.toHaveBeenCalled();
  });

  it('acks a Play test notification', async () => {
    const { storeVerifier, webhooks } = makeHarness();
    await expect(
      webhooks.handleGoogleRtdn('Bearer tok', pubsub({ testNotification: { version: '1.0' } }, 'test-1')),
    ).resolves.toEqual({ received: true });
    expect(storeVerifier.inspectGoogle).not.toHaveBeenCalled();
  });

  it('renews a Google subscriber', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-g', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.GOOGLE,
      purchaseToken: 'tok-g',
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
    storeVerifier.inspectGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'pro_yearly',
      expiresAt: FUTURE,
      purchaseToken: 'tok-g',
      found: true,
      entitled: true,
    });

    await webhooks.handleGoogleRtdn(
      'Bearer tok',
      pubsub({
        packageName: 'com.flacroncv.mobile',
        subscriptionNotification: { notificationType: 2, purchaseToken: 'tok-g' },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-g').get()).data() as any;
    expect(stored.subscription.currentPeriodEnd).toBe(FUTURE.toISOString());
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
  });

  it('revokes on a voided purchase', async () => {
    const { firestore, storeVerifier, webhooks } = makeHarness();
    await seedUser(firestore, 'u-g', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.GOOGLE,
      purchaseToken: 'tok-g',
      currentPeriodEnd: FUTURE,
    });
    storeVerifier.inspectGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'pro_monthly',
      expiresAt: null,
      purchaseToken: 'tok-g',
      found: true,
      entitled: false,
    });

    await webhooks.handleGoogleRtdn(
      'Bearer tok',
      pubsub({
        packageName: 'com.flacroncv.mobile',
        voidedPurchaseNotification: { purchaseToken: 'tok-g' },
      }),
    );

    const stored = (await firestore.collection('users').doc('u-g').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
    expect(stored.subscription.purchaseToken).toBe('tok-g');
    expect(stored.subscription.currentPeriodEnd).toBeNull();
  });
});
