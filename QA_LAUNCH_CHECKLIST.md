# FlacronCV — Launch QA checklist

Operator-facing. English copy below is what you should see in **`/en/…`**. Other locales must show the translated equivalent of the same meaning, not a missing key or raw English key.

**Do not switch Stripe to live until Phase 1 is all Pass or an explicit waiver.** Phases 2 and 3 can follow.

How to mark a line:

```
- [ ] … Result: ________
```

Write **Pass**, **Fail**, **Blocked-setup**, or **N/A** in the blank. Fail needs a one-line note (what you saw instead).

**`{LISTEN}`** on a line means it cannot be judged if `stripe listen` is not forwarding. If that line fails, check Setup first — a dropped webhook looks like a product bug (billing still says Renews / still says Pro).

---

## Setup — do this before Phase 1

### What must be running

1. **API** on `http://localhost:4000` (`cd apps/api && pnpm dev`).
2. **Web** on `http://localhost:3000` (`cd apps/web && pnpm dev` or `npm run dev`). Open **`http://localhost:3000/en`**.
3. **Stripe CLI listen**, exactly this path (the old `/api/v1/payments/webhook` is not mounted):

   ```bash
   stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe
   ```

   Wait until the CLI says it is ready. Leave it running for the whole of Phase 1.

4. The signing secret `stripe listen` prints must be the same value as **`STRIPE_WEBHOOK_SECRET`** in `apps/api/.env` (name only — never paste the value into this file or a chat). Restart the API after changing it.

