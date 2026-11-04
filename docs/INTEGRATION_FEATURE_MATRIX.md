# Web and mobile feature matrix (V1 + integrated V2 career tools)

Branch `integration/v2-features`, 2 Nov 2026. Requirement IDs from `flacroncv-v2/docs/V2_REQUIREMENTS_MATRIX.md` (all 44 rows, including those before the CV phases). Local evidence only; nothing here is hosted evidence.

**Status:** **A** implemented and verified locally · **P** implemented, waiting on provider configuration · **M** missing implementation · **B** blocked by an external dependency or commercial decision · **N/A** not applicable to the platform (reason given).

**Platforms.** Web = V1 Next.js app (`apps/web`) + career API. Mobile = V1 Expo app (`apps/mobile`, iOS + Android, English only, light theme). Mobile career screens exist behind `EXPO_PUBLIC_CAREER_ENABLED` (default **off**, see `V2_INTEGRATION.md` §0.5). **No mobile row was run on a device or emulator** (none available here): mobile "A" means implemented, type-checked, unit-tested and included in a locally built Android JS bundle; on-device checks are listed at the end.

**Fifth pass (4 Nov 2026).** Data-safety and reliability fixes verified by tests (see `V2_INTEGRATION.md` §6): allowance cannot be reset by delete/re-create; V1 status checked fresh before operator routes, provisioning and writes; background erasure removes invitations by a recorded verified address; AI reservations held by a renewed lease; unsaved-edit guard on links, Back and switches (web) and back navigation (mobile code); closure sweep batches with backoff; notification outbox. The letter editor and exports were verified in the browser with a labelled fixture letter (not AI generation).

**Preconditions for any career row.** Career build switch on; the account has a career entitlement (purchased add-on, `CAREER_PLAN_MAP`, or the labelled local fixture); phase 2–4 operator switches on (the menu and the mobile overview now hide switched-off areas).

