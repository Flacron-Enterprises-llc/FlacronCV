import type { PurchaseChannel } from '@flacroncv/career-shared';
import type { RevokeReason } from '../packs';
import type { Sku } from './skus';

/** The provider's view of a subscription, mapped to our statuses. */
export type ProviderStatus = 'active' | 'trialing' | 'past_due' | 'incomplete' | 'ended';

/**
 * The subscription as the provider reports it now. Each provider adapter
 * maps its own payload to this; the processor moves `billing_accounts`
 * toward it. `sku` is null when the provider id is not in our map.
 */
export interface SubscriptionStateEvent {
  type: 'subscription_state';
  occurredAt: Date;
  /** Our billing account id, carried by the provider from checkout. */
  accountId: string | null;
  subscriptionId: string;
  /** Google issues a new token on a plan change and links the old one. */
  previousSubscriptionId: string | null;
  customerId: string | null;
  sku: Sku | null;
  /** What the subscription renews into, when the provider reports it separately. */
  nextSku: Sku | null;
  providerRef: string;
  status: ProviderStatus;
  periodStart: Date;
  periodEnd: Date;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentReceivedEvent {
  type: 'payment_received';
  occurredAt: Date;
  accountId: string | null;
  subscriptionId: string | null;
  paymentId: string;
  sku: Sku | null;
  providerRef: string;
  /** Null when the notification does not carry the charged amount. */
  amountCents: number | null;
  currency: string | null;
  paidAt: Date;
}

/** Stripe only: a hosted checkout we created was paid. The SKU comes from our `checkout_sessions` row. */
export interface CheckoutCompletedEvent {
  type: 'checkout_completed';
  occurredAt: Date;
  sessionId: string;
  accountId: string | null;
  paymentId: string;
  amountCents: number | null;
  currency: string | null;
  paidAt: Date;
}

export interface PaymentRefundedEvent {
  type: 'payment_refunded';
  occurredAt: Date;
  paymentId: string;
  /** Total refunded so far, or null when the provider does not say. */
  refundedCents: number | null;
  reason: RevokeReason;
}

/** A type we do not act on. Recorded as `ignored`. */
export interface IgnoredEvent {
  type: 'ignored';
  reason: string;
}

/** A type we act on, with a payload we cannot read. Recorded as `rejected` for an operator. */
export interface MalformedEvent {
  type: 'malformed';
  reason: string;
}

export type PaymentEvent =
  | SubscriptionStateEvent
  | PaymentReceivedEvent
  | CheckoutCompletedEvent
  | PaymentRefundedEvent
  | IgnoredEvent
  | MalformedEvent;

/** One verified delivery from a provider, before dedupe. */
export interface ProviderDelivery {
  provider: PurchaseChannel;
  eventId: string;
  eventType: string;
  events: PaymentEvent[];
}
