/**
 * Can yearly billing be turned on yet?
 *
 * Asks Stripe what each configured "yearly" price actually IS. A price id says
 * nothing about its billing interval, so the only way to know whether an annual
 * plan will charge annually is to look it up — and getting this wrong bills a
 * customer twelve times too often, which is a chargeback and a refund, not a
 * bug report.
 *
 *     node scripts/verify-yearly-prices.mjs
 *
 * Read-only, and refuses to run against a live key.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const Stripe = require('stripe');

const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
const env = (key) => {
  const line = raw.split(/\r?\n/).find((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (!line) return undefined;
  let v = line.replace(new RegExp(`^\\s*${key}\\s*=`), '').trim();
  const q = /^(["'])([\s\S]*)\1$/.exec(v);
  return q ? q[2] : v;
};

const key = env('STRIPE_SECRET_KEY');
if (!key) {
  console.error('STRIPE_SECRET_KEY not found in .env');
  process.exit(1);
}
if (!key.startsWith('sk_test')) {
  console.error('Refusing to run against a non-test key. This script is for verification only.');
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2024-04-10' });

/** What PLAN_CONFIGS advertises, so we can check Stripe agrees with the page. */
const EXPECTED = {
  PRO: { env: 'STRIPE_PRO_YEARLY_PRICE_ID', advertised: 299.99 },
  ENTERPRISE: { env: 'STRIPE_ENTERPRISE_YEARLY_PRICE_ID', advertised: 999.99 },
};

let ready = true;

console.log('\nChecking the configured annual prices…\n');

for (const [plan, { env: envKey, advertised }] of Object.entries(EXPECTED)) {
  const id = env(envKey);
  if (!id) {
    console.log(`${plan.padEnd(10)} ${envKey} is not set`);
    ready = false;
    continue;
  }

  let price;
  try {
    price = await stripe.prices.retrieve(id);
  } catch (err) {
    console.log(`${plan.padEnd(10)} ${id} — NOT FOUND (${err.message})`);
    ready = false;
    continue;
  }

  const interval = price.recurring?.interval ?? 'one-time';
  const amount = (price.unit_amount ?? 0) / 100;
  const intervalOk = interval === 'year';
  const amountOk = Math.abs(amount - advertised) < 0.01;
  const activeOk = price.active === true;

  console.log(`${plan.padEnd(10)} ${price.id}`);
  console.log(`           interval : ${interval} ${intervalOk ? 'OK' : '<-- MUST BE "year"'}`);
  console.log(
    `           amount   : $${amount.toFixed(2)} ${price.currency.toUpperCase()} ` +
      `${amountOk ? 'OK' : `<-- page advertises $${advertised.toFixed(2)}`}`,
  );
  console.log(`           active   : ${price.active} ${activeOk ? 'OK' : '<-- inactive'}`);

  if (!intervalOk) {
    const perYear = interval === 'month' ? amount * 12 : null;
    console.log(
      `           WARNING  : this bills every ${interval}. Selling it as annual would charge ` +
        (perYear ? `$${perYear.toFixed(2)}/year instead of $${advertised.toFixed(2)} ` : '') +
        `— roughly ${perYear ? Math.round(perYear / advertised) : '?'}x too much.`,
    );
  }

  if (!intervalOk || !amountOk || !activeOk) ready = false;
  console.log('');
}

if (ready) {
  console.log('READY. To enable annual billing:');
  console.log('  1. Copy these ids into stripePriceIdYearly in packages/shared-types/src/subscription.types.ts');
  console.log('  2. Set YEARLY_BILLING_ENABLED = true in the same file');
  console.log('  3. pnpm --filter @flacroncv/shared-types build && pnpm --filter api test\n');
} else {
  console.log('NOT READY — annual billing must stay disabled.');
  console.log('Create a recurring price with interval = "year" for each plan in the Stripe');
  console.log('dashboard (Pro $299.99/year, Enterprise $999.99/year), put those ids in .env,');
  console.log('and re-run this script.\n');
}
