# FlacronCV V2 features inside V1 — integration record

Status: **local integration branch `integration/v2-features`, not merged, not deployed.**
Baseline: V1 `main@9239e0e7`. V2 source reference: `flacroncv-v2 main@792b9958` (unchanged).
Everything below was verified only against local emulators and a private local Postgres. Nothing here is evidence about hosted behaviour.

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
- **D1 Feature-to-plan map (`CAREER_PLAN_MAP`).** Proposal for discussion, *not configured anywhere but the local demo fixture*:

  | V1 plan | Proposed career plan | Rationale |
  |---|---|---|
  | free | none (or `free` for a teaser) | `free` grants e.g. 3 document credits, 25 tracked items |
  | pro ($29.99) | `professional` | closest price point |
  | career_accelerator (not sold) | `career_pro` | plan already advertises "career tools" |
  | enterprise ($99.99, individual) | `career_pro` | `business` is a team/workspace product (seats, candidates) |
  The local demo uses `free:none,pro:professional,career_accelerator:none,enterprise:career_pro`.
- **D2** Whether career generation should draw on V1 AI credits instead of separate career allowances (currently separate).
- **D3** Whether to sell `business`, packs, human review, recruiting checkout, API packages, maintenance offer (all withheld).
- **D4** AI provider for career generation (`AI_PROVIDER=openai` + key), speech vendor, map tiles, licensed job feeds.
- **D5** Admin access: keep allowlist or honour V1 `admin/super_admin` claims (L3).
- **D6** Hosting: an extra container + managed Postgres + private S3 bucket; cost approval.
- **D7** German form of address: the new German strings use "Sie"; most older V1 German strings use "du".
- **D8** Whether to show V2's 7-stage pipeline fields (deadline/checklist) inside V1's Jobs tracker.
- **D9** One combined personal-data export file vs two downloads.

## 5. Future migrations / configuration (not executed)
1. Provision Postgres; run `pnpm --filter career-api migrate` (36 migrations; `migrate:down` refuses non-local hosts). Dry-run first on a restored staging copy; take a snapshot before; rollback = drop the career database (V1 holds no career data).
2. No V1 data migration is required. Optional later: back-fill nothing; career accounts are created lazily.
3. Configure `.env.career` per `.env.career.example` (production: `DEPLOY_ENV=production`, `FIREBASE_PROJECT_ID=flacron-cv`, read-only Firestore role for `users` and `job_applications`, `OBJECT_STORAGE=s3` + career bucket, `CORS_ORIGINS` = V1 hosts, no Stripe key).
4. Route `/api/career/*` on the existing load balancer to the career container; set `NEXT_PUBLIC_CAREER_ENABLED=true` and `NEXT_PUBLIC_CAREER_API_URL` in the web build only after D1.
5. Run the worker (`apps/career-worker`) for renewals/alerts.

## 6. Known limitations
- L1 AI-dependent features (import, generation, tailoring, letters, text interviews) were verified only on their failure path locally (no AI key).
- L2 Career documents are generated in English or French; other V1 languages get an English document (UI is translated).
- L3 Career admin uses `ADMIN_AUTH_USER_IDS`, not V1 role claims.
- L4 New German copy uses "Sie" (D7). Spanish/German/Arabic/Urdu career strings are machine-assisted and need native review.
- L5 V1 server-side Puppeteer export and mobile app were not changed or re-verified.
- L6 `next build` was not run (known local font/symlink limits); type-check and dev server only.
- L7 The emulator stack runs on local disk storage; S3 is covered by V2's mocked adapter tests only.
