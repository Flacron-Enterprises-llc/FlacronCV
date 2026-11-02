import { BillingError } from '../errors';
import { addMonthsUtc } from '../periods';
import type { PaymentEvent, ProviderDelivery, ProviderStatus } from './events';
import { child, fromMillis, num, obj, str } from './json';
import type { ProviderSkus } from './skus';

/**
 * Checks the Pub/Sub push request's OIDC bearer token (issuer, audience,
 * service account). Throws `unauthenticated` when it fails. The live
 * implementation needs the push audience and service account (Pending keys).
 */
export interface GooglePushVerifier {
  verify(authorization: string | undefined): Promise<void>;
}

/** `purchases.subscriptionsv2.get`, the fields we read. */
export interface GoogleSubscriptionPurchase {
  latestOrderId?: string;
  subscriptionState: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems: Array<{
    productId: string;
    expiryTime: string;
    offerDetails?: { basePlanId?: string; offerId?: string };
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerPhase?: { freeTrial?: Record<string, unknown> };
  }>;
}

/** `purchases.products.get`, the fields we read. */
export interface GoogleProductPurchase {
  orderId: string;
  /** 0 purchased, 1 canceled, 2 pending. */
  purchaseState: number;
  purchaseTimeMillis: string;
  obfuscatedExternalAccountId?: string;
}

/**
 * The Play Developer API. A notification only says "look at this token";
 * the state comes from these calls. Purchases are acknowledged after they
 * are applied, or Google refunds them after three days. The live
 * implementation needs a service account (Pending keys).
 */
export interface GooglePlayApi {
  getSubscription(purchaseToken: string): Promise<GoogleSubscriptionPurchase>;
  getProduct(productId: string, purchaseToken: string): Promise<GoogleProductPurchase>;
  acknowledgeSubscription(purchaseToken: string): Promise<void>;
  acknowledgeProduct(productId: string, purchaseToken: string): Promise<void>;
}

export class UnconfiguredGooglePushVerifier implements GooglePushVerifier {
  verify(): Promise<void> {
    return Promise.reject(new BillingError('unauthenticated', { reason: 'google_not_configured' }));
  }
}

export class UnconfiguredGooglePlayApi implements GooglePlayApi {
  private fail(): Promise<never> {
    return Promise.reject(new BillingError('provider_unavailable', { reason: 'google_not_configured' }));
  }
  getSubscription(): Promise<GoogleSubscriptionPurchase> {
    return this.fail();
  }
  getProduct(): Promise<GoogleProductPurchase> {
    return this.fail();
  }
  acknowledgeSubscription(): Promise<void> {
    return this.fail();
  }
  acknowledgeProduct(): Promise<void> {
    return this.fail();
  }
}

/** A Real-time developer notification, out of its Pub/Sub envelope. */
export interface GoogleNotice {
  messageId: string;
  publishTime: Date;
  kind: 'subscription' | 'product' | 'voided' | 'test' | 'other';
  notificationType: number | null;
  purchaseToken: string | null;
  productId: string | null;
  orderId: string | null;
}

export function parseGooglePush(body: unknown): GoogleNotice {
  const message = child(obj(body), 'message');
  const messageId = str(message, 'messageId') ?? str(message, 'message_id');
  const data = str(message, 'data');
  if (!messageId || !data) throw new BillingError('validation_error', { reason: 'not_a_pubsub_push' });
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    throw new BillingError('validation_error', { reason: 'unreadable_notification' });
  }
  const rtdn = obj(decoded);
  const publishTime = new Date(str(message, 'publishTime') ?? str(message, 'publish_time') ?? 0);
  const base = { messageId, publishTime, notificationType: null, purchaseToken: null, productId: null, orderId: null };
  const sub = child(rtdn, 'subscriptionNotification');
  if (sub) {
    return { ...base, kind: 'subscription', notificationType: num(sub, 'notificationType'), purchaseToken: str(sub, 'purchaseToken') };
  }
  const product = child(rtdn, 'oneTimeProductNotification');
  if (product) {
    return {
      ...base,
      kind: 'product',
      notificationType: num(product, 'notificationType'),
      purchaseToken: str(product, 'purchaseToken'),
      productId: str(product, 'sku'),
    };
  }
  const voided = child(rtdn, 'voidedPurchaseNotification');
  if (voided) {
    return { ...base, kind: 'voided', purchaseToken: str(voided, 'purchaseToken'), orderId: str(voided, 'orderId') };
  }
  return { ...base, kind: child(rtdn, 'testNotification') ? 'test' : 'other' };
}

/** Subscription notification types that mean a charge went through. */
const SUBSCRIPTION_CHARGED = new Set([1, 2, 4]); // RECOVERED, RENEWED, PURCHASED
const SUBSCRIPTION_PURCHASED = 4;
const PRODUCT_PURCHASED = 1;

export interface GoogleDelivery {
  delivery: ProviderDelivery;
  /** Run after the delivery is applied. */
  acknowledge: (() => Promise<void>) | null;
}

