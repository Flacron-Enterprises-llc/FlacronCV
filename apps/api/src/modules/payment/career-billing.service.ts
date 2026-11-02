import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { DEFAULT_APP_ID, APP_ID_METADATA_KEY } from '../../config/stripe-app';

/**
 * Paid access to the career tools (former V2 features) through V1's own Stripe
 * billing. V1 stays the only billing owner: same Stripe account, same customer,
 * same webhook endpoint and event ledger.
 *
 * COMMERCIAL MODEL (approved by the client, 2 Nov 2026): a career plan is an
 * optional ADD-ON — a separate Stripe subscription beside the unchanged V1
 * plan, with its own career credits. Customers buy it explicitly; nobody is
 * enrolled or charged automatically, and V1 plans include no career access.
 * - `CAREER_BILLING_MODE=disabled` (default): no checkout can be created.
 * - `CAREER_BILLING_MODE=addon`: checkout for plans whose Stripe price ids are
 *   configured in `CAREER_STRIPE_PRICES` (none are; they are created by the client).
 * No trial: none is defined for the add-on.
 *
 * A career subscription carries `metadata.product = 'career'`. Its webhook
 * events are routed here BEFORE V1's handlers, so a career payment, failure,
 * refund or cancellation can never change the V1 plan, V1 credits or the V1
 * subscription. The result is a state (`users/{uid}.careerSubscription`), not
 * an increment, so duplicate or out-of-order events cannot grant twice.
 */
export const CAREER_PRODUCT = 'career';
export const CAREER_PLANS = ['starter', 'professional', 'career_pro', 'business'] as const;
export type CareerPlanId = (typeof CAREER_PLANS)[number];
export type CareerInterval = 'month' | 'year';
export type CareerBillingMode = 'disabled' | 'addon';

export interface CareerSubscriptionState {
  plan: CareerPlanId;
  interval: CareerInterval;
  status: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Stripe event time (seconds) of the state written; older events are ignored. */
  stateAt: number;
  source: 'stripe';
  updatedAt: Date;
}

/** Statuses during which a career subscription still counts as live (no second one may be bought). */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function readCareerBillingMode(env: NodeJS.ProcessEnv = process.env): CareerBillingMode {
  const raw = env.CAREER_BILLING_MODE?.trim() || 'disabled';
  if (raw === 'disabled') return 'disabled';
  if (raw === 'addon') return 'addon';
  throw new Error('CAREER_BILLING_MODE must be disabled or addon');
}

/** `{"professional:month":"price_…"}` → map. Unknown keys are a boot error. */
export function readCareerStripePrices(env: NodeJS.ProcessEnv = process.env): Map<string, string> {
  const raw = env.CAREER_STRIPE_PRICES?.trim() ?? '';
  const out = new Map<string, string>();
  if (!raw) return out;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const [key, value] of Object.entries(parsed)) {
    const [plan, interval] = key.split(':');
    if (!(CAREER_PLANS as readonly string[]).includes(plan) || (interval !== 'month' && interval !== 'year')) {
      throw new Error(`CAREER_STRIPE_PRICES has an unknown key: ${key}`);
    }
    if (typeof value !== 'string' || !value.startsWith('price_')) throw new Error(`CAREER_STRIPE_PRICES ${key} must be a Stripe price id`);
    out.set(key, value);
  }
  return out;
}

type Metadata = Record<string, string>;