5. Stripe Dashboard for this run is **test mode**. Card: `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.

6. **Webhook health check (30 seconds, do this every session):** with listen running, log into a throwaway test account, open Billing, start a checkout and abandon it — or toggle something in the Stripe test Dashboard. The listen terminal must show `checkout.session.completed` or `customer.subscription.updated` with **200**. If you see 404, you are on the wrong path.

**Discriminator already used on this project:** after you cancel at period end in the Stripe portal, Billing must read **Cancels on {date}**, not **Renews on {date}**. Renews = webhook never landed.

### Do not

- Do not use a live card or a live Stripe key.
- Do not point a new local API at production Firestore without `FIRESTORE_EMULATOR_HOST`. This repo’s local setup may already use the production Firebase project — if so, you are writing **real user docs**. Use only the test emails below. Never echo env values.
- Email verification (`POST /auth/send-verification`) may **500** because of SES. That is a known open ops issue, not a Phase 1 product fail. Record it and continue.

### Accounts to create (Stripe **test** mode)

Create these in order. Use distinct emails (plus-addressing is fine). Passwords ≥ 8 characters.

| ID | What it is | How to get there |
|---|---|---|
| **A** | Brand-new Free, trial-eligible | Register in Phase 1. Do not check out until the trial-eligible billing checks are done. |
| **B** | Free, trial-**ineligible** | After a Pro trial or paid sub has existed on the Stripe customer. Fastest: take **C** or **D**, cancel the subscription **immediately** in the Stripe Dashboard (not “at period end”) **with `{LISTEN}` running**, until Billing shows **Free**. Reload Billing: Pro CTA must be **Upgrade to Pro**, not Start trial. |
| **C** | Pro **trial** (`Trialing`) | From **A**, Start 7-day free trial, complete Checkout with 4242. |
| **D** | Pro **active** paid (not trial) | New email. On Billing, wait until CTA is Upgrade (or use **B**), click **Upgrade to Pro** (no trial), complete Checkout. Heading **Pro Plan**, badge **Active**, subtitle **Renews on {date}**. |
| **E** | Pro cancel-at-period-end | From **D** (or a second paid Pro): **Manage Subscription** → Stripe portal → cancel at period end → return. Badge still **Active**. Subtitle **Cancels on {date}**. |
| **F** | Free, every limit used, never subscribed | New email. Create 5 CVs, 1 cover letter, use 5 AI credits, 2 PDF exports. Do not check out. |
| **Admin** | `admin` claim | Existing seeded admin, or set the claim in Firebase. |
| **Owner** | `super_admin` claim | Needed for `/crm/settings`. |

You will burn **A** into **C**. Keep **B**, **D**, **E**, **F** for later rows.

---

# PHASE 1 — Must pass before live Stripe

Target **5–6 hours**. Expand fully. No grouping.

---

## P1.A — Signup, login, legal, verification

Do these in `/en` unless noted.

- [ ] **P1-A01** `/en/register` · Account: signed-out (will become **A**)
  - Click: fill name, email, password of **7** characters, Create Account
  - See: toast **Your password needs at least 8 characters.** No modal. Still on register.
  - Edge: submit stays possible; the toast is the block
  - Result: ________

- [ ] **P1-A02** `/en/register` · Account: **A**
  - Click: name, unique email, password ≥ 8, Create Account
  - See: modal title **Legal agreement**. Checkbox **off**. **Accept & Continue** disabled. **Cancel** enabled. Checkbox text includes links: Terms of Service, Privacy Policy, AI, ATS & Employment Disclaimer.
  - Edge: Accept disabled until tick
  - Result: ________

- [ ] **P1-A03** same modal · **A**
  - Click: Terms of Service link
  - See: new tab `/en/terms-of-service`. Register page and modal still there when you go back.
  - Result: ________

- [ ] **P1-A04** same modal · **A**
  - Click: Privacy Policy link
  - See: new tab `/en/privacy-policy`. Form not lost.
  - Result: ________

- [ ] **P1-A05** same modal · **A**
  - Click: Disclaimer link
  - See: new tab `/en/disclaimer`.
  - Result: ________

- [ ] **P1-A06** same modal · **A**
  - Click: Cancel (checkbox still off or on — either)
  - See: modal closes. No account in Firebase for this attempt if you had not accepted. You are still on register. (If a previous Accept already created the user, stop and use a fresh email.)
  - Edge: Cancel must not create the account
  - Result: ________

- [ ] **P1-A07** `/en/register` · **A** (fresh submit)
  - Click: Create Account → tick checkbox → Accept & Continue
  - See: Accept shows a loading state. Then you leave register. You are signed in (dashboard or verify-email).
  - Edge: Accept disabled + loading while in flight
  - Result: ________

- [ ] **P1-A08** `/en/register` · signed-out, **Google**
  - Click: Google → do **not** tick Accept; click Cancel on the legal modal
  - See: modal closes. **No** Firebase signed-in user. No dashboard. (Option B failure mode: Google user left signed in.)
  - Edge: Cancel on Google path
  - Result: ________

- [ ] **P1-A09** `/en/register` · Google, new email
  - Click: Google → tick → Accept & Continue
  - See: signed in. Not an extra password account for the same email.
  - Result: ________

- [ ] **P1-A10** `/en/login` · **A**
  - Click: wrong password, Sign In
  - See: toast **That email and password combination is incorrect.** Still on login.
  - Edge: error
  - Result: ________

- [ ] **P1-A11** `/en/login` · **A**
  - Click: correct email/password, Sign In
  - See: dashboard (or verify-email if that gate is on). Button shows loading then navigates.
  - Edge: loading
  - Result: ________

- [ ] **P1-A12** `/en/login` · **A**, already signed in
  - Click: open `/en/login` again
  - See: redirected away from login (dashboard or role home). No second sign-in form sitting there.
  - Result: ________

- [ ] **P1-A13** `/en/forgot-password` · signed-out
  - Click: **A**’s email, Send Reset Link
  - See: **Check your email** / copy that an account for that address gets a link (does not reveal whether the email exists beyond that sentence).
  - Result: ________

- [ ] **P1-A14** `/en/verify-email` · **A** if you land there
  - Click: Resend verification email
  - See: toast **Verification email sent. Check your inbox.** **OR** toast **We could not send the email…** / API 500.
  - Edge: **Known SES 500** — if 500, mark **N/A (SES)** not Fail
  - Result: ________

- [ ] **P1-A15** `/en/verify-email` · **A**
  - Click: I've verified my email (without actually verifying)
  - See: still on verify-email. No silent skip into paid features.
  - Result: ________

---

## P1.B — Billing page, every plan state

All at `/en/settings/billing`. Usage heading for Free is **Free Plan Usage**; for paid it is **Usage This Month**.

### Free, trial-eligible (**A**, before any checkout)

- [ ] **P1-B01** Billing · **A**
  - Click: open the page (do nothing else for 2 seconds)
  - See: heading **Free Plan**. Pro button **Checking…** and disabled until the GET returns. Enterprise is **Choose Enterprise** and is **not** waiting. Career Accelerator card **absent**.
  - Edge: loading / disabled
  - Result: ________

- [ ] **P1-B02** Billing · **A** after Checking… ends
  - Click: none
  - See: Pro button **Start 7-day free trial**. Price **$29.99** and **/month**. Disclosure: **7 days free. We save your card now and charge $29.99/month when the trial ends, unless you cancel first. Today: $0.**
  - Result: ________

- [ ] **P1-B03** Billing · **A**
  - Click: none (read under the upgrade cards)
  - See: **Paid plans renew automatically at the price shown, until you cancel.**
  - See: **By continuing you agree to the Terms of Service, Refund Policy, and Privacy Policy.** Three links.
  - Result: ________

- [ ] **P1-B04** Billing · **A**
  - Click: Terms of Service in that block
  - See: `/en/terms-of-service` (same tab or as the link behaves). Page is the English terms body.
  - Result: ________

- [ ] **P1-B05** Billing · **A**
  - Click: Refund Policy
  - See: `/en/refund-policy`.
  - Result: ________

- [ ] **P1-B06** Billing · **A**
  - Click: Privacy Policy
  - See: `/en/privacy-policy`.
  - Result: ________

- [ ] **P1-B07** Billing · **A**
  - Click: **Yearly**
  - See: Yearly is **enabled** (not Coming soon). Pro price **$299.99** and **/year**. Trial disclosure now **… charge $299.99/year …**. CTA still **Start 7-day free trial**.
  - Result: ________

- [ ] **P1-B08** Billing · **A**
  - Click: **Monthly** again
  - See: back to **$29.99** **/month** and monthly disclosure.
  - Result: ________

- [ ] **P1-B09** Billing · **A**
  - Click: none (usage cards)
  - See: **CVs Created** `0` / `5`, **5 remaining**. **Cover Letters Created** `0` / `1`. **AI Credits Used** `0` / `5`. **Exports** `0` / `2`.
  - Result: ________

- [ ] **P1-B10** Billing · **A**
  - Click: none (Billing History)
  - See: **No billing history yet**. Not an error.
  - Edge: empty
  - Result: ________

- [ ] **P1-B11** Billing · **A**
  - Click: none
  - See: **Manage Subscription** is **absent** on Free.
  - Result: ________

### Free, trial-ineligible (**B**)

- [ ] **P1-B12** Billing · **B**
  - Click: open page, wait for Checking… to finish
  - See: Pro button **Upgrade to Pro** (not Start trial). **No** trial disclosure paragraph under Pro.
  - Result: ________

- [ ] **P1-B13** `{LISTEN}` Billing · **B**
  - Click: **Start 7-day free trial** must not be present. Click **Upgrade to Pro**
  - See: Stripe Checkout **without** a trial line (charge **$29.99** now, not $0 today). Completing it is optional here; the CTA label is the check.
  - Result: ________

### Pro trial (**C**)

- [ ] **P1-B14** `{LISTEN}` Billing · **C** (after successful trial checkout)
  - Click: land on `/en/settings/billing?success=true&session_id=…` or refresh Billing
  - See: first **Confirming your payment…** then **Pro Plan**, badge **Trialing**, **Your free trial ends on {date}**. Upgrade cards **gone**. **Manage Subscription** visible.
  - Edge: loading then success
  - Result: ________

- [ ] **P1-B15** Billing · **C**
  - Click: none (usage heading)
  - See: **Usage This Month** (not Free Plan Usage). Export limit shows **∞**.
  - Result: ________

### Pro active (**D**)

- [ ] **P1-B16** `{LISTEN}` Billing · **D**
  - Click: none
  - See: **Pro Plan**, badge **Active**, **Renews on {date}**. Not Trialing. Not Cancels on.
  - Result: ________

- [ ] **P1-B17** Billing · **D**
  - Click: none
  - See: no Start trial, no Upgrade to Pro cards.
  - Result: ________

### Cancel-at-period-end (**E**)

- [ ] **P1-B18** `{LISTEN}` Billing · **E**
  - Click: none (after portal cancel-at-period-end and return)
  - See: **Pro Plan**, badge **Active**, **Cancels on {date}**. If you see **Renews on {date}**, listen did not land — **Blocked-setup**.
  - Result: ________

- [ ] **P1-B19** `{LISTEN}` any Pro-gated control (e.g. DOCX export) · **E** while still before `{date}`
  - Click: Export as DOCX
  - See: file downloads (still entitled). Billing still says Pro.
  - Result: ________

---

## P1.C — Stripe Checkout (trial and paid, both intervals)

Use **test** 4242. `{LISTEN}` required so the return to Billing shows the new plan.

- [ ] **P1-C01** `{LISTEN}` Billing · **A**, monthly, trial CTA
  - Click: **Start 7-day free trial**
  - See: Stripe Checkout. Trial: **0 due today** (or equivalent Stripe trial UI). Recurring **$29.99 / month** after 7 days. Not a silent paid-only session.
  - Edge: loading on the app button until redirect
  - Result: ________

- [ ] **P1-C02** `{LISTEN}` Stripe Checkout · abandon
  - Click: back / cancel on Stripe
  - See: `/en/settings/billing?canceled=true`. Still **Free Plan**. No charge. No Pro badge.
  - Result: ________

- [ ] **P1-C03** `{LISTEN}` Billing · **A**, monthly trial, complete
  - Click: 4242, complete Checkout
  - See: return with `success=true`. **Confirming your payment…** then **Pro Plan** / **Trialing**. Listen log: `checkout.session.completed` **200** and `customer.subscription.updated` or `created` **200**.
  - Result: ________
  - This account is now **C**. Use a **new** email for the next Free checkout.

- [ ] **P1-C04** `{LISTEN}` Billing · new Free eligible, **Yearly**, Start trial
  - Click: Yearly → Start 7-day free trial → complete 4242
  - See: Checkout trial, then **$299.99 / year** after trial (not $29.99/month). Billing after return: Pro + Trialing.
  - Result: ________

- [ ] **P1-C05** `{LISTEN}` Billing · **B** (ineligible), monthly **Upgrade to Pro**
  - Click: Upgrade to Pro → complete 4242
  - See: Checkout charges **$29.99 now** (no 7-day $0 trial). After return: **Pro Plan**, **Active**, **Renews on {date}**.
  - Result: ________

- [ ] **P1-C06** `{LISTEN}` Billing · **B** or a new ineligible Free, **Yearly** Upgrade to Pro
  - Click: Yearly → Upgrade to Pro → 4242
  - See: Checkout **$299.99** now, interval year. After return: Pro Active.
  - Result: ________

- [ ] **P1-C07** `{LISTEN}` Billing · **A**-style Free, **Choose Enterprise**, monthly
  - Click: Choose Enterprise (must **not** wait on Checking…). Complete 4242
  - See: Checkout **$99.99 / month**, **no** trial. After return: heading **Enterprise** (or Enterprise Plan), **Active**.
  - Result: ________

- [ ] **P1-C08** `{LISTEN}` Billing · Free, **Choose Enterprise**, yearly
  - Click: Yearly → Choose Enterprise → 4242
  - See: Checkout **$999.99 / year**. After return: Enterprise Active.
  - Result: ________

- [ ] **P1-C09** Billing · **B**
  - Click: if you can force the Pro trial CTA (you should not): only if the button still says Start trial, click it
  - See: **must not** open a trial Checkout. Toast **A free trial isn't available on this account, but you can subscribe to Pro now.** No Stripe session. This is the silent-paid-conversion bug if a trial session opens.
  - Edge: `TRIAL_NOT_ELIGIBLE`
  - Result: ________

---

## P1.D — Portal, cancellation, invoices

- [ ] **P1-D01** `{LISTEN}` Billing · **D**
  - Click: **Manage Subscription**
  - See: button loading, then Stripe Customer Portal. App does not 500. Toast **Failed to open billing portal** only on failure.
  - Edge: loading / error
  - Result: ________

- [ ] **P1-D02** `{LISTEN}` Stripe portal · **D** → will become **E**
  - Click: cancel subscription **at period end** (not immediately, if the portal offers both)
  - See: portal confirms cancel at period end. Return to Billing: **Cancels on {date}**, still **Active**, still **Pro Plan**. Listen: `customer.subscription.updated` **200** with cancel-at-period-end. **Not** `customer.subscription.deleted` yet.
  - Result: ________

- [ ] **P1-D03** `{LISTEN}` Billing · **C** or **D**
  - Click: Billing History — open **View invoice** / **Download PDF** if a row exists
  - See: at least one invoice after a paid checkout. Status **Paid**. Amount matches what Checkout charged (trial may be **$0.00**).
  - Edge: empty on a never-charged trial is OK; after paid **D** a row must exist
  - Result: ________

- [ ] **P1-D04** Billing · **A** (never subscribed)
  - Click: if history errors, **Try again**
  - See: empty state **No billing history yet**, or rows. Not a stuck **Couldn't load your billing history.**
  - Edge: error + retry
  - Result: ________

- [ ] **P1-D05** `{LISTEN}` Stripe Dashboard · optional immediate cancel of a test sub (to create **B**)
  - Click: cancel immediately / delete subscription
  - See: listen **`customer.subscription.deleted` 200**. Billing becomes **Free Plan**. Not stuck on Pro.
  - Result: ________

---

## P1.E — Free limit walls and upgrade path

Use **F** (or **A** if you have not checked out). Dashboard `/en/dashboard` and lists. Free: **5 CVs**, **1 cover letter**, **5 AI credits**, **2 exports**. Deleting does **not** restore a creation.

- [ ] **P1-E01** `/en/dashboard` · **F** at 0 usage
  - Click: none
  - See: CV usage **0/5**, letters **0/1**, AI **0/5**, exports **0/2**.
  - Result: ________

- [ ] **P1-E02** `/en/cv` · **F**
  - Click: create CVs until the 5th succeeds
  - See: after 5, **New** / create is blocked. Modal **CV limit reached** / **You've used every CV creation included in your plan. Upgrade to create more. Deleting a CV does not restore a creation.**
  - Edge: at-limit
  - Result: ________

- [ ] **P1-E03** `/en/cv` · **F** at 5/5
  - Click: Delete one CV, confirm, then New
  - See: toast/copy that deleting does **not** restore allowance if shown; **New** still blocked. Count stays **5/5** creations (list may show 4 docs).
  - Edge: delete does not refill
  - Result: ________

- [ ] **P1-E04** `/en/cv` · **F** at limit, upgrade modal
  - Click: **Upgrade now**
  - See: `/en/settings/billing`. Not a dead end.
  - Result: ________

- [ ] **P1-E05** `/en/cv` · **F** at limit
  - Click: **Maybe later**
  - See: modal closes. Still on CV list. Still at limit.
  - Result: ________

- [ ] **P1-E06** `/en/cover-letters` · **F**
  - Click: create the 1st letter (save a draft)
  - See: **1/1**. Second create → modal **Cover letter limit reached** / upgrade copy including that delete does not restore.
  - Edge: at-limit
  - Result: ________

- [ ] **P1-E07** `/en/cv/[id]` template panel · **F**
  - Click: a Pro-locked layout (not classic)
  - See: lock, not applied. Upgrade modal **This template needs a paid plan**.
  - Edge: at-limit / paywall
  - Result: ________

- [ ] **P1-E08** `/en/cv/[id]` Export · **F** with 0 exports
  - Click: Export → **Export as DOCX**
  - See: **no file**. Upgrade modal. Billing Exports still **0/2**. DOCX is paid, not a Free format.
  - Edge: paywall
  - Result: ________

- [ ] **P1-E09** `/en/cv/[id]` · **F**
  - Click: Export as PDF twice (success both times)
  - See: toast **CV exported as PDF** each time. Billing **Exports** **1/2** then **2/2**.
  - Result: ________

- [ ] **P1-E10** `/en/cv/[id]` · **F** at 2/2 exports
  - Click: Export as PDF again
  - See: no third file. Modal **Export limit reached** / **You've used all the exports included in your Free plan. Upgrade to Pro for unlimited exports in PDF and DOCX — Free exports do not reset.**
  - Edge: at-limit
  - Result: ________

- [ ] **P1-E11** `/en/settings/billing` · **F** with a remaining of **0** on a usage card
  - Click: the **Start 7-day free trial** / **Upgrade to Pro** on that card if shown
  - See: same Checkout path as the Pro card (trial only if eligible).
  - Result: ________

- [ ] **P1-E12** `/en/dashboard` · **F** at limits
  - Click: New CV / New cover letter from dashboard if those CTAs still show
  - See: same walls as the lists (modal or disabled). Not a bypass.
  - Result: ________

---

## P1.F — Export both formats and failure refund

- [ ] **P1-F01** `/en/cv/[id]` · **D** or **C** (Pro)
  - Click: Export
  - See: warning **Review Before Downloading** plus the review-before-sending body. Two choices: **Export as PDF** and **Export as DOCX**.
  - Result: ________

- [ ] **P1-F02** `{LISTEN}` not required · same · **D**
  - Click: Export as PDF
  - See: toast **CV exported as PDF**. File downloads. Button shows loading then restores. Billing Exports **∞** (no increment wall).
  - Edge: loading
  - Result: ________

- [ ] **P1-F03** same · **D**
  - Click: Export as DOCX
  - See: toast **CV exported as DOCX**. `.docx` downloads. Open it: real selectable text (not a single image).
  - Result: ________

- [ ] **P1-F04** `/en/cover-letters/[id]` · **D**
  - Click: export PDF then DOCX
  - See: both download. Failures toast **Export failed** (letter copy) and must **not** still increment a Free counter (Pro is unlimited).
  - Edge: error
  - Result: ________

- [ ] **P1-F05** `/en/cv/[id]` · **F** or **D** — **failure refund**
  - Click: start **Export as PDF**, then fail the render (DevTools → Offline after `/exports/record` returns 200, or kill the tab mid-canvas). If you cannot force it, throttle to Offline before click and record whether reserve happened.
  - See: toast **Export failed. Please try again.** Billing **Exports** count **unchanged** from before the click (refund path). A successful retry later may increment once.
  - Edge: error + refund
  - Result: ________

---

## P1.G — AI credits: charge, no-charge, unconfirmed

Free **5** credits; Pro **100**. Counter is **AI Credits Used** `used / limit`. Dashboard should match after each success.

On failure, toast description must be one of:

- **No AI credit was used — you can safely try again.** (or cover-letter variant: **No AI credit was used and no draft was saved — you can safely try again.**)
- **An AI credit may have been used for this failed attempt. Contact support if your balance looks wrong.** (unconfirmed refund — rare)

Never a silent increment on a failed generate.

- [ ] **P1-G01** `/en/cv/[id]` AI Summary · **F** at 0/5
  - Click: generate a summary (fill required fields)
  - See: credit **1/5**. Summary appears. Warning about AI errors visible on the modal.
  - Result: ________

- [ ] **P1-G02** same modal · **F**
  - Click: generate again with network **Offline** (or invalid to force provider fail)
  - See: no-charge toast **No AI credit was used — you can safely try again.** (or local-fallback info with that description). Counter **stays 1/5**.
  - Edge: error, not charged
  - Result: ________

- [ ] **P1-G03** `/en/cv/[id]` ATS Check · **F**
  - Click: run ATS (paste a short job description)
  - See: used **2/5**. Score UI. ATS warning visible.
  - Result: ________

- [ ] **P1-G04** ATS · **F**, Offline on submit
  - Click: run ATS
  - See: no-charge copy. Counter unchanged.
  - Edge: error, not charged
  - Result: ________

- [ ] **P1-G05** Interview Prep · **F**
  - Click: generate
  - See: used **3/5**.
  - Result: ________

- [ ] **P1-G06** LinkedIn · **F**
  - Click: generate
  - See: used **4/5**.
  - Result: ________

- [ ] **P1-G07** Import resume · **F**
  - Click: import a small file / paste
  - See: used **5/5** if this path charges; if it fails, no-charge toast and **4/5**.
  - Result: ________

- [ ] **P1-G08** any AI modal · **F** at **5/5**
  - Click: Generate
  - See: **No AI credits remaining**. Button **Upgrade to Generate** / upgrade modal **You're out of AI credits** / Free copy **Free credits do not reset.** Counter stays **5/5**.
  - Edge: at-limit
  - Result: ________

- [ ] **P1-G09** `/en/cover-letters/new` · **F** if a credit remains; else **D**
  - Click: Generate with company + job filled
  - See: generating copy **This usually takes 10–30 seconds…**. On success, review UI (**Nothing has been saved yet**). Counter +1. Cover-letter warning visible.
  - Edge: loading
  - Result: ________

- [ ] **P1-G10** `/en/cover-letters/new` · Offline during generate
  - Click: Generate
  - See: **We couldn't generate your cover letter** plus **No AI credit was used and no draft was saved — you can safely try again.** No new letter in the list. Counter unchanged.
  - Edge: error, not charged
  - Result: ________

- [ ] **P1-G11** `/en/cover-letters/[id]` · **D**
  - Click: AI improve → confirm
  - See: credit increments. Cancel on the confirm modal charges **0**.
  - Edge: confirm / cancel
  - Result: ________

- [ ] **P1-G12** `/en/dashboard` · after the above
  - Click: refresh
  - See: AI used matches Billing **AI Credits Used**. No drift.
  - Result: ________

---

# PHASE 2 — Core product

Target **6–8 hours**. Palettes and legal TOCs grouped. Includes the failure/edge next to the control.

Account: **D** (Pro) unless a row says Free/**F**.

---

## P2.A — Public chrome and marketing

- [ ] **P2-A01** any public page
  - Click: skip to content
  - See: focus/jump to `#main-content`, not the nav.
  - Result: ________

