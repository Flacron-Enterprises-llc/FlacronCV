import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingProvider,
  PLAN_CONFIGS,
  SubscriptionPlan,
  SubscriptionStatus,
  hasLiveStorePurchase,
  hasLiveStripeSubscription,
} from '@flacroncv/shared-types';
import { UsersService } from '../users/users.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import { VerifyMobilePurchaseDto } from './dto/verify-mobile-purchase.dto';
import { IapProductMap, mapIapProductId } from './iap-product-map';
import {
  InvalidStoreReceiptError,
  StoreNotConfiguredError,
  StoreReceiptVerifier,
  StoreUnavailableError,
  VerifiedStorePurchase,
} from './store-receipt-verifier';

export interface MobileVerifyResult {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: BillingProvider;
  currentPeriodEnd: string;
}

@Injectable()
export class MobileBillingService {
  private readonly logger = new Logger(MobileBillingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly storeVerifier: StoreReceiptVerifier,
  ) {}

  async verify(userId: string, body: VerifyMobilePurchaseDto): Promise<MobileVerifyResult> {
    this.assertRequestShape(body);

    const user = await this.usersService.findByIdOrThrow(userId);
    this.assertNotStripePaid(user.subscription);

    let verified: VerifiedStorePurchase;
    try {
      verified =
        body.provider === BillingProvider.APPLE
          ? await this.storeVerifier.verifyApple({
              signedTransactionInfo: body.signedTransactionInfo,
              transactionId: body.transactionId,
            })
          : await this.storeVerifier.verifyGoogle({
              purchaseToken: body.purchaseToken as string,
            });
    } catch (err) {
      throw this.mapStoreError(err);
    }

    if (verified.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This purchase is no longer active');
    }

    const plan = this.mapProductId(verified.provider, verified.productId);
    if (!plan) {
      throw new BadRequestException('Unknown store product');
    }

    this.assertCompatibleExistingStoreSub(user.subscription, verified);
    await this.assertTokenNotOwnedByOtherUser(userId, verified);

    await this.grantFromStore(userId, verified, {
      type: 'user',
      uid: userId,
      email: user.email,
      role: user.role,
    });

    return {
      plan,
      status: SubscriptionStatus.ACTIVE,
      provider: verified.provider,
      currentPeriodEnd: verified.expiresAt.toISOString(),
    };
  }

  private assertRequestShape(body: VerifyMobilePurchaseDto): void {
    if (body.provider === BillingProvider.APPLE) {
      const hasTx = Boolean(body.transactionId?.trim() || body.signedTransactionInfo?.trim());
      if (!hasTx) {
        throw new BadRequestException('Apple transaction id or signed transaction is required');
      }
      return;
    }
    if (!body.purchaseToken?.trim()) {
      throw new BadRequestException('Google purchase token is required');
    }
  }

  private assertNotStripePaid(subscription: unknown): void {
    const sub = subscription as Parameters<typeof hasLiveStripeSubscription>[0];
    if (hasLiveStripeSubscription(sub)) {
      throw new ConflictException('This account is billed by Stripe');
    }
  }

  private assertCompatibleExistingStoreSub(
    subscription: { originalTransactionId?: string | null; purchaseToken?: string | null } | undefined,
    verified: VerifiedStorePurchase,
  ): void {
    const sub = subscription as Parameters<typeof hasLiveStorePurchase>[0];
    if (hasLiveStripeSubscription(sub)) {
      throw new ConflictException('This account is billed by Stripe');
    }
    if (!hasLiveStorePurchase(sub)) return;
    const existing = subscription?.originalTransactionId
      ? BillingProvider.APPLE
      : subscription?.purchaseToken
        ? BillingProvider.GOOGLE
        : null;
    if (existing && existing !== verified.provider) {
      throw new ConflictException('This account is billed by a different store');
    }
    if (
      existing === BillingProvider.APPLE &&
      subscription?.originalTransactionId &&
      verified.originalTransactionId &&
      subscription.originalTransactionId !== verified.originalTransactionId
    ) {
      throw new ConflictException('This account already has an App Store subscription');
    }
    if (
      existing === BillingProvider.GOOGLE &&
      subscription?.purchaseToken &&
      verified.purchaseToken &&
      subscription.purchaseToken !== verified.purchaseToken
    ) {
      throw new ConflictException('This account already has a Play subscription');
    }
  }

