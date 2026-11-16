import { Injectable, Logger, BadRequestException, ConflictException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus, BillingInterval, PLAN_CONFIGS, BillingInvoice, TRIAL_PERIOD_DAYS, YEARLY_BILLING_ENABLED, PLAN_TRIAL_DAYS, asSubscriptionPlan, hasLiveStorePurchase, hasLiveStripeSubscription, isLegacyPlan, isPlanUpgrade, resolveEffectivePlan } from '@flacroncv/shared-types';
import { CurrentPlanPrices, currentPlanForPriceId, currentPlanPriceId, isCurrentPaidPlan, publicPlanCatalog, PublicPlanCatalog } from './plan-prices';
import { isLiveStripeSecretKey } from '../../config/stripe-live-prices';
import { APP_ID_METADATA_KEY, DEFAULT_APP_ID, stripeKeyMode } from '../../config/stripe-app';
import { BillingLedgerService, EventOutcome } from './billing-ledger.service';
import { LedgerPayment, LedgerSubscription, ledgerPaymentStatus } from './billing-ledger';
import { CareerBillingService } from './career-billing.service';
import { CheckoutClient, isLegacyMobileCheckoutPlan } from './legacy-mobile-checkout';
import {
  CHECKOUT_SESSION_TTL_SECONDS,
  CheckoutCoordinator,
  CheckoutInProgressError,
  CheckoutLease,
  DbLike,
  sessionIdempotencyKey,
} from './checkout-coordination';

/** The Stripe events this API acts on. Anything else is acknowledged and ignored. */
const HANDLED_STRIPE_EVENTS: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'charge.refunded',
  'charge.refund.updated',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

/**
 * Why an attributed event changed no entitlement. Recorded on the event row
 * (`payment_events/{id}.entitlement_decision`) so a skipped event can be
 * explained later. Fixed codes only — never an email, a name or an id.
 */
type HandlerDecision = string | null | void;

/** Subscription conflicts (duplicate live subscriptions) and what was done about them. */
export const BILLING_CONFLICTS_COLLECTION = 'billing_conflicts';

/** Stripe statuses of an unpaid renewal: the paid period must not be extended. */
const UNPAID_STRIPE_STATUSES: ReadonlySet<string> = new Set(['past_due', 'unpaid', 'incomplete']);

/** The subscription an invoice belongs to (pre-2025 field, then the `parent` shape). */
function invoiceSubscriptionId(invoice: Stripe.Invoice | null | undefined): string | null {
  if (!invoice) return null;
  return (
    stripeId(invoice.subscription as string | { id: string } | null | undefined) ??
    stripeId(
      (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } | null } } })
        .parent?.subscription_details?.subscription ?? null,
    )
  );
}

/** Thrown when another delivery of the same event is mid-flight; Stripe retries. */
export class StripeEventInProgressError extends Error {}

type Metadata = Record<string, string>;

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

