import { UnconfiguredStripeGateway } from '../billing/payments/checkout';
import { createStripeGateway, LiveStripeGateway } from '../billing/payments/live-stripe';
import { providerHealthFromEnv } from '../admin/admin.service';
import { createMailer, sesSettings } from '../mail/ses-mailer';
import { assertDeploySafety, assertStagingSafety, isStagingDeploy } from './deploy-env';

const staging = {
  NODE_ENV: 'production',
  DEPLOY_ENV: 'staging',
  FIREBASE_PROJECT_ID: 'flacroncv-v2-staging',
  CORS_ORIGINS: 'https://staging.example.test',
  STRIPE_SECRET_KEY: 'sk_test_example',
  MAIL_DELIVERY: 'record',
} as NodeJS.ProcessEnv;

/** Fictional names only; the real values come from the client's production parameters. */
const production = {
  NODE_ENV: 'production',
  DEPLOY_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db.example.test:5432/flacroncv',
  FIREBASE_PROJECT_ID: 'flacron-cv',
  CORS_ORIGINS: 'https://www.flacroncv.com,https://flacroncv.com',
  OBJECT_STORAGE: 's3',
  OBJECT_STORAGE_BUCKET: 'flacroncv-career-prod-documents-000000000000',
  MAIL_DELIVERY: 'record',
} as NodeJS.ProcessEnv;

