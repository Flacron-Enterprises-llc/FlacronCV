import { createHmac, timingSafeEqual } from 'crypto';
import { BillingError } from '../errors';
import type { PaymentEvent, ProviderDelivery, ProviderStatus } from './events';
import { bool, child, fromUnixSeconds, JsonObject, list, num, obj, str } from './json';
import type { ProviderSkus } from './skus';

/**
 * The webhook endpoint must be created with this API version. The mapping
 * below reads that version's shapes (subscription `current_period_*`,
 * `invoice.subscription`, `invoice.payment_intent`).
 */
export const STRIPE_API_VERSION = '2024-06-20';

/** Written into `metadata[app_id]` on every V2 checkout and subscription. */
export const STRIPE_APP_ID = 'flacroncv-v2';

const TOLERANCE_SECONDS = 300;

/**
 * Stripe's documented scheme: header `t=<unix>,v1=<hex>`, where v1 is
 * HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret. Any v1 may
 * match (secret rotation). Throws `unauthenticated` on any mismatch.
 */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, now: Date): void {
  if (!header || secret.length === 0) throw new BillingError('unauthenticated', { reason: 'missing_signature' });
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't' && /^\d+$/.test(value ?? '')) timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) {
    throw new BillingError('unauthenticated', { reason: 'malformed_signature' });
  }
  if (Math.abs(now.getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) {
    throw new BillingError('unauthenticated', { reason: 'signature_too_old' });
  }
  const expected = Buffer.from(sign(rawBody, secret, timestamp), 'hex');
  const ok = signatures.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new BillingError('unauthenticated', { reason: 'bad_signature' });
}

