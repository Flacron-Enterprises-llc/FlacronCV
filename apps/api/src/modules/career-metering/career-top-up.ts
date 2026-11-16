import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { addonAllowedFor, careerAddon, readAddonPrices } from '../payment/career-addons';
import { PACK_PURCHASES, CAREER_PACK_PRODUCT, careerPlanOfUser } from '../payment/career-billing.service';
import { BillingLedgerService } from '../payment/billing-ledger.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { stampLegacyCustomer, verifyStoredCustomer } from '../payment/customer-ownership';
import { AvailabilitySource, CareerAccessAvailabilitySource, addonAvailability } from '../payment/purchase-availability';
import { APP_ID_METADATA_KEY } from '../../config/stripe-app';
import { currentCaller } from './caller-context';
import type { TopUpCharger } from './career-ledger-meter';

/** One automatic charge per person at a time, so two exhausted requests cannot both buy a pack. */
const LOCKS = 'career_topup_locks';
const LOCK_MS = 60_000;

/** The ledger calls the top-up makes (BillingLedgerService fits). */
type TopUpLedger = Pick<BillingLedgerService, 'recordPaymentIntent' | 'upsertCustomer'>;

export interface CareerTopUpOptions {
  /** Whether the pack's feature is on sale (purchase-availability.ts). Defaults to the career service; fails closed. */
  availability?: AvailabilitySource;
  /** Where the charge is recorded (billing_payments). Defaults to the shared ledger on the same Firestore. */
  ledger?: TopUpLedger;
}

/**
 * Spec section 11: "Optional top-ups require explicit consent, compatible
 * packs, and a monthly spending cap." The career service decides (it holds
 * the consent, the cap and what was already spent) and V1 only charges when
 * it says `eligible`. The charge is an off-session PaymentIntent on the
 * customer's saved default card for exactly the catalog price of a pack whose
 * Stripe price is configured; on success the pack is recorded like any other
 * paid pack (`career_pack_purchases/{paymentIntentId}`, `autoTopup: true`)
 * and the money in the billing ledger (`billing_payments/{paymentIntentId}`).
 *
 * Nothing is charged (fail closed) when: the price is unconfigured or off
 * catalog; the pack is not on sale for this caller (same purchase-availability
 * decision as checkout — the career service could not be asked counts as
 * unavailable); the person's plan may not buy it; the stored customer cannot
 * be verified as FlacronCV's (missing, deleted, another app's, or a legacy
 * untagged one that could not be claimed); there is no saved card; or the
 * card is declined.
 */
export class CareerTopUpCharger implements TopUpCharger {
  private readonly logger = new Logger(CareerTopUpCharger.name);
  private readonly prices: Map<string, string>;
  private readonly availability: AvailabilitySource;
  private readonly ledger: TopUpLedger;

  private readonly firestoreSource: Firestore | (() => Firestore);

  /**
   * `firestore` may be a getter: the Nest provider is built before
   * FirebaseAdminService initialises (onModuleInit), so reading
   * `firebase.firestore` at construction crashed the API at boot.
   */
  constructor(
    private readonly stripe: Stripe | null,
    firestore: Firestore | (() => Firestore),
    private readonly appId: string,
    env: Record<string, string | undefined> = process.env,
    options: CareerTopUpOptions = {},
  ) {
    this.firestoreSource = firestore;
    this.prices = readAddonPrices(env);
    this.availability = options.availability ?? new CareerAccessAvailabilitySource(env.CAREER_API_URL);
    // Lazy like the Firestore source: the ledger reads it on each call.
    const firestoreOf = () => this.firestore;
    this.ledger =
      options.ledger ??
      new BillingLedgerService({
        get firestore() {
          return firestoreOf();
        },
      } as unknown as FirebaseAdminService);
  }

  private get firestore(): Firestore {
    return typeof this.firestoreSource === 'function' ? this.firestoreSource() : this.firestoreSource;
  }

