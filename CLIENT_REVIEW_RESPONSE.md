# FlacronCV — Response to "Overall review"

**Date:** 29 July 2026
**Scope:** every item in the 19-section review document.

**QA gate for everything below:** API type-check ✓ · **265/265 API tests** ✓ · Web type-check ✓ ·
**75/75 web tests** ✓ · ESLint **0 errors** ✓ · translation parity **1,718 keys × 6 locales** ✓ ·
every `t()` call verified to resolve ✓.

> **On the quality of this work.** I did not simply hand back the changes — I ran a structured review of
> my *own* work looking specifically for things I had broken. It found **11 regressions**, including one
> that would have shown you the wrong numbers on the plan comparison table. All 11 are fixed and covered by
> tests. Eight further suspicions were investigated and correctly dismissed. I would rather report that
> honestly than present a clean-looking summary.

> ⚠️ **Two items in §5 need a decision from you, not just a code change** — an inaccurate data-deletion
> statement in the Privacy Policy, and a marketing claim about ATS compatibility that the PDF export does
> not support. Both are corrected in the product now, but neither is fully resolved. Please read §5.

> **One caveat, stated up front.** Live end-to-end runs against the **production** Firebase project and the
> live AWS SES sender are deliberately not performed (standing instruction: no development testing against
> production services). Everything below is verified by type-check and automated tests against mocked Stripe
> and an in-memory Firestore.
>
> **Correction to my earlier note:** I initially reported that end-to-end testing was broadly blocked pending
> a staging environment. On inspection that was too pessimistic — this repo **already has a working Firebase
> emulator setup** (`pnpm emulators` + a seed script that creates a verified super-admin QA account), and the
> configured Stripe key is a **test-mode** key. Most of §19 can therefore be exercised safely today. The
> revised table below reflects that, and §19 now says exactly what each remaining item needs.

---

## Highest-priority items

| # | Item | Status |
|---|------|--------|
| 1 | AI request timeout | **Fixed** — three separate defects, see §1 |
| 2 | Pricing-plan inconsistency | **Fixed** — single visibility rule, see §2 |
| 3 | Dashboard text cut off | **Fixed** — root cause was a `truncate` class, see §3 |
| 4 | Billing / Stripe synchronisation | **Partly** — see §11 |
| 5 | Audit logs not recording | **Fixed** — see §1 |
| 6 | Responsive-table problems | **Fixed** for admin tickets + users, see §12/13 |
| 7 | Full language and RTL support | **Partly** — see §15 |
| 8 | Security and authorisation testing | **Previously audited**, see §18 |
| 9 | Consistent branding and logo sizing | **Blocked on assets** — see §4 |
| 10 | Complete end-to-end testing | **Mostly unblocked** — 14/20 flows runnable today, see §19 |

---

## 1. Critical functionality issues

### AI cover-letter generation timeout — **Fixed**

This was **three separate defects**, not one:

1. **Failed generations left blank cover letters behind and consumed your allowance.**
   The document was written to the database and the cover-letter quota incremented *before* the AI was
   called. When generation failed, the empty document stayed and the quota stayed spent — so every retry
   burned another allowance. Create-and-generate is now atomic: on failure the draft is deleted and the
   quota refunded. *(This directly answers your two questions: no, a failed request no longer creates a
   blank or duplicate letter, and no, credits are not deducted for a failed request — the AI credit was
   already refunded automatically, and now the cover-letter allowance is too.)*

2. **The timeout budget was set wrong.** The server allowed the model 20 seconds with one retry. A full
   cover letter routinely needs longer than 20s, and the OpenAI client retries timeouts — so a slow
   generation took 2×20s and *still* failed. It is now **one 40-second attempt with no hidden retry**,
   which fits inside the browser's own 60-second budget. The two numbers are now documented against each
   other in both files so they cannot drift apart again.

3. **The error message told you nothing.** "Request timed out — the server did not respond" is now
   replaced by a classified error that distinguishes *slow*, *offline*, *unreachable* and *server error*,
   and knows whether retrying can help.

Also added, as requested:
- A live **"Generating your cover letter…"** panel with the expected duration.
- The buttons were already disabled during the request; added a guard against fast double-clicks landing
  two submissions.
