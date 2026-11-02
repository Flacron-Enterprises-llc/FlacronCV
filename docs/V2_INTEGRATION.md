# FlacronCV V2 features inside V1 — integration record

Status: **local integration branch `integration/v2-features`, not merged, not deployed.**
Baseline: V1 `main@9239e0e7`. V2 source reference: `flacroncv-v2 main@792b9958` (unchanged).
Everything below was verified only against local emulators and a private local Postgres. Nothing here is evidence about hosted behaviour.

> **Update (second pass, 2 Nov 2026).** Scope now also covers: V2's homepage hero replacing only V1's hero (§0.1), paid access to the career tools through V1 billing (§0.2, purchase **disabled** pending the commercial decision), operator access, migration rehearsal tooling and an isolated production build. Sections 1–6 below remain valid except where §0 supersedes them (notably: the local plan map is now empty, so **no V1 plan grants career access by itself**).

## 0.1 Homepage hero

Only V1's hero section was replaced by V2's latest hero (`apps/web/src/components/landing/HeroV2.tsx`, icons in `HeroV2Icons.tsx`, styles scoped to `.fc-hero-*`/`.fc-blob-*` in `globals.css`, strings in the new `home_hero` namespace in all six locales). Header, footer, every other homepage section, pricing and other pages are unchanged. Portrait: the approved public derivatives only (`apps/web/public/marketing/client-portrait-cutout-{480,720,960}.webp` + `-720.png`); provenance and usage rules are V2 `docs/DESIGN_SYSTEM.md` "Marketing imagery". The private original is not in this repository. CTAs follow V1 routes and sign-in state. See the hero verification record for before/after screenshots.

## 0.2 Paid access to the career tools (V1 billing)

**Payment provider — no difference.** V1 and V2 both use Stripe (Checkout in subscription mode, signed webhooks, `app_id` metadata) plus Apple/Google store purchases. The differences are the catalog (V1: Free / Pro / Career Accelerator (not sold) / Enterprise with CV, letter, AI-credit and export limits; V2: Free / Starter / Professional / Career Pro / Business with versioned monthly allowances, packs and seats), and that V2 ran its own Stripe products and webhook. Inside V1 there is **one** billing owner: V1's Stripe account, customer, webhook endpoint and event ledger.

**Commercial model — NOT DECIDED.** V2's 16 Oct plan (written for V2 as V1's successor) said a V1 subscriber keeps the legacy plan until they *choose* a V2 plan, which then *replaces* it; that was superseded on 29 Oct by the independence decision, and nothing defines how a career plan combines with a V1 plan that keeps governing the CV builder. So:
- Purchase is **disabled** (`CAREER_BILLING_MODE=disabled`, default). The plans page shows prices, intervals and benefits; the confirm button is disabled; `POST /career-billing/checkout` returns 403 and never reaches Stripe.
- The plumbing is built and tested for the *add-on* shape only as a **labelled local fixture** (`addon_fixture`, refused in production): a separate career Stripe subscription on the same V1 customer, `metadata.product=career`.
- The local demo grants one career entitlement directly (`careerSubscription.source = local_fixture`), shown with a "Local test entitlement, not a real purchase" badge.

**Mapping (prices and allowances from `packages/career-shared/src/catalog.ts`, catalog 2026-10-10, USD).**

| | Starter | Professional (recommended) | Career Pro | Business (not offered here) |
|---|---|---|---|---|
| Monthly / Annual | $21.99 / $219.90 | $38.99 / $389.90 | $68.99 / $689.90 | $208.00 / $2,080.00 |
| Document credits / month | 20 | 60 | 150 | 500 pooled |
| CV analyses / month | 15 | 60 | 150 | 500 |
| Action packs / month | — | 10 | 30 | 100 |
| Text interview sessions / month | 2 | 5 | 15 | 50 |
| Voice minutes / month | — | 30 | 120 | 300 |
| Skill reports / month | 1 | 5 | 15 | 50 |
| Scenario reports / month | — | 1 | 5 | 25 |
| Assisted forms / month | — | 20 | 75 | 200 |
| Map sessions / month | — | 50 | 200 | 1000 |
| Alert items / month | 50 | 200 | 500 | 2000 |
| Evidence items / storage | 20 / 1 GB | 100 / 5 GB | 300 / 20 GB | 100 per candidate / 100 GB |
| Portfolio pages | 1 | 1 | 3 | 1 per candidate |
| DOCX export of drafts | yes | yes | yes | yes |