| ID | Requirement | Existing V1 | V2 capability | Web | Mobile | Required implementation (remaining) | Verification | External blocker |
|---|---|---|---|---|---|---|---|---|
| — | Homepage hero | V1 hero | V2 hero | A | N/A (app has no marketing homepage) | — | browser 65/65 (pass 2) | — |
| — | Homepage product + template showcases | Features grid | V2 HomePreviews/showcase | A | N/A (app has its own Templates tab and dashboard cards) | — | `Showcase.test.tsx`; Edge 38/38 (5 widths, 6 locales, RTL, dark, reduced motion, keyboard) | — |
| — | Career entry point | — | V2 nav | A (sidebar, `/career`) | A (dashboard card, Settings, Billing card) | — | browser; mobile tsc + bundle | — |
| CV01-01 | Confirmed profile facts, provenance, consent | — | facts | A | A (review, confirm = consent, remove) | Mobile: add/edit facts (web only) | e2e `profile`; web tests; mobile `factSummary` test | — |
| CV01-02 | Résumé import | V1 AI import | import (parses via AI) | P | M (web only) | — | e2e `profile` (unconfigured refusal) | OpenAI key |
| CV02-01 | Draft versions, template switch, reopen | V1 CV editor | resume studio | A | A (line editing, revision-checked save, reopen; template switch on web) | Mobile template switch | e2e `resumes`; `edit-utf8.mjs`; mobile tsc | — |
| CV02-02 | Grounded generation, credit reserve/release | V1 AI summary | generation | P | M (needs AI; web only) | — | `reliability.sh`: released, replay same job, credits 60→60 | OpenAI key |
| CV02-03 | PDF/DOCX export | V1 export | export | A | A (share sheet, temp file deleted) | — | live PDF/DOCX inspected (pass 2); mobile file tests | — |
| — | Transfer career draft to V1 CV/letter editor | V1 editors | one-way copy | A | N/A on mobile (done on web; V1 editor stays authoritative) | — | `to-v1.test.ts`; browser copy flow (1 click → 1 V1 CV) | — |
| CV03/CV06 | Readability, match analysis, fit reasons | V1 ATS check | matching | A | M (web only) | — | e2e `matches` | — |
| CV04-01 | Letters, bios, outreach; claim checks | V1 cover letters | writing | P (generation) / A (edit, save, conflict, export — browser-verified with a fixture letter) | A (edit, save, export, share) | — | e2e `writing` | OpenAI key |
| CV05-01 | Opportunities (paste) | — | opportunities | A | A (read-only list, "no live feed") | Mobile paste | e2e `opportunities` | — |
| X1 | Licensed job feeds | — | parsers only | M | M | Live feed loader + licence | — | Licence + keys |
| CV07-01 | Saved searches, alerts, quiet hours | — | alerts | A (in-app; saved searches managed; locations/companies UI missing) | M | Web: locations/followed companies UI; mobile screen | e2e `alerts` | — |
| X3 | Off-box alert delivery (email/push) | V1 SES, V1 Expo push for job reminders | SES mailer + delivery outbox (claimed, bounded retries, uncertain state) | P (email) / M (push) | M (career push) | Career push bridge to V1 push tokens; Telegram sender | e2e `alerts` (in-app ledger) | SES role; push creds |
| CV08-01 | Application tracking | **V1 Job Tracker** | V2 tracker | A (V1 `/jobs`, unchanged) | A (V1 Jobs, unchanged) | — (merged; no duplicate tracker) | `no-record-sync.e2e-spec.ts` | Decision D8 (pipeline fields) |
| CV19-01 | Outcome analytics | V1 jobs | learning loop | A | M (web only) | — | e2e `v1-bridge`; smoke (50 % sample) | — |
| CV09-01 | Text interviews, STAR | V1 interview prep | interviews | P | M (web only) | — | e2e `interviews` | OpenAI key |
| CV17-01 | Voice practice (typed), consent | — | voice | A | N/A for now (no mic UI; typed path on web) | Mobile mic capture + permission flow | e2e `voice` | Speech vendor |
| CV17-02 | Speech transcription | — | unconfigured adapter only | M | M | Vendor adapter + web/mobile capture | `provider_unavailable` test | Vendor decision |
| CV10-01 | Career plans purchase (add-on) | V1 Stripe | V2 catalog | A with mocked Stripe; live sale waits for prices | B (status only; no purchase in app) | Career IAP products + verification (if wanted) | 154 payment tests; `CareerPlansScreen.test.tsx`; smoke 403/400; mobile copy test | Stripe prices; store products; Apple 3.1.3(b) |
| X4 | Apple/Google purchases | V1 Pro/Enterprise IAP | V2 verifiers (not mounted) | N/A (no store purchases on web) | B | as above | V1 IAP unchanged | Product IDs, decision |
| — | Entitlement + career credits display | V1 plan/usage | usage | A | A (overview, Billing card; local fixture labelled) | — | mobile `career-view.test.ts` | — |
| CV11-01 | Evidence vault, private files | — | evidence | A (local disk) | N/A for now (web upload; no file picker dependency in app) | Mobile document picker + upload | `reliability.sh` (upload 200, other account 403, delete, 404 after) | S3 for hosting |
| X2 | Object storage (S3) + malware scan | Firebase Storage (avatars) | S3 adapter | P / M (scan) | N/A (server side) | Malware scanning | mocked S3 tests | Bucket, role |
| CV12/CV13 | Action packs, skill reports, learning | — | action engine | A | M (web only) | — | e2e `action-engine`, `learning` | — |
| CV14-01 | Relocation, specialist modes | — | career modes | A (geocoding P) | M (web only) | — | e2e `career-modes` | Maps key |
| CV15-01 | Listing trust, reports, moderation | — | trust | A | N/A (moderation is an operator tool) | — | e2e `opportunity-trust`, `admin` | — |
| CV16-01 | Portfolios, public link, QR | — | portfolios | A | M (web only) | — | e2e `portfolios` | — |
| CV18-01 | Scenarios | — | scenarios | A | M (web only) | — | e2e `remaining` | — |
| CV20-01/02 | Assisted forms, browser extension fill | — | extension | A (local, unpublished) | N/A (no browser extensions on phones) | Store publication (optional) | extension test | Store accounts |
| CV21-01 | Maintenance goals | — | maintenance | A | M (web only) | — | e2e `remaining` | — |
| CV21-02 | $4.99 maintenance offer | — | — | B | B | — | not sold | Commercial |
| CV22-01 | Map sessions, list fallback | — | maps | A (list) | M | — | e2e `remaining` | — |
| CV22-02 | Map tiles / geocoding | — | geocoder; tiles unconfigured | P (geocoding) / M (tiles) | M | Tiles adapter | geocoder tests | Maps keys |
| CV23-01 | Business seats, workspaces | — | business | B (works on a plan mapped to business; no assignment UI) | N/A (operator/business console) | Assignment UI | e2e `remaining` | Business not offered |
| CV24-01 | Human review booking | — | services | B | B | — | 409 test | Provider + commercial |
| CV25-01 | Recruiting opt-in / employer checkout | — | recruiting | A (opt-in) / B (checkout) | M (opt-in) | — | e2e `remaining` | Commercial |
| CV26-01/02 | Developer API, white-label, SSO | — | developer | B | N/A | — | e2e `remaining` | Commercial / contract |
| X6–X8 | Shared records / V2 independence | — | — | N/A (withdrawn by design) | N/A | — | `no-record-sync` | — |
| X7 | Keep V1 subscribers on V1 plans | V1 billing | — | A | A (V1 IAP untouched, not migrated) | — | `v1-billing-boundary`; payment tests | — |
| X9 | Data export | V1 export | career export | A | A (V1 export via share sheet; career export on web) | Mobile career export | mobile share test; web pass 2 | — |
| X9 | Account deletion | V1 soft delete (web only) | career erasure | A | A (**new**: in-app deletion, career erasure first) | — | mobile `account-deletion.test.ts`; e2e `privacy`, `v1-bridge`; scheduler spec | — |
| — | Cross-account isolation | V1 rules | per-user rows | A | A (uid-keyed caches, drafts cleared on sign-out) | — | smoke 403s; reliability 403 | — |
| — | Admin / operator tools | V1 admin | `/admin/career` | A (claim + allowlist) | N/A (operator tool) | — | smoke 200/403 | — |
| — | Translations / RTL | 6 locales | — | A | N/A (app is English-only today) | App i18n would be a separate project | locale tests; browser RTL | — |
| X10 | Production deployment | — | — | B | B | — | — | Hosting approval |

## Mobile checks that still need a device or simulator
Cold start; sign-in/out and session restore; background/resume with unsaved edits; Career access for Free/Pro/career/admin accounts against a local API (`EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CAREER_API_URL` on the laptop's LAN IP); export → share sheet → temp file removed; network failure and retry; small screens, keyboard avoidance, safe areas; dark mode (the app is light-only today); account deletion returning to sign-in.
