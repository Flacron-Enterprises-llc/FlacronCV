import { forwardRef, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import Stripe from 'stripe';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { DEFAULT_APP_ID } from '../../config/stripe-app';
import { CallerContextInterceptor } from './caller-context';
import { CareerLedgerMeter } from './career-ledger-meter';
import { CareerTopUpCharger } from './career-top-up';
import { USAGE_METER, UsageMeter } from './usage-meter';
import { V1CounterMeter } from './v1-counter-meter';

/**
 * Picks the meter: the career ledger when `CAREER_API_URL` is configured on
 * this API (one pool across the CV builder and the career tools), V1's own
 * counters otherwise. Read once at boot.
 */
export function createUsageMeter(
  env: Record<string, string | undefined>,
  users: UsersService,
  topUp: CareerTopUpCharger | null,
): UsageMeter {
  const url = env.CAREER_API_URL?.trim();
  if (url) {
    if (!/^https?:\/\//.test(url)) throw new Error('CAREER_API_URL must be an http(s) URL');
    if (env.NODE_ENV === 'production' && !url.startsWith('https://')) {
      throw new Error('CAREER_API_URL must use https in production (ID tokens are forwarded)');
    }
    return new CareerLedgerMeter(url, topUp);
  }
  return new V1CounterMeter(users);
}

const meterProviders: Provider[] = [
  {
    provide: CareerTopUpCharger,
    inject: [ConfigService, FirebaseAdminService],
    useFactory: (config: ConfigService, firebase: FirebaseAdminService) => {
      const key = config.get<string>('stripe.secretKey');
      const stripe = key ? new Stripe(key, { apiVersion: '2024-04-10' as never }) : null;
      // Lazy: FirebaseAdminService initialises after this factory runs.
      return new CareerTopUpCharger(stripe, () => firebase.firestore as never, config.get<string>('stripe.appId') || DEFAULT_APP_ID);
    },
  },
  {
    provide: USAGE_METER,
    inject: [UsersService, CareerTopUpCharger],
    useFactory: (users: UsersService, topUp: CareerTopUpCharger) => createUsageMeter(process.env, users, topUp),
  },
  // Global: puts the caller's token in context for the career ledger meter.
  { provide: APP_INTERCEPTOR, useClass: CallerContextInterceptor },
];

@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: meterProviders,
  exports: [USAGE_METER],
})
export class CareerMeteringModule {}
