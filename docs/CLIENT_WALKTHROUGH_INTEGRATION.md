# Local review walkthrough (V1 + Career integration)

Local only: http://localhost:3100/en (production build) with Firebase emulators and a private local database. Accounts are fictional; their passwords are in the ignored local file `C:\Users\win 11\FlacronCV-integration-local\demo-credentials.txt`.

| Account | What it shows |
|---|---|
| `demo.pro@example.test` | Existing V1 Pro customer, no Career add-on |
| `demo.career@example.test` | V1 Pro + Career Professional **local test entitlement** (not a purchase) |
| `demo.free@example.test` | V1 Free |
| `demo.admin@example.test` | V1 super-admin; Career operator |
| `demo.del1@…`, `demo.del2@…` | Disposable accounts for deletion tests |

## Website (about 15 minutes)
1. **Homepage, signed out:** V2 hero; then "From first draft to job offer" (product showcase: sample listings and sample tracker counts are labelled); further down "CV and cover-letter templates" with live counts from the catalog (10 CV, 6 letter templates locally) and full-page previews. Switch language (globe) to Arabic or Urdu for right-to-left; switch dark mode (moon icon).
2. **"Browse the template gallery"** → choose a template → "Use template" while signed out → sign in → you land on the new-CV page (V1 does not preselect the chosen template there; that is existing V1 behaviour).
3. **Sign in as Pro:** homepage links now go to your CVs and the Job Tracker. Open `/en/career`: the lock card explains that Career tools are an optional add-on. Open `/en/career/plans`: the prices are shown "in addition to your current plan (Pro)", Career credits are separate, and checkout says it is not set up in this environment (no Stripe prices exist locally, by design).
4. **Sign in as career:** `/en/career` shows the Career area. The menu lists only the features switched on by the operator. Try Profile, Documents (edit → save → reopen → PDF/DOCX), Opportunities, Evidence (upload/download/remove). AI-dependent buttons explain that the AI provider is not configured; no credit is used.
5. **Job Tracker** (`/en/jobs`) is unchanged and remains the only application tracker.
6. **Admin** account: `/en/admin/career` for moderation and feature switches.
7. **Deletion:** with `del1`, Settings → delete account; the career data is erased and the account closed.

## Mobile app
No phone simulator is available on this laptop, so the app was not run. What exists:
- Career tools (overview, profile facts, drafts with editing and export/share, saved opportunities), behind a build switch that is **off** by default for store builds.
- Settings → **Your data & account deletion** (new for all builds: download data, delete account in the app).
- Billing shows the Career add-on status only (no price, no purchase button, per App Store / Google Play rules).
To try it on a device: see "Mobile" in `C:\Users\win 11\FlacronCV-integration-local\README.txt`.

## What each part is (3 Nov 2026)
- **Working locally:** homepage (hero, product and template showcases); V1 CVs, letters, Job Tracker and templates; Career profile, drafts (edit, save, reopen, layout change, PDF/DOCX), evidence files, portfolios (public page shows only items marked "share on portfolio"), alerts with saved searches, data export and account deletion; operator tools; local test entitlement for the career account.
- **Mock-tested only:** buying the Career add-on through Stripe (checkout, renewals, refunds, failures, cancellation, duplicate events); S3 storage; the OpenAI adapters (no real AI call was made).
- **Awaiting provider configuration:** AI drafting, import, tailoring, letters and text interviews (OpenAI key); email alerts (SES); geocoding (Google key); Career purchase (Stripe price IDs). Not built yet: speech transcription, map tiles, licensed job feeds, Career push and Telegram.
- **Awaiting mobile device testing:** everything in the app; see `docs/MOBILE_DEVICE_CHECKLIST.md`.
- **Awaiting hosting or publication:** the career service (database, API, worker), app-store builds, the browser extension.

Editor behaviour to notice: unsaved letter text is marked and protected; if the same document was saved in another tab, the save is refused and your text stays on screen; changing the letter layout keeps your typed text; a retried paid action after a lost connection never charges twice.
