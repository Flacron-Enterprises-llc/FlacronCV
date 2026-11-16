import type Stripe from 'stripe';
import { APP_ID_METADATA_KEY } from '../../config/stripe-app';
import type { LedgerCustomer } from './billing-ledger';
import type { CustomerKeyReservation } from './checkout-coordination';

/**
 * Whether a stored Stripe customer id may be used by THIS application on the
 * shared Flacron Stripe account. Mirrors PaymentService.liveCustomer /
 * stampCustomer (payment.service.ts), which keeps its own private copy:
 *
 *   - `owned`    — exists, not deleted, metadata app_id === our app id.
 *   - `legacy`   — exists, not deleted, carries NO app_id. Only ever reached
 *                  for the user's OWN stored id (created before the app_id
 *                  standard), so it may be claimed (stamped) for this app.
 *   - `foreign`  — tagged for another application. Never reused: charging it
 *                  would bill another app's customer record and mix revenue.
 *   - `missing`  — deleted, or no longer resolves (key/account/mode switched).
 *   - `none`     — nothing stored.
 *
 * Any Stripe error other than "resource missing" is rethrown: a transient
 * failure must not be mistaken for "gone" (which would create a duplicate
 * customer), and callers that cannot verify must not proceed.
 */
export type StoredCustomerVerdict =
  | { kind: 'owned'; customer: Stripe.Customer }
  | { kind: 'legacy'; customer: Stripe.Customer }
  | { kind: 'foreign'; owner: string }
  | { kind: 'missing' }
  | { kind: 'none' };

type CustomersApi = Pick<Stripe['customers'], 'retrieve' | 'create' | 'update'>;
export interface StripeCustomersClient {
  customers: CustomersApi;
}

/** The ledger sink a created/claimed customer is recorded in (BillingLedgerService fits). */
export interface CustomerLedgerSink {
  upsertCustomer(row: LedgerCustomer): Promise<void>;
}

interface Log {
  warn(message: string): void;
}

