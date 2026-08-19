# FlacronCV — Client Requirements Tracker

> **Purpose.** Single source for everything the client asked for in the **2026-08-16** batch
> (Development Review, 60 sections + Legal & Contact Content Package). Replaces both PDFs.
>
> **⚠️ Read `PROJECT_PROGRESS.md` before this file.** A large share of the client's list is
> **already built**. Every item below has been checked against that record and carries an
> **Already-built** note where relevant. Do not let an agent rebuild finished work.
>
> **Status:** `☐` not started · `◐` partial · `☑` done · `⛔` blocked · `❓` needs client answer
> **🔒** = touches auth, billing, or data shape → explicit approval before code.

---

## 0. STATE OF PLAY

~~`PROJECT_PROGRESS.md` is dated **2026-07-29**.~~ **Updated 2026-08-18.** A verification pass has since
re-read the record against the source. `PROJECT_PROGRESS.md` now carries a `§2A` infrastructure section
covering the 2026-08-16 AWS work, in-place corrections where the code had moved past it, and a
change-log entry for the pass. Two new documents accompany it:

- **`ARCHITECTURE_MAP.md`** — directory purposes, request lifecycle and where auth is enforced at each
  hop, API module map, web route map, Firestore data model, env-var table, **the complete plan-data
  audit (E.1)**, and a Gotchas section. Unverified claims are marked `⚠️ UNVERIFIED`.
- **`DEPLOYMENT_AND_OPS.md`** — the real deploy path, verification commands, the four regressions and
  their guards, and a troubleshooting table.

**Four items in this file were corrected against the code and are marked inline:** R-1/B-5/E.5 (yearly
billing is enabled, not blocked), R-2/G.9 (the trial hole is closed — do not commission a backfill on
the old premise), R-3 (five i18n gates, not four), R-4/F.3 (Free skipped by the monthly reset).
**Q-2 closed 2026-08-19 as (a′)** — monthly reset for paid CVs/letters, and delete does not restore
the allowance. Treat the record as authoritative on application code; infrastructure
now lives in `DEPLOYMENT_AND_OPS.md`.

**What the record already proves is built** (do not re-scope these):

| Client asks for | Reality |
|---|---|
| §18–19 Central plan config | ✅ `PLAN_CONFIGS` + `PLAN_RANK` + `resolveEffectivePlan()` + `isPlanPurchasable()` in shared-types, with `plan-advertising.spec.ts` (26 tests) asserting advertised copy matches enforced limits |
| §8 Atomic usage counters | ✅ `FieldValue.increment` + transaction-based `reserveAiCredit` (concurrency-tested: 10 simultaneous reserves on 2 remaining → exactly 2 succeed) |
| §15 No credit charge on failure | ✅ reserve → call → confirm/refund, in `AIService.generate` |
| §13 Rate limiting | ✅ global `ThrottlerGuard` + per-route `@Throttle` on support, contact, leads, failed-login |
| §16 "N remaining" usage display | ✅ A2, 2026-07-19 |
| §22–24 Trial system | ✅ built 2026-07-20 (7-day, card-upfront) — **but see the abuse hole in R-2** |
| §28 Billing history + invoices | ✅ A3, native Stripe invoice list + PDF links |
| §40–42 Errors / loading / autosave | ✅ Epic R (35 findings), `ApiError` classification, autosave retry with backoff |
| §44 Document ownership | ✅ IDOR audit 2026-07-20 — 10 agents, 0 cross-user findings |
| §43 Export entitlement | ✅ A8 + 2026-08-19 reserve/confirm/refund — failed client render does not keep the charge |
| §47 Analytics | ◐ Batch L catalog + call sites + consent gate test — needs `NEXT_PUBLIC_GA4_MEASUREMENT_ID` |
| Legal pages | ◐ English bodies for terms, disclaimer, refund, cookies in `apps/web/src/legal/*.ts` (version `2026-08-16`). Routes kept: **`/privacy-policy`, `/terms-of-service`, `/cookie-policy`, `/contact-us`** — not the client's checklist `/privacy`, `/terms`, `/contact`. New: `/disclaimer`, `/refund-policy`. **Privacy still the locale-JSON policy** until the client names AWS SES and OpenAI in §4. Contact UI localised × 6. |
| Cookie consent | ☑ three categories + preference center (Batch C) — Marketing omitted (Q-12) |
| §5 ATS-parseable export | ✅ text-layer PDF shipped 2026-07-30 (render mode 3), proven by stream inspection |

---

## 1. BLOCKERS — before any Priority-1 code

| ID | Item | Why | Owner |
|---|---|---|---|
| ⛔ B-1 | Email verification 500s (`POST /api/v1/auth/send-verification`) | Client's whole abuse flow (§3, §6) starts at *Email Verified* | You (AWS) |
| ⛔ B-2 | SES FROM domain mismatch | **Corroborated twice.** The record notes the API's configured address is `@flacronenterprises.com` while legal/support copy uses `@flacroncv.com`. §26 requires `@flacroncv.com`. Verify **flacroncv.com** in SES — not the parent domain. | You (AWS) |
| ⛔ B-3 | Five secrets exposed, plaintext on ECS task def | Also flagged in `PROJECT_PROGRESS.md` §8 as long-outstanding | You (AWS) |
| ⛔ B-4 | Stripe test mode | Client says "before launch" | Client |
| ⛔ B-5 | **No real Stripe yearly prices** — ⚠️ **CORRECTED 2026-08-18: annual prices ARE configured and yearly billing is enabled.** What remains is *verification*, not supply — run `apps/api/scripts/verify-yearly-prices.mjs` to confirm both ids are `interval=year`. See the R-1 correction and Q-4. | Blocks §25 entirely — see R-1 below | Client |

