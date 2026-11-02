import { BillingError } from '../billing/errors';

export type FeedProvider = 'adzuna' | 'usajobs' | 'greenhouse' | 'lever';

/**
 * A live feed. Production has no provider key, so the only implementation
 * refuses. Tests pass recorded JSON to the parsers and never call this.
 */
export interface JobFeed {
  load(provider: FeedProvider): Promise<unknown>;
}

export class UnconfiguredJobFeed implements JobFeed {
  async load(_provider: FeedProvider): Promise<unknown> {
    throw new BillingError('provider_unavailable', { reason: 'feed_not_configured' });
  }
}
