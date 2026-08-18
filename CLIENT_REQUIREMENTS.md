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
the old premise), R-3 (five i18n gates, not four), R-4/F.3/Q-2 (the reset scope is narrower, and a new
HIGH finding sits underneath it). Treat the record as authoritative on application code; infrastructure
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
| §43 Export entitlement | ✅ A8, server-authorised `POST /exports/record` |
| §47 Analytics | ◐ GA4 adapter wired + consent-gated + 7 funnel events — needs only `NEXT_PUBLIC_GA4_MEASUREMENT_ID` |
| Legal pages | ◐ The routes are **`/privacy-policy`, `/terms-of-service`, `/cookie-policy`, `/contact-us`** (corrected 2026-08-18 — not `/privacy` or `/terms`; B.1/B.2 below name them loosely). Content lives in locale namespaces `privacy`, `terms`, `cookies_policy` across 6 locales. No `/disclaimer`, no `/refund-policy` |
| Cookie consent | ◐ banner exists (Accept/Decline) — needs the 3-button + preference-center upgrade |
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
no longer blocked, and the remaining exposure has moved to `apps/mobile`**, which advertises the
pre-correction annual prices ($239.88/yr with a "-33%" badge) while posting `interval: 'year'` to the
same endpoint — the server charges $299.99. Contained only because that app does not currently ship.
Full audit in `ARCHITECTURE_MAP.md` §8. Still unverified: Q-4.

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
trial. There is exactly **one** call site that decides trial eligibility, so a `hasUsedTrial` flag
remains a reasonable defence-in-depth, but it is no longer the fix for a live leak. **Residual gaps it
would close:** a stored customer id that no longer resolves in Stripe (key switched test↔live, account
switched, customer deleted) falls through to a fresh customer with no history (`:186`); and a new email
address is a new Stripe customer by definition — which is the device/identity problem in G.1–G.3, not
this one. A backfill is only needed if you add the flag.

**R-3 — Legal content vs the i18n gates. Decide before touching Batch B.**
Legal text lives in **six locale JSON files** (`privacy.s3_desc`, `terms.*`, …), not static pages.
⚠️ **CORRECTED 2026-08-18 — there are FIVE gates, not four.** The first four are
`locale-parity.test.ts` (identical key sets), `no-hardcoded-english.test.ts`, `keys-resolve.test.ts`,
**and `locale-untranslated.test.ts`** — which rejects a key that exists in all six files but whose
non-English value is still the English sentence. **So "copy the English text into all six locales to
satisfy parity" fails CI in five locales at once.** The fifth, `locale-encoding.test.ts` (added
2026-08-18 after French `footer.about` shipped as "ì propos"), rejects a file that is not strict
UTF-8, HTML entities, `U+FFFD`, C1 controls, known mojibake sequences, and a locale whose values
contain no letter from its own alphabet. **It does not catch missing diacritics** (`cree` vs `crée`).
That leaves option (b) as the only path that needs
neither ~75,000 translated words nor a deliberate allowlist entry per legal key
(`locale-untranslated.test.ts:34`). The legal routes are also `/privacy-policy`, `/terms-of-service`
and `/cookie-policy` — not `/privacy` and `/terms` — and their content is in the locale namespaces
`privacy`, `terms`, `cookies_policy`. The client's package is ~15,000 English words. Options:
- **(a) Translate everything into 5 languages.** Faithful, expensive, and a mistranslated Terms
  is a legal liability.
- **(b) English-only legal pages** with "the English version controls," exempted from the gates
  via the documented allowlist. Standard industry practice. **Recommended.**
- **(c) Update only changed sections**, keeping existing translations.
This is a client decision (Q-10), not an engineering one.

**i18n gate gap — `t.rich` sits outside `keys-resolve`.** That gate's call regex matches
`t('key')` only, not `t.rich('key')`. One key uses it today (`cookie_consent.message`); it was
hand-verified across all six locales in Batch C. The next `t.rich` will not be caught. Flagged
in `keys-resolve.test.ts` so this is visible at the gate, not only here.

