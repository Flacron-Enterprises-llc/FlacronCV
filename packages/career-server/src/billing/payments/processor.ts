import type { PurchaseChannel } from '@flacroncv/career-shared';
import type { Pool } from 'pg';
import {
  AccountRow,
  AccountStatus,
  advanceAllowancePeriod,
  endSubscription,
  findAccountBySubscription,
  lockAccount,
  renewPaidPeriod,
  scheduleChange,
  startSubscription,
  updateProviderState,
  upgradePlan,
  v2PlanOf,
} from '../accounts';
import { CatalogSnapshot, CatalogStore, isV2Plan, planRank } from '../catalog';
import { Db, withTransaction } from '../db';
import { BillingError } from '../errors';
import { grantPack, revokePack } from '../packs';
import type {
  CheckoutCompletedEvent,
  PaymentEvent,
  PaymentReceivedEvent,
  PaymentRefundedEvent,
  ProviderDelivery,
  SubscriptionStateEvent,
} from './events';
import { parseSkuKey, Sku, skuKey } from './skus';

export interface DeliveryOutcome {
  outcome: 'applied' | 'ignored' | 'rejected' | 'replayed';
  /** A reason code, or for a replay the first delivery's outcome. Never payload content. */
  detail: string | null;
  billingAccountId: string | null;
}

export interface ProcessorContext {
  catalogs: CatalogStore;
  /** New subscriptions are sold on this catalog version. */
  currentCatalogVersion: string;
  now: Date;
}

