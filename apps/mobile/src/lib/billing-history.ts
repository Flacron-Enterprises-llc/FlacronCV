import type { BillingInvoice } from '../types/subscription.types';

/**
 * Read-only billing history, formatted like the website's billing page
 * (apps/web/src/app/[locale]/(dashboard)/settings/billing/page.tsx). The
 * invoice/PDF links the API also returns are deliberately not used: store
 * rules forbid sending users to an external payment page from the app.
 */

export const BILLING_HISTORY_COPY = {
  title: 'Billing History',
  empty: 'No billing history yet',
  loadError: "Couldn't load your billing history.",
  retry: 'Try again',
  // Mobile-only: App Store / Google Play receipts are not Stripe invoices.
  storeNote: 'Purchases made through the App Store or Google Play are listed in your store account.',
} as const;

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  open: 'Open',
  void: 'Void',
  uncollectible: 'Uncollectible',
  draft: 'Draft',
};

export type InvoiceStatusVariant = 'success' | 'warning' | 'danger' | 'default';

const STATUS_VARIANT: Record<string, InvoiceStatusVariant> = {
  paid: 'success',
  open: 'warning',
  void: 'danger',
  uncollectible: 'danger',
  draft: 'default',
};

/** Website label; an unknown status is shown as sent. */
export function invoiceStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function invoiceStatusVariant(status: string): InvoiceStatusVariant {
  return STATUS_VARIANT[status] ?? 'default';
}

/** Amounts are in the smallest unit; the website shows amountPaid, else amountDue. */
export function invoiceAmount(invoice: Pick<BillingInvoice, 'amountPaid' | 'amountDue' | 'currency'>): string {
  const minor = invoice.amountPaid || invoice.amountDue;
  const currency = (invoice.currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** "Jan 5, 2026 · A1B2C3-0001" — the number is omitted when Stripe has none. */
export function invoiceSubtitle(
  invoice: Pick<BillingInvoice, 'created' | 'number'>,
  formatDate: (value: unknown) => string,
): string {
  const date = formatDate(invoice.created);
  return invoice.number ? `${date} · ${invoice.number}` : date;
}

/** Screen-reader sentence for one row. */
export function invoiceAccessibilityLabel(
  invoice: BillingInvoice,
  formatDate: (value: unknown) => string,
): string {
  const number = invoice.number ? `, invoice ${invoice.number}` : '';
  return `${invoiceAmount(invoice)}, ${formatDate(invoice.created)}${number}, ${invoiceStatusLabel(invoice.status)}`;
}
