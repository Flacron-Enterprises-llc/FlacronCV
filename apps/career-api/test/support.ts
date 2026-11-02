import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { BillingService, RecordingSignInDeleter } from '@flacroncv/career-server';
import type { CareerAccess, CareerPlanMap, V1AccountSnapshot } from '@flacroncv/career-server';
import { createTestDatabase, FakeIdTokenVerifier } from '@flacroncv/career-server/src/testing';
import type { TestDatabase } from '@flacroncv/career-server/src/testing';
import { AppModule } from '../src/app.module';
import { ID_TOKEN_VERIFIER } from '../src/auth/auth.providers';
import { APP_OPTIONS, configureApp } from '../src/configure-app';
import { SIGN_IN_DELETER } from '../src/privacy/privacy.controller';
import { ACCESS_CLOCK, CAREER_PLAN_MAP, CareerAccessService, V1_ACCOUNT_SOURCE } from '../src/integration/career-access.service';
import { StaticV1AccountSource } from '../src/integration/v1-account.source';

export interface TestApp {
  app: NestExpressApplication;
  db: TestDatabase;
  billing: BillingService;
  tokens: FakeIdTokenVerifier;
  /** Sign-ins that account deletion removed. Nothing leaves the process. */
  signIns: RecordingSignInDeleter;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Test-only controllers mounted beside the real ones. */
  controllers?: Type<unknown>[];
  /** More provider overrides. */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /**
   * The real V1 bridge with fixture V1 accounts and a fixture plan map.
   * Without it the app uses `PassthroughCareerAccess`: every caller has
   * access and the career plan is whatever the test set through
   * `BillingService`, so V2's own domain tests keep exercising V2 metering.
   */
  v1?: { accounts: Map<string, V1AccountSnapshot>; map: CareerPlanMap; clock?: { now(): Date }; jobs?: Map<string, string[]> };
}

/** Test double: access granted, plan left as the test set it. Never used outside tests. */
export class PassthroughCareerAccess {
  async forUid(): Promise<CareerAccess> {
    return { enabled: true, v1Plan: 'pro', careerPlan: 'free' };
  }
  async syncPlan(): Promise<void> {}
  planMap(): CareerPlanMap {
    return { free: null, pro: 'free', career_accelerator: null, enterprise: null };
  }
}

/**
 * The real AppModule on a throwaway schema, with the fake token verifier
 * (`Authorization: Bearer fake:<uid>`). Restores DATABASE_URL on close.
 */
export async function createTestApp(label: string, options: TestAppOptions = {}): Promise<TestApp> {
  const savedUrl = process.env.DATABASE_URL;
  const db = await createTestDatabase(label);
  process.env.DATABASE_URL = db.url;
  const billing = new BillingService(db.pool);
  await billing.publishCatalog();
  const tokens = new FakeIdTokenVerifier();
  const signIns = new RecordingSignInDeleter();
  const builder = Test.createTestingModule({ imports: [AppModule], controllers: options.controllers ?? [] })
    .overrideProvider(ID_TOKEN_VERIFIER)
    .useValue(tokens)
    .overrideProvider(SIGN_IN_DELETER)
    .useValue(signIns);
  if (options.v1) {
    builder
      .overrideProvider(V1_ACCOUNT_SOURCE)
      .useValue(new StaticV1AccountSource(options.v1.accounts, options.v1.jobs))
      .overrideProvider(CAREER_PLAN_MAP)
      .useValue(options.v1.map);
    if (options.v1.clock) builder.overrideProvider(ACCESS_CLOCK).useValue(options.v1.clock);
  } else {
    builder.overrideProvider(CareerAccessService).useValue(new PassthroughCareerAccess());
  }
  const moduleRef = await (options.customize ? options.customize(builder) : builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  configureApp(app, { corsOrigins: ['http://localhost:3001'] });
  await app.init();
  return {
    app,
    db,
    billing,
    tokens,
    signIns,
    async close() {
      await app.close();
      process.env.DATABASE_URL = savedUrl;
      await db.drop();
    },
  };
}
