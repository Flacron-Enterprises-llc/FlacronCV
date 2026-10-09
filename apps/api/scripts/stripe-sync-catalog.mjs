#!/usr/bin/env node
/**
 * FlacronCV's Stripe catalog on the shared Flacron Stripe account.
 *
 * Every Flacron application bills through ONE Stripe account, so FlacronCV's
 * Products and Prices must be (a) named "FlacronCV - <Plan>" and (b) stamped
 * with `app_id=flacron-cv`. The API refuses to check out any price without
 * that stamp. This script makes the catalog match, idempotently:
 *
 *   - finds each plan's Product by `metadata.fcv_plan` (or adopts an existing
 *     product id passed with --adopt-<plan>=prod_…), creates it if missing,
 *     and sets its name + metadata;
 *   - finds each Price by `lookup_key` (fcv_<plan>_<interval>), adopts an
 *     existing price passed with --adopt-<plan>-<interval>=price_…, or creates
 *     it, and stamps its metadata;
 *   - optionally (--portal) creates/updates FlacronCV's own Customer Portal
 *     configuration, restricted to FlacronCV's prices;
 *   - optionally (--webhook=<url>) creates FlacronCV's webhook endpoint and
 *     writes its signing secret to --secret-out (never printed).
 *
 * Prints the env values to pin: STRIPE_*_PRICE_ID, STRIPE_PORTAL_CONFIGURATION_ID.
 *
 * Key: STRIPE_SECRET_KEY (the app's restricted key, rk_test_/rk_live_). Live
 * mode requires --live as a second, explicit confirmation.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=rk_test_… node scripts/stripe-sync-catalog.mjs [--portal] [--webhook=URL --secret-out=FILE]
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/stripe-sync-catalog.mjs --live --portal …
 *   add --dry-run to print the plan without writing.
 */
import { writeFileSync } from 'node:fs';

const APP_ID = process.env.APP_ID?.trim() || 'flacron-cv';
const API_VERSION = '2024-04-10';

const PLANS = [
  { plan: 'pro', name: 'FlacronCV - Pro', monthly: 2999, yearly: 29999 },
  { plan: 'enterprise', name: 'FlacronCV - Enterprise', monthly: 9999, yearly: 99999 },
];
const INTERVALS = [
  { interval: 'month', key: 'monthly' },
  { interval: 'year', key: 'yearly' },
];

/** The events PaymentService handles (HANDLED_STRIPE_EVENTS). */
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'charge.refunded',
  'charge.refund.updated',
  'charge.dispute.created',
];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
const mode = /^(?:sk|rk)_(live|test)_/.exec(key)?.[1];
if (!mode) {
  console.error('STRIPE_SECRET_KEY must be an sk_/rk_ live/test key.');
  process.exit(1);
}
if (mode === 'live' && !args.live) {
  console.error('STRIPE_SECRET_KEY is LIVE. Re-run with --live to confirm you mean the live catalog.');
  process.exit(1);
}
const dryRun = !!args['dry-run'];
const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');

