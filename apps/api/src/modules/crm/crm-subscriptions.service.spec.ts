import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CRMSubscriptionsService } from './crm-subscriptions.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

function makeConfig(stripeKey = '') {
  return { get: jest.fn().mockReturnValue(stripeKey) } as any;
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeSubDoc(id: string, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id,
    userId: 'user-1',
    stripeCustomerId: 'cus_test',
    plan: 'pro',
    priceId: 'price_test',
    interval: 'month',
    amount: 2999,
    currency: 'usd',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000),
    cancelAt: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedSub(firestore: InMemoryFirestore, data: Record<string, unknown>) {
  await firestore.collection('subscriptions').doc(data.id as string).set(data);
}

async function seedUser(firestore: InMemoryFirestore) {
  await firestore.collection('users').doc('user-1').set({
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
  });
}

describe('CRMSubscriptionsService', () => {
  let service: CRMSubscriptionsService;
  let firestore: InMemoryFirestore;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    service = new CRMSubscriptionsService(
      makeFirebaseAdmin(firestore),
      makeConfig(),
      makeAudit(),
    );
  });

  // ─── listSubscriptions ───────────────────────────────────────────────────────

  describe('listSubscriptions', () => {
    it('returns empty list when no subscriptions exist', async () => {
      const result = await service.listSubscriptions({});
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns subscriptions with enriched user info', async () => {
      await seedUser(firestore);
      await seedSub(firestore, makeSubDoc('sub-1'));

      const result = await service.listSubscriptions({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].userEmail).toBe('user@example.com');
      expect(result.items[0].userDisplayName).toBe('Test User');
    });

    it('paginates correctly', async () => {
      await seedUser(firestore);
      for (let i = 1; i <= 5; i++) {
        await seedSub(firestore, makeSubDoc(`sub-${i}`));
      }
      const result = await service.listSubscriptions({ page: 1, limit: 3 });
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.pages).toBe(2);
    });
  });

  // ─── getSubscriptionById ─────────────────────────────────────────────────────

  describe('getSubscriptionById', () => {
    it('throws NotFoundException for unknown id', async () => {
      await expect(service.getSubscriptionById('ghost')).rejects.toThrow(NotFoundException);
    });

    it('returns the subscription when found', async () => {
      await seedUser(firestore);
      await seedSub(firestore, makeSubDoc('sub-x'));

      const sub = await service.getSubscriptionById('sub-x');
      expect(sub.id).toBe('sub-x');
      expect(sub.plan).toBe('pro');
    });
  });

  // ─── cancelSubscription ──────────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('throws BadRequestException when Stripe is not configured', async () => {
      await seedUser(firestore);
      await seedSub(firestore, makeSubDoc('sub-y'));

      await expect(
        service.cancelSubscription('sub-y', 'actor', 'actor@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when subscription is already canceled', async () => {
      await seedUser(firestore);
      await seedSub(firestore, makeSubDoc('sub-z', { status: 'canceled' }));

      await expect(
        service.cancelSubscription('sub-z', 'actor', 'actor@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown subscription', async () => {
      await expect(
        service.cancelSubscription('nonexistent', 'actor', 'actor@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAllForExport ──────────────────────────────────────────────────────────

  describe('getAllForExport', () => {
    it('returns all subscriptions as a flat array', async () => {
      await seedUser(firestore);
      await seedSub(firestore, makeSubDoc('sub-e1'));
      await seedSub(firestore, makeSubDoc('sub-e2'));

      const result = await service.getAllForExport();
      expect(result.length).toBe(2);
    });
  });
});
