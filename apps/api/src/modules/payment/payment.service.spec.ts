import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';

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

describe('PaymentService', () => {
  let firestore: InMemoryFirestore;
  let usersService: ReturnType<typeof makeUsersService>;
  let service: PaymentService;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    usersService = makeUsersService(firestore);
    service = new PaymentService(makeConfig(), makeFirebaseAdmin(firestore), usersService);
  });

  // ─── createCheckoutSession ───────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('throws when Stripe is not configured (no key)', async () => {
      await seedUser(firestore, 'uid-1');
      await expect(
        service.createCheckoutSession('uid-1', 'price_test', 'http://ok', 'http://cancel'),
      ).rejects.toThrow();
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
});
