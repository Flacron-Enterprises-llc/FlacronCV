import { buildRevenueReport, LedgerDispute, LedgerPayment, LedgerRefund, LedgerSubscription, ledgerPaymentStatus } from './billing-ledger';
import { BillingLedgerService } from './billing-ledger.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

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

function dispute(app: string, id: string, amount: number, status: string, overrides: Partial<LedgerDispute> = {}): LedgerDispute {
  return {
    application_id: app,
    livemode: false,
    stripe_dispute_id: id,
    charge_id: `ch_${id}`,
    payment_id: null,
    amount,
    currency: 'usd',
    status,
    reason: 'fraudulent',
    created_at: at,
    status_updated_at: at,
    updated_at: at,
    ...overrides,
  };
}

const cur = (report: ReturnType<typeof buildRevenueReport>, currency: string) => report.totals.find((t) => t.currency === currency);
const appTotals = (report: ReturnType<typeof buildRevenueReport>, app: string, currency = 'usd') =>
  report.by_application.find((a) => a.application_id === app)?.totals.find((t) => t.currency === currency);

describe('multi-application reporting (isolated fixtures: A=3, B=2, C=4)', () => {
  const A = 'flacron-ai';
  const B = 'flacron-energy';
  const C = 'flacron-cv';
  const fixture = () => ({
    payments: [
      payment(A, 'a1', 1000),
      payment(A, 'a2', 2000),
      payment(A, 'a3', 3000),
      payment(B, 'b1', 4000),
      payment(B, 'b2', 5000, { currency: 'eur' }),
      payment(C, 'c1', 100),
      payment(C, 'c2', 200),
      payment(C, 'c3', 300),
      payment(C, 'c4', 400),
      // Never revenue: failed / pending, in every app.
      payment(A, 'a_fail', 9999, { status: 'failed' }),
      payment(C, 'c_pending', 9999, { status: 'pending' }),
    ],
    refunds: [refund(A, 're_a1', 'a1', 500)],
    subscriptions: [],
  });

  it('filtering by application_id returns exactly that application\'s payments; company-wide is their sum', () => {
    const input = fixture();
    expect(buildRevenueReport(input, A, false).successful_payments).toBe(3);
    expect(buildRevenueReport(input, B, false).successful_payments).toBe(2);
    expect(buildRevenueReport(input, C, false).successful_payments).toBe(4);
    const all = buildRevenueReport(input, 'all', false);
    expect(all.successful_payments).toBe(9);
    expect(cur(all, 'usd')!.gross_revenue).toBe(6000 + 4000 + 1000);
    expect(cur(buildRevenueReport(input, C, false), 'usd')!.gross_revenue).toBe(1000);
    // The company-wide report also splits per application.
    expect(appTotals(all, A)!.gross_revenue).toBe(6000);
    expect(appTotals(all, B)!.gross_revenue).toBe(4000);
    expect(appTotals(all, C)!.gross_revenue).toBe(1000);
  });

  it('keeps currencies apart: the EUR payment is never summed into USD', () => {
    const all = buildRevenueReport(fixture(), 'all', false);
    expect(all.totals.map((t) => t.currency)).toEqual(['eur', 'usd']);
    expect(cur(all, 'eur')!.gross_revenue).toBe(5000);
    expect(cur(all, 'usd')!.gross_revenue).toBe(11000);
    const b = buildRevenueReport(fixture(), B, false);
    expect(b.totals).toEqual([expect.objectContaining({ currency: 'eur', gross_revenue: 5000 }), expect.objectContaining({ currency: 'usd', gross_revenue: 4000 })]);
  });

  it('excludes failed payments from gross and counts a duplicated row once', () => {
    const input = fixture();
    input.payments.push(payment(C, 'c1', 100), payment(C, 'c2', 200)); // the same Stripe ids again
    const c = buildRevenueReport(input, C, false);
    expect(c.successful_payments).toBe(4);
    expect(cur(c, 'usd')!.gross_revenue).toBe(1000);
    const a = buildRevenueReport(input, A, false);
    expect(a.failed_payments).toBe(1);
    expect(cur(a, 'usd')!.gross_revenue).toBe(6000);
  });

  it('applies a refund only to its own application\'s totals', () => {
    const all = buildRevenueReport(fixture(), 'all', false);
    expect(appTotals(all, A)).toMatchObject({ refunds: 500, net_after_refunds: 5500 });
    expect(appTotals(all, B)).toMatchObject({ refunds: 0, net_after_refunds: 4000 });
    expect(appTotals(all, C)).toMatchObject({ refunds: 0, net_after_refunds: 1000 });
    expect(cur(buildRevenueReport(fixture(), C, false), 'usd')!.refunds).toBe(0);
  });
});

