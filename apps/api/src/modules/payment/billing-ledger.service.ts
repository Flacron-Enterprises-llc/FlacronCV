import { Injectable, Logger } from '@nestjs/common';
import type { DocumentReference, Query, Transaction } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import {
  LEDGER_COLLECTIONS,
  FINAL_DISPUTE_RANK,
  LedgerCustomer,
  LedgerDispute,
  LedgerInvoice,
  LedgerKind,
  LedgerPayment,
  LedgerRefund,
  LedgerSubscription,
  RevenueReport,
  buildRevenueReport,
  disputeStatusRank,
  ledgerPaymentStatus,
} from './billing-ledger';

/** Shared with the App Store / Play webhook dedupe, which uses its own id prefix. */
export const STRIPE_EVENTS_COLLECTION = 'payment_events';

/**
 * A claim older than this is presumed abandoned (the task died mid-event) and
 * may be taken over by Stripe's next retry. Longer than any real handler run.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

export type EventClaim = 'claimed' | 'duplicate' | 'in_progress';

/**
 * How a verified Stripe event ended. Recorded on the event row so the central
 * dashboard can see what was refused, not only what was applied.
 */
export type EventOutcome =
  | 'applied'
  | 'ignored'
  | 'app_mismatch'
  | 'unattributed'
  | 'mode_mismatch';

type LedgerRow = LedgerCustomer | LedgerSubscription | LedgerInvoice | LedgerPayment | LedgerRefund;

/** What the Stripe webhook hands {@link BillingLedgerService.recordDispute}. */
export interface DisputeInput {
  /** Stripe dispute id (dp_…). */
  id: string;
  chargeId: string;
  paymentIntentId: string | null;
  /** Minor units. */
  amount: number;
  currency: string;
  /** Stripe dispute status. */
  status: string;
  reason: string | null;
  /** Stripe's `created`: unix seconds when the dispute was opened. */
  created: number;
  applicationId: string;
  livemode: boolean;
}

const ID_FIELD: Record<LedgerKind, string> = {
  customers: 'stripe_customer_id',
  subscriptions: 'stripe_subscription_id',
  invoices: 'stripe_invoice_id',
  payments: 'stripe_payment_id',
  refunds: 'stripe_refund_id',
  disputes: 'stripe_dispute_id',
};

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const v = value as { toDate?: () => Date; _seconds?: number };
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof value === 'string') return new Date(value).getTime();
  return null;
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number | string } | null;
  return e?.code === 6 || e?.code === 'already-exists' || e?.code === 'ALREADY_EXISTS';
}

@Injectable()
export class BillingLedgerService {
  private readonly logger = new Logger(BillingLedgerService.name);

  constructor(private readonly firebaseAdmin: FirebaseAdminService) {}

  private get db() {
    return this.firebaseAdmin.firestore;
  }

  // ─── Webhook idempotency ────────────────────────────────────────────────────

  /**
   * Claim a Stripe event for processing — atomically, so two concurrent
   * deliveries of the same event cannot both apply it.
   *
   * `create()` fails if the row exists, which is the lock. A row left in
   * `processing` by a task that died mid-event is taken over once stale, and a
   * handler that throws releases its claim (see {@link releaseEvent}) so
   * Stripe's retry is processed rather than mistaken for a duplicate.
   * Rows written before claims existed have no `status` but do have
   * `processedAt` — those are duplicates.
   */
  async claimEvent(event: { id: string; type: string; livemode?: boolean }): Promise<EventClaim> {
    const ref = this.db.collection(STRIPE_EVENTS_COLLECTION).doc(event.id);
    const claim = {
      provider: 'stripe',
      type: event.type,
      livemode: event.livemode ?? null,
      status: 'processing',
      claimedAt: new Date(),
    };
    try {
      await ref.create(claim);
      return 'claimed';
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }

    // Read-decide-write in ONE transaction: two retries that both find the
    // same stale claim (or a just-released row) cannot both take it over —
    // Firestore aborts and re-runs the loser, which then sees the fresh claim.
    return this.db.runTransaction(async (tx: Transaction): Promise<EventClaim> => {
      const snap = await tx.get(ref as DocumentReference);
      const existing = snap.data() as { status?: string; claimedAt?: unknown } | undefined;
      if (!existing) {
        tx.set(ref as DocumentReference, claim);
        return 'claimed';
      }
      if (existing.status === 'processing') {
        const claimedAt = toMillis(existing.claimedAt);
        if (claimedAt !== null && Date.now() - claimedAt > STALE_CLAIM_MS) {
          this.logger.warn(`Taking over stale claim on Stripe event ${event.id}`);
          tx.set(ref as DocumentReference, { ...claim, claimedAt: new Date() });
          return 'claimed';
        }
        return 'in_progress';
      }
      return 'duplicate';
    });
  }

