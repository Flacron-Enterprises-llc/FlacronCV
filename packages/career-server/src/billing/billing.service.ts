import type { PlanId } from '@flacroncv/career-shared';
import type { Pool } from 'pg';
import {
  AccountRow,
  advanceAllowancePeriod,
  createFreeAccount,
  endSubscription,
  lockAccount,
  readAccount,
  startSubscription,
  StartSubscriptionInput,
  upgradePlan,
} from './accounts';
import { CatalogSnapshot, CatalogStore, publishCatalog } from './catalog';
import { withTransaction } from './db';
import { commit, LedgerRow, release, reserve, ReserveInput, ReserveResult, unitBalance, UnitBalance } from './entitlements';
import { expirePacks, grantPack, listPacks, PackRow, packView, PackView, revokePack, RevokeReason } from './packs';

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * The one entitlement service (V2_ARCHITECTURE "Entitlements"). The API,
 * the worker, and the payment webhooks call this. Each method is one
 * transaction that starts with the billing account row lock.
 */
export class BillingService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = systemClock,
  ) {}

  publishCatalog(): Promise<'inserted' | 'unchanged'> {
    return publishCatalog(this.pool, this.clock.now());
  }

  catalog(version: string): Promise<CatalogSnapshot> {
    return this.catalogs.get(this.pool, version);
  }

  async createFreeAccount(input: {
    authUserId: string;
    locale?: 'en' | 'fr';
    anchor?: Date;
    origin?: 'v2' | 'migrated';
    hasUsedTrial?: boolean;
    catalogVersion: string;
  }): Promise<AccountRow> {
    const catalog = await this.catalog(input.catalogVersion);
    const now = this.clock.now();
    return withTransaction(this.pool, (db) =>
      createFreeAccount(db, { ...input, anchor: input.anchor ?? now, catalog, now }),
    );
  }

  async startSubscription(accountId: string, input: StartSubscriptionInput & { catalogVersion: string }): Promise<AccountRow> {
    const snapshot = await this.catalog(input.catalogVersion);
    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, accountId);
      return startSubscription(db, account, input, snapshot, this.clock.now());
    });
  }

  async endSubscription(accountId: string): Promise<AccountRow> {
    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, accountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      return endSubscription(db, account, snapshot, this.clock.now());
    });
  }

  async upgradePlan(accountId: string, toPlan: PlanId): Promise<Array<{ unit: string; delta: number }>> {
    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, accountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      await advanceAllowancePeriod(db, account, snapshot, this.clock.now());
      return upgradePlan(db, account, toPlan, snapshot);
    });
  }

  reserve(input: ReserveInput): Promise<ReserveResult> {
    return withTransaction(this.pool, (db) =>
      reserve(db, input, (version) => this.catalogs.get(db, version), this.clock.now()),
    );
  }

  commit(billingAccountId: string, ledgerId: string): Promise<LedgerRow> {
    return withTransaction(this.pool, (db) => commit(db, billingAccountId, ledgerId, this.clock.now()));
  }

  release(billingAccountId: string, ledgerId: string): Promise<LedgerRow> {
    return withTransaction(this.pool, (db) => release(db, billingAccountId, ledgerId, this.clock.now()));
  }

  async grantPack(accountId: string, addonId: string, purchasedAt?: Date): Promise<PackRow> {
    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, accountId);
      const snapshot = await this.catalogs.get(db, account.catalog_version);
      return grantPack(db, account, addonId, purchasedAt ?? this.clock.now(), snapshot);
    });
  }

  async revokePack(accountId: string, packId: string, reason: RevokeReason): Promise<{ pack: PackRow; revokedNow: number }> {
    return withTransaction(this.pool, async (db) => {
      const account = await lockAccount(db, accountId);
      return revokePack(db, account, packId, reason, this.clock.now());
    });
  }

  expirePacks(): Promise<number> {
    return withTransaction(this.pool, (db) => expirePacks(db, this.clock.now()));
  }

  /**
   * Worker job: every account whose allowance period has ended gets the
   * next monthly grant when its plan allows one. One transaction per
   * account. Accounts locked by a request right now are picked up on the
   * next run.
   */
  async renewDueAccounts(batchSize = 100): Promise<{ renewed: number; checked: number }> {
    const now = this.clock.now();
    let renewed = 0;
    let checked = 0;
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const due = await this.pool.query<{ id: string }>(
        `SELECT id FROM billing_accounts
          WHERE allowance_period_end <= $1 AND id > $2
          ORDER BY id
          LIMIT $3`,
        [now, after, batchSize],
      );
      for (const { id } of due.rows) {
        checked += 1;
        const advanced = await withTransaction(this.pool, async (db) => {
          const locked = await db.query<{ id: string }>(
            `SELECT id FROM billing_accounts WHERE id = $1 FOR UPDATE SKIP LOCKED`,
            [id],
          );
          if (!locked.rows[0]) return false;
          const account = await lockAccount(db, id);
          const snapshot = await this.catalogs.get(db, account.catalog_version);
          if (!snapshot.planOrder.some((p) => p === account.plan_id)) return false;
          return advanceAllowancePeriod(db, account, snapshot, now);
        });
        if (advanced) renewed += 1;
      }
      if (due.rows.length < batchSize) break;
      after = due.rows[due.rows.length - 1].id;
    }
    return { renewed, checked };
  }

  /** The billing page: balances by unit and every pack, held ones included (section 11). */
  async usage(accountId: string): Promise<{ account: AccountRow; units: UnitBalance[]; packs: PackView[] }> {
    const now = this.clock.now();
    const account = await readAccount(this.pool, accountId);
    const snapshot = await this.catalog(account.catalog_version);
    const units = await this.pool.query<{ unit: string }>(
      `SELECT DISTINCT unit FROM usage_balances WHERE billing_account_id = $1 AND allowance_period_start = $2
       UNION SELECT DISTINCT unit FROM packs WHERE billing_account_id = $1
       ORDER BY unit`,
      [accountId, account.allowance_period_start],
    );
    const balances: UnitBalance[] = [];
    for (const { unit } of units.rows) {
      balances.push(await unitBalance(this.pool, account, snapshot, unit, now));
    }
    const packs = await listPacks(this.pool, accountId);
    return { account, units: balances, packs: packs.map((p) => packView(p, account, snapshot, now)) };
  }

  async packs(accountId: string): Promise<PackView[]> {
    return (await this.usage(accountId)).packs;
  }

  /** Read-only access for tests and admin views. */
  async unitBalance(accountId: string, unit: string): Promise<UnitBalance> {
    const account = await readAccount(this.pool, accountId);
    const snapshot = await this.catalog(account.catalog_version);
    return unitBalance(this.pool, account, snapshot, unit, this.clock.now());
  }
}
