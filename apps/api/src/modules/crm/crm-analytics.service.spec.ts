import { CRMAnalyticsService } from './crm-analytics.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { CRMTransactionStatus, CRMCustomerStatus } from '@flacroncv/shared-types';

/**
 * The CRM dashboard STATES its active date range in the UI and writes it into
 * the CSV export. If the API ignored the range it would label all-time figures
 * as a filtered window — real numbers presented as something they are not.
 * These tests pin the filtering down.
 */

function makeService() {
  const firestore = new InMemoryFirestore();
  const service = new CRMAnalyticsService({ firestore } as any);
  return { service, firestore };
}

async function seed(firestore: InMemoryFirestore) {
  const customers = [
    { id: 'c1', createdAt: '2026-01-15T10:00:00.000Z', status: CRMCustomerStatus.ACTIVE },
    { id: 'c2', createdAt: '2026-06-10T10:00:00.000Z', status: CRMCustomerStatus.ACTIVE },
    { id: 'c3', createdAt: '2026-07-20T10:00:00.000Z', status: CRMCustomerStatus.ACTIVE },
  ];
  for (const c of customers) await firestore.collection('crm_customers').doc(c.id).set(c);

  const leads = [
    { id: 'l1', createdAt: '2026-01-05T10:00:00.000Z' },
    { id: 'l2', createdAt: '2026-07-01T10:00:00.000Z' },
  ];
  for (const l of leads) await firestore.collection('crm_leads').doc(l.id).set(l);

  const tx = [
    { id: 't1', date: '2026-01-20T10:00:00.000Z', amount: 100, status: CRMTransactionStatus.COMPLETED },
    { id: 't2', date: '2026-06-15T10:00:00.000Z', amount: 200, status: CRMTransactionStatus.COMPLETED },
    // Deliberately ON the boundary day, late in the day: an inclusive `to`
    // must still count it. This is the classic off-by-one in range filters.
    { id: 't3', date: '2026-07-31T22:30:00.000Z', amount: 400, status: CRMTransactionStatus.COMPLETED },
  ];
  for (const t of tx) await firestore.collection('crm_transactions').doc(t.id).set(t);
}

describe('CRMAnalyticsService date-range filtering', () => {
  it('returns everything when no range is given (unchanged default)', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const overview = await service.getOverview();

    expect(overview.totalCustomers).toBe(3);
    expect(overview.totalLeads).toBe(2);
    expect(overview.totalRevenue).toBe(700);
  });

  it('restricts every figure to the window', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const overview = await service.getOverview({ from: '2026-06-01', to: '2026-06-30' });

    expect(overview.totalCustomers).toBe(1); // only c2
    expect(overview.totalLeads).toBe(0);
    expect(overview.totalRevenue).toBe(200); // only t2
  });

  it('includes activity ON the closing date (inclusive `to`)', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    // t3 is at 22:30 on the 31st. A naive `new Date('2026-07-31')` bound would
    // stop at that day's midnight and silently drop it.
    const overview = await service.getOverview({ from: '2026-07-01', to: '2026-07-31' });

    expect(overview.totalRevenue).toBe(400);
    expect(overview.totalCustomers).toBe(1); // c3
  });

  it('supports an open-ended `from`', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const overview = await service.getOverview({ from: '2026-06-01' });
    expect(overview.totalRevenue).toBe(600); // t2 + t3
  });

  it('supports an open-ended `to`', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const overview = await service.getOverview({ to: '2026-01-31' });
    expect(overview.totalRevenue).toBe(100); // t1 only
  });

  it('returns zeroes — not everything — for a window with no activity', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const overview = await service.getOverview({ from: '2025-01-01', to: '2025-12-31' });

    expect(overview.totalCustomers).toBe(0);
    expect(overview.totalRevenue).toBe(0);
    // Must not divide by zero when deriving per-customer averages.
    expect(Number.isFinite(overview.avgRevenuePerCustomer)).toBe(true);
  });

  it('filters the revenue chart too', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const all = await service.getRevenueChart();
    const windowed = await service.getRevenueChart({ from: '2026-06-01', to: '2026-06-30' });

    expect(all.reduce((s, p) => s + p.revenue, 0)).toBeGreaterThan(
      windowed.reduce((s, p) => s + p.revenue, 0),
    );
    expect(windowed.reduce((s, p) => s + p.transactions, 0)).toBe(1);
  });

  it('caps the revenue chart so a decade-wide range cannot render hundreds of columns', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const points = await service.getRevenueChart({ from: '2000-01-01', to: '2026-12-31' });
    expect(points.length).toBeLessThanOrEqual(36);
  });

  it('filters the customer-growth chart too', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    const windowed = await service.getCustomerGrowthChart({ from: '2026-06-01', to: '2026-06-30' });
    const totalCustomers = windowed.reduce((s, p) => s + (p.customers ?? 0), 0);
    expect(totalCustomers).toBeLessThanOrEqual(1);
  });

  it('treats an unparseable date as no bound rather than filtering everything out', async () => {
    const { service, firestore } = makeService();
    await seed(firestore);

    // The DTO rejects malformed input at the edge, but the service must still
    // degrade to "all time" rather than rendering an empty dashboard that
    // looks like the business has no customers.
    const overview = await service.getOverview({ from: 'not-a-date' } as any);
    expect(overview.totalCustomers).toBe(3);
  });
});