**Order:** SES domain verify + production-access request today (24–48h clock) → rotate secrets
while waiting → confirm CodeBuild webhook off → pull the CloudWatch trace regardless (a genuine
sandbox rejection is a handled `MessageRejected`; a raw 500 means an unhandled path too).

---

## 2. ⚠️ RISKS THE CLIENT'S LIST WOULD RE-INTRODUCE

These are the ones that cost money or break the build. Read before scoping anything.

**R-1 — §25 Monthly/Yearly toggle: do not simply "make it work."**
The toggle is disabled on purpose. It previously sent `stripePriceIdYearly` to a **monthly**
billing interval — $359.99/mo charged where $239.88/yr was displayed, roughly **18×**, reachable
by every free user. The fix disabled the toggle *and* added a backend monthly-price whitelist
(`allowedCheckoutPriceIds()`) that rejects yearly IDs. Re-enabling requires **real Stripe yearly
prices** plus lifting the guard deliberately. There is a `YEARLY_BILLING_ENABLED` flag for it.

⚠️ **CORRECTED 2026-08-18 — this has already happened. Yearly billing is LIVE.**
`YEARLY_BILLING_ENABLED = true` (`packages/shared-types/src/subscription.types.ts:273`), annual price
ids are configured for Pro and Enterprise, and `allowedCheckoutPriceIds()` admits them under that same
flag (`payment.service.ts:52`). The paragraph above is left as written because it explains *why* the
guard existed. **What actually protects the path now is different and stronger:** the browser no longer
chooses a price at all — checkout takes `{plan, interval}` and the server resolves the id
(`payment.service.ts:120-134`), `normalizeInterval` defaults anything unrecognised to the *cheaper*
MONTH (`:143`), and the resolved id is still allowlist-checked (`:169`). **So `B-5` and `E.5` below are
no longer blocked.** **Batch E** wrapped mobile `PLAN_CONFIGS` around shared-types, so that app
no longer advertises $239.88/yr. What remains is Q-4: **UNVERIFIED that the configured yearly
ids are `interval=year` in Stripe — a launch blocker.** Full audit in `ARCHITECTURE_MAP.md` §8.

**R-2 — §23 Trial abuse is a live revenue leak, already diagnosed.**
`isFirstTimeSubscriber` reads `stripeSubscriptionId`, which is **cleared on cancellation** — so
cancel → resubscribe grants an unlimited series of free trials. Fix needs a never-cleared
`hasUsedTrial` flag **and a production data backfill**. Flagged "high priority" since 2026-07-20
and still open.

⚠️ **CORRECTED 2026-08-18 — substantially CLOSED. Re-scope `G.9` before paying for a backfill.**
`isFirstTimeSubscriber` still *starts* from `!stripeSubscriptionId`, but when that looks true it now
queries Stripe's own history — `subscriptions.list({ customer, status: 'all' })` — and **fails closed**
on error (`payment.service.ts:204-219`). `stripeCustomerId` is **not** cleared by cancel or
`revokeToFree()` (`:618`), so cancel → resubscribe finds the prior subscription and grants no second
trial. There is exactly **one** call site that decides trial eligibility. **`hasUsedTrial` shipped
in Batch G part 1 (2026-08-18)** as defence-in-depth, consulted in addition to the Stripe list, and
is never cleared. **No production backfill was run** — existing accounts omit the field (treated as
false); the Stripe check still covers cancel→resubscribe. Residual: a stored customer id that no
longer resolves in Stripe; a new email (G device identity). **Do not commission a backfill on the
old “live leak” premise.**

**R-3 — Legal content vs the i18n gates. Q-10 answered 2026-08-18: option (b), bodies out of JSON.**
Legal chrome stays in `t()`. English bodies for terms / disclaimer / refund / cookies live in
`apps/web/src/legal/*.ts`. Privacy is still locale JSON (`privacy.s3_desc`) until MC1.
⚠️ **There are FIVE gates, not four.** The first four are
`locale-parity.test.ts` (identical key sets), `no-hardcoded-english.test.ts`, `keys-resolve.test.ts`,
**and `locale-untranslated.test.ts`** — which rejects a key that exists in all six files but whose
non-English value is still the English sentence. **So "copy the English text into all six locales to
satisfy parity" fails CI in five locales at once.** That is why the bodies were not stuffed into
`ALLOWED` (that list is for brands and addresses). The fifth, `locale-encoding.test.ts` (added
2026-08-18 after French `footer.about` shipped as "ì propos"), rejects a file that is not strict
UTF-8, HTML entities, `U+FFFD`, C1 controls, known mojibake sequences, and a locale whose values
contain no letter from its own alphabet. **It does not catch missing diacritics** (`cree` vs `crée`).
Live slugs are `/privacy-policy`, `/terms-of-service`, `/cookie-policy`, `/contact-us` — not
`/privacy`, `/terms`, `/contact`. Options that were considered:
- **(a) Translate everything into 5 languages.** Faithful, expensive, and a mistranslated Terms
  is a legal liability.
- **(b) English-only legal pages** with "the English version controls." Standard industry practice.
  **Chosen.** Bodies are TypeScript modules, not an allowlist of 200 English keys.
- **(c) Update only changed sections**, keeping existing translations.

