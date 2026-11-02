import type { BillingInterval, PlanId, PurchaseChannel } from '@flacroncv/career-shared';
import type { Pool } from 'pg';
import { readAccount, SPENDABLE_STATUSES, v2PlanOf } from '../accounts';
import { allowanceDeltas, CatalogSnapshot, CatalogStore, isV2Plan, planRank } from '../catalog';
import { withTransaction } from '../db';
import { BillingError } from '../errors';
import { fingerprintRequest } from '../fingerprint';
import { ProviderSkus, Sku, skuKey } from './skus';

export interface StripeCheckoutRequest {
  mode: 'subscription' | 'payment';
  priceId: string;
  billingAccountId: string;
  customerId: string | null;
  trialDays: number | null;
  /** Sent as Stripe's Idempotency-Key, so a retried create returns the same session. */
  idempotencyKey: string;
  /** Copied to the session and, for subscriptions, to the subscription. */
  metadata: Record<string, string>;
}

export interface StripeUpgradeQuoteRequest {
  subscriptionId: string;
  currentPriceId: string;
  newPriceId: string;
  periodStart: Date;
  periodEnd: Date;
  at: Date;
}

/** The Stripe calls the server makes. The live implementation needs `STRIPE_SECRET_KEY` (Pending keys). */
export interface StripeGateway {
  createCheckoutSession(request: StripeCheckoutRequest): Promise<{ sessionId: string; url: string }>;
  /** Stripe's upcoming-invoice proration for a price change. */
  quoteUpgrade(request: StripeUpgradeQuoteRequest): Promise<{ proratedCents: number }>;
  /** Hosted billing portal. The live call needs a configured Stripe account. */
  createBillingPortal(request: { billingAccountId: string; customerId: string | null }): Promise<{ url: string }>;
}

export class UnconfiguredStripeGateway implements StripeGateway {
  createCheckoutSession(): Promise<{ sessionId: string; url: string }> {
    return Promise.reject(new BillingError('provider_unavailable', { reason: 'stripe_not_configured' }));
  }
  quoteUpgrade(): Promise<{ proratedCents: number }> {
    return Promise.reject(new BillingError('provider_unavailable', { reason: 'stripe_not_configured' }));
  }
  createBillingPortal(): Promise<{ url: string }> {
    return Promise.reject(new BillingError('provider_unavailable', { reason: 'stripe_not_configured' }));
  }
}

export interface CheckoutDeps {
  pool: Pool;
  catalogs: CatalogStore;
  currentCatalogVersion: string;
  skus: Record<PurchaseChannel, ProviderSkus>;
  stripe: StripeGateway;
}

/** API_CONTRACT checkout body. There is no price id field; nothing the client sends picks a price. */
export interface CheckoutRequest {
  planId: PlanId;
  interval: BillingInterval;
  provider: PurchaseChannel;
  idempotencyKey: string;
}

export type CheckoutResult =
  | { provider: 'stripe'; url: string; sessionId: string; trialDays: number | null }
  | { provider: 'apple' | 'google'; productId: string; accountToken: string };

/**
 * API_CONTRACT "Checkout rules": the server loads the plan and interval
 * from the current catalog snapshot, refuses a provider outside its
 * channels (`channel_unavailable`), and picks the provider id itself.
 * Professional gets the snapshot's trial only when `has_used_trial` is
 * false. Stores get the product id and our account token; the app buys,
 * and the store's notification activates the plan.
 */
