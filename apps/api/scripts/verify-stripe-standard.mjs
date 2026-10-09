#!/usr/bin/env node
/**
 * End-to-end check of the Flacron Stripe standard against a DEPLOYED FlacronCV
 * API, in Stripe TEST mode. Real Stripe objects are created on a test clock;
 * their webhooks reach the deployed API; the script then reads the API's
 * Firestore ledger and asserts what it recorded.
 *
 * Covers: checkout session metadata (via the real API), subscription creation,
 * renewal (test clock), upgrade, downgrade, cancellation, failed payment (no
 * paid access), partial refund (gross/refund/net), duplicate webhook delivery,
 * forged-signature rejection, another app's events blocked, and ledger totals
 * reconciled with Stripe.
 *
 * Everything it creates is tagged qa_run=<id> and removed with --cleanup
 * (default on). Refuses a live key.
 *
 * Env (never printed): STRIPE_SECRET_KEY (test), FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_WEB_API_KEY,
 * API_URL (e.g. https://api.flacroncv.com/api/v1), WEBHOOK_ENDPOINT_ID (we_…).
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const APP_ID = process.env.APP_ID?.trim() || 'flacron-cv';
const FOREIGN_APP = 'flacron-qa-foreign';
const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
if (!/^(sk|rk)_test_/.test(key)) throw new Error('verify-stripe-standard runs in TEST mode only.');
const API_URL = process.env.API_URL?.replace(/\/$/, '');
const WEBHOOK_ENDPOINT_ID = process.env.WEBHOOK_ENDPOINT_ID;
const keepData = process.argv.includes('--keep');
const RUN = `qa${Date.now().toString(36)}`;
const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ─── helpers ────────────────────────────────────────────────────────────────
function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof v === 'object') form(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}
async function stripe(method, path, params) {
  const body = form(params);
  const res = await fetch('https://api.stripe.com' + path + (method === 'GET' ? `?${body}` : ''), {
    method,
    headers: { Authorization: auth, 'Stripe-Version': '2024-04-10', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error?.message}`);
  return json;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(label, fn, timeoutMs = 90_000) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(3000);
  }
}
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const ledger = async (col, field, value) =>
  (await db.collection(col).where(field, '==', value).get()).docs.map((d) => d.data());
const money = (n) => `$${(n / 100).toFixed(2)}`;

// ─── setup ──────────────────────────────────────────────────────────────────
const prices = (await stripe('GET', '/v1/prices', { limit: 100, active: true })).data.filter((p) => p.metadata?.app_id === APP_ID);
const price = (plan) => prices.find((p) => p.metadata.fcv_plan === plan && p.metadata.fcv_interval === 'monthly');
const PRO = price('pro');
const ENT = price('enterprise');
check('catalog: FlacronCV Pro/Enterprise monthly prices are tagged app_id', PRO && ENT, `${PRO?.id} ${ENT?.id}`);

const created = { users: [], authUsers: [], customers: [], clocks: [] };
const clock = await stripe('POST', '/v1/test_helpers/test_clocks', { frozen_time: Math.floor(Date.now() / 1000), name: `FlacronCV ${RUN}` });
created.clocks.push(clock.id);

async function makeUser(suffix) {
  const uid = `${RUN}-${suffix}`;
  await db.collection('users').doc(uid).set({
    uid,
    email: `${uid}@qa.flacroncv.invalid`,
    displayName: `QA ${suffix}`,
    role: 'user',
    qa_run: RUN,
    subscription: { plan: 'free', status: 'active', stripeCustomerId: null },
    usage: { aiCreditsUsed: 0, aiCreditsLimit: 5, exportsThisMonth: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.users.push(uid);
  return uid;
}
async function makeCustomer(uid, appId, paymentMethod) {
  const customer = await stripe('POST', '/v1/customers', {
    email: `${uid}@qa.flacroncv.invalid`,
    test_clock: clock.id,
    metadata: { app_id: appId, internal_user_id: uid, firebaseUid: uid, qa_run: RUN },
  });
  created.customers.push(customer.id);
  const pm = await stripe('POST', `/v1/payment_methods/${paymentMethod}/attach`, { customer: customer.id }).catch(async () => {
    // pm_card_* tokens attach by creating a fresh PM
    return stripe('POST', '/v1/payment_methods/' + paymentMethod + '/attach', { customer: customer.id });
  });
  await stripe('POST', `/v1/customers/${customer.id}`, { invoice_settings: { default_payment_method: pm.id } });
  if (appId === APP_ID) await db.collection('users').doc(uid).update({ 'subscription.stripeCustomerId': customer.id });
  return customer;
}
const meta = (uid, appId = APP_ID) => ({ app_id: appId, internal_user_id: uid, firebaseUid: uid, qa_run: RUN });

try {
  // ── 1. Checkout through the real API: metadata on session + subscription ──
  if (API_URL && process.env.FIREBASE_WEB_API_KEY) {
    const uid = await makeUser('checkout');
    const authUser = await admin.auth().createUser({ uid, email: `${uid}@qa.flacroncv.invalid`, emailVerified: true });
    created.authUsers.push(authUser.uid);
    const custom = await admin.auth().createCustomToken(uid);
    const tok = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.FIREBASE_WEB_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
    })).json();
    const res = await fetch(`${API_URL}/payments/create-checkout-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro', interval: 'monthly', successUrl: 'https://www.flacroncv.com/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'https://www.flacroncv.com/settings/billing?canceled=true' }),
    });
    const body = await res.json();
    const sessionId = body?.data?.sessionId ?? body?.sessionId;
    check('checkout: API creates a session', res.ok && sessionId, `HTTP ${res.status}`);
    if (sessionId) {
      const s = await stripe('GET', `/v1/checkout/sessions/${sessionId}`, { 'expand[]': 'line_items' });
      check('checkout: session metadata app_id + internal_user_id', s.metadata?.app_id === APP_ID && s.metadata?.internal_user_id === uid);
      check('checkout: client_reference_id is the user', s.client_reference_id === uid);
      check('checkout: charges the FlacronCV Pro price', s.line_items?.data?.[0]?.price?.id === PRO.id);
      const cust = await stripe('GET', `/v1/customers/${s.customer}`);
      created.customers.push(cust.id);
      check('checkout: customer stamped app_id', cust.metadata?.app_id === APP_ID);
      await stripe('POST', `/v1/checkout/sessions/${sessionId}/expire`).catch(() => {});
      // subscription_data.metadata is not readable on an unpaid session; it is asserted in unit tests
    }
  } else {
    console.log('SKIP  checkout through the API (API_URL / FIREBASE_WEB_API_KEY not set)');
  }

  // ── 2. Subscription creation (as Checkout would create it) ─────────────────
  const uidA = await makeUser('payer');
  const custA = await makeCustomer(uidA, APP_ID, 'pm_card_visa');
  const subA = await stripe('POST', '/v1/subscriptions', { customer: custA.id, items: [{ price: PRO.id }], metadata: meta(uidA) });
  const firstPayment = await waitFor('first payment in ledger', async () => (await ledger('billing_payments', 'customer_id', custA.id)).find((p) => p.status === 'succeeded'));
  check('subscription: first invoice recorded as succeeded payment', firstPayment.amount === PRO.unit_amount && firstPayment.application_id === APP_ID, money(firstPayment.amount));
  const piA = await stripe('GET', `/v1/payment_intents/${firstPayment.stripe_payment_id}`);
  check('subscription: renewal PaymentIntent stamped app_id in Stripe', piA.metadata?.app_id === APP_ID);
  const subRow = await waitFor('subscription row', async () => (await ledger('billing_subscriptions', 'stripe_subscription_id', subA.id))[0]);
  check('subscription: ledger row with application_id', subRow.application_id === APP_ID && subRow.status === 'active');

  // ── 3. Upgrade / downgrade ──────────────────────────────────────────────────
  const itemId = subA.items.data[0].id;
  await stripe('POST', `/v1/subscriptions/${subA.id}`, { items: [{ id: itemId, price: ENT.id }], proration_behavior: 'none' });
  await waitFor('upgrade applied', async () => (await db.collection('users').doc(uidA).get()).data()?.subscription?.plan === 'enterprise');
  check('upgrade: user plan → enterprise', true);
  await stripe('POST', `/v1/subscriptions/${subA.id}`, { items: [{ id: itemId, price: PRO.id }], proration_behavior: 'none' });
  await waitFor('downgrade applied', async () => (await db.collection('users').doc(uidA).get()).data()?.subscription?.plan === 'pro');
  check('downgrade: user plan → pro', true);

  // ── 4. Renewal (advance the test clock past the period end) ────────────────
  const periodEnd = (await stripe('GET', `/v1/subscriptions/${subA.id}`)).current_period_end;
  await stripe('POST', `/v1/test_helpers/test_clocks/${clock.id}/advance`, { frozen_time: periodEnd + 3600 });
  await waitFor('clock ready', async () => (await stripe('GET', `/v1/test_helpers/test_clocks/${clock.id}`)).status === 'ready', 180_000);
  const renewal = await waitFor('renewal payment', async () => {
    const rows = (await ledger('billing_payments', 'customer_id', custA.id)).filter((p) => p.status === 'succeeded');
    return rows.length >= 2 ? rows : null;
  }, 180_000);
  check('renewal: second succeeded payment recorded', renewal.length >= 2, `${renewal.length} payments`);

  // ── 5. Partial refund ───────────────────────────────────────────────────────
  const refundAmount = 1000;
  const refund = await stripe('POST', '/v1/refunds', { payment_intent: firstPayment.stripe_payment_id, amount: refundAmount, metadata: { app_id: APP_ID, qa_run: RUN } });
  const refundRow = await waitFor('refund row', async () => (await ledger('billing_refunds', 'stripe_refund_id', refund.id))[0]);
  check('refund: recorded with application_id + payment_id', refundRow.application_id === APP_ID && refundRow.payment_id === firstPayment.stripe_payment_id && refundRow.amount === refundAmount);
  const userAfterRefund = (await db.collection('users').doc(uidA).get()).data();
  check('refund: partial refund keeps paid access', userAfterRefund.subscription.plan === 'pro');

  // ── 6. Failed payment ───────────────────────────────────────────────────────
  const uidB = await makeUser('declined');
  const custB = await makeCustomer(uidB, APP_ID, 'pm_card_chargeCustomerFail');
  const subB = await stripe('POST', '/v1/subscriptions', { customer: custB.id, items: [{ price: PRO.id }], metadata: meta(uidB), payment_behavior: 'allow_incomplete' });
  const failedRow = await waitFor('failed payment row', async () => (await ledger('billing_payments', 'customer_id', custB.id)).find((p) => p.status === 'failed'));
  check('failed payment: stored as failed with app_id', failedRow.application_id === APP_ID, failedRow.failure_message ?? '');
  const userB = (await db.collection('users').doc(uidB).get()).data();
  check('failed payment: no paid access granted', userB.subscription.plan === 'free', `plan=${userB.subscription.plan} status=${userB.subscription.status}`);
  await stripe('DELETE', `/v1/subscriptions/${subB.id}`).catch(() => {});

  // ── 7. Another application's subscription is blocked ───────────────────────
  const uidF = `${RUN}-foreign`;
  const custF = await makeCustomer(uidF, FOREIGN_APP, 'pm_card_visa');
  const subF = await stripe('POST', '/v1/subscriptions', { customer: custF.id, items: [{ price: PRO.id }], metadata: meta(uidF, FOREIGN_APP) });
  await sleep(15000);
  const foreignRows = await ledger('billing_subscriptions', 'stripe_subscription_id', subF.id);
  check('isolation: foreign-app subscription not stored', foreignRows.length === 0);
  const foreignEvents = (await db.collection('payment_events').where('object_id', '==', subF.id).get()).docs.map((d) => d.data());
  const invF = (await stripe('GET', '/v1/invoices', { subscription: subF.id, limit: 1 })).data[0];
  const foreignInvoiceEvents = invF ? (await db.collection('payment_events').where('object_id', '==', invF.id).get()).docs.map((d) => d.data()) : [];
  const mismatches = [...foreignEvents, ...foreignInvoiceEvents].filter((e) => e.outcome === 'app_mismatch');
  check('isolation: foreign-app events recorded as app_mismatch', mismatches.length > 0, `${mismatches.length} events`);
  await stripe('DELETE', `/v1/subscriptions/${subF.id}`).catch(() => {});

  // ── 8. Duplicate delivery ──────────────────────────────────────────────────
  if (WEBHOOK_ENDPOINT_ID) {
    const evt = (await stripe('GET', '/v1/events', { type: 'invoice.paid', limit: 20 })).data.find((e) => e.data.object.customer === custA.id);
    const before = (await db.collection('payment_events').doc(evt.id).get()).data();
    await stripe('POST', `/v1/events/${evt.id}/retry`, { webhook_endpoint: WEBHOOK_ENDPOINT_ID }).catch((e) => console.log(`  (retry API: ${e.message})`));
    await sleep(8000);
    const after = (await db.collection('payment_events').doc(evt.id).get()).data();
    const paymentsAfter = (await ledger('billing_payments', 'customer_id', custA.id)).filter((p) => p.status === 'succeeded');
    check('idempotency: redelivered event not re-applied', before?.status === 'processed' && after?.processedAt?.isEqual?.(before.processedAt) && paymentsAfter.length === renewal.length);
  }

  // ── 9. Forged signature is rejected ────────────────────────────────────────
  if (API_URL) {
    const res = await fetch(`${API_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
      body: JSON.stringify({ id: 'evt_forged', type: 'invoice.paid', data: { object: {} } }),
    });
    check('signature: forged webhook rejected with 400', res.status === 400, `HTTP ${res.status}`);
  }

  // ── 10. Cancellation ───────────────────────────────────────────────────────
  await stripe('DELETE', `/v1/subscriptions/${subA.id}`);
  await waitFor('cancellation applied', async () => (await db.collection('users').doc(uidA).get()).data()?.subscription?.plan === 'free');
  const cancelledRow = (await ledger('billing_subscriptions', 'stripe_subscription_id', subA.id))[0];
  check('cancellation: user → free, ledger status canceled', cancelledRow?.status === 'canceled');

  // ── 11. Reconcile ledger with Stripe ───────────────────────────────────────
  const charges = (await stripe('GET', '/v1/charges', { customer: custA.id, limit: 100 })).data;
  const stripeGross = charges.filter((c) => c.status === 'succeeded').reduce((s, c) => s + c.amount_captured, 0);
  const stripeRefunded = charges.reduce((s, c) => s + c.amount_refunded, 0);
  const ledgerPayments = (await ledger('billing_payments', 'customer_id', custA.id)).filter((p) => p.status === 'succeeded');
  const ledgerGross = ledgerPayments.reduce((s, p) => s + p.amount, 0);
  const ledgerRefunds = (await Promise.all(ledgerPayments.map((p) => ledger('billing_refunds', 'payment_id', p.stripe_payment_id))))
    .flat().filter((r) => r.status === 'succeeded').reduce((s, r) => s + r.amount, 0);
  check('reconcile: gross matches Stripe', ledgerGross === stripeGross, `${money(ledgerGross)} vs ${money(stripeGross)}`);
  check('reconcile: refunds match Stripe', ledgerRefunds === stripeRefunded, `${money(ledgerRefunds)} vs ${money(stripeRefunded)}`);
  check('reconcile: net = gross − refunds', ledgerGross - ledgerRefunds === stripeGross - stripeRefunded, money(ledgerGross - ledgerRefunds));
  const allApps = (await db.collection('billing_payments').where('livemode', '==', false).get()).docs.map((d) => d.data());
  check('filtering: every ledger payment carries an application_id', allApps.every((p) => !!p.application_id), `${allApps.length} rows`);
  check('filtering: no foreign-app rows in FlacronCV ledger', allApps.every((p) => p.application_id === APP_ID));
} finally {
  if (!keepData) {
    console.log(`\ncleanup ${RUN} …`);
    const qaCustomers = new Set(created.customers);
    for (const col of ['billing_payments', 'billing_subscriptions', 'billing_invoices', 'billing_customers']) {
      const field = col === 'billing_subscriptions' || col === 'billing_invoices' || col === 'billing_customers' ? 'stripe_customer_id' : 'customer_id';
      for (const c of qaCustomers) for (const d of (await db.collection(col).where(field, '==', c).get()).docs) await d.ref.delete();
    }
    for (const d of (await db.collection('billing_refunds').where('livemode', '==', false).get()).docs) {
      const r = d.data();
      const pay = r.payment_id ? await stripe('GET', `/v1/payment_intents/${r.payment_id}`).catch(() => null) : null;
      if (pay && qaCustomers.has(pay.customer)) await d.ref.delete();
    }
    for (const uid of created.users) {
      for (const d of (await db.collection('subscriptions').where('userId', '==', uid).get()).docs) await d.ref.delete();
      await db.collection('users').doc(uid).delete();
    }
    for (const uid of created.authUsers) await admin.auth().deleteUser(uid).catch(() => {});
    for (const id of created.clocks) await stripe('DELETE', `/v1/test_helpers/test_clocks/${id}`).catch(() => {});
    for (const id of created.customers) await stripe('DELETE', `/v1/customers/${id}`).catch(() => {});
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}
