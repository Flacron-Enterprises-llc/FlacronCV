#!/usr/bin/env node
/**
 * READ-ONLY verification of FlacronCV's LIVE billing setup. Run by the account owner.
 * Makes ONLY GET requests to Stripe and one projected read query to Firestore. Creates, changes and
 * deletes nothing. Prints no key, no name, no email and no full record — customer/subscription ids
 * are shortened to their last 6 characters.
 *
 * Inputs
 *   --key-file=PATH            file with STRIPE_LIVE_READONLY_KEY=rk_live_…  (restricted, Read-only; see
 *                              docs/STRIPE_LIVE_VERIFICATION_REQUEST.md)
 *   --prices=a,b,c,d           the four legacy price ids the deployed API uses
 *                              (STRIPE_PRO_MONTHLY/YEARLY_PRICE_ID, STRIPE_ENTERPRISE_MONTHLY/YEARLY_PRICE_ID)
 *   --expected-account=acct_…  the account id shown in YOUR Stripe Dashboard URL for the account that holds the
 *                              api.flacroncv.com webhook. The script stops if Stripe names a different one.
 *   --firestore                also sample 3 legacy subscribers from production Firestore, using the caller's
 *                              own Google credentials (`gcloud auth application-default login`, an account
 *                              with Cloud Datastore Viewer on flacron-cv). Reads only the three Stripe-id fields.
 *
 *   node scripts/verify-live-billing.mjs --key-file=C:\path\stripe-live-readonly.env \
 *     --prices=price_…,price_…,price_…,price_… --expected-account=acct_… --firestore
 *
 * Account evidence (all must agree for "ACCOUNT VERIFIED"):
 *   A. Stripe's own refusal of Balance names the key's account (the key has Balance = None).
 *   B. That id equals --expected-account (what the operator sees in the Dashboard).
 *   C. The api.flacroncv.com live webhook endpoint is registered in this account.
 *   D. All four deployed legacy prices exist, in live mode, in this account.
 *   E. Customers and subscriptions that the LIVE API stored in production Firestore exist in this account.
 *      Stripe object ids belong to exactly one account, so E ties the running API to this account.
 */
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
const short = (id) => (id ? `…${String(id).slice(-6)}` : '-');
// Stop without process.exit(): on Windows, exiting while fetch sockets close trips a libuv assertion.
class Stop extends Error {}
process.on('uncaughtException', (e) => { console.log(e instanceof Stop ? `STOP: ${e.message}` : `STOP: unexpected error — ${e.message}`); process.exitCode = 1; });
const fail = (msg) => { throw new Stop(msg); };

// ---- key: restricted, live -----------------------------------------------------------------------
if (!args['key-file']) fail('pass --key-file=PATH (file with STRIPE_LIVE_READONLY_KEY=rk_live_…)');
let key = '';
// STRIPE_LIVE_READONLY_KEY, or the temporary setup key (STRIPE_PROVISIONING_KEY): this script only sends GETs.
try {
  const text = readFileSync(args['key-file'], 'utf8');
  key = (/^\s*(?:STRIPE_LIVE_READONLY_KEY|STRIPE_PROVISIONING_KEY)\s*=\s*(\S*)/m.exec(text)?.[1] ?? '').trim();
} catch { fail('key file not found'); }
if (/^sk_/.test(key)) fail('this is an UNRESTRICTED secret key. Use a restricted read-only key (rk_live_…).');
if (/^rk_test_/.test(key)) fail('this is a TEST key. This script verifies LIVE billing (rk_live_…).');
if (!/^rk_live_[A-Za-z0-9]+$/.test(key)) fail('STRIPE_LIVE_READONLY_KEY must be a restricted live key (rk_live_…).');
const expected = args['expected-account'];
if (expected && !/^acct_[A-Za-z0-9]+$/.test(expected)) fail('--expected-account must look like acct_…');