**i18n gate remainder — `keys-resolve` now matches `t.rich('key')`.** Closed 2026-08-18; the
call regex allows optional `.rich` and a non-vacuity assert requires at least one bound `.rich(`
in the scan. Still outside the regex, recorded in that test file: `t.markup` / `t.raw`,
double-quoted keys, template-literal keys, and `getTranslations({ locale, namespace })` (object
form — dishonest to widen with a regex).

**R-4 — §1/§2 Free Plan one-time is not a label change — but the reset scope is narrower than it looks.**
*Rewritten 2026-08-18 after reading the service.* `UsageResetService` resets every user with
`isActive == true`, on two triggers (an `EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` cron and a startup
catch-up against the `system/usage_reset` marker), using an `onApplicationBootstrap` hook — moved
there after a real race bug, **do not move it back**. Making Free one-time means changing **who** that
service resets, not renaming a heading. Paid plans must keep resetting.

**What it actually resets (updated 2026-08-19):** for **paid** users, `UsageResetService` now writes
`usage.aiCreditsUsed`, `usage.exportsThisMonth`, `usage.cvsCreated`, `usage.coverLettersCreated`,
`usage.aiCreditsLimit` (re-synced to the plan) and `usage.lastExportReset`. Free docs are skipped
entirely — no write — so consumed counters stay as they stand. Q-2 closed as (a′): monthly reset
for paid CVs/letters, **and** delete does not restore the allowance.

**Client instruction (verbatim, 2026-08-19):** "Do not refund an allowance when a user deletes a
document. Limits count CREATIONS during the cycle, not documents currently stored."

Deleting a CV or cover letter no longer decrements `cvsCreated` / `coverLettersCreated`. Failed
cover-letter *generation* still refunds via `rollbackFailedCreate`; that is not a user delete.

A `free_grants` table (old F.1) is **not being built** — option (b), 2026-08-18: a uid-keyed grant
cannot survive a new email, monthly resets destroyed the consumption history a migration would need,
and identity belongs in Batch G. **F.3 shipped 2026-08-18** — see the update below.

**R-4 update 2026-08-18 — F.3 shipped.** Free is excluded from `UsageResetService` on stored
`subscription.plan` (not `resolveEffectivePlan`). Paid plans reset AI credits and exports.

**R-4 / Q-2 update 2026-08-19.** Paid plans also reset `cvsCreated` and `coverLettersCreated` on
the same cron. Free still never resets those counters. Delete does not restore them on any plan.

**R-5 — §3 "Require verified email" reverses a deferred decision.**
Server-side `emailVerified` enforcement was explicitly deferred: it must exempt the verify/resend
endpoints and handle Firebase token-refresh lag. The client has now effectively decided it.
Getting this wrong locks every existing unverified user out.

**R-6 — Paid users cannot change plan in-app.**
The billing page gates upgrade cards behind `isFreePlan`; paid subscribers route to the Stripe
portal (and Enterprise CTA routes to `/contact-us`). §26's upgrade/downgrade asks are a real build,
not a wiring fix.

**R-7 — `apps/mobile` exists.** React Native/Expo, in the workspace, with its own lint config and a
recently-fixed export path. Changes to shared-types affect it. It is absent from the handoff doc.

---

## 3. ❓ QUESTIONS FOR THE CLIENT — send today

| ID | Question | Source |
|---|---|---|
| Q-1 | **Confirm the AI-credit definition we already publish.** *Reframed 2026-08-18 — a definition does exist, in shipped customer-facing copy.* `pricing.terms_credit_desc` (`apps/web/public/locales/en/common.json:122`, all six locales) defines one credit as one AI request across summary generation, cover-letter generation, ATS check, interview prep and LinkedIn optimisation, **not charged on failure** — and the code matches (`AIService.generate` reserves one credit per call and refunds on failure). So the ask is **confirm or amend the published definition**, not supply a new one. It is already a representation to customers. | §14 |
| Q-2 | **Do Pro's 10 CVs / 20 cover letters reset monthly?** **Closed 2026-08-19 as (a′).** Monthly reset for **paid** CVs/letters; delete does **not** restore the allowance on any plan. Verbatim: "Do not refund an allowance when a user deletes a document. Limits count CREATIONS during the cycle, not documents currently stored." Free: 5 CV creations and 1 cover-letter creation, never reset — create 5, delete all 5, never another on Free. Failed generation still refunds. | §20 |
| Q-3 | **Career Accelerator ($49.99) — still wanted?** **Answered 2026-08-18: keep the code, hide it from every public surface, do not launch.** `customerFacingPlans()` / empty `stripePriceIdMonthly` is the hide rule. **Filling `stripePriceIdMonthly` auto-launches it** on pricing, billing, comparison, and JSON-LD. Do not fill it by accident. Admin CRM grant still works. | Codebase |
| Q-4 | **Annual prices for each plan — confirm, rather than supply.** *Updated 2026-08-18.* Annual prices **are already asserted in config and on sale**: `YEARLY_BILLING_ENABLED = true` with Pro `299.99/yr` and Enterprise `999.99/yr`. Mobile now reads those figures from shared-types. ⚠️ **UNVERIFIED that those two Stripe ids really are `interval=year` in the deployed account — this is a launch blocker for marketing annual plans.** `apps/api/scripts/verify-yearly-prices.mjs` settles it and was not run here (it reaches Stripe). A month-interval price sitting in `stripePriceIdYearly` is exactly what caused the ~18× overcharge. Career Accelerator still has no annual price (ties to Q-3). See R-1. | §25 |
| Q-5 | **Card required for the trial?** **Answered 2026-08-18: yes.** Stripe default; Pro 7-day trial. | §22 |
| Q-6 | **Does Enterprise get a trial?** **Answered 2026-08-18: no.** Server skips `trial_period_days` for Enterprise even on a first-time subscriber. CTA is “Choose Enterprise”, straight to checkout. | §22 |
| Q-7 | **Public LinkedIn URL.** The supplied link is an admin dashboard — visitors hit a login wall. | Socials |
| Q-8 | **Stripe live keys — when?** **Answered 2026-08-18: stay in TEST mode.** Keys from env vars only; clean test-to-live switch with no code change. | §7 legal |
| Q-9 | **Enterprise as a team plan?** **Answered 2026-08-18: no.** Individual high-usage plan. No seats, no team workspace, no org admin. | §21 |
| Q-10 | **Legal pages: English-only or fully translated?** **Answered 2026-08-18: English-only bodies, controlling-version sentence, contact UI stays localised.** Implemented for terms / disclaimer / refund / cookies. Privacy waits on subprocessors (B.1 / B.10). | Legal pkg |
| Q-11 | **`contact@flacroncv.com` — does the mailbox actually route?** Customer-facing copy and the `CONTACT_EMAIL` last fallback now name `contact@flacroncv.com`. `SES_FROM_*` untouched (transactional sender identity). Whether that mailbox actually receives mail is still an AWS/DNS check (ties to B-2). | §25 legal |
| Q-12 | **Marketing cookie category.** Client package specifies a Marketing cookie category; no advertising, pixel, or campaign technology exists in the product. Built three categories per client §7. Confirm, or specify the planned marketing technology. | §9 legal |

