/**
 * Live Stripe keys must not charge compiled PLAN_CONFIGS price ids.
 * Those fallbacks belong to the test account; a live secret with no env
 * override used to 500 checkout ("No such price").
 *
 * Detection is the `sk_live_` prefix only. Never log or return the key.
 */
export const LIVE_STRIPE_PRICE_ENV_KEYS = [
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_YEARLY_PRICE_ID',
  'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID',
  'STRIPE_ENTERPRISE_YEARLY_PRICE_ID',
] as const;

export function isLiveStripeSecretKey(secret: string | undefined | null): boolean {
  return (secret ?? '').trim().startsWith('sk_live_');
}

export function missingLiveStripePriceEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return LIVE_STRIPE_PRICE_ENV_KEYS.filter((key) => !(env[key] ?? '').trim());
}

/**
 * Boot gate. `sk_test_` (and missing key) leave compiled fallbacks in play.
 * A live key without all four env prices must not start the process.
 */
export function assertLiveStripePricesConfigured(
  secret: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!isLiveStripeSecretKey(secret)) return;
  const missing = missingLiveStripePriceEnv(env);
  if (missing.length === 0) return;
  throw new Error(
    'STRIPE_SECRET_KEY is live, so checkout cannot use the compiled PLAN_CONFIGS ' +
      'price ids (those belong to the test account). The API will not start until ' +
      'these env vars are set: ' +
      missing.join(', ') +
      '. Set all four — STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_YEARLY_PRICE_ID, ' +
      'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID, STRIPE_ENTERPRISE_YEARLY_PRICE_ID — to ' +
      'price ids from the same live Stripe account as the secret.',
  );
}
