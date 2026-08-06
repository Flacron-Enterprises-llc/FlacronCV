/**
 * Reconciles a user's Firestore subscription block against Stripe.
 *
 * WHY THIS EXISTS: entitlements are read from the Firestore `subscription`
 * block, but the money lives in Stripe. Those two drift — switching
 * STRIPE_SECRET_KEY between test and live mode (or between accounts), deleting
 * a customer from the Dashboard, or hand-editing a plan in the console all
 * leave Firestore claiming a paid plan that Stripe has no record of. The user
 * then sees "Enterprise Plan — Active" on a billing page whose Manage
 * Subscription button cannot work, because there is no customer behind it.
 *
 * Stripe is treated as the source of truth. Firestore is corrected to match.
 *
 *     node scripts/reconcile-subscription.mjs someone@example.com
 *     node scripts/reconcile-subscription.mjs someone@example.com --apply
 *
 * DRY RUN BY DEFAULT — without --apply it only reports the diff and writes
 * nothing. Run it once without the flag and read the plan before applying.
 *
 * It searches Stripe by email and by the firebaseUid metadata as well as by the
 * stored id, so a user whose customer exists under a DIFFERENT id gets relinked
 * to their real billing history rather than reset to free.
 *
 * ⚠️ --apply writes to whichever Firebase project apps/api/.env points at — for
 * you that is PRODUCTION. It only touches the named user's `subscription` block
 * and `usage.aiCreditsLimit`; nothing else, and no other user.
 */
import fs from 'fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

// Resolved from THIS file, not cwd, so `node apps/api/scripts/...` works from
// the repo root as well as from apps/api.
const require = createRequire(import.meta.url);
const Stripe = require('stripe');
const { PLAN_CONFIGS, SubscriptionPlan, SubscriptionStatus } = require('@flacroncv/shared-types');

const email = process.argv[2];
const apply = process.argv.includes('--apply');

if (!email || !email.includes('@')) {
  console.error(
    '\n✖ Usage: node scripts/reconcile-subscription.mjs <email> [--apply]\n' +
      '  An email is required — this script never picks a default account.\n',
  );
  process.exit(1);
}

/**
 * Minimal .env reader that understands QUOTED MULTI-LINE values — required
 * because FIREBASE_PRIVATE_KEY is a PEM block. A naive line-by-line parser
 * truncates it at the first newline and firebase-admin then fails with
 * "Invalid PEM formatted message". (Same reader as grant-admin.mjs; the \r in
 * the trailing class matters because this .env is CRLF.)
 */
function loadEnv(url) {
  const raw = fs.readFileSync(url, 'utf8');
  const out = {};
  const re =
    /^[ \t]*([A-Za-z0-9_]+)[ \t]*=[ \t]*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\r\n]*))[ \t\r]*$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\\n/g, '\n');
  }
  return out;
}

const env = loadEnv(new URL('../.env', import.meta.url));

if (!env.STRIPE_SECRET_KEY) {
  console.error('\n✖ STRIPE_SECRET_KEY not found in .env — cannot establish the truth to reconcile against.\n');
  process.exit(1);
}

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

const keyMode = env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'test';

console.log(`\nFirebase project : ${env.FIREBASE_PROJECT_ID}`);
console.log(`Stripe mode      : ${keyMode}`);
console.log(`User             : ${email}`);
console.log(`Mode             : ${apply ? 'APPLY (will write)' : 'dry run (no writes)'}\n`);

// ── 1. The stored state ──────────────────────────────────────────────────────

const authUser = await admin.auth().getUserByEmail(email);
const userRef = admin.firestore().collection('users').doc(authUser.uid);
const snap = await userRef.get();

if (!snap.exists) {
  console.error(`✖ No Firestore user document for uid ${authUser.uid}.`);
  process.exit(1);
}

const stored = snap.data().subscription ?? {};
console.log('Firestore says:');
console.log(`  plan                 : ${stored.plan ?? '(unset)'}`);
console.log(`  status               : ${stored.status ?? '(unset)'}`);
console.log(`  stripeCustomerId     : ${stored.stripeCustomerId ?? '(none)'}`);
console.log(`  stripeSubscriptionId : ${stored.stripeSubscriptionId ?? '(none)'}\n`);

// ── 2. What Stripe actually has ──────────────────────────────────────────────

/** Stripe's "that id does not exist here" — distinct from an outage. */
const isMissing = (err) =>
  err?.code === 'resource_missing' || (err?.type === 'StripeInvalidRequestError' && err?.statusCode === 404);