export async function googleDelivery(notice: GoogleNotice, api: GooglePlayApi, skus: ProviderSkus): Promise<GoogleDelivery> {
  const delivery = (eventType: string, events: PaymentEvent[]): ProviderDelivery => ({
    provider: 'google',
    eventId: notice.messageId,
    eventType,
    events,
  });

  if (notice.kind === 'subscription' && notice.purchaseToken) {
    const token = notice.purchaseToken;
    const sub = await api.getSubscription(token);
    const events = subscriptionEvents(notice, token, sub, skus);
    const acknowledge =
      notice.notificationType === SUBSCRIPTION_PURCHASED ? () => api.acknowledgeSubscription(token) : null;
    return { delivery: delivery(`subscription:${notice.notificationType}`, events), acknowledge };
  }

  if (notice.kind === 'product' && notice.purchaseToken && notice.productId) {
    if (notice.notificationType !== PRODUCT_PURCHASED) {
      return { delivery: delivery(`product:${notice.notificationType}`, [{ type: 'ignored', reason: 'product_not_purchased' }]), acknowledge: null };
    }
    const token = notice.purchaseToken;
    const productId = notice.productId;
    const purchase = await api.getProduct(productId, token);
    if (purchase.purchaseState !== 0) {
      return { delivery: delivery('product:1', [{ type: 'ignored', reason: 'product_pending' }]), acknowledge: null };
    }
    const event: PaymentEvent = {
      type: 'payment_received',
      occurredAt: notice.publishTime,
      accountId: purchase.obfuscatedExternalAccountId ?? null,
      subscriptionId: null,
      paymentId: purchase.orderId,
      sku: skus.skuFor(productId),
      providerRef: productId,
      amountCents: null,
      currency: null,
      paidAt: fromMillis(purchase.purchaseTimeMillis) ?? notice.publishTime,
    };
    return { delivery: delivery('product:1', [event]), acknowledge: () => api.acknowledgeProduct(productId, token) };
  }

  if (notice.kind === 'voided' && notice.orderId) {
    return {
      delivery: delivery('voided', [
        { type: 'payment_refunded', occurredAt: notice.publishTime, paymentId: notice.orderId, refundedCents: null, reason: 'refund' },
      ]),
      acknowledge: null,
    };
  }

  return { delivery: delivery(notice.kind, [{ type: 'ignored', reason: `google:${notice.kind}` }]), acknowledge: null };
}

function subscriptionEvents(
  notice: GoogleNotice,
  token: string,
  sub: GoogleSubscriptionPurchase,
  skus: ProviderSkus,
): PaymentEvent[] {
  const item = sub.lineItems[0];
  const periodEnd = item ? new Date(item.expiryTime) : null;
  if (!item || !item.offerDetails?.basePlanId || !periodEnd || Number.isNaN(periodEnd.getTime())) {
    return [{ type: 'malformed', reason: 'malformed_google_subscription' }];
  }
  const ref = `${item.productId}:${item.offerDetails.basePlanId}`;
  const sku = skus.skuFor(ref);
  const months = sku && sku.kind !== 'pack' && sku.interval === 'annual' ? 12 : 1;
  const status = subscriptionStatus(sub, item, periodEnd, notice.publishTime);
  const accountId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;
  const events: PaymentEvent[] = [
    {
      type: 'subscription_state',
      occurredAt: notice.publishTime,
      accountId,
      subscriptionId: token,
      previousSubscriptionId: sub.linkedPurchaseToken ?? null,
      customerId: null,
      sku,
      nextSku: null,
      providerRef: ref,
      status,
      // Play reports only the expiry; the period started one interval before it.
      periodStart: addMonthsUtc(periodEnd, -months),
      periodEnd,
      trialEnd: status === 'trialing' ? periodEnd : null,
      cancelAtPeriodEnd:
        sub.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED' || item.autoRenewingPlan?.autoRenewEnabled === false,
    },
  ];
  if (notice.notificationType !== null && SUBSCRIPTION_CHARGED.has(notice.notificationType) && sub.latestOrderId) {
    events.push({
      type: 'payment_received',
      occurredAt: notice.publishTime,
      accountId,
      subscriptionId: token,
      paymentId: sub.latestOrderId,
      sku,
      providerRef: ref,
      amountCents: null,
      currency: null,
      paidAt: notice.publishTime,
    });
  }
  return events;
}

function subscriptionStatus(
  sub: GoogleSubscriptionPurchase,
  item: GoogleSubscriptionPurchase['lineItems'][number],
  periodEnd: Date,
  at: Date,
): ProviderStatus {
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return item.offerPhase?.freeTrial ? 'trialing' : 'active';
    case 'SUBSCRIPTION_STATE_CANCELED':
      // Auto-renew is off; access lasts until the expiry time.
      return periodEnd > at ? 'active' : 'ended';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'past_due';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'incomplete';
    default:
      return 'ended';
  }
}