  async charge(uid: string, addonId: string, reservationKey: string): Promise<boolean> {
    const addon = careerAddon(addonId);
    const priceId = this.prices.get(addonId);
    if (!this.stripe || !addon || addon.billing !== 'one_time' || addon.kind !== 'usage_pack' || !priceId) return false;

    // Same purchase availability as checkout, for the caller whose request ran out.
    const availability = addonAvailability(addonId, await this.availability.forCaller(currentCaller()?.idToken ?? null));
    if (!availability.available) {
      this.logger.warn(`Top-up ${addonId} for ${uid} not charged: unavailable (${availability.reason})`);
      return false;
    }

    if (!(await this.lock(uid))) return false;
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      if (!price.active || price.currency !== 'usd' || price.recurring || price.unit_amount !== addon.priceCents) {
        this.logger.warn(`Top-up price for ${addonId} does not match the catalog; not charged`);
        return false;
      }
      const user = (await this.firestore.collection('users').doc(uid).get()).data() as
        | { email?: string; subscription?: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null } }
        | undefined;
      if (!user) return false;
      // Same plan minimum as checkout (Free never; each pack has its minimum).
      const allowed = addonAllowedFor(careerPlanOfUser(user), addonId);
      if (!allowed.ok) {
        this.logger.warn(`Top-up ${addonId} for ${uid} not charged: plan not eligible (${allowed.reason})`);
        return false;
      }
      const customerId = await this.verifiedCustomer(uid, user);
      if (!customerId) return false;
      const paymentMethod = await this.defaultPaymentMethod(customerId, user.subscription?.stripeSubscriptionId ?? null);
      if (!paymentMethod) return false;
      const metadata = {
        [APP_ID_METADATA_KEY]: this.appId,
        internal_user_id: uid,
        firebaseUid: uid,
        product: CAREER_PACK_PRODUCT,
        addonId,
        autoTopup: 'true',
      };
      let intent: Stripe.PaymentIntent;
      try {
        intent = await this.stripe.paymentIntents.create(
          {
            amount: addon.priceCents,
            currency: 'usd',
            customer: customerId,
            payment_method: paymentMethod,
            off_session: true,
            confirm: true,
            description: `FlacronCV automatic top-up: ${addonId}`,
            metadata,
          },
          { idempotencyKey: `career-topup:${uid}:${reservationKey}`.slice(0, 255) },
        );
      } catch (err) {
        // A decline still created a PaymentIntent: record it as a failed payment (never revenue).
        const failed = (err as { payment_intent?: Stripe.PaymentIntent }).payment_intent;
        if (failed?.id) await this.recordPayment(failed, uid, customerId);
        throw err;
      }
      if (intent.status !== 'succeeded') {
        await this.recordPayment(intent, uid, customerId);
        return false;
      }
      const ref = this.firestore.collection(PACK_PURCHASES).doc(intent.id) as DocumentReference;
      await this.firestore.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(ref);
        if (snap.exists) return;
        tx.set(ref, {
          uid,
          addonId,
          purchasedAt: new Date((intent.created ?? Math.floor(Date.now() / 1000)) * 1000),
          amountCents: intent.amount_received ?? intent.amount,
          currency: intent.currency,
          paymentIntentId: intent.id,
          autoTopup: true,
          status: 'paid',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      await this.recordPayment(intent, uid, customerId);
      return true;
    } catch (err) {
      // A decline or an authentication requirement: nothing is bought, the request stays exhausted.
      this.logger.warn(`Automatic top-up for ${uid} not charged: ${(err as { code?: string }).code ?? (err as Error).name}`);
      return false;
    } finally {
      await this.firestore.collection(LOCKS).doc(uid).delete().catch(() => undefined);
    }
  }

  /**
   * The stored customer, only if it is verifiably FlacronCV's. An untagged
   * legacy customer (the user's own stored id) is claimed first, and only a
   * successful claim allows the charge. Never creates a customer: a new one
   * would have no saved card to charge anyway.
   */
  private async verifiedCustomer(uid: string, user: { email?: string; subscription?: { stripeCustomerId?: string | null } }): Promise<string | null> {
    const verdict = await verifyStoredCustomer(this.stripe!, user.subscription?.stripeCustomerId, this.appId);
    switch (verdict.kind) {
      case 'owned':
        return verdict.customer.id;
      case 'legacy': {
        const stamped = await stampLegacyCustomer(this.stripe!, verdict.customer, {
          appId: this.appId,
          userId: uid,
          email: user.email ?? null,
          ledger: this.ledger,
          log: this.logger,
        });
        return stamped ? verdict.customer.id : null;
      }
      case 'foreign':
        this.logger.warn(`Top-up for ${uid} not charged: stored customer belongs to app_id ${verdict.owner}`);
        return null;
      default:
        return null;
    }
  }

  /**
   * The charge in billing_payments, keyed by the PaymentIntent id (a retry with
   * the same idempotency key returns the same intent, so it is counted once).
   * The charge already happened: a ledger failure is logged loudly, never
   * turned into "not bought" (the pack is paid and recorded).
   */
  private async recordPayment(intent: Stripe.PaymentIntent, uid: string, customerId: string): Promise<void> {
    try {
      await this.ledger.recordPaymentIntent({
        paymentIntentId: intent.id,
        applicationId: this.appId,
        livemode: !!intent.livemode,
        amount: intent.status === 'succeeded' ? intent.amount_received ?? intent.amount : intent.amount,
        currency: intent.currency ?? 'usd',
        stripeStatus: intent.status,
        customerId,
        internalUserId: uid,
        chargeId: typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id ?? null,
        failureMessage: intent.last_payment_error?.message ?? null,
      });
    } catch (err) {
      this.logger.error(`Top-up PaymentIntent ${intent.id} not recorded in billing_payments: ${(err as Error).message}`);
    }
  }

  private async lock(uid: string): Promise<boolean> {
    const ref = this.firestore.collection(LOCKS).doc(uid) as DocumentReference;
    return this.firestore.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      const until = (snap.data() as { until?: number } | undefined)?.until ?? 0;
      if (until > Date.now()) return false;
      tx.set(ref, { until: Date.now() + LOCK_MS });
      return true;
    });
  }

  private async defaultPaymentMethod(customerId: string, subscriptionId: string | null): Promise<string | null> {
    const customer = await this.stripe!.customers.retrieve(customerId);
    if (!('deleted' in customer && customer.deleted)) {
      const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
      if (pm) return typeof pm === 'string' ? pm : pm.id;
    }
    if (!subscriptionId) return null;
    const sub = await this.stripe!.subscriptions.retrieve(subscriptionId);
    const pm = sub.default_payment_method;
    return pm ? (typeof pm === 'string' ? pm : pm.id) : null;
  }
}