/** The stored customer, or null if Stripe no longer knows it. Outages rethrow. */
async function resolveStored(id) {
  if (!id) return null;
  try {
    const customer = await stripe.customers.retrieve(id);
    // A deleted customer RESOLVES rather than throwing; `deleted` is the tell.
    return customer.deleted ? null : customer;
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

const candidates = new Map();

const storedCustomer = await resolveStored(stored.stripeCustomerId);
if (storedCustomer) candidates.set(storedCustomer.id, storedCustomer);

// Look beyond the stored id: the user may have a perfectly good customer under
// a different one (a re-created record, a second checkout). Resetting them to
// free without checking would discard real billing history.
const byEmail = await stripe.customers.list({ email, limit: 100 });
for (const c of byEmail.data) {
  if (c.deleted) continue;
  if (c.metadata?.firebaseUid && c.metadata.firebaseUid !== authUser.uid) continue;
  candidates.set(c.id, c);
}

console.log(`Stripe has ${candidates.size} customer(s) for this user:`);
for (const c of candidates.values()) {
  const linked = c.id === stored.stripeCustomerId ? '  <- the stored id' : '';
  console.log(`  ${c.id}${linked}`);
}
if (stored.stripeCustomerId && !candidates.has(stored.stripeCustomerId)) {
  console.log(`  ${stored.stripeCustomerId}  <- STORED BUT MISSING (this is what returned "No such customer")`);
}
console.log('');

/** Live first, then anything else — a canceled sub still tells us the plan. */
const RANK = { active: 0, trialing: 0, past_due: 1, unpaid: 2, incomplete: 3 };
let best = null;

for (const c of candidates.values()) {
  const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 100 });
  for (const s of subs.data) {
    const rank = RANK[s.status] ?? 9;
    if (!best || rank < best.rank) best = { rank, sub: s, customer: c };
  }
}

// ── 3. What Firestore SHOULD say ─────────────────────────────────────────────

const STATUS_MAP = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  incomplete: SubscriptionStatus.INCOMPLETE,
};

function planForPrice(priceId) {
  for (const [plan, config] of Object.entries(PLAN_CONFIGS)) {
    if (priceId && (priceId === config.stripePriceIdMonthly || priceId === config.stripePriceIdYearly)) return plan;
  }
  if (priceId === env.STRIPE_PRO_MONTHLY_PRICE_ID || priceId === env.STRIPE_PRO_YEARLY_PRICE_ID) {
    return SubscriptionPlan.PRO;
  }
  if (priceId === env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || priceId === env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) {
    return SubscriptionPlan.ENTERPRISE;
  }
  return null;
}

let target;
let reason;

// Only 'active' and 'trialing' grant paid access — the same rule verifySession
// enforces. A past_due or canceled subscription must NOT restore a paid plan.
if (best && (best.sub.status === 'active' || best.sub.status === 'trialing')) {
  const priceId = best.sub.items.data[0]?.price?.id;
  const plan = planForPrice(priceId);
  if (!plan) {
    console.error(
      `\n✖ Subscription ${best.sub.id} is live on price ${priceId}, which matches no configured plan.\n` +
        '  Refusing to guess an entitlement level. Add the price id to PLAN_CONFIGS or .env and re-run.\n',
    );
    process.exit(1);
  }
  target = {
    plan,
    status: STATUS_MAP[best.sub.status] ?? SubscriptionStatus.CANCELED,
    stripeCustomerId: best.customer.id,
    stripeSubscriptionId: best.sub.id,
    currentPeriodEnd: new Date(best.sub.current_period_end * 1000),
    cancelAtPeriodEnd: best.sub.cancel_at_period_end === true,
  };
  reason = `live ${best.sub.status} subscription ${best.sub.id} on customer ${best.customer.id}`;
} else {
  target = {
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.ACTIVE,
    // Keep a customer if one genuinely exists — it carries their payment
    // methods and invoice history, and re-using it keeps that continuous.
    stripeCustomerId: candidates.size > 0 ? [...candidates.keys()][0] : null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
  reason = best
    ? `no live subscription (best found is ${best.sub.id}, status ${best.sub.status})`
    : 'no subscription of any kind in Stripe';
}

const aiCreditsLimit = PLAN_CONFIGS[target.plan].limits.aiCredits;

console.log(`Reconciled state — ${reason}:\n`);
// Firestore hands dates back as Timestamps; normalise both sides to ISO or the
// diff reports every date as changed when nothing moved.
const show = (v) => {
  if (v === null || v === undefined) return '(none)';
  if (v instanceof Date) return v.toISOString();
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return String(v);
};
for (const [k, v] of Object.entries(target)) {
  const before = show(stored[k] ?? null);
  const after = show(v);
  const changed = before !== after;
  console.log(`  ${k.padEnd(21)}: ${before}${changed ? `  ->  ${after}` : '   (unchanged)'}`);
}
console.log(`  ${'usage.aiCreditsLimit'.padEnd(21)}: -> ${aiCreditsLimit}\n`);

// ── 4. Write, only when asked ────────────────────────────────────────────────

if (!apply) {
  console.log('Dry run — nothing was written. Re-run with --apply to make these changes.\n');
  process.exit(0);
}

await userRef.set(
  {
    subscription: target,
    usage: { aiCreditsLimit },
    updatedAt: new Date(),
  },
  { merge: true },
);

console.log(`✔ Updated users/${authUser.uid}`);
console.log(`
NEXT STEP — the billing page caches the profile, so reload it (or sign out and
back in) to see the corrected plan:

   http://localhost:3000/en/settings/billing
`);

process.exit(0);