  private async assertTokenNotOwnedByOtherUser(
    userId: string,
    verified: VerifiedStorePurchase,
  ): Promise<void> {
    const field =
      verified.provider === BillingProvider.APPLE
        ? 'subscription.originalTransactionId'
        : 'subscription.purchaseToken';
    const value =
      verified.provider === BillingProvider.APPLE
        ? verified.originalTransactionId
        : verified.purchaseToken;
    if (!value) return;

    try {
      const snap = await this.firebaseAdmin.firestore
        .collection('users')
        .where(field, '==', value)
        .limit(2)
        .get();
      const taken = snap.docs.some((doc: { id: string }) => doc.id !== userId);
      if (taken) {
        throw new ConflictException('This purchase is already linked to another account');
      }
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      this.logger.warn(`IAP uniqueness query failed: ${(err as Error).name}`);
      throw new ServiceUnavailableException('Could not verify purchase ownership');
    }
  }

  /**
   * Write a store-verified paid plan. Does not touch Stripe ids or call Stripe.
   * Returns false when the product id is not in env (webhook should ack, not 400).
   */
  async grantFromStore(
    userId: string,
    verified: VerifiedStorePurchase,
    actor: { type: 'user'; uid: string; email?: string; role?: string } | { type: 'system' },
  ): Promise<SubscriptionPlan | null> {
    const plan = this.mapProductId(verified.provider, verified.productId);
    if (!plan) return null;

    const limits = PLAN_CONFIGS[plan].limits;
    const now = new Date();
    const db = this.firebaseAdmin.firestore;
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      'subscription.plan': plan,
      'subscription.status': SubscriptionStatus.ACTIVE,
      'subscription.provider': verified.provider,
      'subscription.currentPeriodEnd': verified.expiresAt,
      'subscription.cancelAtPeriodEnd': false,
      'subscription.originalTransactionId':
        verified.provider === BillingProvider.APPLE ? verified.originalTransactionId : null,
      'subscription.purchaseToken':
        verified.provider === BillingProvider.GOOGLE ? verified.purchaseToken : null,
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });
    await batch.commit();

    this.logger.log(`Store grant for user ${userId}: ${plan} (${verified.provider})`);
    const metadata = { provider: verified.provider, plan, productId: verified.productId };
    if (actor.type === 'user') {
      await this.audit.logUserAction(
        AuditAction.SUBSCRIPTION_ACTIVATED,
        { uid: actor.uid, email: actor.email, role: actor.role },
        'subscription',
        userId,
        { metadata },
      );
    } else {
      await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_CHANGED, 'subscription', userId, {
        metadata,
      });
    }
    return plan;
  }

  /**
   * Downgrade a store-billed user to Free. Does not cancel Stripe.
   * No-op when Stripe is the live bill (no in-period store purchase).
   * Clears currentPeriodEnd so resolveEffectivePlan cannot resurrect Pro.
   */
  async revokeFromStore(userId: string, reason: string): Promise<boolean> {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (hasLiveStripeSubscription(user.subscription) && !hasLiveStorePurchase(user.subscription)) {
      this.logger.warn(`Ignoring store revoke for Stripe-billed user ${userId}`);
      return false;
    }

    const freeLimit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    const now = new Date();
    const db = this.firebaseAdmin.firestore;
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      'subscription.plan': SubscriptionPlan.FREE,
      'subscription.status': SubscriptionStatus.CANCELED,
      'subscription.cancelAtPeriodEnd': false,
      'subscription.currentPeriodEnd': null,
      'usage.aiCreditsLimit': freeLimit.aiCredits,
      updatedAt: now,
    });
    await batch.commit();

    this.logger.warn(`Store access revoked for user ${userId} (reason: ${reason})`);
    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_REVOKED, 'subscription', userId, {
      metadata: { reason },
    });
    return true;
  }

  mapProductId(
    provider: BillingProvider.APPLE | BillingProvider.GOOGLE,
    productId: string,
  ): SubscriptionPlan | null {
    const key = provider === BillingProvider.APPLE ? 'iap.apple.products' : 'iap.google.products';
    const products = this.configService.get<IapProductMap>(key) ?? {};
    return mapIapProductId(products, productId);
  }

  private mapStoreError(err: unknown): never {
    if (err instanceof StoreNotConfiguredError || err instanceof StoreUnavailableError) {
      throw new ServiceUnavailableException('Mobile billing is not configured');
    }
    if (err instanceof InvalidStoreReceiptError) {
      throw new BadRequestException('Purchase could not be verified');
    }
    throw err;
  }
}
