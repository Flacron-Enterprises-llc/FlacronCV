import type { Provider } from '@nestjs/common';
import {
  PaymentProviders,
  PaymentsConfig,
  PaymentsService,
  UnconfiguredAppleVerifier,
  UnconfiguredGooglePlayApi,
  UnconfiguredGooglePushVerifier,
  createStripeGateway,
  stripeSkusFromEnv,
} from '@flacroncv/career-server';
import { readPaymentsConfig } from '../config/payments';
import { DatabaseService } from '../database/database.service';

export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');
export const PAYMENTS_CONFIG = Symbol('PAYMENTS_CONFIG');

/**
 * Stripe binds when `STRIPE_SECRET_KEY` is a test secret. Live keys are
 * refused outside production. Apple and Google stay unconfigured.
 */
export const paymentsProviders: Provider[] = [
  {
    provide: PAYMENT_PROVIDERS,
    useFactory: (): PaymentProviders => ({
      stripe: createStripeGateway(process.env),
      apple: new UnconfiguredAppleVerifier(),
      googlePush: new UnconfiguredGooglePushVerifier(),
      googlePlay: new UnconfiguredGooglePlayApi(),
    }),
  },
  {
    provide: PAYMENTS_CONFIG,
    inject: [PAYMENT_PROVIDERS],
    useFactory: async (providers: PaymentProviders): Promise<PaymentsConfig> => {
      const base = readPaymentsConfig(process.env);
      const stripe = await stripeSkusFromEnv(process.env, providers.stripe);
      return { ...base, skus: { ...base.skus, stripe } };
    },
  },
  {
    provide: PaymentsService,
    inject: [DatabaseService, PAYMENT_PROVIDERS, PAYMENTS_CONFIG],
    useFactory: (database: DatabaseService, providers: PaymentProviders, config: PaymentsConfig) =>
      new PaymentsService(database.connectionPool, providers, config),
  },
];
