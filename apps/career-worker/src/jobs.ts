import type { Pool } from 'pg';
import { AlertService, BillingService, FeedIngester, MeteringService, OpportunityService, SEARCH_TERMS_SQL, createAlertNotifier, createGeocoder, createRecordedEmailResolver, feedConfigFromEnv, feedsConfigured } from '@flacroncv/career-server';

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
  /** In-app reminders (deadlines, certification expiry); never spends alert quota. */
  alertReminders: 'alerts-reminders',
  /** Imports listings from configured job feeds; a no-op when none is configured. */
  feedIngest: 'feeds-ingest',
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
  [QUEUES.alertReminders]: '45 6 * * *',
  // Before alert matching (minute 15), so new listings are matched in the same hour.
  [QUEUES.feedIngest]: '5 * * * *',
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

/**
 * Alert jobs. They call the same service as the API. Only channels with a
 * configured provider send; the rest stay queued as `provider_unavailable`
 * and are sent once a provider is bound, never recorded as sent.
 */
export function alertHandlers(pool: Pool, env: NodeJS.ProcessEnv = process.env): Record<string, JobHandler> {
  // Email is bound once SES is configured; the address is the person's verified sign-in email.
  const notifier = createAlertNotifier(env, { resolveEmail: createRecordedEmailResolver(pool) });
  const alerts = new AlertService(pool, new MeteringService(pool), notifier, undefined, createGeocoder(env));
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
    [QUEUES.alertReminders]: async () => {
      const run = await alerts.runReminders();
      if (run.failed > 0) console.warn(`reminders: ${run.failed} person(s) failed; retried next run`);
    },
  };
}

/** Job-feed import. Configured by env only; with no source it does nothing (and fetches nothing). */
export function feedHandlers(pool: Pool, env: NodeJS.ProcessEnv = process.env): Record<string, JobHandler> {
  const config = feedConfigFromEnv(env);
  if (!feedsConfigured(config)) return { [QUEUES.feedIngest]: async () => undefined };
  const opportunities = new OpportunityService(pool);
  const terms = async () => (await pool.query<{ term: string }>(SEARCH_TERMS_SQL)).rows.map((r) => r.term);
  const ingester = new FeedIngester(config, opportunities, terms);
  return {
    [QUEUES.feedIngest]: async () => {
      const run = await ingester.runOnce();
      console.log(`feeds: ${run.sources} source call(s), ${run.fetched} listing(s), ${run.inserted} new, ${run.revised} revised`);
      if (run.failedSources.length > 0) console.warn(`feeds failed: ${run.failedSources.join(', ')}; retried next run`);
    },
  };
}
