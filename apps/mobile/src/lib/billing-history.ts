import { formatCurrency, hasKey, t } from '../i18n';
import type { BillingInvoice } from '../types/subscription.types';

/**
 * Read-only billing history, formatted like the website's billing page
 * (apps/web/src/app/[locale]/(dashboard)/settings/billing/page.tsx). The
 * invoice/PDF links the API also returns are deliberately not used: store
 * rules forbid sending users to an external payment page from the app.
 *
 * Copy lives in the `settings` namespace (`settings.billing.history.*`); the
 * screen reads it with useT, these helpers with `t()` in the current locale.
 */

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
  const key = `settings.billing.history.status.${status}`;
  return hasKey(key) ? t(key) : status;
}

export function invoiceStatusVariant(status: string): InvoiceStatusVariant {
  return STATUS_VARIANT[status] ?? 'default';
}

/** Amounts are in the smallest unit; the website shows amountPaid, else amountDue. */
export function invoiceAmount(invoice: Pick<BillingInvoice, 'amountPaid' | 'amountDue' | 'currency'>): string {
  const minor = invoice.amountPaid || invoice.amountDue;
  return formatCurrency(minor / 100, invoice.currency || 'usd');
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
  const number = invoice.number ? t('settings.billing.history.invoiceNumber', { number: invoice.number }) : null;
  return [invoiceAmount(invoice), formatDate(invoice.created), number, invoiceStatusLabel(invoice.status)]
    .filter(Boolean)
    .join(', ');
}
