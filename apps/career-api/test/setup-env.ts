import { loadRepoEnv } from '@flacroncv/career-server';

// E2E tests never use a real Auth emulator: tokens come from the fake
// verifier a test binds, and an app without it accepts no token.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '';
// The V1 bridge never reads Firestore in these tests; fixtures stand in for V1 accounts.
process.env.V1_ACCOUNT_SOURCE = 'static';
process.env.FIRESTORE_EMULATOR_HOST = '';

loadRepoEnv(__dirname);

process.env.AI_PROVIDER = '';
process.env.OPENAI_API_KEY = '';
process.env.GEOCODING_API_KEY = '';
process.env.GEOCODING_PROVIDER = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';
process.env.STRIPE_PRICES = '';
process.env.STRIPE_AUTO_TEST_PRICES = '';
process.env.AWS_ACCESS_KEY_ID = '';
process.env.AWS_SECRET_ACCESS_KEY = '';
process.env.SES_ACCESS_KEY_ID = '';
process.env.SES_SECRET_ACCESS_KEY = '';
process.env.MAIL_DELIVERY = 'record';
process.env.OBJECT_STORAGE = 'memory';