  /** Mark a claimed event done. The row is kept: it is the record that it was processed. */
  async completeEvent(
    eventId: string,
    outcome: EventOutcome,
    details: { applicationId: string | null; expectedApplicationId: string; objectId?: string | null },
  ): Promise<void> {
    await this.db.collection(STRIPE_EVENTS_COLLECTION).doc(eventId).set(
      {
        status: 'processed',
        outcome,
        application_id: details.applicationId,
        expected_application_id: details.expectedApplicationId,
        object_id: details.objectId ?? null,
        processedAt: new Date(),
      },
      { merge: true },
    );
  }

  /** Drop a claim after a failure so Stripe's retry runs the event again. */
  async releaseEvent(eventId: string): Promise<void> {
    try {
      await this.db.collection(STRIPE_EVENTS_COLLECTION).doc(eventId).delete();
    } catch (err) {
      // The claim goes stale and is taken over by a later retry instead.
      this.logger.error(`Could not release claim on Stripe event ${eventId}: ${(err as Error).message}`);
    }
  }

  // ─── Ledger rows ────────────────────────────────────────────────────────────

  private async upsert<K extends LedgerKind>(kind: K, row: LedgerRow): Promise<void> {
    const id = (row as unknown as Record<string, string>)[ID_FIELD[kind]];
    if (!id) return;
    if (!row.application_id) {
      // Never store an unattributable money row: the dashboard could only
      // guess which application it belongs to.
      throw new Error(`Refusing to store ${kind} row ${id} without application_id`);
    }
    await this.db.collection(LEDGER_COLLECTIONS[kind]).doc(id).set(row, { merge: true });
  }

  upsertCustomer(row: LedgerCustomer) {
    return this.upsert('customers', row);
  }

  upsertSubscription(row: LedgerSubscription) {
    return this.upsert('subscriptions', row);
  }

  upsertInvoice(row: LedgerInvoice) {
    return this.upsert('invoices', row);
  }

  upsertPayment(row: LedgerPayment) {
    return this.upsert('payments', row);
  }

  upsertRefund(row: LedgerRefund) {
    return this.upsert('refunds', row);
  }

  /**
   * Record a Stripe dispute (chargeback) — idempotent upsert keyed by the
   * dispute id, inside a transaction.
   *
   * Redelivered and out-of-order webhooks are safe: a status only replaces the
   * stored one when it is not earlier in the dispute lifecycle (see
   * `disputeStatusRank`), so a late `charge.dispute.created` can never reopen a
   * dispute that is already `lost` or `won`, and one final status never flips
   * to another. `created_at` is the dispute's own Stripe creation time and is
   * never rewritten; `status_updated_at` moves only when the status changes.
   * Like every ledger row, a dispute without `application_id` is refused.
   */
  async recordDispute(input: DisputeInput): Promise<void> {
    if (!input.id) return;
    if (!input.applicationId) {
      throw new Error(`Refusing to store disputes row ${input.id} without application_id`);
    }
    const ref: DocumentReference = this.db.collection(LEDGER_COLLECTIONS.disputes).doc(input.id);
    const currency = (input.currency || 'usd').toLowerCase();
    await this.db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as Partial<LedgerDispute>) : undefined;
      const now = new Date();