- A **Retry** action that re-runs the same form without re-typing it.
- A line confirming no credit was charged when a generation fails.

### Internet connection warning — **Not from the application**

Searched the entire codebase and all six translation files: the string *"Your internet connection is
unstable"* **does not exist anywhere in FlacronCV**. It was produced by the recording tool or the browser,
not by the product. No change was needed. (Separately, the app now recognises a genuine offline state and
says so in plain language rather than reporting a timeout.)

### Audit Logs are empty — **Fixed**

The page was not broken. The **admin Audit Logs page reads a collection that almost nothing wrote to** —
only three admin actions ever recorded anything. Everything else in the product recorded nothing at all.

Now recorded, covering your list exactly:

| You asked for | Now recorded |
|---|---|
| Login and logout | ✓ sign-in, sign-out, registration |
| Failed login attempts | ✓ (see note) |
| User role changes | ✓ with actor and before/after values |
| Subscription changes | ✓ activated, changed, cancelled, revoked, payment failed |
| Template creation, editing, deletion | ✓ |
| Support-ticket updates | ✓ created, closed, admin replies, status changes |
| AI generations | ✓ per feature, with provider/model/tokens |
| CV and cover-letter exports | ✓ |
| Admin actions | ✓ including all CRM user/subscription mutations |

Two notes worth your attention:

- **Sign-out and failed sign-ins happen in the browser.** Firebase authenticates client-side, so the
  server never sees a failed password attempt unless the browser reports it. It now does, through a
  tightly rate-limited endpoint (10 per 15 minutes) that accepts **only an email address and an error
  code — never a password**. Treat these rows as reported signal rather than proof.
- **AI generation logs deliberately do not store prompts or generated text.** That is the user's own
  private material and administrators can read this log. Only feature name, provider, model, token count
  and latency are kept.

---

## 2. Pricing and subscription inconsistencies — **Fixed**

**Career Accelerator: decided.** It has no Stripe price configured, so it cannot actually be bought.
Rather than answer your either/or by hand, the rule is now enforced in code, in one place:

> **A plan is shown to customers if, and only if, a customer can actually buy it.**

So Career Accelerator is now hidden from the billing comparison as well (it was advertised there but
absent from public pricing — that was the inconsistency). **The moment you create its Stripe price and
paste the ID into the config, it appears on the public pricing page *and* the billing page together**, with
no code change and no risk of the two disagreeing again.

**Enterprise "Contact Sales" vs "active": fixed.** Enterprise *does* have a working Stripe price and the
billing page already sold it directly. The public page now offers the same self-serve upgrade, so the two
flows agree.

**Enterprise as a "team plan": corrected.** I checked — there is **no team, seat, or invite functionality
anywhere in the codebase**. Describing it as a team plan was inaccurate, so the positioning now reads as a
high-volume individual plan, and the pages state explicitly that **all limits apply to a single account
and shared team seats are not offered yet**. That resolves the "are credits shared?" question honestly:
there are no team members to share them with.

**Yearly toggle: disabled.** It previously looked clickable and led to a dead end reading "Coming soon".
It is now genuinely disabled, announced as such to screen readers, with an explanation underneath.
⚠️ It stays disabled for a real safety reason: the stored "yearly" price IDs point at **month-interval**
Stripe prices, so enabling yearly billing without creating proper annual prices would overcharge by roughly
12×. A test now locks that guard in place.

**Public limits vs enforced limits: verified, and now permanently guarded.** I added a test suite (26
tests) that reads the numbers out of the advertised feature text and compares them with the limits the
server actually enforces, for every plan. **They match exactly today**, and any future edit to one without
the other will now fail the build.

**Disclosures added near checkout**, as requested: what counts as one AI credit, that credits **do not
roll over**, renewal, cancellation, refunds, and taxes.

---

## 3. Dashboard responsive design — **Fixed**

The cause of "30/…" and "Ent…" was a `truncate` CSS class on the value line — it was clipping deliberately.
Removed. Values now shrink one step and wrap rather than clip, ratios read as **"30 / 500"**, and the full
plan name always shows. Card height and icon size reduced, as you asked. Labels use the available width.