describe('net after refunds is not net proceeds', () => {
  it('$100 payment + $30 refund: gross 100.00, refunds 30.00, net_after_refunds 70.00; Stripe fees are not included', () => {
    const report = buildRevenueReport(
      { payments: [payment('flacron-cv', 'p100', 10000)], refunds: [refund('flacron-cv', 're_30', 'p100', 3000)], subscriptions: [] },
      'flacron-cv',
      false,
    );
    expect(usd(report)).toMatchObject({ gross_revenue: 10000, refunds: 3000, net_after_refunds: 7000, net_revenue: 7000 });
    // Fees are not in this ledger, so this is NOT what Stripe pays out — the report says so.
    expect(report.fees_included).toBe(false);
    expect(report.basis).toMatch(/fees are NOT included/i);
    expect(report.basis).toMatch(/not net proceeds/i);
  });
});

describe('disputes in the revenue report', () => {
  const input = () => ({
    payments: [payment('flacron-cv', 'c1', 10000), payment('flacron-cv', 'c2', 5000, { currency: 'eur' }), payment('flacron-ai', 'a1', 10000)],
    refunds: [refund('flacron-cv', 're_1', 'c1', 1000)],
    subscriptions: [],
    disputes: [
      dispute('flacron-cv', 'dp_open', 2000, 'needs_response'),
      dispute('flacron-cv', 'dp_won', 3000, 'won'),
      dispute('flacron-cv', 'dp_lost', 4000, 'lost'),
      dispute('flacron-cv', 'dp_eur', 5000, 'lost', { currency: 'eur' }),
      dispute('flacron-ai', 'dp_ai', 10000, 'lost'),
    ],
  });

  it('reports disputed and lost amounts per currency, nets only LOST disputes, and leaves gross unchanged', () => {
    const cv = buildRevenueReport(input(), 'flacron-cv', false);
    expect(usd(cv)).toMatchObject({
      gross_revenue: 10000,
      refunds: 1000,
      net_after_refunds: 9000,
      disputed: 9000,
      disputes_open: 2000,
      disputes_lost: 4000,
      net_revenue: 5000,
    });
    expect(cur(cv, 'eur')).toMatchObject({ gross_revenue: 5000, disputed: 5000, disputes_lost: 5000, net_revenue: 0 });
    expect(cv).toMatchObject({ dispute_count: 4, disputes_lost_count: 2, disputes_open_count: 1 });
  });

  it('keeps disputes per application: another app\'s lost dispute never moves FlacronCV', () => {
    const ai = buildRevenueReport(input(), 'flacron-ai', false);
    expect(usd(ai)).toMatchObject({ gross_revenue: 10000, disputes_lost: 10000, net_revenue: 0 });
    const all = buildRevenueReport(input(), 'all', false);
    expect(appTotals(all, 'flacron-cv')).toMatchObject({ disputes_lost: 4000, net_revenue: 5000 });
    expect(appTotals(all, 'flacron-ai')).toMatchObject({ disputes_lost: 10000, net_revenue: 0 });
    expect(usd(all)).toMatchObject({ gross_revenue: 20000, disputes_lost: 14000, net_revenue: 5000 });
  });

  it('a report without disputes is unchanged (net_revenue = net_after_refunds)', () => {
    const r = buildRevenueReport({ payments: [payment('flacron-cv', 'c1', 100)], refunds: [], subscriptions: [] }, 'flacron-cv', false);
    expect(usd(r)).toMatchObject({ disputed: 0, disputes_lost: 0, net_after_refunds: 100, net_revenue: 100 });
  });
});

