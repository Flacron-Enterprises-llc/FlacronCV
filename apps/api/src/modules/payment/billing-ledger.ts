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
  disputes: 'billing_disputes',
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

/**
 * A chargeback (Stripe Dispute), keyed by the dispute id (dp_…).
 *
 * `created_at` is when the customer opened the dispute at Stripe (the
 * dispute's own `created`), not when this row was first written;
 * `status_updated_at` is when this ledger last saw the status change.
 */
export interface LedgerDispute extends LedgerBase {
  stripe_dispute_id: string;
  charge_id: string;
  /** The PaymentIntent of the disputed charge (pi_…), matching billing_payments. */
  payment_id: string | null;
  /** Minor units disputed (what Stripe withdraws from the balance while open, and keeps if lost). */
  amount: number;
  currency: string;
  /**
   * Stripe dispute status: warning_needs_response, warning_under_review,
   * warning_closed, needs_response, under_review, won, lost.
   */
  status: string;
  reason: string | null;
  status_updated_at: Date;
}

/**
 * Lifecycle rank of a dispute status, so an out-of-order (older) webhook can
 * never move a dispute backwards. Final statuses (won, lost, warning_closed)
 * outrank every open one and never replace each other.
 */
export const FINAL_DISPUTE_RANK = 5;
export function disputeStatusRank(status: string | null | undefined): number {
  switch (status) {
    case 'warning_needs_response':
      return 1;
    case 'warning_under_review':
      return 2;
    case 'needs_response':
      return 3;
    case 'under_review':
      return 4;
    case 'warning_closed':
    case 'won':
    case 'lost':
      return FINAL_DISPUTE_RANK;
    default:
      return 0;
  }
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

/**
 * Money for one currency. All amounts are integer MINOR units (cents) and are
 * never converted or summed across currencies — there is no FX policy.
 *
 *   gross_revenue      Σ succeeded payments. Refunds and disputes never lower it.
 *   refunds            Σ succeeded refunds.
 *   net_after_refunds  gross_revenue − refunds.
 *   disputed           Σ every dispute in scope, whatever its status (open,
 *                      won or lost) — the exposure, for information.
 *   disputes_open      Σ disputes not yet decided (funds currently withheld).
 *   disputes_lost      Σ disputes with status `lost` — money permanently gone.
 *   net_revenue        gross_revenue − refunds − disputes_lost.
 *
 * None of these is net PROCEEDS: Stripe processing fees, dispute fees and
 * currency-conversion costs are not recorded in this ledger, so what Stripe
 * actually pays out is lower than `net_revenue`. An open or won dispute does
 * not reduce `net_revenue`: a won dispute returns the funds, and an open one
 * is only withheld until it is decided.
 */
export interface CurrencyTotals {
  currency: string;
  gross_revenue: number;
  refunds: number;
  net_after_refunds: number;
  disputed: number;
  disputes_open: number;
  disputes_lost: number;
  net_revenue: number;
  mrr: number;
  arr: number;
}

/** One application's money inside a report (company-wide reports list every app). */
export interface ApplicationTotals {
  application_id: string;
  totals: CurrencyTotals[];
}

export interface RevenueReport {
  application_id: string;
  livemode: boolean;
  successful_payments: number;
  failed_payments: number;
  refund_count: number;
  dispute_count: number;
  disputes_lost_count: number;
  disputes_open_count: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_subscriptions: number;
  customer_count: number;
  /** Always false: Stripe fees are not in this ledger (see {@link CurrencyTotals}). */
  fees_included: false;
  /** How the money fields are derived, for whoever reads the report. */
  basis: string;
  /** Money is reported per currency and never summed across currencies. */
  totals: CurrencyTotals[];
  /** The same totals split per application (one entry when scoped to one app). */
  by_application: ApplicationTotals[];
}

export interface RevenueReportInput {
  payments: LedgerPayment[];
  refunds: LedgerRefund[];
  subscriptions: LedgerSubscription[];
  /** Optional so callers predating disputes keep working; absent means none. */
  disputes?: LedgerDispute[];
}

export const REVENUE_REPORT_BASIS =
  'Integer minor units per currency, never converted. gross_revenue = succeeded payments; ' +
  'net_after_refunds = gross_revenue - succeeded refunds; net_revenue = net_after_refunds - lost disputes. ' +
  'Stripe processing/dispute fees are NOT included, so these are not net proceeds or payouts.';

/** Subscriptions that are recurring revenue right now. Trials have not paid yet. */
const MRR_STATUSES = new Set(['active', 'past_due']);
const CANCELLED_STATUSES = new Set(['canceled', 'incomplete_expired']);
const DECIDED_DISPUTE_STATUSES = new Set(['won', 'lost', 'warning_closed']);

function emptyTotals(currency: string): CurrencyTotals {
  return {
    currency,
    gross_revenue: 0,
    refunds: 0,
    net_after_refunds: 0,
    disputed: 0,
    disputes_open: 0,
    disputes_lost: 0,
    net_revenue: 0,
    mrr: 0,
    arr: 0,
  };
}

/** Per-currency money for rows already filtered to the scope. */
function currencyTotals(
  succeeded: LedgerPayment[],
  succeededRefunds: LedgerRefund[],
  subscriptions: LedgerSubscription[],
  disputes: LedgerDispute[],
): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  const totalsFor = (currency: string) => {
    const key = (currency || 'usd').toLowerCase();
    let totals = byCurrency.get(key);
    if (!totals) {
      totals = emptyTotals(key);
      byCurrency.set(key, totals);
    }
    return totals;
  };

  for (const p of succeeded) totalsFor(p.currency).gross_revenue += p.amount;
  for (const r of succeededRefunds) totalsFor(r.currency).refunds += r.amount;
  for (const d of disputes) {
    const t = totalsFor(d.currency);
    t.disputed += d.amount;
    if (d.status === 'lost') t.disputes_lost += d.amount;
    else if (!DECIDED_DISPUTE_STATUSES.has(d.status)) t.disputes_open += d.amount;
  }
  for (const s of subscriptions) {
    if (!MRR_STATUSES.has(s.status)) continue;
    const monthly = s.interval === 'year' ? s.amount / 12 : s.amount;
    totalsFor(s.currency).mrr += monthly;
  }

  for (const totals of byCurrency.values()) {
    totals.net_after_refunds = totals.gross_revenue - totals.refunds;
    totals.net_revenue = totals.net_after_refunds - totals.disputes_lost;
    totals.mrr = Math.round(totals.mrr);
    totals.arr = totals.mrr * 12;
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Revenue for ONE application (or `'all'`) in ONE mode, from ledger rows.
 *
 * Pure, so the separation and reconciliation rules can be tested without
 * Firestore:
 *   - only `succeeded` payments are revenue — failed, pending and incomplete
 *     payments are counted, never summed;
 *   - only `succeeded` refunds reduce revenue (`net_after_refunds`);
 *   - only `lost` disputes further reduce `net_revenue`; every dispute is
 *     reported in `disputed`, undecided ones also in `disputes_open`;
 *   - a row from another application or the other mode is ignored, so a
 *     FlacronAI refund or dispute can never move FlacronCV's numbers;
 *   - rows are keyed by their Stripe id, so the same id appearing twice (a
 *     duplicated read or upsert) is counted once.
 */
export function buildRevenueReport(
  input: RevenueReportInput,
  applicationId: string | 'all',
  livemode: boolean,
): RevenueReport {
  const inScope = <T extends LedgerBase>(row: T) =>
    row.livemode === livemode && (applicationId === 'all' || row.application_id === applicationId);
  // Last row per Stripe id wins: the ledger stores absolute state per id.
  const unique = <T>(rows: T[], id: (row: T) => string) => [...new Map(rows.map((r) => [id(r), r])).values()];

  const payments = unique(input.payments.filter(inScope), (p) => p.stripe_payment_id);
  const refunds = unique(input.refunds.filter(inScope), (r) => r.stripe_refund_id);
  const subscriptions = unique(input.subscriptions.filter(inScope), (s) => s.stripe_subscription_id);
  const disputes = unique((input.disputes ?? []).filter(inScope), (d) => d.stripe_dispute_id);

  const succeeded = payments.filter((p) => p.status === 'succeeded');
  const succeededRefunds = refunds.filter((r) => r.status === 'succeeded');

  const applicationIds = new Set<string>();
  for (const row of [...succeeded, ...succeededRefunds, ...subscriptions, ...disputes]) {
    applicationIds.add(row.application_id);
  }
  const byApplication = [...applicationIds].sort().map((app) => {
    const own = <T extends LedgerBase>(rows: T[]) => rows.filter((r) => r.application_id === app);
    return {
      application_id: app,
      totals: currencyTotals(own(succeeded), own(succeededRefunds), own(subscriptions), own(disputes)),
    };
  });

  const customers = new Set<string>();
  for (const p of succeeded) if (p.customer_id) customers.add(p.customer_id);
  for (const s of subscriptions) if (s.stripe_customer_id) customers.add(s.stripe_customer_id);

  return {
    application_id: applicationId,
    livemode,
    successful_payments: succeeded.length,
    failed_payments: payments.filter((p) => p.status === 'failed').length,
    refund_count: succeededRefunds.length,
    dispute_count: disputes.length,
    disputes_lost_count: disputes.filter((d) => d.status === 'lost').length,
    disputes_open_count: disputes.filter((d) => !DECIDED_DISPUTE_STATUSES.has(d.status)).length,
    active_subscriptions: subscriptions.filter((s) => s.status === 'active').length,
    trialing_subscriptions: subscriptions.filter((s) => s.status === 'trialing').length,
    past_due_subscriptions: subscriptions.filter((s) => s.status === 'past_due').length,
    cancelled_subscriptions: subscriptions.filter((s) => CANCELLED_STATUSES.has(s.status)).length,
    customer_count: customers.size,
    fees_included: false,
    basis: REVENUE_REPORT_BASIS,
    totals: currencyTotals(succeeded, succeededRefunds, subscriptions, disputes),
    by_application: byApplication,
  };
}
