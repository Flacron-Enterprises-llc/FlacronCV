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

Last updated: 2026-07-29

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
- API modules: `apps/api/src/modules/{auth,users,cv,cover-letter,ai,templates,export,payment,support,admin,audit,mail,crm,firebase}`
- Plans/entitlements: `packages/shared-types/src/subscription.types.ts` (`PLAN_CONFIGS`)
- Locales: `apps/web/public/locales/<loc>/common.json`

---

## 2. Local dev environment status

- `apps/api/.env` — present & correct (Firebase Admin, Stripe **test-mode key**, AWS SES). Backend boots on **:4000**.
- `apps/web/.env` — present; Firebase client vars fixed to `NEXT_PUBLIC_*`, `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`.
- Frontend runs on **:3000**. CORS allows `http://localhost:3000`.
- ⚠️ Uses the **real (production) Firebase project `flacron-cv`** for local dev — the client
  chose this. A dedicated dev/emulator project is still the recommended long-term setup.
- To run: `cd apps/api && pnpm dev` and `cd apps/web && pnpm dev`.

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
  remaining multi-filter CRM combos. `firestore.indexes.json` now **37 indexes** (JSON-validated). **Needs
  `firebase deploy --only firestore:indexes`.** (Full breakdown in the change log.)

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
  was added 2026-07-20 (A6) — full enum/config/entitlements/billing-UI/CRM — with **assumed** price ($49.99) + limits +
  mid-tier positioning (see change log). **Self-serve checkout is gated "coming soon" until the client sets a real Stripe
  price;** admins can grant it now.
- ✓ Entitlement enforcement — CV/cover-letter/export/AI limits enforced server-side; usage atomic; now
  **status-aware** — delinquent (past_due/unpaid/incomplete) accounts fall back to FREE limits after their
  paid-through date via `resolveEffectivePlan()` (grace-until-period-end).
- ✓ **Trial system** — **BUILT 2026-07-20.** Stripe `trial_period_days` on checkout (first-time subscribers only,
  anti-abuse), trial-aware activation (`verifySession`/webhook honour `trialing` status + `no_payment_required` + record
  trialStart/End), and trial UI (CTA + "trial ends" line). Assumed **7-day, card-upfront** trial — see change log.
- ◐ Subscription lifecycle: **refund / dispute / paused now downgrade to FREE** (✓, implemented +
  tested); expired/failed/upgraded still to verify.
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

### 5.4 Analytics / event tracking (◐ — layer built, GA4 wired, awaiting the client's measurement id)
- ◐ **Provider-agnostic event layer built (D1)** + **GA4 adapter wired as the default provider (2026-07-20).** 7 funnel
  events instrumented (sign_up/in, cv_created, cv_exported, cover_letter_created, checkout_started, plan_upgraded,
  ai_generation) + page views + identify. Consent-gated by the cookie banner. **To go live the client sets
  `NEXT_PUBLIC_GA4_MEASUREMENT_ID`** (until then GA4 no-ops safely). Broader event coverage (CTA clicks, template
  selected, etc.) can be added by dropping `track()` calls at more sites — no wiring changes.

### 5.5 Cross-cutting (client's extra asks)
- ◐ **De-AI the design** — **foundational refresh done 2026-07-20** (design tokens: premium layered shadows, near-black
  dark elevation, tighter typography; unified card/input/button/modal; landing hero de-gradient-text + single-accent;
  auth panel reworked). Deeper per-page polish (dashboard KPIs/tables, all forms, full mobile audit) is ongoing E2.
- ◐ **Logo update** — **official brand logos wired everywhere 2026-07-20** via a theme-aware `<Logo/>`
  (`flacronCvblack.png` light / `flacronCvlight.png` dark). *(Client note: the two assets have different aspect ratios;
  matched exports would render identically across themes.)*
- ◐ **SEO** — homepage has metadata/OG/JSON-LD; **every page** needs proper metadata, canonical,
  sitemap.xml, robots, structured data, per-locale hreflang. Full SEO audit required.
- ◐ Security / accessibility / mobile responsiveness — improved on reviewed sections; remaining pages pending.
- ✗ Admin controls / analytics dashboards / enterprise capabilities — partial admin exists; verify vs PDF.

---

## 6. Remaining sections to review (not yet audited)

- [x] **Pricing / Billing + Payments / Stripe — REVIEWED 2026-07-17. A(b)+B FIXED 2026-07-17.**
  - 🔴→✅ CRITICAL (FIXED): `settings/billing` "Yearly" toggle sent `stripePriceIdYearly`, which bills **monthly**
    ($359.99/mo Pro, $1,199/mo Ent) while the UI showed $239.88/yr / $799.88/yr → ~18× overcharge, reachable by all free users.
    **Fix A(b):** billing page is now monthly-only — yearly toggle is disabled and marked "Coming soon", checkout always sends the monthly price, false "Save 33%" removed. Backend `createCheckoutSession` now enforces a **monthly-price whitelist** (`allowedCheckoutPriceIds()`), rejecting yearly/arbitrary IDs with `BadRequestException` (defense in depth).
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

- **Export architecture** — CV/cover-letter PDF export is a **client-side raster image**
  (html2canvas→jsPDF), so exported PDFs are **not ATS-parseable**. (Entitlement bypass part FIXED in A8 via the
  server-authorized `/exports/record` gate; the **non-ATS raster-PDF** problem remains.) A working backend
  Puppeteer text-PDF path exists but is unused. Switching the UI to it would fix ATS-parseability too, but is a
  larger change — revisit with client approval. (Contradicts the product's "ATS-optimized" promise.)
- **Save-state / Undo-Redo (CV)** — edits-during-autosave and undo/redo have latent data-loss bugs;
  minimal fixes exist but touch the save-state model.
- **Backend DTO validation** — CV/cover-letter/user write bodies are untyped interfaces → global
  ValidationPipe is a no-op; arbitrary fields can reach Firestore.
- **Data model** — `CVSectionItem` is a loose `any` union.
- **Secrets rotation** — Firebase Admin private key, Stripe, Brevo, OpenAI keys were shared in chat/docs; rotate them.

---

## 9. Change log (append newest at top)

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
    (a) **Trial-abuse** — `isFirstTimeSubscriber` reads `stripeSubscriptionId`, which is cleared on cancel, so cancel→resubscribe
    grants unlimited free trials; fix needs a never-cleared `hasUsedTrial` flag + a **prod data backfill**. (revenue leak — high priority)
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
    (was 23), JSON validated, no duplicates. **⚠️ still needs `firebase deploy --only firestore:indexes`.**
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
  single-field equality → auto-indexed, so no entry is needed. **⚠️ ACTION REQUIRED:** run `firebase deploy --only
  firestore:indexes` for these to take effect in production. **Remaining (self-documenting, low-priority):** rare MULTI-
  filter combinations (e.g. `crm_users` role+plan together, `crm_transactions` customerId+status) still need their own
  composite index if actually exercised — Firestore names the exact index in its error link when hit. A one-off
  `firebase firestore:indexes` export would confirm nothing else drifted from the console.
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