**A real bug found while fixing this:** the plan-name lookup only knew *free*, *pro* and *enterprise* — so
a **Career Accelerator subscriber's dashboard displayed their plan as "Free"**. Fixed, with a safe fallback
for any plan added later.

---

## 4. Logo and branding — **Blocked on assets**

The theme mapping bug was fixed in the previous round. The remaining problems **cannot be solved in code**
and need new files from your designer:

- Both PNGs have an **opaque baked-in background** (the dark one even has a border), so the logo renders as
  a pasted rectangle on any surface. A transparent PNG or SVG is required.
- The two files have **different aspect ratios**, which is why the logo appears to change size between
  screens. Matched exports would render identically.

Please supply the three versions you describe — full lockup with tagline, lockup without tagline, and the
FC icon — as transparent SVG (preferred) or PNG, with matched aspect ratios. Sizing rules and the favicon
are then a small follow-up.

---

## 5. Public website — claims and wording ⚠️ **Please read this section**

You asked me to check five specific claims and display only what the product can prove. I verified each
against the code. **Four were not supportable and have been removed.** One needs your attention beyond copy.

| Claim | Verdict | Evidence |
|---|---|---|
| "ATS-optimized" | ❌ **Not true of the PDF** | See below |
| "Dozens of templates" | ❌ **There are 16** | 10 CV + 6 cover-letter templates in the seed data |
| "Designed by HR experts" | ❌ **No substantiation** | Nothing in the product or repo supports it |
| "GDPR compliant" | ❌ **Removed as an unqualified claim** | See below |
| "6 languages" | ✅ **True** | Six locale files, all at full key parity |

**The ATS finding is the one that matters.** Your PDF export is produced by rendering the preview to a
picture and placing that picture in the PDF. The result contains **no text at all** — an applicant tracking
system cannot read a single word of it. The claim was not just overstated; for the PDF it was backwards.

Your **DOCX export is genuinely fine** — it is built from real text and parses correctly. So the honest and
actually-useful framing is *"DOCX for the robots, PDF for the humans"*, and I have put that at the point of
choice: the export menu now labels PDF **"Best for sending to people"** and DOCX **"Best for applicant
tracking systems"**. That turns a false claim into a genuinely helpful one. The blanket "ATS-optimized"
wording is gone; the real **ATS Check feature** keeps its (accurate) description.

**On GDPR — a real problem, not just wording.** Your Privacy Policy stated that when a user deletes their
account "all associated data is permanently deleted within 30 days". In the code, deleting an account
disables it, revokes sessions and blocks sign-in — but **the user's CVs and cover letters are not deleted,
and there is no job that ever deletes them.** That is a false statement of fact in a legal document.

I have corrected the wording so it describes what actually happens and routes permanent erasure to
`privacy@flacroncv.com` within 30 days (handling erasure manually on request is perfectly acceptable under
GDPR — automation is not required). **But treat this as a patch, not a fix.** Two things still need you:

1. **Build the erasure cascade** — deleting an account should also remove or anonymise the user's documents.
   I did not build it during the freeze because what to keep for tax/invoice purposes is a legal decision.
2. **Confirm `privacy@flacroncv.com` actually receives mail.** Your API's configured support address is on
   `@flacronenterprises.com`, so the two domains may not both be live. A published privacy contact that
   bounces is worse than none.

I also found and fixed a related one: **your Privacy Policy named Brevo as the email provider, but the
product now sends through AWS SES.** An inaccurate subprocessor list is a GDPR accuracy problem, and it
under-disclosed a second transfer of personal data to the US. Corrected in all six languages, and I added an
automated test that ties the disclosed provider list to the packages actually installed, so a future
provider change cannot silently leave the policy stale again.

## ⚠️ Your CI pipeline has not been working

I went to add one automated check and found the pipeline itself was broken. Three separate problems:

1. **CI never ran your tests.** The workflow does lint → type-check → build → Docker, and never executes a
   single test. All 410 tests gated nothing — both suites could be completely red and still merge. Several
   of the bugs found during this review are exactly the kind a test catches and a type-check cannot.
