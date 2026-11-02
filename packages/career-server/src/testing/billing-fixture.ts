import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { BillingInterval, PlanId } from '@flacroncv/career-shared';
import type { AccountRow } from '../billing/accounts';
import { BillingService, Clock } from '../billing/billing.service';
import { fingerprintRequest } from '../billing/fingerprint';
import { createTestDatabase, TestDatabase } from './test-database';

export class TestClock implements Clock {
  private current: Date;

  constructor(iso: string) {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export interface BillingFixture {
  db: TestDatabase;
  clock: TestClock;
  billing: BillingService;
  freeAccount(options?: { anchor?: string; origin?: 'v2' | 'migrated' }): Promise<AccountRow>;
  paidAccount(planId: PlanId, interval: BillingInterval, periodStart: string): Promise<AccountRow>;
  /** Reserves and commits `count` single units, each with a new key. */
  spend(accountId: string, unit: string, count: number): Promise<void>;
  drop(): Promise<void>;
}

/** A migrated throwaway schema with the shared catalog published into it. */
export async function createBillingFixture(label: string, startIso: string): Promise<BillingFixture> {
  const db = await createTestDatabase(label);
  const clock = new TestClock(startIso);
  const billing = new BillingService(db.pool, clock);
  await billing.publishCatalog();

  const freeAccount: BillingFixture['freeAccount'] = (options = {}) =>
    billing.createFreeAccount({
      authUserId: `uid-${randomUUID()}`,
      anchor: options.anchor ? new Date(options.anchor) : undefined,
      origin: options.origin,
      catalogVersion: CATALOG_VERSION,
    });

  return {
    db,
    clock,
    billing,
    freeAccount,
    async paidAccount(planId, interval, periodStart) {
      const free = await freeAccount({ anchor: periodStart });
      return billing.startSubscription(free.id, {
        planId,
        interval,
        provider: 'stripe',
        providerSubscriptionId: `sub_${randomUUID()}`,
        periodStart: new Date(periodStart),
        catalogVersion: CATALOG_VERSION,
      });
    },
    async spend(accountId, unit, count) {
      for (let i = 0; i < count; i += 1) {
        const body = { unit, n: randomUUID() };
        const { ledger } = await billing.reserve({
          billingAccountId: accountId,
          unit,
          idempotencyKey: `spend-${body.n}`,
          requestFingerprint: fingerprintRequest(body),
          requestId: body.n,
        });
        await billing.commit(accountId, ledger.id);
      }
    },
    drop: () => db.drop(),
  };
}
