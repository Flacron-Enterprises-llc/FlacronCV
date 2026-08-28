# FlacronCV — Project Progress & Context (single source of truth)

> **Purpose.** This is the ONE file to read to understand the whole engagement without
> re-scanning every source file. It tracks: what is done ✓, what is in progress ◐, what
> is missing ✗, errors found & fixed, the client's improvement requirements broken into
> micro-tasks, and the change log. **Update this file after every micro-change.**
>
> **Working method (agreed with client):**
> 1. Review one section at a time.
> 2. Present findings → get approval → implement **micro-changes** → strict QA on each.
> 3. Keep the site fully functional at every step; no regressions.
> 4. Tick completed items here; log every change in the Change Log.
> 5. Report Out-of-Scope / architectural items separately — do not implement without approval.

Last updated: 2026-08-27

> **Note on dates.** The header previously read `2026-07-29` while the two newest change-log
> entries were dated `2026-07-30`; the header was stale, the entries were right. Corrected
> 2026-08-18 by the verification pass logged at the top of §9. Nothing was removed.

---

## 1. Project overview

- **Product:** AI-powered CV & cover-letter builder → to become a full AI career platform.
- **Monorepo:** pnpm + turbo. Apps: `apps/web` (Next.js 14 App Router), `apps/api` (NestJS),
  `apps/mobile` (React Native/Expo). Shared: `packages/shared-types`.
- **Frontend:** Next.js 14, next-intl (6 locales: en/es/fr/de/ar/ur — ar/ur are RTL),
  Zustand+immer, React Query, TipTap (cover letters), @dnd-kit (CV sections),
  Tailwind, client-side export (html2canvas/jsPDF/docx).
- **Backend:** NestJS 10, Firebase Admin (Firestore + Auth + Storage), Stripe, AWS SES (email —
  migrated from Brevo; older change-log entries below still say Brevo and are left as written),
  OpenAI (AI). Global prefix `/api/v1`. Guards: FirebaseAuthGuard, RolesGuard, ThrottlerGuard.
- **Auth:** Firebase JS SDK (client) → `POST /auth/verify` syncs the user into Firestore.

### Key paths
- Web routes: `apps/web/src/app/[locale]/(public|auth|dashboard|admin|crm)/…`
- Web state: `apps/web/src/store/*`; providers: `apps/web/src/providers/*`; API client: `apps/web/src/lib/api.ts`
- Mobile API client: `apps/mobile/src/lib/api.ts` (unwraps Nest `{ success, data }` like web; CV/CL lists are `{ items, page, limit, hasMore }`)
- API modules: `apps/api/src/modules/{auth,users,cv,cover-letter,ai,templates,export,payment,support,admin,audit,mail,crm,firebase,legal}`
- Plans/entitlements: `packages/shared-types/src/subscription.types.ts` (`PLAN_CONFIGS`)
- Locales: `apps/web/public/locales/<loc>/common.json`
- English legal bodies: `apps/web/src/legal/*.ts` (chrome still in `t()`)
- English landing copy: `apps/web/src/content/ai-cv-builder.ts`, `apps/web/src/content/ai-cover-letter-generator.ts`, `apps/web/src/content/ats-cv-checker.ts` (`englishDocument`, no LegalDocumentView); `apps/web/src/content/public-templates.ts` (unique body on `/en/templates` only, not a new path)
- Launch QA: `QA_LAUNCH_CHECKLIST.md` (Phase 1 before live Stripe)

---

## 2. Local dev environment status

- `apps/api/.env` — present & correct (Firebase Admin, Stripe **test-mode key**, AWS SES). Backend boots on **:4000**.
- `apps/web/.env` — present; Firebase client vars fixed to `NEXT_PUBLIC_*`, `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.
- Frontend runs on **:3000**. CORS allows `http://localhost:3000`.
- ⚠️ Uses the **real (production) Firebase project `flacron-cv`** for local dev — the client
  chose this. A dedicated dev/emulator project is still the recommended long-term setup.
- To run: `cd apps/api && pnpm dev` and `cd apps/web && pnpm dev`.
- Stripe webhooks on localhost: `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe`.
  `/api/v1/payments/webhook` is not a route. Required for `QA_LAUNCH_CHECKLIST.md` Phase 1.

---

## 2A. Production infrastructure — AWS (verified 2026-08-16)

> **Added 2026-08-18.** Everything above this section predates the AWS migration. This section
> is the infrastructure record; §2 above describes **local dev only**. Operational detail and
> the post-deploy verification procedure live in `DEPLOYMENT_AND_OPS.md`.

**Where it runs.**
- **Frontend:** AWS Amplify, app `FlacronCV`, `main` branch, auto-deploys on push.
  `flacroncv.com` → `https://www.flacroncv.com`; apex and www both point at the Amplify
  CloudFront distribution via Hostinger DNS.
- **Backend:** ECS Fargate, cluster `flacroncv-production`, service `flacroncv-api`, container
  port **4000**, behind ALB `flacroncv-alb`, served at `https://api.flacroncv.com`. Region `us-east-1`.
- **Images:** ECR repo `flacroncv-api`, tagged with the 12-char commit SHA.
- **Deployment:** CodePipeline `flacroncv-api-pipeline` — GitHub `main` push → CodeBuild
  `flacroncv-api-build` (`buildspec-api.yml`) → ECS deploy consuming `imagedefinitions.json`.
  Fully automatic. **Do not hand-edit task definitions.**
- **Health check:** the health route is mounted on the raw HTTP adapter **outside** the global
  `api/v1` prefix so the load balancer can reach it (`apps/api/src/main.ts:143`).
  **`/api/v1/health` returning 404 is by design, not a bug.**

**The regressions from the 2026-08-16 firefight — and one added 2026-08-19 — guard against all of them.**
1. **`www` DNS pointed at a dead ALB** → `ERR_SSL_PROTOCOL_ERROR` for every visitor on the
   canonical hostname. Both apex and www must point at the **Amplify CloudFront** target.
2. **Firebase env vars lacked the `NEXT_PUBLIC_` prefix in Amplify**, so `next build` inlined
   nothing and Firebase never initialised in the browser. Localhost worked; production did not.
   These are **build-time** — changing them requires a **rebuild**, not a redeploy. This is the
   same class of bug recorded earlier in this file for local dev; it recurred in Amplify.
   *(CI now guards it: the `docker` job fails fast if any of the eight `NEXT_PUBLIC_*` build args
   is missing — `.github/workflows/ci.yml`.)*
3. **ECS ran a month-old image** while source had moved far ahead. The task definition referenced
   an immutable SHA tag, so "force new deployment" faithfully re-pulled the *same old image*.
   Cost hours of misdiagnosis. The pipeline now prevents it.
4. **CORS allowlist contained no production origin.** Origins are built from `FRONTEND_URL` +
   `ADDITIONAL_ORIGINS` (`apps/api/src/main.ts`). **Both** production origins must be present,
   because the apex→www redirect means either can be the browser's `Origin`. Comma-separated,
   no spaces. An empty allowlist is a fatal boot error by design; an unlisted origin is denied by
   omitting the header rather than throwing, because throwing surfaced as a 500.
5. **CORS `allowedHeaders` omitted client custom headers (2026-08-19 production outage).**
   Batch G added `X-Device-Token` (every `api.ts` call) and later `Idempotency-Key` (AI
   generate paths). `allowedHeaders` still listed only `Content-Type` / `Authorization` /
   `Accept-Language`. The post-deploy preflight in `DEPLOYMENT_AND_OPS.md` tested **Origin**
   (and method) only — it returned **204** while every real browser request was rejected at
   preflight because `Access-Control-Request-Headers` included `x-device-token`. **A
   verification command that cannot fail the way production fails is not a verification.**
   Guard: explicit `CORS_ALLOWED_HEADERS` (`apps/api/src/cors-allowed-headers.ts`), client
   catalog `CLIENT_CROSS_ORIGIN_HEADERS` (`apps/web/src/lib/api-cors-headers.ts`), parity
   test `api-cors-headers.test.ts`, and the OPTIONS curl must send
   `Access-Control-Request-Headers: authorization,content-type,x-device-token,idempotency-key`.

**Open, handled outside the codebase — do not attempt to fix in code:**
- 🔴 **Email verification 500** (`POST /api/v1/auth/send-verification`) — SES identity and sandbox
  status under investigation. See the V4 diagnosis in the 2026-08-18 change-log entry: the raw 500
  is **expected filter behaviour**, not proof of an unhandled path.
- **Stripe still in test mode.**
- **Secrets rotation in progress** (long-outstanding, also §8).

**Dead path — do not follow:** `RENDER_DEPLOYMENT.md` describes a Render.com Blueprint deploy from
a `render.yaml` that **does not exist in this repo**. Superseded by the pipeline above. `docker/`
(compose + nginx) belongs to the same pre-AWS path. `apps/api/src/main.ts:42` still carries a
comment reasoning about "Render's proxy" — harmless, but it is stale.

---

## 3. Completed sections ✓ (reviewed + fixed this engagement)

- [x] **Homepage** — removed false "IBM & Microsoft" AI claims and false "14-day trial";
  pricing shows real Stripe-verified monthly prices; yearly toggle kept but marked "Coming soon"
  (no real yearly price in Stripe); testimonials section hidden (was fabricated); accessibility
  (skip link, aria, reduced-motion), logo `priority`/sizing, `og.png`, i18n fixes.
- [x] **Navigation & Header** — theme system rewrite (no flash, persists, system mode);
  RTL-aware sidebar drawers; Escape-to-close + focus-return + scroll-lock on menus/dropdowns;
  skip-to-content, `aria-current`, translated aria-labels; Settings/Billing active-state fix;
  real logo in sidebars/auth. Fixed `transtone` typos. Custom 404 catch-all + localized.
- [x] **Authentication** — global rate limiting (ThrottlerGuard); password-reset enumeration
  protection (neutral response); display-name sync heal; verify-email redirect race fixed;
  `callbackUrl` hardening (+14 unit tests); friendly localized error map; full auth i18n (6 locales);
  autocomplete + aria-invalid/describedby; removed dead GitHub auth; +6 API tests.
  **Deferred (decision pending):** enforce `emailVerified` on API endpoints.
- [x] **Dashboard** — truthful upgrade copy; full i18n + Arabic/Urdu corruption repairs;
  monthly usage-reset reliability (chunked batches + startup catch-up marker) +8 tests;
  atomic usage increments (`FieldValue.increment`) +2 tests; live stats via `GET /users/me/usage`
  (skeleton/error/progress); honest degraded mode (no fake FREE plan); a11y; API 15s timeout.
- [x] **Resume Builder (CV)** — Slate-Gold DOCX missing-sections fix; multi-line text (`pre-line`)
  across all 5 layouts; failed-fetch error/retry state; localStorage backup Firestore-Timestamp fix;
  reorder persistence + duplicate() integrity (+test); keyboard drag-drop + a11y; mobile Edit/Preview
  toggle; inline email validation; full CV-editor i18n (6 locales); RTL polish.
- [x] **Cover Letter Builder** — localized the generated letter itself (salutation/closing/date/RTL,
  all 6 templates); AI-Improve confirmation dialog (was destructive); pass locale to AI-on-create;
  mobile Edit/Preview toggle + beforeunload + flush-on-unmount; full editor & list i18n; error states;
  a11y; fixed `transtone` chevron; default template `standard`→`modern`.

---

## 4. Errors found & fixed ✓

- [x] **Missing Firestore composite indexes (would fail in production).** Multiple composite `where + orderBy` queries
  had **no declared index** → Firestore rejects them at runtime. Fixed across two passes (2026-07-19): `job_applications`
  (job tracker list), `crm_transactions` (customer purchase-history), and — caught by the adversarial self-review — the
  **`crm_activities` customer-timeline query, which had NO index at all (HIGH: failed unconditionally)**, plus all the
  remaining multi-filter CRM combos. `firestore.indexes.json` then **37 indexes** (JSON-validated).
  ~~**Needs `firebase deploy --only firestore:indexes`.**~~ **Resolved 2026-08-19:** Firebase
  console shows **38** composite indexes, all **Enabled**, including `crm_activities`
  (customerId + createdAt), `job_applications` (userId + deletedAt + updatedAt), and
  `crm_transactions` (customerId + date). Deployed earlier; the record was never updated.
  (Full breakdown in the change log.)

- [x] **API won't start (`Cannot find module dist/main`)** — `nest-cli.json` `deleteOutDir:true`
  conflicted with `tsconfig.json` `incremental:true`: deleting `dist/` while keeping the incremental
  cache made `tsc` skip re-emit. Fixed by `deleteOutDir:false` (documented in `apps/api/README.md`).
- [x] **Cannot sign up/login ("Something went wrong")** — `apps/web/.env` used `NEXT_FIREBASE_*`
  instead of `NEXT_PUBLIC_FIREBASE_*`, so the client got no Firebase config. Renamed vars; API URL fixed.
- [x] **Google popup crash ("Pending promise was never set")** — `apps/mobile`'s
  `@react-native-async-storage/async-storage` contaminated the web `firebase/auth` resolution.
  Fixed in `apps/web/src/lib/firebase.ts` via explicit `initializeAuth` with browser persistence +
  `browserPopupRedirectResolver`. (If it recurs in dev, fallback = switch Google to `signInWithRedirect`.)

---

## 5. Client improvement requirements → status (from FlacronCV.pdf)

Legend: ✓ done · ◐ partial · ✗ missing · ⤵ deferred/decision-needed

### 5.1 Subscriptions, entitlements & usage control ("users get exactly what they paid for")
- ✓ Plans defined — **FREE / PRO / CAREER ACCELERATOR / ENTERPRISE.** The 4th plan (**Career Accelerator**, PDF requirement)
  was added 2026-07-20 (A6) — full enum/config/entitlements/CRM. **Batch E 2026-08-18: hidden from
  every public surface** (pricing, billing, comparison, upgrade modal, JSON-LD offers) via
  `customerFacingPlans()` / empty `stripePriceIdMonthly`. **Filling that Stripe id is the launch
  pin — do not fill it by accident.** Admin CRM grant still lists it.
- ✓ Entitlement enforcement — CV/cover-letter/export/AI limits enforced server-side; usage atomic; now
  **status-aware** — delinquent (past_due/unpaid/incomplete) accounts fall back to FREE limits after their
  paid-through date via `resolveEffectivePlan()` (grace-until-period-end).
- ⚠️ **UPDATED 2026-08-18 — the cancel→resubscribe trial hole is now substantially CLOSED.** The
  deferred item (d)/(a) in the 2026-07-20 change-log entries described `isFirstTimeSubscriber` as
  reading only `stripeSubscriptionId`, which is nulled on cancel. **That description is wrong as of
  this date — do not commission a backfill or a “fix the live leak” task on it.** It falls back to
  Stripe's own history: `subscriptions.list({ customer, status: 'all' })` and **fails closed** on
  error (`apps/api/src/modules/payment/payment.service.ts`). `stripeCustomerId` is *not* cleared
  by cancel or `revokeToFree()`. **Batch G part 1 added `subscription.hasUsedTrial` as
  defence-in-depth** (never cleared; consulted *in addition to* the Stripe list). No production
  backfill was run. Residual: a stored customer id that no longer resolves in Stripe; a new email
  (that is the device/identity problem, not this flag). **MC5 (2026-08-21):** billing Pro CTA
  waits on `GET /payments/trial-eligibility` (heals the flag, never creates a customer);
  checkout with `expectTrial` refuses a paid session on mismatch (`TRIAL_NOT_ELIGIBLE`).
- ✓ **Trial system** — **BUILT 2026-07-20, Pro-only as of Batch E 2026-08-18.** Stripe
  `trial_period_days` on **Pro** checkout for a first-time subscriber (anti-abuse via Stripe
  history). **Enterprise never receives a trial** — server skips `trial_period_days` even for a
  first-time subscriber; CTA is "Choose Enterprise". Card still collected upfront. Assumed **7-day**.
- ◐ Subscription lifecycle: **refund / dispute / paused now downgrade to FREE** (✓, implemented +
  tested); expired/failed/upgraded still to verify.
- ⚠️ **CORRECTED 2026-08-18 — yearly billing is now ENABLED.** The bullet below is left as written
  because it was true when written. Current state: `YEARLY_BILLING_ENABLED = true`
  (`packages/shared-types/src/subscription.types.ts:273`), real year-interval price ids are
  configured for Pro and Enterprise, and `allowedCheckoutPriceIds()` admits the yearly ids under
  that same flag (`apps/api/src/modules/payment/payment.service.ts:52`). Yearly plans are on sale.
  The overcharge is now structurally prevented by a different mechanism: the browser no longer
  chooses a price at all — checkout takes `{plan, interval}` and the server resolves the id
  (`payment.service.ts:120-134`), `normalizeInterval` defaults anything unrecognised to the
  *cheaper* MONTH (`:143`), and the resolved id is still allowlist-checked (`:169`).
  `plan-advertising.spec.ts:127` asserts the flag is on **iff** both annual ids are present, so the
  flag cannot be flipped without ids and ids cannot be added without noticing the flag.
  ⚠️ **UNVERIFIED:** that both Stripe ids really are `interval=year` in the deployed account.
  `apps/api/scripts/verify-yearly-prices.mjs` settles it; it was not run (reaches Stripe).
- ◐ **Billing & usage page** (`settings/billing`) — **yearly overcharge path removed** (✓ monthly-only;
  yearly toggle shows "Coming soon"); **billing history + invoice access now real (✓ A3, 2026-07-19** — native
  invoice list from Stripe with PDF download links); **usage-remaining now shown (✓ A2, 2026-07-19** — each metered
  item shows "N remaining"); the only remaining gap is an in-app cancellation control (currently via the Stripe
  billing portal) per PDF.
- ✓ **Automated tests** for plan permissions / activation / payment success+failure / cancel / renewal /
  upgrade / downgrade / refund / usage limits / expired access — **the full PDF list is now covered at the
  service layer** (A5, 2026-07-19): payment lifecycle in `payment.service.spec` (activation, renewal+usage-reset,
  payment-failure→past_due, upgrade, downgrade, cancel, refund, dispute, verifySession ownership), entitlement/grace/
  expired-access in `subscription-entitlements.spec`, create-limit + usage enforcement in `cv`/`cover-letter`/`export`
  specs. API suite: **193 tests green.** (Only theoretical remainder: HTTP/controller-level e2e — service layer is the
  enforcement point and is fully covered.)

### 5.2 Career-platform features
- ✓ **ATS scoring** — AI endpoint `POST /ai/ats-check` **now wired to a user-facing UI** (B1): an "ATS Check" button in
  the CV-editor toolbar opens `ATSCheckModal` (paste a job description → score + matched/missing keywords + suggestions;
  credit-gated, 6 locales). CV content is auto-serialized from the editor. *(Marketed-but-hidden feature now live.)*
- ✓ **Resume import + parsing** — **DONE** (B3): "Import from an existing resume" on `cv/new` → paste **or upload a
  PDF/DOCX** → AI parses it (`POST /cvs/import`) into a populated CV. **File upload added 2026-07-20** — client-side text
  extraction (`pdfjs-dist` for PDF, `mammoth` for DOCX) feeds the same import flow. (No OCR for scanned PDFs — see assumptions.)
- ✗ **Job-description matching** — not implemented (beyond cover-letter AI using JD text).
- ✓ **Job tracker** — DONE (B4): new `/jobs` dashboard page + sidebar link — add/edit/delete applications, quick
  status change, status filter; new `jobs` backend module (`job_applications` collection, userId-scoped CRUD, validated
  DTOs, ownership + soft-delete + field-whitelist). 6 statuses (wishlist→applied→interviewing→offer→rejected→accepted).
- ✓ **Interview preparation** — DONE (B5): "Interview Prep" CV-editor toolbar button → `InterviewPrepModal` (paste a
  job description, CV auto-serialized as context → AI returns behavioral + technical questions, questions to ask, and
  tips; `POST /ai/interview-prep`, credit-gated, 6 locales).
- ✓ **LinkedIn optimization** — DONE (B6): "LinkedIn" CV-editor toolbar button → `LinkedInModal` (optional target
  role, CV auto-serialized → AI returns an optimized headline, About section, skills/keywords, and tips, each
  copy-to-clipboard; `POST /ai/linkedin`, credit-gated, 6 locales).
- ✓ **AI resume tailoring / writing** — `AISummaryModal` **now wired** (B2): a "Generate with AI" button next to the
  CV summary field opens it (generate → replace/append to the summary; credit-gated). All 25 of its i18n keys already
  existed in 6 locales; it was purely unwired.
- ✓ Cover-letter generation — works (create + AI improve).
- ✓ Multilingual support — 6 locales incl. RTL (ongoing polish).

### 5.3 Lead capture & marketing automation (entirely ✗ — big new build)
- ✗ Opt-in forms (homepage, exit-intent, scroll, ATS-score offer, newsletter, registration consent).
- ✗ Lead magnets (ATS score, resume checklist, job-search guide, cover-letter template, interview checklist).
- ✗ Consent capture (never preselected; record consent text/version/date/source; double opt-in).
- ✗ Preference center, suppression list, do-not-contact, cookie consent, per-channel consent.
- ✗ CRM/marketing-automation lead flow + tags/segments + automated campaigns.
- ◐ CRM module exists (`apps/*/crm` — customers/leads/revenue/segments admin) but no public capture or automation.

### 5.4 Analytics / event tracking (◐ — Batch L catalog + call sites; awaiting measurement id)
- ◐ **Provider-agnostic event layer (D1) + GA4 adapter + Batch L (§47–49).** Consent-gated by
  the Analytics category of the three-category consent record (`lib/consent.ts`). Funnel events
  include `signup_started` (signed-out register form only), `email_verified` (once per uid in
  browser localStorage — not a server unique), `cv_creation_started`, `cv_created` (incl. import),
  `cv_exported`, `cover_letter_created`, `checkout_started`, `plan_upgraded`, `ai_generation`
  (`{ feature }` only — never tokens), `free_allowance_exhausted`, plus the four abuse codes.
  Landing and upgrade-page views rely on `page()` — no named duplicates. **To go live the client
  sets `NEXT_PUBLIC_GA4_MEASUREMENT_ID`** (until then GA4 no-ops safely). Gate:
  `apps/web/src/lib/analytics.test.ts` proves nothing reaches `gtag` before Analytics consent.

### 5.5 Cross-cutting (client's extra asks)
- ◐ **De-AI the design** — **foundational refresh done 2026-07-20** (design tokens: premium layered shadows, near-black
  dark elevation, tighter typography; unified card/input/button/modal; landing hero de-gradient-text + single-accent;
  auth panel reworked). Deeper per-page polish (dashboard KPIs/tables, all forms, full mobile audit) is ongoing E2.
- ◐ **Logo update** — **official brand logos wired everywhere 2026-07-20** via a theme-aware `<Logo/>`
  (`logo-ink-dark.png` on light / `logo-ink-light.png` on dark). **Standing client request — do not
  re-discover:** both PNGs still have an **opaque baked-in rectangle** (on-dark is a black box).
  Needed from the brand owner: **transparent SVG exports at matched proportions**. See §8.
- ✅ **SEO** — Batch D shipped (canonical www, sitemap, robots, `pageMetadata`,
  hreflang, Organization/WebSite/SoftwareApplication/FAQ/BreadcrumbList, private
  `noindex`). 2026-08-22 leftovers: FAQ JSON-LD Free cadence aligned with
  `faq.a1`; `/testimonials` omitted from the sitemap until real quotes exist;
  nav/footer `#features`/`#pricing` are locale-prefixed. Homepage
  `generateMetadata` is still English-only (hand-rolled; localisation is a
  separate change). Apex→www is still **302**, not 301 (CDN).
- ◐ Security / accessibility / mobile responsiveness — improved on reviewed sections; remaining pages pending.
- ✗ Admin controls / analytics dashboards / enterprise capabilities — partial admin exists; verify vs PDF.

---

## 6. Remaining sections to review (not yet audited)

- [x] **Pricing / Billing + Payments / Stripe — REVIEWED 2026-07-17. A(b)+B FIXED 2026-07-17.**
  - 🔴→✅ CRITICAL (FIXED): `settings/billing` "Yearly" toggle sent `stripePriceIdYearly`, which bills **monthly**
    ($359.99/mo Pro, $1,199/mo Ent) while the UI showed $239.88/yr / $799.88/yr → ~18× overcharge, reachable by all free users.
    **Fix A(b):** billing page is now monthly-only — yearly toggle is disabled and marked "Coming soon", checkout always sends the monthly price, false "Save 33%" removed. Backend `createCheckoutSession` now enforces a **monthly-price whitelist** (`allowedCheckoutPriceIds()`), rejecting yearly/arbitrary IDs with `BadRequestException` (defense in depth).
    **⚠️ SUPERSEDED 2026-08-18:** yearly is enabled again and the whitelist now admits the yearly ids
    under `YEARLY_BILLING_ENABLED`. The fix above is history; see the corrected bullet in §5.1.
  - 🟠→✅ HIGH (FIXED): **Fix B** — added webhook handlers `charge.refunded` (full refunds only), `charge.dispute.created`, and `customer.subscription.paused`, all routed through a shared `revokeToFree()` that cancels the Stripe subscription (best-effort) and downgrades the user to FREE. Refunded/disputed users no longer keep paid access.
  - 🟡→✅ MED (FIXED, C): Entitlement checks read `subscription.plan` only, never `subscription.status` → past_due/unpaid kept paid access during dunning. **Fix:** new `resolveEffectivePlan(subscription, now?)` in shared-types resolves delinquent (past_due/unpaid/incomplete) accounts to FREE once past `currentPeriodEnd` (grace-until-period-end, client-approved policy); all backend gates (cv ×3, cover-letter ×2, export quota + DOCX, AI credit ceiling) now route through it. +19 resolver unit tests.
  - 🟡 MED: No trial system (`trial_period_days` never set; trialStart/End always null).
  - 🟡 MED: Billing page — upgrade/downgrade only shown to FREE users (paid users can't change plan except via portal); billing history is an empty placeholder; "Save 33%" is false; a few hardcoded English strings.
  - ✓ Good: webhook signature verification, idempotency (payment_events + TTL), atomic plan+usage batch, downgrade-to-free on subscription.deleted, portal session, verifySession ownership check.
- [x] **Settings & Profile — REVIEWED 2026-07-17** (findings below, awaiting approval to fix). Reviewed
  `settings/page.tsx` + `settings/layout.tsx` + backend `users` module. Backend `users.service` update logic is
  sound (dot-path writes, atomic increments). Confirmed findings:
  - 🟠→✅ HIGH (S1, FIXED): **Account deletion never revoked sessions.** `softDelete` now calls
    `revokeRefreshTokens` + `updateUser({disabled:true})` (best-effort, mirrors `crm-users.suspendUser`), and the
    frontend delete flow signs the user out (`logout()`) before redirect. Residual: existing ID tokens stay valid
    ≤~1h unless the guard is hardened with `checkRevoked`/`isActive` (deferred — per-request cost, see below).
  - 🟡→✅ MED (F1, FIXED): **Email-notifications toggle CSS** — fixed the `transtone-x-full` typo →
    `translate-x-full` (both the base + rtl variant); the toggle thumb now slides. (`settings/page.tsx:446`)
  - 🟡→✅ MED (F2, FIXED): localized the 6 avatar-upload strings + `alt` via a new `settings.avatar.*` group
    (6 locales, size parameterized `{max}`). (`settings/page.tsx`)
  - 🟡→✅ MED (F3, FIXED): added `aria-label` to the language/theme `<select>`s + notifications checkbox, and
    `aria-current="page"` to the active settings tab (mobile + desktop). (`settings/page.tsx`, `layout.tsx`)
  - 🟡→✅ MED (S2, FIXED): **field whitelisting + validation** added to `users.service.update()` — profile writes
    are confined to a known-field allow-list with per-field length caps (unknown keys dropped); preferences validate
    language/theme against the enums, `emailNotifications`/`marketingEmails` as booleans; invalid known values → 400.
  - 🟢→✅ LOW (S3, FIXED, with S2): photoURL validated as an https URL ≤2048 chars (rejects `javascript:`/`data:`/http);
    displayName length-capped.
  - 🟢→✅ LOW (F5, F6 FIXED 2026-07-20): **F5** — avatar-preview `URL.createObjectURL` was never revoked (memory leak);
    now revoked via a `useEffect` cleanup on replace/unmount. **F6** — account-delete required typing the English word
    "DELETE" in all 6 locales; now a **localized keyword** (`settings.account.deleteKeyword`: ELIMINAR/SUPPRIMER/LÖSCHEN/
    حذف/…) with the instruction parameterized (`{keyword}`), matched case-insensitively.
  - 🟢 LOW (remaining): S4 GET/PUT/PATCH `/users/me` return the full doc (Stripe IDs, role, isActive); F7 no
    unsaved-changes guard.
- [x] **Admin area — REVIEWED 2026-07-18** (3-dimension adversarial security review, 14 agents; 11/11 confirmed, 0 stubs).
  Awaiting approval to fix. AdminController itself is fully guarded (class `@UseGuards(FirebaseAuthGuard, RolesGuard)`
  `@Roles('admin','super_admin')`); role = Firebase ID-token custom claim (set by auth.setUserRole + crm.updateUserRole).
  - 🟠→✅ HIGH (×2, same root, FIXED): **Privilege escalation — any `admin` could self-promote to `super_admin`** via
    `PUT /crm/users/:id/role`. **Fix:** method-level `@Roles('super_admin')` on `updateRole` (overrides the class
    `@Roles('admin','super_admin')`) — now matches the super_admin-only `/auth/set-claims`, so a plain admin gets 403;
    plus a **last-super_admin guard** in `updateUserRole` (blocks demoting the final super_admin → `BadRequestException`).
    +3 unit tests. (api 116/116).
  - 🟡→✅ MED (FIXED): **Admin mutations now audit-logged** — injected the @Global `AuditService` into `AdminController`;
    `PATCH /admin/users/:id` writes `ADMIN_USER_UPDATED` and `PATCH /admin/tickets/:id` writes `ADMIN_TICKET_UPDATED`
    (actor uid/email/role, resourceId, patch metadata) to `audit_logs` — the same collection the admin audit page reads.
    +2 controller tests.
  - 🟢→✅ #11 (FIXED, wire-to-CRM): the admin **Users** + **Subscriptions** pages were broken duplicates of the working
    CRM. **Fix (frontend-only):** Users page now calls `GET /crm/users` (maps `items`→rendered shape), role change →
    `PUT /crm/users/:id/role` (super_admin-only), ban/unban → `PUT /crm/users/:id/suspend`|`/reactivate`. Subscriptions
    page now lists from `GET /crm/subscriptions` (amount÷100) with stats from `GET /admin/analytics/revenue`. No new/
    duplicate backend. web type-check ✓ + build ✓. **Discovery logged:** admin panel & CRM overlap on users/subs/
    analytics/audit — worth a future consolidation decision (admin-unique = tickets + templates).
  - 🟢 LOW (remaining): admin route group gated only client-side (backend IS enforced — defense-in-depth);
    `PATCH /admin/tickets/:id` mass-assignment (`Partial<SupportTicket>`); admin list endpoints over-fetch raw user
    docs (Stripe IDs, phone) to the browser; admin templates/tickets/audit pages hardcode English (i18n); a11y (icon
    buttons unlabeled, role `<select>` no label, table rows not keyboard-operable).
- [x] **CRM area — REVIEWED 2026-07-18** (3-dimension adversarial security review; 2/2 confirmed, 0 stubs). The CRM is
  otherwise well-built — the audit-coverage, DTO-validation/CSV-injection, and frontend/data-exposure dimensions all
  came back **clean**. Both findings are the SAME tier-gap as the role escalation just fixed, on the **sibling**
  user-mgmt endpoints (I hardened `PUT /crm/users/:id/role` to super_admin, but its siblings inherit
  `@Roles('admin','super_admin')` with no target-tier check). Awaiting approval to fix.
  - 🟠→✅ HIGH (FIXED) + 🟢→✅ LOW (FIXED): **admin↔super_admin tier gap on the sibling user-mgmt endpoints.**
    **Fix:** new `assertCanManageTarget(actorRole, targetRole)` in `crm-users.service` — a non-super_admin actor
    cannot suspend / reactivate / plan-change / reset-usage a **super_admin** target (403); applied to all four
    methods, with the actor's role now threaded from the controllers. Admins keep managing regular users. +4 tests
    (blocks admin→super_admin suspend & no session-revoke; super_admin→super_admin allowed; admin→regular still works;
    plan/reactivate/reset blocked on super_admin). (api 122/122).
- [x] **Templates system — REVIEWED 2026-07-18** (3-dimension adversarial workflow, 22 agents; 19/19 confirmed, 0
  stubs). The 19 collapse to a small distinct set — dominated by ONE systemic issue: **the template/layout paywall is
  UI-only; there is no server-side tier enforcement for the actual render levers.** **T1–T5 FIXED 2026-07-18**
  (approved: full paywall close + graceful fallback; the 8 LOWs deferred). See the FIX summary after the findings.
  Findings (severities as originally found):
  - 🟠 HIGH (T1): **FREE/downgraded users can apply & export PRO CV layouts** (top-bar/compact/slate-gold). The renderer
    is driven by `cv.styling.layout` (LivePreview.tsx:16, render-layout.ts:91), which is gated **only** in the UI
    (`TemplatePanel` LAYOUT_PLAN). `CVService.update` writes every `styling.*` key verbatim with **no tier check** —
    `checkTemplateAccess` runs only for `data.templateId`, never `styling.layout`. So `PUT /cvs/:id {styling:{layout:'slate-gold'}}`
    persists a PRO layout; export is 100% client-side + the export gate never checks layout tier. (`cv.service.ts:253,271`)
  - 🟠 HIGH (T2): **FREE users can select & export PRO/ENTERPRISE cover-letter templates.** `CoverLetterService` has
    **no `checkTemplateAccess` at all** — create stores `templateId` raw (`||'modern'`) and update spreads `...data`.
    Tiers (minimalist/creative=PRO, corporate/executive=ENTERPRISE) live only in the frontend registry. `PUT /cover-letters/:id
    {templateId:'corporate'}` is accepted unchecked. (`cover-letter.service.ts:54,109`)
  - 🟡 MED (T3): **The single export gate (`recordClientExport`) never checks template/layout tier** — only DOCX-is-paid
    + monthly quota. This is why T1/T2 export end-to-end, and it leaves a **downgrade path** (select PRO while paid →
    downgrade → stored tier never re-validated on save or export). (`export.service.ts:71-90`)
  - 🟡 MED (T4): **`checkTemplateAccess` is binary (free_only vs all)** — it doesn't distinguish PRO from ENTERPRISE, so
    even the CV `templateId` gate lets a PRO user save ENTERPRISE-tier templates the UI locks. (`cv.service.ts:108-125`)
  - 🟡 MED (T5): **Cover-letter template pick is never persisted** — the autosave + unmount-flush payloads OMIT
    `templateId` (and create never sends it), so a picked cover-letter template silently reverts to 'modern' on reload
    (while the accent color it also set DOES persist → visibly inconsistent). A broken feature. (`cover-letters/[id]/page.tsx:167,134`)
  - 🟢 LOW ×8: `GET /templates` + `/templates/:id` are **unauthenticated and return raw docs** (internal `createdBy`,
    soft-deleted templates) (found ×2); `checkTemplateAccess` **fails open** when the template doc is missing (unseeded
    catalog → CV gating silently disabled) (×2); the backend **cover-letter registry is orphaned** (seeds `cl-*` ids that
    match no renderer; the bare ids the app uses aren't seeded); **tier data drifts across registries** ('compact' is FREE
    as a template but PRO as a layout; 'two-column' is PRO but renders the FREE 'sidebar'); `seedDefaults` **only creates
    missing docs** so code edits to tier/name never propagate; and **hardcoded English / a11y** on the dashboard
    `pick-template` page, `TemplatePanel` mobile toggle, and `TemplateCard`/`TemplatePreviewModal`.
  - 🟢→✅ **LOW backend batch FIXED 2026-07-18:** **L1** — public `GET /templates` + `/templates/:id` now data-minimized
    (`toPublic` strips `htmlTemplate`/`cssTemplate`/`createdBy`/`isActive`; `findPublicById` 404s on soft-deleted);
    runtime-verified (16 rows, no internal fields). **L2** — added authoritative `CV_TEMPLATE_TIER` in shared-types;
    `checkTemplateAccess` uses it first, so built-in premium templates are gated even on an unseeded catalog (fail-open
    closed) — unknown/custom ids still fall back to the doc. **L5** — `seedDefaults` now upserts (tier/name/localization
    edits propagate on re-seed). **L4** (tier drift) — resolved by the paywall fix (`compact` layout = FREE; the
    remaining 'two-column'=PRO-template-on-free-sidebar is benign). +6 tests → api 163/163.
  - 🟢→✅ **LOW i18n/a11y batch FIXED 2026-07-18 (partial):** **L6** — the CV-creation `pick-template` page is i18n'd
    (new `template_picker` namespace, 29 keys ×6 locales incl. RTL, reusing `common` for tier/upgrade/back). **L8a** —
    `TemplateCard` (badges, paywall modal, buttons, preview) i18n'd via the same namespace. **L7a** — `TemplatePanel`'s
    "Design" toggle now has an accessible name (`aria-label` + `aria-expanded`), fixing the mobile no-name a11y bug.
    **Still deferred (one larger i18n pass):** `TemplatePreviewModal` + the `TemplatePanel` design-panel copy/colors/
    labels, plus the broader still-English admin/dashboard pages. L3 (orphaned `cl-*` seeds) harmless.
  - 📝 Note: the earlier A7 work made the FRONTEND gates status-aware (display/selection only) and A8 added the export
    DOCX+quota gate — but neither closed the SERVER-SIDE template/layout tier enforcement, which is what T1–T4 expose.
  - ✅ **FIX (2026-07-18, approved — full paywall close + graceful fallback):** new **single source of truth** in
    shared-types (`template.tiers.ts`: `CV_LAYOUT_TIER`, `COVER_LETTER_TEMPLATE_TIER`, `PLAN_RANK`, `planMeetsTier`,
    `canUse*`, `effective*`). **T4:** `cv.service.checkTemplateAccess` now does a tier-ORDER check (free<pro<enterprise),
    so a PRO user can't use an ENTERPRISE template. **T1:** `cv.service.update` blocks NEWLY selecting an over-tier
    `styling.layout` (re-sending the already-stored layout, as autosave does, is allowed → no data loss on downgrade).
    **T2:** `cover-letter.service.create`+`update` now enforce template tier (same new-vs-resend rule). **T3 (graceful
    fallback):** `LivePreview` + `CoverLetterPreview` render the **effective** layout/template — a premium design on a
    downgraded account falls back to a free one for preview + the client PDF export (stored value untouched, so
    re-upgrade restores it); DOCX is already FREE-blocked so its downgrade edge is negligible. **T5:** cover-letter
    autosave + unmount-flush now persist `templateId` (picks stopped silently reverting). `TemplatePanel` now consumes
    the shared `CV_LAYOUT_TIER`/`canUseCvLayout` (single source; UI matches server). **DECISION (flag):** the `compact`
    layout is treated as **FREE** (the free "Compact" template renders it — gating it PRO would break that template);
    only `top-bar` + `slate-gold` are the genuinely-PRO CV layouts. If you want `compact` to be premium, the free
    "Compact" template must also become PRO — say the word. **Residual (architectural, §8):** export is 100%
    client-side, so a user who tampers with their own browser could still render a premium design they have *stored* —
    but the server write-block means a FREE user can never store one, and honest downgrade render/export falls back.
    True end-to-end export enforcement needs the server-side (Puppeteer) export path (§8). **+27 tests** (tier helpers
    ×15, cv.service ×8, cover-letter.service ×7). **QA:** shared-types built; api type-check ✓ + **157/157**; web
    type-check ✓; web build compiled + static 5/5 ✓; cv/cover-letter editor routes compile in dev (200).
- [x] Templates SEO/public-gallery metadata — done earlier (see SEO batch in §6 public-pages).
- [x] **Object-level authorization (IDOR) — AUDITED 2026-07-20** (10-agent find→verify across cv/cover-letter/jobs/export).
  **Clean — 0 cross-user IDOR** (ownership enforced in every by-id path). Surfaced + fixed one non-IDOR privacy bug: a
  publicly-shared CV stayed reachable by its slug after deletion (`findByPublicSlug` didn't filter `deletedAt`; `delete()`
  didn't revoke the share) — both fixed, +2 tests. Detail in the change log.
- [x] **AI module — REVIEWED 2026-07-20** (24-agent adversarial workflow; 10/10 confirmed). First review + first tests of
  the B1–B6 AI features. HIGH circuit-breaker cross-tenant DoS + MED no-timeout + LOW key-log + LOW brittle-JSON **FIXED**
  (api 200 green); **MED TOCTOU credit race FIXED 2026-07-20** (atomic transaction-based reserve/refund, api 207 green) +
  MED credit-metering-on-abandoned substantially mitigated + **LOW AISummaryModal error-masking FIXED** → **all 10
  AI-review findings now resolved.** Full detail in the change log.
- [x] **Support / tickets — REVIEWED 2026-07-18** (adversarial workflow, 7 agents, frontend dimension 5/5 confirmed 0
  stubs; **backend authz/validation finder FLAKED to a stub → re-done by direct file read**). User-side ownership is
  solid — `listByUser` scopes by uid; `getTicket`/`addMessage`/`closeTicket` each check `ticket.userId !== user.uid`
  → 403 (no IDOR). **✅ SUPPORT SECTION COMPLETE 2026-07-18** — Batch 1 (B1/B2/B3/F-D) + Batch 2 (F-C + close-404 +
  detail i18n) + Batch 3 (F-A admin support) + Batch 4 (F-B/F-E/B4) all FIXED. Only the product-gap observation
  (no email on ticket creation) remains open by design. Findings:
  - 🟠→✅ MED (functional, F-A, FIXED): **Admins couldn't open/read/reply to ANY ticket via the UI.** Admin list rows
    pushed to the ownership-guarded *dashboard* `/support/:id` (403 for admins → `ticketNotFound`); there was no admin
    ticket-detail page and no admin single-ticket/reply endpoints. **Fix (backend + frontend):** added
    `GET /admin/tickets/:id` (ticket + message thread, class-guarded admin/super_admin) and audit-logged
    `POST /admin/tickets/:id/messages` (posts as `authorRole:'admin'` → moves ticket to WAITING_ON_CUSTOMER; author
    shown as "Support Team" so staff emails aren't exposed; actor captured via authorId + `ADMIN_TICKET_REPLIED` audit);
    new admin ticket-detail page (`(admin)/admin/tickets/[id]/page.tsx`) with thread + reply form + status `<select>`
    (via the audit-logged `PATCH /admin/tickets/:id`); admin list rows now navigate to `/admin/tickets/:id`. +2 tests.
    **Also FIXED (DISCOVERED — the admin list was contract-broken):** the list read `data.tickets`/`totalPages`/
    `userName` but the API returns `items`/`limit`/`userDisplayName`, so it showed **"No tickets found" regardless of
    data**; remapped to `items` + computed `totalPages = ceil(total/limit)` + `userDisplayName`. (Admin pages stay
    hardcoded-English — covered by the F-B batch.) (`admin.controller.ts`, `admin/tickets/page.tsx`, `[id]/page.tsx`)
  - 🟠→✅ MED (correctness, B1, FIXED): **New tickets & customer replies were mislabeled `waiting_on_customer`.**
    `addMessage` set status `= authorRole==='admin' ? IN_PROGRESS : WAITING_ON_CUSTOMER`; since `createTicket` posts the
    opening message as `'user'`, every new ticket instantly flipped OPEN→WAITING_ON_CUSTOMER, and every customer reply
    did the same (inverted — hid them from the agent "needs a reply" queue). **Fix:** mapping corrected to
    `authorRole==='admin' ? WAITING_ON_CUSTOMER : OPEN` (customer message ⇒ OPEN/needs an agent; agent reply ⇒ waiting
    on customer). +3 tests. (`support.service.ts`)
  - 🟡→✅ MED (B2, FIXED): **No input validation on ticket create / message** — `CreateTicketData` + `{content:string}`
    were plain interfaces → global ValidationPipe was a no-op. **Fix:** added class-validator DTOs `CreateTicketDto`
    (subject non-empty ≤200, `@IsEnum` category, optional `@IsEnum` priority, message non-empty ≤5000) + `AddMessageDto`
    (content non-empty ≤5000) and wired them into `support.controller`; the global pipe (`whitelist` +
    `forbidNonWhitelisted` + `transform`) now validates values and strips unknown fields. (`support/dto/*.dto.ts`,
    `support.controller.ts`)
  - 🟢→✅ LOW (B3, FIXED): **Admin `updateTicket` mass-assignment** — `PATCH /admin/tickets/:id` passed
    `Partial<SupportTicket>` straight into `updateTicket` which spread `...data` (an admin could rewrite `userId`
    → reassign ownership → lock the real owner out via the ownership guard, or `id`/`createdAt`). **Fix:** `updateTicket`
    now whitelists `status`/`priority`/`assignedTo`/`assignedToName`/`resolvedAt`/`closedAt` and drops everything else.
    +3 tests. (Previously-noted Admin LOW, located here — `support.service.ts`, `admin.controller.ts:87`.)
  - 🟢→✅ LOW (B4, FIXED): **No dedicated rate limit** on ticket/message creation. **Fix:** per-route `@Throttle` on
    the support controller — ticket create **5/min**, message post **20/min** (on top of the global throttler, mirroring
    `/contact`). (`support.controller.ts`)
  - 🟢→✅ LOW (F-B, FIXED): admin ticket pages were almost entirely hardcoded English (and `admin.error_loading` was
    itself a **missing key**). **Fix:** i18n'd the admin **list + detail** pages via the `admin` namespace, reusing the
    `support.priorityLabels`/`statusLabels`/`categoryLabels` groups for enum values (no duplication); added **27 admin
    keys ×6 locales** incl. the missing `error_loading` + `page_of` (with `{page}`/`{total}` params). (Rest of the admin
    area — sidebar/users/subs/audit — still hardcoded English; a broader Admin-i18n task, not Support.)
    (`admin/tickets/page.tsx`, `[id]/page.tsx`)
  - 🟢→✅ LOW (F-C, FIXED): dashboard/detail/new ticket badge & select labels were hardcoded English maps → now use
    `t()` via new `support.priorityLabels`/`statusLabels`/`categoryLabels` key groups ×6 locales (parity ✓); variant
    (color) maps kept. (`support/page.tsx`, `[id]/page.tsx`, `new/page.tsx`)
  - 🟢→✅ LOW (F-D, FIXED): dashboard ticket list had **no error state** — a failed fetch rendered the "you have no
    tickets" empty card + "create your first ticket" CTA (misleading; hid load failures). **Fix:** added an `isError`
    branch with a distinct error card + Retry (`refetch`); new `support.load_error`/`support.retry` keys ×6 locales
    (parity ✓). (`support/page.tsx`)
  - 🟢→✅ LOW (F-E, FIXED): admin ticket `<tr>` was click-only. **Fix:** now `role="button"` + `tabIndex={0}` +
    `onKeyDown` (Enter/Space) + focus-visible ring + translated `aria-label` ("Open ticket: {subject}"); also added
    `aria-pressed` to the status filter tabs. (`admin/tickets/page.tsx`)
  - 📝 Observation (product gap, not a fix-now item): ticket creation writes only to Firestore — **no email/notification
    to support** (unlike `/contact`), so agents must poll the admin page. Combined with F-A, the agent side of support
    is effectively non-functional today.
  - 🟠→✅ MED (DISCOVERED during batch-1, FIXED in batch-2): **Users couldn't close their own ticket from the UI.** The
    detail page's close button called `PATCH /support/tickets/:id` (no such route) → 404 → "close failed" toast. **Fix:**
    now calls the dedicated `PATCH /support/tickets/:id/close` (ownership-checked; deliberately not a generic PATCH,
    which would open a user-side mass-assignment route). (`support/[id]/page.tsx`)
  - 🟠→✅ MED (DISCOVERED during batch-1, FIXED in batch-2): **Ticket detail page rendered raw i18n keys in every
    locale.** ~15 keys the detail page uses (`ticketNotFound`, `backToTickets`, `createdOn`, `closeTicket`, `messages`,
    `admin`, `noMessages`, `replyLabel`/`replyPlaceholder`/`sendReply`, `ticketClosedMessage`,
    `replySent`/`replyError`/`ticketClosed`/`closeError`) were **absent from ALL 6 locale files** → next-intl fell back
    to the raw key path. **Fix:** added the full key set ×6 locales (parity ✓). (`support/[id]/page.tsx`)
- [x] **Public pages (about/contact/testimonials) + Legal + site-wide SEO — REVIEWED 2026-07-17** (20 findings
  adversarially verified; a11y/design dimension re-reviewed 2026-07-18, see below). Awaiting approval to fix.
- [x] **Public pages a11y/RTL/design-feel — RE-REVIEWED 2026-07-18** (21/21 findings confirmed, 0 stubs).
  **Batch A (mechanical a11y + i18n) IMPLEMENTED 2026-07-18** — closes the 3 HIGH + 6 MED + 4 LOW mechanical items:
  labeled contact category/message controls + templates tier filter (htmlFor/id); template card badges + lock overlay
  now use t() (new `templates.categoryCv`/`categoryCoverLetter` keys ×6); localized the sign-in toast + load-error
  string (new `public_templates.signin_required`/`load_error` ×6); sr-only h2 fixes the h1→h3 skip
  (`results_heading` ×6); Preview button gets `focus-visible` states; ArrowRight/LogIn icons mirror in RTL
  (`rtl:rotate-180`/`rtl:-scale-x-100`, 4 sites); `about.title` de-branded ("About Us") fixing the double-brand tab
  title; 💡 → `<Lightbulb aria-hidden>`; `aria-pressed` on filter tabs; Footer h4→h3.
  **Batch C content portion IMPLEMENTED 2026-07-18** — rewrote the unverifiable/canned About copy (dropped "tested by
  real HR experts" from `value2_desc` and "career coaches" from `team_desc`; de-canned `value1_desc`) and
  differentiated the near-duplicate templates CTA subtitle — 6 locales, parity ✓, claims verified gone.
  **Batch B (contrast → WCAG AA) IMPLEMENTED 2026-07-18** — CTA subtext `text-brand-200`→`text-brand-50` on brand
  gradient (testimonials, templates); white CTA buttons `text-brand-600`→`text-brand-700` (testimonials, templates ×2,
  about); LanguageSwitcher header `text-stone-400 dark:text-stone-500`→`text-stone-500 dark:text-stone-400`. Type-check ✓;
  all target classes already emitted by Tailwind (used elsewhere).
  **Deferred:** Batch C **visual** redesign of the repeated heroes/CTA bands (subjective; folded into Epic E2 de-AI
  visual polish + logo/brand refresh, which wants client design direction); "Flacron Group" branding (needs client
  confirmation).
  - 🟠 HIGH ×3: contact form category `<select>`/message `<textarea>` unlabeled (WCAG 4.1.2, `contact-us:157`);
    templates tier-filter `<select>` no accessible name (`templates:278`); templates card **tier/category badges
    hardcoded English** (`tierLabelMap`/`categoryLabelMap`, `templates:52` — mixed-language UI in 5 of 6 locales).
  - 🟡 MED ×12: heading skip h1→h3 (`templates:371`); hover-only Preview button focusable-while-invisible
    (`templates:358`); contrast fails — `text-brand-200` on brand gradient (`testimonials:55`) + white on brand-600
    buttons (`about:137`); ArrowRight/LogIn icons don't mirror in RTL (`about:136` +CTAs); About tab title renders
    "About FlacronCV | FlacronCV" (locale value contains brand); 💡 emoji as UI icon (`contact-us:103`); hardcoded
    English toast "Please sign in…" (`templates:198`) + error "Could not load templates…" (`templates:306`);
    copy-pasted brand-gradient CTA band ×3 pages; identical centered gradient hero ×4 pages; About "canned AI
    phrasing" + unverifiable "tested by real HR experts / career coaches" claims.
  - 🟢 LOW ×6: Footer h4 heading skip; filter tabs color-only selected state (no `aria-pressed`); emoji exposed to
    screen readers; LanguageSwitcher header contrast ~2.5:1; colon concatenated outside translation; "Flacron Group"
    ↔ flacronenterprises.com branding inconsistency (needs client confirmation).
  - 🔴→✅ CRIT (FIXED): **/testimonials was fabricated** — 9 invented people with quotes attributed to REAL brands.
    **Fixed:** rewrote `testimonials/page.tsx` to an honest state (removed all 9 fake people + real-company
    attributions + fake stats/rating; honest "be one of the first" empty state); deleted the fabricated locale keys
    (stats + t1–t9) and softened copy across all 6 locales.
  - 🟠→✅ HIGH (FIXED): **contact form** was dead (fake setTimeout → "Message sent!", never submitted). **Fix:** new
    public `POST /contact` (`ContactModule`: validates name/email/subject/message + coerces category; sends via Brevo
    `MailService.sendContactMessage` — HTML-escaped, `replyTo` = visitor; per-route throttle 5/min). Form now really
    submits (`contact-us/page.tsx`). ⚙️ **Config: set `CONTACT_EMAIL` and confirm that mailbox is live** (defaults
    to support@flacroncv.com).
    ~~fabricated traction stats on testimonials & About~~ ✅ FIXED (testimonials stats removed; About Stats section
    removed, prose de-puffed — "best CV builder in the world"/"50+ countries"/"10,000+" gone, kept verifiable "6 languages");
    ~~Privacy Policy omits OpenAI subprocessor~~ ✅ FIXED (see legal note below). SEO: ~~no sitemap~~ ✅ /
    ~~hreflang missing~~ ✅ / ~~templates no metadata~~ ✅ — **SEO batch DONE** (see below).
  - ✅ **SEO infrastructure FIXED** — added `app/sitemap.ts` (48 URLs = 8 routes × 6 locales, each with hreflang
    alternates + x-default) and `app/robots.ts` (replaces static robots.txt; Sitemap now resolves); shared
    `lib/seo.ts` `pageMetadata()` gives every page canonical + hreflang + OG/Twitter; added metadata to templates &
    contact-us (server `layout.tsx`) and description/OG to the 5 title-only pages; root layout now has default
    OG/Twitter + Organization/WebSite JSON-LD; fixed the title double-suffix; completed `site.webmanifest`
    (start_url/scope/lang/description). Remaining SEO nice-to-have: SoftwareApplication + BreadcrumbList JSON-LD (LOW).
  - ⚠️→✅ FIXED (found during fix): the fabricated **"10,000+ professionals"** claim was also present elsewhere.
    Investigation showed only ONE was actually rendered — the **/templates CTA** (`public_templates.cta_subtitle`) — now
    replaced with honest copy. The rest were **dead/unused**: the homepage `Testimonials` section was already
    intentionally hidden (not imported), so its component + the orphaned `testimonials` namespace (6 invented people /
    Barclays,Google,Stripe,Meta,Careem,Publicis) were **deleted**; the unused `hero.trusted` + company `product1_desc`
    "10,000+" strings were neutralized. Repo-wide scan now finds zero fabricated-traction remnants in any locale.
  - 🟡 MED: ~~contact-us no metadata; 5 pages title-only; root OG/canonical; double-suffix~~ ✅ (SEO batch);
    About puffery ✅ FIXED; ~~**Brevo** undisclosed subprocessor~~ ✅ FIXED (privacy Data-Sharing now lists Firebase,
    Stripe, **Brevo, OpenAI** + OpenAI-US transfer note, 6 locales; privacy `last_updated`→2026-07-18). **Still open
    (needs client input):** no **data-controller legal identity/address/governing-law** clause (GDPR Art.13(1)(a)) —
    entity name/address + governing law required; and terms/cookies `last_updated` stay Jan-1 until their content is
    revised with those details; confirm the `@flacroncv.com` domain/mailboxes.
  - 🟢 LOW: only home FAQPage JSON-LD (no Organization/WebSite/SoftwareApplication); manifest missing start_url/scope/lang;
    contact form native-only validation; hardcoded "FlacronCV" brand string; identical "Last updated: Jan 1, 2026" on all
    3 legal docs; legal emails @flacroncv.com vs deployed onrender.com domain (verify mailboxes).

---

## 7. Micro-task backlog (new features, broken down)

Each becomes its own review→approve→implement→QA cycle. Ordered by suggested priority.

**Epic A — Payments/Entitlements correctness (highest business risk)**
- [x] A1: Fix yearly billing — **done via A(b):** yearly checkout hidden ("Coming soon"), monthly-only,
  backend monthly-price whitelist guard. (Real Stripe yearly prices can be added later to re-enable yearly.)
- [x] **A2: Billing/usage page DONE 2026-07-19** — plan/status/renewal/limits were already shown; added the
  **"N remaining"** line under each metered usage item (CVs, cover letters, AI credits, exports), skipped for unlimited.
  `billing.usage.remaining` × 6 locales (parity 1458). Cancellation controls tracked under A3 (Stripe portal).
- ◐ A3: Billing history + invoice access **DONE 2026-07-19** (native Stripe invoice list + PDF links on the billing page);
  in-app **cancellation controls** still go through the Stripe billing portal ("Manage subscription") rather than a native button.
- ✓ A4: Subscription lifecycle handling — refund/dispute/paused done (B); status-aware entitlements done (C);
  **trial done 2026-07-20** (trialing status honoured through checkout/verify/webhook); upgrade/downgrade covered by A5 tests.
- [x] **A5: Automated entitlement/payment tests DONE 2026-07-19** — added the missing **payment-lifecycle** coverage
  (9 tests in `payment.service.spec`: checkout activation + `verifySession` activation & ownership/unpaid rejection,
  `invoice.paid` renewal + monthly usage reset, `invoice.payment_failed`→past_due, subscription.updated upgrade &
  downgrade, subscription.deleted cancel→free). Combined with the pre-existing refund/dispute/idempotency,
  entitlement-resolver (grace/expired), and create-limit/export-gate specs, the whole PDF list is covered. **API suite: 193 green.**
- [x] **A6: Career Accelerator (4th plan) BUILT 2026-07-20** — full enum + `PLAN_CONFIGS` + `PLAN_RANK` + billing card/
  comparison + CRM (color/label/admin-grant) + i18n ×6, with documented assumptions (price/limits/positioning). Checkout
  gated "coming soon" until a real Stripe price id is configured (no overcharge risk). api 209 green; web type-check ✓.
- ◐ A7: **Frontend gating status-aware** (found during C) — ✅ the 5 template/layout **access gates** now use
  `resolveEffectivePlan(user.subscription)` so a delinquent-past-grace user no longer sees unlocked PRO templates/
  layouts they can't use (CV create-limit, CV template picker, public templates page, editor Design-panel layouts,
  cover-letter template picker). Pure DISPLAYS (billing "current plan", dashboard limit numbers, upgrade banner)
  deliberately still show the *actual* plan + status badge. Remaining → A7b.
- [x] A7b: **AI-credit client soft-checks status-aware** — ✅ all 4 sites (`AISummaryModal.tsx`, `cover-letters/[id]`,
  `cover-letters/new` ×2) now cap the stored `aiCreditsLimit` by `PLAN_CONFIGS[resolveEffectivePlan(sub)].limits.aiCredits`
  (mirrors the backend `min()` cap), so a delinquent-past-grace user sees the upgrade modal instead of an API 403 toast.
  **W2 2026-08-28:** cover-letter helpers no longer use `|| 5` (stored 0 was treated as 5). Modals already used `?? 5`.
- [x] A7c: **DONE 2026-07-18** — dunning banner. New `DunningBanner` (rendered in the dashboard layout, so it shows on
  every dashboard page) appears when `subscription.status ∈ DELINQUENT_STATUSES` (past_due/unpaid/incomplete) with an
  "Update payment method" CTA → Stripe billing portal. New `dunning` i18n ×6. Closes the "delinquent user gets no
  prompt" gap. (Note: A2 — plan/status/renewal/usage/limits display — was found **already implemented** on the billing
  page; the **billing-history/invoices [A3] AND the "usage remaining" text [A2] are now both DONE** (see the change log).)
- [x] A8: **Export entitlement gate** (found during C) — ✅ FIXED. All export was 100% client-side & ungated
  (verified 3/3 adversarial lenses): FREE users got DOCX (a paid feature) + unlimited exports, and
  `usage.exportsThisMonth` was **permanently 0 for everyone** (incremented only on 4 dead server endpoints the UI
  never calls → the 2/month quota was totally unenforced). **Fix (server-authorized):** new thin
  `POST /exports/record` (`recordClientExport`) reuses `resolveEffectivePlan` to enforce DOCX-is-paid + the monthly
  quota and atomically increments usage; the 4 client export handlers now call it first and show the UpgradeModal on
  a block. Usage tracking is now real. *(Does NOT change the raster-PDF architecture — see §8.)*
- [x] **A9: Dead `SubscriptionGuard`/`@RequiredTier` REMOVED 2026-07-19.** Wired to zero routes AND **status-blind**
  (read raw `subscription.plan`, not `resolveEffectivePlan`), so wiring it up would have re-granted paid access to
  delinquent-past-grace users — a regression of the A7/A8/C entitlement work. The correct, status-aware gating already
  lives at the service layer (`ai`/`cv`/`cover-letter`/`export`). Deleted both files; api type-check ✓, 193 tests green.
  *(If HTTP-layer defense-in-depth tier gating is ever wanted, it must be rewritten to use `resolveEffectivePlan` and
  applied to chosen routes — a future opt-in, not leftover broken scaffolding.)*

**Epic B — Career features**
- [x] B1: **DONE 2026-07-18** — wired ATS scoring UI (`ATSCheckModal` + editor toolbar button + `serializeCV` +
  `ats` i18n namespace ×6). Closes the marketed-but-hidden ATS feature.
- [x] B2: **DONE 2026-07-18** — wired `AISummaryModal` via a "Generate with AI" button next to the CV summary field
  in `CVEditor`. (Its 25 i18n keys already existed ×6; it was just never rendered.)
- [x] B3: Resume import + parsing → **paste-based DONE 2026-07-18; file upload (PDF/DOCX) DONE 2026-07-20**
  (`lib/extractResumeText.ts` client-side pdfjs/mammoth extraction → existing `POST /cvs/import`; +9 `resume_import` keys ×6).
  **→ Epic B fully complete.** (No OCR for scanned/image PDFs; see the change-log assumptions.)
- [x] B4: **DONE 2026-07-18** — Job tracker: `jobs` backend module (CRUD + DTOs + ownership + soft-delete, `/jobs`) +
  `/dashboard/jobs` page (`JobFormModal`, status filter, quick status change, delete) + sidebar link + `jobs` i18n ×6.
- [x] B5: **DONE 2026-07-18** — Interview prep: `ai.interviewPrep` + `POST /ai/interview-prep` + `InterviewPrepModal`
  (editor toolbar button) + `interview` i18n ×6. Behavioral/technical questions + questions-to-ask + tips from a JD.
- [x] B6: **DONE 2026-07-18** — LinkedIn optimizer: `ai.linkedinOptimize` + `POST /ai/linkedin` + `LinkedInModal`
  (editor toolbar button) + `linkedin` i18n ×6. Optimized headline/About/skills/tips (copyable) from the CV.
  **→ Epic B (career features) COMPLETE** except B3 file-upload (PDF/DOCX) which remains ◐.

**Epic C — Lead capture & marketing (large)**
- [x] **C1: Lead data model + secure storage + consent record — DONE 2026-07-19.** shared-types `lead.types.ts`
  (`Lead`, `LeadStatus` pending/subscribed/unsubscribed, `ConsentRecord` granted/text/version/date/source/ip,
  `CreateLeadData`) — kept SEPARATE from CRM sales-leads. New `leads` NestJS module: `LeadsService` (Firestore `leads`;
  consent-mandatory `capture` w/ email dedupe + double-opt-in + unsubscribe tokens, idempotent `confirm`/`unsubscribe`,
  `findByEmail`) + public throttled `LeadsController` (`POST /leads`, `GET /leads/confirm|unsubscribe`) + `CreateLeadDto`
  + app.module registration. +6 unit tests. **Follow-ups:** confirmation EMAIL = C4 (Brevo), opt-in UI/magnets = C2, CRM listing = C6.
- ◐ C2: **Opt-in form ✓ (DONE 2026-07-19** — `NewsletterSignup` in the footer, site-wide; un-pre-checked consent →
  public `POST /leads`; + a `/confirm` double-opt-in landing page). The specific **"Free ATS Resume Score" lead magnet**
  (gated public ATS endpoint + delivery) is still to build.
- [ ] C3: Exit-intent / scroll popups (respect UX + reduced-motion).
- ◐ C4: **Double opt-in confirmation email ✓ (DONE 2026-07-19** — `MailService.sendLeadConfirmation`, inline HTML,
  best-effort, wired into `LeadsService.capture`). The **welcome email + actual lead-magnet delivery** are still to build.
- ◐ C5: Preference center, unsubscribe, suppression list, **cookie consent ✓ (DONE 2026-07-19** — site-wide banner wiring
  the D1 analytics consent gate; the rest — preference center / unsubscribe / suppression list — still to build).
  **Updated 2026-08-18 (Batch C):** the *cookie* preference centre is now built — three categories
  (Strictly Necessary / Preferences / Analytics), each gating real technology, reopenable from the
  footer, `apps/web/src/lib/consent.ts`. The **email/marketing** preference centre, unsubscribe and
  suppression list referred to above are a different thing and are still to build.
- [ ] C6: CRM lead flow + tags/segments + automated campaigns + delivery/open/click tracking.

**Epic D — Analytics / event tracking**
- [x] **D1: Event-tracking layer — BUILT 2026-07-19 (provider-agnostic; awaiting client's provider choice to activate).**
  `lib/analytics.ts` (typed event catalog + pluggable `AnalyticsAdapter` + no-op/console adapters + consent gate,
  no-op by default) + `AnalyticsProvider` (identify/reset + page-view) + 7 funnel events wired. The actual provider
  (GA4/PostHog/etc.) plugs into one adapter + one env var — **no call sites change.** **GA4 adapter added + set as the
  default provider 2026-07-20** (client direction); goes live once `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set. See change log.
- [ ] D2: Admin analytics: visitor→lead, lead→paid, funnel, entitlement/usage disputes.

**Epic E — Design & brand & SEO**
- ◐ E1: Logo update + brand refresh — **DONE 2026-07-20** for logo (official theme-aware `<Logo/>` everywhere) + the
  brand system (tokens/shadows/dark surfaces/typography). Ongoing: matched logo exports (client), deeper brand application.
- ◐ E2: "De-AI" visual polish — **foundational pass DONE 2026-07-20** (unified core components, de-gradient-text hero,
  auth panel, elevation system). Remaining: per-page deep polish (dashboard KPIs/tables, forms, mobile audit).
- [ ] E3: Full SEO: per-page metadata, canonical, hreflang, sitemap.xml, robots, structured data.

**Epic Q — Enterprise-premium quality push** (from the 2026-07-18 quality audit — 24 verified findings: 10 a11y + 14 i18n).
Sequenced as small, QA'd batches; do NOT batch-jump — one at a time per the working method.
- [x] **Q-Batch 1 — dialog accessibility (DONE 2026-07-18).** New `useModalA11y` hook (focus trap + Escape + focus
  restore); applied to shared `ui/Modal.tsx` + all 5 AI modals (ATS/Interview/LinkedIn/AISummary/Import) with
  `role=dialog`/`aria-modal`/`aria-labelledby` + close `aria-label`.
- [x] **Q-Batch 2 — `TemplatePreviewModal` i18n (DONE 2026-07-18).** The customer-facing template-preview/paywall modal
  is now fully localized (17 `template_picker` keys reused + 8 new × 6 locales); tier display via `common.{pro|enterprise|free}`
  with the canonical `tierLabel` kept for logic. Translations generated + adversarially back-translation-verified (10-agent workflow).
- [x] **Q-Batch 3 — admin i18n: audit-logs + templates pages (DONE 2026-07-18).** Both pages fully localized — 34 new
  `admin` keys (17 audit + 17 templates) × 6 locales + reuse of existing `admin`/`common` keys; translations generated +
  adversarially verified (10-agent workflow). Data-derived badges (`log.action`, `tier`/`category`) + API error toasts
  left as raw values by design.
- [x] **Q-Batch 4 — CRM area i18n sweep (DONE 2026-07-19).** Entire CRM area (11 pages + layout + 6 components, ~4,700
  lines, previously ZERO i18n) fully localized under a new **`crm` namespace (341 keys × 6 locales)**. Discovery, translation,
  and page-wiring each done via multi-agent workflows (14 + 70 + 22 agents) with adversarial verification; enum displays
  (plan/role/CRM-status) localized via `t()`; raw data + Stripe billing statuses intentionally left canonical.
- [x] **Q-Batch 5 — small a11y (DONE 2026-07-19).** Icon-button `aria-label`s (admin templates edit/delete, settings
  avatar, CRM add-customer close); CRM settings toggle `role=switch`/`aria-checked`/`aria-label` + focus ring; keyboard
  access on click-only rows (admin users + CRM customers: `tabIndex`+`onKeyDown`+focus ring); CRM sortable headers
  (`aria-sort` + `tabIndex`+`onKeyDown`); FontPanel `aria-expanded`/`aria-haspopup`/`aria-label`; AISummaryModal
  "Click to edit" → keyboard-operable (`role=button`+`tabIndex`+`onKeyDown`) + i18n. 3 new label keys × 6 locales.
- [x] **Q-audit gap RESOLVED 2026-07-19:** re-ran the 2 dead dimensions (ux-states, visual-responsive) via an
  adversarial find→verify workflow. They were **NOT clean** — **25 findings confirmed** (1 HIGH, 14 MED, 10 LOW; 5 raw
  findings rejected). 5 builder-area findings were left UNVERIFIED (their verifier agents hit a session usage limit) and
  should be re-checked. All confirmed findings tracked below as **Epic R** — awaiting approval to fix.

**Epic R — post-audit UX-state & responsive fixes** (from the 2026-07-19 re-run; all adversarially CONFIRMED; awaiting approval).
- [x] **R1 (HIGH, visual-responsive) — FIXED 2026-07-19.** CRM now has a proper mobile sidebar drawer (mirrors the admin
  pattern): `CRMSidebar` takes `open`/`onClose`, is off-canvas `fixed`+`-translate-x-full` below `lg` and docked
  `lg:static` above, with an RTL-correct closed transform, a mobile close (X) button, Escape-to-close, and close-on-navigate;
  `(crm)/layout.tsx` adds `sidebarOpen` state + a `lg:hidden` mobile top bar with a hamburger (`common.open_menu`). Reused
  existing `common` menu keys (no new i18n). QA: type-check ✓, build ✓ Compiled + static 5/5, CRM routes 200 (en + ar RTL).
- [x] **R2 (MED, ux-states) — FIXED** — Google sign-in button: no loading/disabled state while auth pending. `(auth)/login/page.tsx:91`
- [x] **R3 (MED, ux-states) — FIXED** — Google sign-up button: no loading/disabled state while auth pending. `(auth)/register/page.tsx:90`
- [x] **R4 (MED, ux-states) — FIXED 2026-07-19** — Inline job-status `<select>` reverted to the stale value during save (no optimistic update / not disabled). Now an optimistic React Query `useMutation` (onMutate writes the new status into the `['jobs']` cache → the select updates instantly; onError rolls back to the snapshot + toasts; onSettled re-invalidates), and the row's select is `disabled` while its own write is in flight (prevents double-fire). `(dashboard)/jobs/page.tsx` — **closes Epic R.**
- [x] **R5 (MED, ux-states) — FIXED** — CV list query has no error state — a fetch failure looks like an empty account. `(dashboard)/cv/page.tsx:33`
- [x] **R6 (MED, ux-states) — FIXED** — Cover-letter "Create blank" vs "Generate with AI" don't disable each other → duplicate creates. `(dashboard)/cover-letters/new/page.tsx:268`
- [x] **R7 (MED, ux-states) — FIXED** — Template-picker query has no error state — failure dead-ends CV creation. `(dashboard)/cv/new/pick-template/page.tsx:94`
- [x] **R8 (MED, ux-states) — FIXED** — CRM user-mgmt mutations (suspend/reactivate/plan/role) have NO error handling — silent failures. `(crm)/crm/users/page.tsx:97`
- [x] **R9 (MED, ux-states) — FIXED** — CRM super-admin settings save: no error state; failed save is silent + unhandled rejection. `(crm)/crm/settings/page.tsx:123`
- [x] **R10 (MED, ux-states) — FIXED** — Admin template delete: no confirmation, no pending/disabled (accidental + double-delete). `(admin)/admin/templates/page.tsx:171`
- [x] **R11 (MED, visual-responsive) — FIXED** — `TemplatePreviewModal` never stacks on mobile; 288px info panel crushes the preview. `cv-builder/TemplatePreviewModal.tsx:204`
- [x] **R12 (MED, visual-responsive) — FIXED** — verify-email prints the email with no wrap/break → horizontal page scroll. `(auth)/verify-email/page.tsx:88`
- [x] **R13 (MED, visual-responsive) — FIXED** — Settings account email no truncate/word-break → overflow on mobile. `(dashboard)/settings/page.tsx:279`
- [x] **R14 (MED, visual-responsive) — FIXED** — CRM Add-Transaction modal: no max-height / internal scroll → clipped on short viewports. `(crm)/crm/revenue/page.tsx:305`
- [x] **R15 (MED, visual-responsive) — FIXED** — CRM Add-Customer modal: no max-height / internal scroll → clipped on short viewports. `(crm)/crm/customers/page.tsx:332`
- [x] **R16 (LOW, ux-states) — FIXED** — verify-email sign-out button: no pending state / error handling. `(auth)/verify-email/page.tsx:118`
- [x] **R17 (LOW, ux-states) — FIXED** — Settings "Send reset link": no loading/disabled → double-submit sends multiple reset emails. `(dashboard)/settings/page.tsx:618`
- [x] **R18 (LOW, ux-states) — FIXED** — Post-checkout verification: no loading indicator; user briefly sees free-plan cards after paying. `(dashboard)/settings/billing/page.tsx:47`
- [x] **R19 (LOW, ux-states) — FIXED** — CV "Duplicate" over-disables every card during one duplicate. `(dashboard)/cv/page.tsx:118`
- [x] **R20 (LOW, ux-states) — FIXED** — Customer purchase-history: no loading/error state → misleading "No transactions". `(crm)/crm/customers/[id]/page.tsx:57`
- [x] **R21 (LOW, ux-states) — FIXED** — Subscription search filters only the current 25-row page → false "No subscriptions". `(crm)/crm/subscriptions/page.tsx:88`
- [x] **R22 (LOW, ux-states) — FIXED** — CRM dashboard KPI queries: no error state → all-zero KPIs/empty charts look real on failure. `(crm)/crm/page.tsx:32`
- [x] **R23 (LOW, visual-responsive) — FIXED** — Landing Hero status dot uses physical `mr-2` → mis-spaces in RTL. `landing/Hero.tsx:387`
- [x] **R24 (LOW, visual-responsive) — FIXED** — Job notes `whitespace-pre-wrap` without `break-words` → pasted URL overflows. `(dashboard)/jobs/page.tsx:181`
- [x] **R25 (LOW, visual-responsive) — FIXED** — TopBar user-name span: no truncate/max-width in fixed-height header. `dashboard/TopBar.tsx:104`
- [x] **R-verify-gap RESOLVED 2026-07-19:** re-verified the 5 builder-area findings myself against the code. **All 5 real.**
  1 was a duplicate of R11 (TemplatePreviewModal stacking — already fixed). The other 4 were confirmed + **FIXED** (same
  classes as approved R11/R14/R15/R23): **R26** ActivityTimeline connector `left-[17px]`→`start-[17px]` (RTL); **R27**
  EditorToolbar action row `flex`→`flex flex-wrap justify-end` (mobile overflow, was HIGH); **R28** AISummaryModal panel →
  `flex max-h-[90vh] flex-col overflow-hidden` + body `flex-1 overflow-y-auto` (short-viewport clipping); **R29** CVEditor
  photo-remove badge `-right-1`→`-end-1` (RTL). Pure Tailwind, no i18n. QA: type-check ✓; CV-editor + templates routes 200.

**Epic R (cont.) — R4-class siblings** (found 2026-07-19 by an adversarial sweep for the SAME bug class as R4, after R4 was fixed;
all adversarially CONFIRMED, then fixed same-batch with the identical optimistic-`useMutation` + pending-disable pattern). The
sweep scanned dashboard/CRM/admin/shared (10 candidate controls), correctly cleared the just-fixed jobs select, and rejected the
imperative Suspend/Ban action buttons (they don't display a bound value). 6 real defects:
- [x] **R30 (MED) — FIXED** — CRM users list, row action-menu **Change-plan** buttons: no optimistic update + **no pending-disable
  → the ✓/highlight stayed on the stale plan and an impatient admin could fire a racing second PUT.** Now `onMutate` closes the
  menu + optimistically writes the new plan into the `['crm','users']` list cache (row badge updates instantly), rolls back on
  error, and the buttons are `disabled` while pending. `(crm)/crm/users/page.tsx`
- [x] **R31 (MED) — FIXED** — same page, **Change-role** buttons: identical fix (optimistic role in list cache + menu-close +
  pending-disable + rollback). `(crm)/crm/users/page.tsx`
- [x] **R32 (MED) — FIXED** — Admin users list, role `<select value={user.role}>`: snapped back to the stale role mid-request and
  had no pending-disable (double-fire). Now optimistic `setQueriesData` across cached pages + rollback + **per-row** pending-disable
  (`variables.userId === user.id`). `(admin)/admin/users/page.tsx`
- [x] **R33 (MED) — FIXED** — Admin ticket detail, status `<select>`: visible snap-back flicker (it already had a pending-disable but
  no optimistic update). Now optimistic `setQueryData` on `['admin','ticket',id]` + rollback. `(admin)/admin/tickets/[id]/page.tsx`
- [x] **R34 (LOW) — FIXED** — CRM user-detail plan selector: pre-refetch staleness (already pending-disabled). Optimistic
  `subscription.plan` update + rollback. `(crm)/crm/users/[id]/page.tsx`
- [x] **R35 (LOW) — FIXED** — CRM user-detail role selector: same pattern (optimistic `role` + rollback). `(crm)/crm/users/[id]/page.tsx`
- QA: web type-check ✓ (exit 0) across all 5 changed files — the optimistic `getQueriesData`/`setQueriesData` typing compiles. **→ Epic R + its sibling class now fully closed.**

---

## 8. Out-of-scope / architectural recommendations (do NOT implement without approval)

- **⚠️ UPDATED 2026-08-27 — Mobile section item E4 covers all seven item
  types.** Experience, education, projects, skills, certifications, languages,
  and references rebuild an item by spreading the loaded object then overlaying
  form fields, so keys the mobile form does not collect survive an edit
  (`order` on all four; certification `expiryDate`/`url`; reference
  `relationship`; web’s generic `description` on certs/languages/references).
  Cleared form fields still win. Do not rebuild these items from form data
  alone.

- **⚠️ ADDED 2026-08-26 — Mobile date fields: three-way type lie (do not “fix”
  the types in a drive-by).** Same defect class as the fabricated
  `PaginatedResponse`. `packages/shared-types` declares `CV.createdAt` /
  `updatedAt` (and the same pattern on cover letters, support tickets, user
  `createdAt`/`updatedAt`, `usage.lastExportReset`,
  `subscription.currentPeriodEnd`) as `Date`. `apps/mobile/src/types/cv.types.ts:143-144`
  (and the parallel mobile types) declare them `string`. The wire is a
  Firestore Timestamp JSON object (`{_seconds,_nanoseconds}` or `{seconds,nanoseconds}`).
  All three disagree; TypeScript still type-checks. **D1 (2026-08-26):**
  mobile `toDate` / `formatDate` parse those shapes defensively (same contract
  as web `apps/web/src/lib/format-date.ts`). That is a parser, not a correct
  type. Aligning shared-types + mobile types + an API serializer is a separate
  approved change; do not treat the helper as closing the lie.
- **⚠️ ADDED 2026-08-26 — Sold, not code-gated (client decision).** Do not
  strip these without the operator. They appear on paid `features[]` / the
  billing comparison and nothing in the API treats them differently.
  - **Priority support** — every paid plan’s `features[]`, and the comparison
    table ticks `plan !== FREE`. There is no support-queue, SLA, or ticket
    priority field. May be a human process rather than a product entitlement.
  - **Career Accelerator “All AI career tools (ATS, Interview Prep, LinkedIn)”**
    — those routes are credit-gated for every plan (`ai.controller.ts`), not
    CA-exclusive. The line sells uniqueness the server does not enforce.
- **⚠️ ADDED 2026-08-25 — Known restatements of plan/catalogue facts.** Do not
  edit these in a drive-by; a limit change must update the source first, then
  every restatement. Template oversell on Pro/CA (`limits.templates` as `'all'`)
  was closed 2026-08-26; `limits.templates` is now the max reachable plan.
  - `faq.a1` × 6 — Free and Pro allowance numbers + cadence. Source of truth:
    `PLAN_CONFIGS.limits` and paid-vs-Free reset in `usage-reset.service.ts`.
    Homepage JSON-LD `faqPage()` interpolates `limits`; the visible FAQ does not.
  - `faq.a2` × 6 — “2 exports”, Pro/Enterprise unlimited, DOCX. Source:
    `PLAN_CONFIGS.limits.exports`; DOCX is not in `limits` (gated in
    `export.service.ts` as paid-only). JSON-LD interpolates export counts only.
  - `terms.ts` §6 Free-plan bullets (`5 CVs`, `1 Cover Letter`, `5 AI Credits`,
    `2 Exports`). Source: `PLAN_CONFIGS[FREE].limits`. Legal body, not `t()`.
  - `features.multilingual_desc` × 6 and `about.story_desc` × 6 — “6 languages”.
    Source: the locale set (`LOCALES` / `apps/web/public/locales/`).
  - `faq.a6` × 6 (and JSON-LD language answer) — names the six locales; also
    claims Portuguese, Italian, and Chinese “coming soon” (not in code).
- **⚠️ ADDED 2026-08-25 — Aspirational / outcome copy still live, awaiting
  client decision.** Do not rewrite these without approval. Same class as
  §19 (interviews, offers, employment) but softer phrasing. Fixed 2026-08-25:
  `hero.mockup_interview_calls` (fabricated interview count) and mobile
  onboarding “10,000+” / “gets you hired”. **Still open (en key; ×6 unless
  noted):**
  - `hero.title` / `hero.title_highlight` — “Your Dream Job Starts Here”
    (`en/common.json:19`, `:26`)
  - `hero.trusted` — “Build a job-ready CV in minutes” (`:23`)
  - `how_it_works.subtitle` — “From blank page to job-ready in minutes” (`:57`)
  - `features.title` — “Everything You Need to Land Your Dream Job” (`:67`)
  - `templates.cta_title` — “Ready to build your perfect CV?” (`:1334`)
  - `about.hero_desc` — “stand out and land their dream job” (`:1350`)
  - `about.mission_desc` — “CVs that get noticed” (`:1352`)
  - `testimonials_page.subtitle` — “As our users land interviews and offers”
    (`:1463`)
  - Homepage title / OG / Twitter — “Build Your Perfect CV with AI”
    (`apps/web/src/app/[locale]/page.tsx:20`, `:34`, `:51`) — English-only meta
  - Mobile empty-CV state — “land your dream job”
    (`apps/mobile/app/(dashboard)/cvs/index.tsx:155`)
- **⚠️ ADDED 2026-08-25 — `terms.ts:46` still lists “ATS optimization” as a
  product feature.** Marketing copy no longer claims a CV is ATS-optimized or
  ATS-ready (homepage meta, layout fallback, welcome email, hero mockup,
  Features card). The English terms body is now the only remaining on-site
  occurrence of that claim. Amending it is a legal-document change — client
  decision, not a copy pass.
- **Export architecture** — CV/cover-letter PDF export is still **client-side** (html2canvas→jsPDF
  **image** plus an **invisible text layer** for ATS parsers — shipped 2026-07-30,
  `addInvisibleTextLayer` in `export-cv.ts`). Entitlement bypass part FIXED in A8 via the
  server-authorized `/exports/record` gate. A working backend Puppeteer text-PDF path exists but is
  unused; switching the UI to it is a larger change — revisit with client approval.
- **Save-state / Undo-Redo (CV)** — edits-during-autosave and undo/redo have latent data-loss bugs;
  minimal fixes exist but touch the save-state model.
- **Backend DTO validation — CLOSED 2026-08-19 (Batch J).** Class DTOs now sit on CV,
  cover-letter, user, remaining `/ai/*`, contact, admin ticket, and template write bodies, so
  the global ValidationPipe (`whitelist` + `forbidNonWhitelisted`) is no longer a no-op there.
  Service-layer allow-lists were kept as defence in depth. **Not this batch:** payment bodies,
  auth set-claims/revoke, CRM interface-DTOs, `exports/record`.
- **CVSectionItem write-time validation — DECISION, not an oversight (Batch J).** Known fields
  get type and length checks; extra keys are allowed. A nested item class with
  `forbidNonWhitelisted` would 400 existing autosaves that still carry legacy keys. Full union
  enforcement is deferred to a migration that first strips or maps those keys.
- **⚠️ ADDED 2026-08-19 — Mobile is NOT currently shippable (correct the “shipping app” wording).**
  `apps/mobile/app.json` still has placeholder `"projectId": "your-eas-project-id"`.
  `eas.json` exists (B1, 2026-08-27) with development / preview / production
  profiles. Treat broken mobile API calls as **latent** (will bite the first real store
  build), not live App Store / Play damage today. Equally: **do not ship mobile** without clearing
  the **Mobile pre-launch gate** below. ⚠️ UNVERIFIED that no external pipeline builds past that
  placeholder.
- **⚠️ ADDED 2026-08-19 — Mobile sends `X-Device-Token` (abuse scoring).**
  `apps/mobile/src/lib/api.ts` attaches `X-Device-Token` from SecureStore
  (`getOrCreateDeviceToken`, 32 hex). `POST /auth/verify` feeds it into Batch G scoring the same
  way as web. CORS does not apply to native; mobile signups **are** scored when verify runs
  against a real API. Do not assume mobile bypasses the abuse engine.
- **⚠️ UPDATED 2026-08-19 — Mobile API alignment (endpoint batch).** Fixed / disabled:
  1. `PUT /users/me` (was `PATCH /users/me`) — `useUser.ts`
  2. `POST /cover-letters/:id/ai/generate` (was `…/generate`) — `useCoverLetters.ts`
  3. Photo UI **disabled**; TODO(mobile-photo): Storage upload then `PUT /users/me { photoURL }`
     (mirrors web). Do not invent `POST /users/:uid/photo`.
  4. Export → `POST /cvs/:id/export/pdf|docx` and `POST /cover-letters/:id/export/pdf`; map
     `downloadUrl` → `url`; filename from signed-URL path segment, else `cv-{id}.{format}` /
     `cover-letter-{id}.pdf`.
  5. Support ticket messages from `GET /support/tickets/:id` `{ ticket, messages }` (removed
     dead `GET …/messages`).
  Dead traps removed: `auth-store.updateUser` (`PATCH /users/:uid`), `useSubscriptionStatus`
  (`GET /users/:uid/subscription`).
- **⚠️ ADDED 2026-08-19 — Mobile pre-launch gate (must clear before any store build).**
  1. Profile `PUT /users/me` path ✓ (this batch). **Q6 2026-08-26:** form no
     longer hydrates `defaultValues` once while `/users/me` is empty; loading
     / error gates; dirty-only PUT so empty strings cannot wipe stored fields.
  2. Cover-letter AI generate path ✓ (this batch)
  3. Profile photo: Storage + `PUT /users/me { photoURL }` still **open** (UI disabled)
  4. Export paths + response shape ✓ (this batch)
  5. Support ticket messages from ticket GET ✓ (this batch). **Q4 2026-08-26:**
     list/detail ErrorState on fetch fail; send keeps composer text until
     success; no-connection vs rejected Alerts; bubble width cap; `edges={['top']}`.
     **Q10 2026-08-27:** dashboard/settings/templates/billing distinguish fetch
     failure from empty; `syncUser` sets `userSyncError` (no rethrow / no legalGate).
  6. **Legal acceptance at register** — **done (L1, 2026-08-26; Q5 2026-08-26).**
     English-only modal before Firebase; `POST /legal/acceptances`; Settings
     Terms/Privacy/Disclaimer open the public `/en/` pages. Email register now
     writes `PENDING_LEGAL_CONSENT` immediately after Auth create (same crash
     coverage as Google-on-login). Leftover flag on an already-accepted uid is
     ungated via `GET /legal/acceptances/me` (not a cold-start GET for everyone;
     `treatMissingAsStale` stays false). Google-on-login gates **new** users
     only. `clearAll()` still does not delete the consent flag (Cancel re-prompt).
- **⚠️ ADDED 2026-08-19 — Four mobile API calls that do not exist — SUPERSEDED by alignment batch above.**
  Kept for history: the old mapping listed PATCH `/users/me`, `…/generate`, photo POST, and
  `/exports/…` URLs. Items 1–2 and 4–5 of the pre-launch gate are fixed; photo remains TODO;
  legal remains held.
- **Secrets rotation** — Firebase Admin private key, Stripe, Brevo, OpenAI keys were shared in chat/docs; rotate them.
  **2026-08-18:** AWS IAM user `flacronai-ses` access key was in a public `apps/api/.zip` on GitHub.
  Deleting the file does **not** revoke the key — deactivate it in IAM and rotate every other
  credential that was in that archive.
- **⚠️ ADDED 2026-08-18 — open privacy defect: raw IP on REGISTERED (and login) audit rows.**
  `apps/api/src/modules/auth/auth.controller.ts:32-36` (`requestContext`) reads
  `x-forwarded-for` / `req.ip` and `auth.service.ts` spreads that object into
  `AuditAction.REGISTERED` / login audit writes (`audit_logs.ipAddress` next to
  `actorId`). Batch G hashes IPs before any *user-doc* write and never logs a
  raw IP in the new scorer. **Do not silently “fix” the audit path in the same
  batch as signup scoring** — it is pre-existing; hashing historical audit IPs
  is J.5-adjacent.
- **⚠️ ADDED 2026-08-18 — H.6 erasure: deferred obligations (keep them together).**
  When the erasure cascade is built it must delete or anonymise **all** of:
  1. **Batch G abuse:** `users/{uid}.abuse` **and** the lookup docs
     `abuse_devices/{deviceHash}` / `abuse_networks/{ipHash}` **and**
     `abuse_idempotency/{uid:key}` / `abuse_rate/{uid:kind}`
     (remove this uid from the device uid list; do not leave a dangling hash→uid
     map).
  2. **Batch H legal:** `legalAcceptances/{uid}` (doc-id delete; there is no
     query). Email is stored on that document — delete the doc, do not log the
     email on the way out.
  3. **Export reservations (2026-08-19):** `export_reservations/{reservationId}`
     where `uid` matches — query-by-uid or TTL cleanup; docs hold no email.
  Until H.6 exists, a **manual** erasure request has to cover **all** by hand.
  Soft-delete today does not. Do not split this list across change-log entries.
- **⚠️ ADDED 2026-08-19 — Goodwill: Free export burned by a failed render (manual CRM).**
  No automated backfill — failed renders before the reserve/refund fix are not
  distinguishable from real exports in stored data (`DOCUMENT_EXPORTED` used to
  fire on reserve). If support confirms a Free user lost an export to a failed
  render: CRM → user detail → **Reset usage** (`POST` via
  `CrmUsersService.resetUsage` / the existing Reset usage control) zeros
  `usage.exportsThisMonth` (and AI counters). Prefer that full reset only when
  the account is clearly Free and the complaint is credible; do not invent a
  partial decrement UI. Record the ticket id in the CRM note. Paid / unlimited
  export plans need no goodwill on this defect.
- **⚠️ ADDED 2026-08-18 — `crm-settings.planLimits`: a phantom entitlements control. DECISION NEEDED
  (delete or wire).** `DEFAULT_SETTINGS.planLimits` (`apps/api/src/modules/crm/crm-settings.service.ts:8-10`)
  defines a **second** set of plan limits — `free: {cvs 3, letters 2, credits 5, exports 2}`,
  `pro: {50, 50, 100, 50}`, `enterprise: {-1 …}` — which **disagree with `PLAN_CONFIGS`**
  (FREE is 5 CVs / 1 letter; PRO is 10 CVs / 20 letters / unlimited exports) and use a `-1`
  sentinel that `PLAN_CONFIGS` does not. It is fully plumbed — typed in
  `packages/shared-types/src/crm.types.ts:339`, written by the settings service, audit-logged, and
  editable by a super-admin at `apps/web/src/app/[locale]/(crm)/crm/settings/page.tsx:170-259` —
  **and read by no enforcement path anywhere.** Every real gate goes through
  `PLAN_CONFIGS[resolveEffectivePlan(...)]`. So an operator can set Pro to 50 CVs, see "Saved", and
  change nothing. **Do not wire it up without an explicit decision:** doing so creates a
  runtime-editable second source of truth for entitlements, which is a data-shape *and* billing
  change (standing rule 8) and would put four numbers that currently disagree with the enforced
  limits directly in charge of them. Deleting it removes a control that lies. Either way it needs
  the client's call, not an agent's.
- **⚠️ ADDED 2026-08-18 — `apps/mobile` maintains a duplicate `PLAN_CONFIGS`.** It does not import
  `@flacroncv/shared-types` at all; it keeps parallel copies (`apps/mobile/src/types/subscription.types.ts`,
  `enums.ts`, `user.types.ts`). So shared-types changes never *break* it — it silently **diverges**,
  and with no `type-check` or `test` script in its `package.json` nothing in CI would say so. It
  already carries the pre-correction yearly prices ($239.88 / $799.88), the four **dead**
  `AWDS7HwRCx` Stripe price ids from the old account, only three plans (no Career Accelerator), and
  a FREE feature bullet claiming a PDF watermark the product does not have. Making it consume
  shared-types is the right fix but is larger than a micro-change — see the full audit in
  `ARCHITECTURE_MAP.md`.
- **⚠️ UPDATED 2026-08-26 — Mobile legal acceptance (L1).** Web Batch H gates
  register with `LegalAcceptanceModal` + `POST /legal/acceptances`. Mobile now
  matches that write (`apps/mobile/src/lib/legal-acceptance.ts`) with an
  English-only modal (no next-intl). Settings Terms/Privacy/Disclaimer open
  `EXPO_PUBLIC_APP_URL` + `/en/…` in `WebBrowser`. `treatMissingAsStale` stays
  false — no retroactive prompts for accounts created before this change.
- **⚠️ ADDED 2026-08-26 — Mobile records privacyVersion 2026-08-16 while Privacy
  section 4 is still awaiting the client.** Same deliberate gap as web
  (`LEGAL_VERSION_MAP.privacy` vs locale-JSON body / B.1). Revisit this stamp
  when section 4 lands so the recorded version matches the published body.
  Source copy: `apps/mobile/src/lib/legal-docs.ts` from
  `apps/web/src/legal/types.ts`. Do not bump one without the other.
- **⚠️ UPDATED 2026-08-21 — AI audit is success-only by design.** `withAudit` on
  `AIController` and the two previously-gapped paths (`generateWithAI`,
  `importFromResume`) write `AI_GENERATION` only after the provider returns.
  Failures are ERROR logs, not audit rows. **Known asymmetry:** if
  `refundAiCredit` fails, `usage.aiCreditsUsed` still increments and no audit
  row is written — `audit_logs` will under-count vs usage. Reconcile by
  grepping `Failed to refund AI credit for`. GA4 `ai_generation` for cover-letter
  generate and resume import is wired (MC4); still gated on Analytics consent.
- **⚠️ ADDED 2026-08-21 — `RENDER_DEPLOYMENT.md` is a dead path; line 165 is the wrong webhook URL.**
  The file describes a Render.com Blueprint deploy from a `render.yaml` that does not exist.
  Production is AWS (Amplify + ECS), recorded in §2A and `DEPLOYMENT_AND_OPS.md`.
  `RENDER_DEPLOYMENT.md:165` still names `https://flacroncv-api.onrender.com/api/v1/payments/webhook`
  — wrong path on a host that is not ours. The live Stripe endpoint is
  `/api/v1/webhooks/stripe`. A **STALE** banner was added at the top of that file in MC8 so
  nobody follows it; the body was not rewritten as if Render were still a deploy option.
  Same family as `PRICING_UPDATE.md` below: leftover docs that mislead.
- **⚠️ ADDED 2026-08-18 — `PRICING_UPDATE.md` should be deleted.** It contains a Stripe **webhook
  signing secret in full** and a secret-key prefix in plaintext at the repo root (rotate as part of
  the secrets work above), documents the superseded price ids, and presents the exact
  monthly-interval-against-yearly-price design that caused the ~18× overcharge as
  "Stripe checkout works perfectly" with a green testing checklist. It is a live trap for the next
  reader. Values are deliberately not reproduced here.
- **⚠️ ADDED 2026-08-19 — Standing brand-asset request (second time this has blocked good work).**
  Both logo PNGs (`apps/web/public/logo-ink-dark.png` / `logo-ink-light.png`) have an **opaque
  baked-in rectangle**. The on-dark lockup is a black box; on light-mode chrome `#1e3a5f` that box
  is visible even with `Logo variant="on-dark"`. **Not fixable in code.** Ask the brand owner for
  **transparent SVG exports at matched proportions**, and ideally a horizontal header lockup for
  the 64px bar (the stacked mark's taglines vanish at navbar height). Until those files exist,
  Navbar and Footer stay on-dark on navy and the rectangle remains. This is a standing request to
  the client, not a one-off changelog note.
  **⚠️ UPDATED 2026-08-25 — Favicon is the third surface blocked by the same missing asset.**
  Tab icons were regenerated from `logo-schema.png` (512×512 FC on white) so 16/32px show a
  legible mark instead of a black field with an orange fragment. That still ships an **opaque
  white square** on dark browser chrome. The brand owner still needs to supply a **square FC
  mark with a transparent background, designed to hold together at 16px**. Until then three
  surfaces share one gap: **navy header, footer, favicon**.
- **⚠️ ADDED 2026-08-19 — Mobile localisation gap (one list).** `apps/mobile` is not on the
  six-locale pipeline (no next-intl). English-only by existing limitation, not by choice:
  1. CV list delete `Alert.alert` — `apps/mobile/app/(dashboard)/cvs/index.tsx`
  2. Cover-letter list delete `Alert.alert` — `apps/mobile/app/(dashboard)/cover-letters/index.tsx`
  3. In-app warnings (legal §§18–21): AI / ATS / cover-letter / export notice — **web only**
     (2026-08-19 navy-chrome batch). Do not invent next-intl on mobile to close this.
- **⚠️ ADDED 2026-08-19 — Batch M inherits: manual visual QA (do not guess from code).** From
  Batch K gap report. Code review cannot certify these; operator eyeballs in a real browser:
  1. Overflow / clip at **320 / 375 / 768 / 1024** on §35 surfaces (nav, sidebar, pricing cards,
     hero, forms, buttons, billing usage cards, FAQ, footer, modals).
  2. Plan comparison **mobile stacked cards** vs desktop table (`settings/billing`) — usable,
     no sideways scroll needed.
  3. Dark-mode contrast on pricing, CV/cover-letter editor chrome, tables, dropdowns, legal pages.
  4. RTL visual QA (ar / ur) beyond `dir=` on html.
  5. Stripe Checkout on a phone-sized viewport.
  6. Cover-letter autosave failure → persistent toast + automatic retry (not silent loss).
- **⚠️ ADDED 2026-08-19 — Client §38 vs Preferences consent (trade-off, not a bug).** Rejecting
  Preferences **deletes** `flacroncv_locale` (and theme / sidebar keys). Browser language
  persistence across sessions is **only** for users who accept Preferences. That is correct
  consent behaviour. §38 is **satisfied only for preference-cookie acceptors**. Signed-in
  Settings → language still persists as **account data** via `PATCH /users/me/preferences`
  (not a preference cookie). Cookie-centre copy states the trade-off
  (`cookie_consent.preferences_desc`). Tell the client; do not bypass consent to “fix” §38.
- **✅ UPDATED 2026-08-21 — Client §39 navy chrome in dark mode (closed).** Public
  `Navbar` / `Footer` / shared `TopBar` use Tailwind `chrome` (`#1e3a5f`) in **light and
  dark**. Dark fills: Navbar `bg-chrome/70` + blur (translucency kept); Footer, TopBar, and
  mobile nav panel solid `bg-chrome`. Page-facing edges `border-white/15`; navy-on-navy mobile
  panel top `border-white/10`. Client chose Option A (brand navy), not elevated charcoal.
  Logo stays `variant="on-dark"`. Manifest `theme_color` unchanged (`#ea580c`).

---

## 9. Change log (append newest at top)

- 2026-08-28 — **W2: cover-letter AI gates treat stored limit 0 as 0.**
  `ensureAICredits` / `handleAIImprove` used `aiCreditsLimit || 5`, so a stored
  ceiling of 0 became 5 and the client could start a generate the server then
  refused. Now `typeof stored === 'number' ? min(stored, planLimit) : planLimit`.
  Modals already use `?? 5` (0 stays 0). Dashboard/billing display untouched.

- 2026-08-28 — **Mobile B3: unused native modules and camera/mic permissions
  removed.** Dropped `@stripe/stripe-react-native`, `expo-image-picker`,
  `expo-media-library`, `expo-print`, `date-fns`, `@dataconnect/generated`.
  Removed image-picker plugin plus iOS camera/photo usage strings and Android
  CAMERA / RECORD_AUDIO. Storage permissions, file-system, sharing, and
  webview kept. Generated Data Connect folder left on disk. `api.ts` release
  guard and `eas.json` untouched.

- 2026-08-27 — **W1: live Privacy §3 hosting attribution.** `privacy.s3_desc` in
  all six locales no longer lists hosting under Firebase. Amazon Web Services
  now covers website and API hosting plus Amazon SES. Stripe, SES, OpenAI, and
  the closing sentence are unchanged. Google Analytics not named (`NEXT_PUBLIC_GA4_MEASUREMENT_ID`
  unset). `LEGAL_VERSION` / `LEGAL_VERSION_MAP` untouched. Cookie Policy and
  client 17-section Privacy not published. AR and UR lines pending native review.

- 2026-08-27 — **Mobile B2: preview/production EAS builds pin the public API
  URL.** `eas.json` sets `EXPO_PUBLIC_API_URL` on preview and production only
  (`https://api.flacroncv.com/api/v1`, matching Amplify). Development has no
  override so Expo Go / a dev client still use `apps/mobile/.env` (LAN).
  Release `api.ts` throws at startup if the resolved URL is localhost,
  127.0.0.1, or RFC1918 — no silent fallback. `.env` / `.env.example`
  untouched. Web/API untouched.

- 2026-08-27 — **Mobile B1: splash asset wired; eas.json added.** Legacy
  `splash.image` now `./assets/splash.png` (was the empty 200×200
  `splash-icon.png`). `android.versionCode` 1 and `ios.buildNumber` `"1"`.
  New `apps/mobile/eas.json`: development (dev client, internal), preview
  (internal APK), production (AAB); `appVersionSource: local`. Package
  names and EAS `projectId` unchanged — Play ID is a client decision;
  projectId comes from `eas init`. Stripe / image-picker / permissions
  untouched. Web/API untouched.

- 2026-08-27 — **Mobile TC1: three tsc errors fixed; `pnpm type-check`
  now includes apps/mobile.** Settings menu items share an optional `badge`
  (union was rejecting `item.badge`). Personal Info autosave indexes
  `PersonalInfo` by form keys instead of casting to `Record<string, string>`.
  Skeleton `width` is `number | \`${number}%\`` (RN style, not `string`).
  Full `tsc --noEmit` was 4 diagnostics in those 3 files — nothing else,
  including the §8 date-type lie (mobile still declares `createdAt` as
  `string`). Added `"type-check": "tsc --noEmit"` to `apps/mobile/package.json`
  so turbo/CI run it. Behaviour unchanged. Web/API untouched.

- 2026-08-27 — **Mobile Q12: dead AI hooks gone; ATS/JD payloads match DTOs;
  stale npm lock removed.** Deleted `useImproveSection` /
  `useSuggestSkills` / `useTranslateContent` / `useGenerateCoverLetterAI`
  (all typed `AIGenerateRequest`, which no DTO accepts — same trap as E6 /
  Q11a) and the mobile `AIGenerateRequest` type. `useATSCheck` and
  `useGenerateJobDescription` now send `AtsCheckDto` /
  `GenerateJobDescriptionDto` (no UI). Deleted `apps/mobile/package-lock.json`
  (listed safe-area 5.6.2 vs real 5.7.0) and gitignored
  `apps/mobile/package-lock.json`.
  UpgradeModal / share / versions / photo stub / useTemplate / pending-template
  kept with comments. Web/API/packages untouched. `useGenerateSummary` (E6)
  unchanged.


- 2026-08-27 — **Mobile Q7 + Q13: dead Settings rows gone; onboarding uses
  the real bottom inset.** Notifications and Security were `onPress: () => {}`
  with chevrons; no mobile screens exist (web has preference toggles / change
  password on the same settings page). Rows removed. Header chevron now opens
  Profile. Onboarding footer `paddingBottom` is `useSafeAreaInsets().bottom`
  (T1/T2 mechanism); `SafeAreaView` is `edges={['top']}` so the inset is not
  doubled. No-op CSS `transition: 'width'` on pagination dots removed; width
  still jumps with the slide index. Web/API untouched.

- 2026-08-27 — **Mobile Q15: client gates use `resolveEffectivePlan`.** One
  helper in `apps/mobile/src/lib/entitlements.ts` re-exports the shared-types
  function the API already uses. `canUseAI` / `canExport` / `canAccessTemplate`
  / `canCreateCV` / `canCreateCoverLetter` take the subscription object, not
  stored `subscription.plan`. AI also applies `min(stored aiCreditsLimit,
  effective plan limit)` like `reserveAiCredit`. Billing/Settings/Dashboard
  still display the stored plan (same as web). Web already resolved gates;
  it does not apply the AI min(). Web/API untouched.

- 2026-08-27 — **Mobile Q9: no fake CV completeness; Templates lock holds when
  upgrades are on.** My CVs dropped the hardcoded 70% bar (neither web nor
  `GET /cvs` defines completeness). Version/download line remains. Templates
  tab: flag OFF still Alerts with no purchase route (S1); flag ON now matches
  New CV (`upgradeAlertButtons` → billing) instead of `router.push` through
  a locked tile. `canAccessTemplate` still uses stored `subscription.plan`,
  not `resolveEffectivePlan` — same class as `canUseAI`/`canExport`; not
  fixed here. Web/API untouched.

- 2026-08-27 — **Mobile Q8: nested stacks hide the tab bar.** Tab roots still
  show it (T1/T2 height untouched). Pushed screens (CV/CL editors, new CV/CL,
  profile, billing, all support) set `tabBarStyle.display: 'none'`. Those
  that used `edges={['top']}` because the bar ate the bottom inset now use
  `['top','bottom']` so the gesture bar is the one inset. Q4 composer logic
  unchanged. `CVWizard.tsx` not edited; its parent SafeAreaView gained the
  bottom edge. Web/API untouched.

- 2026-08-27 — **Mobile Q11a: cover letter generate no longer sends `recipientName`.**
  `POST /cover-letters/:id/ai/generate` body is now `jobTitle`,
  `jobDescription`, `companyName`, `tone: 'professional'` — the
  `GenerateCoverLetterDto` allowlist. Extra `recipientName` was a 400 under
  `forbidNonWhitelisted` before `reserveAiCredit`, so generate never reached
  the model and never spent a credit. Tone picker / persist not in this
  change. Create payload untouched. Web/API untouched.

- 2026-08-27 — **Mobile Q10: failed fetches no longer look like empty accounts.**
  Dashboard stats, recents, Settings/Billing usage, and Templates (plus
  Choose Template) show `ErrorState` + retry on query failure instead of
  `?? 0` / `?? 5` / empty lists. `syncUser` still does not rethrow (that
  would bounce a signed-in user off the dashboard) and does not touch
  `legalGate`; it sets `userSyncError` so screens can tell a missing
  `user` from a new Free account. Partial dashboard failure blanks only
  the failed section. Web/API untouched.

- 2026-08-26 — **Mobile Q4: support screens keep the message and show errors.**
  Ticket list fetch failure uses `ErrorState` (not “No support tickets”).
  Send no longer clears the composer before `mutateAsync`; failure Alerts
  with the CV/Q3 network-vs-rejected split and leaves the text. Create
  ticket uses the same split. Message bubbles use `max-w-[83%]` plus
  `style.maxWidth: '83%'` (`max-w-5/6` is not in the default scale).
  Support SafeAreaViews are `edges={['top']}` so they do not double-inset
  above the still-visible tab bar. Invalid NativeWind elsewhere reported,
  not fixed. Web/API untouched.

- 2026-08-26 — **Mobile Q3: export failures are visible.** `useExport` `onError`
  surfaces 403 limit (S1-aware copy, no Upgrade when the flag is off), no
  connection, DOCX-not-on-plan, and generic server failure. Non-200 download
  and missing share sheet now Alert. Cover letter editor uses the same
  `canExport` + `exportLimitReachedMessage` gate as the CV editor. Puppeteer
  POST still increments usage before the client download — unrefunded on
  download fail; not fixed here (API). Web/API untouched.

- 2026-08-26 — **Mobile Q2: cover letter editor keeps work on failed save.**
  Back no longer `handleSave().then(router.back())` after a swallowed catch.
  Save returns boolean; failure Alerts `Could not save` with the CV network vs
  rejected split and does not leave. `usePreventRemove` + the same Stay/Leave
  copy as `cvs/[id]`. Hydrate Zustand once per letter id so a refetch cannot
  clear `isDirty`. Export/AI/tone untouched. Web/API untouched.

- 2026-08-26 — **Mobile Q5: email signup crash re-gates.** Email `register()`
  writes `PENDING_LEGAL_CONSENT` immediately after Firebase create (Google-on-
  login already did; Google-on-register new users now do too). `clearAll()`
  still keeps the flag so Cancel re-prompts; a leftover flag on an uid that
  already has `GET /legal/acceptances/me` `{ acceptance }` is cleared and not
  gated. No cold-start GET for users without the flag (grandfathered null is
  indistinguishable from a crash). Register screens ungate `legalGate` only
  after a successful `finishAcceptance`, not in `finally`. Web/API untouched.

- 2026-08-26 — **Mobile Q6: profile form cannot wipe stored fields.** Edit
  Profile waited on `useForm` `defaultValues` from a still-undefined
  `/users/me` fetch and never `reset()`. Empty-string nested profile keys
  overwrite on the server (`users.service.ts` `Object.entries`); empty
  first/last also rebuilds `displayName` to `''`. Screen now waits for the
  user, `reset()`s once per uid, shows ErrorState on fetch failure, and PUT
  sends only dirty fields (UpdateUserDto is fully optional). Save is not
  on screen until hydrated; handler returns if not. Web/API untouched.

- 2026-08-26 — **Mobile L1: legal acceptance at signup.** English-only modal
  (unchecked, Accept disabled until ticked) before Firebase on email register
  and Google-on-register; Google-on-login only when `getAdditionalUserInfo`
  says new (or the check is missing). `POST /legal/acceptances` matches web's
  six-field body; POST failure alerts and retries via SecureStore on
  `syncUser` without deleting the Auth user. Register copy and Settings rows
  cover Terms, Privacy, and Disclaimer via `EXPO_PUBLIC_APP_URL` + `/en/`
  paths. `treatMissingAsStale` unchanged. Web/API untouched.

- 2026-08-26 — **Mobile S1: one flag disables every paid-upgrade path.**
  `PAID_UPGRADES_ENABLED` in `apps/mobile/src/config/paid-upgrades.ts` (platform
  defaults all off; `EXPO_PUBLIC_PAID_UPGRADES_ENABLED` overrides). When off:
  dashboard banner, plan cards, Stripe footer, Manage Billing, and Upgrade
  alert buttons are hidden; limit alerts stay factual; billing remains
  plan+usage. Checkout/portal code is kept for rollback. Web/API untouched.

- 2026-08-26 — **Mobile E6: AI summary body matches GenerateCvSummaryDto.**
  `SummaryStep` was posting `{ type, context: { name, headline } }`, which
  ValidationPipe rejected (400) before `reserveAiCredit`. It now sends
  `{ experience, skills, targetRole }` built from the Zustand store (unsaved
  section items included), truncated to 20000 / 8000 / 200. Generate is
  disabled when any of those strings is empty. Failure alerts distinguish
  no connection, out of credits, and server rejected. Success writes
  `personalInfo.summary` (marks dirty) and `syncUser()` so the remaining-
  credits line refreshes. Other `useAI` hooks unwired. API/web untouched.

- 2026-08-26 — **Mobile bottom-sheet Modal: definite height + bottom inset.**
  Shared `Modal.tsx` sheet used NativeWind `max-h-5/6` / `max-h-2/3` (not in
  the default scale) and a `flex-1` ScrollView inside a maxHeight-only parent,
  so the sheet collapsed to handle + title. Sheet height is now a fraction of
  `useWindowDimensions().height`; `paddingBottom` is `useSafeAreaInsets().bottom`
  (42 on the gesture-nav device). Callers unchanged. Save/guard/tab bar/dates
  not touched.

- 2026-08-26 — **Mobile E7 + E5: expo-crypto ids and exit guards.** Direct
  dep `expo-crypto@~15.0.9` (SDK 54 `bundledNativeModules.json`, not latest).
  `generateId()` calls `randomUUID()` with no fallback. Editor uses
  `usePreventRemove` (`beforeRemove`) so Android gesture Back, hardware Back,
  and the in-app arrow share one Stay/Leave alert. Finish only leaves after
  a successful save with `isDirty` false. Mid-save keystrokes: save returns
  false and does not advance/exit.

- 2026-08-26 — **Mobile E5 not started.** Static check of Group 2 found
  `generateId()` depends on `globalThis.crypto.randomUUID` with no polyfill
  and no `expo-crypto` import. A1 not established; E5 blocked. §8 note added
  for skills/certs/languages/references E4-by-accident (no edit paths built).

- 2026-08-26 — **Mobile E3/E4: section persistence + preserve web-only item keys.**
  Wizard save (Continue/Finish) now POSTs new sections, PUTs existing, DELETEs
  removed — same sequence as web `cv/[id]/page.tsx`. Client supplies section
  `id` (UUID v4 via `crypto.randomUUID`, 36 chars; AddSectionDto MaxLength 80).
  Partial failure: Alert, no advance, no markSaved; persistedSectionIds
  unchanged. Experience/education/projects item rebuilds spread the loaded
  object then overlay form fields (`highlights`, `order`, unknown keys kept;
  cleared form fields win). Editor hydrates the store once per CV id so a
  refetch cannot set isDirty false and skip the write.

- 2026-08-26 — **Mobile E1/E2: legal CV PUT + visible save failure.** Wizard
  `PUT /cvs/:id` now sends `{ title, personalInfo, styling, sectionOrder }`
  (UpdateCvDto / web autosave subset), not the full CV document. Save failure
  Alerts and does not advance the step; network vs rejected request are
  separate messages. Empty catch removed. Section POST/PUT/DELETE not in this
  gate.

- 2026-08-26 — **Mobile T1 correction: tab bar height owned by RN.** Device
  `DIAG_INSETS.bottom` is 42, not 0. Prior T1 set `safeAreaInsets.bottom: 0`
  (height pinned at 49) then `tabBarStyle.paddingBottom: 42` inside that box
  (7px content) — labels clipped, bar still in the gesture region. Removed
  both overrides and the diagnostic log. Library now computes `49 + 42`.
  Icon 22 / label 10/600 unchanged. T2 `edges={['top']}` left as-is.

- 2026-08-26 — **Mobile T1/T2: tab bar clears system gesture bar.** Mobile
  only. Removed `height: 60` and `paddingTop/Bottom: 6`. Tab bar
  `paddingBottom` is `useSafeAreaInsets().bottom`; navigator
  `safeAreaInsets.bottom` is zeroed so RN does not apply a second copy.
  Icons 22px, labels 10/600; “Cover Letters” not renamed. Tab screens
  `SafeAreaView` `edges={['top']}` (dashboard, CVs, cover letters,
  templates, settings). D1/D2 date code untouched.

- 2026-08-26 — **Mobile D1/D2: Firestore date parsing.** Mobile only. `toDate` /
  `formatDate` in `apps/mobile/src/lib/utils.ts` mirror web
  `format-date.ts` (Timestamp `{seconds}`/`{_seconds}`, live `.toDate()`,
  ISO, epoch; never `"Invalid Date"` — em dash). Recent-documents sort uses
  `toDate` and never NaN-compares; unparseable rows sort last. Billing
  “Renews” row renders only when `toDate(currentPeriodEnd)` succeeds (no
  “Renews —”). List/support screens already called `formatDate`; they pick up
  D1 with no copy change. Type lie recorded in §8, types not edited. Tab bar
  (T1/T2) not in this pass.

- 2026-08-26 — **Mobile MC1: Nest envelope unwrap + list shape.** Mobile only.
  `api.ts` now peels `{ success, data, timestamp }` (web’s rule). CV/CL list
  hooks typed as `{ items, page, limit, hasMore }`; support list as an array.
  Dashboard recents and list screens read `.items`. CV subtitle uses
  `usage.cvsCreated` (“N CV creations on your plan”), not page length.
  Dropped the local unwrap in `useSupport`; export `normalizeExportPayload`
  stays dual-shape. **Why this survived:** `PaginatedResponse` (`data` +
  `total`) was a fabricated shape no endpoint returns, so the compiler
  type-checked `data.total` against a field that never existed. No vitest
  (MC2 held). Manual verify against a running API.

- 2026-08-26 — **`/en/ats-cv-checker`.** Web only. Same English-document SEO as
  `/en/ai-cv-builder` (not LegalDocumentView). Unique copy in
  `apps/web/src/content/ats-cv-checker.ts` (21 keys). Limits section sits
  second; mid is 3 cards; how is one paragraph; Pricing only (no FAQ, no
  `faqPage()` JSON-LD). Related strip to CV builder (`locale="en"`) and
  `/templates`. Footer Product label `footer.ai_ats_check` × 6,
  `locale="en"`. Sitemap one loc, hreflang `en` + `x-default`. Copy shipped
  as supplied; §19 flags in the review note, not rewritten here.

- 2026-08-26 — **Upgrade-modal template sentence.** Web. Description interpolates
  `{reach}` from `limits.templates` of the plan the modal is selling (today
  Pro), via `upgrade_modal.template_reach.*` × 6. No hardcoded “every
  template” / plan name in that sentence. English reach labels pinned to
  `templateFeatureLine`.

- 2026-08-26 — **Pro/CA template oversell (MC1–MC2).** Shared-types + api
  spec + billing comparison + `dashboard.upgrade_desc` × 6. `limits.templates`
  is now the max reachable `SubscriptionPlan` (not `'all'`). Pro pricing /
  upgrade / mobile cards derive “Pro templates”; comparison “All Templates”
  ticks Enterprise only. `plan-advertising.spec.ts` asserts `planMeetsTier`,
  the DOCX gate, and reset cadence. Contained compile change — `PlanLimits` is
  not stored on user docs. Features generator still held. Priority support and
  CA AI-tools uniqueness recorded in §8, not removed.

- 2026-08-25 — **`dashboard.upgrade_desc` Pro cadence.** Web locales only.
  All three Pro numeric caps now read `/month` (CVs, cover letters, AI
  credits), matching `PLAN_CONFIGS[PRO].limits` + paid monthly reset. Known
  restatements (`faq.a1`/`a2`, `terms.ts` §6, language counts) recorded in
  §8, not edited.

- 2026-08-25 — **Templates close_title + homepage `templates_desc`.** Web
  only. `/en/templates` close is “document you can send” (not “finished”).
  Homepage `features.templates_desc` × 6 no longer hardcodes “16 templates”;
  same invitation wording as `public_templates.subtitle`. Remaining restated
  catalogue/plan counts listed in the review note, not edited here.

- 2026-08-25 — **`/templates` English unique body + subtitle count.** Web
  only. No new path. Mid (3 cards), close (3 steps), and a related strip to
  both English landings (`locale="en"`) render when `locale === 'en'` from
  `apps/web/src/content/public-templates.ts` (19 keys). Other locales keep
  the gallery. Not `englishDocument`; sitemap/hreflang unchanged. No
  ItemList or FAQ JSON-LD. `public_templates.subtitle` × 6 no longer
  hardcodes “16 templates”.

- 2026-08-25 — **`/en/ai-cover-letter-generator`.** Web only. Same English-document
  SEO as `/en/ai-cv-builder` (not LegalDocumentView). Unique copy in
  `apps/web/src/content/ai-cover-letter-generator.ts` (24 keys). Mid is 3 cards,
  close is 3 steps, Pricing only (no FAQ, no `faqPage()` JSON-LD). Reciprocal
  related strip both ways, `locale="en"`. Footer Product label
  `footer.ai_cover_letter` × 6. Sitemap one loc, hreflang `en` + `x-default`.
  `close_title` is “letter you can send” (not “finished”); CTA band uses
  `cta_title`, not a second H1.

- 2026-08-25 — **Favicon regen from `logo-schema.png`.** Web public assets only.
  Replaced black-background favicon/apple-touch/android-chrome set with crops
  from the 512×512 white FC mark (~8% edge pad; maskable ~20%). Symptom fix:
  tab shows a legible FC instead of an orange fragment. Still an opaque white
  square on dark browser chrome — transparent 16px-capable mark remains a §8
  brand ask (header, footer, favicon). No package.json dependency; one-shot
  system Pillow. Metadata/`site.webmanifest` paths unchanged.

- 2026-08-25 — **MC1–MC2 outcome-claim leftovers.** Web: hero floating card
  `mockup_interview_calls` is no longer “3 interview calls”; label/value are
  last-saved / just now (document state, ×6). Key names left stale on purpose —
  call-site comment in `Hero.tsx` explains. Mobile onboarding: removed
  unverified “Trusted by 10,000+ professionals”; subtitle no longer “gets you
  hired”. Remaining Dream Job / get noticed / land-the-job copy listed in §8
  for the client. `terms.ts:46` unchanged.

- 2026-08-25 — **Drop “ATS-optimized” / “ATS ready” / Features “ATS
  Optimization” (scope C).** Web + welcome email. Homepage meta / OG /
  Twitter, root-layout fallback, and keywords no longer claim optimisation.
  `hero.mockup_ats_ready` × 6 is now layout (“Clear structure” / translations).
  `features.ats` × 6 renamed to the in-app tool (“ATS check” / translations).
  Welcome email in `mail.service.ts` matches the landing draft/export wording.
  Contact category and `terms.ts:46` untouched; terms logged in §8 for the
  client. Same-class outcome promises reported in the review note, not edited.

- 2026-08-25 — **`/en/ai-cv-builder` copy: drop ATS-Ready and single-column.**
  Web only. Title no longer claims an ATS-ready document (§19 / same class as
  the watermark). Mid4 no longer says every template is single-column (Sidebar,
  Compact, Slate-Gold are not) and now states that interpretation by any one
  ATS is outside our control. Subtitle and hero had neither claim — left as
  written.

- 2026-08-25 — **First search-intent landing: `/en/ai-cv-builder`.** Web only.
  English-only via the legal SEO mechanism (`pageMetadata({ englishDocument:
  true })`, `ENGLISH_DOCUMENT_PATHS`) — not `LegalDocumentView`, no
  controlling-version notice. 24 unique strings in
  `apps/web/src/content/ai-cv-builder.ts`. Three unique sections, then a CTA,
  then homepage Pricing + FAQ as conversion only. HowItWorks not reused.
  Footer Product link uses next-intl `<Link href="/ai-cv-builder" locale="en">`
  so a `/es` visitor is not sent to mixed English-body / Spanish-pricing.
  Footer label is `t('footer.ai_cv_builder')` × 6. Sitemap: one loc, hreflang
  `en` + `x-default`. Copy shipped as supplied; §19 flags in the review note,
  not rewritten here.

- 2026-08-22 — **Export-limit error cadence.** API.
  `exportLimitReachedMessage` in `export.service.ts`: Free is `(2)` with no
  `/month`; paid numeric caps keep `/month`. The client reserve path already
  returned `limit_reached` without cadence; this is the Puppeteer/server
  `ForbiddenException`. Spec added. **Not the same bug:** CV / cover-letter /
  AI wall strings have no `/month`. Stale `FEATURES_COMPLETE.md:66` and
  `AUDIT_OPEN_FINDINGS.md:83` marked next to the FAQ dual-copy note in
  `ARCHITECTURE_MAP.md` §8 Tier 4.

- 2026-08-22 — **SEO leftovers MC1–MC3 (not a new SEO batch).** Web only.
  **MC1** — `faqPage()` Free cadence: no `/month` on Free AI/exports; “never
  reset”; Pro CVs/letters/credits keep `/month`. Guarded in `json-ld.test.ts`.
  FAQ is said twice (`faq.a1`/`a2` locale JSON vs this schema) — noted in
  `json-ld.ts` and `ARCHITECTURE_MAP.md` §8 Tier 4 so the next cadence edit
  cannot miss one copy the way Batch E did. **MC2** — `/testimonials` dropped
  from `sitemap.ts` (page stays empty; no placeholders). **MC3** — Navbar and
  Footer Features/Pricing use next-intl `Link href="/#…"` so the locale is
  kept. **§1** SEO status was stale (still said every page needs metadata);
  Batch D already shipped that. Homepage `generateMetadata` localisation is
  still a separate change. Not done: apex 302→301 (CDN);
  `export.service.ts` still says `(N/month)` on the export-limit error for
  every plan, including Free.

- 2026-08-21 — **Batch M Part 3 — `QA_LAUNCH_CHECKLIST.md`.** Operator
  checklist only (no product code). Three phases in one file: Phase 1 must
  pass before live Stripe (auth, billing states, Checkout, portal, Free
  limits, export refund, AI no-charge copy); Phase 2 core product with
  grouped palettes/TOCs; Phase 3 admin/CRM plus the Batch K visual list.
  Setup requires `stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe`.
  Lines that need listen are marked `{LISTEN}`. Failure/edge states sit on
  the same line as the control.

- 2026-08-21 — **MC9 — cancel-at-period-end reconcile job.** API. Separate
  `CancelAtPeriodEndReconcileService` in the payment module (not
  `UsageResetService`): cron every 15 minutes plus `onApplicationBootstrap`
  catch-up. Query `subscription.cancelAtPeriodEnd == true` only; period-end
  + MC8 grace filtered in memory (no composite index). Stripe retrieve before
  any write; skip `active`/`trialing` (`still-active`), any retrieve error
  (`retrieve-failed`), missing id (`no-subscription-id`). Skip logs are those
  codes plus Firestore uid — never email or subscription id. Downgrade reuses
  `PaymentService.applyDeletedSubscriptionWrite` (the extracted
  `customer.subscription.deleted` write). Spec pins: NEVER writes Free when
  Stripe reports active or trialing. Ships with MC8 — do not push A alone.

- 2026-08-21 — **MC8 — cancel-at-period-end expires in `resolveEffectivePlan`.**
  Shared-types. `cancelAtPeriodEnd` plus a past `currentPeriodEnd` now resolves
  to Free even while Stripe status is still `active` (the pairing a dropped
  `customer.subscription.deleted` webhook leaves behind). Grace window is
  **15 minutes** (`CANCEL_AT_PERIOD_END_GRACE_MS`): wrongly cutting a payer by
  clock skew is worse than a few extra minutes of Pro. Billing still shows the
  *stored* plan until MC9 heals the doc. Specs in
  `subscription-entitlements.spec.ts`. Also: `RENDER_DEPLOYMENT.md` marked
  STALE (wrong webhook URL at line 165); noted in §8. **Ships with MC9.**

- 2026-08-21 — **MC6 — Stripe listen path in docs.** README `stripe listen`
  forwarded to `/api/v1/payments/webhook` (not mounted). Corrected to
  `/api/v1/webhooks/stripe`. `DEPLOYMENT_AND_OPS.md` already named that
  path; listen command spelled out so it no longer defers to the README
  line that was wrong. `RENDER_DEPLOYMENT.md` still has the old path
  (not this change).

- 2026-08-21 — **MC5 — trial CTA cannot silently become a paid checkout.**
  API + web. Shared `stripeHistoryAllowsTrial` used by
  `GET /payments/trial-eligibility` (billing mount only; no Stripe customer
  created; fail closed on list/retrieve error; heals `hasUsedTrial`) and
  `createCheckoutSession`. Pro button is disabled with `checking_trial`
  until the GET returns; Enterprise/Career Accelerator do not wait.
  Trial CTA sends `expectTrial: true`; mismatch → 400 `TRIAL_NOT_ELIGIBLE`,
  no session, flag set; client toasts `trial_not_eligible` (six locales),
  never the server English. Paid Upgrade omits the flag and proceeds.

- 2026-08-21 — **MC4 — billing checkout legal block (I.7).** Web.
  `pricing.terms_renewal_desc` (six locales) drops “each month”: “Paid
  plans renew automatically at the price shown, until you cancel.” Public
  pricing already rendered that key; billing now shows it under the
  upgrade CTAs plus `billing.checkout_legal` (`t.rich`) with clickable
  Terms / Refund Policy / Privacy via existing `/terms-of-service`,
  `/refund-policy`, `/privacy-policy` (`legalDocLinks` gained `refund`).
  I.7 ticked.

- 2026-08-21 — **MC3 — trial disclosure names the card.** Web copy only.
  `billing.trial_disclosure` (six locales) now: days free first, card saved
  now and charged `{price}/{interval}` when the trial ends unless cancelled,
  then “Today: $0.” Same `{days}` `{price}` `{interval}` placeholders; billing
  page already interpolates them. RTL (ar/ur) included.

- 2026-08-21 — **MC2 — billing trial CTA reads `hasUsedTrial`.** Web only.
  `trialEligible` now requires `!stripeSubscriptionId` **and**
  `!hasUsedTrial`, matching the Firestore half of
  `PaymentService.createCheckoutSession`. A cancelled Pro user with the
  flag set sees `upgradeTo` Pro, not `start_trial`. Stripe history is
  still server-only (residual: flag false + prior subs — checkout
  still proceeds, without a trial).

- 2026-08-21 — **MC1 — live Stripe key refuses compiled price fallbacks.**
  API. `assertLiveStripePricesConfigured` in `validateEnv`: `sk_live_`
  will not boot until all four `STRIPE_*_PRICE_ID` env vars are set
  (message names them and says the API will not start). `resolvePriceId`
  ignores `PLAN_CONFIGS` ids when the secret is live (env only). Compiled
  `price_1U0xN…` fallbacks stay — they are the `isPlanPurchasable` "for
  sale" pin; emptying them hides Pro/Enterprise. Live ids never go in
  shared-types. `verify-yearly-prices.mjs` READY text no longer says
  copy ids into `subscription.types.ts`. Tests use `sk_live_x` /
  `sk_test_x` only.

- 2026-08-21 — **MC — `ABUSE_IDEMPOTENCY_CONFLICT` → `abuse_rate_limited`.**
  Web only. `trackAbuseCode` now maps the sixth `ABUSE_*` code (HTTP 409,
  in-flight duplicate) onto the existing §48 event
  `abuse_rate_limited` with `reason: 'ABUSE_IDEMPOTENCY_CONFLICT'`.
  **Deliberate compromise, not a match** — not a cap; this is the
  "please wait" bucket. Split by `reason` for true cap counts. No fifth
  event, no UI copy, 409 stays non-retryable, consent unchanged.

- 2026-08-21 — **Docs: §8 export ATS.** Client PDF is html2canvas→jsPDF
  **plus** `addInvisibleTextLayer` (shipped 2026-07-30); §8 no longer
  calls exports non-ATS-parseable. Puppeteer path still unused.

- 2026-08-21 — **Docs: K.4 navy chrome.** `CLIENT_REQUIREMENTS.md` K.4
  still said navy was light-only; aligned with shipped Option A and §8.

- 2026-08-21 — **MC4 — `ai_generation` for cover-letter generate and resume
  import.** Web only. `track('ai_generation', { feature: 'cover-letter-generate' })`
  on cover-letter `[id]` `aiMutation.onSuccess`; `track('ai_generation', {
  feature: 'resume-import' })` alongside existing `cv_created` in
  `ImportResumeModal`. Consent gate unchanged (`track()` already no-ops without
  Analytics consent). Closes the AI batch (MC-A, MC-B, MC3, MC4). Follow-up:
  hardcoded English title `"AI generation failed"`; localize the English
  summary-fallback body.

- 2026-08-21 — **MC3 — Audit `generateWithAI` and resume import.** API only.
  `CoverLetterService` / `CVService` inject `AuditService`. After a successful
  provider return they call `logUserAction` with the same shape as
  `AIController.withAudit`: action `AI_GENERATION`, resource `ai`,
  resourceId/feature `cover-letter-generate` | `resume-import`, metadata
  `{ feature, provider, model, tokensUsed, latencyMs }`. Controllers pass
  `{ uid, email, role }` so rows are not `unknown`. `parseResumeSafe` now
  returns the AI telemetry next to the parsed fields; it is **not** on the
  HTTP CV body. Create-with-AI is covered because audit lives inside
  `generateWithAI`. **Deliberate:** success-only; failures stay on ERROR logs.
  **Known asymmetry:** a failed refund increments usage with no audit row —
  grep `Failed to refund AI credit for`. HTTP bodies unchanged. Web
  `track('ai_generation')` for these paths is MC4.

- 2026-08-21 — **MC-B — Local AI-summary fallback is labelled in the result
  panel.** `AISummaryModal` only (plus six-locale keys). Fallback is unchanged
  and still not written into the CV until Add/Replace. On that path only:
  persistent `generated_locally` via existing `InAppWarning` (amber), amber
  treatment on the result box, buttons `add_basic_summary` / 
  `replace_with_basic_summary` ("Add basic summary" / "Replace with basic
  summary"). Success path, toast, and summary text body untouched. No marker
  in the stored summary. RTL: `generated_locally` already localized; panel is
  full-width with no `text-left`. Follow-up: localize the English filler body.

- 2026-08-21 — **MC-A3 — Client branches AI failure copy on refund `code`.** Web
  only. New `t()` keys `common.generate_failed_charge_unconfirmed` and
  `coverLetters.generate_failed_charge_unconfirmed` in all six locales (real
  translations; support phrasing matches existing `Contact support` /
  `Contacta con soporte` / `Contactez le support` / `Wenden Sie sich an den
  Support` / `تواصل مع الدعم` / `سپورٹ سے رابطہ کریں`). Existing no-charge
  strings unchanged. Nine call sites: `isAiCreditUnconfirmed` (ApiError.code
  `=== 'AI_CREDIT_NOT_REFUNDED'`) → unconfirmed copy; missing/other code →
  no-charge. AISummaryModal: description only; local-fallback title unchanged.
  Hardcoded English title `"AI generation failed"` not touched (follow-up).

- 2026-08-21 — **MC-A2 — `AllExceptionsFilter` forwards `code`.** Filter only.
  When `HttpException.getResponse()` is an object with a non-empty string `code`,
  the JSON body now includes it (`success`, `statusCode`, `message`, `code`,
  `timestamp`, `path`). Absent `code` is omitted — not sent as `null`. AI 503s
  from MC-A1 now reach the client as `AI_CREDIT_REFUNDED` /
  `AI_CREDIT_NOT_REFUNDED`. Client still always shows
  `generate_failed_no_charge` (MC-A3). **Noted behaviour change, not a fix:**
  abuse `throwAbuse` already put `ABUSE_*` on the exception and the filter
  dropped it; those 403/429/409 bodies now include `code` too. Web
  `trackAbuseCode` (GA4 only) is the sole reader; no error handler, retry,
  redirect, or step-up flow branches on `body.code`. Follow-up (not this
  batch): hardcoded English title `"AI generation failed"`.

- 2026-08-21 — **MC-A1 — AI failure 503 carries refund outcome.** API `ai.service.ts`
  only (plus its spec). `generate()` refunds in `finally` **before** throwing, so
  `ServiceUnavailableException` can carry `code: 'AI_CREDIT_REFUNDED' |
  'AI_CREDIT_NOT_REFUNDED'` (message still `'AI generation failed'`). Refund is
  attempted three times (initial + 2 retries); the production grep line
  `Failed to refund AI credit for ${userId}: …` is unchanged and emitted once
  after all attempts fail. HTTP JSON does **not** yet forward `code` (MC-A2).
  Client still always shows `generate_failed_no_charge` (MC-A3). Follow-up
  (not this batch): hardcoded English title `"AI generation failed"`.

- 2026-08-21 — **MC-L3 — Maskable PWA icon in `site.webmanifest`.** Web only. Adds
  `/android-chrome-512x512-maskable.png` with `purpose: "maskable"`. Existing icons and
  `theme_color` / `background_color` / names unchanged.

- 2026-08-21 — **MC-L2 — Organization JSON-LD logo → `/logo-schema.png`.** Web only.
  Replaces `flacronCvlight.png` (white ink, invisible on Google’s white cards) with the
  512×512 square FC mark on opaque white. Plain URL string kept (no ImageObject). Legacy
  `flacronCv*` files not deleted.

- 2026-08-21 — **Dark-mode chrome = brand navy (Option A).** Web only. Token hex unchanged
  (`chrome: '#1e3a5f'`). Dark overrides: Navbar `dark:bg-chrome/70` + blur + `dark:border-white/15`;
  mobile panel `dark:bg-chrome` + `dark:border-white/10`; Footer/TopBar solid `dark:bg-chrome` +
  page-facing `dark:border-white/15`. Internal footer dividers untouched. `chrome-contrast.test.ts`
  covers dark fill vs page + dark link colours. §39 closed. Logo / manifest / light mode unchanged.

- 2026-08-21 — **MC-L1 — Logo intrinsic size for horizontal lockups.** Web only.
  `Logo.tsx`: `width`/`height` **1712×265** for both `logo-ink-*` assets (was
  1070×807 for the old stacked mark). Comments updated; no `h-*` / binary
  changes. Call sites still height-based + `w-auto`.

- 2026-08-20 — **MC2 — Gate `POST /cvs/import` with `aiEnabled`.** API only.
  `CVController` now uses `FeatureFlagGuard` (other CV routes still unflagged —
  guard no-ops when no `@RequireFeature`). Import alone gets
  `@RequireFeature('aiEnabled')`, same flag as `AIController`. CRM AI kill-switch
  now stops resume import from calling OpenAI. Auth/billing/data-shape untouched.

- 2026-08-19 — **Full-width navy TopBar (dashboard / admin / CRM) + usage Unlimited labels.**
  Web only. No dependency changes. Auth/billing/data-shape untouched. Dark-mode navy
  **not** invented (§39 still open).

  **Chrome restructure.** Shells are `flex h-screen flex-col` → full-width `TopBar` →
  `flex min-h-0 flex-1 overflow-hidden` → sidebar | scrolling `main`. Removes the white
  sidebar logo strip beside navy TopBar. Mobile drawer + overlay use `top-16` so the navy
  bar stays visible. Collapse toggle stays in the dashboard sidebar body (header shape
  unchanged on collapse). Shared `TopBar` takes `area`: logo `variant="on-dark"` links to
  `/dashboard` | `/admin` | `/crm`; admin shows `admin.title`; CRM shows `crm.chrome_badge`
  plus `crm.nav_owner_badge` for `super_admin`. Logo opaque baked-in rectangle still
  present on navy — standing §8 brand request; **no code workaround**. Orange accent next
  to the mark is **brand ink in the PNG**, not a UI status dot — do not re-investigate.

  **Usage cards.** Dashboard Exports/CVs when unlimited: `{count} ·` +
  `billing.features.unlimited` (existing wording family). No invented numeric cap.

  **Files:** `TopBar`, `DashboardShell`, `AdminShell`, `CRMShell`, `Sidebar`,
  `AdminSidebar`, `CRMSidebar`, `dashboard/page.tsx`, `crm.chrome_badge` × 6,
  `ARCHITECTURE_MAP.md` §4.

  **QA:** web lint 0 errors (pre-existing `<img>` warnings) · web `tsc --noEmit` ✓ ·
  web **305/305** · api lint ✓ · api `tsc --noEmit` ✓ · api **523/523** · all seven
  i18n/contrast gates green. **Scroll and RTL not browser-verified in this session.**

- 2026-08-19 — **Mobile API alignment (endpoint batch) + pre-launch gate.** Mobile only.
  No dependency changes. Auth/billing/data-shape untouched. Legal modal **held**.

  **MC1.** `useUpdateProfile` → `PUT /users/me` (was `PATCH /users/me`).
  **MC2.** Cover-letter generate → `POST /cover-letters/:id/ai/generate`.
  **MC3(b).** Photo UI disabled (settings avatar no longer uploads). TODO(mobile-photo):
  Storage then `PUT /users/me { photoURL }` mirroring web — do not invent
  `POST /users/:uid/photo`.
  **MC4.** Export URLs → `/cvs/:id/export/{pdf|docx}` and
  `/cover-letters/:id/export/pdf`. Map `downloadUrl` → `url`; unwrap Nest
  `{ data }` envelope. **Filename:** last path segment of the signed URL when it
  ends in `.pdf`/`.docx` (server uses `exports/{uid}/{uuid}.ext`); else
  `cv-{id}.{format}` / `cover-letter-{id}.pdf`.
  **MC5.** Support messages from `GET /support/tickets/:id` `{ ticket, messages }`;
  removed dead `GET …/messages` and `useTicketMessages`.
  **Cleanup.** Removed `auth-store.updateUser` and `useSubscriptionStatus` (dead
  routes).

  **Docs:** §8 — mobile **not shippable** (placeholder EAS id, no eas.json);
  Mobile pre-launch gate (6 items); X-Device-Token scoring note; legal modal
  English-only / next-intl decision path; superseded “shipping app” dead-call note.

  **QA:** `pnpm --filter web lint` 0 errors (pre-existing `<img>` warnings) ·
  web `tsc --noEmit` ✓ · web **305/305** · api lint ✓ · api `tsc --noEmit` ✓ ·
  **api 523/523** · `pnpm --filter flacroncv-mobile lint` ✓. All seven
  i18n/contrast gates green. Mobile `tsc` still has pre-existing errors outside
  this batch (onboarding/Skeleton/utils; settings `badge` union). No new web
  `t()` strings.

- 2026-08-19 — **Batch K — UX polish (§35–42 / K.1–K.6).** Web only. No dependency changes.
  Auth/billing/data-shape untouched. Restyles of working shells and dark-mode navy **out of
  scope** (operator-approved).

  **K-MC2 (priority) — §40 credit-not-used reassurance.** Shared
  `common.generate_failed_no_charge` × 6 locales (same key name as the existing
  cover-letter pattern; no second invented key). Wired on AI **catch / onError**
  paths that reserve then refund: ATS, LinkedIn, interview-prep, resume import,
  CV-summary local fallback toast, cover-letter AI Improve, regenerate-paragraph,
  generate-job-description. Cover-letter generate panel keeps
  `coverLetters.generate_failed_no_charge` (credit + no draft). Parse failures
  after a successful response do **not** get the line (credit was consumed).

  **K-MC1 — plan comparison mobile layout.** Billing comparison: stacked per-plan cards below
  `md`; existing table from `md` up. No horizontal-scroll table on phones.

  **K-MC3 — §38 honesty in cookie centre.** `cookie_consent.preferences_desc` states that
  rejecting Preferences means language is not remembered across visits (expected). Trade-off
  recorded in §8 for the client.

  **K-MC4 — cover-letter autosave retry.** Same `retryTick` + capped backoff (4s→30s) as CV
  editor; persistent toast `coverLetters.autosave_failed`.

  **Docs:** §8 Batch M visual-QA checklist; §38 consent trade-off; §39 navy light-only open
  question. `CLIENT_REQUIREMENTS.md` Batch K statuses.

  **QA:** `pnpm --filter web lint` 0 errors (pre-existing `<img>` warnings only) ·
  web `tsc --noEmit` ✓ · web **305/305** · api lint ✓ · api `tsc --noEmit` ✓ ·
  **api 523/523**. All seven i18n/contrast gates green.

- 2026-08-19 — **HOTFIX — CORS allowedHeaders: X-Device-Token + Idempotency-Key.**
  Production outage: every browser call from `www.flacroncv.com` → `api.flacroncv.com`
  failed preflight (`x-device-token` not in `Access-Control-Allow-Headers`). API `/health`
  stayed ok. Root cause: Batch G added client headers; `main.ts` allowlist was never
  extended. Fixing only the device token would have taken AI generate down next
  (`Idempotency-Key`).

  **MC1.** `CORS_ALLOWED_HEADERS` in `apps/api/src/cors-allowed-headers.ts` — explicit list
  including both custom headers; `main.ts` spreads it. Do not reflect arbitrary headers.
  **MC2.** `stripe-webhook.bootstrap.spec.ts` uses the same constant.
  **MC3.** `CLIENT_CROSS_ORIGIN_HEADERS` in `apps/web/src/lib/api-cors-headers.ts`; `api.ts`
  attaches headers only through that catalog; `api-cors-headers.test.ts` asserts the API
  allowlist includes every client header (and that `api.ts` does not hardcode the names).
  **MC4.** `DEPLOYMENT_AND_OPS.md` §5 preflight now sends `Access-Control-Request-Headers`;
  `PROJECT_PROGRESS.md` §2A regression **#5** — origin-only 204 is not verification.

  **Deploy:** API only. After ECS: run the strengthened OPTIONS curl (www + apex), then
  hard-refresh the dashboard.

  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit` ✓ ·
  **api 523/523** · **web 305/305** (+3 `api-cors-headers`). All seven i18n/contrast
  gates green. No new user-facing `t()` strings.

- 2026-08-19 — **Export allowance: no charge on failed render (§15 parity / audit MEDIUM+LOWs).**
  Web + API. Auth/billing plan shape untouched; `exportsThisMonth` semantics unchanged
  (Free = lifetime 2 after F.3). No dependency changes.

  **Defect:** `POST /exports/record` incremented before html2canvas/jsPDF/docx ran.
  A failed render left Free users charged with nothing (half their lifetime allowance
  per failure) and no refund. Same class as client §15 for AI credits; exports were
  missed. Also why B.12’s export warning stayed passive.

  **MC1 — transactional reserve.** `recordClientExport` now matches `reserveAiCredit`:
  one Firestore transaction does DOCX/plan check, `exportsThisMonth` increment, and
  writes `export_reservations/{reservationId}` (`status: reserved`). Returns
  `{ allowed, reservationId }`. Concurrent Free reserves cannot overshoot (tested).

  **Refund — dedicated `POST /exports/refund`.** Body `{ reservationId }` only — not a
  flag on record. Idempotent: reserved→refunded once; unknown/foreign/already
  refunded/consumed → `{ refunded: false }`; never decrements below zero (tested,
  including double-fired catch with prior usage).

  **Confirm — `POST /exports/confirm`.** Marks consumed; **DOCUMENT_EXPORTED moves
  here** (after successful production). Chosen as contained: same module, ~one
  endpoint, stops the audit trail from counting failed renders as exports.
  Repeats are `already_consumed` (no second audit).

  **MC2 — web.** `EditorToolbar` and cover-letter `[id]` export: reserve → render →
  confirm; catch → refund then toast.

  **Out of batch:** Puppeteer server paths (already charge after success); mobile
  export URL mismatch (now the **4th** dead mobile route in §8); raster PDF
  architecture; no automated goodwill backfill.

  **Docs:** three audit findings marked FIXED; §8 mobile #4 + goodwill CRM
  `resetUsage` procedure + `export_reservations` on H.6 erasure list;
  `ARCHITECTURE_MAP` collection note; B.12 note unchanged (passive warning still
  correct UX).

  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit` ✓ ·
  **api 523/523** (export suite 14; was 514) · **web 302/302**. All seven i18n/contrast
  gates green. No new user-facing `t()` strings.

- 2026-08-19 — **Firestore composite indexes — deploy confirmed (record only).** Operator verified
  in the Firebase console: **38** composite indexes, all **Enabled**, including
  `crm_activities` (customerId + createdAt), `job_applications` (userId + deletedAt + updatedAt),
  and `crm_transactions` (customerId + date). The 2026-07-19 “ACTION REQUIRED: `firebase deploy
  --only firestore:indexes`” notes (and the matching §4 / adversarial-review “still needs deploy”
  lines) are marked **Resolved** in place — the indexes were already live; the record was never
  updated. No application code. Repo `firestore.indexes.json` still lists 37; console has 38
  (one extra may be console-only or a later add — not investigated here).

- 2026-08-19 — **Batch L — analytics (§47–49 / L.2–L.5).** Web only. No Measurement
  Protocol, no new dependencies, auth/billing/data-shape untouched. Tracker letter is
  **L** (not K — K remains UX polish).

  **MC1 — §47 missing client events.** Catalog + call sites: `signup_started` (after
  auth settles, signed-out only — keeps the name, moves the fire so already-signed-in
  redirects do not inflate the funnel), `email_verified` (once per uid via
  `localStorage`; browser-local, not a server unique — documented), `cv_creation_started`
  on `/cv/new` continue, `cv_created` with `source: 'import'` on resume import success,
  `free_allowance_exhausted` when `UpgradeModal` opens. Landing / upgrade-page views
  stay on `page()` — no named duplicates.

  **MC2 — §48.** GA4 already receives only the four abuse codes from `lib/api.ts`.
  Hashes, emails, and tokens are not event props. **First-party aggregate abuse
  counters were considered and deferred:** they would need a new Firestore write path
  and retention policy for counts that GA4 already approximates under consent, and the
  kill switch is still off — shipping a second store before enforcement is on adds
  PII-adjacent operational surface with no decision-maker. Revisit when enforcement
  is flipped.

  **MC3 — §49.** `ai_generation` wired on successful `/ai/*` UI paths (cv-summary,
  ats-check, linkedin, interview-prep, generate-job-description, cover-letter,
  regenerate-paragraph). Props are `{ feature }` only — **never `tokensUsed`**. What
  §49 does **not** deliver: no dollar cost exists anywhere in the product; tokens are
  recorded server-side for `/ai/*` via `withAudit` only; cover-letter generate and
  resume import bypass `withAudit` so their tokens are never recorded (and no
  `ai_generation` event fires for them); `withAudit` runs on success only so failed
  calls are absent; retry rate is not recorded.

  **MC4.** `apps/web/src/lib/analytics.test.ts` — proves `gtag` is not called before
  Analytics consent (and not for `track` after revoke).

  **MC5.** This entry; `CLIENT_REQUIREMENTS.md` L.2–L.5; `ARCHITECTURE_MAP.md` §7
  seven gates; standing-rules test/gate counts; §5.4; §8 AI audit gap + mobile legal
  gap. L.1 (`NEXT_PUBLIC_GA4_MEASUREMENT_ID`) remains client-owned.

  **Record hygiene (same change):** standing rules 5–6 corrected; change-log
  Batch B–J "Do not commit" → **Committed.** (they are on `main`); Batch B Privacy
  §1.9 vs G hold marked satisfied.

  **QA:** `pnpm --filter web lint` 0 errors (pre-existing `<img>` warnings only) ·
  web `tsc --noEmit` ✓ · web **302/302** (vitest `--pool=threads --no-file-parallelism`;
  +2 `analytics.test.ts`). All seven i18n/contrast gates green. No new user-facing
  `t()` strings. API untouched this batch.

- 2026-08-19 — **Batch J — backend validation + API security sweep (MC1–MC8).** **Committed.**
  API only. Auth/billing/data-shape untouched except write-body validation. Audit IP writes
  left alone (still §8 / J.5-adjacent). No secrets logged.

  **MC1–MC3 — class DTOs on CV, cover-letter, and user writes.** Controllers now bind
  `class-validator` classes so the global ValidationPipe is real. Nested `personalInfo` /
  `styling` extra keys are **rejected** (stops dotted Firestore mass-assignment). Service
  allow-lists kept (`users.service.update`, cover-letter `UPDATABLE_FIELDS`).

  **Mobile create = option (b).** Extra keys on `POST /cvs` and `POST /cover-letters` are
  declared optionals, commented as mobile-only and **intentionally not persisted**. A
  ValidationPipe test asserts the shipping mobile payload is **accepted**. Option (a)
  (reject extras) would 400 a live client for no security gain.

  **CVSectionItem = explicit looseness.** Type/length on known fields; extra keys allowed.
  `@ValidateNested` + `forbidNonWhitelisted` on items would 400 legacy autosaves. Full union
  deferred to a migration. `@Type(() => Object)` on `items` so `enableImplicitConversion`
  cannot coerce each item into an Array.

  **MC4 — remaining `/ai/*` bodies (length caps), public contact DTO, admin `updateTicket`
  DTO, template update.** `templates.service.update` no longer spreads `...data`. Named
  fields only; `usageCount` / `createdBy` / `id` / `rating` / timestamps are not
  caller-writable. Admin-only was not a reason to leave mass assignment.

  **MC5.** Client 503 is now the stable `"AI generation failed"` (credits-exhausted message
  unchanged). Provider `Error.message` is not echoed.

  **MC6.** Welcome/verification failures log `uid`, not raw email. Provider and cover-letter
  salvage logs no longer append `error.message` (can echo prompt fragments). Audit IP writes
  not touched.

  **Broken mobile routes recorded in §8, not fixed:** `PATCH /users/me`,
  `POST /cover-letters/:id/generate`, `POST /users/:uid/photo` — file + correct API path
  each. (Export URL mismatch added 2026-08-19 as item 4 in the same §8 list.)

  **MC8.** This entry; `CLIENT_REQUIREMENTS.md` J.4 ticked, J.3 narrowed, J.5 still ◐
  (IP family); `ARCHITECTURE_MAP.md` write-body DTO note.

  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing next/image warnings only) · api type-check ✓ · web type-check ✓ ·
  **api 514/514** (was 470) · **web 300/300** including locale parity, no-hardcoded-English,
  and key resolution. No new user-facing `t()` strings.

- 2026-08-19 — **Navy chrome + in-app warnings (legal §§18–21 / B.12 + header/footer navy).**
  **Committed.** Web only. Mobile out — see §8 **Mobile localisation gap** (item 3).
  Auth, billing, and data shape untouched. `/exports/record` unchanged.

  **MC2 — light-mode navy chrome.** One token, not a scale: `chrome: '#1e3a5f'` in
  `apps/web/tailwind.config.ts` (Classic CV / cover-letter default). Surfaces: public `Navbar`,
  public `Footer`, shared `TopBar` (dashboard/admin/CRM headers follow TopBar). **Light mode
  only.** Dark mode keeps today's near-black (`Navbar` `stone-950/70`, `TopBar` `stone-900`,
  `Footer` `stone-900`). **Not** sidebars, auth panel, admin/CRM footers, Footer grid, or the
  dashboard copyright strip in `DashboardShell`. Logo on those bars is always
  `variant="on-dark"` (auto would put navy ink on navy). Body and links: `stone-300`; hover:
  `brand-400` (not `brand-600`); headings: white; PoweredBy on chrome: `tone="dark"`
  (`stone-300` / `stone-200`). **WCAG 2.1 contrast on `#1e3a5f` (acceptance criteria, measured):**
  white headings **11.50:1**; stone-300 body/links **7.72:1**; stone-200 PoweredBy brand
  **9.16:1**; brand-400 hover **5.08:1** — all AA. stone-500 (2.40:1), stone-600 (1.51:1),
  brand-600 (3.23:1) fail and must not be used on chrome. Gate:
  `apps/web/src/lib/chrome-contrast.test.ts`. Opaque logo rectangle recorded as a **standing
  client request** in §8 (transparent SVGs at matched proportions).

  **MC3–MC5 — in-app warnings, client wording verbatim in EN, product UI × 6.** Shared
  `InAppWarning` (`role="note"`). §18 support email omitted (already in footer, contact, every
  legal document). Keys `in_app_warnings.{ai,ats,cover_letter,export_title,export_body}`.
  - §18 AI: `AISummaryModal`, `InterviewPrepModal`, `LinkedInModal` (kept visible on results).
    Not ATS, not cover-letter generate, not resume import.
  - §19 ATS: `ATSCheckModal` only (kept visible on score results).
  - §20 Cover letter: `cover-letters/new` near generate; editor slim row under the toolbar
    (near AI Improve). Existing `ai_improve_confirm_*` replace-confirm modal kept.

  **MC6 — export: passive notice, not a blocking gate.** Client's own wording is "consider
  showing." Full title + body in the CV `EditorToolbar` export menu and the cover-letter
  editor export menu (widened from `w-44`). No second click. A modal after `/exports/record`
  would steal Free's 2-export lifetime on Cancel because record currently runs **before**
  the file is built.

  **MC7.** This entry; `CLIENT_REQUIREMENTS.md` B.12 ticked and the navy-header line closed;
  `ARCHITECTURE_MAP.md` §4 chrome note. Logo defect + mobile gap live in §8, not scattered.

  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit` ✓
  · api **470/470** · web **300/300** (vitest `--pool=threads --no-file-parallelism`;
  +5 `chrome-contrast` vs the 295 of the usage-counters batch). All six i18n
  gates green (parity, untranslated, keys-resolve, no-hardcoded-english, encoding,
  allowance-copy). **Committed.**

- 2026-08-19 — **Usage counters: creation-based, not storage-based. Q-2 closed as (a′).**
  **Committed.**

  **Client instruction (verbatim):** "Do not refund an allowance when a user deletes a document.
  Limits count CREATIONS during the cycle, not documents currently stored."

  **What a Free user now experiences (client-instructed and intended):** create 5 CVs, delete all
  5, and they can never create another on the Free plan. Same for the single cover letter.

  Successful create/import/duplicate still consumes. Failed cover-letter **generation** still
  refunds via `rollbackFailedCreate`. Exports and AI credits unchanged. No backfill — existing
  counters stop decreasing on delete; nobody loses a document they have.

  - **MC1.** `cv.service.ts` delete: removed `incrementUsage(..., 'cvsCreated', -1)`. Soft-delete,
    public-slug revoke, `updatedAt` stay.
  - **MC2.** `cover-letter.service.ts` delete: removed the matching decrement. **Kept** the
    failed-create refund at `rollbackFailedCreate`.
  - **MC3.** Tests: delete does not call `incrementUsage(..., -1)`; Free at `cvsCreated: 5`
    deleting all 5 still cannot `create` (mutable counter); same for one cover letter; failed-AI
    +1 then −1 kept; public-slug-on-delete kept.
  - **MC4.** `UsageResetService` zeros `usage.cvsCreated` and `usage.coverLettersCreated` for
    **paid** users only. Free skip (no write) unchanged.
  - **MC5.** Copy × 6. **Priority:** `upgrade_modal.reasons.cvs.description` and
    `.cover_letters.description` no longer tell anyone to "delete one you no longer need" — that
    string does not survive in any locale. `faq.a1` cadence: Free never resets; Pro CVs/letters/AI
    `/month`. `PLAN_CONFIGS` Pro `'10 CVs/month'` / `'20 Cover Letters/month'`; Career 25/50.
    Billing comparison appends `/month` for paid CVs/letters only. `billing.usage.coverLetters` →
    "Cover Letters Created". Guard: `apps/web/src/i18n/allowance-copy.test.ts`.
  - **MC6.** Display already used stored `usage.cvsCreated` / `coverLettersCreated`. No
    display-source change.
  - **MC7.** List-delete dialogs: always "Deleting it does **not restore** a creation" (not
    "deleting spends one"). Extra line when remaining === 0. Web CV list and cover-letter list
    (`useAuth` + `PLAN_CONFIGS` added on cover letters). **Mobile:** English `Alert.alert` only —
    see §8 **Mobile localisation gap** (items 1–2). Not warned: editor section delete,
    account delete, jobs/CRM.
  - **MC8.** This entry; `ARCHITECTURE_MAP.md` §10 rewritten; `CLIENT_REQUIREMENTS.md` Q-2
    closed, E.4 done, F.3 note that CVs/letters now reset for paid only.

  **Not this batch:** `refundAiCredit`, export counters, Batch G, auth/billing data shape
  beyond these usage fields.

  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit` ✓
  · api **470/470** · web **295/295** (vitest `--pool=threads --no-file-parallelism`;
  first full run worker-timed-out on Batch H's `register-legal.test.tsx` — 3 tests,
  unrelated; retry 3/3. All five i18n gates green; new `allowance-copy` gate green).
  **Committed.**

- 2026-08-18 — **Batch H — legal acceptance at signup (option A, grandfather existing users).**
  Client package §§ 7, 8, 10, 24. **Committed.** Web only. Do not touch Batch G's
  gates. Modal **before** Firebase Auth for email/password **and** Google on
  `/register`. Cancel leaves **nothing** — no Auth user (the option-B failure
  mode has an explicit test). Login-page Google is unchanged (no modal).
  **Collection:** `legalAcceptances/{uid}` — doc-id get/set, no where-query, no
  composite index. Email is a stored field by client schema; **never logged**.
  uid and email stamped from the verified token. POST `/legal/acceptances`
  (FirebaseAuthGuard); GET `/legal/acceptances/me` returns `{ acceptance }` or
  `null` (missing is not a 404 / not a lockout). GDPR export includes this
  user's row only.
  **Grandfather:** missing record → no prompt. `treatMissingAsStale` default
  **off** and not flipped. Existing users sign in, open the dashboard, and use
  existing documents (tested). DashboardShell has no legal gate.
  **Write failure after Auth success:** retry in session
  (`flacroncv_pending_legal_acceptance`); **never delete the account**; never
  treat that crash as an existing/grandfathered user while the flag is set.
  **Privacy version:** `privacyVersion` is stamped from `LEGAL_VERSION_MAP`
  (`2026-08-16`) even though the live privacy **body** is still locale JSON
  (B.1 blocked). Recorded version and published body will not match until B.1
  — deliberate gap, not a bug.
  **Re-consent:** `needsAcceptance()` compares stored versions to the map. Do
  not bump versions this batch; do not show the modal to existing users.
  **H.6:** `legalAcceptances/{uid}` is now the second deferred erasure
  obligation, kept with Batch G's `users.abuse` + lookup collections in **§8
  (one list)**.
  **Not this batch:** B.12 in-app disclaimers; H.5 (already G part 2's
  consumption gate); B.1 Privacy page; G gates; mobile register.
  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit`
  ✓ · api **466/466** · web **293/293** (vitest `--pool=threads --no-file-parallelism`;
  all five i18n gates green).
  **Committed.**

- 2026-08-18 — **Batch G part 2 — Free-grant enforcement (kill switch default off).** Client
  review §§ 3, 4, 5, 6, 10, 11, 12, 13, 23. **Committed.** Highest-risk batch: this
  refuses the Free allowance, not the account. Ambiguous cases allow.
  **G2-1 kill switch FIRST, alone:** `app_settings/main.abuse.enforcementEnabled`.
  Default **false**. Missing/false = observe-only (part 1). Settings-read failure **fails
  open**. Cache **15s**. Missing HMAC still cannot deny.
  **G2-2 weights — do not restore part 1 numbers.** They were observe-only and would deny
  a second person on a family PC (client §4). Test: same device, different verified
  emails → **verify / pending_step_up, not deny**. Three housemates (one IP, three
  devices) still **allow**. Empty UA is **not** bot.

  | Signal | Part 1 (observe) | Part 2 (enforce) | Why |
  |---|---|---|---|
  | identity_received_free | 80 (deny alone) | **55** (verify) | Second person on a shared laptop must not be denied |
  | multiple_accounts_device | 45, **stacked** with identity → 125 | **25**, **do not stack** with identity | Same fact counted twice auto-denied families |
  | bot_activity | 50, empty UA fired | **20**, only curl/wget/python-requests; empty UA does **not** fire | Privacy browsers omit UA |
  | repeat_create_delete | 40 | **25** | Plus multiple was 85 = deny |
  | network_burst / ipAloneMax | 35 / clamp 39 | unchanged | Three-housemates must still pass |
  | disposable_email | 25 | unchanged | Alone stays allow |
  | vpn_datacenter | 0 | 0 | No dataset |

  **G2-3 grant:** `grantStatus` eligible / pending_step_up / blocked / granted. Denied
  users keep sign-in, email verification, dashboard, support, and can pay. Paid
  entitlements ignore the grant block. Device `receivedFree` is **not** set on a
  blocked grant. CRM **Release Free grant** + audit (`ABUSE_FREE_GRANT_RELEASED`:
  actorId, time, target uid — never email/IP/token).
  **G2-4 email:** new Free consumption only (create CV/letter, AI). Existing docs stay
  readable, editable, **exportable**. `admin.auth.getUser` is source of truth for token
  lag. Auth lookup failure fails open. Grandfather: usage already > 0 keeps those
  files; must verify before **new** creates.
  **G2-5 step-up:** 12h cooldown (`stepUpCooldownHours`) then auto `eligible`. No second
  score.
  **G2-6 rate limits:** **no tight throttle on `/auth/verify`**. New user creates per
  hashed network **10/hour** (enforcement on only). Per-uid create 20 / AI 30 / export
  20 per 15 min. 429 ≠ grant deny. Fail open on store errors.
  **G2-7 idempotency:** `Idempotency-Key` on `POST /ai/*` and cover-letter
  `:id/ai/generate` only. Firestore `abuse_idempotency/{uid:key}`, ~15 min. Invalid
  key runs the work.
  **G2-8 analytics:** `track()` codes only (`abuse_grant_blocked`, `abuse_step_up`,
  `abuse_email_unverified`, `abuse_rate_limited`). Consent-gated. Never email/IP/token.
  **G.5 App Check: still open. Do not install.** Console setup required.
  **H.6 erasure** — see §8 (one list): Batch G collections **and** (as of Batch H)
  `legalAcceptances/{uid}`.
  **Operator watch — first week after flipping `enforcementEnabled` to true:**
  1. Share of **new** registrations with `grantStatus=blocked` vs `pending_step_up` vs
     `eligible`. A family PC should be step-up, not blocked.
  2. Count of CRM **Release Free grant** actions. Many releases = the scorer is
     catching real households.
  3. Support tickets about not being able to create a CV / use Free after a normal
     verified signup.
  4. Structured logs `Free consumption denied uid=… code=…` (codes only).
  **Flip it back to false immediately when this signal appears:** new accounts that
  have a **different verified email**, a **browser UA** (not curl/wget/python-requests),
  **no disposable domain**, and **no repeat create/delete**, whose firing signals are
  only `identity_received_free` and/or `multiple_accounts_device`, landing in
  **`blocked`** (deny ≥ 70) instead of **`pending_step_up`**. That is the family-PC /
  §4 case. If `identity_received_free` alone is ever ≥ 70, the part-1 weight of 80
  was restored — turn enforcement off and restore 55. A jump in staff Release
  actions for those same accounts is the same signal in human form.
  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` warnings only) · api `tsc --noEmit` ✓ · web `tsc --noEmit`
  ✓ · api **451/451** · web **274/274** (vitest `--pool=threads --no-file-parallelism`;
  all five i18n gates green).
  **Committed.**

- 2026-08-18 — **Batch G part 1 — abuse signals and risk scoring (no enforcement).**
  Client review §§ 3, 4, 5, 6, 10, 11, 12, 13, 23. **Committed.** Signup
  behaviour is unchanged: nothing denies, nothing blocks, Free allowance
  unchanged, existing users unaffected. No App Check / Turnstile / GeoIP
  dependency. No `apps/api/package.json` or lockfile change.
  **Correction recorded:** the 2026-07-20 deferred item (a) calling cancel→resubscribe
  a “live revenue leak” is **wrong**. Stripe `subscriptions.list(status=all)`
  already fails closed. `hasUsedTrial` is defence-in-depth only; **no backfill
  was run and none should be commissioned on that old premise.**
  **MC1 device:** 128-bit random token (web cookie+localStorage; mobile
  SecureStore key **not** in `clearAll`). HMAC-SHA256 server-side
  (`ABUSE_HMAC_SECRET`). Survives logout. **Does not survive** clearing cookies
  and localStorage together, incognito / a fresh profile, another browser, or
  another machine. No canvas fingerprint, no evercookie.
  **MC2:** hashed IP (IPv6 /64 as network hash). Never stored raw next to a uid
  on `users`.
  **MC3:** `users/{uid}.abuse` + `abuse_devices/{hash}` + `abuse_networks/{hash}`.
  No parallel usage ledger. Lookups are doc-id gets — **no new composite index.**
  **MC4–MC6:** scorer reads `app_settings/main.abuse` (code defaults if missing).
  VPN/datacenter weight **0**. Disposable domain list in-repo. Network-burst-only
  clamped to ≤39. Test: three accounts, one IP, three devices → all `allow`.
  **MC7:** score recorded on registration, logged (uid + score + band + signal
  codes; never raw IP/token/email), surfaced on CRM user detail. GDPR export
  includes this user’s abuse fields; a test asserts no uid but the requester’s.
  **MC8:** `subscription.hasUsedTrial` never-cleared, consulted **in addition to**
  the Stripe list. Missing `ABUSE_HMAC_SECRET` fails **soft** (user created,
  scoring skipped, warning, no values).
  **Open, not fixed:** raw IP already in `audit_logs` via
  `auth.controller.ts:32-36`. H.6 erasure — see §8 (one list).
  **Bot protection:** Firebase App Check recommended for a later part; nothing
  installed.
  **G.5 / G.8 / G.10 / generation-export throttles:** not this part.
  **QA:** `pnpm --filter api lint` 0 errors · `pnpm --filter web lint` 0 errors
  (pre-existing `<img>` / mobile unused-var warnings only) · api `tsc --noEmit`
  ✓ · web `tsc --noEmit` ✓ · api **419/419** · web **274/274** (vitest
  `--pool=threads --no-file-parallelism`; all five i18n gates green).

- 2026-08-18 — **Batch B — legal & contact (MC2–MC13 minus Privacy).** Client
  package applied. **Committed.** Privacy `/privacy-policy` is **not**
  replaced — MC1 waits until the client names **AWS SES** and **OpenAI** in §4.
  `subprocessor-disclosure.spec.ts` still reads `privacy.s3_desc` in locale JSON.
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings
  only) · `pnpm type-check` ✓ · `pnpm test` ✓ — web 274/274 (vitest
  `--pool=threads`; forks pool timed out on this machine as before), api
  390/390, all five i18n gates green.**
  **Cookie §2 bullet “Support marketing where permitted” held** pending the
  client; §6 Marketing omitted; Marketing omitted from §7 and the §9 toggles;
  original numbering kept (1–5, skip 6, 7–14).
  **Architecture:** legal bodies live in `apps/web/src/legal/*.ts` (English).
  Chrome (`legal.last_updated`, TOC, Back to top, footer labels, contact UI)
  stays in `t()` × 6. Controlling-version sentence is a module constant, not a
  JSX literal and not 200 allowlist entries.
  **Routes kept:** `/privacy-policy`, `/terms-of-service`, `/contact-us` (client
  checklist says `/privacy`, `/terms`, `/contact` — mismatch recorded; existing
  links and sitemap locs not broken for a naming preference). New:
  `/disclaimer`, `/refund-policy`.
  **MC11:** customer-facing `support@` / `privacy@` / `billing@` /
  `legal@flacroncv.com` → `contact@flacroncv.com`, including FAQ, settings
  delete modal, remaining privacy JSON, and `CONTACT_EMAIL` last fallback.
  **`SES_FROM_EMAIL` / `SES_FROM_NAME` untouched.** `SES_REPLY_TO` default
  untouched.
  **Recorded, not a blocker — deletion:** the live privacy text distinguished
  deactivation (settings) from erasure on request to `privacy@`. Client §10 is
  weaker but not false. That clarity is lost when MC1 lands; raise with the
  client later.
  **Recorded — Privacy §1.9 vs Batch G:** ~~the new policy discloses hashed
  device and IP identifiers that G has not built.~~ **Satisfied 2026-08-19.**
  G parts 1 and 2 have shipped; the hashed device/IP disclosure matches the
  live practice. Publishing Privacy still waits on B.1 (subprocessors).
  **Not built:** B.1 Privacy page; B.12 in-app AI/ATS/cover-letter/export
  disclaimers; Batch H acceptance modal / `legalAcceptances`.
  - **MC2.** `/terms-of-service` — client Terms, 30 sections, English module.
  - **MC3.** New `/disclaimer`.
  - **MC4.** New `/refund-policy`, 15 sections.
  - **MC5.** `/cookie-policy` replaced with the holds above.
  - **MC6.** Shared `LegalDocumentView`: max 1000px, `Logo` `h-20`, light/dark,
    orange heading/link/button accents, `text-base` body, desktop TOC, Last
    Updated, Back to Top (respects `prefers-reduced-motion`).
  - **MC7.** `/contact-us` copy + 26-option category dropdown, success/error
    states; UI via `t()`.
  - **MC8.** `POST /contact` keeps throttle 5/min + HTML escape; optional
    `accountEmail` / `plan` / `userId` / `timestamp`; unknown category still
    `general`. `CONTACT_EMAIL` last fallback `contact@flacroncv.com`.
  - **MC9.** Footer Legal column adds Disclaimer and Refund Policy.
  - **MC10.** Sitemap: localized paths keep 6-locale hreflang; English legal
    bodies emit one `en` loc with hreflang `en` + `x-default` only. Pages still
    serve `/ar/terms-of-service` for RTL chrome. Canonical via
    `englishDocumentAlternates()`. Privacy and contact unchanged (6 locales).
  - **MC12.** `LEGAL_VERSION_MAP` records `2026-08-16`. Privacy marked
    `pending-client-subprocessors` / live source locale JSON.
- 2026-08-18 — **Batch E — plan configuration.** Client answers applied. **Committed.**
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings only) ·
  `pnpm type-check` ✓ · `pnpm test` ✓ — web 264/264 (vitest `--pool=threads`; forks pool
  timed out on this machine as before), api 387/387, all five i18n gates green.**
  **Currency (recorded, not changed):** checkout does not pin currency or country; Stripe infers
  location. A Lithuania test session presented **€26.94/month** against advertised **$29.99**.
  Advertising USD and charging a converted amount is a **client decision**.
  **Q-4 is a launch blocker:** yearly price ids exist in config and the allowlist already admits
  them when `YEARLY_BILLING_ENABLED` is on, but **`interval=year` is UNVERIFIED**. The client must
  run `apps/api/scripts/verify-yearly-prices.mjs` (not run here — it reaches Stripe). This codebase
  once billed a monthly interval against a yearly price.
  - **MC1 — confirm.** Shared-types already has Pro $299.99/yr and Enterprise $999.99/yr. Mobile
    `PLAN_CONFIGS` now wraps shared-types (relative import, no lockfile change). Dead
    `AWDS7HwRCx` ids removed. Dashboard CTA reads `priceMonthly`. Yearly badge uses
    `yearlySavingsPercent`.
  - **MC2 — comment only.** `allowedCheckoutPriceIds()` already admitted yearly ids under the flag.
    Header comment rewritten so it no longer claims “monthly only”. Allowlist not removed.
  - **MC3.** Deleted dead `pricing.save` (“Save 33%”) from all six locales. Live badge remains
    `yearlySavingsPercent`.
  - **MC4.** JSON-LD `softwareApplication` offers iterate `customerFacingPlans()`. Career
    Accelerator stays in CRM grant. Filling `stripePriceIdMonthly` auto-launches it on every
    customer-facing surface.
  - **MC5 — revenue.** `createCheckoutSession` attaches `trial_period_days` only for **Pro**.
    Spec: Enterprise first-time checkout has no `subscription_data` and does not call
    `subscriptions.list`. Billing + public pricing: Pro keeps “Start {days}-day free trial”;
    Enterprise “Choose Enterprise”.
  - **MC6.** Billing Pro card shows `trial_disclosure` (amounts from `PLAN_CONFIGS`, both
    intervals, six locales). No Stripe `custom_text`.
  - **MC7.** Comparison cells read `PLAN_CONFIGS[plan].limits`; header and body still share `plans`.
  - **MC8.** `faq.a2` dropped “/month” on Free exports × 6. Mobile Free `/month` went away with
    the shared-types wrap.
  - **Not built:** Adaptive Pricing / checkout currency; `crm-settings.planLimits`; Q-2 Pro
    CV/letter monthly reset; extra E.6 comparison rows (PDF/ATS/…); `faq.a1` still says Free
    credits and exports `/month`; JSON-LD FAQ still interpolates Free exports `/month`.

- 2026-08-18 — **Batch F.3 — Free is a one-time allowance.** Client: 5 CVs / 1 letter / 5 AI
  credits / 2 exports total, existing Free users included, **do not zero consumed counters**.
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings only) ·
  `pnpm type-check` ✓ · `pnpm test` ✓ — web 264/264, api 386/386, all five i18n gates green.**
  - **MC1 — `UsageResetService` skips stored Free.** Loop at
    `usage-reset.service.ts` `continue`s when `subscription.plan` is `FREE` (or missing —
    same fallback as before). **No write** — not a rewrite of the same numbers.
    `onApplicationBootstrap` unchanged. Filter is stored plan, not `resolveEffectivePlan`, so a
    `past_due` Pro still resets. Specs: 500/501 batch seeds moved off `free` onto `pro`; a mixed
    Free+Pro test spies `batch.update` and expects `writtenIds === ['pro-1']` (past_due Pro).
  - **MC3 — `?? 5`.** Same path now uses `PLAN_CONFIGS[plan]?.limits?.aiCredits ??
    PLAN_CONFIGS[FREE].limits.aiCredits`.
  - **MC2 — copy, option (b).** Paid `upgrade_modal.reasons.ai_credits` / `exports` unchanged.
    Added `ai_credits_free` / `exports_free` × 6 locales. `UpgradeModal` branches on stored Free
    vs paid; degraded/placeholder accounts keep the paid copy (placeholder always claims Free).
    `PLAN_CONFIGS[FREE].features`: `'5 AI Credits'`, `'2 exports'` (no `/month`). Mobile
    duplicate table not touched.
  - **Missing-plan fallback — cannot count live docs** (no production Firestore read). From
    code: `users.service.ts:101-102` always writes `plan: FREE` on create; Stripe and CRM
    grant use dotted `'subscription.plan'` updates. A paid user is not left without a plan on
    those paths. **Exception, not fixed here:** `apps/api/scripts/seed-qa-accounts.mjs`
    `set({ subscription: { stripeCustomerId } }, { merge: true })` replaces the whole
    `subscription` map (Firestore does not deep-merge nested objects) and can wipe `plan` on a
    QA paid seed. Logged, not built.
  - **Q-2 not implemented.** Client wants Pro CVs/letters to reset monthly; decrement-on-delete
    would then allow 10+10 in a month. Re-asked as (a′)/(b)/(c).
  - **Recorded, not built:** hide Career Accelerator publicly; annual Pro $299.99 / Enterprise
    $999.99 with toggle; 7-day Pro trial with card, Enterprise no trial; Enterprise stays
    individual; Stripe test mode / env keys only; legal English-only with controlling-version
    sentence; three cookie categories; header/footer navy as a separate batch; LinkedIn icon
    stays hidden (URL still `/admin/page-posts/published/`).
  - **Leftover copy, not this batch:** `faq.a2` still says the Free plan includes
    "2 exports/month" (six locales). Mobile `PLAN_CONFIGS` still has `/month` on Free.

- 2026-08-18 — **Removed `apps/api/.zip` from `main` (leaked credentials).** Added in `b56454f`
  as a zip whose only entry was a `.env`. It contained the AWS IAM user `flacronai-ses` access
  key plus other env material. Deleted from the tree and ignored. **Deactivate that IAM key in
  AWS immediately** — removing the file does not revoke it. Same for every other secret in that
  archive. History was rewritten and force-pushed to `main` (`25e6fcd` → `5158a86`).
  GitHub may still serve the old SHA until their GC; ask GitHub Support to purge it.

- 2026-08-18 — **Cleanup batch: untrack backup, drop robots Disallow, cover `t.rich`.**
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings only) ·
  `pnpm type-check` ✓ · `pnpm test` ✓ — web 264/264, api 384/384, all five i18n gates green.**
  - **MC1 — `PROJECT_PROGRESS.backup.md`.** Untracked (`git rm --cached`); file kept on disk;
    added to `.gitignore`. It was a local safety copy committed in `6f4c48a` and does not
    belong in the client's repository.
  - **MC2 — robots.txt vs `noindex`.** Dropped the entire `disallow` list in `robots.ts`.
    Private groups already export `robots: { index: false, follow: false }` on server layouts;
    Disallow blocked the fetch, so a polite crawler never read that directive, while the
    footer Account column still discovered the URLs. Comments updated in `robots.ts`,
    `(dashboard|crm|admin)/layout.tsx`, and `sitemap.ts`. `/forgot-password` comment left:
    it is still not Disallowed, which is why its `noindex, follow` can be read.
  - **MC3 — `keys-resolve` covers `t.rich`.** Call regex is now
    `varName(?:\\.rich)?(` plus a non-vacuity assert that at least one scanned file binds
    a translator and calls `.rich(` on that name. Remaining uncovered forms are listed in
    the test file: `t.markup` / `t.raw`, double-quoted keys, template-literal keys,
    `getTranslations({ locale, namespace })`.
  - **MC4 — `apps/api/package.json` / lockfile (no code).** Settled so this pair is not
    re-investigated. Working tree is clean for both. Diff `5dea269..HEAD` on
    `apps/api/package.json` is **one script**: `"seed:qa": "node scripts/seed-qa-accounts.mjs"`.
    No dependency line changed. `pnpm-lock.yaml` is unchanged over that range.
    `--frozen-lockfile` in `.github/workflows/ci.yml` would **not** break from a scripts-only
    `package.json` change. Local `pnpm install` peer warnings are **not** from that script:
    `apps/mobile` Firebase 10 vs peer `^11.3.0 || ^12.0.0` and `react-dom@18` vs `react@19`;
    `apps/api` deprecations already on `5dea269` (`eslint@8`, `puppeteer@22`, `docx@8`);
    `@nestjs/schedule@^6.1.1` was already there and matches Nest 10. Do not bump or
    regenerate the lockfile from this finding.

- 2026-08-18 — **French `footer.about` + fifth i18n gate.** Stored value only:
  `ì propos` (`U+00EC`) → `À propos` (`U+00C0`) in `fr/common.json`. Navbar and
  footer Company column both read that one key. **Fifth gate built:**
  `apps/web/src/i18n/locale-encoding.test.ts` — strict UTF-8, HTML entities,
  `U+FFFD`, C1 controls, known mojibake sequences, and per-locale alphabet
  non-vacuity (each file's values must contain at least one letter from its
  own alphabet). **No incident denylist** — a one-bug list is not a gate.
  The test file records the remaining hole: a regex cannot tell `cree` from
  `crée`, so this reduces the class and does not close spelling.
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings only) ·
  `pnpm type-check` ✓ · `pnpm test` ✓ — web 263/263, api 384/384, all five i18n gates green.**

- 2026-08-18 — **Locale encoding audit (report only — no string fix yet).** French
  `footer.about` renders "ì propos" in the navbar and the footer Company column
  (one key, two surfaces). The six `common.json` files are **strict UTF-8**, no BOM,
  no `U+FFFD`, no HTML entities, no `Ã©` / `â€™` family. The defect is a single
  wrong character (`U+00EC` ì instead of `U+00C0` À) in an otherwise valid UTF-8
  file; the same file already has the correct "À propos" at `about.title` and
  `parent_company.about_title`. Not a file-wide recode. **Not fixed this entry —
  waiting on approval of the occurrence list.**
  **Proposed fifth gate (not built):** `locale-encoding.test.ts` — fail on HTML
  entities, classic mojibake sequences (`Ã©`, `Ã¨`, `Ã¼`, `Â `, `â€™`, `â€œ`,
  `Ã€`), `U+FFFD`, C1 controls, and a short denylist of known-bad French
  substitutions (`ì propos` / leading `ì`+Latin). Optionally assert each of
  fr/de/es/ar/ur actually contains letters from its alphabet (non-vacuity).
  Missing diacritics in general need a dictionary or a spellchecker — a regex
  cannot honestly do that. The four existing gates cannot catch this class:
  the corrupted string is present, unique vs English, and resolvable.

- 2026-08-18 — **Batch F, option (b) — no `free_grants` table.** Client-approved after the audit:
  a uid-keyed grant cannot survive a new email (new Firebase uid = a new `users/{uid}` with zeros);
  monthly resets of `aiCreditsUsed` / `exportsThisMonth` destroyed the consumption history a
  migration onto a grant table would need; identity (device/IP) belongs in Batch G, and storing
  hashes no consumer reads would be a fourth source of identity with no engine. Same-uid already
  survives cookie/logout/incognito.   **F.3 (who `UsageResetService` resets) is not in this batch**
  — it changes what existing Free users receive, so it waits on confirmation.
  **QA: `pnpm lint` 0 errors (pre-existing `<img>` / mobile unused-var warnings only) ·
  `pnpm type-check` ✓ · `pnpm test` ✓ — web 250/250, api 384/384, all four i18n gates green.**
  - **MC1 / F.4 — billing heading.** Free sees `billing.usage.title_free` ("Free Plan Usage");
    paid keep `billing.usage.title` ("Usage This Month"). Keyed off the page's existing
    `isFreePlan`, not `resolveEffectivePlan` and not the cron, so F.3 is a one-line change of
    *who* gets reset, not a heading rewrite. The Free string names the plan, not a cadence —
    honest today (CVs/letters are slots; AI/exports still monthly) and honest after F.3.
  - **MC2 — seed from config.** `users.service.ts` create path now sets `aiCreditsLimit` from
    `PLAN_CONFIGS[SubscriptionPlan.FREE].limits.aiCredits`. Create-spec asserts against that
    config, not a coincident `5`. Added to / removed from the V1 plan-data list in
    `ARCHITECTURE_MAP.md` §8 Tier 3.
  - **MC3 / F.5 — extend the billing usage card, do not add a second modal.** Epic R already
    covers exhausted + upgrade via `UpgradeModal` (AI, export, CV, cover-letter). This batch
    adds: amber `usage.low` when percentage ≥ 70 and not exhausted (same 70/90 bars as before);
    the existing `billing.upgradeTo` / `upgradeCta('Pro')` control when `remaining === 0` and
    `isFreePlan`. No dashboard change.
  - **Must ship together later:** F.3 and `upgrade_modal.reasons.ai_credits`. That string
    promises credits return "next billing month", which is true for Free today and false the
    moment F.3 lands. Shipping F.3 alone would trade one honesty defect for another. Same
    class, not fixed here: `upgrade_modal.reasons.exports` ("this month");
    `PLAN_CONFIGS[FREE].features` `'5 AI Credits/month'` and `'2 exports/month'` (English
    literals on pricing, billing cards, and the paywall). On the F.3 path:
    `usage-reset.service.ts:94` still has `?? 5`.
  - **`crm-settings.service.ts:8` left untouched.** Third source of plan data (`free: cvsLimit 3,
    coverLettersLimit 2` vs `PLAN_CONFIGS[FREE]` 5 / 1). Still on the V1 audit list and the
    existing delete-or-wire decision in §8. Do not grow a third table.
  - **Not this batch:** F.3 cron split, F.6, F.7, device/IP hashes, `UsageResetService`.

- 2026-08-18 — **Batch D remainder: SEO and metadata.** Client review "the SEO also needs to be
  fixed." Audit first (against production, not just source), then MC1–MC7.
  **QA: `pnpm lint` 0 errors (only the 7 pre-existing `<img>` warnings) · `pnpm type-check` ✓ ·
  `pnpm test` ✓ — web 250/250, api 384/384, all four i18n gates green.**
  - **MC1 — canonical host.** `seo.ts` fallback is now `https://www.flacroncv.com`. Production was
    observed emitting the apex on every canonical, hreflang, `og:url`, sitemap `<loc>` and the
    robots `Sitemap:` line, while the apex answers **302** to www. **Half the fix:**
    `NEXT_PUBLIC_SITE_URL` must ALSO be set to the www host on the deploy platform. It is
    `NEXT_PUBLIC_*`, so it needs a **rebuild, not a redeploy**. The Dockerfile/ECS path fails the
    build if it is missing; **the live Amplify path has no equivalent guard.** Guarded by
    `apps/web/src/lib/seo.test.ts`.
  - **MC2 — auth metadata.** `/login` and `/register` are indexable with localized
    `generateMetadata` (existing `auth.*` keys, no new strings). `/forgot-password` and
    `/verify-email` are `noindex, follow`. **No robots.txt Disallow for the auth group** — a
    Disallow would prevent the fetch, so the directives would never be read.
  - **MC3 — private routes.** `robots.ts` trailing slashes dropped so `/*/cv` matches `/en/cv`;
    `/jobs` and `/support` added. Dashboard, CRM and admin layouts split into a server wrapper
    exporting `robots: { index: false, follow: false }` and a client shell. Sign-in redirect and
    admin/super_admin role gate moved verbatim — see the implementation report. **Runtime redirect
    behaviour was not verified in a browser.**
  - **MC4 — FAQ JSON-LD reads PLAN_CONFIGS.** No restated numbers in the builder; guarded by
    `json-ld.test.ts`. The **visible** FAQ at `faq.a1` still restates the same numbers in locale
    JSON — out of scope, recorded in the V1 audit list.
  - **MC5 — sitemap.** `x-default` added so it agrees with the pages. `lastmod` dropped: a
    build-time date on all 48 URLs is a false claim. Upgrade path (a per-path revision map) is
    named in the file. `/disclaimer` and `/refund-policy` not added — they do not exist yet.
  - **MC6 — `/confirm` and 404.** Two new `lead_confirm.meta_*` keys × 6 locales. 404 gained an
    `<h1>` (was a `<p>`) and `noindex`. `/confirm` is `noindex, follow: false`.
  - **MC7 — JSON-LD.** SoftwareApplication + BreadcrumbList. Organization/WebSite scoped to
    public routes and the homepage, no longer injected on dashboard/CRM/admin.
    **`aggregateRating` is a deliberate omission:** we have no real reviews (testimonials are
    hidden until we do), and inventing a rating is a Google policy violation and the watermark
    defect class. Do not add one later thinking it was an oversight.
  - **Homepage `generateMetadata` is still English-only** and still hand-rolled rather than
    going through `pageMetadata()`. Not converted in this batch: it already had full metadata,
    and folding it in would drop its extra `keywords` and collapse two slightly different OG
    descriptions. Flagged, not fixed.
  - **i18n:** `t.rich` remains outside `keys-resolve` (matches `t('…')` only). Flagged in the
    test file and in `CLIENT_REQUIREMENTS.md`.

- 2026-08-18 — **Batch C: cookie consent — three categories that actually gate something.**
  Client legal package §9 → C.1–C.4, preceded by two standalone micro-changes.
  **QA: `pnpm lint` 0 errors (only the 7 pre-existing `<img>` warnings) · `pnpm type-check` ✓ ·
  `pnpm test` ✓ — web 233/233, api 384/384, all four i18n gates green.**
  - **MC0a — the `keys-resolve` gate now covers server components.** It bound only
    `useTranslations`, so every `await getTranslations(…)` component was invisible to the one gate
    that catches a key missing from **all six** locales — the four legal pages, the auth layout,
    `not-found`, and more: **ten files, previously unchecked.** Widening it revealed **no missing
    keys**, which is the good outcome but also the dangerous one, because a pattern that matches
    nothing passes identically. So non-vacuity is now asserted: a third test fails if fewer than
    five files bind a translator via `getTranslations`, and the regex is a single `BINDING` const
    shared by the scan and both guards, so it cannot be narrowed in one place and stay green. The
    object form `getTranslations({locale, namespace})` is still unchecked — it is used for metadata,
    and binding it needs scope analysis a regex cannot do honestly. Documented in the file.
  - **MC0b — E.10 done.** Deleted `'Watermark on PDF'` from the mobile FREE plan's features
    (`apps/mobile/src/types/subscription.types.ts`). Claim removed; nothing built. The rest of the
    mobile duplicate-config divergence still stands (§8).
  - **🔴 THREE CATEGORIES, NOT FOUR — a deliberate deviation from the client's package.** The
    package specifies Marketing ("permitted advertising, attribution, and campaign measurement").
    **No advertising, pixel, attribution, or campaign technology exists anywhere in the product**,
    so that toggle would have controlled nothing — the identical defect to E.10's watermark: a
    published promise with no mechanism. The live `/cookie-policy` documents exactly three
    categories, and its Preference examples ("language selection, dark/light mode, sidebar state")
    match precisely what the new Preferences toggle gates, so three keeps code and published policy
    in agreement. Client-approved, on the authority of their own Cookie Policy §7 and §6. Tracked as
    **Q-12**. When a marketing technology arrives: add the category, gate it, update the policy in
    the same change.
  - **C.4 is the load-bearing part. What each category now gates, verified by inventory** of every
    `localStorage` / `sessionStorage` / `document.cookie` write in `apps/web/src`:
    **Preferences** → `theme`, `flacroncv_locale`, `flacroncv_sidebar_collapsed`, listed as
    `PREFERENCE_STORAGE_KEYS` in one place and enforced at all three write sites
    (`ThemeProvider`, `LanguageSwitcher`, dashboard layout). Denying **deletes** them — otherwise
    "reject" would only mean "stop adding more". **Analytics** → the GA4 script load and its
    cookies, via the existing `setAnalyticsConsent()`. **Strictly Necessary** keeps auth session,
    the OAuth-error and in-flight-draft `sessionStorage`, **the CV editor's local crash backup**,
    and the pending-template hand-off — the last two are judgement calls, recorded as such: they
    are storage strictly necessary to a service the user explicitly requested, and gating a
    data-loss backup behind a cosmetic toggle would be the wrong trade.
  - **Migration: re-prompt once, nothing inherited (client decision).** v1 stored the bare strings
    `'accepted'`/`'declined'` under the same key. A v1 value now reads as **undecided**: that banner
    asked only about analytics, so it cannot carry specific, informed consent for Preferences, and a
    previous "accept" must not survive as a **pre-ticked default** — pre-ticking is exactly what
    invalidates consent. The record is versioned JSON (`{v:2, preferences, analytics, ts}`) and
    **fails closed**: anything that is not literally `true` is a denial, so a corrupt or hand-edited
    record grants nothing.
  - **⚠️ The subtle bug this batch had to close.** `analytics.ts` owns a **separate**
    `analytics_consent` key and trusts it at import time. A visitor from the old banner still holds
    `'1'` there while holding no current decision — so GA4 would have loaded and sent a page view
    **before the re-prompt was answered**, in the one batch that is about consent.
    `syncConsentOnLoad()` reconciles the two, called as the **first** effect in `AnalyticsProvider`
    (effects run in declaration order, so it lands ahead of that component's page view).
  - **Rejection is not de-emphasised, structurally.** "Accept All" and "Reject Non-Essential" share
    one `decisiveButtonClass` constant in both the banner and the panel — they cannot drift apart
    without someone deliberately splitting it. "Manage Preferences" is the quiet one, which the
    requirement permits.
  - **Files:** new `apps/web/src/lib/consent.ts` (record, migration, gate, enforcement — framework-
    free and unit-tested, **12 new tests**) and `consent.test.ts`; `CookieConsent.tsx` rewritten
    (banner + preference centre, reusing the existing `Modal` for the focus trap and Escape
    handling, so no new a11y code and no new `close` key); the three preference write sites;
    `AnalyticsProvider.tsx`; the persistent control added to the landing footer's Legal column and
    the dashboard footer strip (extended, not restructured).
  - **i18n:** the `cookie_consent` namespace went 5 keys → 15, plus `footer.cookie_preferences`,
    genuinely translated across all six locales. Banner body and all three category descriptions are
    the **client's own wording**. The body is a single `t.rich` unit with `<cookies>`/`<privacy>`
    tags so the sentence stays one translatable string instead of being spliced per locale — this is
    the repo's **first** use of `t.rich`, and note `keys-resolve` matches `t('…')` only, so rich keys
    are outside it (verified by hand across all six). Retired `accept`, `decline`, `learn_more`; the
    gate caught all three references the moment the keys went, which is the gate working. Switch
    knobs are positioned by **flex alignment, not transforms**, so they move to the correct edge in
    RTL with no direction-specific classes. **No new allowlist entries in any gate.**
  - **Not verified by me:** RTL, dark mode, breakpoints, and the browser-level behaviour (cookie and
    request absence in DevTools) — no dev server was run. Left to eyeball.
  - **C.5 filed, not built:** client legal §12 asks for recognised browser privacy signals (Global
    Privacy Control). Nothing reads `navigator.globalPrivacyControl` or `Sec-GPC`. Its own
    micro-change, and it needs a precedence decision when GPC and a saved choice disagree.

- 2026-08-18 — **Batch D (partial): footer rebuild, social links, © sweep, "Powered by Flacron
  Engine".** Client review §53–57 → D.4–D.7. Six micro-changes, gated after each.
  **QA: `pnpm lint` 0 errors (3/3 packages) · `pnpm type-check` 3/3 ✓ · `pnpm test` ✓ —
  web 220/220, api 384/384, all four i18n gates green.**
  - **D.4 Footer rebuilt** (`apps/web/src/components/landing/Footer.tsx`, rendered by the
    `(public)` layout). Brand column + **Product / Company / Legal / Account**, then a
    contact block (postal address, `tel:` link, `mailto:`) and a parent-company block, then a
    bottom bar. Grid went `md:grid-cols-4` → `sm:grid-cols-2 lg:grid-cols-5`; `NewsletterSignup`
    untouched. Account links are **static** (client decision): a signed-out visitor following
    Dashboard or Billing is redirected to sign-in, which is the normal flow, and making the column
    auth-aware would pull the auth provider into a public layout for no real gain.
  - **D.5 Social links** — new `apps/web/src/components/shared/SocialLinks.tsx`: Pinterest, X,
    Bluesky, YouTube, TikTok, Instagram (all parent-company accounts), each
    `target="_blank" rel="noopener noreferrer"` with a translated `aria-label`.
    **LinkedIn deliberately omitted** — the supplied URL was `/admin/dashboard/`, a login wall
    for visitors; TODO in the file points at Q-7.
    **Deviation from plan, flagged:** these render as **text links, not brand icons**.
    `lucide-react` 0.309 ships none of Pinterest, TikTok, Bluesky or the current X mark, and no
    dependency could be added, so the alternative was hand-drawn approximations of six registered
    marks. An approximated logo is worse than a word. TODO in the file; swap when the official
    SVGs arrive.
  - **D.6 © sweep.** Was in three places, two of them fine and one wrong. Now: the landing footer
    (already translated), the **auth panel — which had `All rights reserved.` hardcoded in English
    despite `footer.rights` existing** (this closes the open LOW at `AUDIT_OPEN_FINDINGS.md:215`,
    and needed a second `getTranslations('footer')` because the layout's `t` is bound to `auth`),
    the **dashboard layout — which had no copyright at all** (this is also how billing gets one,
    since that page lives in this layout), and the email shell. Admin and CRM layouts were out of
    the client's list and are untouched.
  - **D.7 "Powered by Flacron Engine"** — new `apps/web/src/components/shared/PoweredBy.tsx`,
    used by all three layouts, with a `tone="dark"` variant for the auth panel's near-black
    background. Quieter than the copyright beside it (prefix one step down in colour) while the
    brand keeps enough contrast to read as a link. **`FLACRON_ENGINE_URL` lives in that one file**
    with a TODO — interim target is the parent-company site, so the link is never a dead `#`.
  - **Email footer is English-only, deliberately** (`mail.service.ts`). The API has no next-intl,
    so **brand name only, no translatable prose** was added — a brand needs no translation, a
    sentence would. Recorded here so it is not mistaken for an i18n miss.
  - **i18n:** 15 new `footer.*` keys × 6 locales, genuinely translated (not copied English).
    Four values are Latin by design and are now in `locale-untranslated.test.ts` ALLOWED **with
    reasons**: the postal address (must stay deliverable as written), the two literal email
    addresses (precedent: `contact.info_email`), and `Flacron Engine` (brand). **Zero additions
    to the `no-hardcoded-english` allowlist** — that one is capped at 6 entries with 5 used, so
    the components were written to pass it cleanly rather than to be excused from it.
  - **🟠 NEW FINDING — the inverse of a watermark request. Batch E item, NOT actioned.**
    While confirming that generated documents carry no branding (they do not, and adding it was
    dropped from D.6 by client decision — stamping "Powered by" on a CV a user sends to employers
    is damage, not branding), the mobile plan table was confirmed to **advertise a feature the
    product does not have**: `apps/mobile/src/types/subscription.types.ts:37-39` lists
    **`'Watermark on PDF'`** among the FREE plan's features. No watermark exists anywhere in the
    export path. **The fix is deleting the false claim, not building to match it** — building it
    would invent a free-vs-paid differentiator nobody has agreed and change what a Free user
    receives. Sits with the rest of the mobile duplicate-config problem in §8 and
    `ARCHITECTURE_MAP.md` §8; tracked as **E.10** in `CLIENT_REQUIREMENTS.md`.
  - **Test counts now measured, not carried:** web **220**, api **384**, **604 total** — the
    "~410" figure quoted since 2026-07-30 is stale. `ARCHITECTURE_MAP.md` §7 updated.
  - **Not verified by me:** RTL, dark mode and the responsive breakpoints are code-reviewed
    against existing patterns, not seen in a browser — no dev server was run. Left with the
    client to eyeball.

- 2026-08-18 — **Verification pass + documentation refresh (read-only audit; no application code
  touched).** Re-read this record in full against the source to find where the code had moved past
  it, then refreshed the docs only. **No lint/type-check/test run and no application, locale,
  dependency or lockfile change** — this entry documents an audit, not a build. Added `§2A` (AWS
  infrastructure), created `ARCHITECTURE_MAP.md` and `DEPLOYMENT_AND_OPS.md`, and marked the
  corrections below in place rather than deleting them. `PROJECT_PROGRESS.backup.md` was taken
  before editing.

  - **🔴 NEW FINDING — HIGH — `cvsCreated` and `coverLettersCreated` are never reset, for any plan.
    BLOCKED on client confirmation (Q-2). Deliberately NOT fixed.**
    `UsageResetService` writes exactly four fields — `usage.aiCreditsUsed`, `usage.exportsThisMonth`,
    `usage.aiCreditsLimit`, `usage.lastExportReset` (`apps/api/src/modules/users/usage-reset.service.ts:96-102`).
    `cvsCreated` and `coverLettersCreated` are **not** among them, and no other scheduled job touches
    them. **The consequence depends on a mechanism worth stating precisely, because it cuts both
    ways:** these counters *are* decremented on delete — `cv.service.ts:523` and
    `cover-letter.service.ts:274` — so they behave as a **concurrent-slot cap** ("10 CVs stored at
    once, freed by deleting"), **not** as a monthly allowance and **not** as a true lifetime cap. That
    decrement was deliberate and is documented at the call site: without it a FREE user who created
    and deleted their one cover letter "left the user permanently unable to write another"
    (`cover-letter.service.ts:271-273`). **Why it is still a HIGH finding:** a Pro subscriber paying
    monthly gets 10 CV *slots* for the life of the account, not 10 CVs per month. If the plan is ever
    labelled "10 CVs/month" the product under-delivers to paying customers — the **inverse** of the
    abuse problem the client's list is focused on, and the direction that costs trust rather than
    money. The billing page heading already reads "Usage This Month" over these two counters
    (`apps/web/public/locales/*/common.json` → `usage.cvsCreated`, line 740 in all six locales),
    which is the misleading half already shipped.
    **Cannot be resolved without Q-2** (do Pro's 10 CVs / 20 cover letters reset monthly?). The three
    possible answers are three different builds — monthly reset, keep concurrent slots and relabel, or
    a true lifetime cap — and two of them are billing-adjacent. **Affected call sites, for whoever
    picks this up:**
    - *Enforcement (reads the counter against the plan limit):* `apps/api/src/modules/cv/cv.service.ts:146`
      (create), `:291` (import), `:529` (duplicate); `apps/api/src/modules/cover-letter/cover-letter.service.ts:36`,
      `:239`.
    - *Increment:* `cv.service.ts:198`, `:345`, `:569`; `cover-letter.service.ts:79`, `:259`.
    - *Decrement (the slot-refund behaviour above):* `cv.service.ts:523` (delete);
      `cover-letter.service.ts:154` (rollback of a failed AI create), `:274` (delete).
    - *Reset — the gap itself:* `apps/api/src/modules/users/usage-reset.service.ts:96-102`.
    - *Initialised to 0:* `apps/api/src/modules/users/users.service.ts:110-111`.
    - *Displayed to the user:* `apps/web/src/app/[locale]/(dashboard)/dashboard/page.tsx:95-97`,
      `settings/billing/page.tsx:197-206`, `cv/page.tsx:37-38`;
      `apps/web/src/app/[locale]/(crm)/crm/users/page.tsx:355-362`, `crm/users/[id]/page.tsx:196-202`
      and `:456-461`; `apps/mobile/app/(dashboard)/index.tsx:81-87`, `cvs/new.tsx:48`,
      `cover-letters/new.tsx:49`, `apps/mobile/src/lib/utils.ts:39-43`.
    - *Copy:* the `usage.cvsCreated` / month-framed headings in all six locale files.
    **Consequence for the client's list:** `F.3` and `R-4` in `CLIENT_REQUIREMENTS.md` are narrower
    than they read — only `aiCreditsUsed` and `exportsThisMonth` are actually on a monthly reset, so
    only those two need the Free/paid split. Corrected there 2026-08-18.

  - **⚠️ CORRECTED — yearly billing is ENABLED** (`YEARLY_BILLING_ENABLED = true`,
    `packages/shared-types/src/subscription.types.ts:273`). This record said monthly-only with the
    toggle "Coming soon" (§5.1, §6); both bullets are now marked in place. The overcharge is
    structurally prevented by a different mechanism now — server-side price resolution from
    `{plan, interval}` — not by the whitelist alone. `CLIENT_REQUIREMENTS.md` B-5/E.5/R-1 still treat
    it as blocked; Q-4 annotated there.
  - **⚠️ CORRECTED — the trial hole is substantially closed** (`payment.service.ts:204-219` now
    consults Stripe's subscription history and fails closed). The 2026-07-20 deferred item and
    `CLIENT_REQUIREMENTS.md` R-2/G.9 describe it as a live leak needing a production backfill; §5.1
    now carries the correction and the residual gaps.
  - **⚠️ CORRECTED — there are FOUR i18n gates, not three.** This record, `.cursor/rules/flacroncv.mdc`,
    `CLIENT_REQUIREMENTS.md` and the CI comment all say three. The fourth is
    `apps/web/src/i18n/locale-untranslated.test.ts` — it catches a key that exists in all six files but
    whose non-English value is still the English sentence. **This is decisive for the legal-content
    decision (R-3/Q-10):** copying English legal text into all six locales to satisfy parity fails
    *this* gate in five locales at once.
  - **⚠️ CORRECTED — this IS a git repo** (branch `main`). The 2026-07-20 audit entry below reasoned
    "this is NOT a git repo, so deletions are irreversible" and held items back on that basis. The
    historical entry is left exactly as written; the premise no longer holds, so the items it held
    back can be revisited with a normal safety net.
  - **Stale sibling docs, for the next reader:** `RENDER_DEPLOYMENT.md` is a dead path (no
    `render.yaml` exists — see §2A). `FEATURES_COMPLETE.md:66-68` claims Pro has *unlimited* AI
    credits (it is 100) and both it and `IMPLEMENTATION_SUMMARY.md` still describe
    `ui/PageLoader.tsx`, which the 2026-07-20 cleanup deleted. `PRICING_UPDATE.md` carries a secret
    and should go — §8.
  - **Verified as claimed, do not rebuild:** atomic transactional `reserveAiCredit` +
    reserve-before-call / refund-on-failure in `AIService.generate` (`users.service.ts:305`,
    `ai.service.ts:147`, `:184`); the `onApplicationBootstrap` ordering fix and its 19-line rationale
    (`usage-reset.service.ts:24-36`); the health route outside the `api/v1` prefix (`main.ts:143`);
    CORS built from `FRONTEND_URL` + `ADDITIONAL_ORIGINS` (`main.ts:50`); the four-job CI pipeline
    with the `NEXT_PUBLIC_*` build-arg guard.
  - **Left undetermined on purpose:** the cause of the live verification 500 (needs the CloudWatch
    `Internal error details:` line — the filter maps every non-`HttpException` to a bare 500, so
    source reading cannot distinguish a real `MessageRejected` from a Firebase link failure); whether
    the two Stripe yearly ids are truly `interval=year`; and whether `apps/mobile` is ever built.

- 2026-07-30 — **🔴 CI was never running the tests — and had been failing at its FIRST step the whole time.**
  Went to wire the i18n resolution check into CI and found the pipeline itself was the problem.
  **QA: lint 3/3 ✓ · type-check 2/2 ✓ · test 2/2 ✓ (api 293 + web 117) · i18n parity 1,814 × 6 ✓.**
  - **`.github/workflows/ci.yml` had no test job at all.** It ran lint → type-check → build → docker, and
    never executed a single test. **All 410 tests gated nothing**; both suites could go fully red and still
    merge. Several defects this engagement found are precisely the kind a test catches and a type-check
    cannot — a key missing from every locale, an audit row dropped by an `undefined` field, a date filter
    parsed in the wrong timezone. Added a `test` job (builds shared-types first, since the API resolves
    `@flacroncv/shared-types` from its build output) and made `build` depend on it.
  - **`pnpm lint` was FAILING, so CI never got past step one.** `apps/mobile` has had a `lint` script and
    `eslint-config-expo` installed but **no ESLint config file**, so `eslint .` aborted with "couldn't find
    a configuration file". Because the root lint task fans out across the workspace, that one missing file
    failed the whole job — and `build` and `docker` both `needs:` it, so **the entire pipeline has been
    dead**. Confirmed pre-existing: at HEAD the only tracked eslint config in the repo is
    `functions/.eslintrc.js`. Added `apps/mobile/.eslintrc.js`.
  - **🔴 Enabling that lint immediately exposed a broken mobile feature.** `src/hooks/useExport.ts` imports
    `expo-file-system` and uses `FileSystem.cacheDirectory` / `downloadAsync`, but **v19 replaced the flat
    API** with `Paths`/`File`/`Directory` and moved the old one behind the `/legacy` entrypoint. Both were
    `undefined` at runtime: the download path became the literal string `"undefined<filename>"` and the call
    threw — **mobile CV and cover-letter export was broken outright**, with nothing to surface it. Fixed by
    importing `expo-file-system/legacy`. Mobile lint now passes with 0 errors (27 pre-existing style
    warnings left alone under the freeze).
  - **New gate: `apps/web/src/i18n/keys-resolve.test.ts`** — every static `t()` key must exist in
    `en/common.json`. This is the third i18n gate and the only one that catches a key missing from *all six*
    locales (parity compares them to each other; the hardcoded-English test only greps JSX literals). That
    exact gap let 40, then 54, then 11 more keys reach the working tree as raw key paths on screen.
    Building it flushed out **two false-positive classes worth recording**: matching `t*(` by shape also
    caught `track('sign_up')` (the analytics helper), and keying translators by variable name collapsed
    files that declare `t` twice in different scopes. Now binds to the actual `const x = useTranslations(…)`
    declarations and accepts any namespace a name is bound to. **Canary-verified** — injecting a bogus key
    fails the test with file, line, key and namespace.

- 2026-07-30 — **Feature build, tranche 2: §7 CV entry screen, §8 cover-letter AI controls, §10 GDPR data
  export, §12 support internal notes.** 4 parallel agents on disjoint files + an independent verifier each.
  **QA: api tsc ✓ 293/293 · web tsc ✓ 115/115 · i18n parity 1,814 × 6 ✓ · all `t()` keys resolve ✓.**
  - **🔴 CRITICAL, caught by the verify phase: the new data export LEAKED support agents' internal notes to
    the customer.** A textbook parallel-work failure — neither feature was wrong alone. §12 filtered notes
    at the `SupportService` layer ("so no caller can forget it"), but §10's export reads the ticket
    `messages` subcollection **directly** and never goes through that service. Two aggravating details:
    the export's field allowlist **stripped the `internal` flag**, so a note arrived looking exactly like a
    genuine support reply; and `authorName` carried the **agent's real email**, which the reply path
    deliberately hides behind "Support Team". **Fixed** with a fail-closed filter in `readTicketMessages`,
    plus 2 regression tests. **Canary-verified:** with the filter disabled the test fails and prints
    `SECRET_INTERNAL_LIKELY_FRAUD` and `agent@flacroncv.com` inside the customer's download.
    *Lesson worth keeping: a service-layer confidentiality filter is not a boundary if any other module can
    read the same collection directly.*
  - **§10 GDPR data export** — `GET /users/me/export` returns one self-describing JSON document with the
    signed-in user's account, profile, preferences, subscription summary, usage, CVs (+sections), cover
    letters, job applications and support tickets. uid comes from the authenticated principal; Stripe ids,
    staff uids and other users' records are excluded; truncation (if any cap is hit) is stated in `meta`
    rather than silently shipping a partial "complete copy". This closes a live compliance gap — the
    Privacy Policy has promised Right to Access and Portability with **no way to exercise either**.
    **Active sessions: deliberately NOT faked.** Firebase Auth exposes no per-device session list, so
    instead of a fictional table there is an honest **"Sign out of all devices"** (revokes refresh tokens),
    labelled with what it actually does and the ≤1h propagation delay.
  - **§12 Support internal notes** — agent-only commentary, admin/super_admin gated, audit-logged, and
    correctly NOT treated as a customer reply (posting one does not flip the ticket status). Filtered out
    of the customer thread at the service layer *and* now at the export path. Rendered visually distinct
    with an explicit "not visible to the customer" label. **Attachments deliberately not built** — they
    need Firebase Storage (not emulated locally), a virus-scanning decision and a retention policy, which
    the client's own §18 requires ("scanned and securely stored").
  - **§8 Cover-letter AI controls** — tone and length pickers (length maps to both prompt guidance and
    `maxTokens`, clamped by the existing server ceiling) and single-paragraph rewrite. The agent also
    restructured create-with-AI so **the draft is returned to the browser for review and nothing is
    persisted until the user saves** — which satisfies the client's "show the generated text for review
    before saving" and makes the blank-draft class of bug structurally impossible rather than merely
    rolled back.
    **Job-posting-URL auto-extract deliberately NOT built:** fetching a user-supplied URL server-side is an
    SSRF vector (cloud metadata endpoints, internal services). It needs private-IP/DNS blocklisting, no
    redirect following, and size/time caps — a security design, not a half-built feature.
  - **§7 New-CV entry screen** — three real starting points (scratch / import / template) as a proper radio
    group, with selection signalled by more than colour. The import card surfaces the REAL limits read out
    of `extractResumeText.ts` (PDF/DOCX, 5 MB cap, progress affordance, per-error messages) rather than
    invented ones, and reuses the existing `ImportResumeModal` instead of reimplementing import.
  - **54 more i18n keys** were again missing from every locale on delivery (11 of them would have rendered
    raw key paths on the very first screen of CV creation). Added across 6 locales. This is now the third
    tranche where the parity test passed while keys were absent *everywhere* — the `check-keys-used`
    resolution check is the only gate that catches it, and it should be wired into CI.

- 2026-07-30 — **Feature build, tranche 1 (client-approved): §5 text-layer PDF, §6 template search/filters,
  §7 overflow warning, §9 calendar export, §13 subscription reporting, §14 CRM date range + CSV.**
  Built with 4 parallel agents on disjoint files + an independent verifier each; §5 and §7 done directly.
  **QA: api tsc ✓ 275/275 · web tsc ✓ 115/115 · i18n parity 1,760 × 6 ✓ · all `t()` keys resolve ✓.**
  - **🟢 §5 TEXT-LAYER PDF — the ATS problem is solved without changing a single visible pixel.**
    I had flagged that wiring in the server-side Puppeteer renderer would silently change how every
    existing user's PDF *looks* (its own comment says it renders different HTML than the editor). The
    client reaffirmed the request, so it was built a **safer way**: keep the rasterised image exactly as
    it is and add the document's text in **PDF rendering mode 3 ("neither fill nor stroke")** — the same
    technique that makes a scanned PDF searchable. Glyphs land in the content stream and are extractable;
    nothing is painted. Text comes from `serializeCVToText`, the same serialiser the ATS-check feature
    feeds, so a recruiter's parser sees what our own ATS score was computed from; the cover letter uses
    the preview's `innerText` so it captures the localised salutation/date/closing.
    **PROVEN, not assumed:** generated a PDF, inflated its content stream and recovered all 5 source
    lines, with the `3 Tr` operator confirmed present. **+10 unit tests.**
    ⚠️ A test caught a real flaw mid-build: the first encodability guard rejected anything outside
    Latin-1, so an **em dash or smart quote would have silently disabled the layer on most real CVs**
    (our own AI output is full of them). Now folds typographic characters to ASCII first. **Arabic/Urdu/CJK
    still skip the layer deliberately** — embedding mojibake is worse for a parser than no text — that
    needs a subsetted Unicode font embedded, tracked for the client.
  - **§14 CRM date-range + CSV — and the API filtering it needed.** The verifier caught that the three
    `/crm/analytics` endpoints accepted **no query parameters**, so selecting "Last 7 days" refetched
    byte-identical all-time figures and then **labelled them as a filtered window** in the UI and in the
    exported CSV filename — real numbers presented as something they were not, i.e. worse than no filter.
    Implemented the server side properly: `AnalyticsRangeDto` (strict `YYYY-MM-DD`, so a malformed value
    400s instead of silently emptying the dashboard) and range filtering across overview, revenue chart
    and growth chart. **A boundary test then caught a second bug:** bounds were parsed in *server-local*
    time, so the same report returned different revenue on a UTC+5 host than a UTC one. Now **UTC**, with
    an inclusive end-of-day `to`. **+10 tests.** The revenue chart also caps at 36 columns so a
    decade-wide range cannot render hundreds.
  - **§13 Subscription reporting** — status breakdown off the real `SubscriptionStatus` enum, MRR (active
    and trialing separately, cents→units, yearly÷12), Stripe customer ID with copy-to-clipboard, extended
    status filter. Churn renders an explicit "not available" with the reason when the loaded page of data
    cannot support it, rather than a fabricated number.
  - **§6 Template search + filters + full-card click + full-size preview.** **Industry and career-level
    filters were NOT built and cannot be** — `Template` has no `industry`/`careerLevel` field anywhere in
    shared-types or the seed catalogue. Inventing them client-side would have been a lie; this needs a
    backend schema change first. Reported to the client rather than faked.
    ⚠️ Verifier caught a regression: localizing the tier label broke `TemplatePreviewModal`, which derives
    its own key from that prop (`tCommon(tierLabel.toLowerCase())`) — Arabic rendered the literal string
    `common.احترافي` in the badge and upgrade copy. Fixed with a canonical-English map.
  - **§9 Calendar export** — dependency-free `.ics` for interviews (CRLF, correct escaping of `,;\`, 75-octet
    line folding, UTC stamps), **+30 tests**. A downloadable file rather than an OAuth calendar
    integration: it imports into Google, Outlook and Apple alike and needs no token from the user.
  - **§7 Content-overflow warning** — the CV editor now says "Your CV runs onto N pages", reusing the
    measurement `useAutoFitPage` already performs (no extra layout work). Deliberately a quiet inline
    note, not a modal: a two-page CV is a legitimate choice, not an error.
  - **⚠️ 40 new i18n keys existed in NO locale** when the agents finished — they would have rendered as
    raw key paths (`public_templates.search_placeholder`) on screen. Neither i18n test catches that (parity
    only compares locales *to each other*), which is exactly why the separate `check-keys-used` resolution
    check exists. All 40 added across 6 locales.

- 2026-07-29 — **First actual RUN of the API this engagement — two real bugs that no test or type-check
  could have caught.** Everything until now was verified by type-check and unit tests; nothing had been
  executed. Building and booting it found both immediately.
  - **🔴 `pnpm build` could exit 0 and emit NOTHING.** `tsconfig.json` had `incremental: true` with the
    default cache location (`./tsconfig.tsbuildinfo`), which sits OUTSIDE `dist/`. Delete `dist/` — the
    natural move when forcing a clean rebuild, and what a Docker/CI cache restore can also produce — and
    `tsc` reads the surviving cache, concludes everything is already emitted, and writes nothing.
    **Reproduced: `rm -rf dist && nest build` → exit 0, no `dist/main.js`**, then `node dist/main` fails
    with "Cannot find module". The earlier `deleteOutDir:false` fix (2026-07-19) addressed the opposite
    direction only. **Fixed** with `"tsBuildInfoFile": "./dist/tsconfig.tsbuildinfo"` — the cache now lives
    inside the output, so removing one always removes the other. **Verified both ways:** clean slate →
    emits; delete-dist-and-rebuild → emits.
  - **🔴 The monthly usage-reset catch-up NEVER ran.** Observed on boot:
    `[UsageResetService] Usage reset catch-up check failed — Cannot read properties of undefined (reading
    'firestore')`. `UsageResetService` did its catch-up in `onModuleInit`, but so does
    `FirebaseAdminService` — and Nest gives no ordering guarantee between two services' `onModuleInit`
    across modules. The usage-reset hook won the race, so `firebaseAdmin.firestore` was undefined, and the
    surrounding try/catch swallowed it. Consequence: a server restarted across a month boundary left usage
    counters unreset, so users were refused CV creation and AI credits **despite a renewed allowance** —
    while §5.1 of this document claimed the reliability work was done. **Fixed** by moving the hook to
    `onApplicationBootstrap`, which runs only after every module's `onModuleInit` has completed. Spec
    updated (8/8). **Verified by re-running the built server: the error is gone.**
  - **📌 README was wrong about the emulator prerequisite.** It said the Firestore emulator needs "Java 11+";
    `firebase-tools` 15.x hard-refuses anything below **JDK 21** ("no longer supports Java version before
    21"). With Java 17 here, the Firestore emulator cannot start at all — so the QA path this document has
    been recommending does not work as written. Corrected, and the Auth-only fallback (pure Node, no Java)
    was **verified working**.
  - **⚠️ Process mistake, recorded deliberately.** While verifying the usage-reset fix I restarted the API
    with only `FIREBASE_AUTH_EMULATOR_HOST` set and **omitted `FIRESTORE_EMULATOR_HOST`** — so
    `firebase-admin` fell back to the service-account credentials and connected to **production Firestore**
    (`Firestore connection verified` in the log). The now-working bootstrap hook read `system/usage_reset`,
    found the marker already current, and returned without writing; the process was killed immediately
    after. **One document read, zero writes, no user data touched, no test users, no emails.** It still
    breached the standing no-production-testing rule. README now documents `FIRESTORE_EMULATOR_HOST` as the
    single load-bearing guard and names `Firestore connection verified` as the tell-tale that you are
    pointed at production.
  - **Also confirmed by running it:** the API serves (`GET /templates` → 200), the auth guard works
    (`GET /cvs` unauthenticated → 401), and `/jobs/duplicate-check` is registered **before** `/jobs/:id`,
    so the new route is not shadowed by the `:id` matcher.

- 2026-07-29 — **🔴 Self-review of this session's own changes (27 agents across 7 risk areas) — 11 REGRESSIONS
  I INTRODUCED, all fixed.** Ran an adversarial regression review of the remediation work rather than
  declaring it done; each finding was then independently re-verified before acting. 8 further claims were
  **refuted** and correctly not actioned (the SDK's retry semantics, `isClientInputError`, a pre-existing CRM
  action-spelling inconsistency, `auth-errors.ts` network matching, a dead-but-harmless timeout clause, the
  Card dark-surface token, interview-time display). **QA: api tsc ✓ 265/265 · web tsc ✓ 75/75 · eslint 0
  errors · i18n parity 1,718 × 6 ✓ · all `t()` keys resolve ✓.**
  - **🔴 HIGH — billing comparison table was column-misaligned.** Making the plan list dynamic
    (`customerFacingPlans()` → 3 columns) while the body still emitted 4 fixed cells shifted every value one
    column left: **"Enterprise" was rendered above Career Accelerator's limits.** A user comparing plans read
    the wrong numbers for the plan they were about to buy. Body now iterates the SAME `plans` array as the
    header, via a fully-typed `FEATURE_KEY_BY_PLAN` record, so the mismatch is structurally impossible.
  - **MEDIUM — Enterprise CTA became a dead end for paid subscribers.** Routing all logged-in users to
    `/settings/billing` ignored that the page gates its upgrade cards behind `isFreePlan` — a Pro subscriber
    clicking "Upgrade" under Enterprise landed on a page with no Enterprise card and no way to buy. Paid
    subscribers now route to `/contact-us` until in-app plan switching exists for them.
  - **MEDIUM — audit rows were being silently DROPPED.** `requestContext` always set `ipAddress`/`userAgent`
    keys, which are `undefined` when the header is absent; Firestore rejects any write containing
    `undefined`, and `log()` swallows its own errors by design — so auth audit rows vanished with no trace.
    Added a recursive `sanitize()` (undefined→null, Dates preserved) + **7 tests**.
  - **MEDIUM — `AUTH_LOGIN` was written on every page load.** `/auth/verify` fires on every mount, so the
    audit trail filled with navigation noise; combined with the admin page's bounded 2,000-row window, real
    events (role changes, subscription changes, failed sign-ins) were pushed out and the filters returned
    empty — i.e. the fix for the client's #5 would have re-broken it. Now records a **session start**, using
    a 30-minute gap against the previous `lastLoginAt`. +2 tests.
  - **MEDIUM — job fields could not be cleared.** `x.trim() || undefined` omitted the key, and the update
    whitelist only copies keys that are `!== undefined` — so deleting a salary range, saving, and seeing a
    success toast left the old value in place. Edits now send `null` (not `''`, which would trip `@IsEmail`
    on contactEmail and 400 the whole save); `JobFields` and both DTOs widened to `string | null`.
  - **MEDIUM — date-only values rendered one day early west of UTC.** `new Date('2026-08-03')` is UTC
    midnight per spec, so applied dates, interview dates and follow-up reminders picked from
    `<input type="date">` displayed the previous day for every user in the Americas. `toDate()` now parses
    bare `YYYY-MM-DD` in local time. **+16 tests** (new `format-date.test.ts`).
  - **MEDIUM ×2 — CV editor undo history.** (a) The baseline effect could fire twice (warm React Query cache
    resolves `cvData`/`sectionsData` in separate renders; StrictMode double-invokes), leaving `historyIndex`
    at 1 so **Undo was enabled on a freshly opened CV**. (b) Discarding a restored backup left that backup as
    `history[0]`, so the user's **first Undo resurrected the draft they had just discarded**. Both fixed with
    a new idempotent `resetHistory()` store action plus a per-CV ref guard.
  - **LOW ×3 —** the AI failure panel rendered for non-AI creates (claiming "no AI credit was used" about a
    request that never touched the model, alongside a duplicate toast); the awaited duplicate-check left Save
    enabled, so a double-click created two applications; and `rollbackFailedCreate` **hard-deleted a
    successfully generated letter** when only the post-generation write failed — destroying paid-for content
    while the credit stayed spent. It now salvages any letter that already has content. +1 test.

- 2026-07-29 — **Mechanical remediation batches applied (20 agents, one per file with disjoint ownership +
  an independent verifier per file; 0 errors).** Everything here is attribute/class-level or a translation —
  no visual redesign, no behaviour change. **QA: web tsc ✓ · eslint 0 errors · web 57/57 · api 255/255 ·
  i18n parity 1,718 keys × 6 locales ✓ · every `t()` call in the app verified to resolve.**
  - **§15 i18n completed for the remaining known offenders.** `TemplatePanel` (the CV Design panel — its
    LAYOUTS/COLORS/SECTION_STYLES/BORDER_RADII tables now hold i18n keys instead of English literals, plus
    the panel headings and both tooltip forms as ICU messages); `FontPanel` preview strings (with a
    **script-appropriate pangram per locale** — a Latin pangram tells an Arabic or Urdu user nothing about
    how their font renders); the whole **landing-hero mockup** (~28 chrome labels — the first screen every
    visitor sees, previously English in all six locales; sample data like "Alex Johnson" deliberately left
    literal); `MaintenanceGate`'s blank-message fallback. **+41 template_picker/cv_builder keys, +23 hero
    keys, +12 CRM a11y keys.**
  - **§17 a11y across the CRM + admin.** `aria-label` on every previously-unnamed filter `<select>`;
    `aria-label` + `title` on icon-only buttons; `htmlFor`/`id` pairs on all CRM modal form fields;
    `focus-visible:opacity-100` + `group-focus-within:opacity-100` on hover-only action buttons (Tab
    previously landed on an invisible delete button); and **seven hand-rolled modals wired to the existing
    `useModalA11y` hook** (`role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape-to-close,
    focus restore) — CRM leads/customers/customer-detail ×2/revenue/subscriptions and the CV list.
    Deliberately additive rather than swapping in `ui/Modal.tsx`, which would change markup and styling.
  - **§12/§16 responsive tables** extended to CRM users/audit/customers/subscriptions and admin
    subscriptions/audit-logs, using the pattern already established in admin tickets/users: `px-4 sm:px-6`,
    non-essential columns folded behind `md`/`lg`/`xl`, and the folded values repeated as a sub-line in the
    primary cell so nothing is lost at any width.
  - **🔴 §15 RTL sweep — 27 physical direction classes converted to logical** across all CRM + admin pages
    (`left-`/`right-`→`start-`/`end-`, `ml-`/`mr-`→`ms-`/`me-`, `pl-`/`pr-`→`ps-`/`pe-`,
    `text-left`/`text-right`→`text-start`/`text-end`). These were live mirroring bugs in Arabic and Urdu —
    search icons on the wrong side, right-aligned numeric columns not flipping. Lines carrying a hand-tuned
    `rtl:` override were skipped so nothing double-applies. **Zero physical direction classes remain in
    either route group.**
  - **Two regressions the verifiers caught in agent work, fixed before landing:** (a) the CRM row-action
    menu was capped at `max-h-64` (256px) against ~290px of content, so *every* menu gained a scrollbar and
    "Super Admin" fell below the fold → raised to `max-h-80`; (b) its `openUpward` flip triggered from 5
    rows, but a menu needs ~6 rows of space above — at 5 rows it overflowed the TOP of the wrapper, which
    cannot be scrolled to, trading a clip for a worse one → threshold raised to 8. Also removed a **dead
    keyboard focus stop** on the admin audit-log rows (row *and* chevron were both focusable and did the
    same thing); the chevron is now decorative and the row carries `aria-expanded`.
  - **New guard: `check-keys-used`** — locale parity cannot catch a key that is missing from *all six*
    files, which still renders the raw key path on screen. Verified every `t('...')` call in `apps/web/src`
    resolves against `en/common.json`. Currently clean.
  - **New guard: `apps/web/src/i18n/no-hardcoded-english.test.ts`** — a ratchet against untranslated
    user-visible copy, which neither the build nor the type-check can catch (it just renders in English to
    everyone). Scans every `.tsx` for JSX text nodes and `placeholder`/`title`/`aria-label`/`alt` literals,
    with a **6-entry allowlist that each carry a written reason**. A repo-wide sweep now returns **11
    candidates in 7 files, and every one is legitimate**: sample CV content inside the landing mockup
    ("Alex Johnson", "Google"), font proper-nouns ("Times New Roman"), `you@example.com`-style address
    examples, and the unreferenced `ui/ErrorBoundary` twin. **Verified non-vacuous** by injecting a
    hardcoded string into `TopBar.tsx` — the test failed and named the exact file and string — then
    reverting. **Discovery:** after the CRM layout switch, `components/ui/ErrorBoundary.tsx` now has **zero
    importers**; its hardcoded English can no longer render. Left in place per the freeze note (which
    preserves both implementations) rather than deleted.
  - **Still not done, deliberately:** the design-token cleanup, `PageContainer` normalisation and button
    height rescale (all pure-visual refactors with a diff on every screen — they fail the freeze test), and
    preview zoom / page-break indicators (new features). Recommended post-RC, unchanged.

- 2026-07-29 — **Adversarial audit of the review sections left unstarted (63 agents; 40/55 findings confirmed,
  15 refuted) + first remediation batches.** Dimensions: §5 marketing claims, §7 CV editor, §10 settings,
  §12/16 responsive + design system, §15 i18n, §17 a11y. Refuted findings were mostly unbuilt-feature requests
  (2FA, connected accounts, change-email) miscast as defects — deliberately NOT actioned on a frozen RC.
  **QA: api tsc ✓ 255/255 · web tsc ✓ 57/57 · i18n parity 1,642 keys × 6 locales ✓.**
  - **🔴 §5 Unsupported marketing claims — REMOVED (truthfulness/legal).** Each verified against code first:
    • **"ATS-optimized" as a claim about the produced document was false.** `export-cv.ts` renders the PDF via
      html2canvas → `canvas.toDataURL('image/png')` → `addImage` — a **pure raster with zero extractable text**,
      which an ATS cannot parse at all. The DOCX path *is* real text (`Paragraph`/`TextRun`) and does parse.
      Removed the blanket claim from `hero.subtitle`, `hero.trust_ats`, `auth.panel_subtitle`,
      `how_it_works.step2_desc`, `parent_company.product1_desc`; kept it only on the genuine ATS-check feature;
      and added per-format hints in the export menu ("Best for people" / "Best for applicant tracking systems")
      so the distinction is stated where the user chooses.
    • **"Dozens of templates" → there are exactly 16** (10 CV + 6 cover-letter slugs in `templates.service.ts`).
    • **"designed by HR experts/professionals" → zero substantiation** in the repo. Removed.
    • **"GDPR compliant" → removed as an unqualified claim** from the checkout trust strip and About.
    • **"AI translation" → the `/ai/translate` route has no web caller at all.** Removed.
    • **"designed for your industry and career level" → no industry/careerLevel metadata exists.** Removed.
    • **Deletion promises corrected.** `users.service.softDelete()` flips `isActive`, revokes tokens and
      disables the Auth user — it does **not** delete the user's documents, and there is no purge job. The
      Privacy Policy nevertheless stated data "is permanently deleted within 30 days" (a false statement of
      fact in a legal document). `faq.a4`, `privacy.s5_delete`, `privacy.s6_desc` and the delete-account modal
      now describe what actually happens and route permanent erasure to `privacy@flacroncv.com` within 30 days
      — manual erasure on request is GDPR-acceptable; automated purge is not required. ⚠️ **This is an interim
      honesty patch, not a resolution — the erasure cascade + purge job must still be scheduled post-RC, and
      someone must confirm the `@flacroncv.com` mailbox actually routes** (the API's configured address is
      `@flacronenterprises.com`).
  - **🔴 Paywall modal advertised benefits the plan does not deliver.** `UpgradeModal` claimed Pro includes
    "Unlimited AI Credits" and "Unlimited CVs & Cover Letters"; Pro is **100 credits and 10 CVs**. It now
    renders `PLAN_CONFIGS[PRO].features` directly, so the paywall cannot over-promise at the exact moment the
    user decides to pay. Also i18n'd (it was 100% English across five paywall flows — every plan-limit prompt
    in the product was English-only in all six locales).
  - **§15 i18n gate task — `apps/web/src/i18n/locale-parity.test.ts` (13 tests).** Asserts identical key sets
    across all six locales, no empty values, **and matching ICU placeholders** (a translation that drops or
    renames `{date}` renders literal braces and is invisible to a key-set diff). Missing keys previously shipped
    silently as raw key paths on screen. Also translated: CV crash-recovery + autosave toasts, admin audit-log
    optgroup labels.
  - **§7 Two real CV-editor bugs fixed.** (a) **Undo off-by-one:** the store's contract (encoded in its own
    tests) is snapshot-AFTER-mutation, but `CVEditor` called `pushHistory()` *before* all five mutations — so
    the first edit could never be undone (`canUndo` = `historyIndex > 0` stayed false) and every later undo
    reverted **two** edits. Fixed by reordering the five call sites and seeding a baseline snapshot on load —
    deliberately narrower than rewriting `undo()`/`canUndo`, which would have churned the store on an RC.
    +3 regression tests, including one documenting the old ordering. (b) **Autosave never retried:** on failure
    `isDirty` stayed true but no effect dependency changed, so the effect never re-ran — the toast's "will
    retry" was false and work sat unsaved until the user typed again. Added a `retryTick` with capped
    exponential backoff (4s→30s), reset on success.
  - **§16 CRM shell had no header at all on desktop.** It used a bespoke `lg:hidden` bar, so admins had **no
    language switcher, no theme toggle and no account menu anywhere in the CRM**, plus a different header
    height and a hand-typed "FlacronCRM" wordmark. Now renders the shared `TopBar`, identical to the admin
    shell. Also switched the CRM to the **translated** `ErrorBoundary` (it wired the hardcoded-English twin;
    both implementations are still preserved per the freeze note).
  - **§17 a11y (mechanical):** `aria-label` on the three CRM user-filter selects; **per-row name on the admin
    role select** (20 identically-unnamed comboboxes previously — a screen-reader user could not tell whose
    role they were changing); `htmlFor`/`id` on the audit-log filter; and the audit-log expand chevron is now a
    real button with `onClick`, `aria-expanded` and a label (it was nameless and relied on click bubbling).
  - **Guard added: `subprocessor-disclosure.spec.ts` (9 tests)** — ties the Privacy Policy's subprocessor list
    to the SDKs actually in `apps/api/package.json`, in both directions, so a provider migration cannot silently
    leave the policy stale again. Verified non-vacuous against the pre-fix text.
  - **Deliberately NOT done (surfaced as recommendations):** design-token cleanup and `PageContainer`
    normalisation (zero user-visible effect / visual diff on every screen → fails the freeze test); button
    height scale (2px, re-flows every button); preview zoom + page-break indicators (new features); text-layer
    PDF export (the Puppeteer path renders different HTML than the editor — wiring it in would silently change
    every user's PDF, a bigger risk than the claim it fixes); active-sessions UI. Remaining i18n items
    (`TemplatePanel` design panel, `FontPanel` previews, `Hero` mockup chrome, `MaintenanceGate` fallback) and
    the remaining CRM/admin a11y + responsive items are queued but unstarted.

- 2026-07-29 — **🔴 Privacy Policy named the WRONG email subprocessor (compliance fix).** The policy disclosed
  **Brevo** as the transactional-email provider, but the product migrated to **AWS SES**
  (`@aws-sdk/client-sesv2`, `mail.service.ts:3`, region `us-east-1`). An inaccurate subprocessor list is a
  GDPR Art. 13(1)(e) accuracy problem, and it under-disclosed a second US data transfer. **Fixed:**
  `privacy.s3_desc` now names *Amazon Web Services (Amazon SES … on servers in the United States)* in all
  **6 locales**, and `privacy.last_updated` → July 29, 2026. Repo-wide check: zero "Brevo" references remain
  in any locale file. Found by following up a stale reference in my own client report — worth noting that the
  earlier "Brevo undisclosed subprocessor ✅ FIXED" entry (2026-07-18) became stale when the provider changed,
  with nothing to catch it. **Recommendation: a test asserting the disclosed subprocessor list matches the SDKs
  actually in `apps/api/package.json`.** Also corrected the same stale reference in `README.md` (×3) and in
  §1/§2 of this file. Historical change-log entries below are left as originally written.

- 2026-07-29 — **Staging/QA runbook — the "blocked on a staging environment" claim was wrong.** Re-checked
  before asking the client to build one: `pnpm emulators` + `scripts/seed-emulator.mjs` already provide safe
  local Auth+Firestore with a verified super-admin QA account (the script forces emulator hosts and deletes
  `GOOGLE_APPLICATION_CREDENTIALS`, so it cannot reach the live project), and `STRIPE_SECRET_KEY` is already
  **`sk_test_`**. So **14 of the 20 §19 flows are runnable today**; only Stripe webhook delivery was genuinely
  missing (Stripe cannot reach localhost → checkout succeeds but the plan never activates, which reads as a
  broken upgrade). **Added a "Testing the Stripe checkout flow" section to `README.md`:** `stripe listen`
  forwarding, where the `whsec_` goes, test cards for success/failure/decline, and `stripe trigger` commands
  for renewal / cancellation / refund / dispute. The new audit logging makes webhook landings visible, which
  is the fastest confirmation. Known gaps documented: Storage is not emulated (avatar upload + server-side PDF
  export hit the real bucket) and the Firestore emulator needs Java 11+.

- 2026-07-29 — **Second client review ("Overall review.pdf", 19 sections) — critical items implemented.**
  All changes fall under the freeze categories (critical bug fixes / production issues found in real-world usage /
  business-approved requests). **QA: api tsc ✓ + 246/246 tests · web tsc ✓ + 41/41 tests · i18n parity 1610 keys × 6
  locales ✓.**
  - **§1 AI cover-letter generation (client's #1 priority).** Three distinct defects, all fixed:
    (a) **Blank cover letters + burnt quota on failure** — `create()` wrote the document and incremented
    `coverLettersCreated` *before* calling the model, so a failed/timed-out generation left an empty entry behind and
    every retry consumed another allowance. Create+generate is now atomic: on failure the draft is deleted and the
    quota refunded (`rollbackFailedCreate`), and the original error is still surfaced. +3 tests.
    (b) **Timeout budget was incoherent** — the OpenAI provider ran `timeout: 20000, maxRetries: 1`, below the p95 for
    a ~1500-token letter, and the SDK retries timeouts, so a slow generation cost 2×20s and still failed. Now **one
    40s attempt, no SDK retry**, sitting inside the browser's 60s budget, with the chain documented in both files.
    Retry is an explicit user action instead of hidden latency.
    (c) **Unhelpful errors** — new `ApiError` classifies timeout / offline / network / http with a `retryable` flag;
    "Request timed out — the server did not respond" is replaced by actionable copy. +5 tests.
    UI: a live "Generating your cover letter…" panel with an expected duration, an error banner with **Retry** that
    re-runs the same payload, confirmation that no credit was charged, and a re-entrancy guard against double-clicks.
  - **§1 Audit logs were empty (#5).** Root cause: the admin page reads `audit_logs`, but **only three admin mutations
    ever wrote there** — nothing else in the product did. Added an action catalogue
    (`audit/audit-actions.ts`) and wired the client's full list: sign-in/out/registration/failed sign-in/password reset
    (`auth`), role changes (with before/after + actor), subscription activated/changed/cancelled/revoked and payment
    failures (Stripe webhooks), template create/update/delete, ticket created/closed, AI generations, and exports.
    `CRMAuditService.log()` now **mirrors into `audit_logs`**, so all seven existing CRM mutation sites become visible
    in one change. Firebase Auth is client-side, so sign-out and failed sign-ins are reported by the browser —
    `POST /auth/logout` (authenticated) and `POST /auth/failed-login` (throttled 10/15min, address + error code only,
    never a credential). Admin filter regrouped by category. +5 tests.
  - **§1 "Your internet connection is unstable" — NOT from the application.** Repo-wide search: the string exists
    nowhere in the codebase or any locale file. It came from the recording tool/browser. No app change needed;
    `ApiError` now distinguishes a genuine offline state anyway.
  - **§2 Pricing inconsistency (#2).** Introduced **one visibility rule** in shared-types: *a plan is shown to
    customers iff it is purchasable* (`isPlanPurchasable` / `customerFacingPlans`). Career Accelerator has no Stripe
    price, so it is now hidden from the billing comparison too (it was advertised there but absent from public
    pricing); setting its `stripePriceIdMonthly` reveals it on **both** surfaces with no code change. Enterprise has a
    real Stripe price and the billing page sells it, so public pricing now offers self-serve upgrade instead of
    "Contact Sales" — the two flows agree. Yearly toggle is genuinely **disabled** (was clickable into a dead end),
    behind `YEARLY_BILLING_ENABLED`. Added purchase-terms disclosure near checkout (credit definition, no rollover,
    renewal, cancellation, refunds, taxes). **Enterprise is no longer described as a team plan** — verified there is
    zero seat/team implementation in the codebase — and limits are stated as per-account.
    New `plan-advertising.spec.ts` (**26 tests**) parses the advertised feature copy and asserts it matches the
    server-enforced limits, so the two can never drift again. **They currently match exactly.**
  - **§3 Dashboard cards (#3).** The values carried `truncate`, which is literally what produced "30/…" and "Ent…".
    Removed; values now step down a size and wrap. Ratios render as "30 / 500". Card padding/icon reduced (the client
    asked for less height). **Also fixed a real bug:** the plan-name lookup listed only free/pro/enterprise, so a
    **Career Accelerator subscriber's dashboard displayed "Free"**.
  - **§8/§13 "Updated" with no date — one root cause, 18 pages.** `lib/utils.formatDate` understood `{seconds}` but
    not firebase-admin's `{_seconds}` serialization, so every Firestore timestamp fell through to `Invalid Date` and
    returned an **empty string**. It now delegates to the robust `toDate()` in `format-date.ts`. This repairs dates on
    cover-letter cards, admin template cards, ticket/CV/job lists and the audit log at once. Cover-letter cards also
    gained Created + Updated + a linked-CV badge.
  - **§9 Job tracker.** Added search (company/role/location/notes/contact), sort (updated/applied/company/position/
    status), **per-status counts on each tab**, archive/restore, and a named delete confirmation. New fields end to
    end (type + DTO validation + whitelist + UI): salary range, recruiter name/email, interview date, follow-up
    reminder, linked cover letter. New `GET /jobs/duplicate-check` powers a confirm-before-duplicate prompt.
  - **§12/§13 Responsive tables.** Admin tickets and admin users tables overflowed at laptop widths. Columns now fold
    progressively (`hidden md:table-cell` etc.) with the hidden values repeated in the primary cell, so nothing is
    lost. **"Awaiting your reply" was ambiguous** — both admins and customers read the same string. Now reader-
    independent: `open` → "Awaiting support reply", `waiting_on_customer` → "Awaiting customer reply" (6 locales).
    Template archiving now names the template and reports how many documents use it.
  - **§14 CRM charts.** The revenue axis formatter was unconditionally `$(v/1000)k`, so every value under $500
    rendered "$0k" — the repeated labels the client saw. Now adaptive ($0/$10/$20 → $1.2k → $12k → $1.5M). Added an
    empty state for an all-zero series, and the conversion rate is **withheld below 20 leads** with an explanation
    rather than showing a misleading "50%".
  - **Verified, no change needed:** the ATS score is genuinely computed — `ATSCheckModal` serializes the user's real
    CV (`serializeCVToText`) and posts it with the job description to `/ai/ats-check`; it is not static.

- 2026-07-20 — **Logo theme mapping fixed (client-reported bug; allowed under the freeze as a bug fix).** The two brand
  files are named for their **background**, not their ink — `flacronCvlight.png` is the lockup on a LIGHT background and
  `flacronCvblack.png` the lockup on a DARK background. The previous mapping was inverted, so light mode rendered the
  dark-navy lockup (a navy panel on a white page) and the auth brand panel (`bg-stone-950`) rendered the white square.
  Corrected site-wide: `Logo.tsx` now maps light theme → `flacronCvlight.png`, dark theme → `flacronCvblack.png`; the
  ambiguous `variant='light'|'dark'` was renamed to surface-based **`'on-light'|'on-dark'`** (only call site,
  `(auth)/layout.tsx`, updated to `on-dark`); the schema.org `Organization.logo` switched to the light lockup (search
  engines render it on white). Guard comments added so it can't silently invert again. web tsc/lint/tests ✓.
  **Still blocked on brand assets (NOT fixable in code):** (a) both PNGs have an **opaque baked-in background** (the dark
  one even has a border) instead of transparency, so the logo reads as a pasted box on any surface; (b) intrinsic sizes
  differ (1254×1254 square with heavy padding vs 467×374), so the light lockup renders visually smaller at the same height
  utility; (c) **no vector source** — vectorization needs the designer's original .ai/.eps/.svg (no tracer is installed,
  and auto-tracing/hand-redrawing a raster brand mark would degrade it). Request transparent SVG exports at matched
  proportions from the brand owner.

- 2026-07-20 — **Final production engineering audit (read-only review + safe cleanups + docs).** Swept the whole codebase
  one last time before release. **Clean:** zero `TODO`/`FIXME`/`HACK`/`@ts-ignore`, no `debugger`/focused-tests/stubs,
  **no circular dependencies** (madge: 175 web + 126 api files, 0 cycles), no broken imports (tsc 0/0), no unreachable code,
  no scratch/`.bak` files. `main.ts` confirmed production-grade (boot env-validation, helmet, allowlist CORS, trust-proxy,
  global ValidationPipe, rawBody for Stripe, `/health`). **Applied (safe, verified — this is NOT a git repo, so deletions
  are irreversible; only trivial/unambiguous items were auto-removed):**
  - Deleted 2 confirmed-dead files: `apps/web/src/components/ui/PageLoader.tsx` (duplicate of the used `shared/PageLoader`)
    and `apps/web/src/components/ui/LoadingOverlay.tsx` (0 importers).
  - Removed 4 unused deps: web `react-hook-form`, `@hookform/resolvers`, `zod` (used only by `apps/mobile`) and api `winston`.
  - Fixed **`apps/api/.env.example`**: added the 7 Brevo vars + `ADDITIONAL_ORIGINS` the code actually reads (were missing →
    a new dev's email/verification would silently fail) and annotated the unwired WatsonX vars.
  - Wrote a real **README.md** (was a 2-line stub): monorepo layout, prereqs, quick-start, env table, scripts, testing,
    deploy notes (Stripe webhook path corrected to `/api/v1/webhooks/stripe`).
  - Re-gated after cleanup: web tsc 0 / api tsc 0 / web 36 tests / api 212 tests — all green.
  - **Held for an explicit decision (NOT deleted — substantive/intended, and no git safety net):** the two unregistered AI
    providers `ai/providers/{watsonx,anthropic}.provider.ts` (dead now, but real scaffolding for a multi-provider setup;
    WatsonX is also unwired in `configuration.ts`); the unused generated `dataconnect-generated` / `dataconnect-admin-generated`
    SDK dirs; consolidation of the two live `ErrorBoundary` implementations (dashboard vs CRM).
  - **Config notes (not changed):** no CSP header on the web app (COOP is intentionally `unsafe-none` for Firebase popup auth);
    root `pnpm.overrides` is ignored by pnpm 8.15 (the per-command warning) — move it to `pnpm-workspace.yaml` when convenient.
  - **Verdict:** engineering under our control is complete (all gates green, no known code blocker). Remaining before a full
    launch = the 5 business decisions, a clean-network `next build` verification (can't run here — gstatic-font outage), and a
    manual smoke-test of the live Firebase/Stripe/Brevo/OpenAI flows. Recommendation: staged/soft launch after the
    trial-abuse fix + build verification.

- 2026-07-20 — **Production QA hardening pass (functional / security / a11y / i18n / code-quality).** Shifted from design to
  a full production-readiness review. Method: baseline all gates → 13-agent code-review sweep (each finding adversarially
  verified to kill false positives) → fix only verified, safe defects → re-gate. **Final gates ALL GREEN:** web `tsc` 0,
  web `eslint` 0 errors (7 intentional `<img>` warnings), web vitest **36/36**; api `tsc` 0, api `eslint` **0 problems**,
  api jest **212/212**. NOT browser-verified end-to-end (production-services constraint + gstatic-font build outage); gate =
  tsc/lint/tests. **Sweep: 45 raw → 36 confirmed (10 high / 17 med / 9 low); 8 refuted, 1 uncertain. Fixed 28 (deduped),
  flagged 5 as decisions.**
  - **Baseline blockers fixed:** stale `apps/web/src/lib/api.test.ts` fetch mock (missing `headers`) → 6 tests restored;
    **ESLint stood up for both apps** (was entirely unconfigured — web `next/core-web-vitals`, api `@typescript-eslint/recommended`);
    9 api unused-var warnings cleaned.
  - **Security (5):** ① server-side PDF export (Puppeteer) hardened against SSRF / injected-script execution — JS disabled +
    request interception (block non-`data:`) on both CV & cover-letter renders, plus HTML-escaping of all user plaintext
    fields (`export.service.ts`). ② cover-letter `update()` mass-assignment closed with an explicit field whitelist (was
    spreading raw body → could reassign `userId`/`deletedAt`). ③ CSV formula-injection neutralized across all 5 export
    controllers via a shared `csvCell`/`csvSafe` helper (`common/utils/csv.ts`).
  - **Functional bugs (high):** backup-restore no longer marks client-only sections persisted (was 404-looping & losing
    restored work) — new `setPersistedSectionIds` store action; autosave no longer discards mid-flight edits — new
    reference-compare `markSaved`; support-ticket detail page rewired to the combined `{ticket,messages}` endpoint (was
    fully broken); all 4 CRM CSV exports fixed (doubled `/api/v1` + missing Bearer token) via a shared authenticated
    `downloadCsv` helper; admin `/stats` and `/audit-logs` now return the shapes the UI expects (dashboard widgets &
    audit viewer were always empty); `reorder` route un-shadowed.
  - **Functional bugs (med/low):** template-gate uses `planMeetsTier` (Career-Accelerator users were locked out of all
    templates); verify-email "Check now" no longer sticks on failure + post-verify honors the pending-template redirect;
    CRM list search URL-encoded (AT&T etc.); billing "verifying" banner no longer sticks on malformed URL; revenue-chart
    tooltip transactions count fixed; audit-logs keyless-Fragment key; stale Google-auth toast removed.
  - **Accessibility (2):** `JobFormModal` & `TemplatePreviewModal` adopted the shared `useModalA11y` (role/aria-modal/
    labelled, Escape-to-close, focus trap + restore).
  - **i18n (6):** added the missing `admin` keys (~49) + a new `cv` namespace (12) across **all 6 locales** with proper
    per-language translations (en/es/fr/de/ar/ur) — admin dashboard/users/subscriptions/sidebar were rendering raw key
    paths; CV list page + `CVCard` fully localized; shared `Select` chevron switched to logical `pe-8`/`end-2.5` for RTL.
  - **Deferred — require a business/product decision (documented, NOT patched):**
    (a) **SUPERSEDED 2026-08-18 — do not act on this.** It claimed cancel→resubscribe
    granted unlimited trials via `stripeSubscriptionId`. That hole is closed by a
    Stripe history check that fails closed. `hasUsedTrial` later shipped as
    defence-in-depth (Batch G part 1); **there is no live leak and no backfill
    to run.** Left in place so the original words are not silently rewritten.
    (b) **CV list pagination** — only the first 10 CVs load; needs a "load more"/cursor UI (design-frozen).
    (c) **Export quota on client-failure** — a failed client-side export still consumes quota; a correct fix is a
    check-then-commit split (enforcement-design tradeoff).
    (d) **Server-side email-verification gate** — currently client-only; enforcing it server-side is a policy change (must
    exempt the verify/resend endpoints & handle token-refresh lag).
    (e) **CRM customers 1000-row cap** — under-counts beyond 1000; needs a conscious pagination-vs-unbounded-read decision.

- 2026-07-20 — **Enterprise design refresh — E2 deep polish pass (audit-driven, dashboard → whole app).** Ran a 4-agent
  design-consistency audit (target: Stripe/Linear/Vercel) → **56 concrete findings**; fixed the highest-impact ones,
  batching by pattern with type-checks between (web type-check ✓ run 4×). **① Multi-hue rainbow eliminated (the dominant
  19 findings)** — established one restrained rule: *decorative icon/stat chips use only brand + neutral stone; semantic
  colours (emerald=up/revenue, red=down, status badges) are kept.* Neutralised every rainbow stat/KPI row — dashboard
  home, CRM overview + platform, admin dashboard + subscriptions, CRM user-detail usage tiles, billing usage tiles,
  billing plan checkmarks (were brand/purple/emerald → all brand), settings preference chips, and `ActivityTimeline`
  (6 hues → neutral, brand reserved for a converted lead). **② Landing de-AI** — the 8-feature grid (8 different bright
  gradient icons) and the 3-step "How it works" (brand/violet/emerald + a tri-colour connector line) → one consistent
  brand/neutral treatment; `font-extrabold` → `font-bold` on section headings. **③ Loud gradients** — dashboard upgrade
  banner (brand→violet → single-hue brand); CRM customer-detail revenue tile (loud emerald-gradient card → clean Card
  with one semantic money accent). **④ Layout bugs** — removed **double page-padding** on jobs/support/support-new/
  support-detail (they re-applied the `(dashboard)` layout's `<main>` padding); converged **section rhythm** to
  `space-y-6` across the 7 outlier pages that used `space-y-8`. **⑤ Page headers** — bumped 3 detail-page `h1`s from
  `text-xl` to the `text-2xl font-bold` page-title standard (support, admin-ticket, CRM-user detail). **⑥ Tables** —
  standardised the CRM-subscriptions + admin-dashboard table heads (transparent, `stone-200` divider) to the app norm.
  **Constraints:** zero logic/feature/i18n/RTL/a11y changes — CSS/markup only; ~19 files. web type-check ✓. **NOT
  browser-verified** (build stalls on the gstatic-font outage; authenticated surfaces per the production constraint) —
  visual smoke-test recommended.
  **── Phase-8 final QA — remaining polish (tracked, non-blocking) ──**
  - **Touch targets (systemic):** many icon buttons are `p-1.5` (~28px) < the ~36px min — best solved by a shared
    `IconButton` primitive adopted app-wide (flagged: cv/jobs cards, settings avatar, admin-templates, CRM-subscriptions rows).
  - **Loading states:** cover-letters list + CRM-settings use a bare spinner where siblings use skeleton cards — standardise to skeletons.
  - **Error states:** CRM-customers list ignores `isError` (shows an empty table on failure) — add the error banner the overview uses.
  - **Empty states:** admin tickets/users/subscriptions use a plain text row vs the styled empty state on audit-logs/templates.
  - **cv delete dialog:** hand-rolled raw-div overlay → adopt the shared `<Modal>` (cover-letters already does).
  - **Minor:** audit-logs cell `py-3`→`py-4`; header `tracking-wide` vs `tracking-wider`; `CVCard` manual hover → `<Card hover>`;
    CRM-subscriptions filter card `p-4` vs default `p-6`; platform chart hardcodes `#f97316` vs the shared `#ea580c` (brand-600).
  - **Plan badges** (pro=brand, career=fuchsia, enterprise=violet) left as categorical tier colours — tighten to a brand
    scale if you want stricter restraint.
- 2026-07-20 — **Enterprise design refresh — foundational pass (E1 branding + E2 de-AI system polish).** Inspected the app
  as a product designer + FE engineer and fixed the SYSTEM so polish ripples app-wide, rather than editing pages one-off.
  **Diagnosed AI-generated tells:** an orange logo force-recoloured per theme via `dark:invert dark:hue-rotate-180`;
  **two parallel design systems** (globals `.card`/`.input`/`.btn` vs `Button`/`Card`/`Input` components with different
  values — e.g. Card `stone-800` vs `.card` `stone-900`); harsh pure-black dark mode; loud brand→violet **gradient-text
  headline** + multi-hue glows/badges; flat default shadows; no heading tracking; mixed focus rings.
  **① Branding (client's official assets):** new theme-aware `<Logo/>` (`flacronCvblack.png` on light, `flacronCvlight.png`
  on dark, via CSS — no JS/flash) replacing **every** `/logo.png` usage — landing nav, footer, dashboard + admin sidebars,
  auth (mobile + brand panel), 404, and the CRM sidebar (which was showing a `FileText` **icon** as its mark); plus the
  JSON-LD Organization logo. **② Design tokens:** refined **layered low-opacity shadow scale** (cool near-black tint —
  overrides Tailwind's flatter `sm/md/lg/xl` so every card/dropdown/modal shares one restrained elevation); `antialiased`
  body + `tracking-tight` headings + branded `::selection`; softened the dark canvas from pure black → `stone-950` (an
  actual elevation system: bg-950 → card-900); refined input focus ring (`ring-1` → soft `ring-2 ring-brand-500/25`);
  **unified `.card`/`Card` and `.input`/`Input`** so the two systems match. **③ Core components:** `Button` → `focus-visible`
  rings (no ring-flash on mouse-click), subtler press (`0.98`), thinner outline, **toned-down gradient** (soft vertical
  sheen, not a loud bar); `Modal` → themed backdrop + hairline border + subtle scale-in + unified surface. **④ Landing:**
  hero headline **`font-extrabold`→`font-bold`** with the **gradient-text → a single solid brand accent** (the #1 AI tell,
  gone), all multi-hue glows/badges unified to one brand accent, tighter headline leading; nav dark glass aligned to the
  new near-black; **auth brand panel** reworked from a loud `brand→violet` gradient to a premium near-black with a subtle
  brand glow. **Constraints honoured:** zero business-logic/feature changes, RTL + i18n + a11y untouched (kept/strengthened
  focus-visible). **QA:** **web type-check ✓ (run 4× across the passes)**; CSS/markup-only. **NOT browser-verified** (the
  `next build` still stalls on the environmental `fonts.gstatic.com` outage; authenticated surfaces can't be runtime-viewed
  per the production constraint) — recommend a visual smoke-test after deploy. **Asset note:** the two logo files have
  **different aspect ratios** (black 1.25:1, light 1:1) so the rendered wordmark width differs slightly between themes —
  matched exports (same canvas/ratio) would make the two identical. **This is a foundational pass:** the system + top
  surfaces are done; deeper per-page polish (dashboard KPI cards/tables, every form, a full mobile-breakpoint audit,
  the hero mockup's internal multi-hue section chips) remains as ongoing E2 work.
- 2026-07-20 — **Built the free-trial system (PDF requirement — was ✗).** New `TRIAL_PERIOD_DAYS` in shared-types.
  **Checkout:** `createCheckoutSession` now adds Stripe `subscription_data.trial_period_days` — but only for a
  first-time subscriber (`!stripeSubscriptionId`), which blocks the "cancel → re-subscribe for another free trial"
  abuse. **Activation (the key fix):** a trial checkout completes with `payment_status: 'no_payment_required'` (nothing
  charged yet) — `verifySession` previously **rejected** that as "Payment not completed"; it now accepts it, derives the
  real status (`trialing` vs `active`) from the Stripe subscription instead of hardcoding ACTIVE, and records
  `trialStart`/`trialEnd` on both the user and the `subscriptions` doc (same fix in the `checkout.session.completed`
  webhook). A `trialing` account already resolves to full paid access via `resolveEffectivePlan` (TRIALING is
  non-delinquent), and rolls to `active` on the first successful `invoice.paid` after the trial. **Frontend:** upgrade
  CTAs read **"Start 7-day free trial"** for trial-eligible users, and the current-plan card shows **"Your free trial
  ends on {date}"** while trialing. +2 `billing` i18n keys ×6 (parity **1473 × 6**). **ASSUMPTIONS (client to confirm):**
  - **T1** Trial length **7 days** (`TRIAL_PERIOD_DAYS`; set to 0 to disable trials entirely).
  - **T2** **Card required upfront**, auto-charged when the trial ends unless cancelled (Stripe checkout default — the
    standard "free trial, cancel anytime" model; no card-less trials).
  - **T3** Eligibility = **first-time subscribers only** (never had a Stripe subscription). Minimal anti-abuse; a
    per-account `trialUsed` flag could harden it further (follow-up).
  - **T4** The trial applies to whichever paid plan the user checks out (Pro/Enterprise today; Career Accelerator once its
    Stripe price exists).
  - **QA:** shared-types build ✓; api type-check ✓; **`payment.service` 25/25** (+3: trial applied for a new subscriber,
    NOT for a returning one, and a `no_payment_required` trial checkout → TRIALING + trialEnd recorded); **full API suite
    19 suites / 212 tests green**; web type-check ✓; parity **1473 × 6**. **NOT runtime-tested against live Stripe**
    (production-Stripe constraint) — the mechanism is unit-tested with a mocked Stripe client + type-checked, mirroring the
    existing checkout/webhook coverage.
- 2026-07-20 — **Built A6 — the "Career Accelerator" 4th plan (PDF requirement).** Added `SubscriptionPlan.CAREER_ACCELERATOR`
  end-to-end: enum + `PLAN_CONFIGS` entry + `PLAN_RANK` (the two exhaustive `Record<SubscriptionPlan,…>` maps; TS confirmed
  no other exhaustive map exists once shared-types was rebuilt). **Billing page:** a 3rd upgrade card + a 4th comparison
  column, positioned between Pro and Enterprise. **CRM:** plan badge color + localized label + the admin plan-change menus
  now include it (so an admin can **grant** the plan even before self-serve checkout exists). **i18n:** `billing.coming_soon`,
  `templates.career_accelerator`, `crm.plan_career_accelerator` × 6 (parity **1471 leaf × 6**). **Checkout is SAFELY GATED:**
  the plan's Stripe price id is **empty**, so the billing card shows it "Coming soon" (disabled) and the checkout mutation
  refuses an empty price — **no fake price can reach Stripe** (mirrors the yearly-billing overcharge guard). It
  **auto-activates** the moment a real price id is set. **ASSUMPTIONS (all are config in `PLAN_CONFIGS` — adjust freely):**
  - **CA1 Positioning:** between Pro and Enterprise → `PLAN_RANK` free 0 < pro 1 < **career 2** < enterprise 3. So it can
    use PRO-tier templates/layouts but NOT ENTERPRISE-tier ones.
  - **CA2 Price:** **$49.99/mo** (between $29.99 and $99.99). `priceYearly` is a 12× placeholder (yearly billing is disabled
    platform-wide).
  - **CA3 Limits:** 25 CVs · 50 cover letters · 250 AI credits/mo · all templates · unlimited exports (above Pro, below
    Enterprise's unlimited CVs/letters).
  - **CA4 Stripe:** **no real price id** → NOT self-purchasable yet. **Client action to go live:** create the Stripe price
    and set `stripePriceIdMonthly` on the CAREER_ACCELERATOR entry in `packages/shared-types/src/subscription.types.ts`.
    Until then, admins can grant it via CRM (useful for comps/testing).
  - **CA5 Name** "Career Accelerator" is kept as a brand term (untranslated) in the badge/label i18n.
  - **Known minor cosmetic gaps (career users don't exist yet, so low-impact):** the `(admin)/admin/users` list plan
    Badge shows the uppercased raw value; the CRM **platform overview** by-plan breakdown + the subscriptions **filter**
    dropdown still enumerate 3 plans (a career user still *displays* correctly via the guards — it's just not a filter
    option / breakdown row; a career bucket would need the backend `usersByPlan` aggregation extended).
  - **QA:** shared-types build ✓; **api type-check ✓ + full suite 19 suites / 209 tests green** (the enum add broke no
    entitlement/payment logic — `@IsEnum(SubscriptionPlan)` now simply accepts the new value); web type-check ✓ (found +
    fixed the 2 exhaustive tier maps on the public templates page); locale parity **1471 × 6**. Billing UI not
    browser-rendered (auth-gated + the usual `next build` gstatic stall) — type-checked, and additive.
- 2026-07-20 — **Activated analytics (GA4) + built PDF/DOCX resume upload (B3) — client unblocked both with explicit
  direction ("use GA4", "implement upload with pdfjs+mammoth", "document every assumption").**

  **① GA4 analytics adapter (D1 now activatable).** Added a `ga4` adapter to `lib/analytics.ts` — lazy-loads gtag.js in
  `init()`, maps the typed event catalog to `gtag('event', …)`, `identify`→`gtag('set',{user_id})`+`user_properties`,
  `page`→manual `page_view`, `reset`→clears `user_id`. Registered in `createAdapter`; **GA4 is now the default provider**.
  **ASSUMPTIONS (GA4):**
  - **A1** Measurement ID comes from **`NEXT_PUBLIC_GA4_MEASUREMENT_ID`** (`G-XXXXXXXXXX`). It is **not set** here (no prod
    credentials), so GA4 currently **no-ops with a dev-console warning** — nothing breaks. The client sets that env var to
    go live.
  - **A2** GA4 is the **default** provider (`NEXT_PUBLIC_ANALYTICS_PROVIDER` unset ⇒ `ga4`); still overridable to
    `console`/`none`.
  - **A3** **Consent-gated by OUR banner:** GA4's script only loads after `setAnalyticsConsent(true)` (the existing cookie
    banner) — we use our own gate, not GA4 Consent Mode. So no GA cookies before consent.
  - **A4** SPA page views are emitted manually (`send_page_view:false`) from `AnalyticsProvider` route changes.
  - **A5** **CSP:** if the deployment enforces a Content-Security-Policy, it must allow `https://www.googletagmanager.com`
    (script-src) and `https://*.google-analytics.com` (connect-src/img-src). Not currently a documented CSP — flagged.
  - **A6** Event names are sent to GA4 as-is (snake_case, GA4-valid). `sign_up`/`sign_in` overlap GA4 "recommended"
    events; fine to send, can be refined later. Using `user_id`/`user_properties` assumes the client enables **User-ID**
    in the GA4 property.

  **② PDF/DOCX resume upload (B3 file-upload — the last ◐ piece of B3).** Installed **`pdfjs-dist` 6.1 + `mammoth` 1.12**.
  New `lib/extractResumeText.ts` extracts text **client-side** (PDF via pdfjs, DOCX via mammoth, both dynamically
  imported) and drops it into the existing `ImportResumeModal` paste box → the **existing `POST /cvs/import`** flow. New
  "Upload PDF or DOCX" button + hint + "or paste" divider; typed `ResumeExtractError` → localized toasts. **+9
  `resume_import` i18n keys × 6 locales** (upload_button/hint/extracting/extracted{name}/or_paste + `extract_error`
  {unsupported,too_large,empty,failed}); parity **1468 leaf × 6**. **ASSUMPTIONS (upload):**
  - **B-A1** **Client-side extraction**, reusing the text `/cvs/import` endpoint — **no binary is uploaded** and no backend
    file-handling was added (simpler, keeps the AI-parse flow identical to paste).
  - **B-A2** pdfjs worker is served from **`/public/pdf.worker.min.mjs`** (same-origin → CSP-safe, no CDN). It is
    **version-pinned to pdfjs 6.1.200** — **re-copy it from `node_modules/pdfjs-dist/build/` on any pdfjs upgrade** (worker
    and API versions must match).
  - **B-A3** **5 MB** max upload; **.pdf/.docx only**.
  - **B-A4** **No OCR** — a scanned/image-only PDF yields no text → an "empty" error that tells the user to paste instead.
  - **B-A5** An upload consumes **1 AI credit** (identical to paste — it goes through the same AI parse). Credit-gated by
    the modal exactly as before.
  - **QA:** api unaffected; **web type-check ✓ (exit 0)** (validates the GA4 adapter + the pdfjs/mammoth dynamic imports +
    the modal); locale parity **1468 × 6**; deps installed. **NOT browser-verified:** the live GA4 hits, the pdfjs
    **worker load**, and the mammoth/pdfjs **webpack bundling** could not be runtime/build-confirmed here (no prod GA id;
    authenticated-UI + production-service constraints; the `next build` again stalls on the environmental
    `fonts.gstatic.com` outage). **→ recommend a quick browser smoke-test after deploy:** (a) set the GA4 id + accept the
    cookie banner → confirm events in GA4 DebugView; (b) upload a real PDF and a DOCX in the import modal → confirm the
    text loads and the CV is created.
- 2026-07-20 — **Settings LOW cluster (F5 + F6) fixed.** **F5 — avatar-preview memory leak:** the optimistic avatar
  preview created a blob URL with `URL.createObjectURL` that was never revoked, so every avatar pick leaked memory; added
  a `useEffect` cleanup that revokes it on replace/unmount. **F6 — account-delete keyword was English-only:** the
  confirmation required typing the English word "DELETE" in all 6 locales (a real barrier for non-English users); now a
  **localized keyword** (`settings.account.deleteKeyword` — ELIMINAR / SUPPRIMER / LÖSCHEN / حذف / حذف), the instruction
  is parameterized (`deleteModalLabel` uses `{keyword}`), and the match is case-insensitive + trimmed. +1 i18n key × 6
  locales (parity **1459 leaf × 6**). Web type-check ✓. Also bumped the doc's stale "Last updated" (07-19 → 07-20). Only
  S4 (endpoint over-fetch) + F7 (unsaved-changes guard) remain as Settings LOWs.
- 2026-07-20 — **Cross-cutting IDOR / object-level-authorization audit → clean (+ 1 privacy fix).** Ran a 10-agent
  find→verify workflow over the four user-owned resource modules (`cv`, `cover-letter`, `jobs`, `export`) hunting broken
  object-level authorization (OWASP API #1 — can user A read/modify/delete user B's data?). **All four are clean:** every
  by-id read/update/delete routes through a `findByIdOrThrow(id, uid)` that enforces `resource.userId === caller` (cv
  `:419`, cover-letter `:102`, jobs `:48`, export via all 4 routes), lists scope by uid, create sets the owner from the
  token, and updates are field-whitelisted. 6 candidate findings raised, **0 confirmed** as cross-user (each verifier
  cited the exact enforcing line). **One real but non-IDOR privacy bug surfaced + FIXED:** `findByPublicSlug` filtered
  `publicSlug`+`isPublic` but **not `deletedAt`**, and `delete()` didn't clear the share flags — so a user who shared a CV
  publicly and then deleted it left the **public URL still live** (deleted content stayed reachable). Fixed both layers:
  `findByPublicSlug` now also filters `deletedAt == null` (equality-only query → no new composite index), and `delete()`
  now clears `isPublic`/`publicSlug`. +2 `cv.service` tests (delete revokes the slug; a lingering-flag soft-deleted row is
  never served). **QA:** api type-check ✓; **full API suite 19 suites / 209 tests green.**
- 2026-07-20 — **AISummaryModal no longer masks an out-of-credits error with a fabricated summary (last AI-review finding).**
  Its catch-all previously fabricated a local summary + "generated locally" toast for EVERY failure — including the 503
  "AI credits exhausted" (the stale-state race where the client thought credits remained), swallowing the upgrade upsell.
  Now a credits error routes to the existing `UpgradeModal`; the honest, clearly-labelled local fallback is kept only for
  genuine transient failures (network/timeout/provider-down). No new i18n. Web type-check ✓. **→ all 10 findings from the
  AI-module review are now resolved.**
- 2026-07-20 — **AI credit gate is now atomic — closed the TOCTOU race (the deferred MED from the AI review).** Replaced
  the check-then-increment gate with a **reserve-before-call / refund-on-failure** design: new
  `UsersService.reserveAiCredit(uid)` runs a Firestore **transaction** that re-reads `aiCreditsUsed`, computes the
  *effective*-plan ceiling (delinquent-past-grace → FREE, capped by the stored limit — logic moved here from `ai.service`),
  and increments only if a credit remains, returning false otherwise; `AIService.generate` reserves up front, throws
  "credits exhausted" if the reserve fails, and refunds in a `finally` when no provider produces a result (so a failed
  generation still costs nothing). This removes the window where N concurrent `/ai/*` requests all passed one stale check
  and all hit the paid model. **Test-double:** added serialized `runTransaction` (+ `InMemoryTransaction`) to
  `InMemoryFirestore` so the reservation is unit-testable — it models Firestore's serializable-transaction guarantee via a
  promise chain. **Also substantially mitigates** the "credit charged for an abandoned/unusable response" MED (now bounded
  by the 20s backend timeout + the outermost-`{…}` JSON recovery; the only residual is a result that lands in the 15–20s
  window after the client aborts). **Tests:** `users.service` +6 (reserve under/at limit, effective-plan cap on a
  delinquent account, missing-user, **concurrency: 10 simultaneous reserves on 2 remaining → exactly 2 succeed**, refund
  decrements); `ai.service` credit tests rewritten to the reserve/refund contract (reserve-before-call, no-refund-on-
  success, refund-on-failure). **QA:** api type-check ✓; **full API suite 19 suites / 207 tests green.**
- 2026-07-20 — **AI module — first dedicated adversarial review (security/cost/robustness) + fixes.** The AI module
  (`/ai/*` endpoints, `ai.service`, providers, and the AI modals) was built rapidly in B1–B6 and had never been reviewed
  or unit-tested. Ran a 24-agent find→verify workflow (3 dimensions: cost/credits, input-validation, robustness+frontend);
  10 findings confirmed. **FIXED this batch (safe, tested):**
  - 🔴 **HIGH — cross-tenant DoS via the shared circuit breaker.** `/ai/generate` took `maxTokens`/`temperature` from an
    inline-interface body (so the global ValidationPipe never ran) and passed them raw to OpenAI. An out-of-range value
    (`temperature:5`, `maxTokens:999999`) is a deterministic OpenAI 400 → `recordFailure` → **3 requests open the
    provider-keyed breaker → every tenant loses AI for 60s**, repeatable at ~3 req/min for zero credits. **Fix (defense in
    depth):** (a) `AIService.clampOptions` clamps maxTokens to a 2048 ceiling + temperature to [0,2] and fixes the
    `|| default` coercion that ate legit `0`s; (b) the breaker no longer counts 4xx client-input errors as provider
    failures; (c) new `GenerateDto` (class-validator) so the endpoint is validated at the edge; (d) the controller passes
    only vetted fields, and the service never forwards a caller-supplied `model` (blocks silent switch to a pricier model).
  - 🟠 **MED — no OpenAI request timeout.** Client was `new OpenAI({ apiKey })` (SDK default 10-min timeout, 2 retries),
    so a stalled call held the handler open for minutes while the frontend aborted at 15s and the credit was still charged.
    **Fix:** `timeout: 20000, maxRetries: 1`.
  - 🟢 **LOW — OpenAI key fragment logged** (first 8 + last 4 chars, CWE-532) → now logs presence only.
  - 🟢 **LOW — brittle AI-JSON parsing.** ATS/Interview/LinkedIn modals + backend `parseResumeSafe` only stripped ```json
    fences before `JSON.parse`, so any model preamble/trailing prose broke parsing and **wasted the already-charged credit**.
    **Fix:** new `lib/ai-json.ts` `extractJsonObject` (fence-strip + slice to the outermost `{…}`) applied to all three
    modals; the same slice added to `parseResumeSafe`.
  - **New tests:** `ai.service.spec` (7, the module's first) — clamping, model-not-forwarded, breaker-ignores-4xx-but-opens-on-5xx,
    credit-gate exhausted/increment. **QA:** api type-check ✓; **full API suite 19 suites / 200 tests green**; web type-check ✓.
  - **PRESENTED — NOT fixed this batch (need a decision / billing-behavior change):** (1) **MED TOCTOU credit race** —
    the credit gate is check-then-increment, so ~N concurrent `/ai/*` requests can all pass one check and all call the paid
    model (bounded by the 100/min global throttle; self-healing; cost-only). Correct fix is a Firestore **transaction**
    that reads+increments atomically (reserve-before-call, refund-on-failure) — deferred because it changes credit
    accounting and the `InMemoryFirestore` test double has no `runTransaction`, so it needs its own test scaffolding.
    (2) **MED credit charged for an abandoned/unusable response** — partially mitigated now by the 20s timeout; the full
    fix (don't bill when the call exceeds the client's abort window / returns unparseable JSON) rides on the same
    reserve/refund rework. (3) **LOW `AISummaryModal` masks ALL backend errors** (incl. 503 credits-exhausted) with a
    fabricated local summary shown as real AI output — recommend matching the sibling modals (error toast / upgrade modal).
- 2026-07-19 — **A2 — added the "usage remaining" detail to the billing page (finishes A2).** Each metered usage item
  (CVs, cover letters, AI credits, exports) now shows a **"N remaining"** line under its progress bar —
  `max(0, limit − used)`, skipped for unlimited limits. New `billing.usage.remaining` key ("{count} remaining") × 6
  locales (RTL included), parity **1458 leaf × 6**. Web type-check ✓. Small polish; the rest of the billing page (plan,
  status, renewal, limits, invoice history) was already in place.
- 2026-07-19 — **A9 — removed the dead, status-blind `SubscriptionGuard` + `@RequiredTier` decorator.** Investigated the
  guard that was "implemented but wired to zero routes." Two findings: (1) it is genuinely **dead** — an exhaustive grep
  shows nothing imports the guard or uses the decorator, and no module registers it; (2) more importantly it is
  **subtly wrong** — it authorizes off the **raw stored** `subscription.plan`, NOT `resolveEffectivePlan()`. Every real
  paid-feature gate (`ai.service`, `cv.service`, `cover-letter.service`, `export.service`) resolves the *effective* plan
  so a delinquent-past-grace PRO user correctly drops to FREE limits; this guard would have let such a user pass a
  `@RequiredTier('pro')` check, silently re-opening the exact hole the A7/A8/C entitlement work closed (pinned by
  `export.service.spec:60`). "Wire it up as-is" was therefore never a safe option. **Removed both files** — the correct,
  status-aware enforcement already lives at the service layer (the real enforcement point). **QA:** api type-check ✓;
  **full API suite 18 suites / 193 tests green** (nothing referenced the deleted code, confirming it was dead). If
  HTTP-layer defense-in-depth is ever wanted, it should be re-built on `resolveEffectivePlan` for chosen routes rather
  than left as broken scaffolding a future dev might trust.
- 2026-07-19 — **A5 — closed the automated-test gap on the highest-business-risk paths (payment lifecycle).** The PDF
  demands automated tests for plan permissions / activation / payment success+failure / cancel / renewal / upgrade /
  downgrade / refund / usage limits / expired access. Audit found most were already covered (refund + dispute +
  idempotency in `payment.service.spec`; grace/expired-access exhaustively in `subscription-entitlements.spec`;
  create-limits + export-gating in the cv/cover-letter/export specs) but the **core money paths through the Stripe
  webhook handler were untested.** Added **9 tests** to `payment.service.spec` (using the existing `InMemoryFirestore`
  double + a mocked Stripe client, so nothing touches real Stripe): **activation** (`checkout.session.completed` writes
  the user plan + subscription record; `verifySession` applies the plan on redirect **and** rejects a session belonging
  to another user / an unpaid session — the session-ownership security check), **renewal** (`invoice.paid` → ACTIVE +
  monthly usage reset), **payment failure** (`invoice.payment_failed` → past_due), **upgrade** & **downgrade**
  (`customer.subscription.updated` re-resolves the plan from the new price), and **cancellation**
  (`customer.subscription.deleted` → downgrade to FREE + free credit limit). **QA:** `payment.service` 22/22; api
  type-check ✓; **full API suite 18 suites / 193 tests green.** No product code changed — pure test hardening; the whole
  A5 PDF list is now covered at the service (enforcement) layer.
- 2026-07-19 — **Built A3 — real billing history + invoice access on the billing page.** The "Billing History" card was a
  hardcoded empty placeholder; it now shows the customer's actual invoices. **shared-types:** new `BillingInvoice` — a slim,
  non-sensitive invoice summary (id, number, status, amountPaid/Due, currency, created, hostedInvoiceUrl, invoicePdf); no raw
  Stripe objects are exposed. **Backend:** `PaymentService.getInvoices(userId)` — **read-only** `stripe.invoices.list` for the
  user's own customer, mapped to `BillingInvoice[]`; **never throws** — returns `[]` when the user has no Stripe customer
  (free/never-subscribed, incl. a fast path that doesn't even call Stripe) or when Stripe isn't configured, so the page degrades
  gracefully. New auth-guarded `GET /payments/invoices`. **Frontend:** the billing-history card now fetches `/payments/invoices`
  with loading (skeleton) / error (+retry) / empty / populated states — each row shows a locale-formatted amount
  (`Intl.NumberFormat` currency), date, invoice number, a localized status badge (paid/open/void/uncollectible/draft), and a
  PDF-download or hosted-invoice link (`target=_blank rel=noopener`, with `aria-label`/`title`). Enabled for all signed-in users
  so a downgraded user still sees past invoices. **i18n:** 9 new `billing.history` keys (loadError/retry/download/view + 5 invoice
  status labels) × 6 locales — non-English generated via a 10-agent translate→verify workflow using each language's standard
  accounting terminology (e.g. de *Uneinbringlich*, fr *Irrécouvrable*, ar *غير قابلة للتحصيل*). **QA:** shared-types build ✓;
  api type-check ✓; **`payment.service` 13/13** (3 new: Stripe-not-configured→[], no-customer→[] without hitting Stripe, and
  invoice→`BillingInvoice` mapping with a mocked `invoices.list`); web type-check ✓; **locale parity exact 1457 leaf × 6.** The
  live Stripe fetch is **NOT runtime-tested** (production-Stripe constraint) — the mapping/guards are unit-tested + type-checked,
  mirroring the checkout/portal code already in this service. This closes the invoice-access half of A3; native in-app
  cancellation (vs. the Stripe portal) + the "usage remaining" text are the remaining billing-page items.
- 2026-07-19 — **Closed Epic R (R4) + swept for and fixed its whole bug class (R30–R35).** Fixed **R4** — the inline job-status
  `<select>` reverted to the stale value mid-save (bound to the `['jobs']` cache, wrote-then-invalidated with no optimistic
  update, never disabled). Replaced with an optimistic React Query `useMutation` (onMutate writes the new status into the cache →
  instant update; onError rolls back to the snapshot + toasts; onSettled re-invalidates) + a per-row pending-disable.
  `(dashboard)/jobs/page.tsx`. **Then, per ultracode, ran a 14-agent adversarial sweep for the SAME bug class** (inline controls
  whose displayed value binds to server cache and that write on change with no optimistic update/pending-disable/rollback) across
  dashboard + CRM + admin + shared. It scanned 10 candidates, verified the jobs fix was now clean, correctly rejected the
  imperative Suspend/Ban action buttons, and **confirmed 6 real siblings → all fixed same-batch (R30–R35)** with the identical
  pattern: CRM users-list plan/role menus (**R30/R31, MED — these also had a double-fire** since the raw buttons weren't disabled),
  admin users-list role select (**R32, MED**), admin ticket-detail status select (**R33, MED**), and CRM user-detail plan/role
  selectors (**R34/R35, LOW**). Optimistic updates use `setQueriesData` (paginated list caches) or `setQueryData` (single-object
  caches) with full rollback on error. **QA:** web type-check ✓ (exit 0) across all 5 changed files. No new i18n. This closes
  Epic R and its entire sibling class.
- 2026-07-19 — **Adversarial self-review of THIS session's new code (analytics + lead funnel + the indexes I'd just added)
  → 15 real defects found, all fixed.** Ran a multi-agent review over the code written this session and treated my own
  new work as suspect. Findings + fixes:
  - **[HIGH] `crm_activities` had NO index at all.** `getActivities` (customer-detail timeline,
    `crm-customers.service.ts:315`) runs `where(customerId) + orderBy(createdAt desc)` — the collection was never in
    `firestore.indexes.json`, so the customer-activity timeline would fail **unconditionally** in production. Added
    `crm_activities (customerId, createdAt)`.
  - **[MED×6] Multi-filter CRM index gaps** — the exact combinations the previous entry flagged as "remaining, low
    priority": `users` role+plan, `crm_transactions` customerId+status, `crm_customers` status+source, `crm_leads`
    stage+assignedTo, `crm_audit_log` two-of-three combos, `subscriptions` two-of-three combos. Rather than wait for a
    prod error to name each one, added them all (with the required triples). **`firestore.indexes.json` now 37 indexes**
    (was 23), JSON validated, no duplicates. ~~**⚠️ still needs `firebase deploy --only firestore:indexes`.**~~
    **Resolved 2026-08-19** by console inspection — see change-log entry that day; 38 composites Enabled.
  - **[MED] GDPR consent-integrity: an unsubscribed lead could be silently resurrected.** `LeadsService.confirm` set
    status→SUBSCRIBED unconditionally, so a stale confirmation link could re-subscribe someone who had explicitly
    opted out. Fixed: `confirm` now refuses (and invalidates the token) if the lead is UNSUBSCRIBED, and `unsubscribe`
    now nulls `confirmationToken` so no live double-opt-in link survives an opt-out. Added a regression test
    (`leads.service` now **8/8**).
  - **[LOW] Non-atomic lead dedupe → possible duplicate rows.** `capture` did query-by-email-then-write, which races
    under concurrent double-submits. Refactored to use the **normalized email as the document id** (`this.col.doc(email)`),
    so a re-submit upserts the same doc — dedupe is now atomic. `findByEmail` reads by id.
  - **[LOW] PII in logs.** `MailService.sendLeadConfirmation` logged the full recipient email; now masked (`a***@x.com`)
    in both the success and error log lines.
  - **[LOW] Analytics typed-event props were always optional.** `track()` now uses conditional rest-args so events with
    required props (`cv_exported {format}`, `checkout_started {plan,interval}`, `ai_generation {feature}`) fail to
    type-check if called without them, while prop-less/all-optional events stay ergonomic. (No call site changed.)
  - **[LOW] Analytics identify went stale on same-session upgrade.** `AnalyticsProvider` only re-identified on uid
    change, so a mid-session plan upgrade kept the old `plan` trait. Now keys on `uid:plan` and re-identifies when
    either changes.
  - **[LOW×2] a11y.** `NewsletterSignup` success + `ConfirmClient` result now expose `role="status"` / `aria-live="polite"`
    so screen readers announce the outcome.
  - One finding rejected on verification (async-adapter init race — no async adapter exists; noted for whoever adds one).
  - **QA:** api type-check ✓ (exit 0); `leads.service` **8/8** ✓; web type-check ✓ (exit 0, proves the conditional
    rest-args `track()` compiles with every existing call site); `firestore.indexes.json` JSON-validated (37 indexes).
    No end-to-end runtime test of the mail/Firestore-write paths (production-service constraint) — covered by unit tests
    + type-check as before.
- 2026-07-19 — **Fixed missing Firestore composite indexes (latent production bug — would surface as "the query requires
  an index").** Two composite queries had **no declared index** in `firestore.indexes.json`, so they'd fail in
  production: **(1)** the **job tracker** list — `job_applications` `where(userId) + where(deletedAt) + orderBy(updatedAt)`
  (from B4, a new collection → its index was certainly never created); **(2)** the **CRM customer purchase-history** —
  `crm_transactions` `where(customerId) + orderBy(date)` (backs the customer-detail page just improved in R20). Added
  both. **Then reconciled the CRM single-filter index gaps too** — derived directly from each list query's filter fields:
  added 13 more composite indexes for the single-filter + orderBy paths (`crm_customers` status/source, `crm_leads`
  stage/assignedTo, `crm_audit_log` action/actorId/targetType, `users` role/plan-alone, `subscriptions` plan/status/userId,
  `crm_transactions` status) so no realistic single-filter CRM list query lacks an index. File now **23 indexes** (no
  duplicates, JSON validated), all mirroring the existing `cvs`/`cover_letters` pattern. The `leads` (C1) queries are all
  single-field equality → auto-indexed, so no entry is needed. ~~**⚠️ ACTION REQUIRED:** run `firebase deploy --only
  firestore:indexes` for these to take effect in production.~~ **Resolved 2026-08-19** by Firebase console
  inspection: **38** composite indexes, all **Enabled**, including the three that would have failed
  unconditionally (`crm_activities` customerId+createdAt, `job_applications` userId+deletedAt+updatedAt,
  `crm_transactions` customerId+date). Deploy had already run; only the record was stale.
  **Remaining (self-documenting, low-priority):** rare MULTI-filter combinations (e.g. `crm_users`
  role+plan together, `crm_transactions` customerId+status) still need their own composite index if
  actually exercised — Firestore names the exact index in its error link when hit.
- 2026-07-19 — **Built Epic C2 (opt-in form) + C4 (double-opt-in email) → the lead funnel now works end-to-end on the C1
  backend.** **Frontend (C2):** `NewsletterSignup` in the footer (so it's on every public page) — an email field + a
  consent checkbox that is **never pre-checked** and keeps the submit **disabled until ticked** (GDPR), POSTing to the
  public `POST /leads` with the **exact consent label shown** + a `CONSENT_VERSION` (so the stored consent record proves
  what was agreed to); on success it truthfully tells the user to **check their inbox to confirm** (because the email is
  actually sent — see C4). New `(public)/confirm` landing page for the email link — a `Suspense`-wrapped client component
  (`useSearchParams`) that calls `GET /leads/confirm?token=…` and shows confirming / subscribed / invalid-link states,
  RTL-aware. **Backend (C4):** `MailService.sendLeadConfirmation(email, confirmUrl)` — inline HTML (no Brevo template
  needed), **best-effort** (swallows errors so a mail failure never fails signup) — wired into `LeadsService.capture`
  (fire-and-forget) for both brand-new and re-opt-in (post-unsubscribe) leads; the confirm URL is built from
  `frontendUrl`. **New i18n:** `newsletter` (9 keys) + `lead_confirm` (6 keys) × 6 locales incl. RTL. **QA:** api
  type-check ✓; `leads.service` now **7/7** (added a test asserting capture triggers the tokened confirmation email);
  web type-check ✓; locale parity exact **1448 leaf × 6**; dev runtime ✓ — `/en` renders the footer opt-in form,
  `/en/confirm`, `/en/confirm?token=…`, `/ar/confirm` (RTL) all **200**, no MISSING_MESSAGE. **The email is NOT
  test-sent** (production-Brevo constraint) — the send is unit-tested + type-checked and mirrors the already-approved
  contact-form Brevo pattern. **Full loop now:** opt-in (consent recorded) → PENDING lead + confirmation email → click
  the link → `/confirm` → SUBSCRIBED. **Follow-ups:** the welcome email + real lead-magnet delivery (rest of C4), the
  unsubscribe page + marketing sends (C6), and the specific "Free ATS Resume Score" magnet (needs a public ATS endpoint).
- 2026-07-19 — **Built Epic C1: marketing lead-capture backend (data model + secure storage + GDPR consent record).**
  **shared-types `lead.types.ts`:** `Lead`, `LeadStatus` (pending/subscribed/unsubscribed), `ConsentRecord`
  (granted/text/version/date/source/ip — immutable proof of exactly what was consented to), `CreateLeadData` — kept
  deliberately **separate from CRM sales-leads** (`crm.types`), since these are newsletter/lead-magnet opt-ins, not
  pipeline deals. **New `leads` NestJS module:** `LeadsService` over a Firestore `leads` collection —
  `capture(data, {ip})` **rejects `consent !== true`** (GDPR: never pre-selected), dedupes by normalized email
  (re-capture refreshes rather than duplicating), stores the consent record + a PENDING status + an unguessable
  **double-opt-in `confirmationToken`** and an **`unsubscribeToken`**; `confirm(token)` → SUBSCRIBED + clears the token
  (idempotent), `unsubscribe(token)` → UNSUBSCRIBED (idempotent), and re-opting-in after an unsubscribe restarts the
  double-opt-in. Public throttled `LeadsController` (`POST /leads` w/ `@Ip`, `GET /leads/confirm`, `GET /leads/unsubscribe`
  — confirm/unsubscribe actioned by unguessable tokens, so no PII in links); `CreateLeadDto` (class-validator:
  email/name/source/consent/consentText/consentVersion, length-capped). Registered in `app.module`. **QA:** shared-types
  dist rebuilt; **api type-check ✓ clean**; new `leads.service.spec` **+6 tests pass** (consent-required reject;
  capture→PENDING with consent record + both tokens; email dedupe/refresh; confirm→SUBSCRIBED + token cleared;
  unknown-token no-op; unsubscribe→UNSUBSCRIBED then re-capture restarts double-opt-in). Endpoint not live-booted
  (production-Firebase constraint — a boot connects to prod), but the service logic is fully unit-tested against the
  `InMemoryFirestore` double and the DI/wiring mirrors the already-boot-verified `jobs` module. **Follow-ups (input/
  provider-gated):** the double-opt-in confirmation **email** dispatch = **C4** (needs the Brevo template + copy); the
  homepage opt-in **UI** + lead magnets = **C2**; the CRM/admin lead **listing** = **C6**.
- 2026-07-19 — **Built the cookie-consent banner (Epic C5 partial) — completes the D1 analytics consent story.** New
  `CookieConsent` component mounted site-wide in the root `[locale]/layout` (inside `AnalyticsProvider`): shows a bottom
  banner **once** until the visitor decides, persists the choice in `localStorage` (`cookie_consent`), links to the
  existing `/cookie-policy` page, and calls **`setAnalyticsConsent(accepted)`** — so the D1 analytics layer stays a
  privacy-safe no-op until the user clicks **Accept** (Decline keeps it off). Renders `null` server-side and appears
  after the client-side storage check, so there's **no hydration mismatch**. RTL-aware, dark-mode, `motion-safe`
  animation, focus-visible rings, `role="region"` + `aria-label`. New **`cookie_consent` i18n namespace** (message,
  accept, decline, learn_more, aria_label) × 6 locales incl. RTL. **QA:** locale parity exact **1433 leaf × 6**; web
  type-check ✓ clean; dev runtime ✓ — `/en`, `/en/cookie-policy`, `/ar` (RTL) all 200 with the banner mounted across
  every route, no MISSING_MESSAGE. (Build gstatic-blocked as before; additive + type-checked.) Now that consent has a
  real UI, choosing an analytics provider (still input-gated) is all that remains to turn tracking on. Also bumped the
  doc's stale "Last updated" (2026-07-18 → -19).
- 2026-07-19 — **Built Epic D1: provider-agnostic analytics / event-tracking layer.** Core module `lib/analytics.ts`:
  a **typed event catalog** (`EventPropMap` — `sign_up`, `sign_in`, `cv_created`, `cv_exported`, `cover_letter_created`,
  `checkout_started`, `plan_upgraded`, `ai_generation`) so `track(name, props)` only accepts known events with the right
  prop shapes; a pluggable **`AnalyticsAdapter`** interface (`track`/`identify`/`page`/`reset`/`init`); a **no-op default**
  + a **console** (dev-debug) adapter; provider selected via `NEXT_PUBLIC_ANALYTICS_PROVIDER` (default `none`); and a
  **consent gate** (`setAnalyticsConsent`, persisted) so it is a **privacy-safe no-op until a provider is chosen AND
  consent is granted** (a future cookie banner calls `setAnalyticsConsent(true)`). New **`AnalyticsProvider`** (mounted
  inside `AuthProvider`) bridges auth + routing: identifies the user on sign-in / resets on sign-out, and fires a page
  view on every route change. **Wired 7 funnel events** at their success sites: `sign_up` (register password + Google),
  `sign_in` (login password + Google), `cv_created` (pick-template create), `cv_exported` (editor toolbar PDF/DOCX export,
  after the server-authorized `/exports/record`), `cover_letter_created` (with `withAI` flag), `checkout_started`
  (Stripe checkout, with plan+interval), `plan_upgraded` (post-checkout verification). Adding a real provider later is
  **one adapter + one env var — no call site changes.** **QA:** web type-check ✓ clean (×3, incl. the typed event
  catalog + provider); dev runtime ✓ — `/`, `/login`, `/register`, `/cv/new` all 200 with `AnalyticsProvider` wrapping
  every route, no errors (analytics no-ops by default). (Production build blocked again by the intermittent
  `fonts.gstatic.com` outage — additive + type-checked, so it builds clean when the network holds.) **Still input-gated:**
  which analytics provider to use (GA4 / PostHog / Segment / …) and wiring the consent banner (part of Epic C5).
- 2026-07-19 — **Closed the R-verify-gap: re-verified + fixed the 5 builder-area findings that had gone unverified.** The
  original audit re-run's 5 builder verifiers had died on a session-usage limit, so those findings were left unconfirmed.
  Re-verified all 5 by reading the code: **all real.** One duplicated R11 (already fixed); the other 4 were the same
  fix-classes already approved and are now fixed (pure Tailwind, no i18n): **R26** — `ActivityTimeline` connector line
  `left-[17px]` → logical `start-[17px]` (was detaching from the icons in RTL). **R27** (was flagged HIGH) — the CV
  `EditorToolbar` right action row (undo/redo/Font/Design/ATS/Interview/LinkedIn/Export) was `flex items-center gap-1`
  with no wrap → overflowed off-screen on phones; now `flex flex-wrap items-center justify-end gap-1`. **R28** —
  `AISummaryModal` was the one builder modal without a height cap; panel → `flex max-h-[90vh] flex-col overflow-hidden`
  and body → `flex-1 overflow-y-auto`, so header/footer stay put and the body scrolls on short viewports (matching its 4
  sibling modals). **R29** — `CVEditor` photo-remove badge `-right-1` → logical `-end-1` (was pinned to the wrong corner
  in RTL). **QA:** web type-check ✓ clean; dev runtime ✓ — `/cv/[id]` (hosts EditorToolbar/CVEditor/AISummaryModal) +
  `/templates` compile 200. **→ Epic R is now fully closed: all 25 confirmed findings fixed + all 5 re-verify-gap findings
  resolved. The 2026-07-17 audit is honestly and completely closed out.**
- 2026-07-19 — **Fixed Epic R UX-polish cluster (7 findings: R2, R3, R16, R18, R19, R20, R21).** **Pending/disabled states:**
  the Google sign-in/sign-up buttons now carry a `googleLoading` state (spinner + `disabled`, re-entrancy guard) and the
  email submit button is disabled during Google auth, so neither can double-fire (R2/R3); verify-email sign-out got a
  `loggingOut` state (`disabled` + error toast `verify_signout_failed`) (R16). **Honest post-checkout:** billing now shows
  a "Confirming your payment…" spinner banner while the Stripe session verifies (`verifying` state), so the user no longer
  briefly sees free-plan upgrade cards after paying (R18). **Scoped pending:** the CV "Duplicate" button now tracks a
  `duplicatingId` so only the card being duplicated shows the pending state, not all of them (R19). **Honest empty/error
  states:** customer purchase-history got `isLoading`/`isError` → a skeleton while loading and an error message
  (`crm.data_load_error`) on failure instead of a misleading "No transactions" (R20); the subscriptions list distinguishes
  a search miss (`subs_search_empty`, "…on this page match your search") from a truly-empty list (`subs_empty`), so
  client-side page-scoped search no longer implies zero subscriptions (R21). **3 new i18n keys × 6 locales**
  (`crm.subs_search_empty`, `billing.verifying_payment`, `auth.verify_signout_failed`). **QA:** locale parity exact
  **1428 leaf × 6**; all keys present; web type-check ✓ clean; dev runtime ✓ — login/register/verify-email/billing/cv/
  subscriptions all 200, no MISSING_MESSAGE. (Build again gstatic-blocked; CSS/logic-only + type-checked.) **→ Epic R now
  24/25 (R1 + functional 8 + responsive 8 + polish 7); only the R-verify-gap re-check of 5 builder findings remains.**
- 2026-07-19 — **Fixed Epic R responsive cluster (8 findings: R11–R15, R23–R25) — pure Tailwind, no i18n.** **R11:**
  `TemplatePreviewModal` now stacks vertically below `lg` (`flex-col lg:flex-row`; preview pane `min-h-[45vh] lg:min-h-0`;
  info panel `w-full lg:w-80`) so the 288px info panel no longer crushes the preview to a sliver on phones. **Modals get
  internal scroll:** CRM Add-Transaction (R14) and Add-Customer (R15) Cards → `max-h-[90vh] overflow-y-auto` so the form
  isn't clipped on short viewports. **Text overflow → wrap:** long emails on verify-email (R12) and settings account (R13)
  → `break-all`; job notes (R24) → `break-words` (a pasted URL no longer overflows). **RTL:** landing Hero browser-mockup
  status dot `mr-2` → logical `me-2` (R23). **Truncation:** TopBar user-name span → `max-w-[8rem] truncate` in the
  fixed-height header (R25). **QA:** web type-check ✓ clean; dev runtime ✓ — `/templates`, `/`, `/jobs`, `/crm/revenue`,
  `/verify-email` all 200. (Production build again blocked mid-run by the intermittent `fonts.gstatic.com` outage;
  CSS-only + type-checked, so it builds clean when the network is stable.)
- 2026-07-19 — **Fixed Epic R functional-correctness cluster (8 findings: R5–R10, R17, R22).** The "things silently break"
  group. **Silent failures → surfaced:** CRM user-management mutations (suspend/reactivate/change-plan/change-role) had NO
  `onError` — added error toasts reusing the existing `user_detail_toast_*_failed` keys (R8); CRM super-admin settings
  `saveSection` did `await mutateAsync` with no try/catch (unhandled rejection on failure) — wrapped in try/catch +
  `settings_save_error` toast (R9); CRM dashboard overview query had no error branch — added `isError` + a red error
  banner instead of silent all-zero KPIs (R22); CV list (R5) and template-picker (R7) queries had no error state — added
  `isError` branches (an error card / a banner) so a fetch failure no longer masquerades as "empty account"/dead-ends CV
  creation. **Double-submit → guarded:** cover-letter "Create blank" vs "Generate with AI" now each carry
  `disabled={createMutation.isPending}` so one disables the other (R6); admin template delete now shows a
  `window.confirm(delete_template_confirm)` and disables while `deleteMutation.isPending` (R10); the settings "Send reset
  link" button got a `sendingReset` pending state (`loading`+`disabled`, re-entrancy guard) so it can't fire multiple
  reset emails (R17). **5 new i18n keys × 6 locales** (`crm.settings_save_error`, `crm.data_load_error`,
  `template_picker.load_error`, `dashboard.load_error`, `admin.delete_template_confirm`). **QA:** locale parity exact
  **1425 leaf × 6**; all 5 new keys present in every locale; web type-check ✓ clean; dev runtime ✓ — all 8 affected routes
  (crm dashboard/users/settings, cv list, cover-letters/new, pick-template, admin templates, settings) compile **200**
  with no MISSING_MESSAGE. (Production build was blocked mid-run by the intermittent `fonts.gstatic.com` outage — same
  environmental stall as prior batches; type-check + dev-compile stand in until the network is stable for a full build.)
- 2026-07-19 — **Fixed Epic R / R1 (HIGH): CRM had no mobile layout.** The `(crm)` section rendered a permanently-docked
  256px sidebar with no drawer/toggle, crushing every CRM page to ~71px of content on phones. Rebuilt `CRMSidebar` as a
  responsive drawer (props `open`/`onClose`; `fixed inset-y-0 start-0 -translate-x-full` off-canvas below `lg`, `lg:static
  lg:translate-x-0` docked above; RTL-correct closed transform `rtl:translate-x-full`; mobile overlay; mobile close (X)
  button; Escape-to-close; nav links + back-to-app call `onClose` to dismiss on navigate) and updated `(crm)/layout.tsx`
  to hold `sidebarOpen` state + a `lg:hidden` mobile top bar with a hamburger button (`aria-label` = `common.open_menu`),
  wrapping `<main>` in a flex column with `p-4 sm:p-6 lg:p-8`. Mirrors the already-working admin drawer pattern exactly;
  reused existing `common.{open_menu,close_menu,main_navigation}` (no new i18n keys). **QA:** web type-check ✓; build ✓
  **Compiled successfully + static 5/5**; dev runtime ✓ — `/crm` + `/crm/customers` + `/ar/crm` serve 200 with the
  responsive off-canvas classes bundled, no MISSING_MESSAGE (drawer behavior itself not click-tested — CRM is
  super-admin-gated). Chose R1-first per client direction; remaining Epic R items (R2–R25 + re-verify 5 builder findings)
  await a reassessment decision.
- 2026-07-19 — **Re-ran the 2 audit dimensions that died on 07-17 (ux-states, visual-responsive) — REVIEW ONLY, no code
  changes.** Adversarial find→verify workflow (4 areas × 2 dimensions → per-finding verification). They were **not clean:
  25 findings CONFIRMED** (1 HIGH, 14 MED, 10 LOW; 5 raw findings rejected as already-handled). Headline (HIGH): the
  entire **CRM section has no mobile layout** — the 256px sidebar is permanently docked with no drawer/toggle, crushing
  every CRM page to ~71px of content at 375px (the admin layout already has the collapse pattern to copy). MED cluster:
  several data queries lack **error states** (CV list, template picker, CRM dashboard/settings/users mutations) so
  failures render as empty/zero data or fail silently; a few **modals lack max-height/internal scroll**; two async
  buttons allow **double-submit** (cover-letter create, password-reset). Recorded as **Epic R** (§7) with exact
  file:line. 5 builder-area findings were left unverified (verifier agents hit a session usage limit) — flagged for
  re-check. Awaiting approval on scope before fixing. **→ Epic Q (enterprise-quality push) batches 1–5 COMPLETE; the audit
  is now honestly closed out with its gap filled.**
- 2026-07-19 — **Enterprise-quality Q-Batch 5: small a11y polish (closes the audit's remaining a11y items).** Nine
  targeted fixes across 7 files: **(1)** `AISummaryModal`'s "Click to edit" preview was a mouse-only `<div>` with a
  hardcoded English `title` → now `role="button"` + `tabIndex` + `onKeyDown` (Enter/Space) + focus ring, and the label is
  i18n'd (`cv_builder.click_to_edit`). **(2)** `FontPanel` toolbar toggle got `aria-label`/`aria-haspopup="dialog"`/
  `aria-expanded={open}`. **(3)** CRM settings `Toggle` got `role="switch"` + `aria-checked` + `aria-label={label}` + a
  visible focus ring (was `focus:outline-none` with no replacement). **(4)** admin templates edit/delete icon buttons got
  `aria-label`s (`admin.edit_template` / `common.delete`). **(5)** settings avatar Camera button got `aria-label`
  (`settings.avatar.change`). **(6)** CRM add-customer modal close button got `aria-label` (`crm.close`) + `type=button`.
  **(7,8)** click-only navigation rows in admin users + CRM customers are now keyboard-operable (`tabIndex=0` +
  `onKeyDown` Enter + focus-visible ring). **(9)** CRM customers sortable column headers got `aria-sort`
  (ascending/descending/none from `sortBy`+`sortOrder`) + `tabIndex` + `onKeyDown` (Enter/Space). **3 new label keys ×
  6 locales** (`click_to_edit`, `crm.close`, `settings.avatar.change`). **QA:** locale parity exact **1420 leaf × 6**;
  web type-check ✓; build ✓ Compiled + static 5/5; dev runtime ✓ — settings, admin templates/users, crm customers/
  settings, and the CV editor (`/cv/[id]`, hosts AISummaryModal + FontPanel) all compile **200** with no MISSING_MESSAGE.
  **→ Epic Q batches 1–5 COMPLETE.** Only the 2 dead audit dimensions (ux-states, visual-responsive) remain to re-run.
- 2026-07-19 — **Enterprise-quality Q-Batch 4: full CRM area i18n sweep (the largest batch).** The entire internal CRM/
  owner area — **11 pages + the `(crm)` layout + 6 components** (`CRMSidebar`, `CRMStatCard`, `CRMStatusBadge`,
  `CustomerGrowthChart`, `RevenueChart`, `ActivityTimeline`), ~4,700 lines — had **zero i18n and no `crm` namespace**.
  Now fully localized under a **new `crm` namespace, 341 keys × 6 locales**. Executed as three multi-agent workflows with
  adversarial verification: **(1) Discovery** — 14 parallel readers enumerated **384 raw strings → 339 unique keys**
  (resolved 7 display-vs-data key conflicts, decoded HTML entities, flagged data values to exclude). **(2) Translation** —
  70-agent translate→verify pipeline (7 area-groups × 5 locales × 2), then post-processing decoded a few re-introduced
  `&amp;` entities, back-filled `platform_users` (a shared key one group dropped), and validated **completeness +
  placeholder integrity** programmatically. **(3) Page wiring** — 22-agent wire→verify pipeline replaced **357 hardcoded
  literals** across the 11 pages (module-level label arrays refactored to `labelKey`+`t()`; dynamic ICU placeholders wired
  to real vars; data enums correctly skipped); the 6 shared components + interval keys wired by hand. Verify caught **1
  real defect** — `subscriptions` rendered `{sub.interval}ly` (English word-construction) → added `subs_interval_monthly/
  yearly` and localized it. Also **localized the plan/role enum displays** (users list + detail, subscriptions) via the
  existing `plan_*`/`role_*` keys with known-set guards; **Stripe subscription statuses** kept in canonical English (no
  complete localized key set — standard for billing states); customer/lead/transaction statuses localized via the
  rewritten `CRMStatusBadge` (English `LABEL_MAP` → value→key map + `t()`). Sidebar nav labels became keys resolved by
  `t(label)`. Data-derived values (emails, names, counts, dates) intentionally left raw. **QA:** locale parity **exact —
  1417 leaf keys × 6** (crm 341 × 6); **static MISSING_MESSAGE proof** — all 329 referenced crm keys present in every
  locale; type-check ✓ clean (×3, after each wiring stage); web build ✓ **Compiled successfully + static 5/5**; dev
  runtime ✓ — **all 9 CRM route paths compile 200 in en + ar (RTL)** with no MISSING_MESSAGE / IntlError. Temp scaffolding
  files removed. Pure frontend i18n; no logic change. (Only Q-Batch 5 small-a11y + the 2 dead audit dimensions remain in
  Epic Q.)
- 2026-07-18 — **Enterprise-quality Q-Batch 3: admin audit-logs + templates pages i18n.** Both admin pages already
  imported `useTranslations('admin')` but hard-coded ~37 strings between them. **Audit-logs:** wired the heading/subtitle,
  the action filter (label + 6 options), all 5 table headers, the Before/After diff labels, the empty state, and the
  paginator — reusing existing `admin.audit_logs`/`previous`/`next`/`error_loading` and adding 17 new keys (incl.
  `audit_pagination` = "Page {page} of {pages} ({total} total)"). **Templates:** wired the subtitle, create button + toasts
  (created/updated/deleted), empty state, card "Updated {date}", and the whole create/edit modal (title, name label +
  placeholder, Category & Tier selects with their options, Cancel/submit) — reusing `admin.templates`/`error_loading` +
  `common.{free|pro|enterprise|cancel}` (added a `tc = useTranslations('common')`) and adding 17 new keys. **34 new
  `admin` keys × 6 locales**, produced by a **10-agent translate→adversarial-verify workflow** (native translator +
  back-translation/placeholder/terminology reviewer per locale); reviewers made house-style corrections (e.g. Spanish
  `create_first_template` → "Crear tu primera plantilla" to match the repo's existing "Crear tu primer CV"), and
  deliberately distinguished the audit **event-noun** filter labels (es "Creación/Actualización") from the modal's
  **imperative** buttons (es "Crear/Actualizar"). Data-derived values (the `log.action`/`tier`/`category` badges and API
  error toasts) were intentionally left raw, as they reflect stored system values. **QA:** locale parity **exact — 1076
  leaf keys × 6** (admin namespace 38→72 in every locale); **static MISSING_MESSAGE proof** — all 39 referenced `admin` +
  4 `common` keys present in every locale; `{page}/{pages}/{total}/{date}` placeholders verified, zero HTML entities; web
  **type-check ✓** clean; web **build ✓ Compiled successfully + static 5/5**; dev **runtime ✓** — `/admin/audit-logs` +
  `/admin/templates` compile in en + ar (RTL) with no MISSING_MESSAGE. Pure frontend i18n; no logic change.
- 2026-07-18 — **Enterprise-quality Q-Batch 2: `TemplatePreviewModal` i18n (customer-facing paywall was 100% English).**
  The full-screen template-preview modal (reached from the public `/templates` gallery and the `/cv/new` pick-template
  flow) hard-coded ~18 English strings incl. the upgrade wall, perks list, and CTAs — a customer-facing paywall shown to
  paying prospects in every locale. **Wired it to next-intl** following the exact pattern `TemplateCard` already uses:
  `useTranslations('template_picker')` + `useTranslations('common')`, and `tierName = tCommon(tierLabel.toLowerCase())`
  so the tier is **displayed** localized (`common.pro|enterprise|free`) while the raw `tierLabel` stays canonical English
  for logic (`tierLabel === 'Enterprise'` icon switch etc.). **Reused 9 existing `template_picker` keys** (`preview_aria`,
  `benefit_exports/templates/ai/support`, `upgrade_to`, `maybe_later`, `select_template`, `use_free`) — so the modal's
  copy is now consistent with the card/paywall — and **added 8 new keys** (`preview_title`, `locked_desc`, `unlocked_desc`,
  `plan_includes`, `perk_branding`, `accent_color`, `readonly_note`, `back_to_gallery`) **× 6 locales**. Translations were
  produced by a **10-agent translate→adversarial-verify workflow** (one native-level translator + one back-translation/
  placeholder-integrity/terminology reviewer per locale); the reviewers caught **2 real defects I then fixed**: German
  `perk_branding` had an HTML-escaped `&amp;` (would render literally — house style uses a bare `&`), and the French
  strings used straight `'` where the neighbouring `coverLetters.accent_color` uses the typographic `’` (normalized, so
  `accent_color` is now byte-identical). **QA:** locale parity **exact — 1042 leaf keys × 6**; all 8 keys present in all 6
  with `{tier}` placeholder preserved; **static MISSING_MESSAGE proof** — all 17 `template_picker` + 4 `common` keys the
  component references exist in every locale (zero-risk, verified programmatically); web **type-check ✓** clean; dev
  **runtime ✓** — `/en/templates`, `/en/cv/new`, `/ar/templates` (RTL) all **200**, `/[locale]/templates` +
  `/[locale]/cv/new` compile with **no MISSING_MESSAGE / IntlError**; web **build ✓ Compiled successfully + static 5/5**
  (a transient `fonts.gstatic.com` outage mid-batch stalled two build attempts — confirmed environmental via a direct
  probe, HTTP 000→200 on recovery; the final build ran clean once the network returned). Pure frontend i18n; no logic
  change. (Q-Batch 3–5 + the 2 dead audit dimensions remain — see §7 Epic Q.)
- 2026-07-18 — **Enterprise-quality Q-Batch 1: dialog accessibility (focus trap + Escape + dialog semantics).** First batch
  of the enterprise-premium quality push (from the 24-finding quality audit; a11y headline = the shared Modal + all 5 AI
  modals lacked focus-trap/Escape/dialog-role). **New `useModalA11y(open, onClose)` hook** (`apps/web/src/hooks/`): on open
  it saves the active element, moves focus into the dialog (first focusable, else the panel), and installs a **capturing**
  keydown listener (Escape → close; Tab/Shift+Tab → focus trapped within the panel); on close it removes the listener and
  restores focus to the previously-focused element. Depends only on `open` (onClose is read through a ref, so focus is set
  once per open — not re-run per keystroke). **Applied to the shared `ui/Modal.tsx`** (which backs settings/admin/
  cover-letters/TemplateCard/UpgradeModal) — now `role="dialog" aria-modal="true" aria-labelledby` (via `useId`) + close
  button `aria-label={common.close}` — **and to all 5 AI modals** (`ATSCheckModal`, `InterviewPrepModal`, `LinkedInModal`,
  `AISummaryModal`, `ImportResumeModal`): each panel gained `ref`/`role="dialog"`/`aria-modal`/`aria-labelledby`/
  `tabIndex=-1`/`outline-none`, each title an `id`, and `AISummaryModal`'s previously-unlabeled close button got an
  `aria-label`. **QA:** no new i18n keys (reuses `common.close`) → locale parity unaffected; web type-check ✓ (clean);
  web build ✓ **Compiled successfully** + static **5/5** (exit 1 only from the known Windows EPERM standalone-symlink,
  which occurs *after* compile + type-check + static-gen — benign); dev runtime ✓ — `/en`, `/cv/new`, `/dashboard`, and
  `/cv/[id]` (2003 modules — hosts all 4 AI modals + the hook) all compile **200** with **no MISSING_MESSAGE / module
  errors**. Pure frontend a11y — no visual/behavioral change for mouse users; keyboard + screen-reader users now get
  proper focus management and Escape-to-close on every dialog. (Q-Batch 2–5 + the 2 audit re-runs tracked in §7 Epic Q.)
- 2026-07-18 — **Built A7c: dunning banner (payment-recovery UX).** Attempted **B3 file-upload (PDF/DOCX)** first but the
  `mammoth`/`pdfjs-dist` install **failed** — the npm registry socket-timed-out on `canvg` (a pdfjs dep); `package.json`
  left unchanged (no partial damage; build confirms no "Cannot find module"). Pivoted to A7c (no-dep, no-input, real
  value). Also found **A2 already implemented** (billing page shows plan/status/renewal/usage/limits + progress bars).
  **A7c:** new `DunningBanner` in the dashboard layout — when `subscription.status` is delinquent (past_due/unpaid/
  incomplete, via shared `DELINQUENT_STATUSES`) it shows a payment-failed alert + "Update payment method" → Stripe
  portal (`create-portal-session`); returns null otherwise. New `dunning` i18n namespace (4 keys × 6 locales incl. RTL).
  **QA:** locale parity ✓ (4 × 6); web type-check ✓; web build compiled + static 5/5 ✓; `/en` + `/ar` `/dashboard`
  routes compile in dev (200). Frontend-only. The banner only renders for a delinquent account (can't simulate without
  a delinquent production user), but the status logic is type-checked + trivial; non-delinquent users see nothing (safe).
- 2026-07-18 — **Built B6: LinkedIn optimizer → Epic B (career features) COMPLETE.** **Backend:**
  `ai.service.linkedinOptimize(cvContent, targetRole)` — structured-JSON prompt (optimized headline, About section,
  skills/keywords, tips), credit-gated via `generate()`; `POST /ai/linkedin`. **Frontend:** `LinkedInModal` (optional
  target-role input; the edited CV is auto-serialized; parses the AI JSON stripping ``` fences; renders headline/About
  (each with copy-to-clipboard), skill chips, and tips; credit-gated + states) opened by a new **"LinkedIn" toolbar
  button** in `EditorToolbar`. New `linkedin` i18n namespace (16 keys × 6 locales incl. RTL; reuses `cv_builder`
  credits + `common`). **QA:** locale parity ✓ (16 × 6); api type-check ✓ (last full run 173/173); `/ai/linkedin`
  401-guarded; web type-check ✓; web build compiled + static 5/5 ✓; CV-editor route compiles in dev (200). Not
  runtime-tested end-to-end (production-OpenAI constraint) — verified via compile + endpoint guard + the proven AI-tool
  pattern. **The CV editor now hosts 3 AI career tools** (ATS · Interview · LinkedIn) alongside AI Summary; the toolbar
  is getting busy — a future "AI Tools" dropdown could tidy it (noted, not blocking).
- 2026-07-18 — **Built B5: Interview prep (AI career tool).** **Backend:** `ai.service.interviewPrep(jobDescription,
  cvContent)` — structured-JSON prompt (behavioral + technical questions, questions-to-ask, tips), credit-gated via
  `generate()`; `POST /ai/interview-prep` (`ai.controller`). **Frontend:** `InterviewPrepModal` (paste a JD; the edited
  CV is auto-serialized as candidate context; parses the AI JSON stripping ``` fences; renders 4 sections;
  credit-gated + loading/error states, mirroring `ATSCheckModal`) opened by a new **"Interview Prep" toolbar button**
  in `EditorToolbar` (next to ATS). New `interview` i18n namespace (14 keys × 6 locales incl. RTL; reuses `cv_builder`
  credit strings + `common`). **QA:** locale parity ✓ (14 × 6); api type-check ✓ + **173/173** (no regression);
  `/ai/interview-prep` 401-guarded; web type-check ✓; web build compiled + static 5/5 ✓; CV-editor route compiles in
  dev (200). Frontend + a thin backend method. **Not runtime-tested end-to-end** — the live AI call needs auth + a real
  credit against production OpenAI (no-production-testing constraint); verified via compile + endpoint guard + the
  proven ATS/Summary pattern.
- 2026-07-18 — **Built B4: Job tracker (new full-stack feature).** **Shared types:** `JobStatus` enum (wishlist/
  applied/interviewing/offer/rejected/accepted) + `JobApplication`/`CreateJobData`/`UpdateJobData` (`job.types.ts`),
  dist rebuilt. **Backend:** new `jobs` module — `JobsService` (Firestore `job_applications`, userId-scoped list,
  ownership-checked get/update/delete, soft-delete, update **field-whitelist** so `userId`/`id` can't be reassigned) +
  `JobsController` (`/jobs` CRUD, `FirebaseAuthGuard`) + class-validator DTOs (`CreateJobDto`/`UpdateJobDto`);
  registered in `app.module`. **Frontend:** `/dashboard/jobs` page (list of application cards, status filter chips,
  per-card quick status `<select>`, edit/delete, empty/loading/error states) + `JobFormModal` (add/edit) + a "Job
  Tracker" sidebar nav link; new `jobs` i18n namespace (32 keys + 6 nested status × 6 locales incl. RTL) +
  `dashboard.job_tracker`. **QA:** shared-types built; api type-check ✓; new `jobs.service.spec` (+6: create defaults,
  user-scoped list, IDOR/404 on get, update whitelist + mass-assignment drop, cross-user update blocked, soft-delete)
  → **api 173/173**; app boots (health 200 — module wired); `/jobs` GET+POST 401-guarded; web type-check ✓; locale
  parity ✓; web build compiled + static 5/5 ✓; `/jobs` route renders 200 in en + ar (RTL). Full CRUD is unit-tested;
  the authenticated UI itself isn't runtime-clicked (production-account constraint).
- 2026-07-18 — **Built B3: resume import + parsing (paste-based).** Lets a user import an existing resume instead of
  starting blank. **Backend:** `ai.service.parseResume(resumeText)` (structured-JSON prompt via `generate()`, credit-
  gated); `CVService.importFromResume(userId, {title?, resumeText})` — parses first (AI-call failures propagate so no
  empty CV is created), then builds a populated CV (personal info + summary + experience/education/skills sections),
  with a **safe fallback** that keeps the raw text as the summary if the model output is unparseable (nothing lost);
  `POST /cvs/import` (`cv.controller`); `CVModule` now imports `AIModule` (no circular dep — app boots, health 200).
  **Frontend:** `ImportResumeModal` (paste text, credit-gated like the other AI features) + an "Import from an existing
  resume" entry on the `cv/new` page → on success navigates to the new CV; new `resume_import` i18n namespace (10 keys
  × 6 locales incl. RTL). **QA:** api type-check ✓; **+4 tests → api 167/167** (structured build, ```json fence
  stripping, malformed→summary fallback, limit-block-before-AI-spend); web type-check ✓; web build compiled + static
  5/5 ✓; `/cvs/import` 401-guarded; `cv/new` route compiles in dev (200, en + ar). **Not runtime-tested end-to-end** —
  the AI parse needs auth + a real credit against production OpenAI (no-production-testing constraint); covered by unit
  tests + endpoint guard. **Deferred:** file **upload** (PDF/DOCX text extraction) — needs `pdfjs`/`mammoth` deps
  (network install; flaky here). Paste covers the core import value now.
- 2026-07-18 — **Wired B2: AI Summary assistant (another hidden feature made live).** `AISummaryModal` existed, fully
  built + i18n'd (verified all 25 keys present ×6 locales), but no UI ever opened it. Added a contextual **"Generate
  with AI" button next to the CV summary field** in `CVEditor` (more intuitive than a toolbar button, since it targets
  the summary specifically), rendering the modal with `cvId={cv.id}`. **QA:** web type-check ✓; web build compiled +
  static 5/5 ✓ (transient font ECONNRESETs but recovered; EPERM only); `POST /ai/cv-summary` 401-guarded; CV-editor
  route compiles in dev (200). Frontend-only. Same runtime caveat as B1 (live AI generation needs auth + a real credit
  against the production OpenAI account — not tested; verified via compile + endpoint guard + the modal's existing
  proven logic).
- 2026-07-18 — **Built B1: ATS score checker UI (first feature epic — closes a marketed-but-hidden feature).** The
  `POST /ai/ats-check` backend existed but had no UI. Added: `lib/serializeCV.ts` (CV + visible sections → plain text);
  `ATSCheckModal` (paste a job description → analyzes the edited CV → renders a 0–100 score, matched [green] + missing
  [red] keyword chips, suggestions, and overall feedback; credit-gated exactly like `AISummaryModal` via
  `resolveEffectivePlan` + `UpgradeModal(reason=ai_credits)`; parses the AI JSON, stripping ``` fences; loading/error/
  empty-CV states); an **"ATS Check" toolbar button** in the CV editor (`EditorToolbar`) opening it. New `ats` i18n
  namespace (17 keys × 6 locales incl. RTL; reuses `cv_builder` credit strings + `common`). Placement chosen by the
  client = editor modal. **QA:** locale parity ✓ (17 × 6); web type-check ✓; web build compiled + static 5/5 ✓ (EPERM
  only); `POST /ai/ats-check` 401-guarded; CV-editor route compiles in dev (200). Frontend-only (backend already
  existed). **Not runtime-tested end-to-end** — a live analysis needs auth + a real AI credit against the production
  OpenAI account (no-production-testing constraint); verified via compile + endpoint guard + mirroring the proven
  AISummaryModal pattern. Note: `AISummaryModal` (B2) is likewise still unwired — a natural next feature.
- 2026-07-18 — **Templates i18n/a11y batch (L6 + L8a + L7a) — the CV-creation picker flow.** New `template_picker`
  locale namespace (29 keys × 6 locales incl. RTL ar/ur; reuses `common` for Free/Pro/Enterprise/Upgrade/Back). **L6:**
  `pick-template` page fully localized (step indicator, header, plan banners, tier filter, empty state, toasts).
  **L8a:** `TemplateCard` localized (tier/free badges, lock overlay, Preview, CTA buttons, the Purchase-Required modal +
  benefit list) — tier labels resolved via `common`, logic kept on the canonical value. **L7a:** `TemplatePanel`'s
  "Design" toolbar toggle got `aria-label` + `aria-expanded` (fixes the mobile no-accessible-name a11y bug, since the
  visible "Design" text is `hidden sm:inline`). **QA:** locale JSON parity ✓ (29 × 6); web type-check ✓; web build
  compiled + static 5/5 ✓ (EPERM only); `pick-template` route renders 200 in en + ar (RTL) with fresh JSON (new keys
  resolve, no missing-message). Frontend + locales only. **Deferred (one larger i18n pass):** `TemplatePreviewModal`,
  the `TemplatePanel` design-panel copy/colors/labels, and the broader still-English admin/dashboard pages.
- 2026-07-18 — **Fixed Templates LOW backend batch (L1/L2/L5) — data-minimization + robustness.** **L1:** the public
  (unauthenticated) `GET /templates` + `/templates/:id` now return data-minimized docs — new `toPublic` strips
  `htmlTemplate`/`cssTemplate`/`createdBy`/`isActive`, and `findPublicById` 404s on soft-deleted templates
  (`templates.service` + `templates.controller`); runtime-verified (200, 16 rows, no internal fields). **L2:** added an
  authoritative `CV_TEMPLATE_TIER` map in `shared-types/template.tiers.ts`; `cv.service.checkTemplateAccess` consults it
  first so built-in premium CV templates are gated even when the Firestore catalog is unseeded (closes the prior
  fail-open) — unknown/custom ids still fall back to the catalog doc. **L5:** `seedDefaults` now upserts existing docs so
  code-owned fields (tier/name/description/localization) propagate on re-seed. **QA:** shared-types rebuilt; api
  type-check ✓; **+6 tests → api 163/163**; web type-check ✓; public endpoint runtime-verified. Backend + shared-types
  only. **Deferred (own i18n pass):** L6/L7/L8 — hardcoded English / a11y on `pick-template`, `TemplatePanel` copy +
  mobile toggle, `TemplateCard`/`TemplatePreviewModal`; L3 orphaned backend `cl-*` seeds (harmless).
- 2026-07-18 — **Fixed Templates paywall T1–T5 (approved: full close + graceful fallback).** Closed the systemic
  UI-only paywall. **Single source of truth:** new `packages/shared-types/src/template.tiers.ts` (`CV_LAYOUT_TIER`,
  `COVER_LETTER_TEMPLATE_TIER`, `PLAN_RANK`, `planMeetsTier`, `canUseCvLayout`/`canUseCoverLetterTemplate`,
  `effectiveCvLayout`/`effectiveCoverLetterTemplate`), dist rebuilt. **Server enforcement:** `cv.service` —
  `checkTemplateAccess` is now tier-ORDER (T4, pro≠enterprise) and `update` blocks newly selecting an over-tier
  `styling.layout` (T1), allowing autosave re-sends of the stored value (no data loss on downgrade); `cover-letter.service`
  create+update now enforce template tier the same way (T2). **Graceful fallback (T3):** `LivePreview` +
  `CoverLetterPreview` render the *effective* layout/template (premium design on a downgraded account → free fallback for
  preview + client PDF export; stored value preserved). **T5:** cover-letter autosave + unmount-flush persist
  `templateId` (picks no longer silently revert). `TemplatePanel` now uses the shared map (UI matches server; **`compact`
  layout is FREE** to match the free Compact template — flagged for the client). **QA:** shared-types built; api
  type-check ✓; **+27 tests → api 157/157**; web type-check ✓; web build compiled + static 5/5 ✓ (fonts recovered; EPERM
  only); cv/cover-letter endpoints 401 guarded; editor routes compile in dev (200). **Residual (§8):** 100% client-side
  export means a tampered browser could still render a *stored* premium design — but a FREE user can never store one
  (write-block), and honest downgrade render/export falls back; true export-time enforcement needs the server Puppeteer
  path. The 8 LOW findings (unauth `/templates` endpoint, registry cleanup, pick-template/TemplateCard i18n/a11y) deferred.
- 2026-07-18 — **Reviewed Templates system** (review-only; security/entitlement-focused). 3-dimension adversarial
  workflow (22 agents): **19/19 CONFIRMED, 0 stubs.** All three dimensions independently surfaced the same systemic
  issue → the template/layout paywall is **UI-only**, with no server-side tier enforcement. Distinct: 2 HIGH (T1 CV PRO
  layouts usable/exportable by free users via `styling.layout`, which the server writes unchecked; T2 cover-letter
  service has no tier check at all), 3 MED (T3 export gate never checks template tier → also a downgrade path; T4
  `checkTemplateAccess` is binary PRO/ENTERPRISE-blind; T5 cover-letter template pick never persisted — autosave omits
  templateId), 8 LOW (unauthenticated `GET /templates` leaking internal/soft-deleted docs; `checkTemplateAccess`
  fail-open on missing doc; orphaned backend cover-letter `cl-*` registry; tier drift across registries; seed-only-if-
  missing; hardcoded-English/a11y on pick-template + TemplatePanel + TemplateCard/PreviewModal). Recorded in §6; awaiting
  approval. Suggested fix theme (multiple finders converged): lift the CV-layout and cover-letter template→tier maps into
  shared-types as one source of truth, enforce them server-side in `cv.service` (templateId **and** styling.layout) +
  `cover-letter.service` (create+update) via a plan-ORDER comparison through `resolveEffectivePlan`, and optionally
  re-validate at export by passing the document id.
- 2026-07-18 — **Fixed Support batch 4 = F-B + F-E + B4 → SUPPORT SECTION COMPLETE.** **B4** — per-route `@Throttle`
  on the support controller (ticket create 5/min, message 20/min) on top of the global throttler. **F-E** — admin
  ticket `<tr>` is now keyboard-operable (`role="button"`, `tabIndex`, Enter/Space `onKeyDown`, focus-visible ring,
  translated `aria-label`); `aria-pressed` added to the status filter tabs. **F-B** — i18n'd the admin ticket **list +
  detail** pages via the `admin` namespace, reusing the `support.*Labels` groups for enum values; added **27 admin keys
  ×6 locales** (incl. the previously-missing `admin.error_loading` and a param'd `page_of`). **QA:** api type-check ✓;
  **api 130/130 pass**; web type-check ✓; locale JSON parity ✓ (27 keys × 6); throttled `/support/tickets` still 401
  unauth. **Production `next build` compiled + static pages 5/5 ✓** this run (Google-Fonts network recovered; only the
  pre-existing standalone-symlink EPERM) — this also retroactively confirms the batch-3 admin frontend compiles/static-
  gens. Dev restarted clean; `/en/admin/tickets`, `/en/admin/tickets/:id`, `/ar/support`, `/ar/admin/tickets` all 200
  (fresh JSON loaded → new keys resolve, incl. RTL). Authenticated admin UI itself not runtime-verified (production
  account). **Remaining Support:** only the product-gap observation (no email/notification on ticket creation) — a
  feature decision, not a defect.
- 2026-07-18 — **Fixed Support batch 3 = F-A (approved: make the agent/admin side functional).** **Backend:** added
  `GET /admin/tickets/:id` (returns ticket + message thread; class-guarded admin/super_admin — the user-side endpoint
  enforces ownership so admins couldn't use it) and audit-logged `POST /admin/tickets/:id/messages` (admin reply posts
  as `authorRole:'admin'` → B1 moves the ticket to WAITING_ON_CUSTOMER; customer-facing author is the generic "Support
  Team" so staff emails aren't leaked, while the acting admin is captured via authorId + an `ADMIN_TICKET_REPLIED`
  audit entry). **Frontend:** new admin ticket-detail page (`(admin)/admin/tickets/[id]/page.tsx`) — message thread +
  reply form + a status `<select>` (routed through the audit-logged `PATCH /admin/tickets/:id`); admin list rows now
  open `/admin/tickets/:id` instead of the 403-ing dashboard route. **Discovered + fixed (prerequisite):** the admin
  ticket **list** was contract-broken — it read `data.tickets`/`totalPages`/`userName` but the API returns
  `items`/`limit`/`userDisplayName`, so it always showed "No tickets found"; remapped to `items` + computed
  `totalPages` + `userDisplayName`. **QA:** api type-check ✓; `admin.controller.spec` +2 (getTicket returns
  ticket+thread; replyToTicket posts admin msg + audit-logs) → **api 130/130 pass**; web type-check ✓; both new admin
  endpoints live + guarded (401 GET & POST unauth). The production `next build` couldn't finish this run — it hung
  retrying Google-Fonts downloads (`fonts.gstatic.com` ECONNRESET, a transient environment/network issue, NOT the
  change; two earlier builds this session compiled fine) — so it was verified instead via web type-check + dev-server
  on-demand compilation of `/admin/tickets` and `/admin/tickets/:id` (both 200, no 500). Admin pages remain
  hardcoded-English by design (F-B batch will i18n the whole admin area). Can't runtime-verify the authenticated admin
  UI itself (production-account constraint).
- 2026-07-18 — **Fixed Support batch 2 (approved: "make the ticket-detail flow work").** (1) **Close-button 404** —
  the detail-page close mutation called `PATCH /support/tickets/:id` (no such route); repointed it to the dedicated
  `PATCH /support/tickets/:id/close` (ownership-checked; deliberately not a generic PATCH that would reopen a user-side
  mass-assignment hole). (2) **Missing detail-page i18n** — added the ~15 keys the ticket-detail page uses
  (ticketNotFound/backToTickets/createdOn/closeTicket/messages/admin/noMessages/replyLabel/replyPlaceholder/sendReply/
  ticketClosedMessage/replySent/replyError/ticketClosed/closeError), which were absent from all 6 locales and rendering
  as raw key paths. (3) **F-C** — replaced the hardcoded English priority/status/category label maps (list + detail +
  new pages) with `t()` via new `support.priorityLabels`/`statusLabels`/`categoryLabels` groups; removed the now-unused
  `TicketCategory` imports; new-ticket `<select>` options localized. All new keys added across 6 locales (incl. RTL
  ar/ur). **QA:** locale JSON parity ✓ (15 flat + 4 priority + 5 status + 5 category keys × 6); web type-check ✓; web
  build compiles + static pages 5/5 ✓ (pre-existing standalone-symlink EPERM only); dev restarted clean, `/en` 200.
  Frontend + locales only (no API change). Can't runtime-verify the detail render (needs auth + an existing ticket —
  production-account constraint); relied on parity + type-check + build. Remaining Support: F-A (admin ticket detail),
  F-B (admin-page i18n), F-E (admin row a11y), B4 (rate limit).
- 2026-07-18 — **Fixed Support batch 1 (approved: B1/B2/B3 + F-D).** **B1** — corrected the inverted ticket-status
  mapping in `support.service.addMessage` (customer message ⇒ OPEN/needs-agent; agent reply ⇒ WAITING_ON_CUSTOMER),
  so new tickets and customer replies no longer vanish from the agent queue. **B2** — added class-validator DTOs
  (`CreateTicketDto`, `AddMessageDto`) + wired into `support.controller`, so the global ValidationPipe now validates
  subject/message/content length + presence and category/priority enums and strips unknown fields (interfaces were a
  no-op before). **B3** — `updateTicket` now whitelists admin-updatable fields (status/priority/assignedTo/
  assignedToName/resolvedAt/closedAt), closing the `Partial<SupportTicket>` mass-assignment (no more rewriting
  `userId`/`id`/`createdAt`). **F-D** — dashboard support list gained a real error state (error card + Retry) instead
  of showing failures as an empty inbox; +`support.load_error`/`retry` ×6 locales. **QA:** api type-check ✓; new
  `support.service.spec.ts` (+6: B1 status ×3, B3 whitelist/close ×3) → **api 128/128 pass**; web type-check ✓; web
  build compiles + static pages 5/5 ✓ (pre-existing standalone-symlink EPERM only); locale JSON parity ✓;
  `/support/tickets` live + guarded (401 GET & POST). Backend + one frontend page. **Discovered during the fix (logged
  in §6, deferred):** (1) the ticket-detail **close button 404s** (`PATCH /support/tickets/:id` vs backend `…/:id/close`);
  (2) the ticket **detail page's ~15 i18n keys are absent from all 6 locales** → raw key paths render. Both belong to a
  "make the detail/close flow work" batch (with F-A admin detail).
- 2026-07-18 — **Reviewed Support / tickets area** (review-only). Adversarial workflow (7 agents): frontend dimension
  **5/5 confirmed, 0 stubs**; the **backend authz/validation finder flaked to a stub** (`title:"t"`, `file:"a"`) —
  caught by the anti-stub `.filter()` (0 false findings leaked) and **re-done by direct file read**. Net: user-side
  ownership solid (no IDOR). 2 MED functional/correctness (admins can't open any ticket via UI — no admin detail
  page/endpoint, rows 403 into the owner-guarded route; new tickets + customer replies mislabeled `waiting_on_customer`,
  inverting the agent queue), 1 MED validation gap (ticket/message bodies unvalidated interfaces → ValidationPipe
  no-op), 4 LOW (admin updateTicket mass-assignment [the previously-noted Admin LOW, located here]; no dedicated rate
  limit; admin-page hardcoded English; dashboard hardcoded badge maps; dashboard list no error state; admin row not
  keyboard-accessible), + observation (no email notification on ticket creation). Recorded in §6; awaiting approval to fix.
- 2026-07-18 — **Fixed CRM tier gap (approved, target-tier guard).** New `assertCanManageTarget(actorRole, targetRole)`
  in `crm-users.service` blocks a non-super_admin from suspend/reactivate/plan/reset-usage on a super_admin target
  (403); actor role threaded from `crm-users.controller` into all four service methods. Closes the HIGH (admin could
  suspend+session-revoke super_admins → tier lockout) + LOW (plan/reactivate/reset on super_admin). **QA:** api
  type-check ✓; +4 crm-users tests → **api 122/122 pass**; endpoint live+guarded (401). Backend-only.
- 2026-07-18 — **Reviewed CRM area** (review-only; security-focused). 3-dimension adversarial workflow (5 agents):
  **2/2 CONFIRMED, 0 stubs**; audit/validation/CSV + frontend dimensions clean. Both findings are the sibling-endpoint
  version of the role escalation: HIGH — admin can suspend+revoke a super_admin (`/crm/users/:id/suspend`, no
  target-tier check) → lock out the super_admin tier; LOW — admin can plan/reactivate/reset-usage a super_admin.
  Recorded in §6; awaiting approval to fix (target-tier guard mirroring the role endpoint).
- 2026-07-18 — **Fixed Admin #11 — broken panel wired to CRM (approved).** Frontend-only: admin **Users** page now
  uses `GET /crm/users` (maps `items`→UserData; role→`PUT /crm/users/:id/role` [super_admin], ban/unban→
  `/suspend`+`/reactivate`); admin **Subscriptions** page lists from `GET /crm/subscriptions` (amount÷100) + stats
  from `GET /admin/analytics/revenue`. No backend duplication — reuses the audited CRM endpoints. **QA:** web
  type-check ✓; build compiles + 5/5 static pages ✓ (dev stopped first; restarted clean). Can't runtime-verify
  (needs an admin token — production-account constraint). **Surfaced:** admin/CRM overlap on users/subs/analytics/
  audit → future consolidation decision.
- 2026-07-18 — **Fixed Admin MED — audit-log admin mutations (approved).** Injected the @Global `AuditService` into
  `AdminController`; `PATCH /admin/users/:id` → `ADMIN_USER_UPDATED`, `PATCH /admin/tickets/:id` → `ADMIN_TICKET_UPDATED`
  (actor uid/email/role + resourceId + patch metadata) written to `audit_logs` (the collection the admin audit page reads).
  **QA:** api type-check ✓; new `admin.controller.spec.ts` (+2) → **api 118/118 pass**. Backend-only.
- 2026-07-18 — **Fixed Admin HIGH — privilege escalation (approved, super_admin-only policy).** `crm-users.controller`
  `updateRole` now has method-level `@Roles('super_admin')` (overrides class `@Roles('admin','super_admin')`), closing
  the admin→super_admin self-escalation via `PUT /crm/users/:id/role`; added a last-super_admin guard in
  `crm-users.service.updateUserRole` (blocks demoting the final super_admin). **QA:** api type-check ✓; +3 crm-users
  tests (promote allowed, block last super_admin, allow demote when another remains) → **api 116/116 pass**; endpoint
  live+guarded (401 unauth). Backend-only. Other admin findings (MED audit-log, #11 broken panel, LOW polish) deferred.
- 2026-07-18 — **Reviewed Admin area** (review-only; security-focused). 3-dimension adversarial workflow (14 agents):
  **11/11 CONFIRMED, 0 stubs.** Headline: HIGH vertical privilege escalation (any admin → super_admin via
  `PUT /crm/users/:id/role`, no tier/self/last-super_admin guard); MED admin mutations not audit-logged; LOW ×8
  (client-only route gate, ticket mass-assignment, raw-doc over-fetch, hardcoded English, a11y ×3, admin-UI↔API
  contract drift making the panel largely non-functional). Recorded in §6; awaiting approval to fix.
- 2026-07-18 — **Implemented Batch B — contrast → WCAG AA (approved).** Fixed the 3 failing color pairs across the
  public pages: CTA subtext (brand-200→brand-50 on the brand gradient), white CTA button text (brand-600→brand-700),
  and the LanguageSwitcher section header (stone-400/500 swapped for light/dark). Applied consistently to all
  repeated instances (testimonials, templates ×, about). **QA:** web type-check ✓; target Tailwind classes confirmed
  already generated. Class-only change; no locale/logic impact.
- 2026-07-18 — **Implemented Batch C content (approved).** Truthfulness/de-AI content pass on the About page:
  removed the unverifiable "tested by real HR experts" (`about.value2_desc`) and "career coaches"
  (`about.team_desc`) claims, de-canned `about.value1_desc`, and differentiated the near-duplicate
  `public_templates.cta_subtitle` — all 6 locales, parity verified, unverifiable-claim scan clean. Locale-content only
  (no code change → no build needed). **Deferred with reasoning:** the *visual* redesign of the repeated heroes/CTA
  bands (subjective — belongs to Epic E2 de-AI visual polish + brand refresh with client design direction).
- 2026-07-18 — **Implemented a11y/i18n Batch A (approved).** 13 mechanical fixes across
  `templates/page.tsx` (translated tier/category badges via key-maps + t(); labeled tier filter; aria-pressed tabs;
  sr-only h2; focus-visible Preview; localized toast + load-error; RTL LogIn/ArrowRight), `contact-us/page.tsx`
  (htmlFor/id on category+message; 💡→Lightbulb aria-hidden), `about-us`/`testimonials` (RTL ArrowRight),
  `Footer.tsx` (h4→h3), + 6 new locale keys ×6 locales (parity ✓) and `about.title` de-brand.
  **QA:** web type-check ✓; build ✓ (dev server stopped first this time — no .next collision); dev restarted clean;
  runtime render verification of labels/badges/title (results below). Batches B/C + Flacron-Group item deferred.
- 2026-07-18 — **Re-reviewed public pages a11y/RTL/design-feel** (review-only; the dimension that flaked on 07-17).
  2 focused finders + adversarial verification, 23 agents: **21/21 findings CONFIRMED, 0 stubs** — 3 HIGH (unlabeled
  form controls ×2, hardcoded-English template badges), 12 MEDIUM (contrast ×2, RTL arrows, heading skip, invisible
  focusable button, emoji icon, hardcoded strings ×2, About double-brand title, duplicate CTA/hero patterns, canned
  About claims), 6 LOW. Recorded in §6; awaiting approval to fix.
- 2026-07-18 — **Legal accuracy (input-free part) — subprocessor disclosures.** Privacy Policy Data-Sharing section
  (`privacy.s3_desc`, 6 locales) now discloses **Firebase, Stripe, Brevo, and OpenAI** as subprocessors, with an
  explicit note that OpenAI processes submitted CV/cover-letter content on US servers (GDPR Art. 13(1)(e)/44).
  Privacy `last_updated`→"July 18, 2026". OpenAI/Brevo intentionally NOT added to the Cookie Policy (they set no
  browser cookies). Parity verified across all 6 locales. **QA:** JSON valid + parity + content confirmed; dev server
  was corrupted by earlier prod builds (500s) so it was killed, `.next` cleared, and restarted clean to re-verify.
  **Still needs client input:** legal entity name/address, governing law/jurisdiction, and `@flacroncv.com` mailbox
  confirmation (terms/cookies `last_updated` will bump when their content is revised with those details).
- 2026-07-18 — **Implemented contact form — real Brevo-backed endpoint (approved).** New `ContactModule`
  (`contact.service.ts` validation + `contact.controller.ts` public `POST /contact`, throttled 5/min);
  `MailService.sendContactMessage` sends the submission to `brevo.contactTo` (env `CONTACT_EMAIL`, default
  support@flacroncv.com), HTML-escaped with `replyTo` = the visitor. Frontend `contact-us/page.tsx` now POSTs
  (fake setTimeout removed). **QA:** api type-check ✓; +6 contact tests → **api 113/113 pass**; endpoint verified
  live (400 on invalid input, public, no email sent — respected the no-production-send constraint); web type-check ✓;
  build compiles ✓. **Action for client:** confirm `CONTACT_EMAIL` mailbox exists/receives mail.
- 2026-07-17 — **Implemented SEO infrastructure batch (approved).** New: `lib/seo.ts` (`pageMetadata` +
  `localizedAlternates`), `app/sitemap.ts` (48 URLs × hreflang + x-default), `app/robots.ts` (replaces static
  robots.txt so Sitemap follows env). Root layout gained default OG/Twitter + Organization/WebSite JSON-LD. Home
  title double-suffix fixed + hreflang added. All 5 title-only public pages now emit description + canonical +
  hreflang + OG; templates & contact-us got server `layout.tsx` metadata wrappers. `site.webmanifest` completed
  (start_url/scope/lang/description). **QA:** web type-check ✓; build compiles + generates `/sitemap.xml` (verified
  48 URLs, hreflang present) and `/robots.txt` (verified rules + resolving Sitemap). Pre-existing EPERM only.
- 2026-07-17 — **Truthfulness sweep — remaining fabricated-traction remnants purged.** Only the **/templates CTA**
  ("Join 10,000+…") was actually rendered → replaced with honest copy (6 locales). The homepage `Testimonials`
  section was already hidden (unimported), so deleted the dead `components/landing/Testimonials.tsx` (6 invented
  people attributed to Barclays/Google/Stripe/Meta/Careem/Publicis) + its orphaned `testimonials` locale namespace
  (6 locales); neutralized the unused `hero.trusted` + `product1_desc` "10,000+" strings. **QA:** web type-check ✓;
  build compiles + static pages ✓; repo-wide scan finds zero traction remnants. Parity verified.
- 2026-07-17 — **Implemented Truthfulness batch (approved) — testimonials + About.** Rewrote `testimonials/page.tsx`
  to an honest state (removed 9 fabricated people + real-brand attributions + fake stats/rating; added a genuine
  "be one of the first" empty state). Removed the fabricated Stats section + `StatCard` from `about-us/page.tsx`.
  Locale cleanup across all 6 locales (deleted stats + t1–t9 keys, honest copy, de-puffed mission/story/team) — parity
  verified. **QA:** web type-check ✓; web build compiles + static pages ✓ (pre-existing EPERM only). **Discovered:**
  the same "10,000+ professionals" claim persists on the homepage hero/stats/CTA + footer (landing/footer namespaces) —
  flagged for approval, not yet touched (homepage was a previously-signed-off section).
- 2026-07-17 — **Reviewed Public pages + Legal + site-wide SEO** (review-only). 4-dimension adversarial workflow
  (25 agents); 20 findings confirmed, 1 stub rejected, a11y/design dimension flaked (re-review pending). Headlines:
  1 CRITICAL (fabricated /testimonials with real-brand attribution), 7 HIGH (dead contact form, fabricated stats,
  OpenAI subprocessor omission, no sitemap, no hreflang, templates no-metadata), 6 MEDIUM, 6 LOW. Awaiting approval.
- 2026-07-17 — **Implemented Settings S2 + S3 (approved).** `users.service.update()` now whitelists profile fields
  (allow-list + per-field length caps; unknown keys dropped), validates preference values (Locale/Theme enums,
  boolean flags, defaultCVTemplate length), and validates photoURL (https-only, ≤2048, rejects javascript:/data:)
  + caps displayName — the light in-scope alternative to the §8 class-validator DTO rewrite. **QA:** api type-check ✓;
  +7 validation tests → **api 107/107 pass**; API alive/guarded after recompile. Backend-only (no web change).
  Settings section now has no open MEDIUM/HIGH findings; only LOW polish remains (S4, F5–F7).
- 2026-07-17 — **Implemented Settings F2 + F3 (approved).** F2: localized 6 avatar-upload strings + `alt` via a new
  `settings.avatar.*` group across all 6 locales (parity verified; size param `{max}`). F3: `aria-label` on the
  language/theme selects + notifications checkbox, `aria-current="page"` on the active settings tab (mobile+desktop).
  **QA:** web type-check ✓; web build compiles + static pages ✓ (pre-existing EPERM only). Remaining Settings:
  S2/S3 (input validation), S4/F5–F7 (low).
- 2026-07-17 — **Implemented Settings S1 + F1 (approved).** S1: `softDelete` now revokes refresh tokens + disables
  the Firebase Auth user (best-effort, `users.service.ts`), and the settings delete flow calls `logout()` before
  redirect (`settings/page.tsx`). F1: fixed the broken toggle CSS typo `transtone-x-full`→`translate-x-full`.
  **QA:** api type-check ✓; +2 softDelete tests → **api 100/100 pass**; web type-check ✓; web build compiles ✓
  (pre-existing EPERM only). Remaining Settings items: F2/F3 (i18n + a11y), S2/S3 (input validation), S4/F5–F7 (low).
- 2026-07-17 — **Reviewed Settings & Profile section** (review-only). 4-dimension adversarial workflow; 3 finder
  agents returned placeholder stubs (rejected by verifiers), so frontend + backend-correctness dimensions were
  re-done by direct file reading. Net: 1 HIGH (delete = no session revocation), 4 MEDIUM (broken toggle CSS,
  hardcoded strings, a11y labels, no input validation/whitelisting), several LOW. Awaiting approval to fix.
- 2026-07-17 — **Implemented A8 — server-authorized export gate (client-approved approach).** Investigated with a
  7-agent workflow; 3/3 lenses confirmed all export was client-side & ungated and `usage.exportsThisMonth` was
  permanently 0 (quota unenforced for everyone; DOCX free for all). **Backend:** `recordClientExport()` in
  `export.service.ts` (reuses `resolveEffectivePlan`: DOCX-is-paid + monthly quota + atomic usage increment,
  returns `{allowed, reason}`) + `POST /exports/record` route (`export.controller.ts`). **Frontend:** the 4 client
  export handlers (`EditorToolbar.tsx` CV PDF+DOCX; `cover-letters/[id]/page.tsx` PDF+DOCX) now call `/exports/record`
  first and open the `UpgradeModal` (reason="exports") on a block; added `upgradeReason` state to the cover-letter
  page so its modal shows the right message. **QA:** api type-check ✓; +5 export tests → **api 98/98 pass** (10 suites);
  web type-check ✓; web build compiles + static pages ✓ (pre-existing EPERM only); `/exports/record` live & guarded (401).
  Note: fixes the entitlement bypass + usage tracking; the raster/non-ATS PDF architecture (§8) is unchanged.
- 2026-07-17 — **Implemented A7b — AI-credit client checks status-aware.** Capped the stored `aiCreditsLimit` by the
  effective-plan allowance at all 4 client soft-checks (`AISummaryModal.tsx`; `cover-letters/[id]/page.tsx`;
  `cover-letters/new/page.tsx` ×2) via `Math.min(stored, PLAN_CONFIGS[resolveEffectivePlan(sub)].limits.aiCredits)`,
  mirroring the backend. **QA:** web type-check ✓; web build compiles + static pages generate ✓ (pre-existing EPERM only).
  Frontend status-awareness for entitlements is now complete except A7c (dunning "update your card" banner — UX addition).
- 2026-07-17 — **Implemented A7 (partial) — frontend template/layout gates status-aware.** Routed the 5 client
  access gates through the shared `resolveEffectivePlan` (no duplicated policy): `cv/page.tsx` (create limit),
  `cv/new/pick-template/page.tsx`, `(public)/templates/page.tsx`, `cv-builder/toolbar/TemplatePanel.tsx` (layouts),
  `cover-letters/[id]/page.tsx` (template picker). Displays (billing current-plan, dashboard limits, upgrade banner)
  intentionally left on actual plan. **QA:** web type-check ✓; web build compiles + static pages generate ✓ (only the
  pre-existing Windows standalone-symlink EPERM). Remaining split into A7b (AI-credit soft-checks) + A7c (dunning banner).
- 2026-07-17 — **Implemented approved C — status-aware entitlements (grace-until-period-end).**
  - Investigated with a 7-agent workflow (4 mappers + 3 adversarial verifiers); all 3 lenses CONFIRMED the finding
    (delinquent past_due/unpaid accounts kept full paid access; monthly cron even re-granted their AI credits).
  - **Fix:** added `resolveEffectivePlan(subscription, now?)` + `DELINQUENT_STATUSES` in
    `packages/shared-types/src/subscription.entitlements.ts` (robust `currentPeriodEnd` coercion for Date / Firestore
    Timestamp / ISO string / epoch; fail-safe to FREE when unknown). Rebuilt shared-types dist. Routed every backend
    gate through it: `cv.service.ts` (×3), `cover-letter.service.ts` (×2), `export.service.ts` (quota + DOCX),
    `ai.service.ts` (credit ceiling now `min(stored, effective-plan allowance)`). Client-approved policy = grace until
    period end.
  - **QA:** api type-check ✓; +19 resolver unit tests → **api 93/93 tests pass** (9 suites); api build ✓ (dist/main.js
    fresh); web type-check ✓ (shared-types change is additive); dev server survived recompile (payments 401 guarded).
  - **Discovered (logged as A7/A8/A9):** frontend gating not yet status-aware; client-side DOCX export ungated; dead SubscriptionGuard.
- 2026-07-17 — **Implemented approved A(b) + B (Payments/Billing).**
  - **A(b) — kill yearly overcharge.** Frontend `settings/billing/page.tsx`: yearly toggle disabled + "Coming soon"
    badge (removed false "Save 33%"), checkout mutation hardcoded to the monthly price, plan-card prices/period
    simplified to monthly + localized. Added 7 billing locale keys × 6 locales (monthly/yearly/yearly_coming_soon/
    yearly_unavailable_note/per_year/activated_title/activated_desc); localized the previously hardcoded
    "Subscription activated!" banner. Backend `payment.service.ts`: `createCheckoutSession` now enforces
    `allowedCheckoutPriceIds()` (monthly-only whitelist) → rejects yearly/arbitrary price IDs.
  - **B — refund/dispute/paused webhooks.** `payment.service.ts`: new `charge.refunded` (full-refund only),
    `charge.dispute.created` (resolves customer via `charges.retrieve`), `customer.subscription.paused` handlers,
    all via shared `revokeToFree()` (cancels Stripe sub best-effort → downgrades user to FREE + resets AI credits).
  - **QA:** api type-check ✓; `payment.service.spec.ts` extended (+5 tests: guard rejects yearly/arbitrary & accepts
    monthly; full refund downgrades; partial refund ignored; dispute revokes) → **api 74/74 tests pass**; web
    type-check ✓; web build compiles + static pages generate ✓ (only pre-existing Windows standalone-symlink EPERM,
    unrelated); billing route serves 200; payments API guarded (401 unauth).
- 2026-07-17 — Reviewed **Payments / Billing** section (review-only). 4 findings adversarially verified (1 critical yearly-overcharge, 1 high refund-missing, 2 medium status-ignored & trial-missing). Awaiting approval to fix.
- 2026-07-17 — Created `PROJECT_PROGRESS.md`; ran full repo inventory vs PDF requirements.
- 2026-07-17 — Fixed Google popup auth crash (async-storage contamination) in `firebase/lib/firebase.ts`.
- 2026-07-17 — Fixed sign-up/login: renamed `apps/web/.env` `NEXT_FIREBASE_*`→`NEXT_PUBLIC_FIREBASE_*`, API URL.
- 2026-07-17 — Fixed API startup: `nest-cli.json` `deleteOutDir:false`; documented in `apps/api/README.md`.
- 2026-07-16/17 — Completed section reviews & fixes: Homepage, Navigation, Auth, Dashboard, Resume Builder, Cover Letter Builder (see §3).
- 2026-07-17 — Created this progress file.
