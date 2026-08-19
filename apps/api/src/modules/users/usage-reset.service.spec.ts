import { Test, TestingModule } from '@nestjs/testing';
import { UsageResetService } from './usage-reset.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { createMockFirebaseAdmin } from '../../test-utils/mock-firebase-admin';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('UsageResetService', () => {
  let service: UsageResetService;
  let mockFirebaseAdmin: ReturnType<typeof createMockFirebaseAdmin>;
  let firestore: InMemoryFirestore;
  let batchSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockFirebaseAdmin = createMockFirebaseAdmin();
    firestore = mockFirebaseAdmin.firestore as InMemoryFirestore;
    batchSpy = jest.spyOn(firestore, 'batch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageResetService,
        { provide: FirebaseAdminService, useValue: mockFirebaseAdmin },
      ],
    }).compile();

    service = module.get<UsageResetService>(UsageResetService);
  });

  async function seedUsers(count: number, plan = 'pro'): Promise<void> {
    for (let i = 0; i < count; i++) {
      await firestore.collection('users').doc(`u${i}`).set({
        uid: `u${i}`,
        isActive: true,
        subscription: { plan },
        usage: {
          aiCreditsUsed: 42,
          exportsThisMonth: 7,
          aiCreditsLimit: 1,
          cvsCreated: 8,
          coverLettersCreated: 15,
        },
      });
    }
  }

  describe('resetMonthlyUsage', () => {
    it('resets usage counters and syncs the credit limit to the plan', async () => {
      await seedUsers(3, 'pro');

      await service.resetMonthlyUsage();

      const doc = await firestore.collection('users').doc('u1').get();
      const usage = doc.data()?.usage as Record<string, unknown>;
      expect(usage.aiCreditsUsed).toBe(0);
      expect(usage.exportsThisMonth).toBe(0);
      expect(usage.cvsCreated).toBe(0);
      expect(usage.coverLettersCreated).toBe(0);
      expect(usage.aiCreditsLimit).toBe(100); // Pro plan credits
      expect(usage.lastExportReset).toBeDefined();
    });

    it('uses a fresh batch for every 500 writes so large user bases reset fully', async () => {
      await seedUsers(501, 'pro');
      batchSpy.mockClear();

      await service.resetMonthlyUsage();

      // 501 users → one full batch of 500 + one batch with the remainder
      expect(batchSpy).toHaveBeenCalledTimes(2);
      const last = await firestore.collection('users').doc('u500').get();
      expect((last.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(0);
    });

    it('completes cleanly when the user count is an exact batch multiple', async () => {
      await seedUsers(500, 'pro');
      const commitSpies: jest.SpyInstance[] = [];
      batchSpy.mockClear();
      batchSpy.mockImplementation(function (this: InMemoryFirestore) {
        const batch = InMemoryFirestore.prototype.batch.call(firestore);
        commitSpies.push(jest.spyOn(batch, 'commit'));
        return batch;
      });

      await expect(service.resetMonthlyUsage()).resolves.toBeUndefined();

      // The full batch commits exactly once; the fresh follow-up batch is
      // never committed empty. No batch object is ever committed twice.
      const commitCounts = commitSpies.map((s) => s.mock.calls.length);
      expect(commitCounts.every((c) => c <= 1)).toBe(true);
      expect(commitCounts.reduce((a, b) => a + b, 0)).toBe(1);
      const last = await firestore.collection('users').doc('u499').get();
      expect((last.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(0);
      const marker = await firestore.collection('system').doc('usage_reset').get();
      expect(marker.data()?.lastResetPeriod).toBe(currentPeriod());
    });

    it('records the reset period marker after a successful run', async () => {
      await seedUsers(1);

      await service.resetMonthlyUsage();

      const marker = await firestore.collection('system').doc('usage_reset').get();
      expect(marker.data()?.lastResetPeriod).toBe(currentPeriod());
    });

    it('skips inactive users', async () => {
      await firestore.collection('users').doc('inactive').set({
        uid: 'inactive',
        isActive: false,
        usage: { aiCreditsUsed: 9 },
      });

      await service.resetMonthlyUsage();

      const doc = await firestore.collection('users').doc('inactive').get();
      expect((doc.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(9);
    });

    it('does not write a FREE document at all', async () => {
      // Values-unchanged is not enough: a write of the same numbers would
      // also pass. Spy the batch so a skip and a no-op write cannot look alike.
      await firestore.collection('users').doc('free-1').set({
        uid: 'free-1',
        isActive: true,
        subscription: { plan: 'free' },
        usage: {
          aiCreditsUsed: 4,
          exportsThisMonth: 1,
          aiCreditsLimit: 5,
          cvsCreated: 5,
          coverLettersCreated: 1,
        },
      });
      await firestore.collection('users').doc('pro-1').set({
        uid: 'pro-1',
        isActive: true,
        subscription: { plan: 'pro', status: 'past_due' },
        usage: {
          aiCreditsUsed: 42,
          exportsThisMonth: 7,
          aiCreditsLimit: 1,
          cvsCreated: 8,
          coverLettersCreated: 15,
        },
      });

      const writtenIds: string[] = [];
      batchSpy.mockClear();
      batchSpy.mockImplementation(function (this: InMemoryFirestore) {
        const batch = InMemoryFirestore.prototype.batch.call(firestore);
        const origUpdate = batch.update.bind(batch);
        batch.update = (ref, data) => {
          writtenIds.push(ref.id);
          origUpdate(ref, data);
        };
        return batch;
      });

      await service.resetMonthlyUsage();

      expect(writtenIds).toEqual(['pro-1']);
      const free = await firestore.collection('users').doc('free-1').get();
      const freeUsage = free.data()?.usage as Record<string, unknown>;
      expect(freeUsage.aiCreditsUsed).toBe(4);
      expect(freeUsage.exportsThisMonth).toBe(1);
      expect(freeUsage.aiCreditsLimit).toBe(5);
      expect(freeUsage.cvsCreated).toBe(5);
      expect(freeUsage.coverLettersCreated).toBe(1);
      expect(freeUsage.lastExportReset).toBeUndefined();
      const pro = await firestore.collection('users').doc('pro-1').get();
      const proUsage = pro.data()?.usage as Record<string, unknown>;
      expect(proUsage.aiCreditsUsed).toBe(0);
      expect(proUsage.exportsThisMonth).toBe(0);
      expect(proUsage.cvsCreated).toBe(0);
      expect(proUsage.coverLettersCreated).toBe(0);
    });

    it('treats a missing subscription.plan as Free and does not write the doc', async () => {
      await firestore.collection('users').doc('no-plan').set({
        uid: 'no-plan',
        isActive: true,
        subscription: {},
        usage: { aiCreditsUsed: 3, exportsThisMonth: 1, aiCreditsLimit: 5 },
      });

      const writtenIds: string[] = [];
      batchSpy.mockClear();
      batchSpy.mockImplementation(function (this: InMemoryFirestore) {
        const batch = InMemoryFirestore.prototype.batch.call(firestore);
        const origUpdate = batch.update.bind(batch);
        batch.update = (ref, data) => {
          writtenIds.push(ref.id);
          origUpdate(ref, data);
        };
        return batch;
      });

      await service.resetMonthlyUsage();

      expect(writtenIds).toEqual([]);
      const usage = (await firestore.collection('users').doc('no-plan').get()).data()?.usage as Record<
        string,
        unknown
      >;
      expect(usage.aiCreditsUsed).toBe(3);
    });
  });

  describe('onApplicationBootstrap (startup catch-up)', () => {
    it('initializes the marker without resetting on first ever boot', async () => {
      await seedUsers(1);

      await service.onApplicationBootstrap();

      const marker = await firestore.collection('system').doc('usage_reset').get();
      expect(marker.data()?.lastResetPeriod).toBe(currentPeriod());
      // Usage untouched — no mid-month zeroing on first deploy.
      const doc = await firestore.collection('users').doc('u0').get();
      expect((doc.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(42);
    });

    it('runs a catch-up reset when the marker is from a previous month', async () => {
      await seedUsers(1);
      await firestore.collection('system').doc('usage_reset').set({ lastResetPeriod: '2000-01' });

      await service.onApplicationBootstrap();

      const doc = await firestore.collection('users').doc('u0').get();
      expect((doc.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(0);
      const marker = await firestore.collection('system').doc('usage_reset').get();
      expect(marker.data()?.lastResetPeriod).toBe(currentPeriod());
    });

    it('does nothing when the marker is already the current month', async () => {
      await seedUsers(1);
      await firestore.collection('system').doc('usage_reset').set({ lastResetPeriod: currentPeriod() });

      await service.onApplicationBootstrap();

      const doc = await firestore.collection('users').doc('u0').get();
      expect((doc.data()?.usage as Record<string, unknown>).aiCreditsUsed).toBe(42);
    });
  });
});
