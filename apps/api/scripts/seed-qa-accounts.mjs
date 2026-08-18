/**
 * Seeds the QA account set — one working account per plan, plus admin accounts.
 *
 * WHY THIS EXISTS: QA needs to sign in as a Pro/Enterprise/admin user without
 * paying, without waiting for a verification email, and without hand-editing
 * Firestore. Hand-editing is specifically what this replaces: entitlements are
 * read from the Firestore `subscription` block, but Stripe holds the money, and
 * a plan written into Firestore with no Stripe subscription behind it produces
 * an account whose billing page says "Enterprise — Active" over a Manage
 * Subscription button that cannot work (see reconcile-subscription.mjs, which
 * exists to clean up exactly that mess).
 *
 * So this script creates BOTH sides and keeps them consistent:
 *   Firebase Auth user (email verified, known password)
 *   + Firestore users/{uid} document in the same shape UsersService.create writes
 *   + a real Stripe customer with a test card attached
 *   + a real Stripe subscription on the plan's configured price
 *   + users/{uid}.subscription and subscriptions/{id} written exactly as
 *     PaymentService.handleCheckoutCompleted would write them.
 *
 * The result is an account indistinguishable from one that signed up and paid,
 * so the customer portal, invoice list, upgrade, downgrade and cancel flows all
 * work against it — and `reconcile-subscription.mjs` reports it as clean.
 *
 *     node scripts/seed-qa-accounts.mjs                 # dry run, writes nothing
 *     node scripts/seed-qa-accounts.mjs --apply
 *     node scripts/seed-qa-accounts.mjs --apply --only pro-monthly
 *
 * DRY RUN BY DEFAULT — without --apply it reports what it would do and writes
 * nothing to Firebase or Stripe. Run it once bare and read the plan.
 *
 * ⚠️ --apply writes to whichever Firebase project apps/api/.env points at — for
 * you that is PRODUCTION. It creates real user accounts there. It refuses to
 * touch a LIVE Stripe key (real money) unless --allow-live is passed.
 */
import fs from 'fs';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

// Resolved from THIS file, not cwd, so `node apps/api/scripts/...` works from
// the repo root as well as from apps/api.
const require = createRequire(import.meta.url);
const Stripe = require('stripe');
const {
  PLAN_CONFIGS,
  SubscriptionPlan,
  SubscriptionStatus,
  TRIAL_PERIOD_DAYS,
} = require('@flacroncv/shared-types');

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const apply = has('--apply');
const check = has('--check');
const allowLive = has('--allow-live');
const withTrial = has('--with-trial');
const skipStripe = has('--no-stripe');
const only = valueOf('--only', null);
const password = valueOf('--password', 'FlacronQA#2026');
const domain = valueOf('--domain', 'flacroncv.com');

if (has('--help') || has('-h')) {
  console.log(`
Usage: node scripts/seed-qa-accounts.mjs [options]

  --apply            Actually create things (default: dry run, writes nothing)
  --check            Report whether each account already exists and what state
                     it is in. Read-only; creates and changes nothing.
  --only <key>       Seed a single account by key (see the table it prints)
  --password <pw>    Password for every seeded account (default: FlacronQA#2026)
  --domain <d>       Email domain for the accounts    (default: flacroncv.com)
  --with-trial       Start paid subscriptions in the product's ${TRIAL_PERIOD_DAYS}-day trial
                     instead of charging the test card now (status: trialing)
  --no-stripe        Skip Stripe entirely; grant plans in Firestore only.
                     Faster, but "Manage Subscription" will not work.
  --allow-live       Permit running against a LIVE Stripe key. Real money.
`);
  process.exit(0);
}

// ── Environment ──────────────────────────────────────────────────────────────

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

if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
  console.error('\n✖ Firebase service-account vars missing from apps/api/.env — cannot continue.\n');
  process.exit(1);
}

const stripeMode = (env.STRIPE_SECRET_KEY || '').startsWith('sk_live') ? 'LIVE' : 'test';
const useStripe = !skipStripe && !!env.STRIPE_SECRET_KEY;