**R-4 — §1/§2 Free Plan one-time is not a label change — but the reset scope is narrower than it looks.**
*Rewritten 2026-08-18 after reading the service.* `UsageResetService` resets every user with
`isActive == true`, on two triggers (an `EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` cron and a startup
catch-up against the `system/usage_reset` marker), using an `onApplicationBootstrap` hook — moved
there after a real race bug, **do not move it back**. Making Free one-time means changing **who** that
service resets, not renaming a heading. Paid plans must keep resetting.

**What it actually resets is only four fields** (`apps/api/src/modules/users/usage-reset.service.ts:96-102`):
`usage.aiCreditsUsed`, `usage.exportsThisMonth`, `usage.aiCreditsLimit` (re-synced to the plan) and
`usage.lastExportReset`. **`cvsCreated` and `coverLettersCreated` are NOT reset — by any job, for any
plan.** So the Free/paid split only needs to cover **AI credits and exports**; CVs and cover letters
are already not on a monthly cadence at all. They behave as **concurrent slots** — both counters are
*decremented on delete* (`cv.service.ts:523`, `cover-letter.service.ts:274`), deliberately, because
without it a FREE user who created and deleted their one cover letter could never write another.

⚠️ **This is a new HIGH finding in its own right, blocked on Q-2** — logged in full, with every
affected call site, in the 2026-08-18 entry of `PROJECT_PROGRESS.md` §9. A Pro subscriber paying
monthly gets 10 CV *slots* for the life of the account, not 10 CVs per month, while the billing page
already headlines those counters as "Usage This Month". That under-delivers to paying customers — the
**inverse** of the abuse problem this list is focused on. **Not fixed:** the three possible answers to
Q-2 are three different builds, and two are billing-adjacent.

**One subtlety if you do split Free out:** line 99 is the only place outside the Stripe paths that
repairs `usage.aiCreditsLimit`. Skipping Free users entirely means a user who downgrades keeps a stale
higher limit unless the downgrade path (`payment.service.ts:622`, `:703`) is relied on for it.

