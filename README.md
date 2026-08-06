# FlacronCV

AI-powered resume and cover-letter builder designed to help job seekers create
ATS-optimized CVs, apply faster, and stand out globally. FlacronCV is a full career
platform: CV & cover-letter builders with AI assistance (ATS scoring, LinkedIn
optimization, interview prep), resume import/export (PDF/DOCX), a job tracker,
subscription billing, an internal CRM, and an admin panel — localized across 6
languages (English, Spanish, French, German, Arabic, Urdu; Arabic & Urdu are RTL).

## Monorepo layout

This is a [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/) workspace.

| Path | Stack | Purpose |
|------|-------|---------|
| `apps/web` | Next.js 14 (App Router), Tailwind, Zustand, React Query, next-intl | Web application (port **3000**) |
| `apps/api` | NestJS 10, Firebase Admin, Stripe, OpenAI, AWS SES | REST API (port **4000**, prefix `/api/v1`) |
| `apps/mobile` | Expo / React Native | Mobile app (independent; not required to run the web product) |
| `packages/shared-types` | TypeScript | Types shared between web & api |
| `packages/tsconfig` | — | Shared TS configs |

## Prerequisites

- **Node.js ≥ 18**
- **pnpm ≥ 8** (`corepack enable` will provide the pinned `pnpm@8.15.0`)
- Accounts/keys for the external services below (the app boots without them but the
  corresponding features will be disabled — see [Environment](#environment)).

## Quick start

```bash
# 1. Install dependencies (from the repo root)
pnpm install

# 2. Create env files from the templates
cp apps/web/.env.local.example apps/web/.env.local
cp apps/api/.env.example       apps/api/.env
#   …then fill in the values (see Environment below)

# 3. Run web + api together (Turborepo)
pnpm dev
#   web  → http://localhost:3000
#   api  → http://localhost:4000  (Swagger docs at /api/docs, health at /health)
```

Run a single app instead:

```bash
pnpm dev:web    # Next.js only
pnpm dev:api    # NestJS only
```

## Environment

Copy the two `*.example` files and fill them in. The API **fails fast at boot** if any
of these are missing: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_STORAGE_BUCKET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`.

| Service | Vars | Needed for |
|---------|------|-----------|
| **Firebase** (Auth + Firestore + Storage) | client SDK keys in `apps/web/.env.local`; Admin SDK keys in `apps/api/.env` | Auth, data, file storage — **required** |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`, web `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Billing / subscriptions — **required to boot** |
| **OpenAI** | `OPENAI_API_KEY` | AI features (generation, ATS, LinkedIn, interview prep) |
| **AWS SES** | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`, `SES_FROM_NAME`, `SES_REPLY_TO`, `CONTACT_EMAIL` | Verification / password-reset / welcome / lead-confirmation / contact emails. The sending identity must be **verified in SES**, and the account must be out of the **SES sandbox** to email unverified recipients. Omit the two key vars on AWS-hosted envs to use the instance/task IAM role. |

> The full, annotated list lives in `apps/web/.env.local.example` and `apps/api/.env.example`.
> **Security:** never commit real credentials, and do not point local development at
> production Firebase/Stripe/SES projects.

## Scripts (run from the repo root)

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run web + api in watch mode |
| `pnpm build` | Production build of all packages |
| `pnpm type-check` | TypeScript check across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm test` | Unit tests (web: Vitest, api: Jest) |
| `pnpm test:web:e2e` / `pnpm test:api:e2e` | End-to-end tests (Playwright / Jest-e2e) |
| `pnpm format` | Prettier write |

Per-app equivalents exist via `pnpm --filter web <script>` / `pnpm --filter api <script>`.

## Testing & quality gates

The project is verified via **type-check + lint + unit tests** (all three are expected
to be green before merging):

```bash
pnpm type-check   # web: 0 errors · api: 0 errors
pnpm lint         # web: next/core-web-vitals · api: @typescript-eslint
pnpm test         # web: Vitest · api: Jest
```

## Firebase Storage CORS (avatar upload)

Avatar upload writes straight from the browser to Firebase Storage, so the
**bucket** — not this codebase — decides whether the request is allowed. A bucket
with no CORS policy rejects the `OPTIONS` preflight, and the browser reports:

```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/v0/b/…'
from origin 'http://localhost:3000' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
It does not have HTTP ok status.
```

Nothing in the app can fix that; the policy has to be applied to the bucket once
per project. [`cors.json`](cors.json) at the repo root is that policy — it lists
localhost plus the deployed origins from `render.yaml`, and the `X-Goog-Upload-*`
response headers the Firebase JS SDK's **resumable** upload needs (a plain
`GET`-only policy is not enough; the upload will still fail).

`gcloud` is not installed on the dev machine. The quickest route is
**[Cloud Shell](https://console.cloud.google.com/?cloudshell=true)** (browser,
`gcloud`/`gsutil` preinstalled, already authenticated) — paste `cors.json` into
it with the editor and run the commands there. Otherwise install the
[gcloud CLI](https://cloud.google.com/sdk/docs/install) and `gcloud auth login`.

```bash
# 1. Confirm the bucket name — this is the other cause of the same error.
#    Projects created before ~Oct 2024 use <project>.appspot.com; newer ones use
#    <project>.firebasestorage.app. Pointing at a bucket that does not exist
#    also returns a non-OK preflight, which looks identical in the console.
gcloud storage buckets list --project flacron-cv --format="value(name)"

# 2. Apply the policy to whichever name step 1 printed.
gcloud storage buckets update gs://flacron-cv.firebasestorage.app --cors-file=cors.json

# 3. Verify it stuck.
gcloud storage buckets describe gs://flacron-cv.firebasestorage.app --format="default(cors_config)"
```

If step 1 prints `flacron-cv.appspot.com`, the bucket name is the bug: update
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (`apps/web/.env`) and
`FIREBASE_STORAGE_BUCKET` (`apps/api/.env`) to match, and re-run step 2 against it.

`maxAgeSeconds` caches the preflight for an hour, so hard-reload (or wait) before
concluding a change did not work.

## Local testing with Firebase Emulators

By default `pnpm dev` talks to the **live Firebase project**, so any account you
create is a real production user and verification emails go out through the real
**AWS SES** sender. For QA, run against the local emulators instead — nothing
touches production, and you can create as many test users as you like.

**Prerequisite:** the Firestore emulator needs **JDK 21 or newer** (`java -version`).
Verified 2026-07-29: `firebase-tools` 15.x refuses to start it on anything older —
*"firebase-tools no longer supports Java version before 21"* — so Java 17 is NOT
enough despite what older docs (including this one) used to say. The **Auth
emulator is pure Node and needs no Java at all** — see the no-Java fallback below.

```bash
# 1. Start the emulators (leave running)   → UI at http://127.0.0.1:4400
pnpm emulators

# 2. Point the API at them — in apps/api/.env uncomment:
#      FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
#      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080

# 3. Point the web app at them — in apps/web/.env.local (or apps/web/.env,
#    whichever this checkout uses) add:
#      NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true

# 4. Create a ready-to-use QA account
pnpm --filter api run seed:emulator

# 5. Run the app as usual
pnpm dev
```

The seed script creates and prints a verified login:

| | |
|---|---|
| Email | `qa@flacroncv.test` (override with `SEED_EMAIL`) |
| Password | `Test1234!` (override with `SEED_PASSWORD`) |
| Plan | **enterprise** — unlimited CVs, cover letters, exports |
| AI credits | 500 — **re-run the script any time to reset the counter to 0** |
| Role | `super_admin` — Admin panel + CRM unlocked |
| Email verified | yes — skips the verification wall |

Re-running the script is idempotent: it reuses the existing user and resets its
plan/usage.

**Notes & limits**

- The emulator UI is on **4400**, not Firebase's default 4000 — that port is the API.
- The seed script **forces** the emulator hosts and deletes
  `GOOGLE_APPLICATION_CREDENTIALS` before initialising, so it structurally cannot
  write to the live project even if run with production env loaded.
- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` defaults to off; production builds are unaffected.
- **Storage is not emulated yet** — avatar upload and the server-side PDF export
  still use the real bucket. Avoid those flows in emulator mode, or ask for the
  Storage emulator to be added.
- **No JDK 21?** Start only the Auth emulator and **leave `FIRESTORE_EMULATOR_HOST`
  set anyway**: the API's Firestore connectivity check fails and it falls back to
  its built-in in-memory store, so production is still never touched. Data is
  lost on restart.

  ⚠️ **`FIRESTORE_EMULATOR_HOST` is the only thing standing between you and the
  live database.** Omit it — even with the Auth emulator running, even with a
  `demo-` project id on the emulator — and `firebase-admin` falls straight back
  to the service-account credentials in `apps/api/.env` and connects to
  **production Firestore**. The give-away in the log is:

  ```
  [FirebaseAdminService] Firestore connection verified
  ```

  In emulator mode you should NOT see that line; you should see the connectivity
  check fail and the in-memory fallback engage. If you see it, stop the process.
  (Learned the hard way on 2026-07-29 — a bootstrap task read one document from
  production before the mistake was caught.)

## Testing the Stripe checkout flow

The configured `STRIPE_SECRET_KEY` is a **test-mode** key (`sk_test_…`), so
checkout, upgrades, cancellation and refunds can all be exercised without moving
real money. The one missing piece is **webhook delivery**: Stripe cannot reach
`localhost`, so without forwarding, checkout completes in the browser but the
plan is never activated — which looks like a broken upgrade.

```bash
# 1. Install and sign in (once)
#    https://docs.stripe.com/stripe-cli
stripe login

# 2. Forward webhooks to the local API (leave running)
stripe listen --forward-to localhost:4000/api/v1/payments/webhook

# 3. Copy the whsec_… it prints into apps/api/.env as STRIPE_WEBHOOK_SECRET,
#    then restart the API. Signature verification will now pass.
```

Test cards (any future expiry, any CVC):

| Card | Behaviour |
|---|---|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0341` | Attaches, then fails on charge → `invoice.payment_failed` |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

Handlers worth exercising, and how to trigger each:

- **Activation** — complete checkout with `4242…`; expect `checkout.session.completed`
  and the account to move to the purchased plan.
- **Renewal / payment failure** — `stripe trigger invoice.payment_failed`; expect the
  account to move to `past_due` and an audit row.
- **Cancellation** — cancel in the billing portal, or
  `stripe trigger customer.subscription.deleted`; expect a downgrade to FREE.
- **Refund / dispute** — `stripe trigger charge.refunded` /
  `stripe trigger charge.dispute.created`; expect access revoked to FREE.

Each of these now also writes an entry to the admin **Audit Logs** page, which is
the quickest way to confirm a webhook actually landed.

> **Safety:** verify the key really is `sk_test_` before running any of this —
> `grep -o 'STRIPE_SECRET_KEY=sk_[a-z]*' apps/api/.env`. Never point this flow at
> an `sk_live_` key.

## Deployment notes

- `apps/web` builds with `output: 'standalone'` (Next.js) for container/Node hosting.
- `apps/api` is a standard NestJS server; `start:prod` runs `node dist/main`. It sets
  `trust proxy` for correct client-IP handling / rate-limiting behind a reverse proxy,
  and exposes `/health` for load-balancer checks.
- Configure the Stripe **webhook** endpoint to `POST {API}/api/v1/webhooks/stripe`
  (the API uses the raw request body to verify signatures).