---

## BATCH A — Onboarding
**Depends on:** nothing.

| ID | Task | Status |
|---|---|---|
| A.1 | `pnpm install`; build `packages/shared-types` (its `dist` must exist) | ☐ |
| A.2 | Copy this file + the onboarding prompt to repo root | ☐ |
| A.3 | Create `.cursor/rules/flacroncv.mdc` (`alwaysApply: true`) | ☐ |
| A.4 | Send onboarding prompt → verify + refresh docs | ☐ |

---

## BATCH B — Legal & contact content
**Depends on:** A, **Q-10**. **Risk:** low to production, high friction from i18n.

| ID | Task | Status |
|---|---|---|
| B.1 | Replace `/privacy-policy` (keep the live slug) with the new Privacy Policy (17 sections). **Blocked:** client §4 does not name AWS SES or OpenAI; `subprocessor-disclosure.spec.ts` still requires those names in `privacy.s3_desc`. Do not replace the page until they are in the client text. **Also recorded:** client §10 is weaker than the live deactivation-vs-erasure wording (not false; raise later). Client §1.9 discloses hashed device/IP identifiers Batch G has not built — do not publish that section ahead of G. | ☐ |
| B.2 | Replace `/terms-of-service` (keep the live slug; 30 sections) | ☑ |
| B.3 | **New** `/disclaimer` — AI, ATS & Employment Disclaimer | ☑ |
| B.4 | **New** `/refund-policy` | ☑ |
| B.5 | Replace `/cookie-policy`. Three categories. **§6 Marketing omitted. §2 “Support marketing where permitted” held pending the client.** Original numbers kept. | ☑ |
| B.6 | Update `/contact-us` — 26-option category dropdown, new copy, success/error states. Slug kept (not `/contact`). | ☑ |
| B.7 | Contact routing → `contact@flacroncv.com`. **`ContactModule` + `POST /contact` already exist** (throttled 5/min, HTML-escaped, replyTo=visitor). `CONTACT_EMAIL` last fallback updated; payload extended with account email, plan, user ID, timestamp. **`SES_FROM_EMAIL` / `SES_FROM_NAME` not changed.** | ☑ |
| B.8 | Shared legal layout: 900–1000px, uncropped logo, light/dark, orange accents, desktop TOC, Last Updated, Back to Top | ☑ |
| B.9 | Legal document versioning (`2026-08-16`) across published English documents. Privacy recorded as pending. **No acceptance modal** (Batch H). | ☑ |
| B.10 | **Subprocessor list must stay accurate** — `subprocessor-disclosure.spec.ts` (9 tests) ties the Privacy Policy to the SDKs in `apps/api/package.json`, both directions. New privacy text must name **AWS SES**, Firebase, Stripe, OpenAI or the test fails. **Unchanged — blocked with B.1.** | ☐ |
| B.11 | Sweep for stale customer-facing addresses; standardise on `contact@flacroncv.com` | ☑ |
| B.12 | In-app disclaimers: AI builder, ATS screens, cover letter, export review. **Done 2026-08-19 as product UI (×6), not a legal-document body.** Export is a **passive notice** (full client title+body, no second click) — kept passive as UX (client’s “consider showing”); the old Cancel-steals-quota risk is closed by reserve/refund (2026-08-19). §18 support email omitted (already in footer / contact / legal docs). Mobile out — `PROJECT_PROGRESS.md` §8 Mobile localisation gap. | ☑ |

**Not in this batch:** the acceptance modal and its DB record — Batch G.

---

## BATCH C — Cookie consent upgrade
**Depends on:** B. **Already built:** a `CookieConsent` banner (Accept/Decline), site-wide, persisted
to `localStorage`, wired to `setAnalyticsConsent()` and gating GA4.

