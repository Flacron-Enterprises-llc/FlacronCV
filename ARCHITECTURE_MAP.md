# FlacronCV — Architecture Map

> **Purpose.** Where things are and how a request travels, so nobody has to re-scan the codebase to
> find out. Read `PROJECT_PROGRESS.md` first for *why* things are the way they are; this file is the
> *what* and *where*.
>
> **Self-auditing.** Every claim below was read from source unless marked **⚠️ UNVERIFIED**, which
> means it is carried from `PROJECT_PROGRESS.md`, `README.md` or operator notes and was **not**
> confirmed by this pass. Runtime behaviour was never executed — this document was produced by a
> read-only audit (no API boot, no dev server, no emulators, no cloud CLI).

Created: 2026-08-18 · Verified against: branch `main`, working tree with 8 uncommitted tracked files

---

## 1. Monorepo layout

pnpm workspaces + turbo. Root scripts fan out via `turbo run <task>`.

| Path | What it is | Notes |
|---|---|---|
| `apps/web` | Next.js 14 App Router frontend | next-intl (6 locales), Zustand+immer, React Query, Tailwind, TipTap, @dnd-kit, client-side export |
| `apps/api` | NestJS 10 REST API | Global prefix `/api/v1`, port 4000, 17 feature modules |
| `apps/mobile` | React Native / Expo Router app | Own enums (3 plans). **Batch E:** `PLAN_CONFIGS` wraps `packages/shared-types` via a relative import (no new package.json dep). See §8 |
| `packages/shared-types` | The contract between web and api | `PLAN_CONFIGS`, `PLAN_RANK`, `resolveEffectivePlan()`, `isPlanPurchasable()`, entity types. **The API resolves it from `dist/`, so it must be built before type-check or tests** |
| `packages/tsconfig` | Shared TS base configs | |
| `functions/` | A separate Firebase Functions project | Own `package.json` + lockfile; the repo's only long-standing eslint config lived here (`functions/.eslintrc.js`) |
| `dataconnect/` | Firebase Data Connect schema + connector | Generated SDKs (`dataconnect-generated`, `dataconnect-admin-generated`) are **unused by all three apps** — held for a decision, see `PROJECT_PROGRESS.md` §8 |
| `docker/` | docker-compose + nginx | **Pre-AWS path. Dead.** See `DEPLOYMENT_AND_OPS.md` |
| `scripts/` | `seed-admin.mjs` | The operationally interesting scripts live in `apps/api/scripts/` |
| `apps/api/scripts/` | `seed-emulator.mjs`, `seed-qa-accounts.mjs` (untracked), `verify-yearly-prices.mjs`, `reconcile-subscription.mjs`, `which-webhook-secret.mjs` | |
| `buildspec-api.yml` | CodeBuild spec — the live backend deploy | |

**Do not read:** `node_modules`, `.next`, `dist`, `coverage`, `dataconnect-generated`, lockfiles.

---

## 2. Request lifecycle

```
browser
  │  DNS (Hostinger): flacroncv.com + www.flacroncv.com → Amplify CloudFront
  ▼
Amplify / CloudFront ──── serves the Next.js app. NEXT_PUBLIC_* were inlined AT BUILD TIME.
  │                       Apex redirects to www, so either origin can appear on an XHR.
  │  Firebase JS SDK signs the user in IN THE BROWSER and holds the ID token
  ▼
ALB  flacroncv-alb  ───── TLS terminates here. Health checks hit `/health` (NOT `/api/v1/health`).
  ▼
ECS Fargate  flacroncv-production / flacroncv-api  (container port 4000)
  │  helmet · CORS allowlist · global ValidationPipe · ThrottlerGuard
  │  FirebaseAuthGuard verifies the ID token → RolesGuard checks custom claims
  │  service layer enforces plan entitlements — THIS is the enforcement point
  ▼
Firestore (+ Firebase Auth, Storage)  via firebase-admin with service-account credentials
```

**Where auth is actually enforced, hop by hop:**