Free (career) is not offered as a purchase. Annual = 10 × monthly; allowances still renew monthly on the billing anniversary and do not roll over. Editing, reopening saved results and downloads use no credits; a failed generation releases its reservation (verified). Packs, extra capacity, Business seats, human review, employer checkout, the maintenance offer, API packages and SSO stay closed.

| Existing V1 plan | Its V1 benefits | Career access today (local) | With a purchased career plan |
|---|---|---|---|
| Free | unchanged (5 CVs, 1 letter, 5 AI credits, 2 PDF exports) | none | the purchased plan |
| Pro | unchanged (10 CVs, 20 letters, 100 AI credits, unlimited exports, DOCX) | none | the purchased plan |
| Career Accelerator (not sold) | unchanged | none | the purchased plan |
| Enterprise | unchanged | none | the purchased plan |

`CAREER_PLAN_MAP` can still include career benefits in a V1 plan if the client decides so (default empty). The effective career plan is the higher of the mapped plan and a live purchase. Neither ever changes the V1 plan, its credits, its price or its Stripe subscription.

**Entitlement rules (career service).** A purchase grants access while `active`/`trialing`; `past_due` and `canceled` keep access only until the paid period ends (V1's own rule); `incomplete`, `incomplete_expired`, `unpaid`, `paused`, an unknown plan or `free` grant nothing. Plan changes re-grant "new grant − units used" (never a second month).

**Webhook rules (V1 payment module).** Career events are recognised (session/subscription metadata, invoice subscription details, or the configured career price ids) and routed **before** V1's handlers — otherwise V1's full-refund handler would have revoked the V1 plan through the shared customer. Stored as a state with the event time: replays (ledger) and older events change nothing. Full refund ends career access immediately and cancels the career subscription; a partial refund changes nothing (V1's rule). Ledger rows for invoices and refunds are still written. V1 account closure cancels a live career subscription too. Checkout: server-chosen price and URLs, confirmed amount must equal Stripe's price, no trial, no second live career subscription, V1's existing Stripe customer reused.

**Operators.** Career moderation/feature switches require V1's `admin`/`super_admin` claim **and** `ADMIN_AUTH_USER_IDS` (narrower than either); they no longer depend on the operator's own career plan. Linked from V1's admin sidebar when the career build switch is on.

## 1. Architecture and data ownership

| Concern | Owner | Notes |
|---|---|---|
| Customer identity (sign-in) | **V1** Firebase Auth (`flacron-cv` in production) | The career service verifies the same ID tokens. It never creates, disables or deletes a sign-in (`RetainedByV1SignInDeleter`). |
| Plans, subscriptions, AI credits, exports quota, Stripe/Apple/Google | **V1** Firestore `users/{uid}` + V1 payment module | Unchanged. The career service only **reads** `users/{uid}` and applies V1's own `resolveEffectivePlan`. |
| CVs, cover letters, templates, Jobs tracker, legal acceptance, support, admin/CRM | **V1** Firestore | Unchanged. Career features read `job_applications` (read-only) for outcome analytics. |
| Career records (facts, evidence + files, drafts, matches, alerts, interviews, voice, action packs, learning, modes, portfolios, scenarios, forms, maintenance, map sessions, business, recruiting, developer keys) | **Career Postgres** (`apps/career-api` + `packages/career-server`) | Former V2 schema, 34 V2 migrations + 2 additive integration migrations. |
| Career allowances (document credits, analyses, …) | **Career Postgres** `billing_accounts`/`usage_balances`/`usage_ledger` | Plan comes from the V1 plan through `CAREER_PLAN_MAP`. Separate from V1 AI credits (client decision D2). |
| Career files | Career object storage (`OBJECT_STORAGE=s3` in production: dedicated private bucket; local disk locally) | Never V1's Firebase bucket (refused at boot). |

**Why a second service and a database.** V2's ~28k lines of domain code depend on multi-row Postgres transactions (atomic reservations, idempotency keys, append-only ledger, foreign keys from applications to document versions, durable cleanup queues). Re-implementing them on Firestore would be a rewrite with new correctness risk. Running the career code as its own process keeps V1's API, its build (`tsc`), its deploy pipeline and its failure domain untouched: if the career service or Postgres is down, V1 works exactly as before (the web shows "career tools unavailable"). Cost: one extra container on the existing AWS footprint plus a managed Postgres (e.g. RDS) — **a new paid dependency that needs client approval** (D6).

**No synchronisation.** No record exists in both stores. Copying a career draft into V1 is a one-way, person-initiated action that creates an ordinary new V1 CV/letter through V1's existing endpoints (V1 limits, tiers and validation apply). V2's former two-way "shared records" endpoints are not served (test: `no-record-sync.e2e-spec.ts`).

### Identity mapping
Firebase uid = V1 `users/{uid}` = career `users.auth_user_id`. A career account is created on the first request **only if** the V1 plan maps to a career plan; otherwise `feature_unavailable` and no rows. Concurrent first requests create one account (advisory lock; tested).

### Entitlement bridge (`packages/career-server/src/integration/v1-plan-bridge.ts`)
`V1 effective plan → CAREER_PLAN_MAP → career plan`. Default map is empty ⇒ every plan is `none` ⇒ career features off. On each request (30 s cache) the career billing account is moved to the mapped plan under its row lock: a change re-grants "new grant − units already used" (never a second month), units the new plan lacks drop to 0, the allowance renews on the anniversary while the mapping holds. `billing_accounts.plan_source/v1_plan/v1_plan_synced_at` record it. V1 balances, credits and subscriptions are never written.

### Old records and new fields
V1 records are not migrated or altered. New career columns are additive with defaults (`plan_source` default `career`). V1 documents without career data simply have none; the career UI shows empty states.

### Exports and deletion
- **Career data export:** `/career/data` → `POST /exports` (works whatever the plan; never creates an account). V1's own JSON export is unchanged; the two are separate downloads (D9: single combined export).
- **Erase career data only:** `/career/data` (fresh sign-in required).
- **Close V1 account (Settings):** with `NEXT_PUBLIC_CAREER_ENABLED=true`, career data is erased first; a stale sign-in stops the deletion with a "sign in again" message; an unreachable career service lets V1's deletion proceed and the **closure sweep** erases the career data later. Without the flag, V1's deletion is byte-for-byte the old flow.
- **Closure sweep:** each career user is re-checked about daily; career data is erased only on positive evidence that V1 closed the account (`isActive:false`/`deletedAt`). A missing or unreadable V1 record never triggers erasure. Covers deletions made from mobile or by admins.
- Retained records follow V2's rules (accounting ledger rows without the sign-in id); V1's retention (soft-deleted user doc, documents) is unchanged.

### Background jobs, retries, concurrency
Unchanged V2 mechanisms: reservation → commit/release with idempotency keys (replay returns the first job), abandoned-reservation release, pg-boss worker (renewals, pack expiry, alert matching/digests), storage cleanup queue with `SKIP LOCKED`, revision conflicts (409) on drafts. Plan sync runs under the account row lock.

## 2. What changed in V1 itself (all backward compatible)
- `apps/web`: `/career/*` routes, one sidebar entry (only when access is enabled), `/portfolio/[slug]`, `/admin/career`, career tokens in Tailwind/CSS (namespaced `career-*`), 1,136 career strings × 6 locales, Settings deletion hook, two env names. **Build switch `NEXT_PUBLIC_CAREER_ENABLED` (default off) restores exact V1 behaviour.**
- `apps/api`: **no code change.**
- Root: `pnpm-lock.yaml` (additions; one ts-jest peer suffix), `.gitignore` (`.env.career`), `tsconfig.career.base.json`, `.env.career.example`.

## 3. Feature integration matrix

Legend — State: **Op** operational locally · **Prov** provider-dependent (stays unavailable until configured) · **Blocked** commercial/contract · **Merged** V1 equivalent kept instead of a duplicate.

| Req | Feature | V1 equivalent | Destination in V1 | Data / entitlement | State | Verification here |
|---|---|---|---|---|---|---|
| CV01-01 | Confirmed profile facts, provenance | none | `/career/profile` | `career_facts` | Op | server+HTTP tests; browser walk |
| CV01-02 | Résumé import (PDF/DOCX parse) | V1 `POST /cvs/import` (AI) | `/career/profile` | `resume_imports`, 10/day | Prov (AI) | tests; unconfigured AI refuses without inventing |
| CV02-01 | Draft versioning, template switching | V1 CV builder | `/career/documents` ("Grounded drafts") + one-way **Open in CV builder** | `resumes`, `resume_versions` | Op | tests; browser copy flow (1 click → 1 V1 CV) |
| CV02-02 | Grounded generation / tailoring, credit reserve/release | V1 AI summary | `/career/documents` | `document_credit` | Prov (AI) | live: `released:true`, replay same job, credits 60→60 |
| CV02-03 | PDF/DOCX export, FR presentation | V1 client PDF/DOCX | `/career/documents` | DOCX needs mapped plan ≥ starter | Op | live EN/FR PDF+DOCX rendered and inspected |
| — | TXT export | none in V1 or V2 | — | — | **Not built** (neither product has it) | — |
| CV03/CV06 | Readability + match analysis | V1 ATS check (AI) | `/career/opportunities/[id]` | `resume_analysis` | Op | tests |
| CV04-01 | Cover letters, bios, LinkedIn, outreach; unsupported-claim rejection | V1 cover letters | `/career/documents` + **Save as cover letter** | `writing_documents`, `document_credit` | Prov (AI) | tests (rejects invented claims, credit returned) |
| CV05 | Opportunities (paste; licensed feeds) | none | `/career/opportunities` | `opportunities` | Op (paste) / Prov (feeds) | tests; seeded paste |
| CV15 | Listing trust + moderation | none | detail panel; `/admin/career` | `opportunity_reports` | Op | tests |
| CV07 | Saved searches, alerts, quiet hours | none | `/career/alerts` | `alert_item` | Op in-app / Prov (email/push) | tests |
| CV08 | Application tracking | **V1 Jobs tracker** | `/jobs` (unchanged) | V1 `job_applications` | **Merged** — V2 `/applications` routes not served | `no-record-sync.e2e-spec.ts` |
| CV19 | Application-outcome analytics | none | `/career/learning-loop` | reads V1 jobs read-only | Op | HTTP test with V1 statuses; live 50 % sample |
| CV09 | Text interview sessions, STAR | V1 interview-prep modal | `/career/interviews` | `text_interview` | Prov (AI) | tests |
| CV17-01 | Voice practice (typed path), consent, minutes | none | `/career/interviews/voice` | `voice_minute` | Op (typed) | tests |
| CV17-02 | Speech transcription | none | — | — | Prov (no vendor chosen) | returns `provider_unavailable` |
| CV10 | V2 catalog, checkout, packs, webhooks | V1 billing | **not served** | — | Withheld (V1 billing unchanged) | `v1-billing-boundary.e2e-spec.ts` |
| CV11 | Evidence vault + private files, quotas, cleanup | none | `/career/evidence` | `career_evidence`, `storageBytes` | Op (local disk) / Prov (S3 live) | tests; live upload, owner link, other account 403, delete |
| CV12 | Action packs | none | `/career/action-pack` | `action_pack` | Op | tests |
| CV13 | Skill reports, learning, milestone→evidence | none | `/career/learning` | `skill_report` | Op | tests |
| CV14 | Relocation & specialist modes | none | `/career/relocation` | capacities | Op | tests |
| CV16 | Portfolios, public page, QR | none | `/career/portfolios`, `/portfolio/[slug]` | `portfolioPages` | Op | tests (QR path now `/portfolio/`) |
| CV18 | Scenarios | none | `/career/scenarios` | `scenario_report` | Op | tests |
| CV20-01 | Assisted forms (review) | none | `/career/forms` | `assisted_form` | Op | tests |
| CV20-02 | Browser extension fill (`example-jobs.test`) | none | `apps/career-extension` (unpacked) | — | Op locally / store unpublished | extension test; host perms now :4101 |
| CV21-01 | Maintenance goals, credential reminders | none | `/career/maintenance` | included | Op | tests |
| CV21-02 | $4.99 maintenance offer | none | — | undefined entitlements | **Blocked** | not sold |
| CV22-01 | Map sessions + list fallback | none | `/career/opportunities/map` | `map_session` | Op (list) | tests |
| CV22-02 | Map tiles / geocoding | none | — | — | Prov | tiles null |
| CV23 | Staff seats, candidates, workspace isolation | none | `/career/business` | business allowances | Op (only on a plan mapped to `business`) | tests (4th seat refused, cross-workspace refused) |
| CV24 | Human review booking | none | `/career/services` | — | **Blocked** (`not_purchasable`) | tests |
| CV25 | Recruiting opt-in / search; employer checkout | none | `/career/recruiting` | `recruiting_opt_ins` | Op opt-in / **Blocked** checkout | tests |
| CV26-01 | Developer API keys, attribution, white-label | none | `/career/developer` | needs package row | Purchase **Blocked** | tests (hash-only key, 409 without package) |
| CV26-02 | SSO / custom integrations | none | — | contract | **Blocked** | not built |
| X | Personal-data export / account deletion | V1 export + soft delete | `/career/data`, V1 Settings | both stores | Op | live deletion: career rows 1→0, V1 soft-deleted, sign-in disabled |
| X | Admin: moderation, feature switches | V1 admin | `/admin/career` | allowlist `ADMIN_AUTH_USER_IDS` | Op | tests (see limitation L3) |
| X | Mobile app | V1 Expo app | — | — | **Not integrated** (V1 mobile unchanged) | — |
| X | Off-box notifications, store purchases, licensed feeds | — | — | — | Prov | — |

## 4. Client decisions needed
- **D0 (blocks purchase activation) — commercial model of a career plan.** Is it (a) an **add-on**: a separate career subscription beside the unchanged V1 plan (what the local fixture implements), or (b) an **upgrade that replaces** the V1 subscription (V2's 16 Oct legacy plan; that would also need a rule for what the V1 CV-builder limits become)? Until answered, purchase stays disabled.
- **D1 V1-plan map (`CAREER_PLAN_MAP`).** Default empty: no V1 plan includes career benefits. If the client wants some included (for example Pro → Starter as a teaser), it is one setting.
- **D2** Whether career generation should draw on V1 AI credits instead of separate career allowances (currently separate).
- **D3** Whether to sell `business`, packs, extra capacity, human review, recruiting checkout, API packages or the maintenance offer (all closed).
- **D4** AI provider for career generation (`AI_PROVIDER=openai` + key), speech vendor, map tiles, licensed job feeds.
- **D5** Stripe products/prices for career plans (created by the client in Stripe, then `CAREER_STRIPE_PRICES`), and whether the Professional 7-day trial applies (currently no trial).
- **D6** Hosting: an extra container + worker + managed Postgres + private S3 bucket; cost approval.
- **D8** Whether to show V2's 7-stage pipeline fields (deadline/checklist) inside V1's Jobs tracker.
- **D9** One combined personal-data export file vs two downloads.
- Resolved this pass: German form of address (career and hero strings now use "du" like V1's dashboard, settings and job tracker); operator access (V1 staff claim AND allowlist).

## 5. Future migrations / configuration (not executed)
1. Provision Postgres. Run `pnpm --filter career-api migrate:status --snapshot before.json` (read-only), `migrate:dry-run` (prints SQL, applies nothing), then `migrate` (36 migrations), then `migrate:status --snapshot after.json` and compare. `migrate:down` refuses non-local hosts. Rehearsed locally on a copy: rollback of the two integration migrations, dry run, re-apply; 74 tables with identical row counts. Rolling back the bridge migration resets the `plan_source`/`v1_plan` values, which the bridge rewrites on the next request. Full rollback = drop the career database (V1 holds no career data).
2. No V1 data migration is required; career accounts are created lazily.
3. Configure `.env.career` per `.env.career.example` (production: `DEPLOY_ENV=production`, `FIREBASE_PROJECT_ID=flacron-cv`, a read-only Firestore role for `users` and `job_applications`, `OBJECT_STORAGE=s3` + career bucket, `CORS_ORIGINS` = V1 hosts, `ADMIN_AUTH_USER_IDS`, no Stripe key). V1 API: `CAREER_BILLING_MODE` stays `disabled` until D0; production refuses `addon_fixture`.
4. Route `/api/career/*` on the existing load balancer to the career container; run `apps/career-worker`; set `NEXT_PUBLIC_CAREER_ENABLED=true` and `NEXT_PUBLIC_CAREER_API_URL` in the web build.

## 6. Verification (local only, 2 Nov 2026)
- Automated: V1 web 64 files; V1 API 58 suites / 691 tests (11 new career-billing); career-server 58 suites / 401; career-api unit 15 + HTTP 27 suites / 102 (V1 bridge, purchase rules, billing boundary, admin claim + allowlist); career-shared 113; api-client 8; worker 9; extension 1; type-check of all seven packages.
- Live (emulators + private Postgres): plan gate per account type; purchase disabled (403) and unconfirmed checkout refused (400); fixture entitlement; operator access; outcomes from V1 jobs; AI failure releases its credit and a replay returns the same job; private evidence upload, owner download, cross-account 403, delete; saved edit + template switch + reopen + PDF/DOCX inspected visually (accents, guillemets, em dash, French dates, correct customer); no credits used by edits or downloads; account deletion erases career rows and soft-deletes V1; worker schedules registered.
- Browser (Edge, production build): 65/65 checks — hero at 1440/1280/768/390/360, six locales incl. ar/ur RTL, dark theme, reduced motion, keyboard focus, signed-in/out CTAs, protected-route redirects, refresh, sign-out, plans page at all widths and locales, fixture label, free/admin/entitled paths; 0 page errors.
- Build: isolated `next build` (standalone) succeeds. Root causes of the earlier local blockers: fonts.gstatic resolves to IPv6 first and there is no IPv6 route here (the build process uses `--dns-result-order=ipv4first`); symlinks now work because Developer Mode is on. Hazard found and fixed: rebuilding over an existing standalone output deleted through its absolute symlinks into node_modules (repaired offline from the pnpm store; the build script now removes the old output with `rmdir /s /q` first and refuses to run while the server uses it).

## 7. Known limitations
- L1 AI-dependent features (import, generation, tailoring, letters, text interviews) verified only on their failure path (no AI key). Speech, map tiles, licensed feeds and off-box mail/push are provider-unavailable by design.
- L2 Career documents are generated in English or French; other V1 languages get an English document (the UI is translated).
- L3 Spanish/German/Arabic/Urdu strings are machine-assisted and need native review (notably plan-name transliterations in ar/ur).
- L4 V1 server-side Puppeteer export and the mobile app were not changed or re-verified.
- L5 Local storage is a disk adapter; S3 is covered by V2's mocked adapter tests only. Stripe was not called: checkout and webhooks are verified with mocked Stripe in unit tests.
- L6 A Firebase SDK assertion ("Expected a class definition") is logged once during server rendering of the production build; pages and sign-in work. Not compared against original V1.