| ID | Task | Status |
|---|---|---|
| C.1 | Three buttons: Accept All / Reject Non-Essential / Manage Preferences. Reject must not be de-emphasised. | ☑ |
| C.2 | Preference Center — Strictly Necessary (always on), Preferences, Analytics, ~~Marketing~~ | ☑ |
| C.3 | Persistent "Cookie Preferences" footer control that reopens it | ☑ |
| C.4 | Per-category consent must actually gate the relevant technologies, not just record a choice | ☑ |
| C.5 | **Recognised browser privacy signals** (legal §12): evaluate Global Privacy Control — `navigator.globalPrivacyControl`, and the `Sec-GPC` request header. Nothing in the codebase reads either. Small, but its own micro-change: it needs a decision on precedence when GPC and a saved choice disagree. **Not in the Batch C implementation.** | ☐ |

**Built three categories, not four — 2026-08-18.** Marketing was dropped deliberately. No advertising,
pixel, attribution, or campaign technology exists anywhere in the product, and the live
`/cookie-policy` documents exactly three categories (Essential, Preference, Analytics), with its
Preference examples — "language selection, dark/light mode, sidebar state" — matching precisely what
the new Preferences toggle gates. A fourth toggle would have controlled nothing, which is the same
defect as E.10's watermark claim: a published promise with no mechanism behind it. Per the client's
own Cookie Policy §7 (the policy reflects technologies actually deployed) and §6 (conditional on
advertising technology existing), three keeps the code and the published policy in agreement. The
four-category text belongs to Batch B. See **Q-12**.

---

## BATCH D — SEO, socials, footer branding
**Depends on:** B. **Already built:** `app/sitemap.ts` (localized public paths × 6 locales with
hreflang + `x-default`; English legal bodies are a single `en` loc),
`app/robots.ts`, `lib/seo.ts` `pageMetadata()`, Organization + WebSite JSON-LD, `site.webmanifest`.

| ID | Task | Status |
|---|---|---|
| D.1 | Extend sitemap to the new legal routes (`/disclaimer`, `/refund-policy`) | ☑ — added. English legal bodies (terms, cookies, disclaimer, refund) emit **one `en` URL** with hreflang `en` + `x-default` only. Privacy and contact keep 6-locale hreflang. Live slugs kept (`/privacy-policy`, `/terms-of-service`, `/contact-us`), not the client's `/privacy` `/terms` `/contact`. |
| D.2 | Per-page metadata audit — the record says only some pages have full metadata | ☑ — auth pages localized; `/confirm` and 404 covered; private groups `noindex`. Homepage `generateMetadata` is still **English-only** (hand-rolled, not `pageMetadata()`). |
| D.3 | SoftwareApplication + BreadcrumbList JSON-LD (noted as an outstanding LOW) | ☑ — **no `aggregateRating`**, deliberately: no real reviews exist. Organization/WebSite scoped to public routes + homepage, not site-wide. |
| D.4 | Footer rebuild — Product / Company / Legal / Account, contact block, parent company | ☑ |
| D.5 | Social links (below). Clickable "Flacron Engine" placeholder. | ☑ — LinkedIn omitted pending **Q-7**. Renders as **text links, not brand icons**: `lucide-react` 0.309 has no Pinterest/TikTok/Bluesky/X mark and no dependency could be added, so the choice was words or approximated logos. TODO in `SocialLinks.tsx` |
| D.6 | © 2026 FlacronCV sweep — landing, dashboard, auth, billing, emails, ~~generated docs~~ | ☑ — **generated documents excluded by client decision:** branding on an exported CV is a watermark on a document the user sends to employers. Auth pages had it hardcoded in English (closes the LOW at `AUDIT_OPEN_FINDINGS.md:215`); dashboard and billing had none. Admin/CRM layouts untouched — not in the client's list |
| D.7 | "Powered by Flacron Engine" consistently, subtler than the copyright but visible | ☑ — one `PoweredBy` component across landing/auth/dashboard; `FLACRON_ENGINE_URL` in one place with a TODO, interim target the parent-company site |

| Platform | URL |
|---|---|
| Pinterest | `https://www.pinterest.com/rodrigue0435` |
| LinkedIn | ❓ Q-7 — supplied link was `/admin/dashboard/`. Likely `https://www.linkedin.com/company/109062090/` |
| X | `https://x.com/flacron14958` |
| Bluesky | `https://bsky.app/profile/flacronenterprises.bsky.social` |
| YouTube | `https://www.youtube.com/@FlacronEnterprises` |
| TikTok | `https://www.tiktok.com/@flacronenterprises` (strip `?lang=en`) |
| Instagram | `https://www.instagram.com/flacronenterprisesllc/` |

All external: `target="_blank" rel="noopener noreferrer"` + accessible labels. Note these are
parent-company accounts, not FlacronCV-specific.

---

## BATCH E — Plan config gaps 🔒
**Depends on:** Q-1, Q-2, Q-3, Q-4, Q-9. **Mostly already built** — this is gap-closing, not a build.