- [ ] **P2-A02** first visit (clear site data or a private window)
  - Click: none
  - See: cookie banner with **Accept All**, **Reject Non-Essential** (same visual weight), **Manage**.
  - Edge: first-visit only
  - Result: ________

- [ ] **P2-A03** banner
  - Click: Reject Non-Essential
  - See: banner gone. Analytics must not fire (no gtag if you have a network filter). Language may not persist across refresh (Preferences rejected — expected).
  - Result: ________

- [ ] **P2-A04** banner (reset consent / new window)
  - Click: Manage
  - See: panel. Necessary **Always active** (not a switch). Preferences and Analytics switches **off**. Save / Accept All / Reject.
  - Edge: nothing pre-ticked
  - Result: ________

- [ ] **P2-A05** panel
  - Click: turn Analytics on, Save
  - See: panel closes. Later footer **Cookie Preferences** reopens with Analytics on.
  - Result: ________

- [ ] **P2-A06** Navbar
  - Click: Features, Pricing (on `/`), Templates, About, Contact, logo
  - See: each destination. Pricing/Features on home **smooth-scroll** (or instant if reduced-motion).
  - Result: ________ (grouped nav)

- [ ] **P2-A07** Navbar
  - Click: theme toggle
  - See: `dark` class on `<html>`. Toggle again restores light.
  - Result: ________