A `free_grants` table (old F.1) is **not being built** — option (b), 2026-08-18: a uid-keyed grant
cannot survive a new email, monthly resets destroyed the consumption history a migration would need,
and identity belongs in Batch G. F.3 (exclude Free from the cron) is still pending confirmation; when
it ships it must change `upgrade_modal.reasons.ai_credits` in the **same** change.

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
| Q-2 | **Do Pro's 10 CVs / 20 cover letters reset monthly?** If yes, label "10 CVs/month". ⚠️ **Now blocking a HIGH finding — see R-4.** Today they reset **never**: no job touches `cvsCreated` / `coverLettersCreated`, and both are decremented on delete, so they are **concurrent slots** ("10 stored at once"), not a monthly allowance. The billing page already headlines them as "Usage This Month". Your three possible answers are three different builds: (a) add them to the monthly reset, (b) keep slots and relabel the UI, (c) a true lifetime cap. **(a) and (c) change what a paying customer receives, so they need your explicit sign-off.** | §20 |
| Q-3 | **Career Accelerator ($49.99) — still wanted?** A fourth plan is fully built (enum, config, entitlements, billing UI, CRM grant) and gated "coming soon" pending a Stripe price. Your documents never mention it. Ship it, drop it, or leave it hidden? | Codebase |
| Q-4 | **Annual prices for each plan — confirm, rather than supply.** *Updated 2026-08-18.* Annual prices **are already asserted in config and on sale**: `YEARLY_BILLING_ENABLED = true` with Pro `299.99/yr` and Enterprise `999.99/yr` and year-interval Stripe price ids (`packages/shared-types/src/subscription.types.ts`). `plan-advertising.spec.ts:127` asserts the flag is on **iff** both annual ids are present. ⚠️ **UNVERIFIED that those two Stripe ids really are `interval=year` in the deployed account** — `apps/api/scripts/verify-yearly-prices.mjs` settles it in one run and was not run here (it reaches Stripe). **Run it before marketing annual plans:** a month-interval price sitting in `stripePriceIdYearly` is exactly what caused the ~18× overcharge. Career Accelerator still has no annual price (ties to Q-3). See R-1. | §25 |
| Q-5 | **Card required for the trial?** Currently yes (Stripe default). Determines whether Stripe fraud signals are available for §23. | §22 |
| Q-6 | **Does Enterprise get a trial?** | §22 |
| Q-7 | **Public LinkedIn URL.** The supplied link is an admin dashboard — visitors hit a login wall. | Socials |
| Q-8 | **Stripe live keys — when?** | §7 legal |
| Q-9 | **Enterprise as a team plan?** Already verified as individual-only and the copy corrected accordingly. Confirm that stands — seats/workspace/central billing is a large new build. | §21 |
| Q-10 | **Legal pages: English-only or fully translated?** See R-3. | Legal pkg |
| Q-11 | **`contact@flacroncv.com` — does the mailbox actually route?** Currently configured to `@flacronenterprises.com`. Ties to B-2. | §25 legal |
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
| B.1 | Replace `/privacy` content with the new Privacy Policy (17 sections). Existing content is localised — apply the Q-10 decision. **Keeps the documented GDPR Art.13(1)(a) gap closed:** the new package finally supplies the controller identity (Flacron Enterprises, Brooklyn NY) and governing law (New York). | ☐ |
| B.2 | Replace `/terms` (30 sections) | ☐ |
| B.3 | **New** `/disclaimer` — AI, ATS & Employment Disclaimer | ☐ |
| B.4 | **New** `/refund-policy` | ☐ |
| B.5 | Replace `/cookie-policy` (14 sections) | ☐ |
| B.6 | Update `/contact` — 26-option category dropdown, new copy, success/error states | ☐ |
| B.7 | Contact routing → `contact@flacroncv.com`. **`ContactModule` + `POST /contact` already exist** (throttled 5/min, HTML-escaped, replyTo=visitor). Change `CONTACT_EMAIL`; extend payload with account email, plan, user ID, timestamp. | ☐ |
| B.8 | Shared legal layout: 900–1000px, uncropped logo, light/dark, orange accents, desktop TOC, Last Updated, Back to Top | ☐ |
| B.9 | Legal document versioning (`2026-08-16`) across all five documents | ☐ |
| B.10 | **Subprocessor list must stay accurate** — `subprocessor-disclosure.spec.ts` (9 tests) ties the Privacy Policy to the SDKs in `apps/api/package.json`, both directions. New privacy text must name **AWS SES**, Firebase, Stripe, OpenAI or the test fails. | ☐ |
| B.11 | Sweep for stale contact addresses; standardise on `contact@flacroncv.com` | ☐ |
| B.12 | In-app disclaimers: AI builder, ATS screens, cover letter, export review gate | ☐ |

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
**Depends on:** B. **Already built:** `app/sitemap.ts` (48 URLs with hreflang + x-default),
`app/robots.ts`, `lib/seo.ts` `pageMetadata()`, Organization + WebSite JSON-LD, `site.webmanifest`.