describe('BillingLedgerService (in-memory Firestore)', () => {
  let firestore: InMemoryFirestore;
  let ledger: BillingLedgerService;
  const base = { id: 'dp_1', chargeId: 'ch_1', paymentIntentId: 'pi_1', amount: 2999, currency: 'USD', reason: 'fraudulent', created: 1_800_000_000, applicationId: 'flacron-cv', livemode: false };

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    ledger = new BillingLedgerService({ firestore } as any);
  });

  describe('recordDispute', () => {
    it('upserts one row per dispute id with application_id, livemode and the dispute\'s own created time', async () => {
      await ledger.recordDispute({ ...base, status: 'needs_response' });
      await ledger.recordDispute({ ...base, status: 'needs_response' });
      const rows = (await firestore.collection('billing_disputes').get()).docs.map((d) => d.data() as any);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ stripe_dispute_id: 'dp_1', application_id: 'flacron-cv', livemode: false, amount: 2999, currency: 'usd', status: 'needs_response', payment_id: 'pi_1', charge_id: 'ch_1' });
      expect(new Date(rows[0].created_at).getTime()).toBe(1_800_000_000_000);
    });

    it('moves forward through the lifecycle, never backwards, and a final status never flips', async () => {
      await ledger.recordDispute({ ...base, status: 'needs_response' });
      const first = await ledger.getDispute('dp_1');
      await ledger.recordDispute({ ...base, status: 'lost' });
      await ledger.recordDispute({ ...base, status: 'under_review' }); // late, older event
      await ledger.recordDispute({ ...base, status: 'won' }); // conflicting final status
      const row = (await ledger.getDispute('dp_1')) as any;
      expect(row.status).toBe('lost');
      expect(row.created_at).toEqual(first!.created_at);
      expect(new Date(row.status_updated_at).getTime()).toBeGreaterThanOrEqual(new Date(first!.status_updated_at as any).getTime());
    });

    it('accepts a later step after an earlier one arrives first (out of order the other way)', async () => {
      await ledger.recordDispute({ ...base, status: 'under_review' });
      await ledger.recordDispute({ ...base, status: 'won' });
      expect((await ledger.getDispute('dp_1'))!.status).toBe('won');
    });

    it('refuses a dispute without application_id, like every ledger row', async () => {
      await expect(ledger.recordDispute({ ...base, status: 'needs_response', applicationId: '' })).rejects.toThrow(/without application_id/);
      expect((await firestore.collection('billing_disputes').get()).docs).toHaveLength(0);
    });

    it('feeds the revenue report through the service', async () => {
      await ledger.recordPaymentIntent({ paymentIntentId: 'pi_1', applicationId: 'flacron-cv', livemode: false, amount: 2999, currency: 'usd', stripeStatus: 'succeeded', customerId: 'cus_1', internalUserId: 'u1', chargeId: 'ch_1' });
      await ledger.recordDispute({ ...base, status: 'lost' });
      const report = await ledger.revenueReport('flacron-cv', false);
      expect(usd(report)).toMatchObject({ gross_revenue: 2999, disputes_lost: 2999, net_revenue: 0 });
    });
  });

  describe('recordPaymentIntent', () => {
    it('is idempotent per PaymentIntent and preserves a refund the refund path already recorded', async () => {
      const input = { paymentIntentId: 'pi_1', applicationId: 'flacron-cv', livemode: false, amount: 499, currency: 'USD', stripeStatus: 'succeeded', customerId: 'cus_1', internalUserId: 'u1', chargeId: 'ch_1' };
      await ledger.recordPaymentIntent(input);
      const existing = (await ledger.getPayment('pi_1'))!;
      await ledger.upsertPayment({ ...existing, amount_refunded: 499 });
      await ledger.recordPaymentIntent(input);
      const rows = (await firestore.collection('billing_payments').get()).docs.map((d) => d.data() as any);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ amount: 499, amount_refunded: 499, currency: 'usd', status: 'succeeded', application_id: 'flacron-cv' });
    });

    it('refuses a payment without application_id', async () => {
      await expect(
        ledger.recordPaymentIntent({ paymentIntentId: 'pi_x', applicationId: '', livemode: false, amount: 1, currency: 'usd', stripeStatus: 'succeeded', customerId: null, internalUserId: null, chargeId: null }),
      ).rejects.toThrow(/without application_id/);
    });
  });

  describe('claimEvent stale takeover', () => {
    const evt = { id: 'evt_1', type: 'invoice.paid', livemode: false };

    it('claims, then reports in-progress and duplicate', async () => {
      expect(await ledger.claimEvent(evt)).toBe('claimed');
      expect(await ledger.claimEvent(evt)).toBe('in_progress');
      await ledger.completeEvent('evt_1', 'applied', { applicationId: 'flacron-cv', expectedApplicationId: 'flacron-cv' });
      expect(await ledger.claimEvent(evt)).toBe('duplicate');
    });

    it('two concurrent retries finding the same stale claim: exactly one takes it over (transaction)', async () => {
      await firestore.collection('payment_events').doc('evt_1').set({ status: 'processing', claimedAt: new Date(Date.now() - 60 * 60 * 1000) });
      const results = await Promise.all([ledger.claimEvent(evt), ledger.claimEvent(evt), ledger.claimEvent(evt)]);
      expect(results.filter((r) => r === 'claimed')).toHaveLength(1);
      expect(results.filter((r) => r === 'in_progress')).toHaveLength(2);
      const row = (await firestore.collection('payment_events').doc('evt_1').get()).data() as any;
      expect(Date.now() - new Date(row.claimedAt).getTime()).toBeLessThan(60 * 1000);
    });

    it('a fresh claim held by another delivery is never taken over', async () => {
      await firestore.collection('payment_events').doc('evt_1').set({ status: 'processing', claimedAt: new Date() });
      expect(await ledger.claimEvent(evt)).toBe('in_progress');
    });
  });
});