/** The header Stripe would send for this body. Used to sign test deliveries. */
export function stripeSignatureHeader(rawBody: string, secret: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${sign(rawBody, secret, t)}`;
}

function sign(rawBody: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

const SUBSCRIPTION_STATUS: Record<string, ProviderStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'incomplete',
  paused: 'incomplete',
  canceled: 'ended',
  incomplete_expired: 'ended',
};

/**
 * Maps a verified Stripe event to our events. Throws `validation_error` only when it has no id or type.
 * An object tagged for another app (V1 or anything else on a shared Stripe account) is ignored outright;
 * untagged objects are still matched only through V2's own price map.
 */
export function stripeDelivery(body: unknown, skus: ProviderSkus, appId: string = STRIPE_APP_ID): ProviderDelivery {
  const event = obj(body);
  const eventId = str(event, 'id');
  const eventType = str(event, 'type');
  if (!eventId || !eventType) throw new BillingError('validation_error', { reason: 'not_a_stripe_event' });
  const occurredAt = fromUnixSeconds(num(event, 'created')) ?? new Date(0);
  const object = child(child(event, 'data'), 'object');
  const taggedApp = str(child(object, 'metadata'), 'app_id');
  if (taggedApp && taggedApp !== appId) {
    return { provider: 'stripe', eventId, eventType, events: [{ type: 'ignored', reason: 'other_app' }] };
  }
  return { provider: 'stripe', eventId, eventType, events: [mapEvent(eventType, object, occurredAt, skus)] };
}

function mapEvent(type: string, o: JsonObject | null, occurredAt: Date, skus: ProviderSkus): PaymentEvent {
  switch (type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return subscriptionState(type, o, occurredAt, skus);
    case 'invoice.paid':
      return invoicePaid(o, occurredAt, skus);
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return checkoutCompleted(o, occurredAt);
    case 'charge.refunded': {
      const paymentId = str(o, 'payment_intent') ?? str(o, 'id');
      const refunded = num(o, 'amount_refunded');
      if (!paymentId || refunded === null) return { type: 'malformed', reason: 'malformed_charge' };
      return { type: 'payment_refunded', occurredAt, paymentId, refundedCents: refunded, reason: 'refund' };
    }
    case 'charge.dispute.closed': {
      if (str(o, 'status') !== 'lost') return { type: 'ignored', reason: 'dispute_not_lost' };
      const paymentId = str(o, 'payment_intent') ?? str(o, 'charge');
      const amount = num(o, 'amount');
      if (!paymentId || amount === null) return { type: 'malformed', reason: 'malformed_dispute' };
      return { type: 'payment_refunded', occurredAt, paymentId, refundedCents: amount, reason: 'chargeback' };
    }
    default:
      return { type: 'ignored', reason: `unhandled:${type}` };
  }
}

function subscriptionState(type: string, sub: JsonObject | null, occurredAt: Date, skus: ProviderSkus): PaymentEvent {
  const subscriptionId = str(sub, 'id');
  const rawStatus = str(sub, 'status');
  const priceId = str(child(list(child(sub, 'items'), 'data')[0] ?? null, 'price'), 'id');
  const periodStart = fromUnixSeconds(num(sub, 'current_period_start'));
  const periodEnd = fromUnixSeconds(num(sub, 'current_period_end'));
  const status = type === 'customer.subscription.deleted' ? 'ended' : rawStatus ? SUBSCRIPTION_STATUS[rawStatus] : undefined;
  if (!subscriptionId || !priceId || !periodStart || !periodEnd || !status) {
    return { type: 'malformed', reason: 'malformed_subscription' };
  }
  return {
    type: 'subscription_state',
    occurredAt,
    accountId: str(child(sub, 'metadata'), 'billing_account_id'),
    subscriptionId,
    previousSubscriptionId: null,
    customerId: str(sub, 'customer'),
    sku: skus.skuFor(priceId),
    nextSku: null,
    providerRef: priceId,
    status,
    periodStart,
    periodEnd,
    trialEnd: fromUnixSeconds(num(sub, 'trial_end')),
    cancelAtPeriodEnd: bool(sub, 'cancel_at_period_end') ?? false,
  };
}

function invoicePaid(inv: JsonObject | null, occurredAt: Date, skus: ProviderSkus): PaymentEvent {
  const subscriptionId = str(inv, 'subscription');
  if (!subscriptionId) return { type: 'ignored', reason: 'invoice_without_subscription' };
  const line = list(child(inv, 'lines'), 'data').find((l) => str(child(l, 'price'), 'id') !== null) ?? null;
  const priceId = str(child(line, 'price'), 'id');
  const paymentId = str(inv, 'payment_intent') ?? str(inv, 'id');
  const amount = num(inv, 'amount_paid');
  if (!priceId || !paymentId || amount === null) return { type: 'malformed', reason: 'malformed_invoice' };
  return {
    type: 'payment_received',
    occurredAt,
    accountId: str(child(child(inv, 'subscription_details'), 'metadata'), 'billing_account_id'),
    subscriptionId,
    paymentId,
    sku: skus.skuFor(priceId),
    providerRef: priceId,
    amountCents: amount,
    currency: str(inv, 'currency'),
    paidAt: fromUnixSeconds(num(child(inv, 'status_transitions'), 'paid_at')) ?? occurredAt,
  };
}

function checkoutCompleted(session: JsonObject | null, occurredAt: Date): PaymentEvent {
  if (str(session, 'mode') !== 'payment') return { type: 'ignored', reason: 'subscription_checkout' };
  if (str(session, 'payment_status') !== 'paid') return { type: 'ignored', reason: 'checkout_not_paid' };
  const sessionId = str(session, 'id');
  const paymentId = str(session, 'payment_intent');
  if (!sessionId || !paymentId) return { type: 'malformed', reason: 'malformed_checkout' };
  return {
    type: 'checkout_completed',
    occurredAt,
    sessionId,
    accountId: str(session, 'client_reference_id'),
    paymentId,
    amountCents: num(session, 'amount_total'),
    currency: str(session, 'currency'),
    paidAt: occurredAt,
  };
}
