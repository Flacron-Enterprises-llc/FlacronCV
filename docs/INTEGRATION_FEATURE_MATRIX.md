# Web and mobile feature matrix (V1 + integrated V2 career tools)

Branch `integration/v2-features`. First written 2 Nov 2026; **updated 13 Nov 2026 (sixth pass: mobile parity, six languages)**. Requirement IDs from `flacroncv-v2/docs/V2_REQUIREMENTS_MATRIX.md` (all 44 rows). Local evidence only; nothing here is hosted evidence.

**Status:** **A** implemented and verified locally · **P** implemented, waiting on provider configuration · **M** missing implementation · **B** blocked by an external dependency or commercial decision · **N/A** not applicable to the platform (reason given).

**Platforms.** Web = V1 Next.js app (`apps/web`) + career API. Mobile = V1 Expo app (`apps/mobile`), **one codebase for iOS and Android**. Mobile career screens exist behind `EXPO_PUBLIC_CAREER_ENABLED` (default **off**, see `V2_INTEGRATION.md` §0.5).

**What mobile "A" means.** Implemented; type-checked; unit-tested (vitest); the exact client calls each screen makes checked against the **live local** career API / V1 API with fictional accounts (scripted, data restored); every screen opened with the real screen code in a React Native Web harness at phone width against the live local APIs (no crashes, no overflow; en, fr and ar/RTL spot-checked); compiled into both the **Android and iOS** Hermes bundles (`expo export`). **No device or simulator run** (no Android SDK, no Xcode on this machine) — see the device checklist at the end.

**Languages.** Web: en, es, fr, de, ar, ur (ar/ur right-to-left). Mobile: **the same six languages since the sixth pass** (language picker in Settings, profile language shared with the website, right-to-left via `I18nManager`, guard tests for key parity, placeholders and untranslated values).

**Preconditions for any career row.** Career build switch on; the account has a career entitlement (purchased add-on, `CAREER_PLAN_MAP`, or the labelled local fixture); operator feature switches on (the menu and the mobile overview hide switched-off areas).

## Career tools (integrated V2)

| ID | Requirement | Web | Mobile | Verification | External blocker |
|---|---|---|---|---|---|
| — | Homepage hero, showcases | A | N/A (the app has no marketing homepage) | browser (pass 2, theme pass) | — |
| — | Career entry point | A (sidebar, `/career`) | A (dashboard card, Settings, career overview listing every area) | `career-view.test.ts` (every in-app area points at an existing screen) | — |
| CV01-01 | Confirmed profile facts, provenance, consent | A | A (add, edit, confirm, remove, history, preferences) | e2e `profile`; mobile `profile.test.ts`; `live-profile` 19/19 | — |
| CV01-02 | Résumé import | P | P (paste text; clean "provider not configured") | e2e `profile`; live refusal checked, allowance unchanged | OpenAI key |
| CV02-01 | Draft versions, template switch, reopen | A | A (create, layout switch, confirm version, version list) | e2e `resumes`; `live-documents` | — |
| CV02-02 | Grounded generation and tailoring, credit reserve/release | P | P (idempotency keys; clean refusal, credits unchanged) | `reliability.sh`; live refusal with same-key retry | OpenAI key |
| CV02-03 | PDF/DOCX export | A | A (share sheet) | live PDF/DOCX (pass 2); mobile file tests | — |
| CV03/CV06 | Readability, match analysis, fit reasons | A | A (readability; compare listing with a career CV; reasons de-duplicated on both) | e2e `matches`; `live-opportunities` 23/23 | — |
| CV04-01 | Letters, bios, outreach; claim checks | P (generate) / A (edit, export) | P (generate) / A (create, edit, layout, export) | e2e `writing`; letter fixture (pass 5) | OpenAI key |
| CV05-01 | Opportunities (search, paste, trust, report) | A | A | e2e `opportunities`, `opportunity-trust` | — |
| X1 | Licensed job feeds | M | M | — | Licence + keys |
| CV07-01 | Saved searches, places, followed companies, alerts, quiet hours | **A** (places and followed companies added this pass) | A | e2e `alerts`; web `AlertTargets.test.tsx`; browser 9/9 (en, fr, ar); `live-alerts` | — |
| X3 | Off-box alert delivery (email/push/Telegram) | P (email) / M (push, Telegram) | M | in-app ledger only | SES role; push creds |
| CV08-01 | Application tracking | A (V1 Job Tracker) | A (V1 Jobs) | `no-record-sync.e2e-spec.ts` | Decision D8 |
| CV19-01 | Outcome analytics | A | A | e2e `v1-bridge`; `live-alerts` (learning loop) | — |
| CV09-01 | Text interviews, STAR stories | P | P (sessions, answers, challenge) / A (STAR stories) | e2e `interviews`; `live-interviews` | OpenAI key |
| CV17-01 | Voice practice (typed), consent | A | A (typed path; no recording, said in the UI) | e2e `voice`; live refusals (consent not given on the demo account) | Speech vendor for audio |
| CV17-02 | Speech transcription | M | M | `provider_unavailable` test | Vendor decision |
| CV10-01 | Career plans purchase (add-on) | A with mocked Stripe | B (status only; no purchase in app — store rules) | payment tests | Stripe prices; store products |
| X4 | Apple/Google purchases for career | N/A | B | V1 IAP unchanged | Product IDs, decision |
| — | Entitlement + career credits display | A | A | `career-view.test.ts` | — |
| CV11-01 | Evidence vault, private files | A | A (photo/scan attachments PNG/JPEG ≤10 MiB; PDFs on the website) | `live-evidence-portfolios` | S3 for hosting |
| X2 | Object storage + malware scan | P / M (scan) | N/A (server side) | mocked S3 tests | Bucket, role |
| CV12/CV13 | Action packs, skill reports, learning | A | A | e2e `action-engine`, `learning`; `live-plans` (refusals; no fixture pack) | — |
| CV14-01 | Relocation, specialist modes | A | A | e2e `career-modes`; `live-modes-data` | Maps key (geocoding) |
| CV15-01 | Listing trust, reports, moderation | A | A (reports) / N/A (moderation is an operator tool) | e2e `opportunity-trust`, `admin` | — |
| CV16-01 | Portfolios, public link, QR | A | A (publish, private link, share, QR) | e2e `portfolios`; live publish/QR/revoke | — |
| CV18-01 | Scenarios | A | A | e2e `remaining`; `live-plans` | — |
| CV20-01/02 | Assisted forms, browser extension | A (local, unpublished) | N/A (no browser extensions on phones; shown as "desktop only") | extension test | Store accounts |
| CV21-01 | Maintenance goals | A | A | e2e `remaining` | — |
| CV21-02 | $4.99 maintenance offer | B | B | not sold | Commercial |
| CV22-01 | Map sessions, list fallback | A (list) | A (list) | `live-opportunities` | — |
| CV22-02 | Map tiles / geocoding | P / M | M | geocoder tests | Maps keys |
| CV23-01 | Business seats, workspaces | B | N/A (business console) | e2e `remaining` | Business not offered |
| CV24-01 | Human review booking | B | B (read-only list, "not bookable yet") | 409 test | Provider + commercial |
| CV25-01 | Recruiting opt-in / employer checkout | A (opt-in) / B (checkout) | A (opt-in) | `live-modes-data` (toggle restored) | Commercial |
| CV26-01/02 | Developer API, white-label, SSO | B | N/A | e2e `remaining` | Contract |
| X9 | Career data export | A | A (export, share JSON) | `live-modes-data` | — |
| X9 | Account deletion | A | A (in-app, career erasure first) | mobile `account-deletion.test.ts`; e2e `privacy` | — |
| — | Cross-account isolation | A | A (uid-keyed caches) | smoke/reliability 403s | — |
| — | Admin / operator tools | A | N/A (operator tool) | smoke 200/403 | — |
| X10 | Production deployment | B | B | — | Hosting approval |