| Hop | Enforcement | Reality |
|---|---|---|
| CloudFront / Amplify | none | Static assets and SSR shells are public. Route groups do client-side redirects only — **UX, not enforcement** |
| ALB | none | Pure L7 routing + TLS |
| ECS ingress | CORS allowlist (`apps/api/src/main.ts:50`) | Origins = `FRONTEND_URL` + `ADDITIONAL_ORIGINS`. Not authentication — a non-browser client ignores CORS entirely |
| Nest guard | `FirebaseAuthGuard` verifies the ID token; `RolesGuard` reads role claims | The real identity boundary |
| Service layer | Plan limits, ownership, quotas | **The only place entitlements are enforced.** Every gate routes through `PLAN_CONFIGS[resolveEffectivePlan(subscription)]` |
| Firestore | firebase-admin runs with full service-account privileges | Security rules do **not** protect API-mediated writes ⚠️ UNVERIFIED (rules file not audited this pass) |

Two consequences worth remembering: a disabled button is never enforcement (standing rule 10), and
ID tokens stay valid for up to ~1h after a role change or revocation, so a demoted admin keeps API
access until the token expires (open MEDIUM in `AUDIT_OPEN_FINDINGS.md`).

---

## 3. `apps/api` module map

18 modules under `apps/api/src/modules/`.

| Module | Owns | Key services | External |
|---|---|---|---|
| `firebase` | SDK initialisation, `firestore`/`auth`/`storage` handles | `FirebaseAdminService` | Firebase Admin |
| `auth` | Register, login sync, email verification, password reset, token revocation | `AuthService` | Firebase Auth, `MailService`, `AbuseService` |
| `abuse` | Device/IP hashing, registration risk score (record only — no deny) | `AbuseService` | Firestore `abuse_devices` / `abuse_networks`, `app_settings/main.abuse` |
| `users` | User docs, usage counters, monthly reset, GDPR export, soft delete | `UsersService`, `UsageResetService` | Firestore |
| `cv` | CVs, sections, versions, public share slugs | `CVService` | Firestore |
| `cover-letter` | Cover letters + AI improve | `CoverLetterService` | Firestore, `AIService` |
| `ai` | Summary, ATS check, interview prep, LinkedIn, import parsing | `AIService` (+ unregistered watsonx/anthropic providers) | OpenAI |
| `export` | Export quota gate, server-side Puppeteer PDF path | `ExportService` | Puppeteer |
| `payment` | Checkout, webhooks, plan lifecycle, invoices, portal | `PaymentService` | Stripe |
| `templates` | Template catalogue + tier gating | `TemplatesService` | Firestore |
| `jobs` | Job-application tracker | `JobsService` | Firestore |
| `support` | Tickets, messages, internal notes | `SupportService` | Firestore |
| `contact` | Public contact form | `ContactService` | `MailService` |
| `leads` | Lead capture + consent records + double opt-in | `LeadsService` | Firestore, `MailService` |
| `mail` | All transactional email | `MailService` | **AWS SES v2** |
| `admin` | Admin stats, users, subscriptions, tickets | `AdminService` | Firestore |
| `audit` | Audit log writes and queries | `AuditService` | Firestore |
| `crm` | Customers, leads, revenue, transactions, activities, settings | `CrmUsersService`, `CrmSettingsService`, … | Firestore, Stripe |

**Bootstrap facts that have bitten before** (`apps/api/src/main.ts`): global prefix `api/v1` (`:104`);
`/health` mounted on the raw adapter outside the prefix (`:143`); `AllExceptionsFilter` registered
globally; CORS built at `:50` with an empty allowlist treated as a fatal boot error; Swagger disabled
in production (`:122`); rawBody retained for Stripe signature verification.

---

## 4. `apps/web` route map

All routes live under `apps/web/src/app/[locale]/`. Auth is enforced server-side by the API, never by
the route group — the groups only control layout and client-side redirects.

