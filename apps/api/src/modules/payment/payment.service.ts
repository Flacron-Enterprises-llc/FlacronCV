import { Injectable, Logger, BadRequestException, ConflictException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus, BillingInterval, PLAN_CONFIGS, BillingInvoice, TRIAL_PERIOD_DAYS, YEARLY_BILLING_ENABLED, hasLiveStorePurchase, resolveEffectivePlan } from '@flacroncv/shared-types';
import { isLiveStripeSecretKey } from '../../config/stripe-live-prices';
import { APP_ID_METADATA_KEY, DEFAULT_APP_ID, stripeKeyMode } from '../../config/stripe-app';
import { BillingLedgerService, EventOutcome } from './billing-ledger.service';
import { LedgerPayment, LedgerSubscription, ledgerPaymentStatus } from './billing-ledger';

/** The Stripe events this API acts on. Anything else is acknowledged and ignored. */
const HANDLED_STRIPE_EVENTS: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'charge.refunded',
  'charge.refund.updated',
  'charge.dispute.created',
]);

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
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' as any });
    }
    this.ledger = ledger ?? new BillingLedgerService(firebaseAdmin);
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
  ) {
    const interval = this.normalizeInterval(selection?.interval);

    if (interval === BillingInterval.YEAR && !YEARLY_BILLING_ENABLED) {
      throw new BadRequestException('Annual billing is not available yet.');
    }

    const priceId = this.resolvePriceId(selection?.plan, interval);
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

    // Resolve BEFORE the trial check below, so a replacement customer is the
    // one whose subscription history that check reads.
    await this.assertPriceIsOurs(priceId);

    const existingCustomer = await this.liveCustomer(user.subscription?.stripeCustomerId);
    let customerId = existingCustomer?.id ?? null;
    if (existingCustomer && !PaymentService.appIdOf(existingCustomer)) {
      // A customer created before the app_id standard: claim it for FlacronCV
      // so the central dashboard can attribute it.
      await this.stampCustomer(existingCustomer, userId, user.email);
    }
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.displayName,
        metadata: this.appMetadata(userId),
      });
      customerId = customer.id;
      await this.usersService.updateSubscription(userId, { stripeCustomerId: customerId });
      await this.recordCustomer(customer, userId, user.email);
    }

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
    const trialOfferedOnPlan = selection.plan === SubscriptionPlan.PRO && TRIAL_PERIOD_DAYS > 0;
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

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: userId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
      allow_promotion_codes: true,
      metadata,
      subscription_data: {
        metadata,
        ...(isFirstTimeSubscriber ? { trial_period_days: TRIAL_PERIOD_DAYS } : {}),
      },
    });

    if (isFirstTimeSubscriber) {
      await this.usersService.updateSubscription(userId, { hasUsedTrial: true });
    }

    return { sessionId: session.id, url: session.url };
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

  async createPortalSession(userId: string, returnUrl: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    // Same staleness check as checkout, opposite remedy: a portal exists to
    // manage an EXISTING billing relationship, so a customer Stripe no longer
    // knows about has nothing to show. Creating a replacement here would open
    // an empty portal; report it as the 400 the user can act on instead of
    // letting Stripe's "No such customer" escape as a 500.
    const customerId = await this.liveCustomerId(user.subscription?.stripeCustomerId);
    if (!customerId) {
      throw new BadRequestException('No active subscription found. Please subscribe to a plan first.');
    }

    // FlacronCV's own portal configuration: the account default is shared by
    // every Flacron app and would offer their plans as upgrade options.
    const configuration = this.configService.get<string>('stripe.portalConfigurationId');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(configuration ? { configuration } : {}),
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
          await this.dispatch(event);
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
      return outcome;
    } catch (err) {
      await this.ledger.releaseEvent(event.id);
      throw err;
    }
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
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
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.refund.updated':
        await this.recordRefund(event.data.object as Stripe.Refund);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case 'customer.subscription.paused':
        await this.handleSubscriptionPaused(event.data.object as Stripe.Subscription);
        break;
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
        return PaymentService.appIdOf(obj as Stripe.Checkout.Session);
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
        return PaymentService.appIdOf(obj as Stripe.Subscription);
      case 'invoice.paid':
      case 'invoice.payment_failed':
        return this.invoiceAppId(obj as Stripe.Invoice);
      case 'charge.refunded':
        return this.chargeAppId(obj as Stripe.Charge);
      case 'charge.refund.updated':
        return this.refundAppId(obj as Stripe.Refund);
      case 'charge.dispute.created': {
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
    const subscriptionId = stripeId(invoice.subscription);
    if (!subscriptionId) return null;
    return PaymentService.appIdOf(await this.stripe.subscriptions.retrieve(subscriptionId));
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

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.firebaseUid || session.metadata?.internal_user_id || session.client_reference_id;
    if (!session.subscription) return;

    const subscription = await this.stripe.subscriptions.retrieve(stripeId(session.subscription)!);
    await this.recordSubscription(subscription, userId);
    if (!userId) return;
    if (await this.skipStripeEntitlementWrite(userId)) return;

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
      'subscription.trialStart': trial.trialStart,
      'subscription.trialEnd': trial.trialEnd,
      'subscription.cancelAtPeriodEnd': false,
      'usage.aiCreditsLimit': limits.aiCredits,
      updatedAt: now,
    });

    batch.set(subscriptionRef, {
      id: subscription.id,
      applicationId: this.appId,
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
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    // The money is recorded whether or not a user still maps to the customer.
    await this.recordInvoice(invoice, userId);
    if (!invoice.subscription) return;
    const sub = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    await this.recordSubscription(sub, userId);
    if (!userId) return;
    if (await this.skipStripeEntitlementWrite(userId)) return;

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

    await this.syncSubscriptionRecord(sub.id, {
      status: SubscriptionStatus.ACTIVE,
      plan,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const userId = await this.findUserByCustomerId(invoice.customer as string);
    // Recorded as a failed payment — counted, never summed as revenue.
    await this.recordInvoice(invoice, userId);
    if (!userId) return;
    if (await this.skipStripeEntitlementWrite(userId)) return;
    await this.usersService.updateSubscription(userId, { status: SubscriptionStatus.PAST_DUE });
    await this.syncSubscriptionRecord(invoice.subscription as string, {
      status: SubscriptionStatus.PAST_DUE,
    });
    this.logger.warn(`Payment failed for user ${userId}`);
    await this.audit.logSystemAction(AuditAction.PAYMENT_FAILED, 'subscription', userId, {
      metadata: { invoiceId: invoice.id, amountDue: invoice.amount_due },
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return;
    if (await this.skipStripeEntitlementWrite(userId)) return;

    const plan = this.determinePlan(subscription.items.data[0].price.id);
    // Map, never cast. Stripe has EIGHT subscription statuses; SubscriptionStatus
    // has six. A bare cast persisted the raw string for the two with no enum
    // member — `incomplete_expired` and `paused` — and entitlements are decided
    // by `ACCESS_ENDING_STATUSES.includes(status)`, which neither string is in.
    // The stored plan was then returned unconditionally and forever, with no
    // period-end grace: an `incomplete` subscription that expired unpaid after
    // 23h left the user on permanent PRO, for free, with no revocation path.
    // The sibling handlers (handleCheckoutCompleted, handleInvoicePaid) already
    // map; this one was the outlier.
    await this.usersService.updateSubscription(userId, {
      plan,
      status: this.mapStripeStatus(subscription.status),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    });

    await this.syncSubscriptionRecord(subscription.id, {
      plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    });

    await this.audit.logSystemAction(AuditAction.SUBSCRIPTION_CHANGED, 'subscription', userId, {
      metadata: {
        plan,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        stripeSubscriptionId: subscription.id,
      },
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return;

    await this.applyDeletedSubscriptionWrite(
      userId,
      subscription.id,
      subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
    );
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

  private async handleChargeRefunded(charge: Stripe.Charge) {
    await this.recordChargeRefunds(charge);
    // Only a FULL refund revokes access; ignore partial refunds.
    if (!charge.refunded) return;
    const userId = await this.findUserByCustomerId(charge.customer as string);
    if (!userId) return;
    await this.revokeToFree(userId, 'refund');
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

  private async handleDisputeCreated(dispute: Stripe.Dispute) {
    // A dispute (chargeback) means the customer pulled the funds → revoke.
    let customerId = (dispute as { customer?: string }).customer;
    if (!customerId && dispute.charge) {
      try {
        const charge = await this.stripe.charges.retrieve(dispute.charge as string);
        customerId = charge.customer as string;
      } catch (err) {
        this.logger.warn(`Could not resolve customer for dispute ${dispute.id}: ${(err as Error).message}`);
      }
    }
    if (!customerId) return;
    const userId = await this.findUserByCustomerId(customerId);
    if (!userId) return;
    await this.revokeToFree(userId, 'dispute');
  }

  private async handleSubscriptionPaused(subscription: Stripe.Subscription) {
    const userId = await this.findUserByCustomerId(subscription.customer as string);
    await this.recordSubscription(subscription, userId);
    if (!userId) return;
    await this.revokeToFree(userId, 'subscription paused');
  }

  /**
   * Immediately revoke paid access and downgrade to free. Also cancels the live
   * Stripe subscription (best-effort) so billing stops and a later invoice.paid
   * cannot silently re-upgrade the user.
   */
  /**
   * Stop billing this user and downgrade them, for a reason originating OUTSIDE
   * Stripe — today, account deletion.
   *
   * Deleting an account used to disable the login and leave the Stripe
   * subscription running, so the card kept being charged every month for a
   * product the person could no longer sign in to.
   */
  async cancelBillingForUser(userId: string, reason: string): Promise<void> {
    await this.revokeToFree(userId, reason);
  }

  private async revokeToFree(userId: string, reason: string) {
    const user = await this.usersService.findByIdOrThrow(userId);
    const subId = user.subscription?.stripeSubscriptionId;
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
      return;
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
  }

  /** Trial window from a Stripe subscription (null when not trialing). */
  private extractTrial(subscription: Stripe.Subscription): { trialStart: Date | null; trialEnd: Date | null } {
    return {
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    };
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
  ): Promise<void> {
    if (!subscriptionId) return;
    try {
      await this.firebaseAdmin.firestore
        .collection('subscriptions')
        .doc(subscriptionId)
        .set({ ...data, updatedAt: new Date() }, { merge: true });
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
