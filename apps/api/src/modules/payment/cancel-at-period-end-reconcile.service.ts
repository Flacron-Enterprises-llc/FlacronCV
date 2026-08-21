import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  resolveEffectivePlan,
  SubscriptionPlan,
  type EntitlementSubscription,
} from '@flacroncv/shared-types';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PaymentService } from './payment.service';

/**
 * Skip reasons logged when a candidate is not downgraded. Codes only — never
 * an email or a Stripe subscription id. Firestore uid is included so an
 * operator can find the row without those.
 */
export const CANCEL_AT_PERIOD_END_SKIP = {
  STILL_ACTIVE: 'still-active',
  RETRIEVE_FAILED: 'retrieve-failed',
  NO_SUBSCRIPTION_ID: 'no-subscription-id',
} as const;

export type CancelAtPeriodEndSkipReason =
  (typeof CANCEL_AT_PERIOD_END_SKIP)[keyof typeof CANCEL_AT_PERIOD_END_SKIP];

interface ReconcileSubscription extends EntitlementSubscription {
  stripeSubscriptionId?: string | null;
}

/** Every 15 minutes — matches MC8 grace; Stripe retrieve only the expired subset. */
const EVERY_FIFTEEN_MINUTES = '*/15 * * * *';

@Injectable()
export class CancelAtPeriodEndReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CancelAtPeriodEndReconcileService.name);
  private running = false;

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Heal already-expired cancel-at-period-end rows on boot so a deploy does
   * not wait for the first cron tick. `onApplicationBootstrap`, not
   * `onModuleInit` — Firebase must be ready (gotcha 2).
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcileExpiredCancellations();
    } catch (error) {
      this.logger.error(
        'cancel-at-period-end catch-up failed',
        (error as Error).message,
      );
    }
  }

  @Cron(EVERY_FIFTEEN_MINUTES)
  async reconcileExpiredCancellations(now: Date = new Date()): Promise<void> {
    if (this.running) {
      this.logger.warn('cancel-at-period-end reconcile already in progress — skipping');
      return;
    }
    this.running = true;

    try {
      // Single-field equality only. Nested period-end is filtered in memory
      // so this does not need a composite index (those have failed only in
      // production in this repo).
      const snapshot = await this.firebaseAdmin.firestore
        .collection('users')
        .where('subscription.cancelAtPeriodEnd', '==', true)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data() ?? {};
        const subscription = (data.subscription ?? {}) as ReconcileSubscription;

        if (resolveEffectivePlan(subscription, now) !== SubscriptionPlan.FREE) {
          continue;
        }

        await this.reconcileOne(doc.id, subscription);
      }
    } catch (error) {
      this.logger.error(
        'cancel-at-period-end reconcile failed',
        (error as Error).message,
      );
    } finally {
      this.running = false;
    }
  }

  private async reconcileOne(uid: string, subscription: ReconcileSubscription): Promise<void> {
    const stripeSubscriptionId =
      typeof subscription.stripeSubscriptionId === 'string' && subscription.stripeSubscriptionId
        ? subscription.stripeSubscriptionId
        : null;

    if (!stripeSubscriptionId) {
      this.logSkip(CANCEL_AT_PERIOD_END_SKIP.NO_SUBSCRIPTION_ID, uid);
      return;
    }

    let verdict: 'still-paid' | 'ended' | 'retrieve-failed';
    try {
      verdict = await this.paymentService.inspectStripeSubscriptionForReconcile(stripeSubscriptionId);
    } catch {
      this.logSkip(CANCEL_AT_PERIOD_END_SKIP.RETRIEVE_FAILED, uid);
      return;
    }

    if (verdict === 'still-paid') {
      this.logSkip(CANCEL_AT_PERIOD_END_SKIP.STILL_ACTIVE, uid);
      return;
    }
    if (verdict === 'retrieve-failed') {
      this.logSkip(CANCEL_AT_PERIOD_END_SKIP.RETRIEVE_FAILED, uid);
      return;
    }

    try {
      await this.paymentService.applyDeletedSubscriptionWrite(uid, stripeSubscriptionId);
    } catch {
      this.logger.error(`cancel_at_period_end_write_failed uid=${uid}`);
    }
  }

  private logSkip(reason: CancelAtPeriodEndSkipReason, uid: string): void {
    this.logger.warn(`cancel_at_period_end_skip ${reason} uid=${uid}`);
  }
}
