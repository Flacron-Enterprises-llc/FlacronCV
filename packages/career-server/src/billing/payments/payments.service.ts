import type { PlanId, PurchaseChannel } from '@flacroncv/career-shared';
import type { Pool } from 'pg';
import type { Clock } from '../billing.service';
import { CatalogStore } from '../catalog';
import { BillingError } from '../errors';
import { AppleNotificationVerifier, appleDelivery, appleSignedPayload } from './apple';
import {
  CheckoutDeps,
  CheckoutRequest,
  CheckoutResult,
  createCheckout,
  createPackCheckout,
  StripeGateway,
  upgradePreview,
  UpgradePreview,
} from './checkout';
import { GooglePlayApi, GooglePushVerifier, googleDelivery, parseGooglePush } from './google';
import { DeliveryOutcome, processDelivery, ProcessorContext } from './processor';
import type { ProviderSkus } from './skus';
import { stripeDelivery, verifyStripeSignature } from './stripe';

export interface PaymentProviders {
  stripe: StripeGateway;
  apple: AppleNotificationVerifier;
  googlePush: GooglePushVerifier;
  googlePlay: GooglePlayApi;
}

export interface PaymentsConfig {
  /** Null when Stripe is not configured: every Stripe delivery is refused. */
  stripeWebhookSecret: string | null;
  skus: Record<PurchaseChannel, ProviderSkus>;
  /** New subscriptions and checkouts use this catalog version. */
  currentCatalogVersion: string;
  /** `metadata[app_id]` V2 writes on Stripe objects; objects tagged for another app are ignored. Default `flacroncv-v2`. */
  stripeAppId?: string;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Checkout, upgrade preview, and the three provider webhooks. Each webhook
 * verifies the provider first, then hands one delivery to the processor,
 * which dedupes it and writes `billing_accounts`, `purchases`, and `packs`.
 */
export class PaymentsService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly providers: PaymentProviders,
    private readonly config: PaymentsConfig,
    private readonly clock: Clock = systemClock,
  ) {}

  async stripeWebhook(rawBody: string, signatureHeader: string | undefined): Promise<DeliveryOutcome> {
    const secret = this.config.stripeWebhookSecret;
    if (!secret) throw new BillingError('unauthenticated', { reason: 'stripe_not_configured' });
    verifyStripeSignature(rawBody, signatureHeader, secret, this.clock.now());
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new BillingError('validation_error', { reason: 'not_json' });
    }
    return processDelivery(this.pool, stripeDelivery(body, this.config.skus.stripe, this.config.stripeAppId), this.context());
  }

  async appleWebhook(body: unknown): Promise<DeliveryOutcome> {
    const notification = await this.providers.apple.verify(appleSignedPayload(body));
    return processDelivery(this.pool, appleDelivery(notification, this.config.skus.apple), this.context());
  }

  /**
   * Google refunds a purchase that is not acknowledged within three days.
   * Only an applied purchase is acknowledged, including on a redelivery
   * after the acknowledgement failed. A rejected one is left to refund.
   */
  async googleWebhook(body: unknown, authorization: string | undefined): Promise<DeliveryOutcome> {
    await this.providers.googlePush.verify(authorization);
    const notice = parseGooglePush(body);
    const { delivery, acknowledge } = await googleDelivery(notice, this.providers.googlePlay, this.config.skus.google);
    const outcome = await processDelivery(this.pool, delivery, this.context());
    const applied = outcome.outcome === 'applied' || (outcome.outcome === 'replayed' && outcome.detail === 'applied');
    if (acknowledge && applied) await acknowledge();
    return outcome;
  }

  createCheckout(accountId: string, request: CheckoutRequest): Promise<CheckoutResult> {
    return createCheckout(this.checkoutDeps(), accountId, {
      planId: request.planId,
      interval: request.interval,
      provider: request.provider,
      idempotencyKey: request.idempotencyKey,
    });
  }

  createPackCheckout(accountId: string, request: { addonId: string; idempotencyKey: string }): Promise<CheckoutResult> {
    return createPackCheckout(this.checkoutDeps(), accountId, request);
  }

  upgradePreview(accountId: string, toPlan: PlanId): Promise<UpgradePreview> {
    return upgradePreview(this.checkoutDeps(), accountId, toPlan, this.clock.now());
  }

  portal(billingAccountId: string, customerId: string | null): Promise<{ url: string }> {
    return this.providers.stripe.createBillingPortal({ billingAccountId, customerId });
  }

  private context(): ProcessorContext {
    return { catalogs: this.catalogs, currentCatalogVersion: this.config.currentCatalogVersion, now: this.clock.now() };
  }

  private checkoutDeps(): CheckoutDeps {
    return {
      pool: this.pool,
      catalogs: this.catalogs,
      currentCatalogVersion: this.config.currentCatalogVersion,
      skus: this.config.skus,
      stripe: this.providers.stripe,
    };
  }
}
