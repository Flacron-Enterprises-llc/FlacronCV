import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { buildCatalogSnapshot, PaymentsConfig, ProviderSkus } from '@flacroncv/career-server';

/**
 * Payment settings from env. An unset variable means that provider is not
 * configured: its checkout returns `provider_unavailable` and its webhook
 * refuses every delivery, so the provider retries after it is set up.
 * Errors name the variable and the key, never a value.
 */
export function readPaymentsConfig(env: NodeJS.ProcessEnv): PaymentsConfig {
  const snapshot = buildCatalogSnapshot();
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  return {
    stripeWebhookSecret: secret.length > 0 ? secret : null,
    currentCatalogVersion: CATALOG_VERSION,
    stripeAppId: env.STRIPE_APP_ID?.trim() || undefined,
    skus: {
      stripe: ProviderSkus.parse('stripe', 'STRIPE_PRICES', env.STRIPE_PRICES, snapshot),
      apple: ProviderSkus.parse('apple', 'APPLE_PRODUCTS', env.APPLE_PRODUCTS, snapshot),
      google: ProviderSkus.parse('google', 'GOOGLE_PRODUCTS', env.GOOGLE_PRODUCTS, snapshot),
    },
  };
}
