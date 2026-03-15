import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus, PLAN_CONFIGS } from '@flacroncv/shared-types';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe!: Stripe;

  constructor(
    private configService: ConfigService,
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' as any });
    }
  }

  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const user = await this.usersService.findByIdOrThrow(userId);

    let customerId = user.subscription.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.displayName,
        metadata: { firebaseUid: userId },
      });
      customerId = customer.id;
      await this.usersService.updateSubscription(userId, { stripeCustomerId: customerId });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: { firebaseUid: userId },
    });

    return { sessionId: session.id, url: session.url };
  }

  async verifySession(userId: string, sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Security: ensure this session belongs to this user
    if (session.metadata?.firebaseUid !== userId) {
      throw new BadRequestException('Session does not belong to this user');
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Payment not completed');
    }

    const subscription = session.subscription as Stripe.Subscription;
    if (!subscription) {
      throw new BadRequestException('No subscription found in session');
    }

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;
    const now = new Date();

    const db = this.firebaseAdmin.firestore;
    const batch = db.batch();

    batch.update(db.collection('users').doc(userId), {
      'subscription.plan': plan,
      'subscription.status': SubscriptionStatus.ACTIVE,
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.stripeCustomerId': session.customer as string,
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      'subscription.cancelAtPeriodEnd': false,
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });

    batch.set(db.collection('subscriptions').doc(subscription.id), {
      id: subscription.id,
      userId,
      stripeCustomerId: session.customer as string,
      plan,
      priceId: subscription.items.data[0].price.id,
      interval: subscription.items.data[0].price.recurring?.interval || 'month',
      amount: subscription.items.data[0].price.unit_amount || 0,
      currency: subscription.currency,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAt: null,
      canceledAt: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await batch.commit();
    this.logger.log(`Session verified and plan applied for user ${userId}: ${plan}`);

    return { plan, status: SubscriptionStatus.ACTIVE };
  }

  async createPortalSession(userId: string, returnUrl: string) {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (!user.subscription.stripeCustomerId) {
      throw new BadRequestException('No active subscription found. Please subscribe to a plan first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  async handleWebhookEvent(event: Stripe.Event) {
    // Idempotency check
    const eventDoc = await this.firebaseAdmin.firestore
      .collection('payment_events')
      .doc(event.id)
      .get();
    if (eventDoc.exists) {
      this.logger.log(`Event ${event.id} already processed, skipping`);
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed — expireAt causes Firestore TTL to auto-delete after 90 days
    const processedAt = new Date();
    const expireAt = new Date(processedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    await this.firebaseAdmin.firestore.collection('payment_events').doc(event.id).set({
      type: event.type,
      processedAt,
      expireAt,
      data: JSON.parse(JSON.stringify(event.data.object)),
    });
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.firebaseUid;
    if (!userId) return;

    const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
    const plan = this.determinePlan(subscription.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;

    const db = this.firebaseAdmin.firestore;
    const userRef = db.collection('users').doc(userId);
    const subscriptionRef = db.collection('subscriptions').doc(subscription.id);
    const now = new Date();

    // Atomic batch: user plan update + subscription record creation
    const batch = db.batch();

    batch.update(userRef, {
      'subscription.plan': plan,
      'subscription.status': SubscriptionStatus.ACTIVE,
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      'subscription.cancelAtPeriodEnd': false,
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });

    batch.set(subscriptionRef, {
      id: subscription.id,
      userId,
      stripeCustomerId: session.customer as string,
      plan,
      priceId: subscription.items.data[0].price.id,
      interval: subscription.items.data[0].price.recurring?.interval || 'month',
      amount: subscription.items.data[0].price.unit_amount || 0,
      currency: subscription.currency,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAt: null,
      canceledAt: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
    this.logger.log(`Subscription created for user ${userId}: ${plan}`);
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    if (!invoice.subscription) return;
    const sub = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    if (!userId) return;

    const plan = this.determinePlan(sub.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;

    await this.usersService.updateSubscription(userId, {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    });

    // Reset monthly usage
    await this.usersService.updateUsage(userId, {
      aiCreditsUsed: 0,
      exportsThisMonth: 0,
      aiCreditsLimit: limits.aiCredits,
      lastExportReset: new Date(),
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    if (!userId) return;
    await this.usersService.updateSubscription(userId, { status: SubscriptionStatus.PAST_DUE });
    this.logger.warn(`Payment failed for user ${userId}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    if (!userId) return;

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    await this.usersService.updateSubscription(userId, {
      plan,
      status: subscription.status as SubscriptionStatus,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    if (!userId) return;

    await this.usersService.updateSubscription(userId, {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.CANCELED,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    });

    const freeLimit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    await this.usersService.updateUsage(userId, { aiCreditsLimit: freeLimit.aiCredits });
    this.logger.log(`Subscription deleted for user ${userId}, downgraded to free`);
  }

  private determinePlan(priceId: string): SubscriptionPlan {
    // Primary: match against PLAN_CONFIGS (same IDs used by the frontend checkout)
    for (const [plan, config] of Object.entries(PLAN_CONFIGS) as [SubscriptionPlan, typeof PLAN_CONFIGS[SubscriptionPlan]][]) {
      if (
        config.stripePriceIdMonthly && priceId === config.stripePriceIdMonthly ||
        config.stripePriceIdYearly && priceId === config.stripePriceIdYearly
      ) {
        return plan;
      }
    }

    // Fallback: env var overrides (in case price IDs differ per environment)
    const prices = this.configService.get('stripe.prices');
    if (prices) {
      if (priceId === prices.proMonthly || priceId === prices.proYearly) {
        return SubscriptionPlan.PRO;
      }
      if (priceId === prices.enterpriseMonthly || priceId === prices.enterpriseYearly) {
        return SubscriptionPlan.ENTERPRISE;
      }
    }

    this.logger.warn(`Unknown price ID: ${priceId} — defaulting to FREE`);
    return SubscriptionPlan.FREE;
  }

  private async findUserByCustomerId(customerId: string): Promise<string | null> {
    const snapshot = await this.firebaseAdmin.firestore
      .collection('users')
      .where('subscription.stripeCustomerId', '==', customerId)
      .limit(1)
      .get();

    return snapshot.empty ? null : snapshot.docs[0].id;
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!);
  }
}
