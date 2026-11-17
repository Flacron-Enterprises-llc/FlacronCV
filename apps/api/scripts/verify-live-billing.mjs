#!/usr/bin/env node
/**
 * READ-ONLY verification of FlacronCV's LIVE billing setup. Run by the account owner.
 * Makes only GET requests to Stripe and read queries to Firestore. Creates, changes and deletes
 * nothing. Prints no key, no name, no email and no full record — ids are shortened to their last 6.
 *
 * Inputs
 *   --key-file=PATH      file with STRIPE_LIVE_READONLY_KEY=rk_live_…  (restricted, READ-only; see the request)
 *   --prices=a,b,c,d     the four legacy price ids the deployed API uses
 *                        (STRIPE_PRO_MONTHLY/YEARLY_PRICE_ID, STRIPE_ENTERPRISE_MONTHLY/YEARLY_PRICE_ID)
 *   --firestore          also sample 3 legacy subscribers from production Firestore. Uses the caller's
 *                        own Google credentials (`gcloud auth application-default login`, an account with
 *                        Cloud Datastore Viewer on project flacron-cv). Omit to skip.
 *
 *   node scripts/verify-live-billing.mjs --key-file=C:\path\stripe-live-readonly.env --prices=price_…,price_…,price_…,price_… [--firestore]
 */
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
const short = (id) => (id ? `…${String(id).slice(-6)}` : '-');
const fail = (msg) => { console.log(`STOP: ${msg}`); process.exit(1); };

// ---- key: restricted, live, read-only --------------------------------------------------------
if (!args['key-file']) fail('pass --key-file=PATH (file with STRIPE_LIVE_READONLY_KEY=rk_live_…)');
let key = '';
try { key = (/^\s*STRIPE_LIVE_READONLY_KEY\s*=\s*(\S*)/m.exec(readFileSync(args['key-file'], 'utf8'))?.[1] ?? '').trim(); } catch { fail('key file not found'); }
if (/^sk_/.test(key)) fail('this is an UNRESTRICTED secret key. Use a restricted read-only key (rk_live_…).');
if (/^rk_test_/.test(key)) fail('this is a TEST key. This script verifies LIVE billing (rk_live_…).');
if (!/^rk_live_[A-Za-z0-9]+$/.test(key)) fail('STRIPE_LIVE_READONLY_KEY must be a restricted live key (rk_live_…).');

async function stripe(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.stripe.com${path}${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-04-10' } });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch (e) {
      if (attempt >= 4) throw new Error('network error talking to Stripe');
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
async function listAll(path, params = {}) {
  const out = [];
  let after = '';
  for (let page = 0; page < 200; page++) {
    const r = await stripe(path, { limit: '100', ...params, ...(after ? { starting_after: after } : {}) });
    if (r.status !== 200) throw new Error(`${path} refused (${r.status} ${r.body?.error?.code ?? ''})`);
    out.push(...r.body.data);
    if (!r.body.has_more) break;
    after = r.body.data[r.body.data.length - 1].id;
  }
  return out;
}

// ---- 1. Which account does this key belong to? -------------------------------------------------
// A read-only key cannot read Balance; Stripe's refusal names the account the key belongs to.
const probe = await stripe('/v1/balance');
const accountFromStripe = (probe.body?.error?.message ?? '').match(/on account '(acct_[A-Za-z0-9]+)'/)?.[1] ?? null;
console.log(`1. Stripe account of this key (from Stripe's own response): ${accountFromStripe ?? (probe.status === 200 ? 'UNKNOWN — the key can read Balance; it is not read-only as requested' : 'not stated by Stripe')}`);
// Safety: the key must not be able to write. A write to a non-existent id answers 404 when allowed.
const writeProbe = await fetch('https://api.stripe.com/v1/customers/cus_verifyreadonly', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
if (writeProbe.status !== 403) fail('the key can WRITE customers. Recreate it with Read-only permissions and run again.');
console.log('   key is read-only for customers (write refused, nothing created).');

// ---- 2. Registered webhook endpoints for the FlacronCV API ---------------------------------------
const endpoints = await listAll('/v1/webhook_endpoints');
const ours = endpoints.filter((e) => /api\.flacroncv\.com/i.test(e.url));
console.log(`2. Webhook endpoints in this account: ${endpoints.length}; pointing at api.flacroncv.com: ${ours.length}`);
for (const e of ours) {
  console.log(`   ${short(e.id)} ${e.url} status=${e.status} livemode=${e.livemode} api_version=${e.api_version ?? 'account default'}`);
  console.log(`   events: ${(e.enabled_events || []).join(', ')}`);
  for (const needed of ['checkout.session.completed', 'checkout.session.expired', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'charge.refunded', 'charge.refund.updated', 'charge.dispute.created', 'charge.dispute.closed']) {
    if (!(e.enabled_events || []).includes(needed) && !(e.enabled_events || []).includes('*')) console.log(`   missing for the new code: ${needed}`);
  }
}

// ---- 3. Legacy prices and their subscribers ------------------------------------------------------
const priceIds = (args.prices ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (priceIds.length !== 4) console.log('3. Legacy prices: pass the four deployed ids with --prices=… (from the API configuration).');
for (const id of priceIds) {
  const p = await stripe(`/v1/prices/${id}`);
  if (p.status !== 200) { console.log(`3. ${id}: NOT FOUND in this account (${p.status})`); continue; }
  const pr = p.body;
  const product = await stripe(`/v1/products/${typeof pr.product === 'string' ? pr.product : pr.product.id}`);
  const subs = await listAll('/v1/subscriptions', { price: id, status: 'all' });
  const byStatus = subs.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});
  console.log(`3. ${id}: live=${pr.livemode} active=${pr.active} ${pr.currency} ${(pr.unit_amount / 100).toFixed(2)}/${pr.recurring?.interval ?? 'one_time'} product="${product.body?.name ?? '?'}" app_id=${pr.metadata?.app_id ?? 'none'}`);
  console.log(`   subscriptions on this price: ${subs.length} ${JSON.stringify(byStatus)}`);
}

// ---- 4. Three existing FlacronCV subscribers from production Firestore --------------------------
if (args.firestore === 'true') {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId: 'flacron-cv' });
  const snap = await getFirestore().collection('users')
    .where('subscription.plan', 'in', ['pro', 'enterprise', 'career_accelerator']).limit(25).get();
  const sample = snap.docs.map((d) => d.get('subscription') ?? {}).filter((s) => s.stripeCustomerId && s.stripeSubscriptionId).slice(0, 3);
  console.log(`4. Production legacy subscribers sampled: ${sample.length} (ids shortened; no names or emails read)`);
  for (const s of sample) {
    const c = await stripe(`/v1/customers/${s.stripeCustomerId}`);
    const sub = await stripe(`/v1/subscriptions/${s.stripeSubscriptionId}`);
    const price = sub.body?.items?.data?.[0]?.price?.id;
    console.log(`   customer ${short(s.stripeCustomerId)}: ${c.status === 200 && !c.body.deleted ? 'found in this account' : `NOT in this account (${c.status})`}; ` +
      `subscription ${short(s.stripeSubscriptionId)}: ${sub.status === 200 ? `status=${sub.body.status} app_id=${sub.body.metadata?.app_id ?? 'none'} legacy price=${priceIds.includes(price) ? 'yes' : 'NO'}` : `NOT in this account (${sub.status})`}`);
  }
} else {
  console.log('4. Firestore sample skipped (add --firestore).');
}
console.log('\nDone. Nothing was created, changed or deleted.');
