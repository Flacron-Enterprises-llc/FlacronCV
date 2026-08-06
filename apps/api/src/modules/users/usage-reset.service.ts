import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PLAN_CONFIGS, SubscriptionPlan } from '@flacroncv/shared-types';

const MARKER_COLLECTION = 'system';
const MARKER_DOC = 'usage_reset';
// Firestore allows at most 500 writes per batch.
const BATCH_LIMIT = 500;

@Injectable()
export class UsageResetService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsageResetService.name);
  private running = false;

  constructor(private readonly firebaseAdmin: FirebaseAdminService) {}

  /**
   * Catch-up on startup: cron only fires if the server happens to be awake at
   * midnight on the 1st. A period marker records the last month that was
   * reset; if the server was down when the month rolled over, this runs the
   * missed reset as soon as it boots.
   *
   * `onApplicationBootstrap`, NOT `onModuleInit`.
   *
   * FirebaseAdminService initialises the SDK in its own `onModuleInit`, and
   * Nest gives no ordering guarantee between two services' `onModuleInit`
   * hooks across modules. In practice this one won the race, so
   * `firebaseAdmin.firestore` was still undefined and every boot logged
   * "Usage reset catch-up check failed: Cannot read properties of undefined" —
   * caught and swallowed, so the catch-up NEVER ran. A server restarted across
   * a month boundary therefore left usage counters unreset, and users were
   * refused CV creation and AI credits despite a renewed allowance.
   * `onApplicationBootstrap` runs only after every module's `onModuleInit` has
   * completed, so Firebase is guaranteed ready here.
   * (Observed on a real boot, 2026-07-29.)
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const marker = await this.firebaseAdmin.firestore
        .collection(MARKER_COLLECTION)
        .doc(MARKER_DOC)
        .get();
      const lastResetPeriod = marker.data()?.lastResetPeriod as string | undefined;
      const current = this.currentPeriod();

      if (!lastResetPeriod) {
        // First run after this feature ships: assume the current month is
        // already in progress — initializing without resetting avoids zeroing
        // everyone's usage mid-month on deploy.
        await this.writeMarker(current);
        this.logger.log(`Usage reset marker initialized at ${current}`);
        return;
      }
      if (lastResetPeriod < current) {
        this.logger.log(`Missed usage reset detected (last: ${lastResetPeriod}, now: ${current}) — running catch-up`);
        await this.resetMonthlyUsage();
      }
    } catch (error) {
      this.logger.error('Usage reset catch-up check failed', (error as Error).message);
    }
  }

  /**
   * Runs at midnight on the 1st of every month.
   * Resets aiCreditsUsed and exportsThisMonth for all active users,
   * and syncs aiCreditsLimit to the user's current plan.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async resetMonthlyUsage(): Promise<void> {
    if (this.running) {
      this.logger.warn('Usage reset already in progress — skipping');
      return;
    }
    this.running = true;
    this.logger.log('Starting monthly usage reset...');

    try {
      const snapshot = await this.firebaseAdmin.firestore
        .collection('users')
        .where('isActive', '==', true)
        .get();

      const now = new Date();
      // A committed batch cannot accept further writes — a fresh batch is
      // required after every commit, or the reset dies at user #501.
      let batch = this.firebaseAdmin.firestore.batch();
      let opsInBatch = 0;
      let total = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const plan = (data?.subscription as { plan?: SubscriptionPlan } | undefined)?.plan || SubscriptionPlan.FREE;
        const newCreditsLimit = PLAN_CONFIGS[plan]?.limits?.aiCredits ?? 5;

        batch.update(doc.ref, {
          'usage.aiCreditsUsed': 0,
          'usage.exportsThisMonth': 0,
          'usage.aiCreditsLimit': newCreditsLimit,
          'usage.lastExportReset': now,
          updatedAt: now,
        });
        opsInBatch++;
        total++;

        if (opsInBatch === BATCH_LIMIT) {
          await batch.commit();
          this.logger.log(`Reset ${total} users...`);
          batch = this.firebaseAdmin.firestore.batch();
          opsInBatch = 0;
        }
      }

      if (opsInBatch > 0) {
        await batch.commit();
      }

      await this.writeMarker(this.currentPeriod());
      this.logger.log(`Monthly usage reset complete. ${total} users reset.`);
    } catch (error) {
      this.logger.error('Monthly usage reset failed', (error as Error).message);
    } finally {
      this.running = false;
    }
  }

  /** UTC year-month, e.g. "2026-07". String comparison orders correctly. */
  private currentPeriod(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async writeMarker(period: string): Promise<void> {
    await this.firebaseAdmin.firestore
      .collection(MARKER_COLLECTION)
      .doc(MARKER_DOC)
      .set({ lastResetPeriod: period, updatedAt: new Date() });
  }
}