export async function createCheckout(
  deps: CheckoutDeps,
  accountId: string,
  request: CheckoutRequest,
): Promise<CheckoutResult> {
  const snapshot = await deps.catalogs.get(deps.pool, deps.currentCatalogVersion);
  const { planId, interval, provider } = request;
  if (!isV2Plan(snapshot, planId) || planId === 'free') {
    throw new BillingError('validation_error', { reason: 'not_a_paid_plan' });
  }
  if (!snapshot.purchaseChannels[planId][interval].includes(provider)) {
    throw new BillingError('channel_unavailable', { planId, interval, provider });
  }
  const account = await readAccount(deps.pool, accountId);
  const payingV2 = account.plan_id !== 'free' && isV2Plan(snapshot, account.plan_id) && account.status !== 'canceled';
  if (payingV2) {
    // A paid-to-paid change goes through the provider's plan change and upgrade preview.
    throw new BillingError('validation_error', { reason: 'already_subscribed' });
  }

  const sku: Sku = { kind: 'plan', planId, interval };
  const priceRef = deps.skus[provider].refFor(sku);
  if (!priceRef) throw new BillingError('provider_unavailable', { reason: 'price_not_configured' });
  if (provider !== 'stripe') return { provider, productId: priceRef, accountToken: account.id };

  const trial = snapshot.trials[planId];
  const trialDays = trial && trial.intervals.includes(interval) && !account.has_used_trial ? trial.days : null;
  return stripeSession(deps, snapshot, account.id, account.provider_customer_id, {
    kind: 'subscription',
    sku,
    interval,
    priceRef,
    trialDays,
    idempotencyKey: request.idempotencyKey,
    fingerprint: fingerprintRequest({ planId, interval, provider }),
  });
}

/** A one-time usage pack on the website. Section 9: Free cannot buy packs; each pack has a plan minimum. */
export async function createPackCheckout(
  deps: CheckoutDeps,
  accountId: string,
  request: { addonId: string; idempotencyKey: string },
): Promise<CheckoutResult> {
  const account = await readAccount(deps.pool, accountId);
  const snapshot = await deps.catalogs.get(deps.pool, account.catalog_version);
  const addon = snapshot.addons.find((a) => a.id === request.addonId);
  if (!addon || addon.kind !== 'usage_pack' || addon.billing !== 'one_time' || addon.status !== 'active' || !addon.firmPrice) {
    throw new BillingError('not_purchasable', { addonId: request.addonId });
  }
  if (planRank(snapshot, v2PlanOf(snapshot, account)) < planRank(snapshot, addon.minPlan)) {
    throw new BillingError('not_purchasable', { addonId: addon.id, minimumPlan: addon.minPlan });
  }
  if (!SPENDABLE_STATUSES.includes(account.status)) {
    throw new BillingError('billing_inactive', { status: account.status });
  }
  const sku: Sku = { kind: 'pack', addonId: addon.id };
  const priceRef = deps.skus.stripe.refFor(sku);
  if (!priceRef) throw new BillingError('provider_unavailable', { reason: 'price_not_configured' });
  return stripeSession(deps, snapshot, account.id, account.provider_customer_id, {
    kind: 'pack',
    sku,
    interval: null,
    priceRef,
    trialDays: null,
    idempotencyKey: request.idempotencyKey,
    fingerprint: fingerprintRequest({ addonId: addon.id }),
  });
}

interface SessionPlan {
  kind: 'subscription' | 'pack';
  sku: Sku;
  interval: BillingInterval | null;
  priceRef: string;
  trialDays: number | null;
  idempotencyKey: string;
  fingerprint: string;
}

/**
 * Records what we chose before calling Stripe, so the completed checkout
 * is matched to our SKU. The same key and body return the same session;
 * the same key with another body is `idempotency_mismatch`. If Stripe
 * failed last time, the retry calls it again with the same Stripe key.
 */