| Group | Routes | Access |
|---|---|---|
| `(public)` | `/`, `about-us`, `contact-us`, `templates`, `testimonials`, `confirm`, `privacy-policy`, `terms-of-service`, `cookie-policy`, `disclaimer`, `refund-policy` | Public |
| `(auth)` | `login`, `register`, `forgot-password`, `verify-email` | Public; redirects away when signed in |
| `(dashboard)` | `dashboard`, `cv` (+`new`, `pick-template`, `[id]`), `cover-letters` (+`new`, `[id]`), `jobs`, `support`, `settings` (+`billing`) | Signed-in |
| `(admin)` | `users`, `subscriptions`, `templates`, `tickets`, `audit-logs` | `admin` / `super_admin` claim |
| `(crm)` | `customers`, `leads`, `revenue`, `subscriptions`, `users`, `platform`, `audit`, `settings` | `admin` / `super_admin` claim |
| `[...rest]` | Localised 404 | Public |

**Legal routes are `/privacy-policy`, `/terms-of-service`, `/cookie-policy`, `/disclaimer`,
`/refund-policy`, plus `/contact-us`.** The client's checklist names `/privacy`, `/terms`,
`/contact` — those slugs were **not** adopted; existing links and sitemap entries stay.
English bodies for terms, disclaimer, refund, and cookies live in `apps/web/src/legal/*.ts`
(version `2026-08-16`) and render through `LegalDocumentView`. Chrome (Last updated, TOC,
Back to top, footer labels) stays in `t()`. Canonical + hreflang for those four documents
is the `en` URL only (`englishDocumentAlternates` in `lib/seo.ts`); `/ar/terms-of-service`
is still served for RTL chrome. **Privacy is still the locale namespace `privacy`** until
the client names AWS SES and OpenAI in the new §4 — `subprocessor-disclosure.spec.ts` still
reads `privacy.s3_desc`. `terms` and `cookies_policy` locale namespaces were deleted.

---

## 5. Firestore data model

| Collection | Shape (abridged) |
|---|---|
| `users` | `{ uid, email, displayName, photoURL, role, isActive, subscription{plan,status,stripeCustomerId,stripeSubscriptionId,currentPeriodEnd,trialStart,trialEnd,cancelAtPeriodEnd,hasUsedTrial}, usage{cvsCreated,coverLettersCreated,aiCreditsUsed,aiCreditsLimit,exportsThisMonth,lastExportReset}, abuse{deviceHash,ipHash,networkHash,riskScore,riskBand,riskSignals,scoredAt}, preferences{…}, createdAt, updatedAt, lastLoginAt, deletedAt }` |
| `cvs` | Owner-scoped; soft-deleted via `deletedAt`; `isPublic` + `publicSlug` for sharing. Subcollections `sections`, `versions` |
| `cover_letters` | Owner-scoped, soft-deleted, optional `linkedCVId` |
| `job_applications` | Owner-scoped, 6 statuses wishlist→applied→interviewing→offer→rejected→accepted |
| `support_tickets` | + `messages` subcollection; messages carry an `internal` flag that **must** be filtered from customer-facing reads |
| `templates` | Catalogue + tier |
| `subscriptions` | Subscription records |
| `payment_events` | Stripe webhook idempotency, TTL'd |
| `audit_logs` | Actor, action, target, metadata |
| `leads` | + `ConsentRecord` (consent text/version/date/source/ip) |
| `app_settings/main` | CRM-editable app settings, incl. the **unenforced** `planLimits` — see §8. **`abuse` weights/thresholds are read by `AbuseService`** (code defaults if missing). CRM settings saves preserve `.abuse` so a full-doc set cannot wipe it. |
| `abuse_devices/{deviceHash}` | Lookup: `uids[]` (capped), `uidCount`, `receivedFree`, `lastSeenAt`, `createdAt`. Doc-id get — no composite index. Soft-deleted uids stay (create/delete signal). |
| `abuse_networks/{ipHash}` | Lookup: `recentAt[]` timestamps, **no uid list**. Doc-id get — no composite index. |
| `system/usage_reset` | Single marker doc holding the last completed reset period (`YYYY-MM`) |
| `crm_customers`, `crm_leads`, `crm_transactions`, `crm_activities`, `crm_audit_log` | CRM domain |

