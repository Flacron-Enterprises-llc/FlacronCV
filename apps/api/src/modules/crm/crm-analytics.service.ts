import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import {
  CRMAnalyticsOverview,
  CRMRevenueDataPoint,
  CRMCustomerGrowthDataPoint,
  CRMCustomer,
  CRMLead,
  CRMTransaction,
  CRMCustomerStatus,
  CRMTransactionStatus,
} from '@flacroncv/shared-types';

/** Optional inclusive reporting window, as `YYYY-MM-DD` calendar dates. */
export interface AnalyticsRange {
  from?: string;
  to?: string;
}

/**
 * Resolve a range into concrete instants, or nulls for "unbounded".
 *
 * `from` is the start of that day and `to` the END of it (23:59:59.999) so the
 * window is inclusive of both calendar dates — picking "1 Jul to 31 Jul" must
 * include everything that happened on 31 July, not stop at its midnight.
 *
 * Bounds are interpreted in **UTC**, deliberately. The stored timestamps are
 * UTC, and a report must not change its answer depending on which server
 * happens to run it — with local-time bounds, the same "July" query returned
 * different revenue on a UTC+5 host than on a UTC one, because a transaction at
 * 22:30Z on the 31st falls on 1 August locally. (A unit test caught exactly
 * that.) Note this is the opposite choice from the CLIENT-side `toDate()`,
 * where a date the user typed into a form does mean their own calendar day.
 */
function resolveRange(range?: AnalyticsRange): { from: Date | null; to: Date | null } {
  const parse = (value: string | undefined, endOfDay: boolean): Date | null => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    const ms = endOfDay
      ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
      : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  return { from: parse(range?.from, false), to: parse(range?.to, true) };
}

/**
 * Coerce whatever Firestore handed back into a Date.
 *
 * Date fields come out of firebase-admin as `Timestamp` objects, not strings.
 * `new Date(timestamp)` on one of those produces an Invalid Date, which is why
 * every ranged figure on the CRM dashboard silently reported zero the moment a
 * date filter was applied — `inRange` rejected every single record rather than
 * erroring, so the numbers looked plausible and simply were not.
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Firestore Timestamp — duck-typed so this does not need the Firestore import.
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const d = (value as { toDate(): Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // A Timestamp that has been through JSON (an export, a cache, a test double)
  // keeps its fields but loses `toDate`. Reconstruct from seconds rather than
  // silently treating it as out-of-range.
  if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    const d = new Date((value as { seconds: number }).seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** True when `value` falls inside the (possibly open-ended) window. */