interface Applied {
  outcome: 'applied' | 'ignored';
  detail: string | null;
  accountId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * API_CONTRACT "Webhooks": entitlements change only after the signature
 * check (the caller) and the dedupe insert (here). A repeated provider
 * event id changes nothing. A delivery that breaks a billing rule (an id
 * that is not ours, a legacy row given a V2 price, a pack on Free) is
 * recorded as `rejected` with a reason and changes nothing else; the
 * provider is told `ok` so it does not retry what will never apply. Any
 * other error rolls back the whole delivery, so the provider retries.
 */
export async function processDelivery(
  pool: Pool,
  delivery: ProviderDelivery,
  ctx: ProcessorContext,
): Promise<DeliveryOutcome> {
  return withTransaction(pool, async (db) => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO billing_events (provider, provider_event_id, event_type, received_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT billing_events_provider_event_unique DO NOTHING
       RETURNING id`,
      [delivery.provider, delivery.eventId, delivery.eventType, ctx.now],
    );
    const eventRowId = inserted.rows[0]?.id;
    if (!eventRowId) {
      const first = await db.query<{ outcome: string; billing_account_id: string | null }>(
        `SELECT outcome, billing_account_id FROM billing_events WHERE provider = $1 AND provider_event_id = $2`,
        [delivery.provider, delivery.eventId],
      );
      return { outcome: 'replayed', detail: first.rows[0]?.outcome ?? null, billingAccountId: first.rows[0]?.billing_account_id ?? null };
    }

    await db.query('SAVEPOINT apply_delivery');
    let result: DeliveryOutcome;
    try {
      const applied = await applyAll(db, delivery, ctx);
      await db.query('RELEASE SAVEPOINT apply_delivery');
      result = { outcome: applied.outcome, detail: applied.detail, billingAccountId: applied.accountId };
    } catch (error) {
      if (!(error instanceof BillingError)) throw error;
      await db.query('ROLLBACK TO SAVEPOINT apply_delivery');
      const reason = typeof error.details.reason === 'string' ? `:${error.details.reason}` : '';
      result = { outcome: 'rejected', detail: `${error.code}${reason}`, billingAccountId: null };
    }

    await db.query(
      `UPDATE billing_events
          SET outcome = $2, detail = $3, billing_account_id = $4, processed_at = $5
        WHERE id = $1`,
      [eventRowId, result.outcome, result.detail, result.billingAccountId, ctx.now],
    );
    return result;
  });
}

async function applyAll(db: Db, delivery: ProviderDelivery, ctx: ProcessorContext): Promise<Applied> {
  let applied: Applied | null = null;
  let ignored: Applied | null = null;
  for (const event of delivery.events) {
    const result = await applyEvent(db, delivery.provider, event, ctx);
    if (result.outcome === 'applied') applied = result;
    else ignored ??= result;
  }
  return applied ?? ignored ?? { outcome: 'ignored', detail: 'no_events', accountId: null };
}

function applyEvent(db: Db, provider: PurchaseChannel, event: PaymentEvent, ctx: ProcessorContext): Promise<Applied> {
  switch (event.type) {
    case 'subscription_state':
      return applySubscriptionState(db, provider, event, ctx);
    case 'payment_received':
      return applyPaymentReceived(db, provider, event, ctx);
    case 'checkout_completed':
      return applyCheckoutCompleted(db, provider, event, ctx);
    case 'payment_refunded':
      return applyRefund(db, provider, event, ctx);
    case 'ignored':
      return Promise.resolve({ outcome: 'ignored', detail: event.reason, accountId: null });
    case 'malformed':
      return Promise.reject(new BillingError('validation_error', { reason: event.reason }));
  }
}

async function applySubscriptionState(
  db: Db,
  provider: PurchaseChannel,
  e: SubscriptionStateEvent,
  ctx: ProcessorContext,
): Promise<Applied> {
  if (!e.sku) throw new BillingError('validation_error', { reason: 'unknown_price' });
  if (e.sku.kind === 'pack') throw new BillingError('validation_error', { reason: 'pack_price_on_subscription' });
  if (e.status === 'trialing' && !e.trialEnd) {
    throw new BillingError('validation_error', { reason: 'trial_end_missing' });
  }

  let accountId = await findAccountBySubscription(db, provider, e.subscriptionId);
  let relinked = false;
  if (!accountId && e.previousSubscriptionId) {
    accountId = await findAccountBySubscription(db, provider, e.previousSubscriptionId);
    relinked = accountId !== null;
  }

  if (!accountId) {
    if (e.status === 'ended' || e.status === 'incomplete') {
      return { outcome: 'ignored', detail: 'unknown_subscription', accountId: null };
    }
    // A subscription we never saw paid must not start paid access: the
    // `active` (or `trialing`) event after the payment activates it.
    if (e.status === 'past_due') {
      return { outcome: 'ignored', detail: 'unpaid_subscription', accountId: null };
    }
    const account = await lockAccount(db, accountRef(e.accountId));
    if (isStale(account, e)) return { outcome: 'ignored', detail: 'stale', accountId: account.id };
    await activate(db, provider, account, e.sku, e, ctx);
    return { outcome: 'applied', detail: null, accountId: account.id };
  }

  const account = await lockAccount(db, accountId);
  if (isStale(account, e)) return { outcome: 'ignored', detail: 'stale', accountId };
  if (relinked) {
    await db.query(`UPDATE billing_accounts SET provider_subscription_id = $2, updated_at = now() WHERE id = $1`, [
      account.id,
      e.subscriptionId,
    ]);
    account.provider_subscription_id = e.subscriptionId;
  }
  const snapshot = await ctx.catalogs.get(db, account.catalog_version);
  if (isV2Plan(snapshot, account.plan_id)) {
    await reconcileV2(db, account, e.sku, e, snapshot, ctx);
  } else {
    await reconcileLegacy(db, account, e.sku, e, snapshot, ctx);
  }
  return { outcome: 'applied', detail: null, accountId };
}

/** A provider event older than the newest state already applied must not undo it. */
function isStale(account: AccountRow, e: SubscriptionStateEvent): boolean {
  return account.provider_state_at !== null && e.occurredAt < account.provider_state_at;
}

async function activate(
  db: Db,
  provider: PurchaseChannel,
  account: AccountRow,
  sku: Exclude<Sku, { kind: 'pack' }>,
  e: SubscriptionStateEvent,
  ctx: ProcessorContext,
): Promise<void> {
  if (sku.kind !== 'plan') {
    // V2 does not sell V1 prices to anyone new.
    throw new BillingError('validation_error', { reason: 'legacy_price_on_new_subscription' });
  }
  const snapshot = await ctx.catalogs.get(db, ctx.currentCatalogVersion);
  const started = await startSubscription(
    db,
    account,
    {
      planId: sku.planId,
      interval: sku.interval,
      provider,
      providerCustomerId: e.customerId,
      providerSubscriptionId: e.subscriptionId,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      status: e.status === 'trialing' ? 'trialing' : 'active',
      trialEnd: e.trialEnd,
    },
    snapshot,
    ctx.now,
  );
  await updateProviderState(db, started, providerState(e));
}

async function reconcileV2(
  db: Db,
  account: AccountRow,
  sku: Exclude<Sku, { kind: 'pack' }>,
  e: SubscriptionStateEvent,
  snapshot: CatalogSnapshot,
  ctx: ProcessorContext,
): Promise<void> {
  if (sku.kind !== 'plan') throw new BillingError('validation_error', { reason: 'legacy_price_on_v2_plan' });

  if (e.status === 'ended') {
    const ended = await endSubscription(db, account, snapshot, ctx.now);
    await db.query(`UPDATE billing_accounts SET provider_state_at = $2 WHERE id = $1`, [ended.id, e.occurredAt]);
    return;
  }

  // An unpaid invoice (past_due, or unpaid/incomplete) grants no upgrade and
  // no new period: the provider already moved its dates to the unpaid period.
  // The paid period and its allowance stay; the `active` event after the
  // payment applies both.
  const unpaid = e.status === 'past_due' || e.status === 'incomplete';
  if (!unpaid && planRank(snapshot, sku.planId) > planRank(snapshot, v2PlanOf(snapshot, account))) {
    await advanceAllowancePeriod(db, account, snapshot, ctx.now);
    await upgradePlan(db, account, sku.planId, snapshot);
    if (sku.interval !== account.interval) {
      await db.query(`UPDATE billing_accounts SET interval = $2, updated_at = now() WHERE id = $1`, [
        account.id,
        sku.interval,
      ]);
      account.interval = sku.interval;
    }
  }

  // A lower plan or another interval waits for the period end. What the
  // subscription renews into wins when the provider reports it.
  const next = e.nextSku?.kind === 'plan' ? e.nextSku : sku;
  await scheduleChange(db, account, next.planId, next.interval);
  if (!unpaid) await renewPaidPeriod(db, account, { start: e.periodStart, end: e.periodEnd }, snapshot, ctx.now);
  await updateProviderState(db, account, providerState(e));
}

/**
 * A V1 Pro, Enterprise, or Career Accelerator subscription keeps its
 * legacy plan (decision 2). Its dates and status follow the provider; its
 * plan id never becomes a V2 id here. What a lapsed legacy row becomes is P16.
 */
async function reconcileLegacy(
  db: Db,
  account: AccountRow,
  sku: Exclude<Sku, { kind: 'pack' }>,
  e: SubscriptionStateEvent,
  snapshot: CatalogSnapshot,
  ctx: ProcessorContext,
): Promise<void> {
  if (sku.kind !== 'legacy' || sku.legacyPlan !== account.legacy_plan) {
    throw new BillingError('validation_error', { reason: 'legacy_plan_mismatch' });
  }
  if (e.status === 'ended') {
    await updateProviderState(db, account, { ...providerState(e), status: 'canceled', cancelAtPeriodEnd: false });
    return;
  }
  await renewPaidPeriod(db, account, { start: e.periodStart, end: e.periodEnd }, snapshot, ctx.now);
  await updateProviderState(db, account, providerState(e));
}

function providerState(e: SubscriptionStateEvent) {
  const status: AccountStatus = e.status === 'ended' ? 'canceled' : e.status;
  return {
    status,
    cancelAtPeriodEnd: e.cancelAtPeriodEnd,
    trialEnd: e.status === 'trialing' ? e.trialEnd : null,
    customerId: e.customerId,
    stateAt: e.occurredAt,
  };
}

async function applyPaymentReceived(
  db: Db,
  provider: PurchaseChannel,
  e: PaymentReceivedEvent,
  ctx: ProcessorContext,
): Promise<Applied> {
  if (!e.sku) throw new BillingError('validation_error', { reason: 'unknown_price' });
  const bySubscription = e.subscriptionId ? await findAccountBySubscription(db, provider, e.subscriptionId) : null;
  const account = await lockAccount(db, bySubscription ?? accountRef(e.accountId));
  return recordPayment(db, provider, account, e.sku, e, ctx);
}

async function applyCheckoutCompleted(
  db: Db,
  provider: PurchaseChannel,
  e: CheckoutCompletedEvent,
  ctx: ProcessorContext,
): Promise<Applied> {
  const found = await db.query<{ billing_account_id: string; kind: string; sku: string }>(
    `SELECT billing_account_id, kind, sku FROM checkout_sessions WHERE provider = $1 AND provider_session_id = $2`,
    [provider, e.sessionId],
  );
  const session = found.rows[0];
  if (!session) throw new BillingError('validation_error', { reason: 'unknown_checkout' });
  if (session.kind === 'subscription') {
    // The subscription's own events carry its state and its invoices.
    return { outcome: 'ignored', detail: 'subscription_checkout', accountId: session.billing_account_id };
  }
  if (e.accountId !== null && e.accountId !== session.billing_account_id) {
    throw new BillingError('validation_error', { reason: 'checkout_account_mismatch' });
  }
  const sku = parseSkuKey(session.sku);
  if (!sku) throw new BillingError('validation_error', { reason: 'unknown_checkout_sku' });
  const account = await lockAccount(db, session.billing_account_id);
  return recordPayment(db, provider, account, sku, e, ctx);
}

/** One `purchases` row per provider payment; a pack purchase also inserts the pack. */
async function recordPayment(
  db: Db,
  provider: PurchaseChannel,
  account: AccountRow,
  sku: Sku,
  payment: { paymentId: string; amountCents: number | null; currency: string | null; paidAt: Date },
  ctx: ProcessorContext,
): Promise<Applied> {
  const priced = payment.amountCents !== null && payment.currency !== null;
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO purchases
       (billing_account_id, provider, provider_payment_id, kind, catalog_version, sku, amount_cents, currency, purchased_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT ON CONSTRAINT purchases_provider_payment_unique DO NOTHING
     RETURNING id`,
    [
      account.id,
      provider,
      payment.paymentId,
      sku.kind === 'pack' ? 'pack' : 'subscription',
      account.catalog_version,
      skuKey(sku),
      priced ? payment.amountCents : null,
      priced ? payment.currency?.toUpperCase() : null,
      payment.paidAt,
    ],
  );
  const purchaseId = inserted.rows[0]?.id;
  if (!purchaseId) return { outcome: 'ignored', detail: 'duplicate_payment', accountId: account.id };

  if (sku.kind === 'pack') {
    const snapshot = await ctx.catalogs.get(db, account.catalog_version);
    const pack = await grantPack(db, account, sku.addonId, payment.paidAt, snapshot);
    await db.query(`UPDATE packs SET purchase_id = $2 WHERE id = $1`, [pack.id, purchaseId]);
  }
  return { outcome: 'applied', detail: null, accountId: account.id };
}

/**
 * Section 11: a refund revokes only the related unused entitlement and
 * records the adjustment. For a pack, the unused units are revoked. A
 * subscription refund is recorded; access follows the provider's own
 * subscription events (it sends the cancellation if it cancels).
 */
async function applyRefund(
  db: Db,
  provider: PurchaseChannel,
  e: PaymentRefundedEvent,
  ctx: ProcessorContext,
): Promise<Applied> {
  const found = await db.query<{ billing_account_id: string }>(
    `SELECT billing_account_id FROM purchases WHERE provider = $1 AND provider_payment_id = $2`,
    [provider, e.paymentId],
  );
  if (!found.rows[0]) return { outcome: 'ignored', detail: 'unknown_payment', accountId: null };
  const account = await lockAccount(db, found.rows[0].billing_account_id);
  const locked = await db.query<{
    id: string;
    kind: string;
    amount_cents: number | null;
    refunded_cents: number | null;
    refunded_at: Date | null;
  }>(
    `SELECT id, kind, amount_cents, refunded_cents, refunded_at FROM purchases
      WHERE provider = $1 AND provider_payment_id = $2 FOR UPDATE`,
    [provider, e.paymentId],
  );
  const purchase = locked.rows[0];
  const refundedCents =
    e.refundedCents === null
      ? purchase.refunded_cents
      : Math.min(e.refundedCents, purchase.amount_cents ?? e.refundedCents);
  const nothingNew =
    purchase.refunded_at !== null && (refundedCents === null || refundedCents <= (purchase.refunded_cents ?? 0));
  if (nothingNew) return { outcome: 'ignored', detail: 'no_new_refund', accountId: account.id };

  await db.query(`UPDATE purchases SET refunded_cents = $2, refunded_at = $3 WHERE id = $1`, [
    purchase.id,
    refundedCents,
    e.occurredAt,
  ]);
  if (purchase.kind === 'pack') {
    const pack = await db.query<{ id: string }>(`SELECT id FROM packs WHERE purchase_id = $1`, [purchase.id]);
    if (pack.rows[0]) await revokePack(db, account, pack.rows[0].id, e.reason, ctx.now);
  }
  return { outcome: 'applied', detail: null, accountId: account.id };
}

function accountRef(id: string | null): string {
  if (!id || !UUID.test(id)) throw new BillingError('validation_error', { reason: 'no_account_reference' });
  return id;
}