function fromUnix(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe!: Stripe;
  private readonly ledger: BillingLedgerService;
  /** Durable per-user Checkout lock/record (checkout_coordination/{uid}). */
  private readonly checkoutCoordinator: CheckoutCoordinator;

  /** This application's id on the shared Flacron Stripe account. */
  readonly appId: string;

  /**
   * Whether the configured key is live. Null when Stripe is not configured.
   * Events and prices from the other mode are never applied.
   */
  readonly livemode: boolean | null;

  /** Price ids already confirmed as ours, with the time the confirmation expires. */
  private readonly verifiedPrices = new Map<string, number>();

  constructor(
    private configService: ConfigService,
    private firebaseAdmin: FirebaseAdminService,
    private usersService: UsersService,
    private audit: AuditService,
    @Optional() ledger?: BillingLedgerService,
    // Career tools (former V2): their subscriptions are routed away from every V1 handler.
    @Optional() private readonly careerBilling?: CareerBillingService,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' as any });
    }
    this.ledger = ledger ?? new BillingLedgerService(firebaseAdmin);
    this.checkoutCoordinator = new CheckoutCoordinator(() => this.firebaseAdmin.firestore as unknown as DbLike);
    this.appId = this.configService.get<string>('stripe.appId') || DEFAULT_APP_ID;
    const mode = stripeKeyMode(secretKey);
    this.livemode = mode === null ? null : mode === 'live';
  }

  /**
   * Metadata for every Stripe object this application creates: `app_id` makes
   * the object attributable to FlacronCV on the shared account,
   * `internal_user_id` ties it to our user. `firebaseUid` is the pre-standard
   * spelling, kept because sessions and customers already in flight carry it.
   */
  private appMetadata(userId?: string | null, extra: Record<string, string | null | undefined> = {}): Metadata {
    const metadata: Metadata = { [APP_ID_METADATA_KEY]: this.appId };
    if (userId) {
      metadata.internal_user_id = userId;
      metadata.firebaseUid = userId;
    }
    for (const [key, value] of Object.entries(extra)) {
      if (value) metadata[key] = value;
    }
    return metadata;
  }

  /** The `app_id` a Stripe object was stamped with, or null. */
  private static appIdOf(obj: { metadata?: Stripe.Metadata | null } | null | undefined): string | null {
    const value = obj?.metadata?.[APP_ID_METADATA_KEY];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private objectLivemode(obj: { livemode?: boolean } | null | undefined): boolean {
    return typeof obj?.livemode === 'boolean' ? obj.livemode : this.livemode ?? false;
  }

  /**
   * Price IDs a client is allowed to check out with.
   *
   * Monthly ids are always admitted. Yearly ids are admitted only when
   * YEARLY_BILLING_ENABLED is on — the same switch the UI uses — so flipping
   * the flag cannot offer an annual plan the server will not sell.
   *
   * Do not remove this allowlist. It exists because a monthly-interval Stripe
   * price was once sold as annual and billed ~18× the advertised amount. A
   * price id does not encode its interval; the flag plus this list is what
   * keeps a stray yearly id in the env from reaching Checkout while annual
   * billing is off.
   */
  private allowedCheckoutPriceIds(): string[] {
    const ids = new Set<string>();
    for (const config of Object.values(PLAN_CONFIGS)) {
      if (config.stripePriceIdMonthly) ids.add(config.stripePriceIdMonthly);
    }
    const envPrices = this.configService.get<Record<string, string>>('stripe.prices');
    if (envPrices?.proMonthly) ids.add(envPrices.proMonthly);
    if (envPrices?.enterpriseMonthly) ids.add(envPrices.enterpriseMonthly);
    // Five-plan catalog: env-configured prices only.
    const planPrices = this.planPrices();
    for (const entry of Object.values(planPrices)) {
      if (entry?.month) ids.add(entry.month);
    }

    // Annual prices are admitted by the SAME switch that shows the yearly
    // option in the UI, so the two can never disagree. Previously this list was
    // monthly-only and unconditional, which meant flipping YEARLY_BILLING_ENABLED
    // produced a pricing page offering annual plans and a server that answered
    // every annual checkout with "Unsupported plan selection."
    //
    // The flag stays the single gate on purpose: it is guarded by a test that
    // requires a real year-interval price id to be configured before it can be
    // turned on (see plan-advertising.spec.ts), which is what keeps a
    // month-interval price from ever being sold as annual.
    if (YEARLY_BILLING_ENABLED) {
      for (const config of Object.values(PLAN_CONFIGS)) {
        if (config.stripePriceIdYearly) ids.add(config.stripePriceIdYearly);
      }
      if (envPrices?.proYearly) ids.add(envPrices.proYearly);
      if (envPrices?.enterpriseYearly) ids.add(envPrices.enterpriseYearly);
      for (const entry of Object.values(planPrices)) {
        if (entry?.year) ids.add(entry.year);
      }
    }

    return [...ids];
  }

  /**
   * Is this Stripe error "that id does not exist in this account"?
   *
   * Stripe answers a request naming an unknown object with a 404
   * `StripeInvalidRequestError` carrying `code: 'resource_missing'` — the
   * "No such customer: 'cus_...'" case. Telling that apart from a network
   * blip, a rate limit or an auth failure is the whole point: a genuinely
   * missing customer is safe to replace, a transient error is NOT. Replacing
   * on a timeout would abandon the real customer and permanently detach its
   * invoices, payment methods and subscription history.
   */
  private static isMissingResource(err: unknown): boolean {
    const e = err as { type?: string; code?: string; statusCode?: number } | null;
    return e?.code === 'resource_missing' || (e?.type === 'StripeInvalidRequestError' && e?.statusCode === 404);
  }

  /**
   * The stored Stripe customer id — but only if it still resolves against the
   * account the current STRIPE_SECRET_KEY points at. Returns null when there
   * is no usable customer, and rethrows anything that isn't "it's gone".
   *
   * A stored id stops resolving in three ordinary ways: the key was switched
   * between test and live mode, the key was pointed at a different Stripe
   * account, or the customer was deleted from the Dashboard. Firestore keeps
   * the id regardless, so every subsequent checkout and portal request handed
   * Stripe a customer it had never heard of and came back 500 — with no path
   * for the user to recover, since nothing in the app ever cleared the id.
   */
  private async liveCustomerId(customerId: string | null | undefined): Promise<string | null> {
    return (await this.liveCustomer(customerId))?.id ?? null;
  }

  /**
   * {@link liveCustomerId}, returning the customer. A customer stamped with
   * ANOTHER application's `app_id` is treated as unusable: on the shared
   * account, reusing it would bill FlacronCV plans to another app's customer
   * record and mix the two applications' revenue.
   */
  private async liveCustomer(customerId: string | null | undefined): Promise<Stripe.Customer | null> {
    if (!customerId) return null;
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      // A DELETED customer resolves successfully rather than throwing, and
      // then fails every call that references it. `deleted` is the only tell.
      if ((customer as Stripe.DeletedCustomer).deleted) return null;
      const owner = PaymentService.appIdOf(customer as Stripe.Customer);
      if (owner && owner !== this.appId) {
        this.logger.warn(
          `Stored Stripe customer ${customerId} belongs to app_id ${owner}, not ${this.appId} — treating as unset.`,
        );
        return null;
      }
      return customer as Stripe.Customer;
    } catch (err) {
      if (PaymentService.isMissingResource(err)) {
        this.logger.warn(`Stored Stripe customer ${customerId} no longer exists — treating as unset.`);
        return null;
      }
      throw err;
    }
  }

  /**
   * The Stripe price to charge for a plan at an interval — env first.
   *
   * A price id is issued by ONE Stripe account and is meaningless in any other,
   * so it cannot be a constant baked into shared code. It was, and switching
   * the account left `PLAN_CONFIGS` pointing at four prices that no longer
   * existed; the browser read those constants directly and posted them, so
   * every checkout died on "No such price" while the correct ids sat unused in
   * STRIPE_*_PRICE_ID. Configuration has to outrank the compiled-in default,
   * which is what this ordering establishes. The constants remain as the
   * fallback for environments that set no price env vars at all.
   */
  private resolvePriceId(plan: SubscriptionPlan, interval: BillingInterval): string | null {
    // Five-plan catalog: env only, in every mode. Never a compiled fallback.
    if (isCurrentPaidPlan(plan)) return currentPlanPriceId(this.planPrices(), plan, interval);

    const envPrices = this.configService.get<Record<string, string>>('stripe.prices');
    const yearly = interval === BillingInterval.YEAR;

    let fromEnv: string | undefined;
    if (plan === SubscriptionPlan.PRO) fromEnv = yearly ? envPrices?.proYearly : envPrices?.proMonthly;
    if (plan === SubscriptionPlan.ENTERPRISE) {
      fromEnv = yearly ? envPrices?.enterpriseYearly : envPrices?.enterpriseMonthly;
    }

    const config = PLAN_CONFIGS[plan];
    const fromConfig = yearly ? config?.stripePriceIdYearly : config?.stripePriceIdMonthly;

    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (isLiveStripeSecretKey(secretKey)) {
      return (fromEnv || '').trim() || null;
    }

    return (fromEnv || fromConfig || '').trim() || null;
  }

  /** STRIPE_PRICE_<PLAN>_MONTHLY / _ANNUAL as read by configuration.ts. */
  private planPrices(): CurrentPlanPrices {
    return this.configService.get<CurrentPlanPrices>('stripe.planPrices') ?? {};
  }

  /**
   * GET /plans — the public catalog: the five current plans with prices,
   * limits and whether each interval can be bought right now. No Stripe call:
   * `configured` means a price id is set in env (checkout still verifies it).
   */
  getPublicCatalog(): PublicPlanCatalog {
    return publicPlanCatalog(this.planPrices(), YEARLY_BILLING_ENABLED);
  }

  /**
   * Both spellings, because the two clients disagree: the web billing page uses
   * 'monthly'/'yearly' and the mobile app sends the BillingInterval enum
   * ('month'/'year'). Normalising here is what lets one endpoint serve both.
   * Anything unrecognised bills MONTHLY — the cheaper of the two, so a garbled
   * value can never silently charge a year up front.
   */
  private normalizeInterval(interval?: string): BillingInterval {
    return interval === BillingInterval.YEAR || interval === 'yearly'
      ? BillingInterval.YEAR
      : BillingInterval.MONTH;
  }

  /**
   * Firestore half of Pro trial eligibility. Stripe history is checked
   * separately — this alone must never show a trial CTA (MC2 residual).
   */
  private firestoreAllowsProTrial(sub: { stripeSubscriptionId?: string | null; hasUsedTrial?: boolean } | undefined): boolean {
    return (
      TRIAL_PERIOD_DAYS > 0 &&
      !sub?.stripeSubscriptionId &&
      !sub?.hasUsedTrial
    );
  }

  /**
   * Stripe history half. Lists `status=all` on the given customer, heals
   * `hasUsedTrial` when any prior subscription exists, fails closed on error.
   * Shared by GET /payments/trial-eligibility and createCheckoutSession so
   * the two cannot drift.
   */
  private async stripeHistoryAllowsTrial(
    userId: string,
    customerId: string,
    alreadyHasUsedTrial: boolean,
  ): Promise<boolean> {
    try {
      const prior = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
      });
      if (prior.data.length > 0) {
        if (!alreadyHasUsedTrial) {
          await this.usersService.updateSubscription(userId, { hasUsedTrial: true });
        }
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Trial eligibility check failed for ${userId}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Whether the billing Pro CTA may offer a trial.
   *
   * Does **not** create a Stripe customer — page-load must not write to Stripe.
   * No stored (or live) customer means no history we can see, so Firestore
   * decides. A Stripe retrieve/list failure fails closed (`eligible: false`).
   */
  async getTrialEligibility(userId: string): Promise<{ eligible: boolean }> {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (!this.firestoreAllowsProTrial(user.subscription)) {
      return { eligible: false };
    }

    let customerId: string | null;
    try {
      customerId = await this.liveCustomerId(user.subscription?.stripeCustomerId);
    } catch (err) {
      this.logger.warn(`Trial eligibility customer lookup failed for ${userId}: ${(err as Error).message}`);
      return { eligible: false };
    }
    if (!customerId) {
      return { eligible: true };
    }

    const eligible = await this.stripeHistoryAllowsTrial(
      userId,
      customerId,
      !!user.subscription?.hasUsedTrial,
    );
    return { eligible };
  }

  async createCheckoutSession(
    userId: string,
    selection: { plan: SubscriptionPlan; interval?: string },
    successUrl?: string,
    cancelUrl?: string,
    expectTrial?: boolean,
    client: CheckoutClient = {},
  ) {
    const interval = this.normalizeInterval(selection?.interval);

    if (interval === BillingInterval.YEAR && !YEARLY_BILLING_ENABLED) {
      throw new BadRequestException('Annual billing is not available yet.');
    }

    // Legacy plans (Pro, Career Accelerator, Enterprise) keep renewing for the
    // customers who have them, but are never sold again — except to the
    // mobile app build already in users' hands, which only knows Pro and
    // Enterprise (legacy-mobile-checkout.ts). It buys them at their existing
    // legacy Stripe prices until the updated app ships; the web never can.
    const requested = asSubscriptionPlan(selection?.plan);
    const legacyMobileCheckout =
      !!requested && client.nativeMobile === true && isLegacyMobileCheckoutPlan(requested);
    if (requested && isLegacyPlan(requested) && !legacyMobileCheckout) {
      throw new BadRequestException({
        code: 'PLAN_NOT_AVAILABLE',
        message: 'This plan is no longer offered. Please choose one of the current plans.',
      });
    }

    const priceId = this.resolvePriceId(selection?.plan, interval);
    if (!priceId && requested && isCurrentPaidPlan(requested)) {
      // A real plan whose Stripe price has not been created/configured yet.
      // Never guess an id: say so, and the UI shows "Coming soon".
      throw new ServiceUnavailableException({
        code: 'PLAN_NOT_CONFIGURED',
        message: 'This plan is not available for purchase yet. Please contact us.',
      });
    }
    if (!priceId) {
      throw new BadRequestException('Unsupported plan selection.');
    }

    // Kept as a second gate even though the id is now server-chosen: it is what
    // ties annual sales to YEARLY_BILLING_ENABLED, so a stray yearly price id
    // in the env cannot be sold while the feature is off.
    if (!this.allowedCheckoutPriceIds().includes(priceId)) {
      throw new BadRequestException('Unsupported plan selection.');
    }

    // The mobile client sends no URLs at all, so fall back to the configured
    // frontend rather than handing Stripe `undefined` and 500ing.
    const frontendUrl = this.configService.get<string>('frontendUrl') ?? '';
    const resolvedSuccessUrl =
      successUrl || `${frontendUrl}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
    const resolvedCancelUrl = cancelUrl || `${frontendUrl}/settings/billing?canceled=true`;

    const user = await this.usersService.findByIdOrThrow(userId);

    if (hasLiveStorePurchase(user.subscription)) {
      throw new ConflictException('This account is billed by the App Store or Google Play');
    }

    // A second Checkout would start a second subscription and bill twice.
    // Plan changes for an existing subscriber go through the billing portal,
    // where the webhook resolves the new plan from the new price id.
    if (hasLiveStripeSubscription(user.subscription)) {
      throw new ConflictException({
        code: 'ALREADY_SUBSCRIBED',
        message: 'You already have an active subscription. Change your plan from the billing portal.',
      });
    }

    // Resolve BEFORE the trial check below, so a replacement customer is the
    // one whose subscription history that check reads.
    await this.assertPriceIsOurs(priceId);

    // One checkout creation per user at a time, across every API instance
    // (checkout-coordination.ts). A concurrent second request gets a 409
    // instead of a second session; a lease left by a crashed request expires.
    let lease: CheckoutLease;
    try {
      lease = await this.checkoutCoordinator.acquire(userId);
    } catch (err) {
      if (err instanceof CheckoutInProgressError) {
        throw new ConflictException({
          code: 'CHECKOUT_IN_PROGRESS',
          message: 'A checkout is already being prepared. Please try again in a moment.',
        });
      }
      throw err;
    }

    let committed = false;
    try {
      const result = await this.createCheckoutUnderLease(lease, {
        userId,
        user,
        priceId,
        interval,
        plan: selection.plan,
        requested,
        legacyMobileCheckout,
        expectTrial,
        successUrl: resolvedSuccessUrl,
        cancelUrl: resolvedCancelUrl,
      });
      committed = true;
      return result;
    } finally {
      if (!committed) await this.checkoutCoordinator.release(lease);
    }
  }

  /**
   * The Stripe half of {@link createCheckoutSession}, run while holding the
   * per-user checkout lease.
   */
  private async createCheckoutUnderLease(
    lease: CheckoutLease,
    ctx: {
      userId: string;
      user: { email?: string; displayName?: string; subscription?: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; hasUsedTrial?: boolean } };
      priceId: string;
      interval: BillingInterval;
      plan: SubscriptionPlan;
      requested: SubscriptionPlan | null | undefined;
      legacyMobileCheckout: boolean;
      expectTrial?: boolean;
      successUrl: string;
      cancelUrl: string;
    },
  ): Promise<{ sessionId: string; url: string | null }> {
    const { userId, user, priceId, interval, legacyMobileCheckout, requested, expectTrial } = ctx;
    const selection = { plan: ctx.plan };

    const existingCustomer = await this.liveCustomer(user.subscription?.stripeCustomerId);
    let customerId = existingCustomer?.id ?? null;
    if (existingCustomer && !PaymentService.appIdOf(existingCustomer)) {
      // A customer created before the app_id standard: claim it for FlacronCV
      // so the central dashboard can attribute it.
      await this.stampCustomer(existingCustomer, userId, user.email);
    }
    if (!customerId) {
      // The key survives a crash between this call and the Firestore write
      // below, so the retry gets the SAME customer rather than an orphan.
      const idempotencyKey = await this.checkoutCoordinator.reserveCustomerKey(lease);
      const customer = await this.stripe.customers.create(
        {
          email: user.email,
          name: user.displayName,
          metadata: this.appMetadata(userId),
        },
        { idempotencyKey },
      );
      customerId = customer.id;
      await this.usersService.updateSubscription(userId, { stripeCustomerId: customerId });
      await this.checkoutCoordinator.clearCustomerKey(lease);
      await this.recordCustomer(customer, userId, user.email);
    }

    // Before a replacement session exists, settle the previous one against
    // Stripe: a completed one makes its subscription authoritative (409), an
    // open one is expired first — so at most one session (and so at most one
    // trial-offering session) is ever open for this user.
    await this.settlePreviousCheckout(lease, userId, customerId);

    // Trial is Pro-only. Enterprise is a paid plan from the first charge —
    // attaching trial_period_days here was giving Enterprise the same 7 free
    // days the client explicitly ruled out.
    //
    // Among Pro checkouts, offer the trial only to a genuinely NEW subscriber.
    // The card is still collected upfront (Stripe default) and auto-charged
    // when the trial ends unless the user cancels.
    //
    // `stripeSubscriptionId` alone cannot answer this: revoking access nulls it.
    // Cancel → re-subscribe is already blocked by Stripe's own history
    // (`subscriptions.list` status=all, fail closed). `hasUsedTrial` is
    // defence-in-depth for residual cases (stale customer id, etc.) and is
    // never cleared. It does not replace the Stripe check.
    //
    // Same helper as GET /payments/trial-eligibility. `expectTrial` is the
    // client's declaration: trial CTA sends true; paid Upgrade omits it.
    // Mismatch → 400, no session (never a silent paid conversion).
    //
    // Which plan has a trial is the catalog's decision (PLAN_TRIAL_DAYS:
    // Professional, 7 days). Legacy Pro had one; the only legacy checkout left
    // (the live mobile app's Pro) keeps it so that app behaves exactly as before.
    const trialDays =
      legacyMobileCheckout && requested === SubscriptionPlan.PRO
        ? TRIAL_PERIOD_DAYS
        : (PLAN_TRIAL_DAYS[selection.plan] ?? 0);
    const trialOfferedOnPlan = trialDays > 0 && TRIAL_PERIOD_DAYS > 0;
    let isFirstTimeSubscriber =
      trialOfferedOnPlan && this.firestoreAllowsProTrial(user.subscription);
    if (isFirstTimeSubscriber) {
      isFirstTimeSubscriber = await this.stripeHistoryAllowsTrial(
        userId,
        customerId,
        !!user.subscription?.hasUsedTrial,
      );
    }
    if (expectTrial === true && !isFirstTimeSubscriber) {
      throw new BadRequestException({
        message: 'A free trial is not available on this account.',
        code: 'TRIAL_NOT_ELIGIBLE',
      });
    }
    // The same metadata on the session AND the subscription it creates, so
    // every later invoice, payment and webhook can be attributed to FlacronCV.
    const metadata = this.appMetadata(userId, { plan: selection.plan, interval });
    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;

    const session = await this.stripe.checkout.sessions.create(
      {
        customer: customerId,
        client_reference_id: userId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: ctx.successUrl,
        cancel_url: ctx.cancelUrl,
        allow_promotion_codes: true,
        // Short-lived: an abandoned session stops being completable (and
        // `checkout.session.expired` clears the record) after ~30 minutes.
        expires_at: expiresAt,
        metadata,
        subscription_data: {
          metadata,
          ...(isFirstTimeSubscriber ? { trial_period_days: trialDays } : {}),
        },
      },
      { idempotencyKey: sessionIdempotencyKey(lease) },
    );

    // Opening (or abandoning) Checkout no longer consumes trial eligibility:
    // `hasUsedTrial` is set only from a verified Stripe subscription that
    // actually started a trial (checkout webhook, subscription.updated,
    // verifySession). What stops a second concurrent trial is the
    // coordination record: this session is now the only open one.
    const recorded = await this.checkoutCoordinator.commit(lease, {
      sessionId: session.id,
      sessionExpiresAt: session.expires_at ?? expiresAt,
      offersTrial: isFirstTimeSubscriber,
    });
    if (!recorded) {
      // Our lease expired and another request took over: that request owns
      // the user's checkout now. Never leave a second usable session behind.
      await this.expireSessionQuietly(session.id);
      throw new ConflictException({
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'A checkout is already being prepared. Please try again in a moment.',
      });
    }

    return { sessionId: session.id, url: session.url };
  }

  private async expireSessionQuietly(sessionId: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      this.logger.warn(`Could not expire superseded checkout session ${sessionId}: ${(err as Error).message}`);
    }
  }

  /**
   * Resolve the user's previously recorded Checkout Session against Stripe
   * before a replacement is created.
   *
   * - `complete`: its subscription is authoritative. Live → 409
   *   ALREADY_SUBSCRIBED (the webhook may simply not have landed yet); a trial
   *   it started is recorded, so no second trial is offered.
   * - `open`: expired first; only then may a replacement exist. If expiring
   *   fails because the user completed it meanwhile, it is re-read and treated
   *   as complete. Any other failure aborts the request (no replacement).
   * - `expired` / missing: nothing to do.
   *
   * After a takeover of a crashed request's lease, the session that request
   * may have created without recording is found by listing the customer's
   * open sessions, and expired the same way.
   */
  private async settlePreviousCheckout(lease: CheckoutLease, userId: string, customerId: string): Promise<void> {
    if (lease.previous.sessionId) {
      await this.settleSession(userId, lease.previous.sessionId);
    }
    if (lease.takeover) {
      const open = await this.stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 });
      for (const candidate of open.data ?? []) {
        if (candidate.id === lease.previous.sessionId) continue;
        if (PaymentService.appIdOf(candidate) !== this.appId) continue;
        const owner = candidate.metadata?.internal_user_id || candidate.metadata?.firebaseUid;
        if (owner !== userId) continue;
        await this.settleSession(userId, candidate.id);
      }
    }
  }

  private async settleSession(userId: string, sessionId: string): Promise<void> {
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
      if (PaymentService.isMissingResource(err)) return;
      throw err;
    }
    if (session.status === 'open') {
      try {
        await this.stripe.checkout.sessions.expire(sessionId);
        return;
      } catch (err) {
        session = await this.stripe.checkout.sessions.retrieve(sessionId);
        if (session.status === 'expired') return;
        if (session.status !== 'complete') throw err;
      }
    }
    if (session.status === 'complete') {
      await this.assertCompletedCheckoutNotLive(userId, session);
    }
  }

  private async assertCompletedCheckoutNotLive(userId: string, session: Stripe.Checkout.Session): Promise<void> {
    const subscriptionId = stripeId(session.subscription as string | { id: string } | null);
    if (!subscriptionId) return;
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (err) {
      if (PaymentService.isMissingResource(err)) return;
      throw err;
    }
    const owner = PaymentService.appIdOf(subscription);
    if (owner && owner !== this.appId) return;
    if (subscription.trial_start) {
      // Verified: OUR subscription really started a trial.
      await this.usersService.updateSubscription(userId, { hasUsedTrial: true });
    }
    if (PaymentService.LIVE_STRIPE_STATUSES.has(subscription.status)) {
      throw new ConflictException({
        code: 'ALREADY_SUBSCRIBED',
        message: 'Your previous checkout already completed. Your subscription is being activated.',
      });
    }
  }

  /**
   * Stripe's subscription status → ours, faithfully.
   *
   * Every call site used to collapse this to `trialing ? TRIALING : ACTIVE`,
   * which quietly reported a `canceled`, `unpaid` or `past_due` subscription as
   * fully ACTIVE. Entitlements are derived from that status, so a dead
   * subscription granted live access.
   */
  private mapStripeStatus(s: Stripe.Subscription['status']): SubscriptionStatus {
    switch (s) {
      case 'trialing':           return SubscriptionStatus.TRIALING;
      case 'active':             return SubscriptionStatus.ACTIVE;
      case 'past_due':           return SubscriptionStatus.PAST_DUE;
      case 'unpaid':             return SubscriptionStatus.UNPAID;
      case 'incomplete':         return SubscriptionStatus.INCOMPLETE;
      case 'canceled':
      case 'incomplete_expired':
      default:                   return SubscriptionStatus.CANCELED;
    }
  }

  /** A subscription that should currently grant paid access. */
  private static readonly LIVE_STRIPE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

  async verifySession(userId: string, sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Security: ensure this session belongs to this user
    if (session.metadata?.firebaseUid !== userId) {
      throw new BadRequestException('Session does not belong to this user');
    }

    // ...and to this application. Sessions from before the app_id standard
    // carry no app_id and are still accepted on the user check above.
    const sessionApp = PaymentService.appIdOf(session);
    if (sessionApp && sessionApp !== this.appId) {
      this.logger.warn(`Rejected session ${sessionId}: app_id ${sessionApp}, expected ${this.appId}`);
      throw new BadRequestException('Session does not belong to this application');
    }

    // A trial checkout collects the card but takes NO immediate payment, so its
    // status is 'no_payment_required' (not 'paid') — both are valid completions.
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      throw new BadRequestException('Payment not completed');
    }

    const subscription = session.subscription as Stripe.Subscription;
    if (!subscription) {
      throw new BadRequestException('No subscription found in session');
    }

    // A Checkout Session is IMMUTABLE. Once completed it keeps
    // payment_status:'paid' (or 'no_payment_required' for a trial) forever, and
    // its id sits in the browser history because the success URL carries it.
    // Without this check, re-opening that URL — or POSTing the id back — re-ran
    // the grant below and restored a full paid plan after a refund, a
    // chargeback, or a cancellation, undoing every revocation path in this
    // service. Authorise against the subscription's CURRENT state, never
    // against the frozen record of a payment that has since been reversed.
    // The subscription must be ours too: a session cannot vouch for a
    // subscription stamped for another application (or one that disagrees
    // with the session's own app_id).
    const subscriptionApp = PaymentService.appIdOf(subscription);
    if (subscriptionApp && subscriptionApp !== this.appId) {
      this.logger.warn(`Rejected session ${sessionId}: subscription ${subscription.id} has app_id ${subscriptionApp}`);
      throw new BadRequestException('Session does not belong to this application');
    }
    const subscriptionUser = subscription.metadata?.internal_user_id || subscription.metadata?.firebaseUid;
    if (subscriptionUser && subscriptionUser !== userId) {
      throw new BadRequestException('Session does not belong to this user');
    }

    if (!PaymentService.LIVE_STRIPE_STATUSES.has(subscription.status)) {
      this.logger.warn(
        `Rejected replay of session ${sessionId} for user ${userId}: subscription ${subscription.id} is '${subscription.status}'`,
      );
      throw new BadRequestException('This subscription is no longer active');
    }

    if (await this.skipStripeEntitlementWrite(userId)) {
      const user = await this.usersService.findByIdOrThrow(userId);
      return {
        plan: resolveEffectivePlan(user.subscription),
        status: user.subscription?.status ?? SubscriptionStatus.ACTIVE,
      };
    }

    // Never overwrite a DIFFERENT live subscription of ours: the duplicate is
    // resolved by the checkout webhook (handleCheckoutCompleted).
    {
      const user = await this.usersService.findByIdOrThrow(userId);
      const current = user.subscription?.stripeSubscriptionId;
      if (current && current !== subscription.id && (await this.isLiveOwnSubscription(current))) {
        this.logger.warn(`verifySession for user ${userId}: ${subscription.id} conflicts with live ${current} — not applied`);
        return {
          plan: resolveEffectivePlan(user.subscription),
          status: user.subscription?.status ?? SubscriptionStatus.ACTIVE,
        };
      }
    }

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;
    const now = new Date();
    const trial = this.extractTrial(subscription);
    const status = this.mapStripeStatus(subscription.status);

    const db = this.firebaseAdmin.firestore;
    const batch = db.batch();

    batch.update(db.collection('users').doc(userId), {
      'subscription.plan': plan,
      'subscription.status': status,
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.stripeCustomerId': session.customer as string,
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      ...this.periodStartField(plan, subscription),
      'subscription.trialStart': trial.trialStart,
      'subscription.trialEnd': trial.trialEnd,
      'subscription.cancelAtPeriodEnd': false,
      ...(trial.trialStart ? { 'subscription.hasUsedTrial': true } : {}),
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });

    batch.set(db.collection('subscriptions').doc(subscription.id), {
      id: subscription.id,
      applicationId: this.appId,
      livemode: this.objectLivemode(subscription),
      userId,
      stripeCustomerId: session.customer as string,
      plan,
      priceId: subscription.items.data[0].price.id,
      interval: subscription.items.data[0].price.recurring?.interval || 'month',
      amount: subscription.items.data[0].price.unit_amount || 0,
      currency: subscription.currency,
      status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAt: null,
      canceledAt: null,
      trialStart: trial.trialStart,
      trialEnd: trial.trialEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await batch.commit();
    await this.refreshUsageWindow(userId, plan);
    await this.ledger.upsertSubscription(this.toLedgerSubscription(subscription, userId));
    this.logger.log(`Session verified and plan applied for user ${userId}: ${plan} (${status})`);

    return { plan, status };
  }

  /**
   * The account owner's own recent invoices (read-only). Returns an empty list —
   * never throws — for users with no Stripe customer yet (free/never-subscribed)
   * or when Stripe isn't configured, so the billing page degrades gracefully.
   * Only non-sensitive summary fields are surfaced (see {@link BillingInvoice}).
   */
  async getInvoices(userId: string, limit = 12): Promise<BillingInvoice[]> {
    if (!this.stripe) return [];
    const user = await this.usersService.findByIdOrThrow(userId);
    const customerId = user.subscription?.stripeCustomerId;
    if (!customerId) return [];

    // A stale customer id makes this list call fail the same way checkout and
    // the portal did. Caught rather than pre-verified with a `customers.retrieve`
    // so the billing page keeps loading in ONE Stripe round-trip; the promise
    // in this method's contract is that it degrades to an empty list, and a
    // customer Stripe cannot find has no invoices by definition.
    let invoices: Stripe.ApiList<Stripe.Invoice>;
    try {
      invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit: Math.min(Math.max(limit, 1), 100),
      });
    } catch (err) {
      if (PaymentService.isMissingResource(err)) {
        this.logger.warn(`Invoices requested for missing Stripe customer ${customerId} — returning none.`);
        return [];
      }
      throw err;
    }

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      status: inv.status ?? 'draft',
      amountPaid: inv.amount_paid ?? 0,
      amountDue: inv.amount_due ?? 0,
      currency: inv.currency,
      created: new Date(inv.created * 1000).toISOString(),
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));
  }

  // ─── In-app plan change (existing Stripe subscribers) ──────────────────────

  /**
   * Everything a plan change needs, validated once for preview and switch:
   * a live Stripe subscription of ours, a CURRENT paid target plan (a legacy
   * plan is never a target — that also refuses legacy→legacy) with a
   * configured price, different from the price billed today.
   */
  private async planChangeContext(userId: string, selection: { plan: SubscriptionPlan; interval?: string }) {
    if (!this.stripe) {
      throw new ServiceUnavailableException({ code: 'BILLING_UNAVAILABLE', message: 'Billing is not available right now.' });
    }
    const target = asSubscriptionPlan(selection?.plan);
    if (!target || target === SubscriptionPlan.FREE) {
      throw new BadRequestException({ code: 'PLAN_NOT_AVAILABLE', message: 'Choose a paid plan, or cancel from the billing portal.' });
    }
    if (isLegacyPlan(target)) {
      throw new BadRequestException({
        code: 'PLAN_NOT_AVAILABLE',
        message: 'This plan is no longer offered. Please choose one of the current plans.',
      });
    }
    const interval = this.normalizeInterval(selection?.interval);
    if (interval === BillingInterval.YEAR && !YEARLY_BILLING_ENABLED) {
      throw new BadRequestException('Annual billing is not available yet.');
    }
    const priceId = this.resolvePriceId(target, interval);
    if (!priceId) {
      throw new ServiceUnavailableException({
        code: 'PLAN_NOT_CONFIGURED',
        message: 'This plan is not available for purchase yet. Please contact us.',
      });
    }

    const user = await this.usersService.findByIdOrThrow(userId);
    if (hasLiveStorePurchase(user.subscription)) {
      throw new ConflictException('This account is billed by the App Store or Google Play');
    }
    const subscriptionId = user.subscription?.stripeSubscriptionId;
    if (!subscriptionId || !hasLiveStripeSubscription(user.subscription)) {
      throw new BadRequestException({
        code: 'NO_SUBSCRIPTION',
        message: 'No active subscription found. Please subscribe to a plan first.',
      });
    }
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const owner = PaymentService.appIdOf(subscription);
    if (owner && owner !== this.appId) {
      throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'No active subscription found.' });
    }
    if (!PaymentService.LIVE_STRIPE_STATUSES.has(subscription.status)) {
      throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'This subscription is no longer active.' });
    }
    const item = subscription.items?.data?.[0];
    if (!item) throw new BadRequestException({ code: 'NO_SUBSCRIPTION', message: 'No active subscription found.' });
    if (item.price?.id === priceId) {
      throw new BadRequestException({ code: 'SAME_PLAN', message: 'You are already on this plan.' });
    }
    if (!this.allowedCheckoutPriceIds().includes(priceId)) {
      throw new BadRequestException('Unsupported plan selection.');
    }
    await this.assertPriceIsOurs(priceId);
    return { user, target, interval, priceId, subscription, item };
  }

  /**
   * What switching to `plan` would charge or credit right now (Stripe's
   * upcoming-invoice preview with the same proration settings as the switch).
   * Pass `prorationDate` back to {@link changePlan} so the switch bills
   * exactly what was shown.
   */
  async previewPlanChange(userId: string, selection: { plan: SubscriptionPlan; interval?: string }) {
    const ctx = await this.planChangeContext(userId, selection);
    const fromPlan = this.determinePlan(ctx.item.price.id);
    const currentPeriodEnd = new Date(ctx.subscription.current_period_end * 1000).toISOString();
    if (PaymentService.isDowngrade(fromPlan, ctx.target)) {
      // Downgrades switch at renewal: nothing is charged or credited now.
      return {
        fromPlan,
        toPlan: ctx.target,
        interval: ctx.interval,
        timing: 'at_period_end' as const,
        effectiveAt: currentPeriodEnd,
        currency: ctx.item.price.currency ?? 'usd',
        prorationAmount: 0,
        amountDue: 0,
        prorationDate: null,
        currentPeriodEnd,
      };
    }
    const prorationDate = Math.floor(Date.now() / 1000);
    const upcoming = await this.stripe.invoices.retrieveUpcoming({
      customer: stripeId(ctx.subscription.customer) ?? undefined,
      subscription: ctx.subscription.id,
      subscription_items: [{ id: ctx.item.id, price: ctx.priceId }],
      subscription_proration_behavior: 'always_invoice',
      subscription_proration_date: prorationDate,
    });
    const prorationLines = (upcoming.lines?.data ?? []).filter((l) => l.proration);
    return {
      fromPlan,
      toPlan: ctx.target,
      interval: ctx.interval,
      timing: 'now' as const,
      effectiveAt: new Date(prorationDate * 1000).toISOString(),
      currency: upcoming.currency,
      /** Smallest currency unit. Negative = credit to the customer balance. */
      prorationAmount: prorationLines.reduce((sum, l) => sum + (l.amount ?? 0), 0),
      /** What the invoice created at switch time would ask for now. */
      amountDue: upcoming.amount_due ?? 0,
      prorationDate,
      currentPeriodEnd,
    };
  }

  /** A move to a lower-ranked plan (same rank, e.g. another interval, is not a downgrade). */
  private static isDowngrade(from: SubscriptionPlan, to: SubscriptionPlan): boolean {
    return from !== to && isPlanUpgrade(to, from);
  }

  /**
   * Switch an existing subscriber to another current plan, with one rule that
   * keeps Stripe, V1 counters and the career ledger aligned:
   *
   * - Upgrade (or an interval change): now. Stripe prorates and invoices the
   *   difference (`always_invoice`); the webhook path raises V1's limits and
   *   the career sync adds the allowance difference without resetting usage.
   * - Downgrade: at the end of the paid period, never mid-period. A Stripe
   *   subscription schedule keeps the current price until `current_period_end`
   *   and then moves to the lower price (no proration, no credit). Until then
   *   V1 keeps reporting the paid plan, so V1 counters and the career
   *   allowance stay as paid for; at renewal the price change arrives through
   *   `customer.subscription.updated`, together with the new billing period.
   *
   * The plan granted always comes from the PRICE id via the webhook path,
   * never from the request.
   */
  async changePlan(
    userId: string,
    selection: { plan: SubscriptionPlan; interval?: string; prorationDate?: number },
  ) {
    const ctx = await this.planChangeContext(userId, selection);
    const fromPlan = this.determinePlan(ctx.item.price.id);
    const scheduleId = stripeId(ctx.subscription.schedule as string | { id: string } | null | undefined);
    const metadata = { ...(ctx.subscription.metadata ?? {}), ...this.appMetadata(userId, { plan: ctx.target, interval: ctx.interval }) };

    if (PaymentService.isDowngrade(fromPlan, ctx.target)) {
      const schedule = scheduleId
        ? { id: scheduleId }
        : await this.stripe.subscriptionSchedules.create({ from_subscription: ctx.subscription.id });
      // `from_subscription` admits no other create parameters, so the schedule
      // is stamped with our app_id on the update that always follows.
      await this.stripe.subscriptionSchedules.update(schedule.id, {
        metadata: this.appMetadata(userId),
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [
          {
            items: [{ price: ctx.item.price.id, quantity: ctx.item.quantity ?? 1 }],
            start_date: ctx.subscription.current_period_start,
            end_date: ctx.subscription.current_period_end,
            metadata: ctx.subscription.metadata ?? {},
          },
          { items: [{ price: ctx.priceId, quantity: 1 }], iterations: 1, metadata },
        ],
      });
      const effectiveAt = new Date(ctx.subscription.current_period_end * 1000).toISOString();
      this.logger.log(`Plan downgrade scheduled for user ${userId}: ${fromPlan} → ${ctx.target} at ${effectiveAt}`);
      return {
        plan: fromPlan,
        status: this.mapStripeStatus(ctx.subscription.status),
        scheduledPlan: ctx.target,
        effectiveAt,
      };
    }

    // An upgrade supersedes a pending scheduled downgrade: release the schedule
    // first so it cannot move the subscription back at renewal.
    if (scheduleId) await this.stripe.subscriptionSchedules.release(scheduleId);
    const now = Math.floor(Date.now() / 1000);
    // A preview older than an hour (or from the future) is not honoured.
    const prorationDate =
      typeof selection.prorationDate === 'number' &&
      Number.isFinite(selection.prorationDate) &&
      selection.prorationDate <= now &&
      now - selection.prorationDate < 3600
        ? Math.floor(selection.prorationDate)
        : now;
    // `pending_if_incomplete`: Stripe applies the new price only once the
    // proration invoice is PAID. The default (`allow_incomplete`) switched the
    // subscription to the higher plan even when that invoice failed, granting
    // the upgrade unpaid. With a failed/pending payment Stripe returns the
    // subscription unchanged plus `pending_update`, so the plan written below
    // (from the price actually on the subscription) stays the old one, and
    // the upgrade arrives through the webhook once paid. Stripe accepts only
    // item/proration parameters with this behaviour, so metadata is updated
    // separately, after the change has really been applied.
    const updated = await this.stripe.subscriptions.update(ctx.subscription.id, {
      items: [{ id: ctx.item.id, price: ctx.priceId }],
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
      payment_behavior: 'pending_if_incomplete',
    });
    const pending = !!(updated as Stripe.Subscription & { pending_update?: unknown }).pending_update;
    await this.handleSubscriptionUpdated(updated, { fresh: true });
    const plan = this.determinePlan(updated.items.data[0].price.id);
    if (pending) {
      this.logger.warn(`Plan upgrade for user ${userId} → ${ctx.target} is pending payment; plan unchanged (${plan})`);
      return {
        plan,
        status: this.mapStripeStatus(updated.status),
        scheduledPlan: ctx.target,
        effectiveAt: null,
        paymentPending: true,
      };
    }
    try {
      // Informational only — webhooks resolve the plan from the price id.
      await this.stripe.subscriptions.update(ctx.subscription.id, { metadata });
    } catch (err) {
      this.logger.warn(`Could not update metadata on ${ctx.subscription.id}: ${(err as Error).message}`);
    }
    this.logger.log(`Plan changed for user ${userId}: → ${plan} (${ctx.interval})`);
    return { plan, status: this.mapStripeStatus(updated.status), scheduledPlan: null, effectiveAt: new Date(now * 1000).toISOString() };
  }

  async createPortalSession(userId: string, returnUrl: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    // Same staleness check as checkout, opposite remedy: a portal exists to
    // manage an EXISTING billing relationship, so a customer Stripe no longer
    // knows about has nothing to show. Creating a replacement here would open
    // an empty portal; report it as the 400 the user can act on instead of
    // letting Stripe's "No such customer" escape as a 500.
    // liveCustomer already refuses a customer stamped for another app.
    const customer = await this.liveCustomer(user.subscription?.stripeCustomerId);
    if (!customer) {
      // `code` lets the web show this in the user's language.
      throw new BadRequestException({
        code: 'NO_SUBSCRIPTION',
        message: 'No active subscription found. Please subscribe to a plan first.',
      });
    }
    const customerId = customer.id;

    // FlacronCV's own portal configuration is REQUIRED. Without it Stripe uses
    // the account default, which is shared by every Flacron app and would
    // offer their plans as upgrade options. Refuse rather than fall back.
    const configuration = this.configService.get<string>('stripe.portalConfigurationId');
    if (!configuration) {
      this.logger.error('Billing portal refused: STRIPE_PORTAL_CONFIGURATION_ID is not configured');
      throw new ServiceUnavailableException({
        code: 'PORTAL_NOT_CONFIGURED',
        message: 'The billing portal is not available right now. Please contact support.',
      });
    }

    // A pre-standard customer (no app_id) is the user's own stored id: claim it.
    if (!PaymentService.appIdOf(customer)) {
      await this.stampCustomer(customer, userId, user.email);
    }

    // The portal shows EVERY subscription on the customer. If another Flacron
    // application has a subscription on this customer, opening it would let
    // the user manage (or cancel) that app's billing from FlacronCV — so the
    // portal is refused and support handles it. Untagged subscriptions are
    // treated as FlacronCV's own pre-standard ones (the customer is ours).
    const subscriptions = await this.stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    const foreign = (subscriptions.data ?? []).some((s) => {
      const owner = PaymentService.appIdOf(s);
      return !!owner && owner !== this.appId;
    });
    if (foreign) {
      this.logger.warn(`Billing portal refused for user ${userId}: customer has another application's subscription`);
      throw new ConflictException({
        code: 'PORTAL_SHARED_CUSTOMER',
        message: 'Your billing cannot be managed here. Please contact support.',
      });
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      configuration,
    });

    return { url: session.url };
  }

  /**
   * Apply one signature-verified Stripe event, at most once.
   *
   * Every Flacron application shares one Stripe account, so this endpoint is
   * sent the OTHER applications' events too. Arriving here proves nothing about
   * ownership: an event is applied only when the Stripe object it concerns is
   * stamped with this application's `app_id` and comes from the same mode
   * (test/live) as our key. Anything else is logged, recorded with its outcome,
   * and acknowledged without touching a user or a ledger row.
   *
   * Idempotency: the event id is claimed before processing and kept once done,
   * so a redelivery is a no-op. A handler that throws releases the claim and
   * the error surfaces as a 4xx/5xx, so Stripe's retry runs it again.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<EventOutcome | 'duplicate'> {
    const claim = await this.ledger.claimEvent(event);
    if (claim === 'duplicate') {
      this.logger.log(`Event ${event.id} already processed, skipping`);
      return 'duplicate';
    }
    if (claim === 'in_progress') {
      throw new StripeEventInProgressError(`Event ${event.id} is already being processed`);
    }

    const objectId = (event.data?.object as { id?: string } | undefined)?.id ?? null;
    try {
      let outcome: EventOutcome;
      let applicationId: string | null = null;
      let decision: HandlerDecision = null;

      if (typeof event.livemode === 'boolean' && this.livemode !== null && event.livemode !== this.livemode) {
        outcome = 'mode_mismatch';
        this.logger.error(
          `Stripe event ${event.id} (${event.type}) is ${event.livemode ? 'live' : 'test'} mode but this ` +
            `deployment's key is ${this.livemode ? 'live' : 'test'} — not applied.`,
        );
      } else if (!HANDLED_STRIPE_EVENTS.has(event.type)) {
        outcome = 'ignored';
        this.logger.log(`Unhandled event type: ${event.type}`);
      } else {
        applicationId = await this.attributeEvent(event);
        if (applicationId === this.appId) {
          decision = await this.dispatch(event);
          outcome = 'applied';
        } else if (applicationId) {
          outcome = 'app_mismatch';
          this.logger.warn(
            `app_id mismatch on ${event.type} ${event.id} (${objectId}): expected ${this.appId}, ` +
              `received ${applicationId} — not applied`,
          );
        } else {
          outcome = 'unattributed';
          this.logger.log(
            `No app_id on ${event.type} ${event.id} (${objectId}) — not attributable to ${this.appId}, not applied`,
          );
        }
      }

      await this.ledger.completeEvent(event.id, outcome, {
        applicationId,
        expectedApplicationId: this.appId,
        objectId,
      });
      if (decision) await this.recordDecision(event.id, decision);
      return outcome;
    } catch (err) {
      await this.ledger.releaseEvent(event.id);
      throw err;
    }
  }

  private async dispatch(event: Stripe.Event): Promise<HandlerDecision> {
    // A career subscription shares the V1 customer. Its events must never reach the
    // V1 handlers: a career refund or failure would otherwise revoke the V1 plan.
    if (this.careerBilling && (await this.careerBilling.isCareerEvent(event))) {
      // Transaction history is still kept in the shared billing ledger (ledger-only writes).
      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        await this.recordInvoice(invoice, await this.findUserByCustomerId(invoice.customer as string));
      } else if (event.type === 'charge.refunded') {
        await this.recordChargeRefunds(event.data.object as Stripe.Charge);
      } else if (event.type === 'charge.refund.updated') {
        await this.recordRefund(event.data.object as Stripe.Refund);
      } else if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
        await this.recordDispute(event.data.object as Stripe.Dispute);
      }
      await this.careerBilling.apply(event);
      return null;
    }
    const at = { created: typeof event.created === 'number' ? event.created : undefined };
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, at);
      case 'checkout.session.expired':
        return this.handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      case 'invoice.paid':
        return this.handleInvoicePaid(event.data.object as Stripe.Invoice, at);
      case 'invoice.payment_failed':
        return this.handlePaymentFailed(event.data.object as Stripe.Invoice, at);
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription, at);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription, at);
      case 'charge.refunded':
        return this.handleChargeRefunded(event.data.object as Stripe.Charge);
      case 'charge.refund.updated':
        await this.recordRefund(event.data.object as Stripe.Refund);
        return null;
      case 'charge.dispute.created':
        return this.handleDisputeCreated(event.data.object as Stripe.Dispute);
      case 'charge.dispute.closed':
        // Status update only. A won dispute does not restore a revoked plan.
        await this.recordDispute(event.data.object as Stripe.Dispute);
        return null;
      case 'customer.subscription.paused':
        return this.handleSubscriptionPaused(event.data.object as Stripe.Subscription, at);
    }
    return null;
  }

  /** Best-effort: the event's outcome is already recorded; this only explains a no-op. */
  private async recordDecision(eventId: string, decision: string): Promise<void> {
    try {
      await this.firebaseAdmin.firestore
        .collection('payment_events')
        .doc(eventId)
        .set({ entitlement_decision: decision }, { merge: true });
    } catch (err) {
      this.logger.warn(`Could not record decision for event ${eventId}: ${(err as Error).message}`);
    }
  }

  // ─── app_id attribution ──────────────────────────────────────────────────────

  /**
   * The `app_id` of the Stripe object an event concerns.
   *
   * Sessions and subscriptions carry it directly. Invoices, charges and refunds
   * created by a subscription do not, so it is resolved through what they
   * belong to: our own payment ledger first (no Stripe call), then the
   * PaymentIntent we stamp on renewal, then the invoice's subscription.
   */
  private async attributeEvent(event: Stripe.Event): Promise<string | null> {
    const obj = event.data.object as unknown;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.expired':
        return PaymentService.appIdOf(obj as Stripe.Checkout.Session);
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused': {
        const subscription = obj as Stripe.Subscription;
        return (
          PaymentService.appIdOf(subscription) ??
          (await this.verifiedLegacyAttribution(subscription.id, stripeId(subscription.customer)))
        );
      }
      case 'invoice.paid':
      case 'invoice.payment_failed':
        return this.invoiceAppId(obj as Stripe.Invoice);
      case 'charge.refunded':
        return this.chargeAppId(obj as Stripe.Charge);
      case 'charge.refund.updated':
        return this.refundAppId(obj as Stripe.Refund);
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const chargeId = stripeId((obj as Stripe.Dispute).charge);
        if (!chargeId) return null;
        return this.chargeAppId(await this.stripe.charges.retrieve(chargeId));
      }
      default:
        return null;
    }
  }

  private async invoiceAppId(invoice: Stripe.Invoice): Promise<string | null> {
    const fromInvoice =
      PaymentService.appIdOf(invoice.subscription_details as { metadata?: Stripe.Metadata | null }) ??
      PaymentService.appIdOf(
        (invoice as unknown as { parent?: { subscription_details?: { metadata?: Stripe.Metadata } } }).parent
          ?.subscription_details,
      ) ??
      PaymentService.appIdOf(invoice);
    if (fromInvoice) return fromInvoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return null;
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    return (
      PaymentService.appIdOf(subscription) ??
      (await this.verifiedLegacyAttribution(subscriptionId, stripeId(invoice.customer) ?? stripeId(subscription.customer)))
    );
  }

  /**
   * The VERIFIED mapping for untagged (pre-app_id-standard) subscription and
   * invoice events: FlacronCV's own Firestore must already pair this exact
   * subscription id with this exact customer id on ONE user. Both ids come
   * from our own writes, so a match proves the object is FlacronCV's. Nothing
   * else untagged is ever accepted — not a customer alone, never an email.
   */
  private async verifiedLegacyAttribution(
    subscriptionId: string | null | undefined,
    customerId: string | null | undefined,
  ): Promise<string | null> {
    if (!subscriptionId || !customerId) return null;
    const snapshot = await this.firebaseAdmin.firestore
      .collection('users')
      .where('subscription.stripeSubscriptionId', '==', subscriptionId)
      .limit(2)
      .get();
    if (snapshot.size !== 1) return null;
    const stored = (snapshot.docs[0].data() as { subscription?: { stripeCustomerId?: string | null } }).subscription;
    return stored?.stripeCustomerId === customerId ? this.appId : null;
  }

  private async paymentIntentAppId(paymentIntentId: string | null): Promise<string | null> {
    if (!paymentIntentId) return null;
    const known = await this.ledger.getPayment(paymentIntentId);
    if (known?.application_id) return known.application_id;
    return PaymentService.appIdOf(await this.stripe.paymentIntents.retrieve(paymentIntentId));
  }

  private async chargeAppId(charge: Stripe.Charge): Promise<string | null> {
    const direct = PaymentService.appIdOf(charge) ?? (await this.paymentIntentAppId(stripeId(charge.payment_intent)));
    if (direct) return direct;
    const invoiceId = stripeId(charge.invoice);
    if (!invoiceId) return null;
    return this.invoiceAppId(await this.stripe.invoices.retrieve(invoiceId));
  }

  private async refundAppId(refund: Stripe.Refund): Promise<string | null> {
    const direct = PaymentService.appIdOf(refund) ?? (await this.paymentIntentAppId(stripeId(refund.payment_intent)));
    if (direct) return direct;
    const chargeId = stripeId(refund.charge);
    if (!chargeId) return null;
    return this.chargeAppId(await this.stripe.charges.retrieve(chargeId));
  }

  /**
   * Refuse to sell a price that is not FlacronCV's.
   *
   * On the shared account every application's prices resolve, so a mistyped
   * or copied STRIPE_*_PRICE_ID would happily charge another application's
   * plan. The price must be active, stamped with our `app_id`, and in the same
   * mode as the key. Confirmations are cached briefly so checkout stays one
   * extra round-trip at most.
   */
  private async assertPriceIsOurs(priceId: string): Promise<void> {
    const cachedUntil = this.verifiedPrices.get(priceId);
    if (cachedUntil && cachedUntil > Date.now()) return;

    let price: Stripe.Price;
    try {
      price = await this.stripe.prices.retrieve(priceId);
    } catch (err) {
      if (PaymentService.isMissingResource(err)) {
        this.logger.error(`Configured price ${priceId} does not exist in this Stripe account/mode`);
        throw new BadRequestException('Unsupported plan selection.');
      }
      throw err;
    }

    const owner = PaymentService.appIdOf(price);
    const modeOk = this.livemode === null || price.livemode === this.livemode;
    if (!price.active || owner !== this.appId || !modeOk) {
      this.logger.error(
        `Refusing price ${priceId}: active=${price.active} app_id=${owner ?? 'none'} ` +
          `livemode=${price.livemode} (expected app_id=${this.appId}, livemode=${this.livemode})`,
      );
      throw new BadRequestException('Unsupported plan selection.');
    }
    this.verifiedPrices.set(priceId, Date.now() + 10 * 60 * 1000);
  }

  // ─── Ledger writes ───────────────────────────────────────────────────────────

  private toLedgerSubscription(subscription: Stripe.Subscription, userId?: string | null): LedgerSubscription {
    const item = subscription.items?.data?.[0];
    const priceId = item?.price?.id ?? null;
    const now = new Date();
    return {
      application_id: this.appId,
      livemode: this.objectLivemode(subscription),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeId(subscription.customer) ?? '',
      internal_user_id:
        subscription.metadata?.internal_user_id || subscription.metadata?.firebaseUid || userId || null,
      plan: priceId ? this.determinePlan(priceId) : SubscriptionPlan.FREE,
      price_id: priceId,
      interval: item?.price?.recurring?.interval ?? 'month',
      status: subscription.status,
      amount: (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 1),
      currency: subscription.currency ?? item?.price?.currency ?? 'usd',
      current_period_end: fromUnix(subscription.current_period_end),
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      canceled_at: fromUnix(subscription.canceled_at),
      created_at: fromUnix(subscription.created) ?? now,
      updated_at: now,
    };
  }

  private async recordSubscription(subscription: Stripe.Subscription, userId?: string | null): Promise<void> {
    if (!subscription?.id) return;
    await this.ledger.upsertSubscription(this.toLedgerSubscription(subscription, userId));
  }

  private async recordCustomer(customer: Stripe.Customer, userId: string, email?: string | null): Promise<void> {
    try {
      await this.ledger.upsertCustomer({
        application_id: this.appId,
        livemode: this.objectLivemode(customer),
        stripe_customer_id: customer.id,
        internal_user_id: userId,
        email: email ?? customer.email ?? null,
        created_at: fromUnix(customer.created) ?? new Date(),
        updated_at: new Date(),
      });
    } catch (err) {
      // Checkout must not fail over the customer index; the customer is also
      // reachable from every subscription and payment row.
      this.logger.warn(`Could not record customer ${customer.id}: ${(err as Error).message}`);
    }
  }

  /** Claim a pre-standard customer for FlacronCV. Best-effort: checkout continues either way. */
  private async stampCustomer(customer: Stripe.Customer, userId: string, email?: string | null): Promise<void> {
    try {
      await this.stripe.customers.update(customer.id, {
        metadata: { ...(customer.metadata ?? {}), ...this.appMetadata(userId) },
      });
      await this.recordCustomer(customer, userId, email);
    } catch (err) {
      this.logger.warn(`Could not stamp app_id on customer ${customer.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Record an invoice and the payment that settled (or failed to settle) it.
   *
   * Subscription Checkout cannot put metadata on the PaymentIntents Stripe
   * creates for each invoice, so they are stamped here, on first sight. That
   * makes every FlacronCV payment attributable in the Stripe Dashboard too,
   * not only in our ledger.
   */
  private async recordInvoice(invoice: Stripe.Invoice, userId: string | null): Promise<void> {
    const now = new Date();
    const paymentIntentId = stripeId(invoice.payment_intent);
    const subscriptionId = stripeId(invoice.subscription);
    const customerId = stripeId(invoice.customer);

    await this.ledger.upsertInvoice({
      application_id: this.appId,
      livemode: this.objectLivemode(invoice),
      stripe_invoice_id: invoice.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      payment_id: paymentIntentId,
      status: invoice.status ?? 'open',
      amount_due: invoice.amount_due ?? 0,
      amount_paid: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? 'usd',
      billing_reason: invoice.billing_reason ?? null,
      created_at: fromUnix(invoice.created) ?? now,
      updated_at: now,
    });

    // A $0 invoice (a trial start) has no PaymentIntent and moves no money.
    if (!paymentIntentId) return;

    let paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    const owner = PaymentService.appIdOf(paymentIntent);
    if (owner && owner !== this.appId) {
      this.logger.warn(`PaymentIntent ${paymentIntentId} on our invoice ${invoice.id} is stamped ${owner} — not recorded`);
      return;
    }
    if (!owner) {
      paymentIntent = await this.stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          ...(paymentIntent.metadata ?? {}),
          ...this.appMetadata(userId, { stripe_invoice_id: invoice.id, stripe_subscription_id: subscriptionId }),
        },
      });
    }

    await this.recordPayment(paymentIntent, {
      invoiceId: invoice.id,
      subscriptionId,
      customerId,
      userId,
    });
  }

  private async recordPayment(
    paymentIntent: Stripe.PaymentIntent,
    ctx: { invoiceId?: string | null; subscriptionId?: string | null; customerId?: string | null; userId?: string | null },
  ): Promise<void> {
    const now = new Date();
    const status = ledgerPaymentStatus(paymentIntent.status);
    const chargeId = stripeId(paymentIntent.latest_charge);
    const existing = await this.ledger.getPayment(paymentIntent.id);
    const row: LedgerPayment = {
      application_id: this.appId,
      livemode: this.objectLivemode(paymentIntent),
      stripe_payment_id: paymentIntent.id,
      customer_id: stripeId(paymentIntent.customer) ?? ctx.customerId ?? null,
      internal_user_id:
        paymentIntent.metadata?.internal_user_id || paymentIntent.metadata?.firebaseUid || ctx.userId || null,
      stripe_charge_id: chargeId,
      stripe_invoice_id: ctx.invoiceId ?? stripeId(paymentIntent.invoice) ?? null,
      stripe_subscription_id: ctx.subscriptionId ?? null,
      amount: status === 'succeeded' ? paymentIntent.amount_received ?? paymentIntent.amount : paymentIntent.amount,
      amount_refunded: existing?.amount_refunded ?? 0,
      currency: paymentIntent.currency ?? 'usd',
      status,
      failure_message: paymentIntent.last_payment_error?.message ?? null,
      created_at: fromUnix(paymentIntent.created) ?? now,
      updated_at: now,
    };
    await this.ledger.upsertPayment(row);
  }

  private async recordRefund(refund: Stripe.Refund): Promise<void> {
    const now = new Date();
    await this.ledger.upsertRefund({
      application_id: this.appId,
      livemode: this.objectLivemode(refund as unknown as { livemode?: boolean }),
      stripe_refund_id: refund.id,
      payment_id: stripeId(refund.payment_intent),
      charge_id: stripeId(refund.charge),
      amount: refund.amount,
      currency: refund.currency ?? 'usd',
      status: refund.status ?? 'pending',
      reason: refund.reason ?? null,
      created_at: fromUnix(refund.created) ?? now,
      updated_at: now,
    });
  }

  // ─── Subscription event gate ────────────────────────────────────────────────

  /**
   * Whether a subscription event may change this user's entitlement — decided
   * and the user's Stripe state clock advanced in ONE Firestore transaction.
   *
   * - Stale: an event created before the last applied one (`stripeStateAt`)
   *   is ignored. Stripe does not deliver in order; a late
   *   `updated(active)` must not undo a later `deleted`.
   * - Other subscription: only the user's CURRENT subscription
   *   (`stripeSubscriptionId`) may change the plan. Deleting, failing or
   *   refunding an old subscription never touches a user on a newer one.
   * - No current subscription: `adopt` mode accepts a LIVE subscription
   *   stamped with our app_id for this user (heals a lost checkout webhook);
   *   `checkout` mode also replaces a stored one the caller verified is no
   *   longer live. Otherwise nothing is applied.
   */
  private async gateSubscriptionEvent(
    userId: string,
    subscriptionId: string | null | undefined,
    opts: {
      created?: number;
      mode: 'current' | 'adopt' | 'checkout';
      subscription?: Stripe.Subscription | null;
      replaceable?: string | null;
    },
  ): Promise<{ apply: true; adopted: boolean } | { apply: false; reason: string }> {
    if (!subscriptionId) return { apply: false, reason: 'no_subscription_on_event' };
    const db = this.firebaseAdmin.firestore;
    const ref: FirebaseFirestore.DocumentReference = db.collection('users').doc(userId);
    return db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { apply: false as const, reason: 'user_not_found' };
      const stored = ((snap.data() as { subscription?: Record<string, unknown> }).subscription ?? {}) as {
        stripeSubscriptionId?: string | null;
        stripeStateAt?: number | null;
      };
      const stateAt = typeof stored.stripeStateAt === 'number' ? stored.stripeStateAt : null;
      if (opts.created !== undefined && stateAt !== null && opts.created < stateAt) {
        return { apply: false as const, reason: 'stale_event' };
      }
      const current = stored.stripeSubscriptionId ?? null;
      let adopted = false;
      if (current && current !== subscriptionId) {
        if (!(opts.mode === 'checkout' && opts.replaceable === current)) {
          return { apply: false as const, reason: 'not_current_subscription' };
        }
        adopted = true;
      } else if (!current) {
        if (opts.mode === 'current') return { apply: false as const, reason: 'no_current_subscription' };
        if (opts.mode === 'adopt') {
          const s = opts.subscription;
          const owner = s ? PaymentService.appIdOf(s) : null;
          const metaUser = s?.metadata?.internal_user_id || s?.metadata?.firebaseUid;
          if (!s || owner !== this.appId || !PaymentService.LIVE_STRIPE_STATUSES.has(s.status) || (metaUser && metaUser !== userId)) {
            return { apply: false as const, reason: 'no_current_subscription' };
          }
        }
        adopted = true;
      }
      if (opts.created !== undefined) {
        tx.update(ref, { 'subscription.stripeStateAt': opts.created });
      }
      return { apply: true as const, adopted };
    });
  }

  /** Whether `subscriptionId` is a live (active/trialing) subscription that is not another app's. */
  private async isLiveOwnSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const owner = PaymentService.appIdOf(subscription);
      if (owner && owner !== this.appId) return false;
      return PaymentService.LIVE_STRIPE_STATUSES.has(subscription.status);
    } catch (err) {
      if (PaymentService.isMissingResource(err)) return false;
      throw err;
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
    at: { created?: number } = {},
  ): Promise<HandlerDecision> {
    const userId = session.metadata?.firebaseUid || session.metadata?.internal_user_id || session.client_reference_id;
    if (!session.subscription) return 'no_subscription_on_event';

    const subscription = await this.stripe.subscriptions.retrieve(stripeId(session.subscription)!);
    const owner = PaymentService.appIdOf(subscription);
    if (owner && owner !== this.appId) {
      // The session is ours but the subscription it points at is not: conflicting ownership.
      this.logger.warn(`Checkout ${session.id}: subscription ${subscription.id} is stamped ${owner} — not applied`);
      return 'subscription_app_mismatch';
    }
    await this.recordSubscription(subscription, userId);
    if (!userId) return 'no_user';
    if (await this.skipStripeEntitlementWrite(userId)) return 'store_purchase_in_period';

    // A different LIVE subscription of ours is already the user's: never
    // overwrite it (that would orphan a paying subscription).
    const user = await this.usersService.findByIdOrThrow(userId);
    const current = user.subscription?.stripeSubscriptionId ?? null;
    if (current && current !== subscription.id) {
      if (await this.isLiveOwnSubscription(current)) {
        return this.resolveDuplicateSubscription(userId, current, subscription);
      }
    }

    const gate = await this.gateSubscriptionEvent(userId, subscription.id, {
      created: at.created,
      mode: 'checkout',
      subscription,
      replaceable: current,
    });
    if (!gate.apply) return gate.reason;

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;
    const trial = this.extractTrial(subscription);
    const status = this.mapStripeStatus(subscription.status);

    const db = this.firebaseAdmin.firestore;
    const userRef = db.collection('users').doc(userId);
    const subscriptionRef = db.collection('subscriptions').doc(subscription.id);
    const now = new Date();

    // Atomic batch: user plan update + subscription record creation
    const batch = db.batch();

    batch.update(userRef, {
      'subscription.plan': plan,
      'subscription.status': status,
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      ...this.periodStartField(plan, subscription),
      'subscription.trialStart': trial.trialStart,
      'subscription.trialEnd': trial.trialEnd,
      'subscription.cancelAtPeriodEnd': false,
      // Trial consumption comes from OUR retrieved subscription only.
      ...(trial.trialStart ? { 'subscription.hasUsedTrial': true } : {}),
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });

    batch.set(subscriptionRef, {
      id: subscription.id,
      applicationId: this.appId,
      livemode: this.objectLivemode(subscription),
      userId,
      stripeCustomerId: session.customer as string,
      plan,
      priceId: subscription.items.data[0].price.id,
      interval: subscription.items.data[0].price.recurring?.interval || 'month',
      amount: subscription.items.data[0].price.unit_amount || 0,
      currency: subscription.currency,
      status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAt: null,
      canceledAt: null,
      trialStart: trial.trialStart,
      trialEnd: trial.trialEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
    await this.refreshUsageWindow(userId, plan);
    this.logger.log(`Subscription created for user ${userId}: ${plan} (${status})`);
    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_ACTIVATED, 'subscription', userId, {
      metadata: {
        plan,
        status,
        stripeSubscriptionId: subscription.id,
        amount: subscription.items.data[0].price.unit_amount || 0,
        currency: subscription.currency,
        trialing: status === SubscriptionStatus.TRIALING,
      },
    });
    return null;
  }

  /**
   * A checkout completed while the user already has a different LIVE
   * FlacronCV subscription (two checkouts raced, or a second browser tab).
   *
   * Decision (documented policy):
   * - The existing subscription stays authoritative; the user doc is not touched.
   * - The NEW subscription is cancelled automatically only when it is
   *   provably ours (app_id) AND nothing was charged for it (trialing, or its
   *   latest invoice has amount_paid 0). Cancelling it then costs the customer
   *   nothing and needs no refund.
   * - Otherwise (money was taken, or ownership is unproven) it is left
   *   running and flagged `manual_review`: refunding or cancelling a paid
   *   subscription is a support decision, not an automatic one.
   * Either way a `billing_conflicts/{newSubscriptionId}` row records it (ids
   * only), and the event row gets the decision code.
   */
  private async resolveDuplicateSubscription(
    userId: string,
    existingSubscriptionId: string,
    duplicate: Stripe.Subscription,
  ): Promise<string> {
    const ours = PaymentService.appIdOf(duplicate) === this.appId;
    let unpaid = duplicate.status === 'trialing';
    if (!unpaid && ours) {
      const invoiceId = stripeId(duplicate.latest_invoice as string | { id: string } | null);
      if (invoiceId) {
        const invoice = await this.stripe.invoices.retrieve(invoiceId);
        unpaid = (invoice.amount_paid ?? 0) === 0;
      }
    }

    let action: 'canceled_duplicate' | 'manual_review' = 'manual_review';
    if (ours && unpaid) {
      try {
        await this.stripe.subscriptions.cancel(duplicate.id, { prorate: false, invoice_now: false });
        action = 'canceled_duplicate';
      } catch (err) {
        this.logger.error(`Could not cancel duplicate subscription ${duplicate.id}: ${(err as Error).message}`);
      }
    }

    const now = new Date();
    await this.firebaseAdmin.firestore.collection(BILLING_CONFLICTS_COLLECTION).doc(duplicate.id).set(
      {
        type: 'duplicate_subscription',
        applicationId: this.appId,
        livemode: this.objectLivemode(duplicate),
        userId,
        existingSubscriptionId,
        duplicateSubscriptionId: duplicate.id,
        duplicateStatus: duplicate.status,
        action,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    this.logger.warn(
      `Duplicate subscription ${duplicate.id} for user ${userId} (current ${existingSubscriptionId}): ${action}`,
    );
    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_CHANGED, 'subscription', userId, {
      metadata: { conflict: 'duplicate_subscription', action, existingSubscriptionId, duplicateSubscriptionId: duplicate.id },
    });
    return `duplicate_subscription_${action}`;
  }

  /**
   * `checkout.session.expired`: forget the user's pending session — but ONLY
   * if it is the one currently recorded, so an old superseded session expiring
   * late never clears a newer pending one. Nothing else changes: an expired
   * session never consumed trial eligibility.
   */
  private async handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<HandlerDecision> {
    const userId = session.metadata?.internal_user_id || session.metadata?.firebaseUid || session.client_reference_id;
    if (!userId || !session.id) return 'no_user';
    const cleared = await this.checkoutCoordinator.clearIfCurrent(userId, session.id);
    return cleared ? null : 'not_current_checkout_session';
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice, at: { created?: number } = {}): Promise<HandlerDecision> {
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    // The money is recorded whether or not a user still maps to the customer.
    await this.recordInvoice(invoice, userId);
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return 'no_subscription_on_event';
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    await this.recordSubscription(sub, userId);
    if (!userId) return 'no_user';
    if (await this.skipStripeEntitlementWrite(userId)) return 'store_purchase_in_period';

    const gate = await this.gateSubscriptionEvent(userId, sub.id, { created: at.created, mode: 'adopt', subscription: sub });
    if (!gate.apply) return gate.reason;

    const plan = this.determinePlan(sub.items.data[0].price.id);
    const limits = PLAN_CONFIGS[plan].limits;
    const adopt = gate.adopted ? { stripeSubscriptionId: sub.id } : {};

    if (!isCurrentPaidPlan(plan)) {
      // LEGACY plans (and an unrecognised price): unchanged — every paid
      // invoice resets the counters.
      await this.usersService.updateSubscription(userId, {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        ...this.periodStartPatch(plan, sub),
        ...adopt,
      });

      // Reset monthly usage — once per invoice. A replay of the same invoice
      // (a resent or duplicated delivery under another event id) must not
      // wipe the credits used since the first reset.
      if (await this.usageAlreadyResetFor(userId, invoice.id)) {
        await this.usersService.updateUsage(userId, { aiCreditsLimit: limits.aiCredits });
      } else {
        await this.usersService.updateUsage(userId, {
          aiCreditsUsed: 0,
          exportsThisMonth: 0,
          aiCreditsLimit: limits.aiCredits,
          lastExportReset: new Date(),
          ...(invoice.id ? { lastResetInvoiceId: invoice.id } : {}),
        } as Parameters<UsersService['updateUsage']>[1]);
      }
    } else {
      // Current plans renew on the monthly anniversary of the billing period
      // (also for annual plans), not on every invoice: a proration invoice for
      // a mid-period plan change must not hand out a fresh allowance.
      await this.usersService.updateSubscription(userId, {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        ...adopt,
      });
      await this.usersService.updateUsage(userId, { aiCreditsLimit: limits.aiCredits });
      await this.refreshUsageWindow(userId, plan);
    }

    await this.syncSubscriptionRecord(sub.id, {
      status: SubscriptionStatus.ACTIVE,
      plan,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }, sub);
    return null;
  }

  /** Whether the legacy monthly reset already ran for this invoice. */
  private async usageAlreadyResetFor(userId: string, invoiceId: string | null | undefined): Promise<boolean> {
    if (!invoiceId) return false;
    const snap = await this.firebaseAdmin.firestore.collection('users').doc(userId).get();
    const usage = (snap.data() as { usage?: { lastResetInvoiceId?: string } } | undefined)?.usage;
    return usage?.lastResetInvoiceId === invoiceId;
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice, at: { created?: number } = {}): Promise<HandlerDecision> {
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    // Recorded as a failed payment — counted, never summed as revenue.
    await this.recordInvoice(invoice, userId);
    if (!userId) return 'no_user';
    if (await this.skipStripeEntitlementWrite(userId)) return 'store_purchase_in_period';
    const subscriptionId = invoiceSubscriptionId(invoice);
    const gate = await this.gateSubscriptionEvent(userId, subscriptionId, { created: at.created, mode: 'current' });
    if (!gate.apply) return gate.reason;
    await this.usersService.updateSubscription(userId, { status: SubscriptionStatus.PAST_DUE });
    await this.syncSubscriptionRecord(subscriptionId, {
      status: SubscriptionStatus.PAST_DUE,
    });
    this.logger.warn(`Payment failed for user ${userId}`);
    await this.audit.logSystemAction(AuditAction.PAYMENT_FAILED, 'subscription', userId, {
      metadata: { invoiceId: invoice.id, amountDue: invoice.amount_due },
    });
    return null;
  }

  /**
   * `customer.subscription.updated`, and the in-app plan change.
   *
   * The payload is not trusted: the subscription is RE-RETRIEVED from Stripe
   * (`fresh` skips that only for a subscription this request just got back
   * from Stripe), so a late or replayed event applies Stripe's current state
   * rather than an old snapshot.
   */
  private async handleSubscriptionUpdated(
    payload: Stripe.Subscription,
    at: { created?: number; fresh?: boolean } = {},
  ): Promise<HandlerDecision> {
    let subscription = payload;
    if (!at.fresh) {
      try {
        subscription = await this.stripe.subscriptions.retrieve(payload.id);
      } catch (err) {
        if (PaymentService.isMissingResource(err)) return 'subscription_missing';
        throw err;
      }
      const owner = PaymentService.appIdOf(subscription);
      if (owner && owner !== this.appId) return 'subscription_app_mismatch';
    }
    const userId = await this.findUserByCustomerId(stripeId(subscription.customer) as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return 'no_user';
    if (await this.skipStripeEntitlementWrite(userId)) return 'store_purchase_in_period';

    const gate = await this.gateSubscriptionEvent(userId, subscription.id, {
      created: at.created,
      mode: 'adopt',
      subscription,
    });
    if (!gate.apply) return gate.reason;

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    // An unpaid renewal: Stripe has already advanced current_period_end to
    // the period nobody paid for. Writing it would extend paid access (the
    // grace rule grants access until currentPeriodEnd) and refresh credits
    // for free. The period and the allowance advance on invoice.paid instead;
    // the grace policy itself (resolveEffectivePlan) is unchanged.
    const unpaidRenewal = UNPAID_STRIPE_STATUSES.has(subscription.status);
    // Map, never cast. Stripe has EIGHT subscription statuses; SubscriptionStatus
    // has six. A bare cast persisted the raw string for the two with no enum
    // member — `incomplete_expired` and `paused` — and entitlements are decided
    // by `ACCESS_ENDING_STATUSES.includes(status)`, which neither string is in.
    // The stored plan was then returned unconditionally and forever, with no
    // period-end grace: an `incomplete` subscription that expired unpaid after
    // 23h left the user on permanent PRO, for free, with no revocation path.
    // The sibling handlers (handleCheckoutCompleted, handleInvoicePaid) already
    // map; this one was the outlier.
    // The plan comes from the PRICE id (env map + legacy ids), never from
    // metadata, so a portal upgrade/downgrade lands on the plan actually billed.
    await this.usersService.updateSubscription(userId, {
      plan,
      status: this.mapStripeStatus(subscription.status),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(unpaidRenewal
        ? {}
        : {
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            ...this.periodStartPatch(plan, subscription),
          }),
      ...(gate.adopted ? { stripeSubscriptionId: subscription.id } : {}),
      // Verified: OUR retrieved subscription started a trial.
      ...(subscription.trial_start ? { hasUsedTrial: true } : {}),
    });
    if (isCurrentPaidPlan(plan) && !unpaidRenewal) {
      await this.usersService.updateUsage(userId, { aiCreditsLimit: PLAN_CONFIGS[plan].limits.aiCredits });
      await this.refreshUsageWindow(userId, plan);
    }

    await this.syncSubscriptionRecord(subscription.id, {
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(unpaidRenewal
        ? {}
        : {
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          }),
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    }, subscription);

    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_CHANGED, 'subscription', userId, {
      metadata: {
        plan,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        stripeSubscriptionId: subscription.id,
      },
    });
    return null;
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
    at: { created?: number } = {},
  ): Promise<HandlerDecision> {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return 'no_user';
    if (await this.skipStripeEntitlementWrite(userId)) return 'store_purchase_in_period';

    // Only the CURRENT subscription's deletion downgrades: deleting an old
    // subscription must not take away a newer one.
    const gate = await this.gateSubscriptionEvent(userId, subscription.id, { created: at.created, mode: 'current' });
    if (!gate.apply) return gate.reason;

    await this.applyDeletedSubscriptionWrite(
      userId,
      subscription.id,
      subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
    );
    return null;
  }

  /**
   * The Firestore write `customer.subscription.deleted` performs. Shared with
   * the cancel-at-period-end reconcile job so a dropped webhook and the job
   * cannot diverge. Do not add a third downgrade path. Do not call
   * {@link revokeToFree} from the job — that cancels in Stripe.
   */
  async applyDeletedSubscriptionWrite(
    userId: string,
    stripeSubscriptionId: string | null | undefined,
    canceledAt: Date = new Date(),
  ): Promise<void> {
    if (await this.skipStripeEntitlementWrite(userId)) return;

    await this.usersService.updateSubscription(userId, {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.CANCELED,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    });

    const freeLimit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    await this.usersService.updateUsage(userId, { aiCreditsLimit: freeLimit.aiCredits });

    await this.syncSubscriptionRecord(stripeSubscriptionId, {
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: false,
      canceledAt,
    });
    this.logger.log(`Subscription deleted for user ${userId}, downgraded to free`);
    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_CANCELLED, 'subscription', userId, {
      metadata: { stripeSubscriptionId: stripeSubscriptionId ?? null },
    });
  }

  /**
   * Stripe view of a subscription for the cancel-at-period-end job.
   *
   * `still-paid` — Stripe still considers them entitled (`active` / `trialing`).
   * The job must not write Free.
   * `ended` — canceled / missing / any other status; the deleted-handler write
   * is safe.
   * `retrieve-failed` — network, auth, or unknown error. Fail closed: no write.
   * `resource_missing` is `ended`, not a retrieve failure — Stripe is saying
   * the object is gone.
   */
  async inspectStripeSubscriptionForReconcile(
    stripeSubscriptionId: string,
  ): Promise<'still-paid' | 'ended' | 'retrieve-failed'> {
    if (!this.stripe) {
      return 'retrieve-failed';
    }
    try {
      const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (sub.status === 'active' || sub.status === 'trialing') {
        return 'still-paid';
      }
      return 'ended';
    } catch (err) {
      if (PaymentService.isMissingResource(err)) {
        return 'ended';
      }
      return 'retrieve-failed';
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<HandlerDecision> {
    await this.recordChargeRefunds(charge);
    // Only a FULL refund revokes access; ignore partial refunds.
    if (!charge.refunded) return 'partial_refund';
    return this.revokeForCharge(charge, stripeId(charge.customer), 'refund');
  }

  /**
   * The subscription a charge paid for: charge → invoice → subscription.
   * Null for a charge that is not a subscription invoice payment (a pack /
   * top-up purchase — those are handled by the career path).
   */
  private async subscriptionOfCharge(charge: Stripe.Charge): Promise<string | null> {
    const invoiceRef = charge.invoice as string | Stripe.Invoice | null | undefined;
    if (!invoiceRef) return null;
    const invoice = typeof invoiceRef === 'string' ? await this.stripe.invoices.retrieve(invoiceRef) : invoiceRef;
    return invoiceSubscriptionId(invoice);
  }

  /**
   * Revoke for a reversed charge (full refund, dispute) — but only when that
   * charge paid for the user's CURRENT subscription. Refunding an invoice of
   * an old, already-replaced subscription must not cancel the newer one.
   */
  private async revokeForCharge(
    charge: Stripe.Charge,
    customerId: string | null,
    reason: string,
  ): Promise<HandlerDecision> {
    if (!customerId) return 'no_customer';
    const userId = await this.findUserByCustomerId(customerId);
    if (!userId) return 'no_user';
    const subscriptionId = await this.subscriptionOfCharge(charge);
    if (!subscriptionId) return 'charge_not_for_subscription';
    return this.revokeToFree(userId, reason, subscriptionId);
  }

  /**
   * Every refund on a charge, and the payment's refunded total. Refunds are
   * listed rather than read off the event: since API 2022-11-15 a charge no
   * longer embeds them.
   */
  private async recordChargeRefunds(charge: Stripe.Charge): Promise<void> {
    const refunds = await this.stripe.refunds.list({ charge: charge.id, limit: 100 });
    for (const refund of refunds.data) await this.recordRefund(refund);

    const paymentIntentId = stripeId(charge.payment_intent);
    if (!paymentIntentId) return;
    const existing = await this.ledger.getPayment(paymentIntentId);
    if (existing) {
      await this.ledger.upsertPayment({ ...existing, amount_refunded: charge.amount_refunded ?? 0, updated_at: new Date() });
      return;
    }
    // Paid before the ledger existed: record the payment from the charge so
    // the refund has something to net against.
    const now = new Date();
    await this.ledger.upsertPayment({
      application_id: this.appId,
      livemode: this.objectLivemode(charge),
      stripe_payment_id: paymentIntentId,
      customer_id: stripeId(charge.customer),
      internal_user_id: charge.metadata?.internal_user_id || null,
      stripe_charge_id: charge.id,
      stripe_invoice_id: stripeId(charge.invoice),
      stripe_subscription_id: null,
      amount: charge.amount_captured ?? charge.amount,
      amount_refunded: charge.amount_refunded ?? 0,
      currency: charge.currency ?? 'usd',
      status: charge.status === 'succeeded' ? 'succeeded' : ledgerPaymentStatus(charge.status),
      failure_message: charge.failure_message ?? null,
      created_at: fromUnix(charge.created) ?? now,
      updated_at: now,
    });
  }

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<HandlerDecision> {
    // Ownership was resolved by attributeEvent before dispatch: record first.
    const charge = await this.recordDispute(dispute);
    // A dispute (chargeback) means the customer pulled the funds → revoke,
    // but only if the disputed charge paid for the CURRENT subscription.
    if (!charge) return 'charge_unresolved';
    const customerId = (dispute as { customer?: string }).customer ?? stripeId(charge.customer);
    return this.revokeForCharge(charge, customerId, 'dispute');
  }

  /**
   * Idempotent upsert into the dispute ledger (`charge.dispute.created` and
   * `.closed`). Returns the disputed charge, or null if it cannot be read.
   */
  private async recordDispute(dispute: Stripe.Dispute): Promise<Stripe.Charge | null> {
    const chargeRef = dispute.charge as string | Stripe.Charge | null | undefined;
    let charge: Stripe.Charge | null = null;
    if (chargeRef && typeof chargeRef !== 'string') {
      charge = chargeRef;
    } else if (chargeRef) {
      try {
        charge = await this.stripe.charges.retrieve(chargeRef);
      } catch (err) {
        this.logger.warn(`Could not resolve charge for dispute ${dispute.id}: ${(err as Error).message}`);
      }
    }
    const chargeId = stripeId(chargeRef as string | { id: string } | null | undefined);
    if (dispute.id && chargeId) {
      await this.ledger.recordDispute({
        id: dispute.id,
        chargeId,
        paymentIntentId:
          stripeId(dispute.payment_intent as string | { id: string } | null | undefined) ??
          stripeId(charge?.payment_intent as string | { id: string } | null | undefined),
        amount: dispute.amount ?? charge?.amount ?? 0,
        currency: dispute.currency ?? charge?.currency ?? 'usd',
        status: dispute.status ?? 'needs_response',
        reason: dispute.reason ?? null,
        created: typeof dispute.created === 'number' ? dispute.created : Math.floor(Date.now() / 1000),
        applicationId: this.appId,
        livemode: this.objectLivemode(dispute as unknown as { livemode?: boolean }),
      });
    }
    return charge;
  }

  private async handleSubscriptionPaused(
    subscription: Stripe.Subscription,
    at: { created?: number } = {},
  ): Promise<HandlerDecision> {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return 'no_user';
    const gate = await this.gateSubscriptionEvent(userId, subscription.id, { created: at.created, mode: 'current' });
    if (!gate.apply) return gate.reason;
    return this.revokeToFree(userId, 'subscription paused', subscription.id);
  }

  /**
   * Stop billing this user and downgrade them, for a reason originating OUTSIDE
   * Stripe — today, account deletion.
   *
   * Deleting an account used to disable the login and leave the Stripe
   * subscription running, so the card kept being charged every month for a
   * product the person could no longer sign in to.
   */
  async cancelBillingForUser(userId: string, reason: string): Promise<void> {
    await this.careerBilling?.cancelForUser(userId);
    await this.revokeToFree(userId, reason);
  }

  /**
   * Immediately revoke paid access and downgrade to free. Also cancels the live
   * Stripe subscription (best-effort) so billing stops and a later invoice.paid
   * cannot silently re-upgrade the user.
   *
   * `expectedSubscriptionId` (refund, dispute, pause): act only if that is
   * still the user's current subscription.
   */
  private async revokeToFree(userId: string, reason: string, expectedSubscriptionId?: string): Promise<HandlerDecision> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const subId = user.subscription?.stripeSubscriptionId;
    if (expectedSubscriptionId !== undefined && subId !== expectedSubscriptionId) {
      this.logger.log(`Not revoking user ${userId} (${reason}): ${expectedSubscriptionId} is not their current subscription`);
      return 'not_current_subscription';
    }
    if (subId) {
      try {
        await this.stripe.subscriptions.cancel(subId);
      } catch (err) {
        this.logger.warn(`Could not cancel subscription ${subId}: ${(err as Error).message}`);
      }
    }

    if (hasLiveStorePurchase(user.subscription)) {
      this.logger.warn(
        `Stripe billing stopped for user ${userId} (reason: ${reason}) — store purchase kept`,
      );
      return 'store_purchase_in_period';
    }

    await this.usersService.updateSubscription(userId, {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.CANCELED,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    });
    const freeLimit = PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
    await this.usersService.updateUsage(userId, { aiCreditsLimit: freeLimit.aiCredits });

    await this.syncSubscriptionRecord(subId, {
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
    });
    this.logger.warn(`Access revoked for user ${userId} (reason: ${reason}) — downgraded to free`);
    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_REVOKED, 'subscription', userId, {
      metadata: { reason, stripeSubscriptionId: subId ?? null },
    });
    return null;
  }

  /** Trial window from a Stripe subscription (null when not trialing). */
  private extractTrial(subscription: Stripe.Subscription): { trialStart: Date | null; trialEnd: Date | null } {
    return {
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    };
  }

  private determinePlan(priceId: string): SubscriptionPlan {
    // Five-plan catalog: the env price map (STRIPE_PRICE_<PLAN>_MONTHLY/_ANNUAL).
    const current = currentPlanForPriceId(this.planPrices(), priceId);
    if (current) return current;

    // Legacy: match against PLAN_CONFIGS (same IDs used by the frontend checkout)
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

  /**
   * `subscription.currentPeriodStart` (Stripe `current_period_start`) for any
   * recognised paid plan. Current plans anchor their monthly allowance on it;
   * on legacy plans V1 ignores it (calendar reset) but the career service reads
   * it as the paid anniversary of the mapped career plan. Nothing for an
   * unrecognised price (resolved as Free).
   */
  private periodStartPatch(plan: SubscriptionPlan, subscription: Stripe.Subscription): { currentPeriodStart?: Date } {
    if (plan === SubscriptionPlan.FREE || typeof subscription.current_period_start !== 'number') return {};
    return { currentPeriodStart: new Date(subscription.current_period_start * 1000) };
  }

  /** {@link periodStartPatch} as a dotted Firestore field for batch writes. */
  private periodStartField(plan: SubscriptionPlan, subscription: Stripe.Subscription): Record<string, Date> {
    const patch = this.periodStartPatch(plan, subscription);
    return patch.currentPeriodStart ? { 'subscription.currentPeriodStart': patch.currentPeriodStart } : {};
  }

  /**
   * Open the new monthly window after a current-plan purchase or renewal so
   * the profile shows the fresh allowance at once. Best-effort: every reserve
   * path rolls the window over inside its own transaction anyway.
   */
  private async refreshUsageWindow(userId: string, plan: SubscriptionPlan): Promise<void> {
    if (!isCurrentPaidPlan(plan)) return;
    try {
      await this.usersService.rolloverUsageIfDue(userId);
    } catch (err) {
      this.logger.warn(`Usage window refresh failed for ${userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Keep the `subscriptions` collection record in step with Stripe lifecycle
   * events. Without this the record only ever reflects the checkout-time
   * snapshot, so every CRM/admin subscription view (and revenue analytics)
   * shows canceled/past_due/renewed subs as permanently "active". Merge-set so
   * a partial update can't fail on a missing field, and best-effort so a sync
   * hiccup never breaks the primary user-doc update.
   */
  private async syncSubscriptionRecord(
    subscriptionId: string | null | undefined,
    data: Record<string, unknown>,
    source?: { livemode?: boolean } | null,
  ): Promise<void> {
    if (!subscriptionId) return;
    try {
      // applicationId + livemode on every write, so a record first created by
      // a lifecycle merge (no checkout-time snapshot) is still attributable.
      await this.firebaseAdmin.firestore
        .collection('subscriptions')
        .doc(subscriptionId)
        .set(
          { ...data, applicationId: this.appId, livemode: this.objectLivemode(source), updatedAt: new Date() },
          { merge: true },
        );
    } catch (err) {
      this.logger.warn(
        `Failed to sync subscription record ${subscriptionId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * True when Firestore shows an in-period App Store / Play purchase.
   * Stripe must not overwrite that grant. Does not read `provider`.
   */
  private async skipStripeEntitlementWrite(userId: string): Promise<boolean> {
    try {
      const user = await this.usersService.findByIdOrThrow(userId);
      if (hasLiveStorePurchase(user.subscription)) {
        this.logger.warn(`Skipping Stripe entitlement write for user ${userId} — live store purchase`);
        return true;
      }
    } catch {
      return false;
    }
    return false;
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
    // Trimmed here as well as in configuration.ts: this is the last point
    // before the HMAC, and a secret that arrives with surrounding whitespace
    // silently produces a different key.
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret')?.trim();

    // Distinguish "not configured" from "signature did not match". Passing an
    // empty secret through to Stripe produces the same generic mismatch error
    // as a genuinely bad signature, so a missing or blank
    // STRIPE_WEBHOOK_SECRET looked exactly like an attack — and every event
    // failed with a message that pointed at the wrong thing.
    if (!webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not set — the server cannot verify webhook signatures.',
      );
    }

    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
