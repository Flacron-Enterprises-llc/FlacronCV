import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { resolveEffectivePlan } from '@flacroncv/shared-types';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { DEFAULT_APP_ID, APP_ID_METADATA_KEY } from '../../config/stripe-app';
import { CurrentPlanPrices, currentPlanForPriceId } from './plan-prices';
import {
  CAREER_ADDONS,
  CareerAddon,
  CareerPlanId,
  addonAllowedFor,
  careerAddon,
  careerPlanForV1,
  higherCareerPlan,
  readAddonPrices,
} from './career-addons';
import {
  AvailabilityContext,
  AvailabilitySource,
  CareerAccessAvailabilitySource,
  PURCHASE_AVAILABILITY_SOURCE,
  PurchaseBlockReason,
  PurchaseProvider,
  addonAvailability,
} from './purchase-availability';
import { currentCaller } from '../career-metering/caller-context';
import { BillingLedgerService } from './billing-ledger.service';
import { appIdOf, resolveCheckoutCustomer } from './customer-ownership';
import { CheckoutCoordinator, DbLike } from './checkout-coordination';
import { USD_ONLY_CHECKOUT } from './checkout-currency';

/**
 * The career tools (former V2 features) inside V1's own Stripe billing.
 * V1 stays the only billing owner: same Stripe account, same customer, same
 * webhook endpoint and event ledger.
 *
 * FIVE-PLAN MODEL (product decision, 14 Nov 2026): a V1 plan purchase IS the
 * career plan (Free / Starter / Professional / Career Pro / Business map 1:1;
 * legacy Pro / Career Accelerator / Enterprise map to Starter / Professional /
 * Career Pro). The former optional career ADD-ON subscription is therefore
 * retired: no new add-on checkout can be created, so nobody can pay twice for
 * the same features. Customers who already have one keep it, and its events
 * keep being applied here (renewal, failure, refund, cancellation) until it
 * ends; the career service grants the higher of the V1 plan and a live add-on.
 *
 * What is still sold here, only when its Stripe price is configured in env:
 * - one-time packs (Checkout, payment mode) → `career_pack_purchases/{id}`;
 * - recurring capacity add-ons (Checkout, subscription mode, one subscription
 *   per add-on with a quantity) → `career_capacity_subscriptions/{subId}`.
 * The career service reads those records (read-only) and grants packs once
 * per purchase id and capacity while the subscription is paid.
 *
 * Grants are always derived from the Stripe PRICE id (env maps), never from
 * client-chosen data. Metadata identifies the person and the product line;
 * the plan in `metadata.careerPlan` is read only for an old add-on whose
 * price is no longer configured.
 */
export const CAREER_PRODUCT = 'career';
export const CAREER_PACK_PRODUCT = 'career_pack';
export const CAREER_CAPACITY_PRODUCT = 'career_capacity';
const CAREER_PRODUCTS = new Set([CAREER_PRODUCT, CAREER_PACK_PRODUCT, CAREER_CAPACITY_PRODUCT]);

/** Firestore records the career service reads (see apps/career-api/src/integration/v1-account.source.ts). */
export const PACK_PURCHASES = 'career_pack_purchases';
export const CAPACITY_SUBSCRIPTIONS = 'career_capacity_subscriptions';

export const CAREER_PLANS = ['starter', 'professional', 'career_pro', 'business'] as const;
export type CareerPaidPlanId = (typeof CAREER_PLANS)[number];
export type CareerInterval = 'month' | 'year';
export type CareerBillingMode = 'disabled' | 'addon';