// A seeding script that quietly created live subscriptions would bill real
// cards. Refuse by default and make the operator say so out loud.
if (useStripe && stripeMode === 'LIVE' && !allowLive) {
  console.error(
    '\n✖ STRIPE_SECRET_KEY is a LIVE key. Creating subscriptions with it charges real cards.\n' +
      '  Re-run with --no-stripe to grant plans in Firestore only, or --allow-live if you\n' +
      '  genuinely intend to create live subscriptions.\n',
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

const auth = admin.auth();
const db = admin.firestore();
// Pinned to the same version PaymentService uses, so `current_period_end` and
// friends sit where this script expects them.
const stripe = useStripe ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' }) : null;

// ── The account set ──────────────────────────────────────────────────────────

/**
 * `stripe: false` means the plan is granted in Firestore with no subscription
 * behind it. That is only correct for career_accelerator, which deliberately
 * has NO Stripe price configured (PLAN_CONFIGS marks it "coming soon"), so
 * there is nothing to subscribe to. Every other paid account gets a real one.
 *
 * The two admin accounts carry paid plans because role does NOT bypass plan
 * limits anywhere — every quota check goes through
 * `resolveEffectivePlan(user.subscription)`, so an admin on the free plan hits
 * the free caps while testing.
 */
const ACCOUNTS = [
  { key: 'free',                local: 'qa-free',                name: 'QA Free',            plan: SubscriptionPlan.FREE,               interval: null,    role: 'user' },
  { key: 'pro-monthly',         local: 'qa-pro-monthly',         name: 'QA Pro Monthly',     plan: SubscriptionPlan.PRO,                interval: 'month', role: 'user' },
  { key: 'pro-yearly',          local: 'qa-pro-yearly',          name: 'QA Pro Yearly',      plan: SubscriptionPlan.PRO,                interval: 'year',  role: 'user' },
  { key: 'enterprise-monthly',  local: 'qa-enterprise-monthly',  name: 'QA Ent Monthly',     plan: SubscriptionPlan.ENTERPRISE,         interval: 'month', role: 'user' },
  { key: 'enterprise-yearly',   local: 'qa-enterprise-yearly',   name: 'QA Ent Yearly',      plan: SubscriptionPlan.ENTERPRISE,         interval: 'year',  role: 'user' },
  { key: 'career',              local: 'qa-career',              name: 'QA Career Accel',    plan: SubscriptionPlan.CAREER_ACCELERATOR, interval: null,    role: 'user', stripe: false },
  { key: 'superadmin',          local: 'qa-superadmin',          name: 'QA Super Admin',     plan: SubscriptionPlan.ENTERPRISE,         interval: 'month', role: 'super_admin' },
  { key: 'admin',               local: 'qa-admin',               name: 'QA Admin',           plan: SubscriptionPlan.PRO,                interval: 'month', role: 'admin' },
];

const selected = only ? ACCOUNTS.filter((a) => a.key === only) : ACCOUNTS;
if (only && selected.length === 0) {
  console.error(`\n✖ Unknown --only key "${only}". Valid keys: ${ACCOUNTS.map((a) => a.key).join(', ')}\n`);
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const emailFor = (acct) => `${acct.local}@${domain}`;

/**
 * The Stripe price for a plan at an interval — env first, then PLAN_CONFIGS.
 * Mirrors PaymentService.resolvePriceId exactly: a price id belongs to one
 * Stripe account, so configuration has to outrank the compiled-in default.
 */
function resolvePriceId(plan, interval) {
  const yearly = interval === 'year';
  let fromEnv;
  if (plan === SubscriptionPlan.PRO) {
    fromEnv = yearly ? env.STRIPE_PRO_YEARLY_PRICE_ID : env.STRIPE_PRO_MONTHLY_PRICE_ID;
  }
  if (plan === SubscriptionPlan.ENTERPRISE) {
    fromEnv = yearly ? env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID : env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID;
  }
  const config = PLAN_CONFIGS[plan];
  const fromConfig = yearly ? config?.stripePriceIdYearly : config?.stripePriceIdMonthly;
  return (fromEnv || fromConfig || '').trim() || null;
}

/**
 * A price id does not encode its billing interval, so a MONTH price sitting in
 * a *_YEARLY_PRICE_ID slot subscribes the account to twelve charges a year at
 * the annual rate. That has happened in this project before (see the warning in
 * subscription.types.ts), so verify against Stripe rather than trusting the id.
 */
async function assertPriceMatches(priceId, interval, label) {
  const price = await stripe.prices.retrieve(priceId);
  if (!price.active) throw new Error(`${label}: price ${priceId} is not active in Stripe`);
  const actual = price.recurring?.interval;
  if (actual !== interval) {
    throw new Error(
      `${label}: price ${priceId} bills per ${actual ?? 'one-off'}, but this account wants ${interval}. Refusing.`,
    );
  }
  return price;
}

/** Create the Auth user, or bring an existing one back to the known state. */
async function ensureAuthUser(acct, email) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (apply) {
      await auth.updateUser(existing.uid, {
        password,
        displayName: acct.name,
        // QA must not have to receive mail to get in, and the dashboard layout
        // hard-redirects any unverified user to /verify-email.
        emailVerified: true,
        disabled: false,
      });
    }
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    if (!apply) return { uid: '(new)', created: true };
    const created = await auth.createUser({
      email,
      password,
      displayName: acct.name,
      emailVerified: true,
    });
    return { uid: created.uid, created: true };
  }
}

/**
 * The Firestore document in the shape UsersService.create writes, so a seeded
 * account and a signed-up one are the same thing to every reader.
 *
 * Starts every account on FREE; the paid state is applied afterwards by the
 * same code path shape the Stripe webhook uses. That ordering matters — the
 * customer id must be stored before the subscription exists, because
 * PaymentService.findUserByCustomerId resolves incoming webhook events by
 * querying `subscription.stripeCustomerId`.
 */
async function ensureFirestoreUser(uid, acct, email) {
  const ref = db.collection('users').doc(uid);
  const snap = apply ? await ref.get() : { exists: false, data: () => null };
  const existing = snap.exists ? snap.data() : null;
  const now = new Date();
  const [firstName, ...rest] = acct.name.split(' ');

  const doc = {
    uid,
    email,
    displayName: acct.name,
    photoURL: null,
    phoneNumber: null,
    profile: {
      firstName,
      lastName: rest.join(' '),
      headline: '',
      bio: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
    },
    preferences: {
      language: 'en',
      theme: 'system',
      emailNotifications: true,
      marketingEmails: false,
      defaultCVTemplate: 'modern',
    },
    subscription: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      // Preserved so a re-run relinks to the same Stripe customer instead of
      // orphaning it and creating a second one.
      stripeCustomerId: existing?.subscription?.stripeCustomerId ?? null,
      stripeSubscriptionId: existing?.subscription?.stripeSubscriptionId ?? null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    usage: {
      cvsCreated: 0,
      coverLettersCreated: 0,
      aiCreditsUsed: 0,
      aiCreditsLimit: PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits,
      exportsThisMonth: 0,
      lastExportReset: now,
    },
    role: acct.role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastLoginAt: existing?.lastLoginAt ?? now,
    isActive: true,
    deletedAt: null,
    // AuthService.verifyAndSync mails a welcome message the first time a
    // verified user syncs. These QA addresses may have no mailbox behind them,
    // and every bounce costs SES sender reputation, so mark it already sent.
    welcomeEmailSent: true,
  };

  if (apply) await ref.set(doc, { merge: true });
}

/** Reuse the user's existing Stripe customer if there is one; else create it. */
async function ensureStripeCustomer(uid, acct, email) {
  const found = await stripe.customers.list({ email, limit: 100 });
  for (const c of found.data) {
    if (c.deleted) continue;
    if (c.metadata?.firebaseUid === uid) return { id: c.id, created: false };
  }
  if (!apply) return { id: '(new)', created: true };
  const customer = await stripe.customers.create({
    email,
    name: acct.name,
    metadata: { firebaseUid: uid, seededBy: 'seed-qa-accounts' },
  });
  return { id: customer.id, created: true };
}

/**
 * Attach a test card and make it the default, so the subscription's first
 * invoice is actually paid and the account lands in `active` rather than
 * `incomplete`. `pm_card_visa` is Stripe's always-succeeds test method.
 */
async function ensureDefaultPaymentMethod(customerId) {
  if (!apply) return '(pm_card_visa)';
  const attached = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  let pmId = attached.data[0]?.id;
  if (!pmId) {
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId });
    pmId = pm.id;
  }
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
  return pmId;
}

