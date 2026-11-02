import { BillingError } from '../errors';
import type { PaymentEvent, ProviderDelivery, ProviderStatus } from './events';
import { obj, str } from './json';
import type { ProviderSkus } from './skus';

/** App Store Server Notifications V2, after the signed parts are verified and decoded. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  /** Our billing account id, set by the app at purchase. */
  appAccountToken?: string;
  purchaseDate: number;
  expiresDate?: number;
  type: string;
  /** Milliunits of `currency`: 21990 is 21.99. */
  price?: number;
  currency?: string;
  offerDiscountType?: string;
  revocationDate?: number;
}

export interface AppleRenewalInfo {
  autoRenewStatus: number;
  autoRenewProductId?: string;
}

export interface AppleNotification {
  notificationUUID: string;
  notificationType: string;
  subtype?: string;
  signedDate: number;
  data?: { bundleId?: string; environment?: string; transaction?: AppleTransaction; renewal?: AppleRenewalInfo };
}

/**
 * Verifies `signedPayload` (JWS whose x5c chain ends at Apple Root CA G3,
 * our bundle id, the expected environment) and the nested signed
 * transaction and renewal info, then returns them decoded. Throws
 * `unauthenticated` when any check fails. The live implementation needs
 * the Apple root certificate and the bundle id (Pending keys).
 */
export interface AppleNotificationVerifier {
  verify(signedPayload: string): Promise<AppleNotification>;
}

/** Bound when Apple is not configured: every Apple delivery is refused, so Apple retries later. */
export class UnconfiguredAppleVerifier implements AppleNotificationVerifier {
  verify(): Promise<AppleNotification> {
    return Promise.reject(new BillingError('unauthenticated', { reason: 'apple_not_configured' }));
  }
}

export function appleSignedPayload(body: unknown): string {
  const signedPayload = str(obj(body), 'signedPayload');
  if (!signedPayload) throw new BillingError('validation_error', { reason: 'no_signed_payload' });
  return signedPayload;
}

const ENDED = new Set(['EXPIRED', 'GRACE_PERIOD_EXPIRED', 'REVOKE']);
const CHARGED = new Set(['SUBSCRIBED', 'DID_RENEW']);

export function appleDelivery(n: AppleNotification, skus: ProviderSkus): ProviderDelivery {
  return {
    provider: 'apple',
    eventId: n.notificationUUID,
    eventType: n.subtype ? `${n.notificationType}:${n.subtype}` : n.notificationType,
    events: mapNotification(n, skus),
  };
}

function mapNotification(n: AppleNotification, skus: ProviderSkus): PaymentEvent[] {
  const tx = n.data?.transaction;
  if (!tx) return [{ type: 'ignored', reason: `no_transaction:${n.notificationType}` }];
  const occurredAt = new Date(n.signedDate);
  const amountCents = typeof tx.price === 'number' ? Math.round(tx.price / 10) : null;
  const currency = tx.currency ?? null;
  const refund: PaymentEvent = {
    type: 'payment_refunded',
    occurredAt,
    paymentId: tx.transactionId,
    refundedCents: amountCents,
    reason: 'refund',
  };

  if (tx.type === 'Consumable') {
    if (n.notificationType === 'ONE_TIME_CHARGE') {
      return [
        {
          type: 'payment_received',
          occurredAt,
          accountId: tx.appAccountToken ?? null,
          subscriptionId: null,
          paymentId: tx.transactionId,
          sku: skus.skuFor(tx.productId),
          providerRef: tx.productId,
          amountCents,
          currency,
          paidAt: new Date(tx.purchaseDate),
        },
      ];
    }
    if (n.notificationType === 'REFUND') return [refund];
    return [{ type: 'ignored', reason: `consumable:${n.notificationType}` }];
  }

  if (tx.type !== 'Auto-Renewable Subscription') {
    return [{ type: 'ignored', reason: 'unsupported_product_type' }];
  }
  if (typeof tx.expiresDate !== 'number') return [{ type: 'malformed', reason: 'malformed_apple_subscription' }];

  const renewal = n.data?.renewal;
  const nextRef = renewal?.autoRenewProductId;
  const status = subscriptionStatus(n, tx);
  const events: PaymentEvent[] = [
    {
      type: 'subscription_state',
      occurredAt,
      accountId: tx.appAccountToken ?? null,
      subscriptionId: tx.originalTransactionId,
      previousSubscriptionId: null,
      customerId: null,
      sku: skus.skuFor(tx.productId),
      nextSku: nextRef && nextRef !== tx.productId ? skus.skuFor(nextRef) : null,
      providerRef: tx.productId,
      status,
      periodStart: new Date(tx.purchaseDate),
      periodEnd: new Date(tx.expiresDate),
      trialEnd: status === 'trialing' ? new Date(tx.expiresDate) : null,
      cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
    },
  ];
  if (CHARGED.has(n.notificationType)) {
    events.push({
      type: 'payment_received',
      occurredAt,
      accountId: tx.appAccountToken ?? null,
      subscriptionId: tx.originalTransactionId,
      paymentId: tx.transactionId,
      sku: skus.skuFor(tx.productId),
      providerRef: tx.productId,
      amountCents,
      currency,
      paidAt: new Date(tx.purchaseDate),
    });
  }
  if (n.notificationType === 'REFUND') events.push(refund);
  return events;
}

function subscriptionStatus(n: AppleNotification, tx: AppleTransaction): ProviderStatus {
  if (tx.revocationDate !== undefined || ENDED.has(n.notificationType)) return 'ended';
  if (n.notificationType === 'DID_FAIL_TO_RENEW') {
    // In the grace period the person keeps access; in billing retry they do not.
    return n.subtype === 'GRACE_PERIOD' ? 'past_due' : 'incomplete';
  }
  return tx.offerDiscountType === 'FREE_TRIAL' ? 'trialing' : 'active';
}