function inRange(value: unknown, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  const d = toDate(value);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

@Injectable()
export class CRMAnalyticsService {
  constructor(private firebase: FirebaseAdminService) {}

  /**
   * @param range optional reporting window. Omitted → all time, i.e. exactly
   *              the previous behaviour, so the default dashboard is unchanged.
   */
  async getOverview(range?: AnalyticsRange): Promise<CRMAnalyticsOverview> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [customersSnap, leadsSnap, transactionsSnap] = await Promise.all([
      this.firebase.firestore.collection('crm_customers').get(),
      this.firebase.firestore.collection('crm_leads').get(),
      this.firebase.firestore.collection('crm_transactions').get(),
    ]);

    // Apply the reporting window to each collection on its own natural date
    // field before any figure is derived, so every number on the dashboard
    // describes the same period the UI claims it does.
    const { from, to } = resolveRange(range);

    const customers: CRMCustomer[] = customersSnap.docs
      .map((d: any) => d.data() as CRMCustomer)
      .filter((c: CRMCustomer) => inRange(c.createdAt, from, to));
    const leads: CRMLead[] = leadsSnap.docs
      .map((d: any) => d.data() as CRMLead)
      .filter((l: CRMLead) => inRange(l.createdAt, from, to));
    const transactions: CRMTransaction[] = transactionsSnap.docs
      .map((d: any) => d.data() as CRMTransaction)
      .filter((t: CRMTransaction) => inRange(t.date, from, to));
    const completedTx: CRMTransaction[] = transactions.filter((t: CRMTransaction) => t.status === CRMTransactionStatus.COMPLETED);

    const totalCustomers = customers.length;
    const activeCustomers = customers.filter((c: CRMCustomer) => c.status === CRMCustomerStatus.ACTIVE).length;

    const newCustomersThisMonth = customers.filter(
      (c: CRMCustomer) => new Date(c.createdAt) >= startOfMonth,
    ).length;

    const newCustomersLastMonth = customers.filter((c: CRMCustomer) => {
      const d = new Date(c.createdAt);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }).length;

    const totalRevenue = completedTx.reduce((s: number, t: CRMTransaction) => s + t.amount, 0);

    const monthlyRevenue = completedTx
      .filter((t: CRMTransaction) => new Date(t.date) >= startOfMonth)
      .reduce((s: number, t: CRMTransaction) => s + t.amount, 0);

    const lastMonthRevenue = completedTx
      .filter((t: CRMTransaction) => {
        const d = new Date(t.date);
        return d >= startOfLastMonth && d <= endOfLastMonth;
      })
      .reduce((s: number, t: CRMTransaction) => s + t.amount, 0);

    const totalLeads = leads.length;
    const newLeadsThisMonth = leads.filter((l: CRMLead) => new Date(l.createdAt) >= startOfMonth).length;
    const newLeadsLastMonth = leads.filter((l: CRMLead) => {
      const d = new Date(l.createdAt);
      return d >= startOfLastMonth && d <= endOfLastMonth;
    }).length;

    const conversionRate =
      totalLeads + totalCustomers > 0
        ? (totalCustomers / (totalLeads + totalCustomers)) * 100
        : 0;

    const avgRevenuePerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 10) / 10;
    };

    return {
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      totalLeads,
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgRevenuePerCustomer: Math.round(avgRevenuePerCustomer * 100) / 100,
      thisMonthVsLastMonth: {
        customers: pctChange(newCustomersThisMonth, newCustomersLastMonth),
        revenue: pctChange(monthlyRevenue, lastMonthRevenue),
        leads: pctChange(newLeadsThisMonth, newLeadsLastMonth),
      },
    };
  }

  async getRevenueChart(range?: AnalyticsRange): Promise<CRMRevenueDataPoint[]> {
    const snapshot = await this.firebase.firestore
      .collection('crm_transactions')
      .where('status', '==', CRMTransactionStatus.COMPLETED)
      .get();

    const { from, to } = resolveRange(range);
    const transactions: CRMTransaction[] = snapshot.docs
      .map((d: any) => d.data() as CRMTransaction)
      .filter((t: CRMTransaction) => inRange(t.date, from, to));

    // Group by YYYY-MM
    const byMonth = new Map<string, { revenue: number; transactions: number; label: string }>();

    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });

      if (!byMonth.has(key)) byMonth.set(key, { revenue: 0, transactions: 0, label });
      const entry = byMonth.get(key)!;
      entry.revenue += t.amount;
      entry.transactions += 1;
    }

    // Which months to plot. Default is the trailing 12; with an explicit
    // window, plot exactly the months it spans (capped, so a decade-wide range
    // cannot render hundreds of columns).
    const result: CRMRevenueDataPoint[] = [];
    const now = new Date();
    const MAX_MONTHS = 36;

    let anchor = now;
    let months = 12;
    if (from || to) {
      const start = from ?? new Date(Math.min(...transactions.map((t) => new Date(t.date).getTime()), now.getTime()));
      const end = to ?? now;
      anchor = end;
      months = Math.min(
        MAX_MONTHS,
        Math.max(
          1,
          (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1,
        ),
      );
    }

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const entry = byMonth.get(key) ?? { revenue: 0, transactions: 0, label };
      result.push({ month: entry.label, revenue: Math.round(entry.revenue * 100) / 100, transactions: entry.transactions });
    }

    return result;
  }

  async getCustomerGrowthChart(range?: AnalyticsRange): Promise<CRMCustomerGrowthDataPoint[]> {
    const [customersSnap, leadsSnap] = await Promise.all([
      this.firebase.firestore.collection('crm_customers').get(),
      this.firebase.firestore.collection('crm_leads').get(),
    ]);

    const { from, to } = resolveRange(range);
    const customers: CRMCustomer[] = customersSnap.docs
      .map((d: any) => d.data() as CRMCustomer)
      .filter((c: CRMCustomer) => inRange(c.createdAt, from, to));
    const leads: CRMLead[] = leadsSnap.docs
      .map((d: any) => d.data() as CRMLead)
      .filter((l: CRMLead) => inRange(l.createdAt, from, to));

    const byMonth = new Map<string, { customers: number; leads: number; label: string }>();
    const now = new Date();

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      byMonth.set(key, { customers: 0, leads: 0, label });
    }

    for (const c of customers) {
      const d = new Date(c.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) byMonth.get(key)!.customers += 1;
    }

    for (const l of leads) {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) byMonth.get(key)!.leads += 1;
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.label, customers: v.customers, leads: v.leads }));
  }
}