2. **Worse: CI has been failing at its very first step.** The `apps/mobile` package has a lint script but no
   ESLint configuration file, so linting aborted immediately. Because the build and Docker jobs both depend
   on lint passing, **the whole pipeline has been dead** — no build check, no Docker check, nothing. This
   predates my work: at the last commit, the only ESLint config in the entire repository was for
   `functions/`.
3. **Fixing that lint immediately exposed a broken feature in the mobile app.** The CV/cover-letter export
   references a file-system API that no longer exists in the installed version of the library — it would
   fail every time it was used. Nothing surfaced it because linting never ran.

All three are fixed. Lint, type-check and tests now all pass, and tests are a required gate before build.

Mobile was outside the scope of your review, so I've kept that change to the single broken import.

## ⭐ Feature build (your follow-up instruction)

You asked me to start from the text-layer PDF and work through the not-started list. Here is where that
stands.

### §5 Text-layer PDF export — **done, and the risk I warned about is gone**

I'd flagged that switching to the server-side renderer would silently change how every existing user's
PDF *looks*. You reaffirmed the request, so I built it a safer way: **keep the image exactly as it is and
add an invisible text layer behind it** — the same technique that makes a scanned PDF searchable.

- **Visually identical to today.** Nothing about your users' PDFs changes.
- **Machine-readable.** An ATS, `Ctrl+F`, and any text extractor now find every word.
- **Proven, not assumed.** I generated a PDF, pulled its content stream apart, and recovered every line.
- The export menu now also labels the two formats honestly: PDF *"Best for sending to people"*, DOCX
  *"Best for applicant tracking systems"*.

One caveat, stated plainly: **Arabic and Urdu CVs do not get the text layer.** The PDF library's built-in
fonts cannot encode those scripts, and embedding garbled text would be worse for a parser than none.
Fixing that means embedding a Unicode font — a real but separate piece of work.

### §10 — you can now exercise the privacy rights the policy promises

Your Privacy Policy has promised a Right to Access and a Right to Portability with **no way to exercise
either**. There is now a **"Download my data"** button in Settings that returns everything in the account —
profile, preferences, subscription and usage, CVs, cover letters, job applications and support tickets — as
one JSON file. That is a live compliance gap closed.

On **"active sessions"**: I did not build the table you asked for, because it would have been fiction.
Firebase gives us no list of a user's devices. Instead there is an honest **"Sign out of all devices"**,
labelled with exactly what it does. A real per-device list would mean us keeping our own session records —
say the word if you want that.

### §12 — support internal notes

Agents can now leave private notes on a ticket, clearly marked "not visible to the customer", audit-logged,
and correctly not treated as a reply (adding one doesn't change the ticket's status).

**Attachments are not built.** They need Firebase Storage, a virus-scanning decision, and a retention
policy — your own §18 asks that uploads be "scanned and securely stored", and none of that exists yet.
That's a decision for you before it's code.

### §8 — cover-letter AI controls

Tone and length pickers, and the ability to **rewrite a single paragraph** rather than regenerating the
whole letter. The generation flow was also restructured so the draft is shown to you for review and
**nothing is saved until you choose to save it** — which is what you asked for, and it makes the
blank-draft problem impossible rather than merely recoverable.

**I did not build the "paste a job-posting URL and auto-fill" feature.** Fetching a URL that a user
supplies, from our server, is a well-known attack vector — it can be pointed at internal services or cloud
credential endpoints. It's buildable safely, but it needs deliberate design rather than being slipped in
alongside other work. Flagging rather than shipping something risky.

### §7 — new CV screen

Three real starting points: start from scratch, import an existing CV, or choose a template. The import
option now states the actual accepted formats, the real 5 MB limit and what happens with a damaged or
scanned file — values read from the code, not invented.

### Also delivered

| § | Feature | Notes |
|---|---|---|
| 6 | Template **search**, working filters, whole-card click, full-size preview | See the honest gap below |
| 7 | **Content-overflow warning** — "Your CV runs onto 2 pages" | Quiet inline note; a 2-page CV is legitimate, not an error |
| 9 | **Calendar export** — download an interview as a `.ics` | Imports into Google, Outlook and Apple; no account connection needed |
| 13 | **Subscription reporting** — status breakdown, MRR, Stripe customer ID | Churn says "not available" with a reason where the data can't support it, rather than inventing a number |
| 14 | **CRM date-range filter + CSV export** | Required building the API filtering too — see below |