describe('staging deploy rules', () => {
  it('accepts an isolated staging configuration and ignores non-staging environments', () => {
    expect(isStagingDeploy(staging)).toBe(true);
    expect(() => assertStagingSafety(staging)).not.toThrow();
    expect(() => assertStagingSafety({ ...staging, DEPLOY_ENV: '', STRIPE_SECRET_KEY: 'sk_live_x' })).not.toThrow();
  });

  it('refuses live charges, live mail, production users, the emulator, and production origins', () => {
    expect(() => assertStagingSafety({ ...staging, STRIPE_SECRET_KEY: 'sk_live_x' })).toThrow(/live Stripe/);
    expect(() => assertStagingSafety({ ...staging, STRIPE_SECRET_KEY: 'rk_live_x' })).toThrow(/live Stripe/);
    expect(() => assertStagingSafety({ ...staging, MAIL_DELIVERY: 'live' })).toThrow(/MAIL_DELIVERY/);
    expect(() => assertStagingSafety({ ...staging, FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(/FIREBASE_PROJECT_ID/);
    expect(() => assertStagingSafety({ ...staging, FIREBASE_PROJECT_ID: 'demo-flacroncv' })).toThrow(/FIREBASE_PROJECT_ID/);
    expect(() => assertStagingSafety({ ...staging, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toThrow(/emulator/);
    expect(() => assertStagingSafety({ ...staging, CORS_ORIGINS: 'https://staging.example.test,https://www.flacroncv.com' })).toThrow(
      /production host/,
    );
    expect(() => assertStagingSafety({ ...staging, CORS_ORIGINS: 'staging.example.test' })).toThrow(/absolute/);
    expect(() => assertStagingSafety({ ...staging, OBJECT_STORAGE: 'local' })).toThrow(/OBJECT_STORAGE_SECRET/);
    expect(() => assertStagingSafety({ ...staging, OBJECT_STORAGE: 'local', OBJECT_STORAGE_SECRET: 'x' })).not.toThrow();
  });

  it('keeps V1\'s live project out of local runs and tests, and refuses an unnamed hosted deployment', () => {
    expect(() => assertDeploySafety({ NODE_ENV: 'development', FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(/live Firebase project/);
    expect(() => assertDeploySafety({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(/live Firebase project/);
    expect(() => assertDeploySafety({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'flacron-cv' })).toThrow(/DEPLOY_ENV/);
    expect(() => assertDeploySafety({ NODE_ENV: 'development', FIREBASE_PROJECT_ID: 'demo-flacroncv' })).not.toThrow();
    expect(() => assertDeploySafety({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertDeploySafety(staging)).not.toThrow();
  });

  it('lets production serve V1\'s hosts, but never staging', () => {
    for (const host of ['https://flacroncv.com', 'https://www.flacroncv.com', 'https://api.flacroncv.com']) {
      expect(() => assertDeploySafety({ ...staging, CORS_ORIGINS: host })).toThrow(/production host/);
      expect(() => assertDeploySafety({ ...production, CORS_ORIGINS: host })).not.toThrow();
    }
  });

  it('accepts V1\'s identity project in production and nothing else', () => {
    const refuses = (project: string) =>
      expect(() => assertDeploySafety({ ...production, FIREBASE_PROJECT_ID: project })).toThrow(/V1's project/);
    refuses('flacroncv-v2-prod');
    refuses('flacroncv-v2-staging');
    refuses('demo-flacroncv');
    refuses('');
    expect(() => assertDeploySafety(production)).not.toThrow();
  });

  it('accepts an isolated production configuration with billing left unavailable', () => {
    expect(() => assertDeploySafety(production)).not.toThrow();
    expect(() => assertDeploySafety({ ...production, DATABASE_URL: undefined }, 'worker')).not.toThrow();
  });

  it('keeps production apart from staging, billing, emulators, V1\'s bucket and long-lived AWS keys', () => {
    const refuses = (patch: NodeJS.ProcessEnv, pattern: RegExp) => expect(() => assertDeploySafety({ ...production, ...patch })).toThrow(pattern);
    refuses({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, /emulator/);
    refuses({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, /Firestore emulator/);
    refuses({ DATABASE_URL: 'postgres://u:p@db.example.test:5432/flacroncv_staging' }, /staging database/);
    refuses({ OBJECT_STORAGE: 'local' }, /OBJECT_STORAGE must be s3/);
    refuses({ OBJECT_STORAGE_BUCKET: 'flacroncv-career-staging-documents' }, /career bucket/);
    refuses({ OBJECT_STORAGE_BUCKET: 'flacron-cv.appspot.com' }, /career bucket/);
    refuses({ OBJECT_STORAGE_BUCKET: 'flacron-cv-documents' }, /career bucket/);
    refuses({ AWS_ACCESS_KEY_ID: 'AKIDLOCALTESTONLY' }, /instance role/);
    refuses({ MAIL_ALLOWED_RECIPIENTS: 'a@example.test' }, /MAIL_ALLOWED_RECIPIENTS/);
    refuses({ CORS_ORIGINS: 'https://staging.example.test' }, /staging host/);
    refuses({ CORS_ORIGINS: 'http://app.example.test' }, /https/);
    // V1 owns billing: the career service never holds a Stripe key, test or live.
    refuses({ STRIPE_SECRET_KEY: 'sk_test_example' }, /V1 owns billing/);
    refuses({ STRIPE_SECRET_KEY: 'sk_live_example' }, /V1 owns billing/);
    refuses({ STRIPE_AUTO_TEST_PRICES: 'true' }, /test prices/);
    expect(() => assertDeploySafety({ ...production, STRIPE_SECRET_KEY: 'sk_live_example' }, 'worker')).toThrow(/V1 owns billing/);
    expect(() => assertDeploySafety({ ...production, DATABASE_URL: 'postgres://u:p@db.example.test:5432/flacroncv_staging' }, 'worker')).toThrow(
      /staging database/,
    );
  });

  it('never builds a live Stripe gateway in staging even with NODE_ENV=production', () => {
    expect(createStripeGateway({ ...staging, STRIPE_SECRET_KEY: 'sk_live_x' })).toBeInstanceOf(UnconfiguredStripeGateway);
    expect(createStripeGateway(staging)).toBeInstanceOf(LiveStripeGateway);
  });

  it('limits staging mail to synthetic, simulator, and explicitly approved recipients', async () => {
    const calls: string[] = [];
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    });
    const realFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const mailer = createMailer({
        ...staging,
        MAIL_DELIVERY: 'sandbox',
        AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'secret',
        SES_FROM_EMAIL: 'no-reply@example.test',
        MAIL_ALLOWED_RECIPIENTS: 'Tester@Example.org',
      });
      const message = { subject: 's', text: 't', html: '<p>t</p>' };
      expect(await mailer.send({ ...message, to: 'customer@example.com' })).toEqual({ delivered: false });
      expect(await mailer.send({ ...message, to: 'tester@example.org' })).toEqual({ delivered: true });
      expect(calls).toHaveLength(1);
    } finally {
      global.fetch = realFetch;
    }
  });

  it('needs a dedicated staging bucket and keeps SES keys apart from the S3 task role', () => {
    const s3 = { ...staging, OBJECT_STORAGE: 's3', OBJECT_STORAGE_REGION: 'us-east-1' };
    expect(() => assertStagingSafety({ ...s3, OBJECT_STORAGE_BUCKET: 'flacroncv-v2-staging-documents' })).not.toThrow();
    expect(() => assertStagingSafety({ ...s3, OBJECT_STORAGE_BUCKET: 'flacroncv-documents' })).toThrow(/dedicated staging bucket/);
    expect(() =>
      assertStagingSafety({ ...s3, OBJECT_STORAGE_BUCKET: 'flacroncv-v2-staging-documents', AWS_ACCESS_KEY_ID: 'AKIDLOCALTESTONLY', SES_FROM_EMAIL: 'no-reply@example.test' }),
    ).toThrow(/SES_ACCESS_KEY_ID/);
    expect(() =>
      assertStagingSafety({ ...s3, OBJECT_STORAGE_BUCKET: 'flacroncv-v2-staging-documents', SES_ACCESS_KEY_ID: 'AKIDLOCALTESTONLY', SES_FROM_EMAIL: 'no-reply@example.test' }),
    ).not.toThrow();
  });

  it('reads SES_* first, falls back to AWS_*, and reports S3 storage as configured', () => {
    expect(sesSettings({ SES_ACCESS_KEY_ID: 'ses-id', SES_SECRET_ACCESS_KEY: 'ses-secret', SES_REGION: 'eu-west-3', AWS_ACCESS_KEY_ID: 'aws-id', AWS_REGION: 'us-east-1' })).toMatchObject({
      accessKeyId: 'ses-id',
      secretAccessKey: 'ses-secret',
      region: 'eu-west-3',
    });
    expect(sesSettings({ AWS_ACCESS_KEY_ID: 'aws-id', AWS_SECRET_ACCESS_KEY: 'aws-secret' })).toMatchObject({ accessKeyId: 'aws-id', region: 'us-east-1' });
    const status = (env: NodeJS.ProcessEnv) => providerHealthFromEnv(env).find((row) => row.name === 'storage')?.status;
    expect(status({ OBJECT_STORAGE: 's3', OBJECT_STORAGE_BUCKET: 'b' })).toBe('configured');
    expect(status({ OBJECT_STORAGE: 's3' })).toBe('unconfigured');
    expect(status({ OBJECT_STORAGE: 'local' })).toBe('local');
  });
});