export interface CareerSubscriptionState {
  plan: CareerPaidPlanId;
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

/** Statuses during which a subscription still counts as live (no second one may be bought). */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Kept for configuration compatibility: `CAREER_BILLING_MODE` still parses,
 * but no mode re-opens the retired add-on checkout.
 */
export function readCareerBillingMode(env: NodeJS.ProcessEnv = process.env): CareerBillingMode {
  const raw = env.CAREER_BILLING_MODE?.trim() || 'disabled';
  if (raw === 'disabled') return 'disabled';
  if (raw === 'addon') return 'addon';
  throw new Error('CAREER_BILLING_MODE must be disabled or addon');
}

/** `{"professional:month":"price_…"}` → map: the prices of EXISTING add-on subscriptions. Unknown keys are a boot error. */
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

/** One add-on as the web shows it: what it is, whether it can be bought now, and why not. */
export interface CareerAddonOffer {
  id: string;
  kind: CareerAddon['kind'];
  unit: string;
  units: number;
  priceCents: number;
  billing: CareerAddon['billing'];
  minPlan: CareerPlanId;
  /** A Stripe price is configured. False → "not on sale yet". */
  onSale: boolean;
  /** The person's plan may buy it now (Free upgrades first). */
  allowed: boolean;
  /**
   * The feature is built, switched on and has its providers (purchase-availability.ts).
   * The same decision the server applies at checkout; the web only explains it.
   */
  available: boolean;
  unavailableReason: PurchaseBlockReason | null;
  /** The missing provider when unavailableReason is provider_missing. */
  unavailableProvider: PurchaseProvider | null;
}

/**
 * The career plan a V1 user document gives: the mapped V1 plan, or a live
 * legacy add-on if higher. Shared by checkout and the automatic top-up.
 */
export function careerPlanOfUser(user: unknown): CareerPlanId {
  const data = (user ?? {}) as { subscription?: unknown; careerSubscription?: Partial<CareerSubscriptionState> };
  const mapped = careerPlanForV1(resolveEffectivePlan(data.subscription as never));
  const addon = data.careerSubscription;
  const end = addon?.currentPeriodEnd ? new Date(addon.currentPeriodEnd as unknown as string) : null;
  const withinPeriod = !!end && !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  const live =
    !!addon?.plan &&
    ((addon.status === 'active' || addon.status === 'trialing') ? end === null || withinPeriod : (addon.status === 'past_due' || addon.status === 'canceled') && withinPeriod);
  return higherCareerPlan(mapped, live ? (addon!.plan as CareerPlanId) : null);
}

@Injectable()
export class CareerBillingService {
  private readonly logger = new Logger(CareerBillingService.name);
  private readonly stripe: Stripe | null;
  private readonly appId: string;
  readonly mode: CareerBillingMode;
  /** Prices of existing career add-on subscriptions (`plan:interval` → price id). */
  private readonly prices: Map<string, string>;
  /** Pack and capacity prices (`addonId` → price id). */
  private readonly addonPrices: Map<string, string>;
  /** Whether a pack's feature is built, switched on and has its providers. Fails closed. */
  private readonly availability: AvailabilitySource;
  /** The shared billing ledger: pack payments, disputes and created customers are recorded there. */
  private readonly ledger: BillingLedgerService;
  private readonly customerKeys: CheckoutCoordinator;

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly usersService: UsersService,
    @Optional() stripe?: Stripe,
    @Optional() @Inject(PURCHASE_AVAILABILITY_SOURCE) availability?: AvailabilitySource,
    @Optional() ledger?: BillingLedgerService,
  ) {
    this.ledger = ledger ?? new BillingLedgerService(firebaseAdmin);
    // Same per-user customer key store as plan checkout (PaymentService).
    this.customerKeys = new CheckoutCoordinator(() => this.firebaseAdmin.firestore as unknown as DbLike);
    this.availability = availability ?? new CareerAccessAvailabilitySource(process.env.CAREER_API_URL);
    const secretKey = this.configService.get<string>('stripe.secretKey');
    this.stripe = stripe ?? (secretKey ? new Stripe(secretKey, { apiVersion: '2024-04-10' as never }) : null);
    this.appId = this.configService.get<string>('stripe.appId') || DEFAULT_APP_ID;
    this.mode = readCareerBillingMode(process.env);
    this.prices = readCareerStripePrices(process.env);
    this.addonPrices = readAddonPrices(process.env);
  }

  /** What the web shows. Never charges. */
  async status(userId: string) {
    const user = await this.usersService.findByIdOrThrow(userId);
    const state = (user as unknown as { careerSubscription?: Partial<CareerSubscriptionState> & { source?: string } }).careerSubscription ?? null;
    const careerPlan = this.careerPlanOf(user);
    return {
      /** Career tools are part of every plan; the add-on is no longer sold. */
      model: 'included' as const,
      careerPlan,
      mode: this.mode,
      purchasable: false,
      blockedReason: 'retired' as const,
      configuredPrices: [] as string[],
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
      addons: this.offers(careerPlan, await this.availabilityContext()),
    };
  }