| ID | Task | Status |
|---|---|---|
| D.1 | Extend sitemap to the new legal routes (`/disclaimer`, `/refund-policy`) | ☐ — routes do not exist yet (Batch B). Existing 8 public paths × 6 locales now emit `x-default` and no longer stamp `lastmod` with build time. |
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
| E.1 | Audit every surface for plan data **not** read from `PLAN_CONFIGS`. **⚠️ DONE 2026-08-18 — the audit is complete and lives in `ARCHITECTURE_MAP.md` §8** (four tiers, every `path:line`). `plan-advertising.spec.ts` guards only `PLAN_CONFIGS.features` against `PLAN_CONFIGS.limits` *inside shared-types*; outside it sit (1) a full duplicate `PLAN_CONFIGS` in `apps/mobile` with stale annual prices and dead Stripe ids, (2) `crm-settings.planLimits` — a second limits table, super-admin editable, **enforced nowhere**, and needing a delete-or-wire decision from you (`PROJECT_PROGRESS.md` §8; Batch F left it untouched), (3) FREE-plan literal `5` fallbacks — **one fixed 2026-08-18:** `users.service.ts` now seeds `aiCreditsLimit` from `PLAN_CONFIGS[FREE]`; the rest remain, including `usage-reset.service.ts:94`'s `?? 5` on the F.3 path, (4) the false `pricing.save` copy. Remaining work is the fixing, not the finding. | ◐ |
| E.2 | Resolve Q-3 — ship, hide, or remove Career Accelerator | ☐ |
| E.3 | Q-1 answer → define and document the AI credit unit; surface cost before the action ("Improve with AI — Uses 1 AI Credit") and remaining after | ☐ |
| E.4 | Q-2 answer → label reset cadence per plan ("10 CVs/month" vs "10 CVs") | ☐ |
| E.5 | ⚠️ Yearly toggle — ~~only after Q-4 delivers real Stripe yearly prices~~. **⚠️ Largely DONE 2026-08-18: web yearly billing is already enabled and on sale (see the R-1 correction).** The remaining work is not the toggle: (1) run `verify-yearly-prices.mjs` per Q-4; (2) fix `apps/mobile`, which shows $239.88/yr and "-33%" while the server charges $299.99; (3) the unused `pricing.save` = "Save 33%" key in all six locales is a false claim one `t()` call from going live. Status left as ⛔ pending your read of the correction. | ⛔ |
| E.6 | Plan comparison table: add PDF Export, ATS Optimisation, ATS Score, Multilingual, AI Writing Assistant rows if they differ by plan. **The body must iterate the same array as the header** — a column-misalignment bug once rendered Enterprise's name above another plan's limits. | ☐ |
| E.7 | Enterprise CTA differentiated; Pro keeps "Most Popular"; Enterprise must not look disabled | ☐ |
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
usage lives on the user document. F.3 (who the cron resets) waits on confirmation — it changes what
existing Free users receive.

| ID | Task | Status |
|---|---|---|
| F.1 | **Cancelled (option b).** No `free_grants` collection. Hashes wait for Batch G. | ⛔ |
| F.2 | Same-uid already survives cookie/logout/incognito (`users/{uid}.usage`). New email = new uid = fresh zeros — that is Batch G identity, not a grant table. | ◐ |
| F.3 | **Exclude Free from `UsageResetService`** while paid plans keep resetting. **Narrowed 2026-08-18: this applies to `aiCreditsUsed` and `exportsThisMonth` only** — those are the only counters the service resets. `cvsCreated` / `coverLettersCreated` are never reset for any plan (concurrent slots, refunded on delete), so they are out of scope here and blocked on **Q-2** — see R-4. Do not break the bootstrap-hook ordering fix (`onApplicationBootstrap`, not `onModuleInit`) — that was a real production bug. Note that skipping Free also skips the `aiCreditsLimit` re-sync at `usage-reset.service.ts:99`. **Must ship in the SAME change as the cadence copy that would become a lie:** `upgrade_modal.reasons.ai_credits` (credits return "next billing month"), `upgrade_modal.reasons.exports` ("this month"), and `PLAN_CONFIGS[FREE].features` `'5 AI Credits/month'` / `'2 exports/month'`. Also replace `usage-reset.service.ts:94`'s `?? 5` fallback on that path. **Not this batch — waiting on confirmation.** | ☐ |
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
| G.1 | Persistent device identifier, hashed server-side | ☐ |
| G.2 | Hashed IP/network storage | ☐ |
| G.3 | Risk engine. Signals per §10. Thresholds <40 allow / 40–69 challenge / 70+ deny, **configurable**. | ☐ |
| G.4 | **Never block on IP alone.** Families, dorms, offices, cafés, hotels share IPs — three housemates each get their own grant. | ☐ |
| G.5 | Bot protection — **Firebase App Check** is the lowest-friction option here (already on Firebase). Server-side validation mandatory. | ☐ |
| G.6 | Extend rate limiting to generation, export, verification endpoints. Global throttler + `@Throttle` pattern already established. | ◐ |
| G.7 | Disposable email detection | ☐ |
| G.8 | Step-up verification, not instant bans | ☐ |
| G.9 | **Trial abuse — see the R-2 correction.** ⚠️ **Re-scope 2026-08-18: cancel→resubscribe is already blocked** by a Stripe history check that fails closed. A `hasUsedTrial` flag is now defence-in-depth against two narrow residual cases, not a fix for a live leak — **do not commission a production backfill on the old premise.** | ◐ |
| G.10 | Eligibility flow end-to-end per §6 | ☐ |