### Two things worth knowing

**The date-range filter needed backend work I hadn't budgeted for.** The first version was *inert*: the
analytics endpoints accepted no date parameters, so choosing "Last 7 days" returned identical all-time
numbers — and then labelled them as a filtered week in both the screen and the exported CSV. Real figures
presented as something they weren't, which is worse than having no filter. I built the server-side
filtering properly, with tests.

**Industry and career-level template filters cannot be built yet.** There is no industry or career-level
field on the template records — anywhere. Building those filters would have meant inventing the data. It
needs a small backend schema change first (add the fields, populate them in the catalogue and the admin
template editor); the UI is then about fifteen lines. Flagging rather than faking.

## 6–7, 10, 16–17. Templates, CV editor, settings, consistency, accessibility

I ran a structured audit across these sections (63 agents, every finding independently checked by a second
reviewer that tried to disprove it — **40 confirmed, 15 rejected**). The rejected ones were mostly
unbuilt-feature requests miscast as bugs; I have not actioned those on a frozen release candidate.

**Two genuine CV-editor bugs found and fixed (§7):**

- **Undo was off by one.** The first change you made could never be undone, and every undo after that
  reverted **two** changes at once. Cause: the editor saved its snapshot *before* each change instead of
  after. Fixed, with regression tests.
- **Autosave said it would retry, and never did.** When a save failed you got "your changes will retry" —
  but nothing was scheduled, so the work sat unsaved until you happened to type again. On a flaky connection
  that is silent data loss. Now retries with a backoff.

**A significant one in the CRM (§16):** the CRM had **no header at all on desktop** — meaning no language
switcher, no theme toggle and no account menu anywhere in that entire section. It now uses the same header
as the admin panel, which also resolves the inconsistent header height and logo treatment you noticed.

**Also fixed:** the upgrade/paywall prompt was **entirely in English in all six languages** — and it
advertised "Unlimited AI Credits" and "Unlimited CVs" for Pro, which is wrong (Pro is 100 credits and 10
CVs). It now reads the real plan limits, so it cannot over-promise at the moment someone decides to pay.
Accessibility: the admin role dropdown was repeated once per row with no name at all, so a screen-reader
user could not tell whose role they were about to change — now named per row.

**§7 ATS score is genuine, not static.** Confirmed in code: the modal serialises the user's actual CV and
sends it with the job description. It is not a hardcoded 94/100.

**Accessibility (§17) — now done across the CRM and admin.** Every filter dropdown that had no name now
has one; icon-only buttons carry labels and tooltips; every form field in a CRM dialog is properly linked
to its label; action buttons that only appeared on hover now also appear on keyboard focus (Tab previously
landed on an invisible delete button); and **seven dialogs that were plain `<div>` overlays are now real
dialogs** — they trap focus, close on Escape, return focus where it came from, and announce themselves to
screen readers.

**Responsive tables (§12/13) — extended** to the CRM users, audit, customers and subscriptions tables and
the admin subscriptions and audit-log tables, using the same pattern as before: columns fold as the screen
narrows and their values reappear inside the first column, so nothing is lost at any width.

**Still deliberately not done:** the design-token cleanup, the shared page-container normalisation, and the
button-size rescale. All three are correct observations, but they are pure visual refactors that would
produce a diff on every screen in the product — exactly the kind of change a frozen release candidate
should not absorb without your say-so. Same for preview zoom and page-break indicators, which are new
features rather than fixes. Tell me the order you want them in and I will scope them properly.

---

## 8. Cover-letter module — **Fixed (metadata + dates)**

**"Updated" with no date — root cause found, and it was affecting 18 pages, not one.**
The date formatter understood one Firestore timestamp format but not the one the server actually sends, so
every timestamp silently became an empty string. One fix repairs the dates on **cover-letter cards, admin
template cards, support tickets, CV lists, job applications and the audit log simultaneously**. Dates now
render as "Updated Jul 29, 2026", exactly as you asked.