export function appIdOf(obj: { metadata?: Stripe.Metadata | null } | null | undefined): string | null {
  const value = obj?.metadata?.[APP_ID_METADATA_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Stripe refused a replayed idempotency key (different parameters, or a key still in use). */
export function isIdempotencyError(err: unknown): boolean {
  const e = err as { type?: string; code?: string } | null;
  return e?.type === 'StripeIdempotencyError' || e?.type === 'idempotency_error' || e?.code === 'idempotency_key_in_use';
}

/** The per-user idempotency-key store (CheckoutCoordinator implements it). */
export interface CustomerKeyStore {
  reserveCustomerKey(
    uid: string,
    params: { email: string | null; name: string | null },
    opts?: { forceFresh?: boolean },
  ): Promise<CustomerKeyReservation>;
  clearCustomerKey(uid: string, key: string): Promise<void>;
}

/**
 * THE way a FlacronCV Stripe customer is created — by plan checkout and by
 * career/pack checkout alike — so concurrent first purchases converge on ONE
 * customer: both reserve the same per-user idempotency key (with the same
 * snapshotted parameters) and Stripe returns the same customer for it.
 *
 * Recovery: an idempotency error (key replayed with other parameters / in
 * use) or a replayed customer that is no longer usable (deleted, or not
 * ours) is retried once with a FRESH key. The caller saves the id on the user
 * and then calls `keys.clearCustomerKey(uid, key)`.
 */
export async function createAppCustomerOnce(
  stripe: StripeCustomersClient,
  keys: CustomerKeyStore,
  ctx: { appId: string; userId: string; email?: string | null; name?: string | null; log: Log },
): Promise<{ customer: Stripe.Customer; key: string }> {
  const params = { email: ctx.email ?? null, name: ctx.name ?? null };
  for (const forceFresh of [false, true]) {
    const reservation = await keys.reserveCustomerKey(ctx.userId, params, { forceFresh });
    let customer: Stripe.Customer;
    try {
      customer = await stripe.customers.create(
        {
          email: reservation.email ?? undefined,
          name: reservation.name ?? undefined,
          metadata: appMetadata(ctx.appId, ctx.userId),
        },
        { idempotencyKey: reservation.key },
      );
    } catch (err) {
      if (!forceFresh && isIdempotencyError(err)) {
        ctx.log.warn(`Customer idempotency key for ${ctx.userId} was refused by Stripe — retrying with a fresh key.`);
        continue;
      }
      throw err;
    }
    if (reservation.reused && !forceFresh) {
      // A replay returns the customer as it was CREATED; make sure it still
      // exists and is ours before putting it on a checkout.
      const verdict = await verifyStoredCustomer(stripe, customer.id, ctx.appId);
      if (verdict.kind !== 'owned' && verdict.kind !== 'legacy') {
        ctx.log.warn(`Replayed customer ${customer.id} for ${ctx.userId} is not usable (${verdict.kind}) — creating a fresh one.`);
        continue;
      }
    }
    return { customer, key: reservation.key };
  }
  throw new Error(`Could not create a Stripe customer for ${ctx.userId}`);
}

export function isMissingResource(err: unknown): boolean {
  const e = err as { type?: string; code?: string; statusCode?: number } | null;
  return e?.code === 'resource_missing' || (e?.type === 'StripeInvalidRequestError' && e?.statusCode === 404);
}

export async function verifyStoredCustomer(
  stripe: StripeCustomersClient,
  customerId: string | null | undefined,
  appId: string,
): Promise<StoredCustomerVerdict> {
  if (!customerId) return { kind: 'none' };
  let customer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    if (isMissingResource(err)) return { kind: 'missing' };
    throw err;
  }
  // A DELETED customer resolves successfully; `deleted` is the only tell.
  // An empty response cannot be verified either: never reuse it.
  if (!customer || (customer as Stripe.DeletedCustomer).deleted) return { kind: 'missing' };
  const owner = appIdOf(customer as Stripe.Customer);
  if (!owner) return { kind: 'legacy', customer: customer as Stripe.Customer };
  if (owner !== appId) return { kind: 'foreign', owner };
  return { kind: 'owned', customer: customer as Stripe.Customer };
}

function appMetadata(appId: string, userId: string): Stripe.MetadataParam {
  return { [APP_ID_METADATA_KEY]: appId, internal_user_id: userId, firebaseUid: userId };
}

function ledgerRow(appId: string, customer: Stripe.Customer, userId: string, email?: string | null): LedgerCustomer {
  return {
    application_id: appId,
    livemode: !!customer.livemode,
    stripe_customer_id: customer.id,
    internal_user_id: userId,
    email: email ?? customer.email ?? null,
    created_at: customer.created ? new Date(customer.created * 1000) : new Date(),
    updated_at: new Date(),
  };
}

/** Record a customer in billing_customers. Best-effort: the customer is also reachable from payment rows. */
async function recordCustomer(
  ledger: CustomerLedgerSink | null | undefined,
  appId: string,
  customer: Stripe.Customer,
  userId: string,
  email: string | null | undefined,
  log: Log,
): Promise<void> {
  if (!ledger) return;
  try {
    await ledger.upsertCustomer(ledgerRow(appId, customer, userId, email));
  } catch (err) {
    log.warn(`Could not record customer ${customer.id}: ${(err as Error).message}`);
  }
}

/**
 * Claim an untagged legacy customer for this app (stamp app_id, record it).
 * Returns whether the stamp landed at Stripe.
 */
export async function stampLegacyCustomer(
  stripe: StripeCustomersClient,
  customer: Stripe.Customer,
  ctx: { appId: string; userId: string; email?: string | null; ledger?: CustomerLedgerSink | null; log: Log },
): Promise<boolean> {
  try {
    await stripe.customers.update(customer.id, {
      metadata: { ...(customer.metadata ?? {}), ...appMetadata(ctx.appId, ctx.userId) },
    });
  } catch (err) {
    ctx.log.warn(`Could not stamp app_id on customer ${customer.id}: ${(err as Error).message}`);
    return false;
  }
  await recordCustomer(ctx.ledger, ctx.appId, customer, ctx.userId, ctx.email, ctx.log);
  return true;
}

/**
 * The customer to put on a new Checkout for this user: the stored one when it
 * is verifiably ours (claiming an untagged legacy one, best-effort like
 * PaymentService), otherwise a NEW customer tagged for this app — saved on the
 * user and recorded in billing_customers. A customer tagged for another app,
 * deleted or missing is never reused.
 */
export async function resolveCheckoutCustomer(
  stripe: StripeCustomersClient,
  ctx: {
    appId: string;
    userId: string;
    email?: string | null;
    name?: string | null;
    storedCustomerId: string | null | undefined;
    ledger?: CustomerLedgerSink | null;
    saveCustomerId: (customerId: string) => Promise<void>;
    /** The shared per-user key store, so this path and plan checkout create ONE customer. */
    keys: CustomerKeyStore;
    log: Log;
  },
): Promise<string> {
  const verdict = await verifyStoredCustomer(stripe, ctx.storedCustomerId, ctx.appId);
  switch (verdict.kind) {
    case 'owned':
      return verdict.customer.id;
    case 'legacy':
      await stampLegacyCustomer(stripe, verdict.customer, ctx);
      return verdict.customer.id;
    case 'foreign':
      ctx.log.warn(
        `Stored Stripe customer ${ctx.storedCustomerId} belongs to app_id ${verdict.owner}, not ${ctx.appId} — creating a new customer.`,
      );
      break;
    case 'missing':
      ctx.log.warn(`Stored Stripe customer ${ctx.storedCustomerId} no longer exists — creating a new customer.`);
      break;
    case 'none':
      break;
  }
  const { customer, key } = await createAppCustomerOnce(stripe, ctx.keys, ctx);
  await ctx.saveCustomerId(customer.id);
  await ctx.keys.clearCustomerKey(ctx.userId, key);
  await recordCustomer(ctx.ledger, ctx.appId, customer, ctx.userId, ctx.email, ctx.log);
  return customer.id;
}