**`free_grants`: does not exist** (client chose option b). Batch G part 1 (2026-08-18) **did** add
hashed `users.abuse`, `abuse_devices`, `abuse_networks`, and a registration risk score that is
**recorded, not enforced**. Device identifier: 128-bit random token, HMAC-SHA256 with
`ABUSE_HMAC_SECRET` before storage. **Honest limits:** it survives logout; it does **not**
survive clearing cookies and localStorage together, incognito / a fresh profile, another
browser, or another machine. No canvas fingerprint, no evercookie. A determined user with a
new profile gets a new token.
**Privacy §1.9** now matches the practice (hashed device identifiers, hashed IP/network
identifiers, fraud-risk indicators). Do not publish the new Privacy page until AWS SES and
OpenAI are named in client §4 (`LEGAL_VERSION_MAP.privacy` is still
`pending-client-subprocessors`). `legalAcceptances` still does not exist (Batch H).
**Erasure:** H.6 must include `users.abuse` and the two lookup collections; until then a
manual erasure request covers them by hand.
**GDPR export** (`GET /users/me/export`) includes this user's `abuse` snapshot (hashes, score,
band, signal codes, `hasUsedTrial`) and must never include other uids from the device lookup.

---

## 6. Environment variables

**Names and purposes only — never record a value here.** Build-time means Next.js inlines it during
`next build`; changing one requires a **rebuild**, not a redeploy.

### `apps/api` (all runtime)

| Name | Purpose | Required |
|---|---|---|
| `PORT` | Listen port (default 4000) | optional |
| `NODE_ENV` | Environment; gates Swagger and localhost CORS | optional |
| `FRONTEND_URL` | Primary CORS origin + email link base | **required** |
| `ADDITIONAL_ORIGINS` | Extra CORS origins, comma-separated, **no spaces** | required in prod |
| `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_STORAGE_BUCKET` | Firebase Admin service account | **required** |
| `OPENAI_API_KEY` | AI features | **required** |
| `STRIPE_SECRET_KEY` | Stripe API | **required** |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification (trimmed in code — a stray space silently breaks the HMAC) | **required** |
| `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID` / `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID` / `STRIPE_ENTERPRISE_YEARLY_PRICE_ID` | Override the compiled-in price ids; **env wins over `PLAN_CONFIGS`** | optional |
| `AWS_REGION` | SES region (default `us-east-1`) | optional |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **Omit on AWS** to use the task IAM role | optional |
| `SES_FROM_EMAIL` | **FROM address. Defaults to `no-reply@flacronenterprises.com` — the parent domain** | should be set |
| `SES_FROM_NAME` | Display name (default `FlacronAI`) | optional |
| `SES_REPLY_TO` | Reply-To | optional |
| `CONTACT_EMAIL` | Contact-form destination inbox. Fallback chain: `CONTACT_EMAIL` → `SES_REPLY_TO` → `contact@flacroncv.com`. **Not** `SES_FROM_EMAIL` (transactional sender identity). | optional |
| `ABUSE_HMAC_SECRET` | HMAC-SHA256 key for hashing device tokens and IPs before storage. If unset or blank, **signup still succeeds** and scoring is skipped (warning logged, no values). | optional (fail soft) |
| `FIRESTORE_EMULATOR_HOST` | **The only guard against local dev hitting production Firestore** | local only |

### `apps/web` (all build-time — every one is `NEXT_PUBLIC_*`)

