# FlacronCV API

NestJS backend for FlacronCV.

## Local development

```bash
cd apps/api
pnpm dev          # nest start --watch
```

The server reads configuration from environment variables (Firebase Admin,
Stripe, Brevo, etc.). `src/main.ts` validates the required ones at boot and
exits if any are missing.

## QA accounts

`scripts/seed-qa-accounts.mjs` creates one working account per plan plus admin
accounts, so QA can sign in as a Pro/Enterprise/admin user without paying and
without waiting for a verification email.

```bash
cd apps/api
node scripts/seed-qa-accounts.mjs            # dry run — reports, writes nothing
node scripts/seed-qa-accounts.mjs --apply    # create them
node scripts/seed-qa-accounts.mjs --check    # read-only: do they exist, and in what state
node scripts/seed-qa-accounts.mjs --help     # all options
```

If a seeded login is rejected, run `--check` first. Firebase deliberately
collapses *no such user*, *wrong password* and *invalid credential* into one
error so the login form cannot be used to discover who has an account, so the
browser cannot tell you which of them it is — `--check` asks Firebase directly.

It creates **both** sides of a paid account — the Firebase user and Firestore
document, *and* a real Stripe customer with a test card and a real subscription
on the plan's configured price — then writes the same fields
`PaymentService.handleCheckoutCompleted` writes. That is deliberate: entitlements
are read from the Firestore `subscription` block while the money lives in Stripe,
and a plan written into Firestore alone yields an account whose billing page
claims a paid plan over a Manage Subscription button that cannot work. Seeded
accounts pass `scripts/reconcile-subscription.mjs` clean.

Notes:

- **Dry run by default.** `--apply` writes to whichever Firebase project
  `apps/api/.env` points at.
- **It refuses to run against a live Stripe key** unless `--allow-live` is
  passed, because creating subscriptions with one charges real cards.
- Accounts are created with `emailVerified: true` and `welcomeEmailSent: true`,
  so the product sends them no mail — QA addresses often have no mailbox, and
  every bounce costs SES sender reputation.
- The `career_accelerator` account is granted in Firestore only. That plan has
  no Stripe price configured (`PLAN_CONFIGS` marks it "coming soon"), so there
  is nothing to subscribe it to and its Manage Subscription button will not work.
- Roles are written to both the custom claim (what `FirebaseAuthGuard` reads) and
  the Firestore `role` field (what the Admin/CRM lists render). The claim is
  baked into the ID token, so admin panels unlock only after a fresh sign-in.

## Build / dev-server notes

### `nest-cli.json` — `deleteOutDir` is intentionally `false`

Do **not** change `compilerOptions.deleteOutDir` back to `true` in
[`nest-cli.json`](./nest-cli.json). It is set to `false` on purpose.

**Why:** `tsconfig.json` enables `"incremental": true`, which makes the
TypeScript compiler keep a `tsconfig.tsbuildinfo` cache and only re-emit files
that changed. If Nest also deletes the output directory before every build
(`deleteOutDir: true`), the two settings conflict:

1. `deleteOutDir` removes `dist/` at the start of `nest start` / `nest build`.
2. Incremental `tsc` then reads the surviving `tsconfig.tsbuildinfo`, decides
   nothing has changed, prints `Found 0 errors`, and **emits nothing**.
3. `dist/main.js` is therefore missing, and the app fails to launch with:
   `Error: Cannot find module '.../apps/api/dist/main'`.

This is intermittent and confusing because `pnpm type-check` (which is
`tsc --noEmit`) still reports 0 errors — it never needs to produce `dist/`.
The failure surfaces on the *second* `pnpm dev` (or a `pnpm build` followed by
`pnpm dev`): the first run emits and writes the cache, and the next run deletes
`dist/` but skips re-emitting because the cache says the build is current.

Keeping `deleteOutDir: false` lets the incremental cache and the `dist/`
output stay consistent, so `dist/main.js` is always present and the dev server
starts reliably on every run.

**If you ever hit `Cannot find module .../dist/main` again:** clear the stale
cache once with `rm apps/api/tsconfig.tsbuildinfo` (or run `pnpm --filter=api
build`), then start normally. With `deleteOutDir: false` this should not recur.

> Alternatives that would also fix it but were deliberately *not* chosen, to
> avoid changing the TypeScript config / build architecture: disabling
> `incremental` in `tsconfig.json`, or adding a separate `tsconfig.build.json`.