| ID | Task | Status |
|---|---|---|
| E.1 | Audit every surface for plan data **not** read from `PLAN_CONFIGS`. Audit lives in `ARCHITECTURE_MAP.md` §8. **Batch E:** mobile wrap + billing comparison cells + dead `pricing.save` removed. **2026-08-19:** Pro/Career `features` now `10 CVs/month` / `20 Cover Letters/month` (and Career 25/50); `faq.a1` cadence corrected × 6. Remaining: `crm-settings.planLimits` (unenforced), Tier 3 `?? 5` leftovers, other English `features` literals. | ◐ |
| E.2 | Resolve Q-3 — **hide, keep code.** Public surfaces use `customerFacingPlans()`. JSON-LD offers filtered. CRM grant unchanged. Filling `stripePriceIdMonthly` is the launch pin. | ☑ |
| E.3 | Q-1 answer → define and document the AI credit unit; surface cost before the action ("Improve with AI — Uses 1 AI Credit") and remaining after | ☐ |
| E.4 | Q-2 answer → label reset cadence per plan ("10 CVs/month" vs "10 CVs"). **Done 2026-08-19.** `PLAN_CONFIGS` Pro/Career features; billing comparison appends `/month` for paid CVs/letters only; `faq.a1` × 6. Free stays lifetime-shaped (`5 CVs`, `1 Cover Letter`). | ☑ |
| E.5 | Yearly toggle on web already live. **Batch E:** mobile reads shared-types annual prices; dead `pricing.save` deleted. **Q-4 remains a launch blocker** — `interval=year` UNVERIFIED; client must run `verify-yearly-prices.mjs`. | ◐ |
| E.6 | Plan comparison: header/body already shared `plans`. **Batch E:** numeric cells from `PLAN_CONFIGS.limits`. Extra rows (PDF Export, ATS, …) **not** added this batch. | ◐ |
| E.7 | Enterprise CTA “Choose Enterprise”; Pro keeps “Most Popular” + trial CTA. Server: no Enterprise trial. | ☑ |
| E.8 | Primary free CTA → "Start Building for Free" | ☐ |
| E.9 | §33 — any publicly advertised feature that isn't built must read "Coming soon". A prior sweep already removed several false claims; re-verify against the current feature set. | ☐ |
| E.10 | **Remove the false "Watermark on PDF" claim** from the FREE plan's advertised features (`apps/mobile/src/types/subscription.types.ts:37-39`). **Found 2026-08-18 while scoping D.6** — no watermark exists anywhere in the export path, so this advertises a restriction the product does not apply. **The fix is deleting the claim, not building to match it:** building a watermark would invent a free-vs-paid differentiator nobody agreed and change what a Free user receives. Belongs with the rest of the mobile duplicate-config work in E.1. **Done 2026-08-18** — claim deleted; the rest of the mobile duplicate-config divergence still stands with E.1. | ☑ |

---

## BATCH F — Free Plan one-time 🔒 (client Priority 1)
**Depends on:** E, **B-1 resolved**. See **R-4**.

**Decision 2026-08-18 — option (b), not a `free_grants` build.** No parallel ledger. No
`device_hash` / `first_ip_hash` until Batch G's risk engine consumes them. Reasoning: a uid-keyed
grant cannot survive a new email (new Firebase uid = fresh `users/{uid}` zeros); monthly resets of
`aiCreditsUsed` / `exportsThisMonth` destroyed the consumption history a migration onto a grant
table would need; identity is Batch G. Same-uid already survives cookie/logout/incognito because
usage lives on the user document. **F.3 done 2026-08-18** — Free excluded from the cron; existing
counters left as they stood.

**Client answers recorded 2026-08-18:**
- Career Accelerator: keep the code, hide it everywhere public. **Batch E built this.** Filling `stripePriceIdMonthly` auto-launches it — do not fill by accident.
- Annual: Pro $299.99/year, Enterprise $999.99/year; yearly toggle updates displayed price and Stripe checkout price; savings computed. **Batch E:** mobile wrap + dead `pricing.save` deleted. **Q-4 launch blocker:** client must verify `interval=year`.
- Trial: card required. 7-day **Pro only**. Enterprise no trial — CTA "Choose Enterprise". **Batch E built this server-side.**
- Enterprise stays an individual high-usage plan. No seats, no team workspace, no org admin.
- Stripe stays in test mode. Keys from environment variables; clean test-to-live switch; no hard-coded values.
- **Currency (do not act):** advertised USD vs Stripe-presented EUR is a client decision. Checkout does not pin currency or country.
- Legal pages: English only, with "The English version of these legal terms is the official and controlling version. Any translation is provided for convenience only." Product UI stays multilingual.
- Cookie categories: three, as built. Marketing only if advertising tech is added later.
- Header and footer: dark navy (`chrome` `#1e3a5f`) on public Navbar + Footer + shared TopBar in **light mode only**. Dark mode keeps near-black. Done 2026-08-19. Not applied to sidebars, auth panel, or admin/CRM footers. Logo on those bars is `on-dark`. Opaque baked-in logo rectangle is a standing asset request (`PROJECT_PROGRESS.md` §8).
- LinkedIn: replacement URL is still `/admin/page-posts/published/`. Icon stays hidden. No `#`, no admin URL, no private URL.

