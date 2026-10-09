import { buildRevenueReport, LedgerPayment, LedgerRefund, LedgerSubscription, ledgerPaymentStatus } from './billing-ledger';

/**
 * The Flacron Stripe standard's acceptance examples (sections 11–14), run
 * against the report the central dashboard reads.
 */

const at = new Date('2026-10-01T00:00:00Z');

function payment(app: string, id: string, amount: number, overrides: Partial<LedgerPayment> = {}): LedgerPayment {
  return {
    application_id: app,
    livemode: false,
    stripe_payment_id: id,
    customer_id: `cus_${id}`,
    internal_user_id: null,
    stripe_charge_id: null,
    stripe_invoice_id: null,
    stripe_subscription_id: null,
    amount,
    amount_refunded: 0,
    currency: 'usd',
    status: 'succeeded',
    failure_message: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

function refund(app: string, id: string, paymentId: string, amount: number, overrides: Partial<LedgerRefund> = {}): LedgerRefund {
  return {
    application_id: app,
    livemode: false,
    stripe_refund_id: id,
    payment_id: paymentId,
    charge_id: null,
    amount,
    currency: 'usd',
    status: 'succeeded',
    reason: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

function subscription(app: string, id: string, overrides: Partial<LedgerSubscription> = {}): LedgerSubscription {
  return {
    application_id: app,
    livemode: false,
    stripe_subscription_id: id,
    stripe_customer_id: `cus_${id}`,
    internal_user_id: null,
    plan: 'pro',
    price_id: 'price_x',
    interval: 'month',
    status: 'active',
    amount: 2999,
    currency: 'usd',
    current_period_end: at,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

const usd = (report: ReturnType<typeof buildRevenueReport>) => report.totals.find((t) => t.currency === 'usd')!;

describe('billing ledger revenue report', () => {
  it('separates applications: 3 FlacronAI + 2 FlacronEnergy + 4 FlacronCV = 9 (section 11)', () => {
    const payments = [
      ...['a1', 'a2', 'a3'].map((id) => payment('flacron-ai', id, 1000)),
      ...['e1', 'e2'].map((id) => payment('flacron-energy', id, 1000)),
      ...['c1', 'c2', 'c3', 'c4'].map((id) => payment('flacron-cv', id, 1000)),
    ];
    const input = { payments, refunds: [], subscriptions: [] };

    expect(buildRevenueReport(input, 'all', false).successful_payments).toBe(9);
    expect(buildRevenueReport(input, 'flacron-ai', false).successful_payments).toBe(3);
    expect(buildRevenueReport(input, 'flacron-energy', false).successful_payments).toBe(2);
    expect(buildRevenueReport(input, 'flacron-cv', false).successful_payments).toBe(4);
  });

  it('reconciles revenue per application and combined (section 12)', () => {
    const payments = [
      payment('flacron-ai', 'a1', 2000),
      payment('flacron-ai', 'a2', 3000),
      payment('flacron-ai', 'a3', 5000),
      payment('flacron-energy', 'e1', 4000),
      payment('flacron-energy', 'e2', 6000),
    ];
    const input = { payments, refunds: [], subscriptions: [] };

    expect(usd(buildRevenueReport(input, 'flacron-ai', false)).gross_revenue).toBe(10000);
    expect(usd(buildRevenueReport(input, 'flacron-energy', false)).gross_revenue).toBe(10000);
    expect(usd(buildRevenueReport(input, 'all', false)).gross_revenue).toBe(20000);
  });

  it('nets a refund against its own application only (section 13)', () => {
    const input = {
      payments: [payment('flacron-cv', 'c1', 10000), payment('flacron-ai', 'a1', 10000)],
      refunds: [refund('flacron-cv', 're_1', 'c1', 3000)],
      subscriptions: [],
    };

    const cv = usd(buildRevenueReport(input, 'flacron-cv', false));
    expect(cv).toMatchObject({ gross_revenue: 10000, refunds: 3000, net_revenue: 7000 });

    const ai = usd(buildRevenueReport(input, 'flacron-ai', false));
    expect(ai).toMatchObject({ gross_revenue: 10000, refunds: 0, net_revenue: 10000 });
  });

  it('never counts failed, pending or incomplete payments as revenue (section 14)', () => {
    const input = {
      payments: [
        payment('flacron-cv', 'ok', 2999),
        payment('flacron-cv', 'declined', 2999, { status: 'failed', failure_message: 'Your card was declined.' }),
        payment('flacron-cv', 'pending', 2999, { status: 'pending' }),
        payment('flacron-cv', 'processing', 2999, { status: 'processing' }),
      ],
      refunds: [refund('flacron-cv', 're_pending', 'ok', 1000, { status: 'pending' })],
      subscriptions: [],
    };
    const report = buildRevenueReport(input, 'flacron-cv', false);
    expect(report.successful_payments).toBe(1);
    expect(report.failed_payments).toBe(1);
    expect(report.refund_count).toBe(0);
    expect(usd(report)).toMatchObject({ gross_revenue: 2999, refunds: 0, net_revenue: 2999 });
  });

  it('keeps sandbox and live rows apart', () => {
    const input = {
      payments: [payment('flacron-cv', 'test', 1000), payment('flacron-cv', 'live', 5000, { livemode: true })],
      refunds: [],
      subscriptions: [],
    };
    expect(usd(buildRevenueReport(input, 'flacron-cv', true)).gross_revenue).toBe(5000);
    expect(usd(buildRevenueReport(input, 'flacron-cv', false)).gross_revenue).toBe(1000);
  });

  it('reports subscriptions, MRR/ARR and customers for one application', () => {
    const input = {
      payments: [],
      refunds: [],
      subscriptions: [
        subscription('flacron-cv', 's1', { amount: 2999 }),
        subscription('flacron-cv', 's2', { interval: 'year', amount: 29999, status: 'past_due' }),
        subscription('flacron-cv', 's3', { status: 'trialing' }),
        subscription('flacron-cv', 's4', { status: 'canceled' }),
        subscription('flacron-ai', 'x1', { amount: 99999 }),
      ],
    };
    const report = buildRevenueReport(input, 'flacron-cv', false);
    expect(report).toMatchObject({
      active_subscriptions: 1,
      trialing_subscriptions: 1,
      past_due_subscriptions: 1,
      cancelled_subscriptions: 1,
      customer_count: 4,
    });
    // 2999 + 29999/12 — trials are not recurring revenue until they convert.
    expect(usd(report).mrr).toBe(Math.round(2999 + 29999 / 12));
    expect(usd(report).arr).toBe(usd(report).mrr * 12);
  });

  it('maps Stripe PaymentIntent statuses so only succeeded is money', () => {
    expect(ledgerPaymentStatus('succeeded')).toBe('succeeded');
    expect(ledgerPaymentStatus('requires_payment_method')).toBe('failed');
    expect(ledgerPaymentStatus('processing')).toBe('processing');
    expect(ledgerPaymentStatus('canceled')).toBe('canceled');
    expect(ledgerPaymentStatus('requires_action')).toBe('pending');
  });
});