- [ ] **P2-A08** Language switcher
  - Click: open, pick **Deutsch**, then back to **English**
  - See: URL prefix `/de/…` then `/en/…`. Six locales exist in the menu: en es fr de ar ur.
  - Edge: grouped 6 locales — spot-check ar/ur in Phase 3
  - Result: ________

- [ ] **P2-A09** mobile width below `lg`
  - Click: hamburger, a link, theme, language, overlay
  - See: drawer opens/closes. Same destinations as desktop.
  - Result: ________

- [ ] **P2-A10** Footer newsletter
  - Click: Subscribe with consent **unticked**
  - See: button **disabled**. If you force submit, toast that consent is required.
  - Edge: disabled
  - Result: ________

- [ ] **P2-A11** Footer newsletter
  - Click: tick consent, valid email, Subscribe
  - See: loading then success (check-email / confirmed-pending copy). Not instant list-subscribe without confirm.
  - Edge: loading / success
  - Result: ________

- [ ] **P2-A12** Footer
  - Click: Cookie Preferences
  - See: same panel as Manage. Works after the banner is gone.
  - Result: ________

- [ ] **P2-A13** `/en` Hero
  - Click: **Start Building for Free** (signed-out)
  - See: `/en/register`. Signed-in: `/en/dashboard`.
  - Result: ________