| Name | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | API base; **includes the `/api/v1` prefix** | **required** |
| `NEXT_PUBLIC_SITE_URL` | Canonical host for SEO, sitemap, robots. **Must be `https://www.flacroncv.com`** (the apex 302s to www). Dockerfile/ECS fails the build if missing; **the live Amplify path has no equivalent guard.** Build-time inlined — changing it needs a rebuild, not a redeploy. | **required at build** |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_STORAGE_BUCKET` / `_MESSAGING_SENDER_ID` / `_APP_ID` | Firebase client SDK | **required** — missing the prefix is the Amplify regression |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` | Adapter key (default `ga4`) | optional |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | GA4 id; analytics no-ops safely without it | optional |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` / `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` / `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` | Point the browser client at local emulators | local only |

---

## 7. Test topology and CI gates

`pnpm test` → `turbo run test` → **`apps/api` (jest)** + **`apps/web` (vitest)**.
`apps/mobile` defines no `test` and no `type-check` script, so it is covered by **lint only**.

**Measured 2026-08-18 by running the suite: web `250` (16 files), api `384` (29 suites) —
`634` total** (web was `233`/14 before this SEO batch added `seo.test.ts` and `json-ld.test.ts`). The frequently-quoted **"~410 tests"** (api 293 + web 117) dates from 2026-07-30 and
is stale; do not quote it. ⚠️ **UNVERIFIED:** the **"1,814 keys × 6 locales"** figure — the parity
gate proves the six files match each other, but the key count itself was not counted here.

⚠️ **Windows note:** vitest 4's default `forks` pool intermittently fails to start workers on this
machine (`Timeout waiting for worker to respond`, all files, no test failures). It is environmental,
not a code defect — `pnpm test` succeeds, and a stuck run clears with
`vitest run --pool=threads --no-file-parallelism`.

**CI (`.github/workflows/ci.yml`), four jobs, each `needs:` the previous:**

1. `lint-and-typecheck` — `pnpm lint` then `pnpm type-check`. Historically the whole pipeline died
   here because `apps/mobile` had a lint script but no eslint config.
2. `test` — **builds `packages/shared-types` first** (the API resolves it from `dist/`), then runs both
   suites.
3. `build` — with throwaway `NEXT_PUBLIC_*` values.
4. `docker` — `main` only; passes the eight `NEXT_PUBLIC_*` as `--build-arg` and **fails fast if any is
   missing**. This is the standing guard against the Amplify inlining regression.

### The i18n gates — there are FIVE, not four

Every older document in this repo says four (and before that, three). The fifth exists because
the other four cannot see a corrupted character.

| File | Rejects |
|---|---|
| `apps/web/src/i18n/locale-parity.test.ts` | A key in one locale and not another; empty values; mismatched ICU placeholders |
| `apps/web/src/i18n/keys-resolve.test.ts` | A static `t()` / `t.rich()` key that does not exist in `en/common.json` — the only gate that catches a key missing from **all six** locales. **Widened 2026-08-18** to bind `await getTranslations(…)`, which brought previously-unchecked server components (legal pages, the auth layout, `not-found`) into scope, and again the same day to optional `.rich(` (CookieConsent). English legal bodies no longer call `t()` for the document text. Still blind to `getTranslations({locale, namespace})`, `t.markup` / `t.raw`, double-quoted keys, and template-literal keys — check those by hand |
| `apps/web/src/i18n/no-hardcoded-english.test.ts` | English JSX text and `placeholder`/`title`/`aria-label`/`alt` literals. Ratchets against a small reviewed allowlist |
| `apps/web/src/i18n/locale-untranslated.test.ts` | **A key present in all six files whose non-English value is still the English sentence.** Copying English text into all six locales to satisfy parity fails this one in five locales at once |
| `apps/web/src/i18n/locale-encoding.test.ts` | **A locale file that is not strict UTF-8, or a value containing HTML entities, `U+FFFD`, C1 controls, or known mojibake (`Ã©`, `â€™`, …).** Also asserts each locale's values contain at least one letter from its own alphabet (non-vacuity). **Does not catch missing diacritics** (`cree` vs `crée`) — that is a spelling problem a regex cannot honestly gate |

Other notable specs: `plan-advertising.spec.ts` (advertised copy vs enforced limits, and the
`YEARLY_BILLING_ENABLED` ⇔ annual-ids invariant), `subprocessor-disclosure.spec.ts` (Privacy Policy
must name the SDKs actually in `apps/api/package.json`, both directions),
`subscription-entitlements.spec` (grace / delinquency / expired access).

---

## 8. The plan-data audit

`PLAN_CONFIGS` in `packages/shared-types/src/subscription.types.ts` is the intended single source of
truth for prices, CV / cover-letter / AI-credit / export limits, and Stripe price ids.
`plan-advertising.spec.ts` guards **only** `PLAN_CONFIGS.features` against `PLAN_CONFIGS.limits`,
inside shared-types. It never reads `apps/mobile`, the CRM settings defaults, the locale JSON, or any
component. Everything below sits outside that guard.

### Tier 1 — a second source of truth for prices and Stripe ids (`apps/mobile`)

**Batch E (2026-08-18):** `apps/mobile/src/types/subscription.types.ts` now **wraps**
`packages/shared-types` `PLAN_CONFIGS` (relative import, no new dependency). Prices, limits,
features and Stripe ids are no longer restated. The dead `AWDS7HwRCx` ids are gone.
`index.tsx` upgrade CTA reads `PLAN_CONFIGS[PRO].priceMonthly`. Billing yearly badge uses
`yearlySavingsPercent`. The app still has its own 3-plan enum (Career Accelerator stays off
mobile even if the web launch pin is filled).

Still outside the wrap:

| Location | What remains |
|---|---|
| `apps/mobile/src/types/enums.ts` | Three plans only — intentional |
| `apps/mobile/app/(dashboard)/settings/billing.tsx` | Yearly toggle is not gated by `YEARLY_BILLING_ENABLED` (the flag is currently on, so the toggle is honest) |
| `apps/mobile/app/(dashboard)/index.tsx` | Subtitle still restates “100 AI credits” |
| `apps/mobile/src/lib/utils.ts:41, 50, 59, 68` | Gates read the wrapped table (now shared figures) |
| `apps/mobile/app/(dashboard)/index.tsx:102`, `settings/index.tsx:89`, `src/components/cv-builder/steps/SummaryStep.tsx:110` | Literal FREE-value fallbacks in usage display |

The previous $239.88 / −33% vs $299.99 overcharge on screen **is closed** as long as the wrap
stays. Latent only because the app does not currently ship — `app.json` still has the placeholder
`"projectId": "your-eas-project-id"` and there is no `eas.json`
(⚠️ UNVERIFIED that no external pipeline builds it). Mobile still sends `{plan, interval}` and
never a price id (`billing.tsx:29`).

### Tier 2 — a second plan-limits table in the API, enforced nowhere

| Location | Detail |
|---|---|
| `apps/api/src/modules/crm/crm-settings.service.ts:8` | `free: { cvsLimit: 3, coverLettersLimit: 2, aiCreditsLimit: 5, exportsLimit: 2 }` — FREE is **5** CVs / **1** letter |
| `apps/api/src/modules/crm/crm-settings.service.ts:9` | `pro: { 50, 50, 100, 50 }` — Pro is **10** CVs, **20** letters, **unlimited** exports |
| `apps/api/src/modules/crm/crm-settings.service.ts:10` | `enterprise: { -1 … }` — a sentinel `PLAN_CONFIGS` does not use |
| `apps/web/src/app/[locale]/(crm)/crm/settings/page.tsx:170-259` | The UI that edits and saves them |
| `packages/shared-types/src/crm.types.ts:339` | Where the shape is typed |

Read by **no enforcement path**. A super-admin can set Pro to 50 CVs, see "Saved", and change
nothing. Delete-or-wire decision pending — `PROJECT_PROGRESS.md` §8. **Batch F (2026-08-18) left
this file untouched** and recorded it as a third source of plan data: Free here is `cvsLimit: 3` /
`coverLettersLimit: 2`, while `PLAN_CONFIGS[FREE]` is 5 CVs / 1 letter. Do not grow a third table.

### Tier 3 — duplicated FREE-plan literals (`5`) instead of `PLAN_CONFIGS[FREE].limits.aiCredits`

None of the remaining sites is currently *wrong*; all go stale together the day FREE's allowance changes.

**Fixed 2026-08-18 (Batch F / MC2):** `apps/api/src/modules/users/users.service.ts:113` now seeds
`aiCreditsLimit` from `PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits`.

Still open:

`apps/api/src/modules/crm/crm-users.service.ts:286` · `apps/api/src/modules/crm/crm-users.controller.ts:76` ·
`apps/web/src/providers/AuthProvider.tsx:91` · `apps/web/src/components/cv-builder/AISummaryModal.tsx:59` ·
`ATSCheckModal.tsx:81` · `InterviewPrepModal.tsx:75` · `LinkedInModal.tsx:73` · `ImportResumeModal.tsx:49` ·
`apps/web/src/app/[locale]/(dashboard)/cover-letters/new/page.tsx:96` ·
`cover-letters/[id]/page.tsx:243, 259` · `apps/web/src/app/[locale]/(crm)/crm/users/[id]/page.tsx:467`

The five CV-builder modals are the mild case — each already caps against
`PLAN_CONFIGS[resolveEffectivePlan(...)]` and the literal is only a fallback for a missing stored value.

### Tier 4 — copy and fixtures

- `apps/web/src/lib/json-ld.ts` `softwareApplication()` offers — **Batch E:** iterates
  `customerFacingPlans()`, so Career Accelerator is omitted while unpurchasable.
- `apps/web/src/lib/json-ld.ts` `faqPage()` — **was** hardcoded Free/Pro limits in
  `[locale]/page.tsx`; now interpolates `PLAN_CONFIGS`. Guarded by
  `apps/web/src/lib/json-ld.test.ts`. The **visible** FAQ copy at
  `en/common.json` `faq.a1` still restates the same numbers (and still says
  Free exports `/month`) and is **not** covered by that guard. `faq.a2` dropped
  `/month` on Free exports in Batch E.
- `packages/shared-types/src/subscription.types.ts` `features` are **English string
  literals** rendered on the public pricing page, billing upgrade cards and the paywall modal. Open
  MEDIUM in `AUDIT_OPEN_FINDINGS.md:63`; the one place "goes through `PLAN_CONFIGS`" and "is
  translated" genuinely conflict.
- `apps/api/scripts/seed-emulator.mjs:109` — `aiCreditsLimit: 500` (emulator only).

### Correct, for contrast

`payment.service.ts:297, 467, 533, 622, 703, 727` · `cv.service.ts:144, 290, 528` ·
`cover-letter.service.ts:34, 238` · `export.service.ts:45, 77` · `users.service.ts:311` ·
`Pricing.tsx:190` · `settings/billing/page.tsx:68, 199-223, 241` · `dashboard/page.tsx:58` ·
`cv/page.tsx:35` · `UpgradeModal.tsx:37` · `crm/users/[id]/page.tsx:185`

---

## 9. Gotchas — the hardest-won lessons in this repo

**1. `tsc` can exit 0 and emit nothing.** `apps/api/tsconfig.json` had `incremental: true` with the
cache at `./tsconfig.tsbuildinfo`, **outside** `dist/`. Delete `dist/` — the natural move for a clean
rebuild, and something a Docker or CI cache restore can also produce — and `tsc` reads the surviving
cache, concludes everything is emitted, and writes nothing. Reproduced as
`rm -rf dist && nest build` → exit 0, no `dist/main.js`. Fixed with
`"tsBuildInfoFile": "./dist/tsconfig.tsbuildinfo"` so cache and output die together.
**Corollary that still bites: `packages/shared-types/dist` must exist before you type-check or test
the API.** If it is missing, every type error you see is an artefact — check it first.

**2. `onModuleInit` has no cross-module ordering guarantee.** `UsageResetService` did its catch-up in
`onModuleInit`, but so does `FirebaseAdminService`. The reset hook won the race,
`firebaseAdmin.firestore` was `undefined`, and the surrounding `try/catch` swallowed it — so the
catch-up silently never ran, and a server restarted across a month boundary left users refused CVs
and AI credits *despite a renewed allowance*. Now `onApplicationBootstrap`, with a 19-line comment at
`apps/api/src/modules/users/usage-reset.service.ts:24-36` explaining exactly this. **Do not move it
back, and do not add Firestore work to any `onModuleInit`.**

**3. `FIRESTORE_EMULATOR_HOST` is the only thing standing between local dev and production data.**
Without it, `firebase-admin` falls back to service-account credentials and connects to **production
Firestore**. The tell in the log is `Firestore connection verified`. This has already happened once.
The emulator also needs **JDK 21+** (firebase-tools 15.x refuses lower); the Auth-only fallback is
pure Node and needs no Java.

**4. Date-only values parse as UTC midnight.** `new Date('2026-08-03')` is UTC midnight, which is the
*previous day* anywhere west of UTC — so date-only values rendered and filtered one day early. Parse
date-only strings at local noon, or compare as strings.

**5. There are five i18n gates, not four** — see §7. The fifth (`locale-encoding.test.ts`) is
the one that rejects mojibake, HTML entities, and a locale file that contains none of its own
alphabet. It does not catch missing diacritics.

**6. A raw HTTP 500 from this API tells you nothing about the cause.**
`apps/api/src/common/filters/all-exceptions.filter.ts:30` maps every non-`HttpException` to
`"Internal server error"`, logging the real message as `Internal error details: …` first. So a genuine
SES `MessageRejected`, a Firebase link-generation failure and a null-pointer bug are indistinguishable
from the client. **Always read the log line before theorising** — reasoning "a raw 500 means an
unhandled path" from the status code alone is invalid here.

**7. `/api/v1/health` returning 404 is correct.** The health route is mounted on the raw HTTP adapter
outside the global prefix (`apps/api/src/main.ts:143`) so the load balancer can reach `/health`.

**8. Build-time vs runtime env vars.** Every `NEXT_PUBLIC_*` is inlined by `next build`. Changing one
in Amplify requires a **rebuild**, not a redeploy — and dropping the prefix makes Firebase silently
fail in the browser while localhost keeps working.

**9. A service-layer confidentiality filter is not a boundary.** Support internal notes were filtered
in `SupportService`, then leaked by the GDPR export reading the `messages` subcollection directly.
If another module can read the same collection, filter at the read.

**10. Deleting a CV or cover letter refunds the quota slot.** `cv.service.ts:523` and
`cover-letter.service.ts:274` decrement on delete, deliberately — without it a FREE user who created
and deleted their one cover letter could never write another. This makes `cvsCreated` /
`coverLettersCreated` **concurrent-slot caps, not monthly allowances**: nothing resets them. See the
HIGH finding in the 2026-08-18 change-log entry, blocked on client question Q-2.

**11. Stripe secrets are whitespace-sensitive.** `STRIPE_WEBHOOK_SECRET` is `.trim()`ed in
`configuration.ts:23` because a trailing space pasted into a hosting dashboard is invisible on screen
but changes the HMAC key, and the resulting mismatch error never hints that the secret is malformed.

**12. Cookie consent is stored in TWO browser keys, and only one of them is the decision.**
`cookie_consent` holds the versioned record that `apps/web/src/lib/consent.ts` owns;
`analytics_consent` is `analytics.ts`'s own flag, **read at module import time**. They can disagree —
a visitor from the pre-2026-08-18 one-boolean banner still holds an analytics grant while holding no
current decision — which is why `syncConsentOnLoad()` runs as the **first** effect in
`AnalyticsProvider`, ahead of that component's page view. Anything new that writes to the browser
must join `PREFERENCE_STORAGE_KEYS`, get its own gated category, or be justified as strictly
necessary in that file. **Only Preferences and Analytics exist; there is no Marketing category
because there is no marketing technology** — see Q-12.

**13. The canonical host must be `www`, not the apex.** Observed live 2026-08-18:
`https://flacroncv.com/en` answers `302` to `https://www.flacroncv.com/en`, while every canonical,
hreflang, `og:url`, sitemap `<loc>` and the robots `Sitemap:` line were emitting the apex. A
canonical nominating a host that redirects away tells Google the real address is one that declines
the job. `SITE_URL` in `apps/web/src/lib/seo.ts` is the single fallback; it now defaults to www.
**Fixing the constant is only half the fix:** `NEXT_PUBLIC_SITE_URL` must also be set to the www
host on the deploy platform, and because it is `NEXT_PUBLIC_*` that requires a **rebuild**, not a
redeploy. The Dockerfile/ECS path fails the build if it is missing; Amplify (the live frontend)
has no equivalent guard.