| ID | Task | Status |
|---|---|---|
| F.1 | **Cancelled (option b).** No `free_grants` collection. Hashes wait for Batch G. | ⛔ |
| F.2 | Same-uid already survives cookie/logout/incognito (`users/{uid}.usage`). New email = new uid = fresh zeros — that is Batch G identity, not a grant table. | ◐ |
| F.3 | **Exclude Free from `UsageResetService`.** **Done 2026-08-18.** Stored `subscription.plan === FREE` (including missing plan) is skipped — no write. **2026-08-19:** paid plans now also reset `cvsCreated` and `coverLettersCreated` on that same cron. Free CVs/letters still never reset. Delete does not restore the allowance on any plan (Q-2 = a′). Bootstrap hook unchanged. | ☑ |
| F.4 | Billing page: Free users see **"Free Plan Usage"**; Pro/Enterprise keep "Usage This Month". Heading is keyed off `isFreePlan`, not cadence, so it stays honest before and after F.3. **Done 2026-08-18.** | ☑ |
| F.5 | Low-allowance warning + exhausted state + upgrade prompt. **Done 2026-08-18** by extending the billing usage card (amber `usage.low` at ≥70% not exhausted; `billing.upgradeTo` when remaining === 0 and Free). Exhausted+upgrade on generate/export already lived in `UpgradeModal` (Epic R) — reused, not duplicated. | ☑ |
| F.6 | Upgrade preserves CVs, cover letters, profile, applications, templates, job tracker, account. Never a new account. | ☐ |
| F.7 | Pricing copy: "5 CVs per eligible user" | ☐ |
| F.8 | ✅ Atomic counters — **already done**, verify only | ☑ |
| F.9 | ✅ Credit reserve/refund — **already done**, verify only | ☑ |
| F.10 | Backend idempotency / request locking on generation endpoints (distinct from the credit reservation) | ☐ |
| F.11 | Double-click guards on Generate. Several were added in Epic R — audit which remain. | ◐ |

---

## BATCH G — Abuse prevention 🔒 (client Priority 1)
**Depends on:** F. Mostly genuinely new — only rate limiting exists.

| ID | Task | Status |
|---|---|---|
| G.1 | Persistent device identifier, hashed server-side | ☑ |
| G.2 | Hashed IP/network storage | ☑ |
| G.3 | Risk engine. Signals per §10. Thresholds <40 allow / 40–69 challenge / 70+ deny, **configurable**. **Part 1 records only — no deny.** | ☑ |
| G.4 | **Never block on IP alone.** Families, dorms, offices, cafés, hotels share IPs — three housemates each get their own grant. Clamp + test shipped; enforcement is part 2. | ☑ |
| G.5 | Bot protection — **Firebase App Check** is the lowest-friction option here (already on Firebase). Server-side validation mandatory. **Recommended in part 1, not installed.** | ☐ |
| G.6 | Extend rate limiting to generation, export, verification endpoints. Global throttler + `@Throttle` pattern already established. | ◐ |
| G.7 | Disposable email detection | ☑ |
| G.8 | Step-up verification, not instant bans | ☐ |
| G.9 | **Trial abuse — see the R-2 correction.** `hasUsedTrial` shipped 2026-08-18 as defence-in-depth; Stripe history check kept. **No backfill.** The earlier “live revenue leak” wording is wrong. | ☑ |
| G.10 | Eligibility flow end-to-end per §6 | ☐ |

---

## BATCH H — Auth & consent 🔒 APPROVAL REQUIRED
**Depends on:** B, G. Highest-risk batch — mistakes lock users out of signup.

| ID | Task | Status |
|---|---|---|
| H.1 | Legal acceptance modal — unchecked box, disabled CTA until ticked, three links, never pre-checked | ☑ |
| H.2 | `legalAcceptances` collection with per-document versions, server-side | ☑ |
| H.3 | Re-consent on material version change. **Mechanism built** (`needsAcceptance`); versions **not** bumped this batch; missing record is grandfathered (`treatMissingAsStale` default off). Do not prompt existing users until a later, explicit version bump. | ◐ |
| H.4 | Signup page legal text with three clickable links | ☑ |
| H.5 | **Server-side `emailVerified` enforcement — see R-5.** Must exempt verify/resend endpoints and handle token-refresh lag. | ☐ |
| H.6 | Account deletion UI exists; **the erasure cascade and purge job do not**. The Privacy Policy was already corrected to describe manual erasure on request. New policy text must not re-promise automated deletion unless it's built. **When H.6 is built it must include both deferred obligations (keep them in one list):** (1) `users/{uid}.abuse`, `abuse_devices/{hash}`, `abuse_networks/{hash}`, `abuse_idempotency/{uid:key}`, `abuse_rate/{uid:kind}`; (2) `legalAcceptances/{uid}`. Until then a manual erasure request has to cover **both** by hand. | ☐ |

---

## BATCH I — Billing & subscription UX
**Depends on:** E, B-4. See **R-6**.

| ID | Task | Status |
|---|---|---|
| I.1 | Trial disclosure pre-authorisation: today $0, first charge date, amount, frequency, cancel path | ☐ |
| I.2 | Trial status display — "Trial Active", end date, next charge + date, cancel control | ☐ |
| I.3 | **In-app plan change for paid users** — currently portal-only, see R-6 | ☐ |
| I.4 | In-app cancellation (currently Stripe portal). No dark patterns; state access-until-period-end, features lost, document retention. | ☐ |
| I.5 | Reactivate a cancelled subscription | ☐ |
| I.6 | ✅ Billing history + invoice download — **already done** (A3), verify only | ☑ |
| I.7 | Checkout legal block — auto-renewal + clickable Terms, Refund Policy, Privacy | ☐ |
| I.8 | Failed payment handling. **A dunning banner already exists** (A7c) for delinquent statuses. | ◐ |

---

## BATCH J — Security review 🔒
**Depends on:** F, G. Largely audited already — this is verification plus the gaps.