## V1 core features (website vs app)

| Area | Web | Mobile | Notes / verification |
|---|---|---|---|
| Settings: email & marketing preferences, change password, sign out on every device, profile link validation, refund policy | A | A | `account-settings.test.ts`, `profile-links.test.ts` (165 parity cases vs the website's validator); live preference toggles restored; reset-password and sign-out-everywhere unit-tested only (they email / revoke) |
| Billing: usage, invoices | A (Stripe portal) | A (read-only invoice history; **no external payment links**, store rules) | local stack has no Stripe invoices → formatting unit-tested |
| CV editor: free title and rename, arrange/show/hide/rename sections, custom sections, photo, all fields | A | A | `cv-editor.test.ts`, `cv-photo.test.ts`; `live-v1-cv` 41/41; photo upload not run live (no Storage emulator) |
| CV design: layout, template, accent, headings, corners, fonts, size | A (live preview) | A (choices shown as names/swatches; no live render) | `cv-design.test.ts`; `live-v1-design` 15/15 |
| LinkedIn Optimizer, ATS check, interview prep | A | A | AI endpoints not called live (paid provider); request/response unit-tested |
| Template gallery with full-size preview | A | A | screen-reader reachable preview button |
| Cover letters: duplicate, DOCX, draft/final, details, template + colour, linked CV, length, job-description generator, rewrite paragraph | A | A (plain-text editing; formatted letters protected) | `cover-letter-*.test.ts`; `live-v1-letters` |
| Job tracker: location/salary/contact, archive, sort, add to calendar (.ics), duplicate warning | A | A (+ local follow-up reminders) | `job-tracker.test.ts`, `ics.test.ts`; `live-v1-jobs` |
| Support: tickets, close ticket | A | A | `live-v1-jobs` (ticket create/close, cleaned) |
| Maintenance gate, announcements, payment-issue notice | A | A (notice without a portal link) | `app-notices.test.ts` |
| Interactive app tour for new users | A (`appTour`) | A (own `mobileAppTour`, replay in Settings and Support) | API users module 93 tests; `live-v1-tour` 15/15 |
| Interface language (6, incl. RTL) | A | **A** | i18n gates (31 namespaces × 6 locales); harness sweep en/fr/ar |
| Dark theme | A | **M** (app is light-only) | — |
| Live rendered CV preview while editing | A | **M** (wizard + server export) | — |
| Server exports used by the app (PDF/DOCX) | — | A (photo, address, highlights, certification expiry/URL, reference details, custom subtitle/date, letter sender/address) | API export tests 88; PDF/DOCX routes fail **locally only** (no Chrome for puppeteer, no Storage emulator) |
| References in CVs (previews and exports) | **A (fixed this pass)** | A | snapshot tests on all five layouts, web DOCX, server HTML/DOCX |

## Mobile checks that still need a device or simulator
Cold start; sign-in/out and session restore; background/resume with unsaved edits; every area above with Free/Pro/career/admin accounts against a local API on the laptop's LAN IP (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CAREER_API_URL`, auth emulator host); camera-roll picker for CV photo and evidence; export → share sheet → temp file removed; .ics into the calendar; notifications; network failure and retry; small screens, keyboard avoidance, safe areas; **switching to Arabic/Urdu and restarting (right-to-left layout)**; screen readers (VoiceOver/TalkBack) on the tour, template cards and editors; account deletion returning to sign-in.