/**
 * The fixtures above seed ISO **strings**, but real Firestore never returns
 * those for a date field — firebase-admin hands back a `Timestamp` object.
 * `new Date(timestamp)` yields an Invalid Date, so the range check rejected
 * every record and every filtered figure on the CRM dashboard silently read
 * zero. Nothing threw; the numbers were simply wrong, which is why the
 * string-based fixtures never caught it.
 *
 * These tests seed the shape production actually stores.
 */
describe('CRMAnalyticsService with Firestore Timestamp values', () => {
  /**
   * A real Timestamp, not the in-memory double.
   *
   * `InMemoryFirestore` round-trips every document through
   * `JSON.parse(JSON.stringify(...))` on both write and read, so a `toDate`
   * method cannot survive it — the store literally cannot represent the type
   * production returns. That is precisely why the existing string-based
   * fixtures never caught this, so these tests use a hand-rolled firestore stub
   * that hands back the object shape firebase-admin actually produces.
   */
  const ts = (iso: string) => ({
    toDate: () => new Date(iso),
    seconds: Math.floor(new Date(iso).getTime() / 1000),
    nanoseconds: 0,
  });

  const stubFirestore = (data: Record<string, unknown[]>) => ({
    collection: (name: string) => ({
      get: async () => ({ docs: (data[name] ?? []).map((d) => ({ data: () => d })) }),
    }),
  });

  const CUSTOMERS = [
    { id: 'c1', createdAt: ts('2026-01-15T10:00:00.000Z'), status: CRMCustomerStatus.ACTIVE },
    { id: 'c2', createdAt: ts('2026-06-10T10:00:00.000Z'), status: CRMCustomerStatus.ACTIVE },
  ];
  const TRANSACTIONS = [
    { id: 't1', date: ts('2026-01-20T10:00:00.000Z'), amount: 100, status: CRMTransactionStatus.COMPLETED },
    { id: 't2', date: ts('2026-06-15T10:00:00.000Z'), amount: 200, status: CRMTransactionStatus.COMPLETED },
  ];

  const serviceWith = (customers: unknown[], transactions: unknown[]) =>
    new CRMAnalyticsService({
      firestore: stubFirestore({
        crm_customers: customers,
        crm_leads: [],
        crm_transactions: transactions,
      }),
    } as any);

  it('filters Timestamp-valued records instead of discarding all of them', async () => {
    const service = serviceWith(CUSTOMERS, TRANSACTIONS);

    const overview = await service.getOverview({ from: '2026-06-01', to: '2026-06-30' });

    // Before the fix both of these were 0 — the window matched nothing at all,
    // and the dashboard reported no customers and no revenue without erroring.
    expect(overview.totalCustomers).toBe(1);
    expect(overview.totalRevenue).toBe(200);
  });

  it('still returns everything when no range is given', async () => {
    const service = serviceWith(CUSTOMERS, TRANSACTIONS);

    const overview = await service.getOverview();

    expect(overview.totalCustomers).toBe(2);
    expect(overview.totalRevenue).toBe(300);
  });

  it('also understands a Timestamp that has been through JSON (toDate lost)', async () => {
    const plain = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000), nanoseconds: 0 });
    const service = serviceWith(
      [{ id: 'c2', createdAt: plain('2026-06-10T10:00:00.000Z'), status: CRMCustomerStatus.ACTIVE }],
      [{ id: 't2', date: plain('2026-06-15T10:00:00.000Z'), amount: 200, status: CRMTransactionStatus.COMPLETED }],
    );

    const overview = await service.getOverview({ from: '2026-06-01', to: '2026-06-30' });

    expect(overview.totalCustomers).toBe(1);
    expect(overview.totalRevenue).toBe(200);
  });
});