| ID | Task | Status |
|---|---|---|
| J.1 | ✅ Document ownership / IDOR — audited clean 2026-07-20. Re-verify only. | ☑ |
| J.2 | ✅ Export entitlement — A8 server-authorised gate. **Residual:** export is client-side, so a tampered browser could render a *stored* premium design. A free user can never store one. True enforcement needs the server Puppeteer path. | ◐ |
| J.3 | API sweep — authz, validation, injection, duplicate handling, error sanitisation. **2026-08-19:** write-body DTOs + AI 503 sanitisation done (Batch J). Injection/CSV/Puppeteer/IDOR already in place. Remaining: CRM interface-DTOs, payment bodies, auth set-claims. | ◐ |
| J.4 | **Backend DTO validation** — CV/cover-letter/user/`/ai/*`/contact/admin-ticket/template write bodies are class DTOs. Global ValidationPipe is no longer a no-op on them. Service allow-lists kept. Directly serves §45. | ☑ |
| J.5 | Minimise sensitive logging — CVs carry names, addresses, phones, employment history. **2026-08-19:** welcome/verification logs no longer print raw email; AI provider errors not echoed. **Still open:** raw IP on REGISTERED/login audit rows (do not silently hash in the same batch). | ◐ |
| J.6 | Uploaded document access control | ☐ |

---

## BATCH K — UX polish
**Depends on:** F, I. **Heavily done already** — Epic R closed 35 findings across loading states,
error states, optimistic updates, responsive layout, and RTL.

| ID | Task | Status |
|---|---|---|
| K.1 | Audit remaining gaps against Epic R rather than starting fresh | ☑ |
| K.2 | ✅ Autosave with Saving/Saved — CV + cover letter (retry with backoff) | ☑ |
| K.3 | Mobile: plan comparison dedicated stacked layout (table from `md` up). Broader breakpoint eyeball → Batch M visual QA in `PROJECT_PROGRESS` §8 | ☑ |
| K.4 | Dark mode — app-wide `dark:` tokens exist; navy chrome stays light-only (client open question in §8). Full contrast eyeball → Batch M | ◐ |
| K.5 | i18n QA — keys × 6 locales, seven CI gates. §38: language persistence is Preferences-consent-gated (honest copy in cookie centre; trade-off in §8) | ☑ |
| K.6 | Error copy per §40 ("…Your AI credit has not been used") on AI failure paths | ☑ |

---

## BATCH L — Analytics
**Depends on:** F, G, I. **Provider layer already built** — GA4 adapter, consent gate; Batch L extends the catalog.

| ID | Task | Status |
|---|---|---|
| L.1 | Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — analytics no-ops safely until then | ☐ |
| L.2 | Extend to the client's full §47 event list. Adding events is `track()` calls; no wiring changes. | ☑ |
| L.3 | Abuse analytics per §48 | ☑ |
| L.4 | AI cost analytics per §49 | ☑ |
| L.5 | Verify consent gating still holds after the Batch C preference-center work | ☑ |

---

## BATCH M — Launch QA
**Depends on:** everything. Client §58 journeys — new free user, returning user, Pro user, abuse tests.

**Manual visual QA (inherited from Batch K — do not skip):** see `PROJECT_PROGRESS.md` §8
“Batch M inherits: manual visual QA” — breakpoints, plan comparison mobile, dark contrast,
RTL, Stripe Checkout mobile, cover-letter autosave retry.

**Abuse tests:** multiple accounts same device · clear cookies · incognito · re-register new email ·
rapid registration · simultaneous generation requests · direct API calls · direct API export ·
repeated free plan requests · **cancel→resubscribe trial farming (R-2)**.

**Test infrastructure that already exists:** `pnpm emulators` + `scripts/seed-emulator.mjs` give
safe local Auth+Firestore with a seeded super-admin. Stripe is already `sk_test_`. `stripe listen`
forwarding is documented in the README for webhook testing.

⚠️ **`FIRESTORE_EMULATOR_HOST` is the single load-bearing guard.** Omit it and firebase-admin falls
back to service-account credentials and connects to **production Firestore**. The tell-tale in the
log is `Firestore connection verified`. This has happened once before.

⚠️ The Firestore emulator needs **JDK 21+** (firebase-tools 15.x refuses lower). Auth-only fallback
is pure Node and needs no Java.

---

## SOURCE MAPPING

| Source | Covered by |
|---|---|
| Review §1–2 | F.2–F.4 (R-4) |
| §3–6 | G.1–G.10, H.5 (R-5) |
| §7–9 | F.8–F.11 (mostly ☑) |
| §10–13 | G.3, G.5–G.8 |
| §14–17 | E.3, F.5, F.6, K.6 |
| §18–21 | E.1–E.4, E.9 (mostly ☑) |
| §22–24 | I.1, I.2, G.9 (R-2) |
| §25 | E.5 (◐ Q-4 launch blocker) |
| §26–28 | I.3–I.8 (R-6) |
| §29–34 | E.7–E.9, B.12 |
| §35–39 | K.3–K.5 |
| §40–42 | K.2, K.6 (mostly ☑) |
| §43–46 | J.1–J.6 (mostly ☑) |
| §47–49 | L.1–L.4 |
| §50–52 | E.6, E.7 |
| §53–57 | D.4–D.7 |
| §58–59 | Batch M |
| Legal §1–6 | B.1–B.8 |
| Legal §7–8, 10 | H.1–H.4 |
| Legal §9 | C.1–C.4 (☑ — three categories, see Q-12) |
| Legal §11–15 | E.8, I.1, I.7 — **§12 → C.5** |
| Legal §16–22 | D.4, B.12, H.6 |
| Legal §23 | J.1–J.6 |
| Legal §24–31 | B.9, B.11, D.6, D.7 |
| Legal §32 | Batch M |