async function stripeSession(
  deps: CheckoutDeps,
  snapshot: CatalogSnapshot,
  accountId: string,
  customerId: string | null,
  plan: SessionPlan,
): Promise<CheckoutResult> {
  const row = await withTransaction(deps.pool, async (db) => {
    await db.query(
      `INSERT INTO checkout_sessions
         (billing_account_id, provider, idempotency_key, request_fingerprint, kind, catalog_version, sku,
          interval, trial_days, price_ref)
       VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ON CONSTRAINT checkout_sessions_idempotency_unique DO NOTHING`,
      [
        accountId,
        plan.idempotencyKey,
        plan.fingerprint,
        plan.kind,
        snapshot.version,
        skuKey(plan.sku),
        plan.interval,
        plan.trialDays,
        plan.priceRef,
      ],
    );
    const res = await db.query<{
      id: string;
      request_fingerprint: string;
      price_ref: string;
      trial_days: number | null;
      provider_session_id: string | null;
      url: string | null;
      sku: string;
      catalog_version: string;
    }>(
      `SELECT id, request_fingerprint, price_ref, trial_days, provider_session_id, url, sku, catalog_version
         FROM checkout_sessions WHERE billing_account_id = $1 AND idempotency_key = $2`,
      [accountId, plan.idempotencyKey],
    );
    return res.rows[0];
  });
  if (row.request_fingerprint !== plan.fingerprint) {
    throw new BillingError('idempotency_mismatch', { idempotencyKey: plan.idempotencyKey });
  }
  if (row.provider_session_id && row.url) {
    return { provider: 'stripe', url: row.url, sessionId: row.provider_session_id, trialDays: row.trial_days };
  }

  const session = await deps.stripe.createCheckoutSession({
    mode: plan.kind === 'pack' ? 'payment' : 'subscription',
    priceId: row.price_ref,
    billingAccountId: accountId,
    customerId,
    trialDays: row.trial_days,
    idempotencyKey: `checkout-${row.id}`,
    metadata: { billing_account_id: accountId, sku: row.sku, catalog_version: row.catalog_version },
  });
  await deps.pool.query(`UPDATE checkout_sessions SET provider_session_id = $2, url = $3 WHERE id = $1`, [
    row.id,
    session.sessionId,
    session.url,
  ]);
  return { provider: 'stripe', url: session.url, sessionId: session.sessionId, trialDays: row.trial_days };
}

export interface UpgradePreview {
  /** The provider's prorated charge now. Null for a store, which shows its own price. */
  proratedCents: number | null;
  currency: 'USD';
  allowanceDeltas: Array<{ unit: string; delta: number }>;
  restartsUsage: false;
}

/**
 * API_CONTRACT `upgrade-preview`: the mid-cycle money quote. It changes
 * nothing; the entitlement changes only when the provider's verified
 * event arrives, and then used units stay used.
 */
export async function upgradePreview(
  deps: CheckoutDeps,
  accountId: string,
  toPlan: PlanId,
  now: Date,
): Promise<UpgradePreview> {
  const account = await readAccount(deps.pool, accountId);
  const snapshot = await deps.catalogs.get(deps.pool, account.catalog_version);
  const fromPlan = v2PlanOf(snapshot, account);
  if (fromPlan === 'free' || !account.provider || !account.provider_subscription_id || !account.period_start || !account.period_end) {
    throw new BillingError('validation_error', { reason: 'no_paid_subscription' });
  }
  if (!isV2Plan(snapshot, toPlan) || planRank(snapshot, toPlan) <= planRank(snapshot, fromPlan)) {
    throw new BillingError('validation_error', { reason: 'not_an_upgrade', fromPlan, toPlan });
  }
  const { provider, interval } = account;
  if (!snapshot.purchaseChannels[toPlan][interval].includes(provider)) {
    throw new BillingError('channel_unavailable', { planId: toPlan, interval, provider });
  }

  let proratedCents: number | null = null;
  if (provider === 'stripe') {
    const currentPriceId = deps.skus.stripe.refFor({ kind: 'plan', planId: fromPlan, interval });
    const newPriceId = deps.skus.stripe.refFor({ kind: 'plan', planId: toPlan, interval });
    if (!currentPriceId || !newPriceId) throw new BillingError('provider_unavailable', { reason: 'price_not_configured' });
    const quote = await deps.stripe.quoteUpgrade({
      subscriptionId: account.provider_subscription_id,
      currentPriceId,
      newPriceId,
      periodStart: account.period_start,
      periodEnd: account.period_end,
      at: now,
    });
    proratedCents = quote.proratedCents;
  }
  return { proratedCents, currency: 'USD', allowanceDeltas: allowanceDeltas(snapshot, fromPlan, toPlan), restartsUsage: false };
}
