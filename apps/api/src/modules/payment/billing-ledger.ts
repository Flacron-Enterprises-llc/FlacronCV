/**
 * FlacronCV's own record of its Stripe money — the source the central Flacron
 * management dashboard reads, instead of the shared Stripe account.
 *
 * Every row carries `application_id`, so one application's payments, refunds
 * and subscriptions can be selected without any other application's mixed in,
 * and `livemode`, so sandbox rows never inflate live revenue. Rows are keyed by
 * the Stripe object id and written as absolute state (never incremented), so a
 * redelivered or out-of-order webhook rewrites the same row instead of adding
 * a second one.
 *
 * Field names are snake_case on purpose: they are the shared schema every
 * Flacron application reports in, not FlacronCV's internal camelCase.
 */

export const LEDGER_COLLECTIONS = {
  customers: 'billing_customers',
  subscriptions: 'billing_subscriptions',
  invoices: 'billing_invoices',
  payments: 'billing_payments',
  refunds: 'billing_refunds',
} as const;

export type LedgerKind = keyof typeof LEDGER_COLLECTIONS;

interface LedgerBase {
  application_id: string;
  livemode: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerCustomer extends LedgerBase {
  stripe_customer_id: string;
  internal_user_id: string | null;
  email: string | null;
}

export interface LedgerSubscription extends LedgerBase {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  internal_user_id: string | null;
  plan: string;
  price_id: string | null;
  interval: string;
  /** Stripe's own status vocabulary (active, trialing, past_due, canceled, …). */
  status: string;
  /** Minor units (cents) per billing interval. */
  amount: number;
  currency: string;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
}

export interface LedgerInvoice extends LedgerBase {
  stripe_invoice_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_id: string | null;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  billing_reason: string | null;
}

export type LedgerPaymentStatus = 'succeeded' | 'failed' | 'processing' | 'canceled' | 'pending';

export interface LedgerPayment extends LedgerBase {
  /** The PaymentIntent id (pi_…). */
  stripe_payment_id: string;
  customer_id: string | null;
  internal_user_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  /** Minor units. For a succeeded payment, the amount actually received. */
  amount: number;
  amount_refunded: number;
  currency: string;
  status: LedgerPaymentStatus;
  failure_message: string | null;
}

export interface LedgerRefund extends LedgerBase {
  stripe_refund_id: string;
  /** The PaymentIntent the refund reverses (pi_…), matching billing_payments. */
  payment_id: string | null;
  charge_id: string | null;
  amount: number;
  currency: string;
  /** Stripe refund status: pending, succeeded, failed, canceled, requires_action. */
  status: string;
  reason: string | null;
}

/** What a Stripe payment status means for revenue. Only `succeeded` is money. */
export function ledgerPaymentStatus(stripeStatus: string | null | undefined): LedgerPaymentStatus {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'processing';
    case 'canceled':
      return 'canceled';
    case 'requires_payment_method':
      // A PaymentIntent drops back here after a decline.
      return 'failed';
    default:
      return 'pending';
  }
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: string;
  gross_revenue: number;
  refunds: number;
  net_revenue: number;
  mrr: number;
  arr: number;
}

export interface RevenueReport {
  application_id: string;
  livemode: boolean;
  successful_payments: number;
  failed_payments: number;
  refund_count: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_subscriptions: number;
  customer_count: number;
  /** Money is reported per currency and never summed across currencies. */
  totals: CurrencyTotals[];
}

export interface RevenueReportInput {
  payments: LedgerPayment[];
  refunds: LedgerRefund[];
  subscriptions: LedgerSubscription[];
}

/** Subscriptions that are recurring revenue right now. Trials have not paid yet. */
const MRR_STATUSES = new Set(['active', 'past_due']);
const CANCELLED_STATUSES = new Set(['canceled', 'incomplete_expired']);

/**
 * Revenue for ONE application (or `'all'`) in ONE mode, from ledger rows.
 *
 * Pure, so the separation and reconciliation rules can be tested without
 * Firestore:
 *   - only `succeeded` payments are revenue — failed, pending and incomplete
 *     payments are counted, never summed;
 *   - only `succeeded` refunds reduce revenue, and net = gross − refunds;
 *   - a row from another application or the other mode is ignored, so a
 *     FlacronAI refund can never move FlacronCV's numbers.
 */
export function buildRevenueReport(
  input: RevenueReportInput,
  applicationId: string | 'all',
  livemode: boolean,
): RevenueReport {
  const inScope = <T extends LedgerBase>(row: T) =>
    row.livemode === livemode && (applicationId === 'all' || row.application_id === applicationId);

  const payments = input.payments.filter(inScope);
  const refunds = input.refunds.filter(inScope);
  const subscriptions = input.subscriptions.filter(inScope);

  const byCurrency = new Map<string, CurrencyTotals>();
  const totalsFor = (currency: string) => {
    const key = (currency || 'usd').toLowerCase();
    let totals = byCurrency.get(key);
    if (!totals) {
      totals = { currency: key, gross_revenue: 0, refunds: 0, net_revenue: 0, mrr: 0, arr: 0 };
      byCurrency.set(key, totals);
    }
    return totals;
  };

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  for (const p of succeeded) totalsFor(p.currency).gross_revenue += p.amount;

  const succeededRefunds = refunds.filter((r) => r.status === 'succeeded');
  for (const r of succeededRefunds) totalsFor(r.currency).refunds += r.amount;

  for (const s of subscriptions) {
    if (!MRR_STATUSES.has(s.status)) continue;
    const monthly = s.interval === 'year' ? s.amount / 12 : s.amount;
    totalsFor(s.currency).mrr += monthly;
  }

  for (const totals of byCurrency.values()) {
    totals.net_revenue = totals.gross_revenue - totals.refunds;
    totals.mrr = Math.round(totals.mrr);
    totals.arr = totals.mrr * 12;
  }

  const customers = new Set<string>();
  for (const p of succeeded) if (p.customer_id) customers.add(p.customer_id);
  for (const s of subscriptions) if (s.stripe_customer_id) customers.add(s.stripe_customer_id);

  return {
    application_id: applicationId,
    livemode,
    successful_payments: succeeded.length,
    failed_payments: payments.filter((p) => p.status === 'failed').length,
    refund_count: succeededRefunds.length,
    active_subscriptions: subscriptions.filter((s) => s.status === 'active').length,
    trialing_subscriptions: subscriptions.filter((s) => s.status === 'trialing').length,
    past_due_subscriptions: subscriptions.filter((s) => s.status === 'past_due').length,
    cancelled_subscriptions: subscriptions.filter((s) => CANCELLED_STATUSES.has(s.status)).length,
    customer_count: customers.size,
    totals: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