  /** The career service's view for the current caller (their own ID token), or null: fail closed. */
  private async availabilityContext(): Promise<AvailabilityContext | null> {
    return this.availability.forCaller(currentCaller()?.idToken ?? null);
  }

  /** The add-on catalog for this person's plan. `ctx` null = the career service could not be asked (nothing on sale). */
  offers(plan: CareerPlanId, ctx: AvailabilityContext | null): CareerAddonOffer[] {
    return CAREER_ADDONS.map((addon) => {
      const availability = addonAvailability(addon.id, ctx);
      return {
      id: addon.id,
      kind: addon.kind,
      unit: addon.unit,
      units: addon.units,
      priceCents: addon.priceCents,
      billing: addon.billing,
      minPlan: addon.minPlan,
      onSale: !!this.stripe && this.addonPrices.has(addon.id),
      allowed: addonAllowedFor(plan, addon.id).ok,
      available: availability.available,
      unavailableReason: availability.available ? null : availability.reason,
      unavailableProvider: availability.available ? null : availability.provider ?? null,
      };
    });
  }

  /**
   * RETIRED (five-plan model): a separate career subscription would charge a
   * second time for features every V1 plan now includes. Plan purchases go
   * through V1's plan checkout (`POST /payments/checkout`).
   */
  async createCheckout(
    _userId: string,
    _input: { plan: string; interval: string; expectedAmountCents: number; idempotencyKey?: string },
    _urls: { success: string; cancel: string },
  ): Promise<{ sessionId: string; url: string | null }> {
    throw new GoneException({
      code: 'CAREER_ADDON_RETIRED',
      message: 'Career tools are included in every plan. Choose or change your plan on the pricing page.',
    });
  }