@Injectable()
export class CareerBillingService {
  private readonly logger = new Logger(CareerBillingService.name);
  private readonly stripe: Stripe | null;
  private readonly appId: string;
  readonly mode: CareerBillingMode;
  private readonly prices: Map<string, string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly usersService: UsersService,
    @Optional() stripe?: Stripe,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    this.stripe = stripe ?? (secretKey ? new Stripe(secretKey, { apiVersion: '2024-04-10' as never }) : null);
    this.appId = this.configService.get<string>('stripe.appId') || DEFAULT_APP_ID;
    this.mode = readCareerBillingMode(process.env);
    this.prices = readCareerStripePrices(process.env);
  }

  /** What the web shows before any purchase. Never charges. */
  async status(userId: string) {
    const user = await this.usersService.findByIdOrThrow(userId);
    const state = (user as unknown as { careerSubscription?: Partial<CareerSubscriptionState> & { source?: string } }).careerSubscription ?? null;
    const blockedReason =
      this.mode === 'disabled' ? 'disabled' : !this.stripe ? 'stripe_not_configured' : this.prices.size === 0 ? 'prices_not_configured' : null;
    return {
      model: 'addon' as const,
      mode: this.mode,
      purchasable: blockedReason === null,
      blockedReason,
      /** Plans/intervals that can actually be bought here, e.g. "professional:month". */
      configuredPrices: [...this.prices.keys()],
      /** True when V1's Stripe key is a test key: no real money moves. */
      stripeTestMode: /^(sk|rk)_test_/.test(this.configService.get<string>('stripe.secretKey') ?? ''),
      careerSubscription: state
        ? {
            plan: state.plan ?? null,
            interval: state.interval ?? null,
            status: state.status ?? null,
            currentPeriodEnd: state.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: Boolean(state.cancelAtPeriodEnd),
            source: state.source ?? null,
          }
        : null,
    };
  }

  /**
   * Starts Stripe Checkout for one career plan. Only on an explicit customer
   * action with the amount they were shown; never from a feature click.
   */
  async createCheckout(
    userId: string,
    input: { plan: string; interval: string; expectedAmountCents: number; idempotencyKey?: string },
    urls: { success: string; cancel: string },
  ): Promise<{ sessionId: string; url: string | null }> {
    if (this.mode === 'disabled') {
      throw new ForbiddenException({ code: 'CAREER_PURCHASE_DISABLED', message: 'Career plans cannot be purchased yet.' });
    }
    if (!(CAREER_PLANS as readonly string[]).includes(input.plan) || (input.interval !== 'month' && input.interval !== 'year')) {
      throw new BadRequestException('Unsupported career plan selection.');
    }
    const priceId = this.prices.get(`${input.plan}:${input.interval}`);
    if (!priceId || !this.stripe) {
      throw new ForbiddenException({ code: 'CAREER_PRICE_NOT_CONFIGURED', message: 'This career plan is not available for purchase.' });
    }

    const user = await this.usersService.findByIdOrThrow(userId);
    const existing = (user as unknown as { careerSubscription?: CareerSubscriptionState }).careerSubscription;
    if (existing && LIVE_STATUSES.has(existing.status)) {
      throw new ConflictException({ code: 'CAREER_ALREADY_SUBSCRIBED', message: 'You already have a career plan. Manage it from Billing.' });
    }

    // The price charged must be the one the person confirmed on screen.
    const price = await this.stripe.prices.retrieve(priceId);
    const expectedInterval = input.interval;
    if (
      !price.active ||
      price.currency !== 'usd' ||
      price.recurring?.interval !== expectedInterval ||
      price.unit_amount !== input.expectedAmountCents
    ) {
      throw new ConflictException({ code: 'CAREER_PRICE_CHANGED', message: 'The price shown is out of date. Reload and confirm again.' });
    }

    // One customer identity: reuse V1's Stripe customer, or create it the way V1 does.
    let customerId = user.subscription?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ email: user.email, name: user.displayName, metadata: this.metadata(userId) });
      customerId = customer.id;
      await this.usersService.updateSubscription(userId, { stripeCustomerId: customerId });
    }

    const metadata = this.metadata(userId, { product: CAREER_PRODUCT, careerPlan: input.plan, interval: input.interval });
    const session = await this.stripe.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: userId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: urls.success,
        cancel_url: urls.cancel,
        metadata,
        subscription_data: { metadata },
      },
      input.idempotencyKey ? { idempotencyKey: `career-checkout:${userId}:${input.idempotencyKey}` } : undefined,
    );
    return { sessionId: session.id, url: session.url };
  }

  /** True when this Stripe event concerns a career subscription. Decided before V1's handlers run. */
  async isCareerEvent(event: Stripe.Event): Promise<boolean> {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const product = (o: unknown) => (o as { metadata?: Metadata | null } | null)?.metadata?.product === CAREER_PRODUCT;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
        return product(obj);
      case 'invoice.paid':
      case 'invoice.payment_failed':
        return this.invoiceIsCareer(obj as unknown as Stripe.Invoice);
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'charge.refund.updated': {
        const invoiceId = (obj as { invoice?: string | { id: string } | null }).invoice;
        if (!invoiceId || !this.stripe) return false;
        const invoice = await this.stripe.invoices.retrieve(typeof invoiceId === 'string' ? invoiceId : invoiceId.id);
        return this.invoiceIsCareer(invoice);
      }
      default:
        return false;
    }
  }

  private invoiceIsCareer(invoice: Stripe.Invoice): boolean {
    const details = (invoice as unknown as { subscription_details?: { metadata?: Metadata | null } }).subscription_details;
    if (details?.metadata?.product === CAREER_PRODUCT) return true;
    const careerPrices = new Set(this.prices.values());
    return (invoice.lines?.data ?? []).some((line) => !!line.price?.id && careerPrices.has(line.price.id));
  }

  /** Applies a career event. Never touches `users.subscription`, V1 credits or the V1 Stripe subscription. */
  async apply(event: Stripe.Event): Promise<void> {
    const obj = event.data.object as unknown;
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = obj as Stripe.Checkout.Session;
        if (!session.subscription || !this.stripe) return;
        const sub = await this.stripe.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
        await this.writeState(sub, event.created);
        return;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
        await this.writeState(obj as Stripe.Subscription, event.created);
        return;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = obj as Stripe.Invoice;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId || !this.stripe) return;
        await this.writeState(await this.stripe.subscriptions.retrieve(subId), event.created);
        return;
      }
      case 'charge.refunded': {
        const charge = obj as Stripe.Charge;
        // V1's own rule: only a FULL refund ends access; a partial refund changes nothing.
        if (!charge.refunded || !this.stripe) return;
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
        if (!invoiceId) return;
        const invoice = await this.stripe.invoices.retrieve(invoiceId);
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId) return;
        let sub = await this.stripe.subscriptions.retrieve(subId);
        if (sub.status !== 'canceled') {
          try {
            sub = await this.stripe.subscriptions.cancel(subId);
          } catch (err) {
            this.logger.warn(`Could not cancel career subscription ${subId} after refund: ${(err as Error).message}`);
          }
        }
        await this.writeState(sub, event.created, { endNow: true });
        return;
      }
      default:
        // Disputes and refund updates are recorded by the shared ledger; no entitlement change.
        return;
    }
  }

  /** On V1 account deletion: cancel a live career subscription too, so nothing keeps billing. */
  async cancelForUser(userId: string): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const state = (user as unknown as { careerSubscription?: CareerSubscriptionState }).careerSubscription;
    if (!state?.stripeSubscriptionId || !this.stripe || !LIVE_STATUSES.has(state.status)) return;
    try {
      await this.stripe.subscriptions.cancel(state.stripeSubscriptionId);
    } catch (err) {
      this.logger.warn(`Could not cancel career subscription ${state.stripeSubscriptionId}: ${(err as Error).message}`);
    }
  }

  private async writeState(sub: Stripe.Subscription, eventCreated: number, options: { endNow?: boolean } = {}): Promise<void> {
    if (sub.metadata?.product !== CAREER_PRODUCT) return;
    const userId = sub.metadata?.firebaseUid || sub.metadata?.internal_user_id;
    const plan = sub.metadata?.careerPlan;
    if (!userId || !plan || !(CAREER_PLANS as readonly string[]).includes(plan)) {
      this.logger.warn(`Career subscription ${sub.id} has no usable user or plan metadata; not applied`);
      return;
    }
    const interval: CareerInterval = sub.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'year' : 'month';
    const db = this.firebaseAdmin.firestore;
    const ref = db.collection('users').doc(userId) as DocumentReference;
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data()?.careerSubscription as CareerSubscriptionState | undefined;
      // Out-of-order delivery: an older event never overwrites a newer state of the same subscription.
      if (current && current.stripeSubscriptionId === sub.id && current.stateAt > eventCreated) return;
      // A second career subscription never replaces a live first one silently.
      if (current && current.stripeSubscriptionId !== sub.id && LIVE_STATUSES.has(current.status) && !LIVE_STATUSES.has(sub.status)) return;
      const state: CareerSubscriptionState = {
        plan: plan as CareerPlanId,
        interval,
        status: options.endNow ? 'canceled' : sub.status,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd: options.endNow ? new Date(eventCreated * 1000) : sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        stateAt: eventCreated,
        source: 'stripe',
        updatedAt: new Date(),
      };
      tx.update(ref, { careerSubscription: state, updatedAt: new Date() });
    });
  }

  private metadata(userId: string, extra: Metadata = {}): Metadata {
    return { [APP_ID_METADATA_KEY]: this.appId, internal_user_id: userId, firebaseUid: userId, ...extra };
  }
}
