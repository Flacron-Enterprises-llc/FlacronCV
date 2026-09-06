import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  BillingProvider,
  PLAN_CONFIGS,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { MobileBillingService } from './mobile-billing.service';
import { InvalidStoreReceiptError, StoreNotConfiguredError } from './store-receipt-verifier';
import { AuditAction } from '../audit/audit-actions';

const FUTURE = new Date('2026-10-15T00:00:00.000Z');
const PAST = new Date('2026-08-01T00:00:00.000Z');

function makeConfig() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'iap.apple.products' || key === 'iap.google.products') {
        return {
          proMonthly: 'pro_monthly',
          proYearly: 'pro_yearly',
          enterpriseMonthly: 'ent_monthly',
          enterpriseYearly: 'ent_yearly',
        };
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

describe('MobileBillingService.verify', () => {
  let firestore: InMemoryFirestore;
  let usersService: ReturnType<typeof makeUsersService>;
  let audit: ReturnType<typeof makeAudit>;
  let storeVerifier: {
    verifyApple: jest.Mock;
    verifyGoogle: jest.Mock;
  };
  let service: MobileBillingService;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    usersService = makeUsersService(firestore);
    audit = makeAudit();
    storeVerifier = {
      verifyApple: jest.fn(),
      verifyGoogle: jest.fn(),
    };
    service = new MobileBillingService(
      makeConfig(),
      { firestore } as any,
      usersService,
      audit as any,
      storeVerifier as any,
    );
  });

  it('grants Pro from a verified Apple receipt and writes provider fields', async () => {
    await seedUser(firestore, 'u-free', { stripeCustomerId: 'cus_old' });
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-1',
    });

    const result = await service.verify('u-free', {
      provider: BillingProvider.APPLE,
      signedTransactionInfo: 'header.payload.sig',
    });

    expect(result).toEqual({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      provider: BillingProvider.APPLE,
      currentPeriodEnd: FUTURE.toISOString(),
    });

    const stored = (await firestore.collection('users').doc('u-free').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
    expect(stored.subscription.provider).toBe(BillingProvider.APPLE);
    expect(stored.subscription.originalTransactionId).toBe('orig-1');
    expect(stored.subscription.purchaseToken).toBeNull();
    expect(stored.subscription.stripeCustomerId).toBe('cus_old');
    expect(stored.usage.aiCreditsLimit).toBe(PLAN_CONFIGS[SubscriptionPlan.PRO].limits.aiCredits);
    expect(storeVerifier.verifyGoogle).not.toHaveBeenCalled();
    expect(audit.logUserAction).toHaveBeenCalledWith(
      AuditAction.SUBSCRIPTION_ACTIVATED,
      expect.objectContaining({ uid: 'u-free' }),
      'subscription',
      'u-free',
      expect.objectContaining({
        metadata: expect.objectContaining({ provider: BillingProvider.APPLE, plan: SubscriptionPlan.PRO }),
      }),
    );
  });

  it('grants Enterprise from a verified Google purchase token', async () => {
    await seedUser(firestore, 'u-g');
    storeVerifier.verifyGoogle.mockResolvedValue({
      provider: BillingProvider.GOOGLE,
      productId: 'ent_yearly',
      expiresAt: FUTURE,
      purchaseToken: 'token-g',
    });

    const result = await service.verify('u-g', {
      provider: BillingProvider.GOOGLE,
      purchaseToken: 'token-g',
    });

    expect(result.plan).toBe(SubscriptionPlan.ENTERPRISE);
    expect(result.provider).toBe(BillingProvider.GOOGLE);
    const stored = (await firestore.collection('users').doc('u-g').get()).data() as any;
    expect(stored.subscription.purchaseToken).toBe('token-g');
    expect(stored.subscription.originalTransactionId).toBeNull();
    expect(storeVerifier.verifyApple).not.toHaveBeenCalled();
  });

  it('rejects a paid Stripe subscriber without calling the store', async () => {
    await seedUser(firestore, 'u-stripe', {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: 'sub_live',
      currentPeriodEnd: FUTURE,
    });

    await expect(
      service.verify('u-stripe', {
        provider: BillingProvider.APPLE,
        transactionId: 'tx-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storeVerifier.verifyApple).not.toHaveBeenCalled();
    const stored = (await firestore.collection('users').doc('u-stripe').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
    expect(stored.subscription.provider).toBeUndefined();
  });

  it('rejects an omitted-provider Stripe subscriber (existing docs) the same way', async () => {
    await seedUser(firestore, 'u-legacy', {
      plan: SubscriptionPlan.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: 'sub_ent',
      currentPeriodEnd: FUTURE,
    });

    await expect(
      service.verify('u-legacy', { provider: BillingProvider.GOOGLE, purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storeVerifier.verifyGoogle).not.toHaveBeenCalled();
  });

  it('does not write when the store says the purchase is expired', async () => {
    await seedUser(firestore, 'u-exp');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: PAST,
      originalTransactionId: 'orig-exp',
    });

    await expect(
      service.verify('u-exp', { provider: BillingProvider.APPLE, transactionId: 'tx' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stored = (await firestore.collection('users').doc('u-exp').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
    expect(stored.subscription.provider).toBeUndefined();
  });

  it('rejects an unknown product id without writing', async () => {
    await seedUser(firestore, 'u-sku');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'not_a_flacron_sku',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-x',
    });

    await expect(
      service.verify('u-sku', { provider: BillingProvider.APPLE, transactionId: 'tx' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stored = (await firestore.collection('users').doc('u-sku').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
  });

  it('maps a missing store config to 503 and does not write', async () => {
    await seedUser(firestore, 'u-503');
    storeVerifier.verifyApple.mockRejectedValue(new StoreNotConfiguredError('Apple IAP is not configured'));

    await expect(
      service.verify('u-503', { provider: BillingProvider.APPLE, transactionId: 'tx' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const stored = (await firestore.collection('users').doc('u-503').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
  });

  it('maps an invalid store receipt to 400', async () => {
    await seedUser(firestore, 'u-400');
    storeVerifier.verifyGoogle.mockRejectedValue(new InvalidStoreReceiptError('nope'));

    await expect(
      service.verify('u-400', { provider: BillingProvider.GOOGLE, purchaseToken: 't' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects Apple body without a transaction', async () => {
    await seedUser(firestore, 'u-shape');
    await expect(
      service.verify('u-shape', { provider: BillingProvider.APPLE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storeVerifier.verifyApple).not.toHaveBeenCalled();
  });

  it('refuses a receipt already linked to another account', async () => {
    await seedUser(firestore, 'owner', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-shared',
      currentPeriodEnd: FUTURE,
    });
    await seedUser(firestore, 'other');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_monthly',
      expiresAt: FUTURE,
      originalTransactionId: 'orig-shared',
    });

    await expect(
      service.verify('other', { provider: BillingProvider.APPLE, transactionId: 'tx' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const stored = (await firestore.collection('users').doc('other').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
  });

  it('is idempotent for the same Apple originalTransactionId on the same user', async () => {
    await seedUser(firestore, 'u-idemp', {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-1',
      currentPeriodEnd: PAST,
    });
    const later = new Date('2026-11-01T00:00:00.000Z');
    storeVerifier.verifyApple.mockResolvedValue({
      provider: BillingProvider.APPLE,
      productId: 'pro_yearly',
      expiresAt: later,
      originalTransactionId: 'orig-1',
    });

    const result = await service.verify('u-idemp', {
      provider: BillingProvider.APPLE,
      transactionId: 'tx',
    });

    expect(result.currentPeriodEnd).toBe(later.toISOString());
    const stored = (await firestore.collection('users').doc('u-idemp').get()).data() as any;
    expect(stored.subscription.originalTransactionId).toBe('orig-1');
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
  });
});

describe('MobileBillingService.revokeFromStore', () => {
  it('downgrades an Apple user to Free without clearing Stripe customer leftovers', async () => {
    const firestore = new InMemoryFirestore();
    await seedUser(firestore, 'u-apple', {
      plan: SubscriptionPlan.PRO,
      provider: BillingProvider.APPLE,
      originalTransactionId: 'orig-1',
      stripeCustomerId: 'cus_old',
      stripeSubscriptionId: null,
      currentPeriodEnd: FUTURE,
    });
    const service = new MobileBillingService(
      makeConfig(),
      { firestore } as any,
      makeUsersService(firestore),
      makeAudit() as any,
      { verifyApple: jest.fn(), verifyGoogle: jest.fn() } as any,
    );

    await expect(service.revokeFromStore('u-apple', 'apple:EXPIRED')).resolves.toBe(true);
    const stored = (await firestore.collection('users').doc('u-apple').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.FREE);
    expect(stored.subscription.status).toBe(SubscriptionStatus.CANCELED);
    expect(stored.subscription.originalTransactionId).toBe('orig-1');
    expect(stored.subscription.stripeCustomerId).toBe('cus_old');
    expect(stored.subscription.currentPeriodEnd).toBeNull();
    expect(stored.usage.aiCreditsLimit).toBe(PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits);
  });

  it('does not write when the account is billed by Stripe', async () => {
    const firestore = new InMemoryFirestore();
    await seedUser(firestore, 'u-stripe', {
      plan: SubscriptionPlan.PRO,
      stripeSubscriptionId: 'sub_live',
      currentPeriodEnd: FUTURE,
    });
    const service = new MobileBillingService(
      makeConfig(),
      { firestore } as any,
      makeUsersService(firestore),
      makeAudit() as any,
      { verifyApple: jest.fn(), verifyGoogle: jest.fn() } as any,
    );

    await expect(service.revokeFromStore('u-stripe', 'apple:REFUND')).resolves.toBe(false);
    const stored = (await firestore.collection('users').doc('u-stripe').get()).data() as any;
    expect(stored.subscription.plan).toBe(SubscriptionPlan.PRO);
    expect(stored.subscription.provider).toBeUndefined();
  });
});
