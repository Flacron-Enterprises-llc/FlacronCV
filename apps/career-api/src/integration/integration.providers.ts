import type { Provider } from '@nestjs/common';
import type { V1AccountSource } from '@flacroncv/career-server';
import { ACCESS_CLOCK, CAREER_PLAN_MAP, CareerAccessService, careerPlanMapFromEnv, V1_ACCOUNT_SOURCE } from './career-access.service';
import { createV1AccountSource } from './v1-account.source';

/** The V1 bridge. Tests override `V1_ACCOUNT_SOURCE` and `CAREER_PLAN_MAP` with fixtures. */
export const integrationProviders: Provider[] = [
  { provide: V1_ACCOUNT_SOURCE, useFactory: (): V1AccountSource => createV1AccountSource(process.env) },
  { provide: CAREER_PLAN_MAP, useFactory: () => careerPlanMapFromEnv(process.env) },
  { provide: ACCESS_CLOCK, useValue: { now: () => new Date() } },
  CareerAccessService,
];
