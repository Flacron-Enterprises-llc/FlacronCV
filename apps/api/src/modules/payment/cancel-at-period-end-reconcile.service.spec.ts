import { Logger } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@flacroncv/shared-types';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { PaymentService } from './payment.service';
import {
  CancelAtPeriodEndReconcileService,
  CANCEL_AT_PERIOD_END_SKIP,
} from './cancel-at-period-end-reconcile.service';

const NOW = new Date('2026-07-15T00:00:00.000Z');
const PAST = new Date('2026-06-15T00:00:00.000Z');
const FUTURE = new Date('2026-08-15T00:00:00.000Z');

const SECRET_SUB_ID = 'sub_must_never_appear_in_logs';
const SECRET_EMAIL = 'payer@example.com';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

function makeConfig() {
  return {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'stripe.secretKey': '',
        'stripe.webhookSecret': 'whsec_test',
        'stripe.prices': {},
      };
      return map[key];
    }),
  } as any;
}

function makeUsersService() {
  return {
    findByIdOrThrow: jest.fn(),
    updateSubscription: jest.fn().mockResolvedValue(undefined),
    updateUsage: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeAuditService() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    logUserAction: jest.fn().mockResolvedValue(undefined),
    logSystemAction: jest.fn().mockResolvedValue(undefined),
  };
}

function resourceMissing(message: string) {
  return Object.assign(new Error(message), { code: 'resource_missing' });
}

describe('CancelAtPeriodEndReconcileService', () => {
  let firestore: InMemoryFirestore;
  let usersService: ReturnType<typeof makeUsersService>;
  let paymentService: PaymentService;
  let service: CancelAtPeriodEndReconcileService;
  let warnSpy: jest.SpyInstance;
  let retrieve: jest.Mock;

  beforeEach(async () => {
    firestore = new InMemoryFirestore();
    usersService = makeUsersService();
    paymentService = new PaymentService(
      makeConfig(),
      makeFirebaseAdmin(firestore),
      usersService,
      makeAuditService() as any,
    );
    retrieve = jest.fn();
    (paymentService as any).stripe = { subscriptions: { retrieve } };

    service = new CancelAtPeriodEndReconcileService(
      makeFirebaseAdmin(firestore),
      paymentService,
    );
    warnSpy = jest.spyOn((service as unknown as { logger: Logger }).logger, 'warn');
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  async function seedExpiredCancel(uid: string, extra: Record<string, unknown> = {}) {
    await firestore.collection('users').doc(uid).set({
      uid,
      email: SECRET_EMAIL,
      subscription: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: PAST,
        stripeSubscriptionId: SECRET_SUB_ID,
        ...extra,
      },
    });
  }

  function loggedText(): string {
    return warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
  }

  it('NEVER writes Free when Stripe reports active', async () => {
    await seedExpiredCancel('payer-active');
    retrieve.mockResolvedValue({ status: 'active' });

    await service.reconcileExpiredCancellations(NOW);

    expect(usersService.updateSubscription).not.toHaveBeenCalled();
    expect(usersService.updateUsage).not.toHaveBeenCalled();
    expect(loggedText()).toContain(CANCEL_AT_PERIOD_END_SKIP.STILL_ACTIVE);
    expect(loggedText()).not.toContain(SECRET_SUB_ID);
    expect(loggedText()).not.toContain(SECRET_EMAIL);
  });

  it('NEVER writes Free when Stripe reports trialing', async () => {
    await seedExpiredCancel('payer-trialing');
    retrieve.mockResolvedValue({ status: 'trialing' });

    await service.reconcileExpiredCancellations(NOW);

    expect(usersService.updateSubscription).not.toHaveBeenCalled();
    expect(usersService.updateUsage).not.toHaveBeenCalled();
    expect(loggedText()).toContain(CANCEL_AT_PERIOD_END_SKIP.STILL_ACTIVE);
    expect(loggedText()).not.toContain(SECRET_SUB_ID);
    expect(loggedText()).not.toContain(SECRET_EMAIL);
  });

  it('reuses the deleted-handler write when Stripe reports canceled', async () => {
    await seedExpiredCancel('payer-ended');
    retrieve.mockResolvedValue({ status: 'canceled' });

    await service.reconcileExpiredCancellations(NOW);

    expect(usersService.updateSubscription).toHaveBeenCalledWith(
      'payer-ended',
      expect.objectContaining({
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELED,
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      }),
    );
    expect(usersService.updateUsage).toHaveBeenCalledTimes(1);
  });

  it('reuses the deleted-handler write when Stripe says the subscription is gone', async () => {
    await seedExpiredCancel('payer-missing');
    retrieve.mockRejectedValue(resourceMissing('No such subscription'));

    await service.reconcileExpiredCancellations(NOW);

    expect(usersService.updateSubscription).toHaveBeenCalledWith(
      'payer-missing',
      expect.objectContaining({ plan: SubscriptionPlan.FREE }),
    );
  });

  it('skips with retrieve-failed and does not write when Stripe retrieve errors', async () => {
    await seedExpiredCancel('payer-timeout');
    retrieve.mockRejectedValue(new Error('ETIMEDOUT'));

    await service.reconcileExpiredCancellations(NOW);

    expect(usersService.updateSubscription).not.toHaveBeenCalled();
    expect(loggedText()).toContain(CANCEL_AT_PERIOD_END_SKIP.RETRIEVE_FAILED);
    expect(loggedText()).not.toContain(SECRET_SUB_ID);
    expect(loggedText()).not.toContain(SECRET_EMAIL);
    expect(loggedText()).not.toContain('ETIMEDOUT');
  });

  it('skips with no-subscription-id and does not write', async () => {
    await seedExpiredCancel('payer-nosub', { stripeSubscriptionId: null });

    await service.reconcileExpiredCancellations(NOW);

    expect(retrieve).not.toHaveBeenCalled();
    expect(usersService.updateSubscription).not.toHaveBeenCalled();
    expect(loggedText()).toContain(CANCEL_AT_PERIOD_END_SKIP.NO_SUBSCRIPTION_ID);
    expect(loggedText()).not.toContain(SECRET_EMAIL);
  });

  it('does not retrieve or write when the paid period has not ended', async () => {
    await firestore.collection('users').doc('still-paid-window').set({
      uid: 'still-paid-window',
      email: SECRET_EMAIL,
      subscription: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: FUTURE,
        stripeSubscriptionId: SECRET_SUB_ID,
      },
    });

    await service.reconcileExpiredCancellations(NOW);

    expect(retrieve).not.toHaveBeenCalled();
    expect(usersService.updateSubscription).not.toHaveBeenCalled();
  });

  it('does not query-match users who are not cancel-at-period-end', async () => {
    await firestore.collection('users').doc('plain-pro').set({
      uid: 'plain-pro',
      subscription: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: PAST,
        stripeSubscriptionId: SECRET_SUB_ID,
      },
    });

    await service.reconcileExpiredCancellations(NOW);

    expect(retrieve).not.toHaveBeenCalled();
    expect(usersService.updateSubscription).not.toHaveBeenCalled();
  });

  it('runs the same reconcile on bootstrap catch-up', async () => {
    const spy = jest.spyOn(service, 'reconcileExpiredCancellations').mockResolvedValue(undefined);

    await service.onApplicationBootstrap();

    expect(spy).toHaveBeenCalled();
  });
});