---

## BATCH H — Auth & consent 🔒 APPROVAL REQUIRED
**Depends on:** B, G. Highest-risk batch — mistakes lock users out of signup.

| ID | Task | Status |
|---|---|---|
| H.1 | Legal acceptance modal — unchecked box, disabled CTA until ticked, three links, never pre-checked | ☐ |
| H.2 | `legalAcceptances` collection with per-document versions, server-side | ☐ |
| H.3 | Re-consent on material version change | ☐ |
| H.4 | Signup page legal text with three clickable links | ☐ |
| H.5 | **Server-side `emailVerified` enforcement — see R-5.** Must exempt verify/resend endpoints and handle token-refresh lag. | ☐ |
| H.6 | Account deletion UI exists; **the erasure cascade and purge job do not**. The Privacy Policy was already corrected to describe manual erasure on request. New policy text must not re-promise automated deletion unless it's built. | ☐ |

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
| J.3 | API sweep — authz, validation, injection, duplicate handling, error sanitisation | ☐ |
| J.4 | **Backend DTO validation** — §8 of the record notes CV/cover-letter/user write bodies are untyped interfaces, so the global ValidationPipe is a no-op on them. Directly serves §45. | ☐ |
| J.5 | Minimise sensitive logging — CVs carry names, addresses, phones, employment history | ◐ |
| J.6 | Uploaded document access control | ☐ |

---

## BATCH K — UX polish
**Depends on:** F, I. **Heavily done already** — Epic R closed 35 findings across loading states,
error states, optimistic updates, responsive layout, and RTL.

| ID | Task | Status |
|---|---|---|
| K.1 | Audit remaining gaps against Epic R rather than starting fresh | ☐ |
| K.2 | ✅ Autosave with Saving/Saved — **built**, including retry with backoff | ☑ |
| K.3 | Mobile sweep across all breakpoints; plan comparison table needs a dedicated mobile layout | ◐ |
| K.4 | Dark mode across the entire app | ◐ |
| K.5 | i18n QA — 1,814 keys × 6 locales, three CI gates. Any new string must go through `t()`. | ◐ |
| K.6 | Error copy per §40 ("...Your AI credit has not been used") — `ApiError` classification exists to build on | ◐ |

---

## BATCH L — Analytics
**Depends on:** F, G, I. **Provider layer already built** — GA4 adapter, consent gate, 7 events.

| ID | Task | Status |
|---|---|---|
| L.1 | Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` — analytics no-ops safely until then | ☐ |
| L.2 | Extend to the client's full §47 event list. Adding events is `track()` calls; no wiring changes. | ☐ |
| L.3 | Abuse analytics per §48 | ☐ |
| L.4 | AI cost analytics per §49 | ☐ |
| L.5 | Verify consent gating still holds after the Batch C preference-center work | ☐ |

---

## BATCH M — Launch QA
**Depends on:** everything. Client §58 journeys — new free user, returning user, Pro user, abuse tests.

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
| §25 | E.5 (⛔ R-1) |
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