/** An existing live subscription on the right price, or a newly created one. */
async function ensureSubscription(customerId, uid, priceId, label) {
  if (apply) {
    const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    for (const s of existing.data) {
      if (s.status !== 'active' && s.status !== 'trialing') continue;
      if (s.items.data[0]?.price?.id !== priceId) continue;
      return { sub: s, created: false };
    }
  }

  if (!apply) return { sub: null, created: true };

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    metadata: { firebaseUid: uid, seededBy: 'seed-qa-accounts' },
    // Fail loudly instead of leaving a half-paid `incomplete` subscription that
    // grants nothing and confuses the billing page.
    payment_behavior: 'error_if_incomplete',
    ...(withTrial && TRIAL_PERIOD_DAYS > 0 ? { trial_period_days: TRIAL_PERIOD_DAYS } : {}),
    expand: ['latest_invoice.payment_intent'],
  });

  if (sub.status !== 'active' && sub.status !== 'trialing') {
    throw new Error(`${label}: subscription ${sub.id} came back '${sub.status}', not active/trialing`);
  }
  return { sub, created: true };
}

const STATUS_MAP = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  incomplete: SubscriptionStatus.INCOMPLETE,
};

/**
 * Write the paid state exactly as PaymentService.handleCheckoutCompleted does —
 * the user document AND the mirrored subscriptions/{id} record, in one batch.
 * Any drift between this and the webhook is a bug; keep them in step.
 */