const ID = /^[a-z]+_[A-Za-z0-9]+$/; // Stripe ids only; nothing else is ever put into a URL path
async function stripe(path, params = {}) { // GET only — this script never sends POST or DELETE
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`https://api.stripe.com${path}${qs ? `?${qs}` : ''}`, { method: 'GET', headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-04-10' } });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch {
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
const evidence = []; // { label, ok: true | false | null (not run) }
const note = (label, ok, detail = '') => { evidence.push({ label, ok }); console.log(`   [${ok === null ? 'not run' : ok ? 'ok' : 'DISAGREES'}] ${label}${detail ? ` — ${detail}` : ''}`); };

// ---- 1. Which account does this key belong to? ----------------------------------------------------
const probe = await stripe('/v1/balance');
if (probe.status === 200) fail('the key can read Balance. Set Balance to None (and everything not listed to None), then run again.');
if (probe.status === 401) fail('Stripe rejected the key (expired, deleted or mistyped).');
const account = (probe.body?.error?.message ?? '').match(/on account '(acct_[A-Za-z0-9]+)'/)?.[1] ?? null;
console.log(`1. Stripe account of this key (stated by Stripe): ${account ?? 'not stated'}`);
note('A. Stripe names the key\'s account', !!account);
if (expected) {
  note(`B. matches --expected-account ${expected}`, account === expected);
  if (account && account !== expected) fail(`Stripe says the key belongs to ${account}, not ${expected}. Accounts disagree — nothing else is checked.`);
} else note('B. --expected-account not given', null);
console.log('   (This script never writes, so it cannot test write permissions: confirm in the Dashboard that every line of the key is Read or None.)');

// ---- 2. Registered webhook endpoints for the FlacronCV API ----------------------------------------
const endpoints = await listAll('/v1/webhook_endpoints');
const ours = endpoints.filter((e) => /^https:\/\/api\.flacroncv\.com\//i.test(e.url));
console.log(`2. Webhook endpoints in this account: ${endpoints.length}; pointing at api.flacroncv.com: ${ours.length}`);
for (const e of ours) {
  console.log(`   ${short(e.id)} ${e.url} status=${e.status} livemode=${e.livemode} api_version=${e.api_version ?? 'account default'}`);
  console.log(`   events: ${(e.enabled_events || []).join(', ')}`);
  for (const needed of ['checkout.session.completed', 'checkout.session.expired', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'charge.refunded', 'charge.refund.updated', 'charge.dispute.created', 'charge.dispute.closed']) {
    if (!(e.enabled_events || []).includes(needed) && !(e.enabled_events || []).includes('*')) console.log(`   missing for the new code: ${needed}`);
  }
}
note('C. live api.flacroncv.com endpoint registered here', ours.some((e) => e.livemode && e.status === 'enabled' && /\/api\/v1\/webhooks\/stripe$/.test(e.url)));

// ---- 3. Legacy prices and their subscribers -------------------------------------------------------
const priceIds = (args.prices ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (priceIds.some((p) => !/^price_[A-Za-z0-9]+$/.test(p))) fail('--prices must be four price_… ids separated by commas');
console.log(`3. Legacy prices (${priceIds.length} given)`);
let pricesOk = priceIds.length === 4;
for (const id of priceIds) {
  const p = await stripe(`/v1/prices/${id}`);
  if (p.status !== 200) { pricesOk = false; console.log(`   ${id}: NOT FOUND in this account (${p.status})`); continue; }
  const pr = p.body;
  if (!pr.livemode) pricesOk = false;
  const productId = typeof pr.product === 'string' ? pr.product : pr.product?.id;
  const product = ID.test(productId ?? '') ? await stripe(`/v1/products/${productId}`) : { body: {} };
  const subs = await listAll('/v1/subscriptions', { price: id, status: 'all' });
  const byStatus = subs.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});
  console.log(`   ${id}: live=${pr.livemode} active=${pr.active} ${pr.currency} ${(pr.unit_amount / 100).toFixed(2)}/${pr.recurring?.interval ?? 'one_time'} product="${product.body?.name ?? '?'}" product_active=${product.body?.active ?? '?'} app_id=${pr.metadata?.app_id ?? 'none'}`);
  console.log(`   subscriptions on this price: ${subs.length} ${JSON.stringify(byStatus)}`);
}
note('D. all four deployed legacy prices exist here in live mode', priceIds.length ? pricesOk : null, priceIds.length === 4 ? '' : 'pass --prices with exactly four ids');

// ---- 4. Three existing FlacronCV subscribers from production Firestore ----------------------------
if (args.firestore === 'true') {
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId: 'flacron-cv' });
  // Projection: only these three fields leave Firestore — no names, emails or other profile data.
  const snap = await getFirestore().collection('users')
    .where('subscription.plan', 'in', ['pro', 'enterprise', 'career_accelerator'])
    .select('subscription.plan', 'subscription.stripeCustomerId', 'subscription.stripeSubscriptionId')
    .limit(25).get();
  const sample = snap.docs.map((d) => d.get('subscription') ?? {})
    .filter((s) => ID.test(s.stripeCustomerId ?? '') && ID.test(s.stripeSubscriptionId ?? '')).slice(0, 3);
  console.log(`4. Production legacy subscribers: ${snap.size} matched (first 25), ${sample.length} sampled with both Stripe ids`);
  let found = 0;
  for (const s of sample) {
    const c = await stripe(`/v1/customers/${s.stripeCustomerId}`);
    const sub = await stripe(`/v1/subscriptions/${s.stripeSubscriptionId}`);
    const subCustomer = typeof sub.body?.customer === 'string' ? sub.body.customer : sub.body?.customer?.id;
    const price = sub.body?.items?.data?.[0]?.price?.id;
    // 403 = the key may not read customers (unknown), 404 = not in this account. A live subscription of this
    // account that names the stored customer also proves that customer is in this account.
    const cUnchecked = c.status === 403;
    const cOk = (c.status === 200 && !c.body.deleted && c.body.livemode === true) || cUnchecked;
    const sOk = sub.status === 200 && sub.body.livemode === true && subCustomer === s.stripeCustomerId;
    if (cOk && sOk) found++;
    console.log(`   plan=${s.plan} customer ${short(s.stripeCustomerId)}: ${cUnchecked ? 'not readable by this key (proved via its subscription)' : c.status === 200 && !c.body.deleted && c.body.livemode ? 'found here (live)' : c.status === 200 && c.body.deleted ? 'deleted' : `NOT in this account (${c.status})`}; ` +
      `subscription ${short(s.stripeSubscriptionId)}: ${sub.status === 200 ? `status=${sub.body.status} same customer=${subCustomer === s.stripeCustomerId ? 'yes' : 'NO'} app_id=${sub.body.metadata?.app_id ?? 'none'} on a deployed legacy price=${priceIds.includes(price) ? 'yes' : 'NO'}` : `NOT in this account (${sub.status})`}`);
  }
  note('E. live API\'s stored customers/subscriptions exist here', sample.length ? found === sample.length : false, `${found}/${sample.length}`);
} else {
  console.log('4. Firestore sample skipped (add --firestore).');
  note('E. Firestore-to-Stripe mappings', null);
}

// ---- Verdict --------------------------------------------------------------------------------------
const disagree = evidence.filter((e) => e.ok === false);
const missing = evidence.filter((e) => e.ok === null);
console.log('');
if (disagree.length) console.log(`STOP: evidence disagrees (${disagree.map((e) => e.label.slice(0, 1)).join(', ')}). Do not treat ${account ?? 'this account'} as FlacronCV's live account until this is explained.`);
else if (missing.length) console.log(`INCOMPLETE: ${account} agrees on everything checked, but ${missing.map((e) => e.label.slice(0, 1)).join(', ')} not run.`);
else console.log(`ACCOUNT VERIFIED: ${account} — Stripe, the Dashboard, the webhook, the deployed prices and the live API's stored records all agree.`);
console.log('Nothing was created, changed or deleted.');
process.exitCode = disagree.length ? 1 : 0;