  /**
   * One-time pack through Stripe Checkout (payment mode). Only on an explicit
   * customer action with the amount they were shown. Free must upgrade first;
   * each pack has a plan minimum. Unset price → `ADDON_NOT_ON_SALE` (503).
   */
  async createPackCheckout(
    userId: string,
    input: { addonId: string; expectedAmountCents: number; idempotencyKey?: string },
    urls: { success: string; cancel: string },
  ): Promise<{ sessionId: string; url: string | null }> {
    const addon = careerAddon(input.addonId);
    if (!addon || addon.billing !== 'one_time') throw new BadRequestException({ code: 'UNKNOWN_ADDON', message: 'Unknown pack.' });
    const { user, priceId } = await this.prepareAddonPurchase(userId, addon, input.expectedAmountCents, 1);
    const customerId = await this.customerFor(userId, user);
    const metadata = this.metadata(userId, { product: CAREER_PACK_PRODUCT, addonId: addon.id });
    const session = await this.stripe!.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: userId,
        payment_method_types: ['card'],
        ...USD_ONLY_CHECKOUT,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: urls.success,
        cancel_url: urls.cancel,
        metadata,
        payment_intent_data: { metadata },
      },
      input.idempotencyKey ? { idempotencyKey: `career-pack:${userId}:${input.idempotencyKey}` } : undefined,
    );
    return { sessionId: session.id, url: session.url };
  }

  /**
   * Recurring capacity add-on (extra location, saved searches, portfolio page,
   * storage; Business seats, candidates, storage) as its own subscription with
   * a quantity, so it renews and cancels at period end on its own and never
   * changes the plan subscription. One live subscription per add-on: more
   * quantity is changed in the billing portal.
   */
  async createCapacityCheckout(
    userId: string,
    input: { addonId: string; quantity: number; expectedAmountCents: number; idempotencyKey?: string },
    urls: { success: string; cancel: string },
  ): Promise<{ sessionId: string; url: string | null }> {
    const addon = careerAddon(input.addonId);
    if (!addon || addon.billing !== 'monthly') throw new BadRequestException({ code: 'UNKNOWN_ADDON', message: 'Unknown add-on.' });
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Quantity must be between 1 and 100.' });
    }
    const { user, priceId } = await this.prepareAddonPurchase(userId, addon, input.expectedAmountCents, input.quantity);
    const live = await this.firebaseAdmin.firestore
      .collection(CAPACITY_SUBSCRIPTIONS)
      .where('uid', '==', userId)
      .where('addonId', '==', addon.id)
      .get();
    if (live.docs.some((doc: { data(): Record<string, unknown> }) => LIVE_STATUSES.has(String(doc.data().status)))) {
      throw new ConflictException({ code: 'ADDON_ALREADY_ACTIVE', message: 'You already have this add-on. Change the quantity from Billing.' });
    }
    const customerId = await this.customerFor(userId, user);
    const metadata = this.metadata(userId, { product: CAREER_CAPACITY_PRODUCT, addonId: addon.id });
    const session = await this.stripe!.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: userId,
        payment_method_types: ['card'],
        ...USD_ONLY_CHECKOUT,
        line_items: [{ price: priceId, quantity: input.quantity }],
        mode: 'subscription',
        success_url: urls.success,
        cancel_url: urls.cancel,
        metadata,
        subscription_data: { metadata },
      },
      input.idempotencyKey ? { idempotencyKey: `career-capacity:${userId}:${input.idempotencyKey}` } : undefined,
    );
    return { sessionId: session.id, url: session.url };
  }

  /** Plan gate, configured price, and the confirmed amount equal to Stripe's price and the catalog. */
  private async prepareAddonPurchase(userId: string, addon: CareerAddon, expectedAmountCents: number, quantity: number) {
    const priceId = this.addonPrices.get(addon.id);
    if (!priceId || !this.stripe) {
      throw new ServiceUnavailableException({ code: 'ADDON_NOT_ON_SALE', message: 'This add-on is not on sale yet.' });
    }
    // A configured price never makes an unavailable feature purchasable. Checked
    // before anything else touches Stripe (no customer, no session, no grant).
    const availability = addonAvailability(addon.id, await this.availabilityContext());
    if (!availability.available) {
      throw new ServiceUnavailableException({
        code: 'ADDON_UNAVAILABLE',
        reason: availability.reason,
        ...(availability.provider ? { provider: availability.provider } : {}),
        message: 'This add-on cannot be bought yet.',
      });
    }
    const user = await this.usersService.findByIdOrThrow(userId);
    const allowed = addonAllowedFor(this.careerPlanOf(user), addon.id);
    if (!allowed.ok) {
      throw new ForbiddenException({ code: allowed.reason, minimumPlan: allowed.minimumPlan, message: 'Upgrade your plan to buy this add-on.' });
    }
    const price = await this.stripe.prices.retrieve(priceId);
    // Same ownership rule as plan checkout (PaymentService.assertPriceIsOurs):
    // only this application's price, in this key's mode.
    const keyMode = /^(?:sk|rk)_(live|test)_/.exec(this.configService.get<string>('stripe.secretKey') ?? '')?.[1] ?? null;
    if (price.metadata?.[APP_ID_METADATA_KEY] !== this.appId || (keyMode !== null && price.livemode !== (keyMode === 'live'))) {
      this.logger.error(`Refusing add-on price ${priceId}: app_id=${price.metadata?.[APP_ID_METADATA_KEY] ?? 'none'} livemode=${price.livemode}`);
      throw new ServiceUnavailableException({ code: 'ADDON_NOT_ON_SALE', message: 'This add-on is not on sale yet.' });
    }
    const recurring = price.recurring?.interval ?? null;
    const shapeOk = addon.billing === 'one_time' ? recurring === null : recurring === 'month';
    if (
      !price.active ||
      price.currency !== 'usd' ||
      !shapeOk ||
      price.unit_amount !== addon.priceCents ||
      expectedAmountCents !== addon.priceCents * quantity
    ) {
      throw new ConflictException({ code: 'ADDON_PRICE_CHANGED', message: 'The price shown is out of date. Reload and confirm again.' });
    }
    return { user, priceId };
  }

  /** The career plan a V1 customer has now: the mapped V1 plan, or a live legacy add-on if higher. */
  careerPlanOf(user: unknown): CareerPlanId {
    return careerPlanOfUser(user);
  }

  /** True when this Stripe event concerns a career subscription, pack or capacity add-on. Decided before V1's handlers run. */
  async isCareerEvent(event: Stripe.Event): Promise<boolean> {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const product = (o: unknown) => CAREER_PRODUCTS.has(String((o as { metadata?: Metadata | null } | null)?.metadata?.product ?? ''));
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
      case 'charge.dispute.closed':
      case 'charge.refund.updated': {
        const charge = await this.chargeOf(event);
        if (!charge) return false;
        if ((await this.packPurchaseRefOf(charge)) !== null) return true;
        const invoiceId = charge.invoice;
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
    if (CAREER_PRODUCTS.has(String(details?.metadata?.product ?? ''))) return true;
    const careerPrices = new Set([...this.prices.values(), ...this.addonPrices.values()]);
    return (invoice.lines?.data ?? []).some((line) => !!line.price?.id && careerPrices.has(line.price.id));
  }

  /** Applies a career event. Never touches `users.subscription`, V1 credits or the V1 plan subscription. */
  async apply(event: Stripe.Event): Promise<void> {
    const obj = event.data.object as unknown;
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = obj as Stripe.Checkout.Session;
        if (session.metadata?.product === CAREER_PACK_PRODUCT) {
          await this.recordPackPurchase(session, event.created);
          return;
        }
        if (!session.subscription || !this.stripe) return;
        const sub = await this.stripe.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
        await this.writeAnyState(sub, event.created);
        return;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
        await this.writeAnyState(obj as Stripe.Subscription, event.created);
        return;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = obj as Stripe.Invoice;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId || !this.stripe) return;
        await this.writeAnyState(await this.stripe.subscriptions.retrieve(subId), event.created);
        return;
      }
      case 'charge.refunded': {
        const charge = obj as Stripe.Charge;
        // POLICY (intentional): only a FULL refund ends access. A PARTIAL refund
        // of a pack revokes nothing (no units are taken back pro rata), and a
        // partial refund of a capacity/add-on invoice leaves the subscription
        // running. The refund itself is still recorded in billing_refunds by
        // the shared ledger and nets against the recorded pack payment.
        if (!charge.refunded || !this.stripe) return;
        const packRef = await this.packPurchaseRefOf(charge);
        if (packRef) {
          await this.markPack(packRef, 'refunded', event.created);
          return;
        }
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
        await this.writeAnyState(sub, event.created, { endNow: true });
        return;
      }
      case 'charge.dispute.created': {
        // A disputed pack: its unused units are revoked (section 11). Plan
        // disputes are recorded by the shared ledger with no entitlement change.
        await this.recordDispute(obj as Stripe.Dispute);
        const charge = await this.chargeOf(event);
        const packRef = charge ? await this.packPurchaseRefOf(charge) : null;
        if (packRef) await this.markPack(packRef, 'disputed', event.created);
        return;
      }
      case 'charge.dispute.closed': {
        // Won: the pack is paid again. Lost (or warning_closed): it stays
        // revoked. See restorePack for what the career sync does with it.
        const dispute = obj as Stripe.Dispute;
        await this.recordDispute(dispute);
        if (dispute.status !== 'won') return;
        const charge = await this.chargeOf(event);
        const packRef = charge ? await this.packPurchaseRefOf(charge) : null;
        if (packRef) await this.restorePack(packRef, event.created);
        return;
      }
      default:
        // Refund updates are recorded by the shared ledger; no entitlement change.
        return;
    }
  }

  /** On V1 account deletion: cancel live career subscriptions too, so nothing keeps billing. */
  async cancelForUser(userId: string): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const state = (user as unknown as { careerSubscription?: CareerSubscriptionState }).careerSubscription;
    const ids: string[] = [];
    if (state?.stripeSubscriptionId && LIVE_STATUSES.has(state.status)) ids.push(state.stripeSubscriptionId);
    const capacity = await this.firebaseAdmin.firestore.collection(CAPACITY_SUBSCRIPTIONS).where('uid', '==', userId).get();
    for (const doc of capacity.docs) if (LIVE_STATUSES.has(String(doc.data().status))) ids.push(doc.id);
    if (!this.stripe) return;
    for (const id of ids) {
      try {
        await this.stripe.subscriptions.cancel(id);
      } catch (err) {
        this.logger.warn(`Could not cancel career subscription ${id}: ${(err as Error).message}`);
      }
    }
  }

  /** The career plan an add-on subscription grants: from its PRICE id; metadata only for an old, unlisted price. */
  planForSubscription(sub: Stripe.Subscription): CareerPaidPlanId | null {
    const priceId = sub.items?.data?.[0]?.price?.id ?? '';
    for (const [key, value] of this.prices) {
      if (value === priceId) return key.split(':')[0] as CareerPaidPlanId;
    }
    const planPrices = this.configService.get<CurrentPlanPrices>('stripe.planPrices');
    const fromPlanPrice = currentPlanForPriceId(planPrices, priceId);
    if (fromPlanPrice && (CAREER_PLANS as readonly string[]).includes(fromPlanPrice)) return fromPlanPrice as CareerPaidPlanId;
    const legacy = sub.metadata?.careerPlan;
    if (legacy && (CAREER_PLANS as readonly string[]).includes(legacy)) {
      this.logger.warn(`Career subscription ${sub.id}: price ${priceId || '(none)'} is not configured; using its legacy metadata plan`);
      return legacy as CareerPaidPlanId;
    }
    return null;
  }

  /** The capacity add-on a subscription carries: from its PRICE id only. */
  addonForPrice(priceId: string | null | undefined): CareerAddon | null {
    if (!priceId) return null;
    for (const [addonId, value] of this.addonPrices) {
      if (value === priceId) return careerAddon(addonId);
    }
    return null;
  }

  private async writeAnyState(sub: Stripe.Subscription, eventCreated: number, options: { endNow?: boolean } = {}): Promise<void> {
    if (sub.metadata?.product === CAREER_CAPACITY_PRODUCT) return this.writeCapacityState(sub, eventCreated, options);
    return this.writeState(sub, eventCreated, options);
  }

  private async writeState(sub: Stripe.Subscription, eventCreated: number, options: { endNow?: boolean } = {}): Promise<void> {
    if (sub.metadata?.product !== CAREER_PRODUCT) return;
    const userId = sub.metadata?.firebaseUid || sub.metadata?.internal_user_id;
    // A portal switch changes the price: the plan follows the price, never the original metadata.
    const plan = this.planForSubscription(sub);
    if (!userId || !plan) {
      this.logger.warn(`Career subscription ${sub.id} has no usable user or price; not applied`);
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
        plan,
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

  /** Capacity add-on state, one document per subscription. A state, not an increment: replays and old events change nothing. */
  private async writeCapacityState(sub: Stripe.Subscription, eventCreated: number, options: { endNow?: boolean } = {}): Promise<void> {
    const userId = sub.metadata?.firebaseUid || sub.metadata?.internal_user_id;
    const item = sub.items?.data?.[0];
    const addon = this.addonForPrice(item?.price?.id);
    if (!userId || !addon || addon.billing !== 'monthly') {
      this.logger.warn(`Capacity subscription ${sub.id} has no usable user or configured price; not applied`);
      return;
    }
    const db = this.firebaseAdmin.firestore;
    const ref = db.collection(CAPACITY_SUBSCRIPTIONS).doc(sub.id) as DocumentReference;
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() as { stateAt?: number }) : null;
      if (current?.stateAt !== undefined && current.stateAt > eventCreated) return;
      tx.set(ref, {
        uid: userId,
        addonId: addon.id,
        quantity: item?.quantity ?? 1,
        status: options.endNow ? 'canceled' : sub.status,
        currentPeriodEnd: options.endNow ? new Date(eventCreated * 1000) : sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        stateAt: eventCreated,
        updatedAt: new Date(),
      });
    });
  }

  /**
   * A paid pack Checkout. The pack is the one its PRICE says (line items),
   * the amount is what Stripe charged. Recorded once per session id; a
   * redelivery or a later refund state is never overwritten back to paid.
   */
  private async recordPackPurchase(session: Stripe.Checkout.Session, eventCreated: number): Promise<void> {
    if (session.payment_status !== 'paid' || !this.stripe) return;
    const userId = session.metadata?.firebaseUid || session.metadata?.internal_user_id;
    const items = await this.stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
    const priceId = items.data[0]?.price?.id;
    const addon = priceId ? [...this.addonPrices].find(([, value]) => value === priceId)?.[0] : undefined;
    const pack = addon ? careerAddon(addon) : null;
    if (!userId || !pack || pack.billing !== 'one_time' || items.data.length !== 1) {
      this.logger.warn(`Pack checkout ${session.id} has no usable user or configured pack price; not applied`);
      return;
    }
    await this.writePackPurchase(session.id, {
      uid: userId,
      addonId: pack.id,
      purchasedAt: new Date(eventCreated * 1000),
      amountCents: session.amount_total ?? null,
      currency: session.currency ?? null,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      autoTopup: false,
    });
    await this.recordPackPayment(session, userId);
  }

  /**
   * The pack's money in billing_payments, keyed by its PaymentIntent id, so a
   * redelivered completion (or the refund path, which updates the same row)
   * never counts it twice. Only a PaymentIntent verifiably ours is recorded:
   * app_id on the PaymentIntent (set via payment_intent_data) or, if Stripe
   * left it untagged, on the Checkout Session; never another app's.
   *
   * If the PaymentIntent cannot be read, the payment is still recorded from
   * the session's own verified facts (a `paid` payment-mode session means its
   * PaymentIntent succeeded for `amount_total`), keyed by the same id, so the
   * revenue is never lost and a later read overwrites the same row. A ledger
   * write failure propagates, so the webhook claim is released and Stripe retries.
   */
  private async recordPackPayment(session: Stripe.Checkout.Session, userId: string): Promise<void> {
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntentId || !this.stripe) {
      this.logger.warn(`Pack checkout ${session.id} has no PaymentIntent; payment not recorded in the ledger`);
      return;
    }
    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      this.logger.warn(`Pack PaymentIntent ${paymentIntentId} could not be read (${(err as Error).message}); recording from the session`);
      if (appIdOf(session) !== this.appId) return;
      await this.ledger.recordPaymentIntent({
        paymentIntentId,
        applicationId: this.appId,
        livemode: !!session.livemode,
        amount: session.amount_total ?? 0,
        currency: session.currency ?? 'usd',
        stripeStatus: 'succeeded',
        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
        internalUserId: userId,
        chargeId: null,
      });
      return;
    }
    const owner = appIdOf(intent) ?? appIdOf(session);
    if (owner !== this.appId) {
      this.logger.warn(`Pack PaymentIntent ${paymentIntentId} is stamped ${owner ?? 'nothing'}, not ${this.appId}; not recorded`);
      return;
    }
    await this.ledger.recordPaymentIntent({
      paymentIntentId: intent.id,
      applicationId: owner,
      livemode: typeof intent.livemode === 'boolean' ? intent.livemode : !!session.livemode,
      amount: intent.status === 'succeeded' ? intent.amount_received ?? intent.amount : intent.amount,
      currency: intent.currency ?? session.currency ?? 'usd',
      stripeStatus: intent.status,
      customerId: typeof intent.customer === 'string' ? intent.customer : intent.customer?.id ?? null,
      internalUserId: userId,
      chargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id ?? null,
      failureMessage: intent.last_payment_error?.message ?? null,
    });
  }

  /** A career dispute in billing_disputes (idempotent; the ledger keeps the newest status). */
  private async recordDispute(dispute: Stripe.Dispute): Promise<void> {
    if (!dispute?.id) return;
    await this.ledger.recordDispute({
      id: dispute.id,
      chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? '',
      paymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null,
      amount: dispute.amount,
      currency: dispute.currency,
      status: dispute.status,
      reason: dispute.reason ?? null,
      created: dispute.created,
      // Career events reach apply() only after the webhook verified the app id.
      applicationId: this.appId,
      livemode: !!dispute.livemode,
    });
  }

  /** Writes a paid pack record once (create-if-absent). Shared with the automatic top-up. */
  async writePackPurchase(
    purchaseRef: string,
    record: { uid: string; addonId: string; purchasedAt: Date; amountCents: number | null; currency: string | null; paymentIntentId: string | null; autoTopup: boolean },
  ): Promise<void> {
    const db = this.firebaseAdmin.firestore;
    const ref = db.collection(PACK_PURCHASES).doc(purchaseRef) as DocumentReference;
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (snap.exists) return;
      tx.set(ref, { ...record, status: 'paid', createdAt: new Date(), updatedAt: new Date() });
    });
  }

  private async markPack(purchaseRef: string, status: 'refunded' | 'disputed', eventCreated: number): Promise<void> {
    const db = this.firebaseAdmin.firestore;
    const ref = db.collection(PACK_PURCHASES).doc(purchaseRef) as DocumentReference;
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as { status?: string };
      if (current.status === 'refunded' || current.status === status) return;
      tx.update(ref, { status, endedAt: new Date(eventCreated * 1000), updatedAt: new Date() });
    });
  }

  /**
   * A dispute closed as WON: the pack is `paid` again. Idempotent: only a
   * `disputed` record moves (a refunded one never comes back), and a replay
   * finds it already paid. On the career side the sync grants a `paid` pack
   * once per purchaseRef (grantPaidPack is a no-op for a known purchase): if
   * the sync had not yet revoked the units they simply stay; if it had, this
   * record stops further revocation, but re-crediting already revoked units
   * needs a reinstate path in packages/career-server (not in this API).
   */
  private async restorePack(purchaseRef: string, eventCreated: number): Promise<void> {
    const db = this.firebaseAdmin.firestore;
    const ref = db.collection(PACK_PURCHASES).doc(purchaseRef) as DocumentReference;
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as { status?: string };
      if (current.status !== 'disputed') return;
      tx.update(ref, { status: 'paid', endedAt: null, disputeWonAt: new Date(eventCreated * 1000), updatedAt: new Date() });
    });
  }

  /** The pack record a charge paid for (by PaymentIntent), or null. */
  private async packPurchaseRefOf(charge: Stripe.Charge): Promise<string | null> {
    const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!pi) return null;
    const direct = await this.firebaseAdmin.firestore.collection(PACK_PURCHASES).doc(pi).get();
    if (direct.exists) return pi;
    const found = await this.firebaseAdmin.firestore.collection(PACK_PURCHASES).where('paymentIntentId', '==', pi).limit(1).get();
    return found.docs[0]?.id ?? null;
  }

  private async chargeOf(event: Stripe.Event): Promise<Stripe.Charge | null> {
    const obj = event.data.object as unknown as Record<string, unknown>;
    if (event.type === 'charge.refunded') return obj as unknown as Stripe.Charge;
    const chargeRef = (obj as { charge?: string | { id: string } | null }).charge;
    const chargeId = typeof chargeRef === 'string' ? chargeRef : chargeRef?.id;
    if (!chargeId || !this.stripe) return null;
    return this.stripe.charges.retrieve(chargeId);
  }

  /**
   * One customer identity: reuse V1's Stripe customer only when it still
   * exists and is FlacronCV's (an untagged legacy one is claimed), otherwise
   * create a FlacronCV customer the way V1 does and record it in
   * billing_customers. Another app's customer is never reused.
   */
  private async customerFor(userId: string, user: { email?: string; displayName?: string; subscription?: { stripeCustomerId?: string | null } }): Promise<string> {
    return resolveCheckoutCustomer(this.stripe!, {
      appId: this.appId,
      userId,
      email: user.email ?? null,
      name: user.displayName ?? null,
      storedCustomerId: user.subscription?.stripeCustomerId ?? null,
      ledger: this.ledger,
      saveCustomerId: async (customerId) => {
        await this.usersService.updateSubscription(userId, { stripeCustomerId: customerId });
      },
      keys: this.customerKeys,
      log: this.logger,
    });
  }

  private metadata(userId: string, extra: Metadata = {}): Metadata {
    return { [APP_ID_METADATA_KEY]: this.appId, internal_user_id: userId, firebaseUid: userId, ...extra };
  }
}