Cards now also show **Created** and **Updated**, plus a badge when a CV is linked. Edit, Duplicate,
Download, Delete, status and company/job title were already present.

The two near-identical entries you saw were test data, not a duplication bug — but the blank-draft defect in
§1 *was* capable of producing empty duplicates, and that is now fixed.

The remaining AI-generation requests (paste a job-posting URL, auto-extract company/position, tone and
length pickers, regenerate a single paragraph) are **new features, not started** — happy to scope them.

---

## 9. Job Tracker — **Substantially extended**

Added: **search** (company, role, location, notes, contact), **sort** (recently updated / date applied /
company / position / status), **a count on every status tab**, **archive and restore**, and a delete
confirmation that names the specific application.

New fields, end to end (data model, server validation, UI): **salary range, recruiter name and email,
interview date, follow-up reminder, linked cover letter**. Job-posting URL, notes and linked CV already
existed.

**Duplicate applications:** a new check warns you if you already track that company + position and asks you
to confirm, rather than blocking — re-applying is legitimate, it just should not happen by accident.

The dates you flagged (Jul 14 vs Jul 30) are user-entered values in test data and were stored correctly;
they had simply never been *displayed* correctly, which the date fix in §8 resolves. "Senior Mathematician"
vs "Senior Mathematic Tutor" is test data.

**Not done:** calendar integration. Worth deciding whether you want a downloadable calendar file or a real
Google/Outlook connection — they are very different amounts of work.

---

## 11. Billing page — **Partly**

Already present from earlier work: exact current plan, renewal date, payment method, update-payment and
cancel via the Stripe billing portal, and a **real invoice list pulled from Stripe with PDF downloads**.

"No billing history yet" alongside an active Enterprise plan is expected **if that account was upgraded
manually rather than through Stripe checkout** — an admin-granted plan produces no Stripe invoices. To
confirm which it is, I need to check that specific account against Stripe, which requires either your
confirmation to query the live account or a staging environment.

Still open: an in-app cancellation control (currently portal-only), and clearer failed-payment status.

---

## 12. Support system — **Fixed (responsiveness + wording)**

The admin tickets table overflowed because six columns were rendered at fixed wide padding. Columns now
fold progressively as the screen narrows, and **anything hidden is repeated inside the subject cell**, so
no information is lost at any width.

**"Awaiting your reply" — fixed properly.** The problem was that admins and customers read the *same*
string, so "your" meant different people. The labels are now reader-independent in all six languages:

- `open` → **"Awaiting support reply"**
- `waiting_on_customer` → **"Awaiting customer reply"**

Assignment, status changes, replies, timestamps and pagination already exist. Internal notes and
attachments are **not started**.

---

## 13. Admin panel — **Partly**

**Templates:** archiving now names the template and **tells you how many documents use it** before you
confirm. Note that deletion was already a soft archive — existing documents keep rendering — so nothing has
ever been destroyed. Template cards now show a real update date (§8 fix).

**Users:** the table is now responsive. Pagination, search and role/plan/status filters already exist via
the CRM-backed endpoints. **Role changes are now recorded in the audit log with the actor and the
before/after values** (§1).

**Subscriptions:** the extra states you listed (failed, trialing, past due, canceled, refunded, MRR, churn,
Stripe customer ID) are **not started** — that is a reporting build. On your question about the counts:
"Active" currently counts subscription records with an active status, which is why 95 Free + 4 Pro + 3
Enterprise does not reconcile against "7 Active" — free users have no subscription record at all. Worth
relabelling that tile; I did not change it because it is a reporting-semantics decision.

---

## 14. CRM dashboard — **Fixed (charts and misleading metrics)**

**The repeated "$0k" labels:** the axis formatter divided every value by 1,000 unconditionally, so
everything under $500 rounded to "$0k". It now adapts — **$0, $10, $20** for small values, then $1.2k,
$12k, $1.5M as the numbers grow. Exactly what you asked for.

**Empty state added** for a revenue series with no data, instead of drawing a flat chart that reads as
"revenue collapsed".

