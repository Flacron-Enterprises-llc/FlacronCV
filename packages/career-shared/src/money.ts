/**
 * The only display formatter for catalog cents and whole counts.
 * Cents stay integers here. `monthlyEquivalentCents` is the half-up step.
 */

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Free is "$0". Every other amount is grouped, such as "$2,080.00". */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  if (abs === 0) return '$0';
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${grouped.format(dollars)}.${rem.toString().padStart(2, '0')}`;
}

/** Whole counts, such as 2000 → "2,000". */
export function formatCount(value: number): string {
  return grouped.format(value);
}

/** Spec section 10B: round only display equivalents. Positive half rounds up. */
export function monthlyEquivalentCents(annualCents: number): number {
  return Math.round(annualCents / 12);
}
