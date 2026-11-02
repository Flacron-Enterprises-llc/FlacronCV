import type { Pool } from 'pg';
import { AlertService, BillingService, MeteringService, RecordingAlertNotifier } from '@flacroncv/career-server';

export type JobHandler = (data: unknown) => Promise<void>;

export const QUEUES = {
  /** Proves the queue path end to end. Does nothing. */
  noop: 'noop',
  /** Section 11: the monthly grant on each account's anniversary, Free included. */
  renewals: 'billing-renewals',
  /** Packs past their twelve months become `expired`. */
  packExpiry: 'billing-pack-expiry',
  /** Reservations whose request process is gone are released. */
  releaseAbandoned: 'metering-release-abandoned',
  /** Scheduled match, then one alert item per new listing revision. */
  alertMatch: 'alerts-match',
  /** Weekly or daily email for items that have no email row yet. */
  alertDigest: 'alerts-digest',
} as const;

/** A request runs far shorter than this, so a job still running after it has no process left. */
export const ABANDONED_AFTER_MS = 15 * 60_000;

/** Cron, UTC. Each run is idempotent, so a missed or doubled run does no harm. */
export const SCHEDULES: Readonly<Record<string, string>> = {
  [QUEUES.renewals]: '*/15 * * * *',
  [QUEUES.packExpiry]: '7 * * * *',
  [QUEUES.releaseAbandoned]: '*/5 * * * *',
  [QUEUES.alertMatch]: '15 * * * *',
  [QUEUES.alertDigest]: '30 8 * * *',
};

export const DEFAULT_HANDLERS: Readonly<Record<string, JobHandler>> = {
  [QUEUES.noop]: async () => undefined,
};

/** The billing jobs. They call the same services as the API, not a copy. */
export function maintenanceHandlers(pool: Pool): Record<string, JobHandler> {
  const billing = new BillingService(pool);
  const metering = new MeteringService(pool);
  return {
    [QUEUES.renewals]: async () => {
      await billing.renewDueAccounts();
    },
    [QUEUES.packExpiry]: async () => {
      await billing.expirePacks();
    },
    [QUEUES.releaseAbandoned]: async () => {
      await metering.releaseAbandoned(ABANDONED_AFTER_MS);
    },
  };
}

/** Alert jobs. They call the same service as the API. The notifier does not leave the process. */
export function alertHandlers(pool: Pool): Record<string, JobHandler> {
  const alerts = new AlertService(pool, new MeteringService(pool), new RecordingAlertNotifier());
  return {
    // Per-person failures are isolated and retried on the next run; the count
    // (never who) is logged so a persistent problem is visible.
    [QUEUES.alertMatch]: async () => {
      const run = await alerts.runDue();
      if (run.failed > 0) console.warn(`alert matching: ${run.failed} person(s) failed; retried next run`);
    },
    [QUEUES.alertDigest]: async () => {
      const run = await alerts.sendDigests();
      if (run.failed > 0) console.warn(`alert digests: ${run.failed} person(s) failed; retried next run`);
    },
  };
}