- [ ] **P2-A14** `/en` Hero
  - Click: **See How It Works**
  - See: scroll to how-it-works. Mockup toolbar is **not** clickable (decorative).
  - Result: ________

- [ ] **P2-A15** `/en` How it works
  - Click: **Start Building Free**
  - See: register or dashboard as above.
  - Result: ________

- [ ] **P2-A16** `/en` Pricing
  - Click: Monthly / Yearly
  - See: Yearly **enabled**. Three plans (Free / Pro / Enterprise). Career Accelerator **absent**. Free CTA Get Started → register or dashboard. Pro **Start 7-day free trial**. Enterprise **Choose Enterprise**. Signed-in **paid** Pro: paid CTAs go to **contact-us**, not a dead billing page.
  - Result: ________

- [ ] **P2-A17** `/en` FAQ
  - Click: each of 6 questions
  - See: one open at a time; answer text visible; chevron rotates.
  - Result: ________

- [ ] **P2-A18** `/en/about-us`
  - Click: bottom CTA(s)
  - See: register or dashboard.
  - Result: ________

- [ ] **P2-A19** `/en/contact-us`
  - Click: submit empty
  - See: native/required block. No 500.
  - Edge: validation
  - Result: ________

- [ ] **P2-A20** `/en/contact-us`
  - Click: fill name, email, category, message, submit
  - See: loading then success. Fail → error + retry, not a silent drop.
  - Edge: loading / error / success
  - Result: ________

