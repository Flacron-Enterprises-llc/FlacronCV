import type { Provider } from '@nestjs/common';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import {
  EmulatorIdTokenVerifier,
  fetchJsonWithMaxAge,
  FirebaseIdTokenVerifier,
  GooglePublicKeySource,
  IdentityService,
  IdTokenVerifier,
  UnconfiguredIdTokenVerifier,
} from '@flacroncv/career-server';
import { readAuthConfig } from '../config/auth';
import { DatabaseService } from '../database/database.service';
import { ACCESS_CLOCK } from '../integration/career-access.service';

export const ID_TOKEN_VERIFIER = Symbol('ID_TOKEN_VERIFIER');

export const authProviders: Provider[] = [
  {
    provide: ID_TOKEN_VERIFIER,
    useFactory: (): IdTokenVerifier => {
      const config = readAuthConfig(process.env);
      switch (config.mode) {
        case 'firebase':
          return new FirebaseIdTokenVerifier(config.projectId, new GooglePublicKeySource(fetchJsonWithMaxAge));
        case 'emulator':
          return new EmulatorIdTokenVerifier(config.projectId, process.env.NODE_ENV?.trim() || 'development');
        case 'unconfigured':
          return new UnconfiguredIdTokenVerifier();
      }
    },
  },
  {
    provide: IdentityService,
    // Same clock as the V1 plan bridge, so a new account's allowance period and its renewals agree.
    inject: [DatabaseService, ACCESS_CLOCK],
    useFactory: (database: DatabaseService, clock: { now(): Date }) =>
      new IdentityService(database.connectionPool, CATALOG_VERSION, clock),
  },
];
