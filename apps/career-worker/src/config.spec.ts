import { readWorkerConfig } from './config';

const remote = 'postgres://u:p@db.example.test:5432/flacroncv';

describe('readWorkerConfig', () => {
  it('needs a named hosted deployment under NODE_ENV=production', () => {
    expect(() => readWorkerConfig({ NODE_ENV: 'production', DATABASE_URL: remote })).toThrow(/DEPLOY_ENV/);
    expect(readWorkerConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'production', DATABASE_URL: remote })).toEqual({
      databaseUrl: remote,
      bossSchema: 'pgboss',
    });
  });

  it('keeps V1\'s live project out of staging and local runs, and refuses a staging database, AWS keys and Stripe in production', () => {
    expect(() => readWorkerConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'staging', DATABASE_URL: remote, FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(
      /staging FIREBASE_PROJECT_ID/,
    );
    expect(() => readWorkerConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgres://u:p@127.0.0.1:5440/x', FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(
      /live Firebase project/,
    );
    expect(() => readWorkerConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'production', DATABASE_URL: remote, STRIPE_SECRET_KEY: 'sk_live_x' })).toThrow(
      /V1 owns billing/,
    );
    expect(() =>
      readWorkerConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'production', DATABASE_URL: 'postgres://u:p@db.example.test:5432/flacroncv_staging' }),
    ).toThrow(/staging database/);
    expect(() => readWorkerConfig({ NODE_ENV: 'production', DEPLOY_ENV: 'production', DATABASE_URL: remote, AWS_ACCESS_KEY_ID: 'AKIDLOCALTESTONLY' })).toThrow(
      /instance role/,
    );
  });
});