- [ ] **P2-A21** `/en/templates`
  - Click: search a string with no hits; Clear; a category tab; Reset
  - See: empty + reset restores the grid.
  - Edge: empty
  - Result: ________

- [ ] **P2-A22** `/en/templates`
  - Click: Preview on a card; close; Use (signed-out → login/register; Free locked → paywall; Pro → editor)
  - See: modal preview; Use matches plan.
  - Result: ________

- [ ] **P2-A23** `/en/testimonials`
  - Click: CTA
  - See: register/dashboard. No fake quote cards.
  - Result: ________

- [ ] **P2-A24** Legal docs `/en/terms-of-service` (cookies, disclaimer, refund same pattern)
  - Click: logo home; **grouped TOC** (spot-check 3 jumps); Back to top
  - See: home; section id in view; scroll to top. Privacy has **no** TOC — body only.
  - Result: ________

- [ ] **P2-A25** `/en/confirm?token=` missing
  - Click: open
  - See: fail state, not an infinite spinner.
  - Edge: error
  - Result: ________

- [ ] **P2-A26** unknown `/en/this-is-not-a-route`
  - Click: 404 CTAs
  - See: localised 404, not a Next dump.
  - Result: ________

---

## P2.B — Dashboard shell

- [ ] **P2-B01** TopBar · **D**
  - Click: logo, language, theme, avatar → Profile, Logout
  - See: `/en/dashboard`; locale/theme; `/en/settings`; then signed out to `/`.
  - Result: ________

- [ ] **P2-B02** Sidebar · **D**
  - Click: each of 8 links; collapse; mobile menu + overlay + close
  - See: dashboard, CVs, letters, jobs, templates, settings, billing, support. Rail hides labels. Overlay closes.
  - Result: ________

- [ ] **P2-B03** Settings subnav · **D**
  - Click: Profile / Billing (mobile tabs if narrow)
  - See: `/en/settings` vs `/en/settings/billing`.
  - Result: ________

- [ ] **P2-B04** Dunning banner · a **past_due** test sub if you can make one in Stripe
  - Click: fix-payment / portal
  - See: portal. Banner absent for healthy **D**.
  - Edge: only delinquent
  - Result: ________

- [ ] **P2-B05** `/en/dashboard` · **D**
  - Click: New CV, New letter, Billing, usage cards that link
  - See: `/en/cv/new`, `/en/cover-letters/new`, billing. Error retry if the usage query fails (disable network, reload).
  - Edge: error / retry
  - Result: ________

---

## P2.C — CV list and create

- [ ] **P2-C01** `/en/cv` · **D**
  - Click: New
  - See: `/en/cv/new`. Empty state CTA if list empty.
  - Edge: empty
  - Result: ________

- [ ] **P2-C02** `/en/cv` · **D**
  - Click: Edit / Duplicate / Delete → confirm / cancel on one card
  - See: editor; a second CV; delete removes the card; cancel keeps it. Error state **Try again** if the list 500s.
  - Edge: confirm / cancel / error
  - Result: ________

- [ ] **P2-C03** `/en/cv/new` · **D**
  - Click: title, each start mode (scratch / import / template), continue
  - See: scratch → editor; template → pick-template; import → import modal.
  - Result: ________

- [ ] **P2-C04** Import modal · **D**
  - Click: close; pick a file; fail with a non-resume; success
  - See: close restores new-CV. Error toast, no crash.
  - Edge: error
  - Result: ________

- [ ] **P2-C05** `/en/cv/new/pick-template` · **D**
  - Click: back; a Free template; a Pro template
  - See: back to new; Pro templates usable on **D**, locked on **F**.
  - Result: ________

---

## P2.D — CV editor (grouped palettes)

- [ ] **P2-D01** `/en/cv/[id]` load
  - Click: none / Retry if error
  - See: **Loading your CV…** then editor. Error title **We couldn’t load this CV** + retry.
  - Edge: loading / error
  - Result: ________

- [ ] **P2-D02** Toolbar undo / redo
  - Click: type in a field, Undo, Redo
  - See: disabled when history empty; enabled after an edit; restores the field.
  - Edge: disabled
  - Result: ________

- [ ] **P2-D03** Font panel (grouped)
  - Click: open; change body font, heading font, size S/M/L; click away
  - See: preview updates. 7 fonts × 2 selects + 3 sizes — spot-check Inter vs Merriweather, not every pair.
  - Result: ________

- [ ] **P2-D04** Template panel (grouped)
  - Click: open; one layout; one colour; one section style; one radius; close
  - See: preview updates. **Do not** click all 12 colours. Free account still locks Pro layouts (Phase 1 already).
  - Result: ________

- [ ] **P2-D05** ATS / Interview / LinkedIn / AI Summary
  - Click: open each, close without running (charges tested in Phase 1)
  - See: modal + warning + close. Generate disabled at 0 credits.
  - Edge: disabled at 0
  - Result: ________

- [ ] **P2-D06** Photo
  - Click: upload a small PNG; remove
  - See: photo in preview; then gone. File input accepts image.
  - Result: ________

- [ ] **P2-D07** Personal fields
  - Click: fill name, title, email, phone, location, links, summary
  - See: preview updates; autosave badge **Saving** then **Saved** (or **Unsaved** if dirty).
  - Edge: saving
  - Result: ________

- [ ] **P2-D08** Sections
  - Click: Add section → each of 8 types once; expand; hide; delete one; drag one
  - See: section appears; hide removes from preview; delete gone; order changes.
  - Result: ________

- [ ] **P2-D09** Section items
  - Click: Add item, fill, remove item
  - See: item in preview then gone.
  - Result: ________

- [ ] **P2-D10** Mobile width below `lg`
  - Click: Edit / Preview toggle
  - See: only one pane; preview not a blank editor.
  - Result: ________

---

## P2.E — Cover letters

- [ ] **P2-E01** `/en/cover-letters` · **D**
  - Click: New; Edit; Duplicate if present; Delete confirm/cancel; retry on error
  - See: same pattern as CV list. Empty CTA if none.
  - Edge: empty / error / confirm
  - Result: ________