function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof v === 'object') form(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

async function stripe(method, path, params) {
  if (dryRun && method !== 'GET') {
    console.log(`  [dry-run] ${method} ${path}`);
    return {};
  }
  const body = params ? form(params) : undefined;
  const url = 'https://api.stripe.com' + path + (method === 'GET' && body ? `?${body}` : '');
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Stripe-Version': API_VERSION, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error?.message}`);
  return json;
}

async function listAll(path, params = {}) {
  const out = [];
  let starting_after;
  for (;;) {
    const page = await stripe('GET', path, { limit: 100, ...params, starting_after });
    out.push(...page.data);
    if (!page.has_more) return out;
    starting_after = page.data.at(-1).id;
  }
}

const env = {};
const ourPriceIds = {};

console.log(`FlacronCV Stripe catalog — app_id=${APP_ID}, mode=${mode}${dryRun ? ' (dry run)' : ''}`);
const products = await listAll('/v1/products');
const prices = await listAll('/v1/prices', { active: 'true' });

for (const p of PLANS) {
  const adopt = args[`adopt-${p.plan}`];
  let product = products.find((x) => (adopt ? x.id === adopt : x.metadata?.app_id === APP_ID && x.metadata?.fcv_plan === p.plan));
  const productMeta = { app_id: APP_ID, fcv_plan: p.plan };
  if (product) {
    const other = product.metadata?.app_id;
    if (other && other !== APP_ID) throw new Error(`${product.id} belongs to app_id ${other}; refusing to adopt it.`);
    console.log(`product ${p.plan}: ${product.id} (${product.name}) → "${p.name}"`);
    await stripe('POST', `/v1/products/${product.id}`, { name: p.name, metadata: productMeta, active: true });
  } else {
    console.log(`product ${p.plan}: creating "${p.name}"`);
    product = await stripe('POST', '/v1/products', { name: p.name, metadata: productMeta });
  }
  ourPriceIds[p.plan] = { product: product.id, prices: [] };

  for (const i of INTERVALS) {
    const lookupKey = `fcv_${p.plan}_${i.key}`;
    const amount = p[i.key];
    const adoptPrice = args[`adopt-${p.plan}-${i.key}`];
    let price =
      prices.find((x) => (adoptPrice ? x.id === adoptPrice : x.lookup_key === lookupKey)) ??
      (adoptPrice ? await stripe('GET', `/v1/prices/${adoptPrice}`) : undefined);
    const priceMeta = { app_id: APP_ID, fcv_plan: p.plan, fcv_interval: i.key };
    const nickname = `${p.name} (${i.key})`;
    if (price && price.id) {
      const other = price.metadata?.app_id;
      if (other && other !== APP_ID) throw new Error(`${price.id} belongs to app_id ${other}; refusing to adopt it.`);
      const productOk = (price.product?.id ?? price.product) === product.id || !product.id;
      const shapeOk = price.unit_amount === amount && price.recurring?.interval === i.interval && price.currency === 'usd';
      if (!productOk || !shapeOk) {
        throw new Error(`${price.id} does not match ${lookupKey} (product/amount/interval) — fix it by hand or omit --adopt.`);
      }
      console.log(`  price ${lookupKey}: ${price.id} — stamping metadata`);
      await stripe('POST', `/v1/prices/${price.id}`, { metadata: priceMeta, nickname, lookup_key: lookupKey, transfer_lookup_key: true });
    } else {
      console.log(`  price ${lookupKey}: creating $${(amount / 100).toFixed(2)}/${i.interval}`);
      price = await stripe('POST', '/v1/prices', {
        product: product.id,
        currency: 'usd',
        unit_amount: amount,
        recurring: { interval: i.interval },
        lookup_key: lookupKey,
        nickname,
        metadata: priceMeta,
      });
    }
    env[`STRIPE_${p.plan.toUpperCase()}_${i.key === 'monthly' ? 'MONTHLY' : 'YEARLY'}_PRICE_ID`] = price.id;
    ourPriceIds[p.plan].prices.push(price.id);
  }
}

if (args.portal) {
  const configs = await listAll('/v1/billing_portal/configurations', { active: 'true' });
  const existing = configs.find((c) => c.metadata?.app_id === APP_ID);
  const params = {
    business_profile: { headline: 'Manage your FlacronCV subscription' },
    default_return_url: args['return-url'] ?? 'https://www.flacroncv.com/settings/billing',
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: Object.values(ourPriceIds).map((x) => ({ product: x.product, prices: x.prices })),
      },
    },
    metadata: { app_id: APP_ID },
  };
  const result = existing
    ? await stripe('POST', `/v1/billing_portal/configurations/${existing.id}`, params)
    : await stripe('POST', '/v1/billing_portal/configurations', params);
  console.log(`portal configuration: ${existing ? 'updated' : 'created'} ${result.id ?? existing?.id}`);
  env.STRIPE_PORTAL_CONFIGURATION_ID = result.id ?? existing?.id;
}

if (typeof args.webhook === 'string') {
  const endpoints = await listAll('/v1/webhook_endpoints');
  const existing = endpoints.find((w) => w.url === args.webhook);
  if (existing) {
    console.log(`webhook ${args.webhook}: exists (${existing.id}, ${existing.status}) — updating events/metadata; secret unchanged`);
    await stripe('POST', `/v1/webhook_endpoints/${existing.id}`, {
      enabled_events: WEBHOOK_EVENTS,
      metadata: { app_id: APP_ID },
      disabled: false,
    });
  } else {
    if (typeof args['secret-out'] !== 'string') throw new Error('--webhook needs --secret-out=FILE to store the signing secret.');
    const created = await stripe('POST', '/v1/webhook_endpoints', {
      url: args.webhook,
      enabled_events: WEBHOOK_EVENTS,
      api_version: API_VERSION,
      description: `FlacronCV API (${mode})`,
      metadata: { app_id: APP_ID },
    });
    if (created.secret) writeFileSync(args['secret-out'], created.secret, { mode: 0o600 });
    console.log(`webhook ${args.webhook}: created ${created.id}; signing secret written to ${args['secret-out']}`);
  }
}

console.log('\nPin these in the API environment:');
for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
