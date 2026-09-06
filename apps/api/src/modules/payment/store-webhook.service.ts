import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { BillingProvider, hasLiveStorePurchase, hasLiveStripeSubscription } from '@flacroncv/shared-types';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import {
  InspectedStorePurchase,
  InvalidStoreReceiptError,
  StoreNotConfiguredError,
  StoreReceiptVerifier,
  StoreUnavailableError,
  VerifiedStorePurchase,
  decodeJwsPayload,
} from './store-receipt-verifier';
import { MobileBillingService } from './mobile-billing.service';
import { GoogleRtdnAuth, GoogleRtdnUnauthorizedError } from './google-rtdn-auth';

const EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class StoreWebhookService {
  private readonly logger = new Logger(StoreWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly storeVerifier: StoreReceiptVerifier,
    private readonly mobileBilling: MobileBillingService,
    private readonly googleRtdnAuth: GoogleRtdnAuth,
  ) {}

  async handleAppleNotification(signedPayload: string): Promise<{ received: true }> {
    let notification: Record<string, unknown>;
    try {
      notification = decodeJwsPayload(signedPayload);
    } catch {
      throw new BadRequestException('Apple notification is malformed');
    }

    const notificationType =
      typeof notification.notificationType === 'string' ? notification.notificationType : '';
    const notificationUUID =
      typeof notification.notificationUUID === 'string' ? notification.notificationUUID : '';
    if (!notificationUUID) {
      throw new BadRequestException('Apple notification is missing notificationUUID');
    }

    if (await this.alreadyProcessed(`iap_apple_${notificationUUID}`)) {
      return { received: true };
    }

    if (notificationType === 'TEST') {
      await this.markProcessed(`iap_apple_${notificationUUID}`, 'TEST');
      return { received: true };
    }

    const data =
      notification.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
        ? (notification.data as Record<string, unknown>)
        : {};
    const bundleId = typeof data.bundleId === 'string' ? data.bundleId : '';
    const expectedBundle = this.configService.get<string>('iap.apple.bundleId')?.trim() ?? '';
    if (expectedBundle && bundleId && bundleId !== expectedBundle) {
      this.logger.warn('Ignoring Apple notification for a different bundle');
      await this.markProcessed(`iap_apple_${notificationUUID}`, notificationType);
      return { received: true };
    }

    const signedTransactionInfo =
      typeof data.signedTransactionInfo === 'string' ? data.signedTransactionInfo : '';
    if (!signedTransactionInfo) {
      await this.markProcessed(`iap_apple_${notificationUUID}`, notificationType);
      return { received: true };
    }

    let inspected: InspectedStorePurchase;
    try {
      inspected = await this.storeVerifier.inspectApple({ signedTransactionInfo });
    } catch (err) {
      throw this.mapStoreError(err);
    }

    await this.applyInspection(inspected, `apple:${notificationType}`);
    await this.markProcessed(`iap_apple_${notificationUUID}`, notificationType);
    return { received: true };
  }

  async handleGoogleRtdn(
    authorization: string | undefined,
    body: unknown,
  ): Promise<{ received: true }> {
    try {
      await this.googleRtdnAuth.assert(authorization);
    } catch (err) {
      if (err instanceof GoogleRtdnUnauthorizedError) {
        throw new UnauthorizedException('Invalid RTDN push token');
      }
      throw this.mapStoreError(err);
    }

    const parsed = parsePubSubPush(body);
    if (!parsed) {
      throw new BadRequestException('Google RTDN body is malformed');
    }

    const eventId = parsed.messageId
      ? `iap_google_${parsed.messageId}`
      : `iap_google_${createHash('sha256').update(parsed.rawData).digest('hex').slice(0, 32)}`;

    if (await this.alreadyProcessed(eventId)) {
      return { received: true };
    }

    let decoded: Record<string, unknown>;
    try {
      decoded = JSON.parse(Buffer.from(parsed.rawData, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new BadRequestException('Google RTDN data is malformed');
    }

    if (decoded.testNotification) {
      await this.markProcessed(eventId, 'TEST');
      return { received: true };
    }

    const packageName = typeof decoded.packageName === 'string' ? decoded.packageName : '';
    const expectedPackage = this.configService.get<string>('iap.google.packageName')?.trim() ?? '';
    if (expectedPackage && packageName && packageName !== expectedPackage) {
      this.logger.warn('Ignoring Google RTDN for a different package');
      await this.markProcessed(eventId, 'package-mismatch');
      return { received: true };
    }

    const subNote =
      decoded.subscriptionNotification &&
      typeof decoded.subscriptionNotification === 'object' &&
      !Array.isArray(decoded.subscriptionNotification)
        ? (decoded.subscriptionNotification as Record<string, unknown>)
        : null;
    const voided =
      decoded.voidedPurchaseNotification &&
      typeof decoded.voidedPurchaseNotification === 'object' &&
      !Array.isArray(decoded.voidedPurchaseNotification)
        ? (decoded.voidedPurchaseNotification as Record<string, unknown>)
        : null;

    const purchaseToken =
      (typeof subNote?.purchaseToken === 'string' && subNote.purchaseToken) ||
      (typeof voided?.purchaseToken === 'string' && voided.purchaseToken) ||
      '';
    if (!purchaseToken) {
      await this.markProcessed(eventId, 'ignored');
      return { received: true };
    }

    let inspected: InspectedStorePurchase;
    try {
      inspected = await this.storeVerifier.inspectGoogle({ purchaseToken });
    } catch (err) {
      throw this.mapStoreError(err);
    }

    const kind =
      typeof subNote?.notificationType === 'number'
        ? `google:${subNote.notificationType}`
        : voided
          ? 'google:voided'
          : 'google';
    await this.applyInspection(inspected, kind);
    await this.markProcessed(eventId, kind);
    return { received: true };
  }

  private async applyInspection(inspected: InspectedStorePurchase, reason: string): Promise<void> {
    if (!inspected.found) {
      this.logger.log(`Store webhook ${reason}: purchase not found — ack`);
      return;
    }

    const lookupId =
      inspected.provider === BillingProvider.APPLE
        ? inspected.originalTransactionId
        : inspected.purchaseToken;
    if (!lookupId) return;

    const userId = await this.findStoreUser(inspected.provider, lookupId);
    if (!userId) {
      this.logger.log(`Store webhook ${reason}: no linked user — ack`);
      return;
    }

    const user = await this.firebaseAdmin.firestore.collection('users').doc(userId).get();
    const sub = user.data()?.subscription as Parameters<typeof hasLiveStripeSubscription>[0];
    if (hasLiveStripeSubscription(sub) && !hasLiveStorePurchase(sub)) {
      this.logger.warn(`Ignoring store webhook ${reason} for Stripe-billed user ${userId}`);
      return;
    }

    if (inspected.entitled && inspected.expiresAt) {
      const verified: VerifiedStorePurchase = {
        provider: inspected.provider,
        productId: inspected.productId,
        expiresAt: inspected.expiresAt,
        originalTransactionId: inspected.originalTransactionId,
        purchaseToken: inspected.purchaseToken,
      };
      const plan = await this.mobileBilling.grantFromStore(userId, verified, { type: 'system' });
      if (!plan) {
        this.logger.warn(`Store webhook ${reason}: unknown product id — skip write`);
      }
      return;
    }

    await this.mobileBilling.revokeFromStore(userId, reason);
  }

  private async findStoreUser(
    provider: BillingProvider.APPLE | BillingProvider.GOOGLE,
    value: string,
  ): Promise<string | null> {
    const field =
      provider === BillingProvider.APPLE
        ? 'subscription.originalTransactionId'
        : 'subscription.purchaseToken';
    try {
      const snap = await this.firebaseAdmin.firestore
        .collection('users')
        .where(field, '==', value)
        .limit(2)
        .get();
      if (snap.empty || snap.docs.length !== 1) return null;
      return (snap.docs[0] as { id: string }).id;
    } catch (err) {
      this.logger.warn(`Store webhook lookup failed: ${(err as Error).name}`);
      throw new ServiceUnavailableException('Could not look up store purchase');
    }
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const doc = await this.firebaseAdmin.firestore.collection('payment_events').doc(eventId).get();
    return doc.exists;
  }

  private async markProcessed(eventId: string, type: string): Promise<void> {
    const processedAt = new Date();
    await this.firebaseAdmin.firestore.collection('payment_events').doc(eventId).set({
      type,
      processedAt,
      expireAt: new Date(processedAt.getTime() + EVENT_TTL_MS),
    });
  }

  private mapStoreError(err: unknown): never {
    if (err instanceof StoreNotConfiguredError || err instanceof StoreUnavailableError) {
      throw new ServiceUnavailableException('Mobile billing is not configured');
    }
    if (err instanceof InvalidStoreReceiptError) {
      throw new BadRequestException('Store notification could not be verified');
    }
    throw err;
  }
}

function parsePubSubPush(
  body: unknown,
): { rawData: string; messageId: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const rawData = (message as { data?: unknown }).data;
  if (typeof rawData !== 'string' || !rawData) return null;
  const messageId =
    typeof (message as { messageId?: unknown }).messageId === 'string'
      ? (message as { messageId: string }).messageId
      : '';
  return { rawData, messageId };
}
