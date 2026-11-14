/**
 * Format a US-dollar amount for the visitor's locale ("$49.99", "49,99 $US").
 *
 * Plan prices are always charged in USD, so the currency is fixed; only the
 * presentation follows the locale. The symbol comes from Intl, never from the
 * surrounding copy: translated strings must not contain "$" themselves, or a
 * formatted amount reads "$$59.89". Digits stay Latin in every locale so a
 * price matches the Latin digits on the Stripe checkout it leads to.
 */
export function formatUsd(amount: number, locale: string): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat(`${locale}-u-nu-latn`, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unknown locale tag must not take the pricing table down.
    return `$${amount.toFixed(fractionDigits)}`;
  }
}