async function applySubscriptionState(uid, sub, plan) {
  const limits = PLAN_CONFIGS[plan].limits;
  const now = new Date();
  const item = sub.items.data[0];
  const status = STATUS_MAP[sub.status] ?? SubscriptionStatus.CANCELED;
  const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const batch = db.batch();

  batch.update(db.collection('users').doc(uid), {
    'subscription.plan': plan,
    'subscription.status': status,
    'subscription.stripeSubscriptionId': sub.id,
    'subscription.stripeCustomerId': customerId,
    'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000),
    'subscription.trialStart': trialStart,
    'subscription.trialEnd': trialEnd,
    'subscription.cancelAtPeriodEnd': false,
    'usage.aiCreditsLimit': limits.aiCredits,
    updatedAt: now,
  });

  batch.set(
    db.collection('subscriptions').doc(sub.id),
    {
      id: sub.id,
      userId: uid,
      stripeCustomerId: customerId,
      plan,
      priceId: item.price.id,
      interval: item.price.recurring?.interval || 'month',
      amount: item.price.unit_amount || 0,
      currency: sub.currency,
      status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAt: null,
      canceledAt: null,
      trialStart,
      trialEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();
}

/**
 * Grant a plan with no Stripe subscription behind it. Only used for
 * career_accelerator, which has no purchasable price. The period end is a year
 * out because `resolveEffectivePlan` downgrades a non-active plan the moment
 * `currentPeriodEnd` passes.
 */
async function applyFirestoreOnlyPlan(uid, plan) {
  const limits = PLAN_CONFIGS[plan].limits;
  const now = new Date();
  const oneYearOut = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  await db.collection('users').doc(uid).set(
    {
      subscription: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: oneYearOut,
        cancelAtPeriodEnd: false,
      },
      usage: { aiCreditsLimit: limits.aiCredits },
      updatedAt: now,
    },
    { merge: true },
  );
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log(`\nFirebase project : ${env.FIREBASE_PROJECT_ID}`);
console.log(`Stripe           : ${useStripe ? `${stripeMode} mode` : 'SKIPPED (--no-stripe)'}`);
console.log(`Password         : ${password}`);
console.log(`Email domain     : @${domain}`);
console.log(`Accounts         : ${selected.map((a) => a.key).join(', ')}`);
console.log(
  `Mode             : ${check ? 'CHECK (read-only)' : apply ? 'APPLY (will write)' : 'dry run (no writes)'}\n`,
);

// ── --check: does any of this actually exist? ────────────────────────────────
//
// The answer to "the password does not work" is almost always "the account was
// never created", and a login failure cannot tell you which: Firebase collapses
// user-not-found, wrong-password and invalid-credential into one error so that
// the form cannot be used to discover who has an account. This asks the
// authoritative source directly.
if (check) {
  let missing = 0;
  for (const acct of selected) {
    const email = emailFor(acct);
    try {
      const user = await auth.getUserByEmail(email);
      const snap = await db.collection('users').doc(user.uid).get();
      const sub = snap.exists ? snap.data().subscription : null;
      console.log(`✔ ${email}`);
      console.log(`    uid            : ${user.uid}`);
      console.log(`    emailVerified  : ${user.emailVerified}${user.emailVerified ? '' : '   ⚠ dashboard will bounce to /verify-email'}`);
      console.log(`    disabled       : ${user.disabled}`);
      console.log(`    custom claims  : ${JSON.stringify(user.customClaims ?? null)}`);
      console.log(`    firestore doc  : ${snap.exists ? `role=${snap.data().role}, plan=${sub?.plan ?? '(unset)'}, status=${sub?.status ?? '(unset)'}` : 'MISSING'}`);
      console.log(`    stripe customer: ${sub?.stripeCustomerId ?? '(none)'}\n`);
    } catch (err) {
      missing += 1;
      if (err.code === 'auth/user-not-found') {
        console.log(`✖ ${email}\n    no such user in Firebase Auth — it was never created\n`);
      } else {
        console.log(`✖ ${email}\n    lookup failed: ${err.message}\n`);
      }
    }
  }
  console.log('─'.repeat(100));
  if (missing === selected.length) {
    console.log(
      `\nNone of the ${selected.length} accounts exist in project ${env.FIREBASE_PROJECT_ID}.\n` +
        'The seeding run did not happen (a bare run without --apply writes nothing).\n' +
        'Create them with:  node scripts/seed-qa-accounts.mjs --apply\n',
    );
  } else if (missing > 0) {
    console.log(`\n${missing} of ${selected.length} accounts are missing — re-run with --apply to fill the gaps.\n`);
  } else {
    console.log('\nAll accounts exist. If a password is rejected, re-run with --apply to reset it.\n');
  }
  process.exit(0);
}

const results = [];

for (const acct of selected) {
  const email = emailFor(acct);
  const label = `${acct.key} (${email})`;
  const row = {
    key: acct.key,
    email,
    plan: acct.plan,
    interval: acct.interval ?? '—',
    role: acct.role,
    uid: '',
    customer: '—',
    subscription: '—',
    status: '',
  };

  try {
    const { uid, created } = await ensureAuthUser(acct, email);
    row.uid = uid;
    console.log(`${created ? '+' : '=' } ${label}`);
    console.log(`    auth user      : ${uid}${created ? ' (created)' : ' (existing, password + verified flag reset)'}`);

    await ensureFirestoreUser(uid, acct, email);
    console.log(`    firestore doc  : users/${uid} (role ${acct.role})`);

    // The custom claim is what FirebaseAuthGuard reads; the Firestore `role`
    // field above only drives the Admin/CRM list rendering. Both are needed.
    if (apply) await auth.setCustomUserClaims(uid, { role: acct.role });
    console.log(`    custom claim   : role=${acct.role}`);

    const wantsStripe = acct.stripe !== false && acct.plan !== SubscriptionPlan.FREE && acct.interval;

    if (acct.plan === SubscriptionPlan.FREE) {
      row.status = 'free plan, no billing';
      console.log(`    plan           : free (nothing to subscribe)\n`);
    } else if (!wantsStripe || !useStripe) {
      await (apply ? applyFirestoreOnlyPlan(uid, acct.plan) : Promise.resolve());
      row.status = 'Firestore-only grant';
      const why = acct.stripe === false ? 'no Stripe price configured for this plan' : '--no-stripe';
      console.log(`    plan           : ${acct.plan} granted in Firestore only (${why})`);
      console.log(`    ⚠  billing     : Manage Subscription will NOT work for this account\n`);
    } else {
      const priceId = resolvePriceId(acct.plan, acct.interval);
      if (!priceId) throw new Error(`${label}: no Stripe price configured for ${acct.plan}/${acct.interval}`);

      const price = apply ? await assertPriceMatches(priceId, acct.interval, label) : null;
      console.log(
        `    price          : ${priceId}${price ? ` (${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()} / ${price.recurring.interval})` : ''}`,
      );

      const customer = await ensureStripeCustomer(uid, acct, email);
      row.customer = customer.id;
      console.log(`    stripe customer: ${customer.id}${customer.created ? ' (created)' : ' (existing)'}`);

      // Store the customer BEFORE the subscription exists: webhook events are
      // matched back to the user by this exact field.
      if (apply) {
        await db.collection('users').doc(uid).set(
          { subscription: { stripeCustomerId: customer.id }, updatedAt: new Date() },
          { merge: true },
        );
        await ensureDefaultPaymentMethod(customer.id);
      }

      const { sub, created: subCreated } = await ensureSubscription(customer.id, uid, priceId, label);
      if (apply) {
        row.subscription = sub.id;
        row.status = sub.status;
        await applySubscriptionState(uid, sub, acct.plan);
        console.log(`    subscription   : ${sub.id} — ${sub.status}${subCreated ? ' (created)' : ' (existing, reused)'}`);
        console.log(
          `    period ends    : ${new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)}\n`,
        );
      } else {
        row.subscription = '(new)';
        row.status = withTrial ? 'trialing' : 'active';
        console.log(`    subscription   : would create on ${priceId}\n`);
      }
    }
  } catch (err) {
    row.status = `FAILED: ${err.message}`;
    console.error(`    ✖ ${err.message}\n`);
  }

  results.push(row);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('─'.repeat(100));
// Say plainly which of the two this is. A dry run printing a credentials table
// under a confident heading reads as "done" — and the accounts then do not
// exist, which surfaces later as an unexplained "email or password incorrect".
console.log(apply ? '\nQA ACCOUNTS — created\n' : '\nPLANNED QA ACCOUNTS — NOT CREATED (dry run)\n');
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad('EMAIL', 36)}${pad('PLAN', 20)}${pad('CYCLE', 8)}${pad('ROLE', 13)}STATUS`,
);
for (const r of results) {
  console.log(`${pad(r.email, 36)}${pad(r.plan, 20)}${pad(r.interval, 8)}${pad(r.role, 13)}${r.status}`);
}
console.log(`\nPassword for every account: ${password}`);

if (!apply) {
  console.log(
    '\n⚠  DRY RUN — nothing above was created. These accounts do NOT exist yet and\n' +
      '   signing in with them will fail. Run it for real with:\n\n' +
      '       node scripts/seed-qa-accounts.mjs --apply\n',
  );
  process.exit(0);
}

console.log(`
NEXT STEPS

  1. Sign in at https://flacroncv.com/en/login with any address above.
     Email verification is already done, so no verification mail is involved.

  2. The role lives in the ID token, so the Admin/CRM panels only unlock after a
     fresh sign-in. If a panel 403s, sign out and back in once.

  3. Test cards for checkout flows you run by hand (test mode only):
       success             4242 4242 4242 4242
       requires 3D Secure  4000 0027 6000 3184
       declined            4000 0000 0000 0002
     Any future expiry, any CVC, any postcode.

  4. To confirm Stripe and Firestore agree for any account:
       node scripts/reconcile-subscription.mjs <email>
`);

process.exit(0);
