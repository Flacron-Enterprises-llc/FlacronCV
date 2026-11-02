import { loadRepoEnv } from '../env/load-env-file';

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
