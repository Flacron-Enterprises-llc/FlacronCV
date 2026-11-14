import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { careerAddon, readAddonPrices } from '../payment/career-addons';
import { PACK_PURCHASES, CAREER_PACK_PRODUCT } from '../payment/career-billing.service';
import { APP_ID_METADATA_KEY } from '../../config/stripe-app';
import type { TopUpCharger } from './career-ledger-meter';

/** One automatic charge per person at a time, so two exhausted requests cannot both buy a pack. */
const LOCKS = 'career_topup_locks';
const LOCK_MS = 60_000;

/**
 * Spec section 11: "Optional top-ups require explicit consent, compatible
 * packs, and a monthly spending cap." The career service decides (it holds
 * the consent, the cap and what was already spent) and V1 only charges when
 * it says `eligible`. The charge is an off-session PaymentIntent on the
 * customer's saved default card for exactly the catalog price of a pack whose
 * Stripe price is configured; on success the pack is recorded like any other
 * paid pack (`career_pack_purchases/{paymentIntentId}`, `autoTopup: true`).
 * A missing card, a decline or an unconfigured price buys nothing.
 */
export class CareerTopUpCharger implements TopUpCharger {
  private readonly logger = new Logger(CareerTopUpCharger.name);
  private readonly prices: Map<string, string>;

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
  ) {
    this.firestoreSource = firestore;
    this.prices = readAddonPrices(env);
  }

  private get firestore(): Firestore {
    return typeof this.firestoreSource === 'function' ? this.firestoreSource() : this.firestoreSource;
  }

  async charge(uid: string, addonId: string, reservationKey: string): Promise<boolean> {
    const addon = careerAddon(addonId);
    const priceId = this.prices.get(addonId);
    if (!this.stripe || !addon || addon.billing !== 'one_time' || addon.kind !== 'usage_pack' || !priceId) return false;
    if (!(await this.lock(uid))) return false;
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      if (!price.active || price.currency !== 'usd' || price.recurring || price.unit_amount !== addon.priceCents) {
        this.logger.warn(`Top-up price for ${addonId} does not match the catalog; not charged`);
        return false;
      }
      const user = (await this.firestore.collection('users').doc(uid).get()).data() as
        | { subscription?: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null } }
        | undefined;
      const customerId = user?.subscription?.stripeCustomerId;
      if (!customerId) return false;
      const paymentMethod = await this.defaultPaymentMethod(customerId, user?.subscription?.stripeSubscriptionId ?? null);
      if (!paymentMethod) return false;
      const metadata = {
        [APP_ID_METADATA_KEY]: this.appId,
        internal_user_id: uid,
        firebaseUid: uid,
        product: CAREER_PACK_PRODUCT,
        addonId,
        autoTopup: 'true',
      };
      const intent = await this.stripe.paymentIntents.create(
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
      if (intent.status !== 'succeeded') return false;
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
      return true;
    } catch (err) {
      // A decline or an authentication requirement: nothing is bought, the request stays exhausted.
      this.logger.warn(`Automatic top-up for ${uid} not charged: ${(err as { code?: string }).code ?? (err as Error).name}`);
      return false;
    } finally {
      await this.firestore.collection(LOCKS).doc(uid).delete().catch(() => undefined);
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
