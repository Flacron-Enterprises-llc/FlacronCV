import type Stripe from 'stripe';

/**
 * FlacronCV sells in USD: the catalog, the website prices, the confirmed
 * amount checks (`expectedAmountCents`) and the revenue ledger are all USD.
 *
 * The shared Stripe account has Adaptive Pricing switched on, so without this
 * a visitor in another country sees and pays a converted local amount (found
 * in a real test-mode Checkout: Starter shown as PKR 6,329.39 instead of
 * USD 21.99). Disabling it PER SESSION keeps FlacronCV's checkout in the
 * advertised USD price without touching the account-wide setting other
 * applications may rely on.
 *
 * `adaptive_pricing` is not in this SDK version's types; Stripe accepts it.
 */
export const USD_ONLY_CHECKOUT = {
  adaptive_pricing: { enabled: false },
} as unknown as Partial<Stripe.Checkout.SessionCreateParams>;