**The misleading 50% conversion rate is gone.** Below 20 recorded leads the card now says "Not enough data"
and explains the threshold, rather than presenting 1-out-of-2 as a confident percentage.

Your definitional questions (what creates a lead, what converts one, how revenue reconciles with Stripe,
what "Active Customer" means, what period conversion covers) are **product decisions, not code defects** —
I have not invented answers. Date-range filtering and CSV export are not started.

---

## 15. Language support — **Substantially improved**

All six languages are wired with **1,718 keys at full parity across every locale**, verified automatically
on every change. Two new automated guards now protect this:

- A **parity test** that fails the build if a key is missing from any locale, if any value is blank, or if
  a translation drops or renames a placeholder like `{date}` (which would render literal braces to the
  user, and is invisible to a normal key comparison).
- A **resolution check** confirming every `t()` call in the app matches a real key — parity alone cannot
  catch a key missing from *all six* files, which still shows the raw key path on screen.

**Screens fixed this round** (all previously showing English in every language): the **upgrade/paywall
prompt**, the **CV Design panel** (layouts, colours, heading styles, corner styles and tooltips), the font
preview, the **landing-page product mockup** — the first thing every visitor sees — the CV editor's
autosave and crash-recovery messages, the admin audit-log filter, and the maintenance screen.

**A real Arabic/Urdu bug found and fixed:** 27 layout classes across the CRM and admin used *physical*
directions (left/right) instead of *logical* ones (start/end). In Arabic and Urdu those do not mirror — so
search icons sat on the wrong side of their input and right-aligned columns stayed right-aligned when they
should have flipped. Zero physical direction classes now remain in either section.

**Still outstanding:** a full screen-by-screen translation review. The known offenders are fixed, but I
have not walked every screen in every language to confirm nothing remains. That is a discrete QA task best
done against the emulator (see §19).

---

## 18. Security and privacy

A dedicated adversarial security audit was completed in the earlier engagement and its findings fixed:
cross-user document access (IDOR) audited clean across CVs, cover letters, jobs and exports; admin routes
enforced server-side; privilege escalation between admin and super-admin closed; Stripe webhook signatures
verified; AI rate limiting in place; file uploads validated; account deletion revokes sessions.

**Changing a document ID in the URL cannot expose another user's CV** — ownership is checked on every
by-ID path, and this was specifically audited. One related privacy bug was found and fixed then: a
publicly-shared CV stayed reachable by its share link after deletion.

This round adds **admin action logging**, which was listed in your §18 and was genuinely missing.

Still requiring your input: the data-controller legal identity, address and governing law for the privacy
policy (GDPR Art. 13), and confirmation that the `@flacroncv.com` mailboxes are live.

---

## 19. Testing status

Two different things are being tracked here, so the table separates them:

- **Automated** — covered by the test suite that runs on every change (246 API + 41 web tests).
- **Manual run** — whether a human has actually clicked through it in a safe environment.

| # | Flow | Automated | Manual run | What it needs |
|---|------|-----------|-----------|----------------|
| 1 | New-user registration and login | ✔ | **Not started** | Emulator — ready now |
| 2 | Create CV from scratch | ✔ | **Not started** | Emulator — ready now |
| 3 | Import an existing CV | ✔ | **Not started** | Emulator + AI key |
| 4 | Select and change a template | ✔ (27 tests) | **Not started** | Emulator — ready now |
| 5 | Generate AI summary | partial | **Not started** | Emulator + AI key |
| 6 | Run ATS check | partial | **Not started** | Emulator + AI key (logic verified in code) |
| 7 | Export PDF | ✔ (quota gate) | **Not started** | Emulator — ready now |
| 8 | Export DOCX | ✔ (paid gate) | **Not started** | Emulator — ready now |
| 9 | Create a cover letter manually | ✔ | **Not started** | Emulator — ready now |
| 10 | Generate a cover letter with AI | ✔ failure paths | **Not started** | Emulator + AI key |
| 11 | Add/edit/status/delete a job application | ✔ | **Not started** | Emulator — ready now |
| 12 | Upgrade through Stripe test mode | ✔ (mocked) | **Blocked** | Stripe CLI webhook forwarding |
| 13 | Cancel subscription | ✔ (mocked) | **Blocked** | Stripe CLI webhook forwarding |
| 14 | Create and respond to a support ticket | ✔ | **Not started** | Emulator — ready now |
| 15 | Admin user-management actions | ✔ incl. escalation guards | **Not started** | Emulator — ready now |
| 16 | Admin subscription management | partial | **In progress** | Extra reporting states not built (§13) |
| 17 | Template creation and editing | ✔ | **Not started** | Emulator — ready now |
| 18 | Audit-log creation | ✔ | **Not started** | Emulator — ready now |
| 19 | Language switching | ✔ parity | **In progress** | Full-screen translation audit outstanding |
| 20 | Mobile and tablet responsiveness | n/a | **In progress** | Dashboard + admin tables fixed; full sweep outstanding |