- [ ] **P2-E02** `/en/cover-letters/new`
  - Click: title, company, job, CV picker, tone (4), length (3), Discard on review, Save letter
  - See: review **Nothing has been saved yet**; Discard leaves no list item; Save then appears in the list.
  - Result: ________

- [ ] **P2-E03** `/en/cover-letters/[id]` chrome
  - Click: Save (dirty); template menu (grouped: pick 2 of 5 + one colour); Export PDF/DOCX
  - See: **Saving**/**Saved**; preview style changes; files download.
  - Edge: saving
  - Result: ________

- [ ] **P2-E04** TipTap toolbar
  - Click: bold, italic, underline, bullets, numbered, align L/C/R, undo, redo; both selects
  - See: formatting in editor and preview.
  - Result: ________

- [ ] **P2-E05** Rewrite paragraph
  - Click: Rewrite paragraph → Apply / Discard
  - See: apply changes text; discard restores. Credits: Phase 1.
  - Result: ________

- [ ] **P2-E06** Details accordion
  - Click: open/close; edit company/job fields
  - See: fields persist after save.
  - Result: ________

- [ ] **P2-E07** Mobile Edit/Preview
  - Click: both tabs
  - See: editor vs preview.
  - Result: ________

- [ ] **P2-E08** Autosave failure (Batch K)
  - Click: edit a letter, set Offline, wait
  - See: persistent toast and automatic retry when online — **not** silent loss.
  - Edge: error + retry
  - Result: ________

---

## P2.F — Jobs, support, settings

- [ ] **P2-F01** `/en/jobs`
  - Click: Add; fill required; Save; Cancel
  - See: row appears; cancel adds nothing. Loading on save.
  - Edge: loading
  - Result: ________

- [ ] **P2-F02** `/en/jobs` filters
  - Click: status `<select>`; Archived toggle; each status chip
  - See: list filters. Empty: empty CTA.
  - Edge: empty
  - Result: ________

- [ ] **P2-F03** `/en/jobs` row
  - Click: status change; calendar; Edit; Archive; Delete
  - See: status updates immediately (optimistic); calendar file; edit modal; archive hides unless Archived on; delete gone.
  - Edge: optimistic / disabled while saving
  - Result: ________

- [ ] **P2-F04** Job modal fields
  - Click: all fields including CV/letter link + Save
  - See: values persist on reopen.
  - Result: ________

- [ ] **P2-F05** `/en/support`
  - Click: New ticket; open a ticket; Retry if error
  - See: `/en/support/new`; detail page; empty list if none.
  - Edge: empty / error
  - Result: ________

- [ ] **P2-F06** `/en/support/new`
  - Click: subject, category, message, submit
  - See: lands on the ticket. Validation if empty.
  - Edge: validation / loading
  - Result: ________

- [ ] **P2-F07** `/en/support/[id]`
  - Click: reply; back
  - See: message appears; list on back.
  - Result: ________

- [ ] **P2-F08** `/en/settings` profile
  - Click: upload avatar; remove; fill name fields; Save
  - See: photo; then default; toast/saved. Upload disabled while in flight.
  - Edge: loading / disabled
  - Result: ________

- [ ] **P2-F09** `/en/settings` preferences
  - Click: locale select; theme select; both checkboxes; Save
  - See: locale/theme apply; checkboxes persist after reload.
  - Result: ________

- [ ] **P2-F10** `/en/settings` password modal
  - Click: open; Cancel; open; send reset
  - See: cancel closes; send shows loading then a sent toast.
  - Edge: loading / cancel
  - Result: ________

- [ ] **P2-F11** `/en/settings` download data
  - Click: Download
  - See: JSON file. No Stripe ids in the file (product rule).
  - Result: ________

- [ ] **P2-F12** `/en/settings` Sign out all devices
  - Click: open modal; Cancel; then Confirm
  - See: cancel keeps session; confirm signs out this browser.
  - Edge: confirm / cancel
  - Result: ________

- [ ] **P2-F13** `/en/settings` delete account
  - Click: open; Accept disabled until the confirm control is satisfied; Cancel; do **not** confirm-delete a keeper account
  - See: disabled until checked/typed. Cancel closes. (Delete only a throwaway.)
  - Edge: disabled
  - Result: ________

---

# PHASE 3 — Admin, CRM, visual

Target **5–6 hours**. Accounts **Admin** and **Owner**.

---

## P3.A — Admin

- [ ] **P3-A01** `/en/admin` as a Free user
  - Click: open the URL
  - See: refused / redirected. Not the admin UI.
  - Result: ________

- [ ] **P3-A02** Admin chrome · **Admin**
  - Click: logo (admin home), 6 sidebar links, mobile close, back-to-app
  - See: `/en/admin`, users, subscriptions, templates, tickets, audit-logs; dashboard app on back.
  - Result: ________

- [ ] **P3-A03** `/en/admin`
  - Click: jump cards to users / tickets
  - See: those lists.
  - Result: ________

- [ ] **P3-A04** `/en/admin/users`
  - Click: search; open a row; change role `<select>`; pagination
  - See: filtered list; select updates without snap-back; page 1 Prev disabled.
  - Edge: disabled pagination / optimistic select
  - Result: ________

- [ ] **P3-A05** `/en/admin/subscriptions`
  - Click: none (read-only)
  - See: stats + list. Loading spinner then data. Error state if API down.
  - Edge: loading / error
  - Result: ________

- [ ] **P3-A06** `/en/admin/templates`
  - Click: Create; fill; Save; Edit; Delete
  - See: modal fields including tier selects; list updates. Empty CTA if none.
  - Edge: empty
  - Result: ________

- [ ] **P3-A07** `/en/admin/tickets`
  - Click: status chips; a row; pagination
  - See: filter; `/en/admin/tickets/[id]`.
  - Result: ________

- [ ] **P3-A08** `/en/admin/tickets/[id]`
  - Click: back; status select; customer reply; internal note
  - See: status optimistic; reply visible to the flow; internal note labelled not visible to customer.
  - Edge: optimistic
  - Result: ________

- [ ] **P3-A09** `/en/admin/audit-logs`
  - Click: action filter; expand a row; pagination
  - See: filtered rows; details; empty filter → empty + clear.
  - Edge: empty
  - Result: ________

---

## P3.B — CRM

- [ ] **P3-B01** `/en/crm` as Free
  - Click: open URL
  - See: refused / redirect.
  - Result: ________

- [ ] **P3-B02** CRM chrome · **Admin**
  - Click: 8 nav links (no Settings); **Owner** also **Settings**
  - See: Settings **absent** for admin, **present** for super-admin.
  - Result: ________

- [ ] **P3-B03** `/en/crm`
  - Click: export; jump to leads/customers; date range
  - See: file or download; those routes; charts update.
  - Result: ________

- [ ] **P3-B04** `/en/crm/customers`
  - Click: export; Add (save/cancel); two filters; sort headers; row; pagination
  - See: modal fields persist on save; cancel adds none; sort toggles; page 1 Prev disabled.
  - Edge: empty / disabled
  - Result: ________

- [ ] **P3-B05** `/en/crm/customers/[id]`
  - Click: back; status edit save/cancel; Edit save/cancel; tags add/remove; notes add/delete; Delete confirm/cancel
  - See: each write sticks; cancel/delete-abort leaves data.
  - Edge: confirm / cancel
  - Result: ________

- [ ] **P3-B06** `/en/crm/leads`
  - Click: export; stage chips; source filter; inline edit save/cancel; convert; Add modal; pagination
  - See: filters; inline save; convert moves them; empty chips.
  - Result: ________

- [ ] **P3-B07** `/en/crm/revenue`
  - Click: export; Add transaction save/cancel; filters; clear; pagination
  - See: row added; clear resets.
  - Result: ________

- [ ] **P3-B08** `/en/crm/users`
  - Click: export; search; three filters; View; Suspend / Reactivate; plan menu; role menu; pagination
  - See: **do not** demote **Owner** or your own admin by accident. Suspended user cannot use the app.
  - Result: ________

- [ ] **P3-B09** `/en/crm/users/[id]`
  - Click: back; suspend/reactivate; plan chips + cancel; save credits
  - See: plan change is **staff override** (real money/access). Record before/after plan on Billing as that user.
  - Result: ________

- [ ] **P3-B10** `{LISTEN}` `/en/crm/subscriptions`
  - Click: copy id; filters; Cancel confirm/abort; pagination
  - See: copy does **not** show an email in a toast if the product copies an id. Confirm cancel + listen → sub cancelled. Abort leaves it.
  - Edge: confirm / cancel
  - Result: ________

- [ ] **P3-B11** `/en/crm/platform`
  - Click: none
  - See: charts load. No buttons. Loading then data.
  - Edge: loading
  - Result: ________

- [ ] **P3-B12** `/en/crm/audit`
  - Click: two filters; Clear; pagination
  - See: empty + clear control when nothing matches.
  - Edge: empty
  - Result: ________

- [ ] **P3-B13** `/en/crm/settings` · **Owner** only
  - Click: plan-limit Save; feature flags; maintenance; announcement severity + Save
  - See: **Admin** is refused. Saves toast. Maintenance actually gates the app if you turn it on — turn it **off** before leaving.
  - Edge: loading
  - Result: ________

---

## P3.C — Batch K visual, locales, RTL, breakpoints

Do not tick from code review. Real browser. Carry-over from `PROJECT_PROGRESS.md` §8.

- [ ] **P3-C01** Width **320**
  - Click: none — scroll nav, sidebar drawer, pricing cards, hero, forms, buttons, billing usage cards, FAQ, footer, one modal
  - See: no horizontal clip of primary actions; no overlapping controls.
  - Result: ________

- [ ] **P3-C02** Width **375** — same surfaces
  - See: usable.
  - Result: ________

- [ ] **P3-C03** Width **768** — same
  - See: usable.
  - Result: ________

- [ ] **P3-C04** Width **1024** — same
  - See: desktop chrome; sidebar visible.
  - Result: ________

- [ ] **P3-C05** `/en/settings/billing` at 375
  - Click: none — Plan Comparison
  - See: **stacked cards**, not a sideways-scrolling table. Table only from `md` up.
  - Result: ________

- [ ] **P3-C06** Dark mode
  - Click: theme toggle on pricing, CV editor, cover-letter editor, tables, dropdowns, a legal page
  - See: text readable on chrome navy and on stone surfaces (no white-on-white).
  - Result: ________

- [ ] **P3-C07** `/ar/…` (RTL)
  - Click: nav, sidebar, billing toggle, a modal, language switcher
  - See: `dir=rtl`; start/end padding; no overlapping X buttons; drawer from the right.
  - Result: ________

- [ ] **P3-C08** `/ur/…` (RTL)
  - Click: same as P3-C07
  - See: same RTL behaviour; Urdu glyphs not mojibake.
  - Result: ________

- [ ] **P3-C09** Locales es / fr / de (one public page + billing + register)
  - Click: language switcher to each
  - See: no raw key names (`billing.plan`). Chrome translated.
  - Result: ________

- [ ] **P3-C10** Stripe Checkout at ~375 width · `{LISTEN}` not required for layout
  - Click: Start trial from Billing on a phone-sized viewport
  - See: Stripe page usable (fields not clipped). Complete or abandon.
  - Result: ________

- [ ] **P3-C11** Cover-letter autosave retry (if not done in P2-E08)
  - Click: edit, Offline, Online
  - See: persistent toast + retry, not silent loss.
  - Result: ________

---

## Sign-off

| Phase | Target | Done? | Blockers |
|---|---|---|---|
| Setup + listen health | 15 min | | |
| Phase 1 | 5–6 h | | |
| Phase 2 | 6–8 h | | |
| Phase 3 | 5–6 h | | |

Phase 1 all Pass (or waived in writing) is the gate for **live Stripe**.

Copy is `en` as of 2026-08-21. If a string has moved, the **meaning** still has to hold (trial $0 today, cancel vs renew, no-charge on AI fail, limits 5 / 1 / 5 / 2).