      if (existing) {
        const incoming = disputeStatusRank(input.status);
        const stored = disputeStatusRank(existing.status);
        const sameStatus = existing.status === input.status;
        // An older lifecycle step, or a different final status: keep what we have.
        if (incoming < stored || (!sameStatus && stored === FINAL_DISPUTE_RANK)) return;
        if (sameStatus) {
          // Redelivery: refresh the facts, keep both timestamps.
          tx.set(
            ref,
            {
              amount: input.amount,
              currency,
              reason: input.reason,
              payment_id: input.paymentIntentId ?? existing.payment_id ?? null,
              updated_at: now,
            },
            { merge: true },
          );
          return;
        }
      }

      const row: LedgerDispute = {
        application_id: input.applicationId,
        livemode: input.livemode,
        stripe_dispute_id: input.id,
        charge_id: input.chargeId,
        payment_id: input.paymentIntentId ?? existing?.payment_id ?? null,
        amount: input.amount,
        currency,
        status: input.status,
        reason: input.reason,
        created_at: new Date((Number(input.created) || 0) * 1000),
        status_updated_at: now,
        updated_at: now,
      };
      tx.set(ref, row);
    });
  }

  async getDispute(disputeId: string): Promise<LedgerDispute | null> {
    const snap = await this.db.collection(LEDGER_COLLECTIONS.disputes).doc(disputeId).get();
    return snap.exists ? (snap.data() as LedgerDispute) : null;
  }

  /**
   * Record a pack or top-up PaymentIntent as revenue — idempotent, keyed by
   * the PaymentIntent id, so a webhook retry or a duplicate completion event
   * rewrites the same row instead of adding a second payment. A refund already
   * recorded against the PaymentIntent (`amount_refunded`) is preserved: this
   * path describes the payment, while the refund webhook owns the refund side.
   */
  async recordPaymentIntent(input: {
    paymentIntentId: string;
    applicationId: string;
    livemode: boolean;
    amount: number;
    currency: string;
    stripeStatus: string;
    customerId: string | null;
    internalUserId: string | null;
    chargeId: string | null;
    failureMessage?: string | null;
  }): Promise<void> {
    const existing = await this.getPayment(input.paymentIntentId);
    const now = new Date();
    await this.upsertPayment({
      application_id: input.applicationId,
      livemode: input.livemode,
      stripe_payment_id: input.paymentIntentId,
      customer_id: input.customerId ?? existing?.customer_id ?? null,
      internal_user_id: input.internalUserId ?? existing?.internal_user_id ?? null,
      stripe_charge_id: input.chargeId ?? existing?.stripe_charge_id ?? null,
      stripe_invoice_id: existing?.stripe_invoice_id ?? null,
      stripe_subscription_id: existing?.stripe_subscription_id ?? null,
      amount: input.amount,
      amount_refunded: existing?.amount_refunded ?? 0,
      currency: (input.currency || 'usd').toLowerCase(),
      status: ledgerPaymentStatus(input.stripeStatus),
      failure_message: input.failureMessage ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
  }

  async getPayment(paymentIntentId: string): Promise<LedgerPayment | null> {
    const snap = await this.db.collection(LEDGER_COLLECTIONS.payments).doc(paymentIntentId).get();
    return snap.exists ? (snap.data() as LedgerPayment) : null;
  }

  /** Ledger rows of one kind, for one application (or every application) in one mode. */
  async list<T>(kind: LedgerKind, applicationId: string | 'all', livemode: boolean): Promise<T[]> {
    let query: Query = this.db.collection(LEDGER_COLLECTIONS[kind]).where('livemode', '==', livemode);
    if (applicationId !== 'all') query = query.where('application_id', '==', applicationId);
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as T);
  }

  async revenueReport(applicationId: string | 'all', livemode: boolean): Promise<RevenueReport> {
    const [payments, refunds, subscriptions, disputes] = await Promise.all([
      this.list<LedgerPayment>('payments', applicationId, livemode),
      this.list<LedgerRefund>('refunds', applicationId, livemode),
      this.list<LedgerSubscription>('subscriptions', applicationId, livemode),
      this.list<LedgerDispute>('disputes', applicationId, livemode),
    ]);
    return buildRevenueReport({ payments, refunds, subscriptions, disputes }, applicationId, livemode);
  }
}