### What is actually available today

I was **wrong** in my first note to say this was broadly blocked on a staging environment. Checking the
repo properly:

- **A Firebase emulator setup already exists and is safe.** `pnpm emulators` starts local Auth + Firestore,
  and `pnpm --filter api run seed:emulator` creates a verified **super-admin QA account** with an Enterprise
  plan and 500 AI credits. The seed script forces the emulator hosts and strips any real service-account
  credential before initialising, so it *structurally cannot* write to the live project. Fourteen of the
  twenty flows above can be run this way **right now**, with no new infrastructure.
- **Your Stripe key is already a test key** (`sk_test_…`), so checkout, upgrade, cancellation and refunds
  can be exercised without real money.

So only **two** things genuinely need doing:

1. **Stripe webhook forwarding** (items 12–13). Stripe cannot reach `localhost`, so without the Stripe CLI
   checkout completes in the browser but the plan is never activated — which looks exactly like a broken
   upgrade. I have added a **step-by-step Stripe test-mode section to the README**, with the CLI commands,
   the test card numbers for success / failure / decline, and the `stripe trigger` commands for renewal,
   cancellation, refund and dispute. About ten minutes of setup. A useful side effect of this round's work:
   every one of those webhooks now writes to the admin **Audit Logs** page, which is the fastest way to
   confirm a webhook actually landed.
2. **Two known emulator gaps**, both documented in the README: **Storage is not emulated** (so avatar upload
   and server-side PDF export still touch the real bucket — avoid those two in emulator mode), and the
   Firestore emulator needs **Java 11+**.

Email remains the one thing I would not exercise: the sender is **AWS SES** on a live verified identity.
Verifying a test recipient address in SES, or moving QA to the SES sandbox, would close that too.

*(Correction: an earlier draft of this document referred to Brevo. The product migrated to AWS SES —
`@aws-sdk/client-sesv2` in `apps/api/src/modules/mail/mail.service.ts`. The README carried the same stale
reference and has been corrected.)*

---

## What I need from you

1. **Career Accelerator** — create the Stripe price and send me the price ID, or confirm you want the plan
   dropped entirely.
2. **Logo files** — transparent SVG/PNG, three versions, matched aspect ratios (§4).
3. **Ten minutes of Stripe CLI setup** — the only real blocker left in §19 (commands are now in the
   README). No staging environment needed: the Firebase emulator and a test-mode Stripe key are already
   in place.
4. **Priorities for §5–7, §10, §16** — these are feature and design builds, not defects; tell me the order.
5. **CRM definitions** (§14) and the **subscription reporting states** (§13) — product decisions I should
   not guess at.
6. **Legal details** — data-controller entity, address, governing law; confirmation the support mailbox is
   live (§18).
7. **Two decisions from §5**, please: (a) approve building the **account-erasure cascade** so deleting an
   account really does remove the user's documents — I need to know what must be retained for tax/invoice
   purposes; and (b) confirm **`privacy@flacroncv.com` receives mail**, since it is now the published route
   for erasure requests and your API is configured on a different domain.
8. **Whether to build a text-layer PDF export.** Today's PDF is an image, so it is not machine-readable.
   A server-side renderer exists but produces different-looking output than the editor preview, so wiring it
   in would silently change how every user's PDF looks. I would schedule this deliberately post-launch
   rather than slip it into the release candidate.
