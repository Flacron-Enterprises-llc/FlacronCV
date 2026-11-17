# FlacronCV Stripe billing — deployment review

Prepared 17 Nov 2026 from real Stripe test-mode runs and the code on branch `feat/career-coach`.
Companion: `docs/STRIPE_PRODUCTION_CHECKLIST.md` (gates, deploy order, rollback). Nothing here has been executed in live mode.

## 0. Verdict

**Not ready to deploy yet — ready for review.** The billing code passed every available real Stripe test-mode journey in the company account's test environment after three real defects were fixed. Deployment still depends on four items that cannot be closed from code: (1) confirming which Stripe account the live site uses today, (2) the client's trial decision, (3) creating the live key, catalog, webhook events and portal configuration, (4) end-to-end verification on the central dashboard.

## 1. Evidence

Account: Flacron Enterprises LLC, `acct_1HUAchKFLhrvSzkg`, **test mode only**. Application tag: `app_id=flacron-cv`. Fictional users, Stripe test cards. Redacted evidence: `FlacronCV-integration-local/evidence-2026-11-17-stripe-test/` (not in Git).

### 1.1 Real Stripe test mode — passed
Hosted Checkout completed in a browser with test cards; events delivered by Stripe through `stripe listen`; results read back from Stripe, the local database and the website.

| Journey | What was verified |
|---|---|
| Monthly Starter | Checkout → webhook → plan Starter, 20 credits, one subscription, `app_id`, price, USD, customer; one ledger row ($21.99); website shows the plan after sign-in and refresh; a second checkout refused (`ALREADY_SUBSCRIBED`) |
| Annual Professional (trial) | Trial eligibility, Checkout → `trialing`, trial recorded once, **one month of credits (60), not twelve** |
| Abandon and retry | Opening Checkout does not consume the trial; the abandoned session is expired before a replacement; exactly one subscription |
| Capacity add-on | Checkout → webhook → add-on subscription stored |
| Prorated upgrade | Applied after payment; Stripe price and plan move to Professional |
| Failed upgrade (declining card) | Clean "payment pending" answer; plan and price unchanged; user not marked past due |
| Downgrade | Scheduled for period end; plan unchanged now |
| Customer portal | Opens with FlacronCV's own **non-default** configuration; shows only the FlacronCV plan |
| Unavailable pack | Cannot be bought (no price loaded locally, so the price guard refused first) |

### 1.2 Real Stripe test clocks — passed
Successful renewal (period advances, invoices recorded once); **failed renewal** (period not extended, credits not refreshed, failure recorded, not revenue); cancellation → Free with a tombstone so late events cannot revive it; refund recorded only for its own purchase.

### 1.3 Locally signed replays of real events — passed
Real event payloads (fetched from Stripe) re-sent to the local API signed with the **local** listener secret — not Stripe redeliveries: invalid signature refused; duplicate and concurrent deliveries change nothing; a late, older event does not undo an upgrade.

### 1.4 Reconciliation — passed
This session's payments, ledger vs Stripe: gross $282.87 = $282.87; refunded $65.97 = $65.97; 4 failed payments excluded from revenue; 18 ledger rows, no duplicates; all `application_id=flacron-cv`. **Stripe fees are not in the ledger** — figures are gross and net-after-refunds, not payouts.

### 1.5 Mocked (automated tests) — passed
1,158 API tests, including: app ownership of every object type, untagged legacy events (verified mapping only), other-app events and prices refused, checkout coordination, trial consumption, per-subscription event ordering, disputes, refunds, ledger and revenue report (3/2/4 app separation, currency separation, $100 − $30 = $70 after refunds), log redaction. Plus web (pricing labels, availability reasons, idempotency key, return banners) and career-server ledger rules (monthly renewal of annual plans, pack expiry and spending order, unpaid renewals).

### 1.6 Not tested / blocked
| Area | Why |
|---|---|
| One-time pack purchase | No one-time pack is available locally (they need AI, speech, maps or job feeds) |
| Real dispute | Mocked only |
| Live mode | Out of scope until the gates below |
| Central company dashboard | Not accessible; FlacronCV side and its contract tests are done |
| Mobile store purchases | Device/store testing not available here |

## 2. Defects found by real testing and fixed
| Defect | Fix |
|---|---|
| A renewal extended the paid period before its invoice was paid (Stripe moves the subscription into the new period while still `active`) | Period and credits advance only when the latest invoice is paid (`5c11eb4c`) |
| The account's Adaptive Pricing charged visitors in local currency (Starter shown as PKR 6,329.39, not USD 21.99) | FlacronCV Checkout sessions disable it for themselves; account setting untouched (`8c9c36fb`) |
| Logs could contain Stripe's masked key (`rk_test_...ABCD`) | All API logging redacts credentials (`aa905a9c`) |

## 3. Verify the Stripe account used by existing live subscribers (read-only)
Do this before any live key or price change. No step writes anything.
1. **API key's account:** in AWS Secrets Manager, note which Stripe account the live API's `STRIPE_SECRET_KEY` belongs to by matching it in the Dashboard's API keys list (Developers → API keys, **live mode**) of each company account you can open. Do not copy the value anywhere.
2. **Webhook endpoint:** in the candidate account (live mode) open Developers → Webhooks and confirm an endpoint for `https://api.flacroncv.com/api/v1/webhooks/stripe` exists and shows recent successful deliveries.
3. **Subscribers:** in the same account (live mode) open Billing → Subscriptions and confirm active FlacronCV subscriptions exist (FlacronCV Pro/Enterprise products, `app_id=flacron-cv` metadata where present).
4. **Cross-check with the app's records:** take two or three real subscriber records from production Firestore (`users/{uid}.subscription.stripeCustomerId`) and confirm those customers exist in that account. Only staff with production access should do this; no data leaves the console.
5. **Decision:** if all four point to `acct_1HUAchKFLhrvSzkg`, live work happens there. If they point to another account, **stop**: existing subscribers stay where they are; moving them requires a separate migration plan and client approval.

## 4. Preserve existing subscribers
- Never move, cancel, recreate or re-price existing subscriptions. Legacy plans (Pro, Career Accelerator, Enterprise) keep their prices; `STRIPE_PRO_*` and `STRIPE_ENTERPRISE_*` must point at the **existing live** legacy prices (the API refuses to boot live without them).
- Untagged pre-standard subscriptions are accepted only through the verified mapping (stored subscription id **and** customer id). Before deploy, run the backfill **read-only**: `node apps/api/scripts/stripe-backfill-app-id.mjs --live --dry-run` with the live key supplied by the owner, and review what it would stamp. Applying it (without `--dry-run`) is a separate, approved step.
- Do not archive or delete legacy prices or products.
- After deploy, watch the API log for `unattributed` and `app_mismatch` decisions on live events.

## 5. Live setup (owner actions, after §3)
### 5.1 Live restricted key — FlacronCV only
Permissions confirmed by Stripe's own refusals in test mode (Stripe internal names in brackets):

| Permission | Level |
|---|---|
| Customers (`customer_write`) | Write |
| Checkout Sessions | Write |
| Customer Portal (`customer_portal_write`) | Write |
| Subscriptions (`subscription_write`, covers schedules) | Write |
| Payment Intents (`payment_intent_write`) | Write |
| Invoices, Prices, Products | Read |
| Charges and Refunds (`charge_read`) | Read |
| Payment Disputes (`dispute_read`) | Read |
| Everything else (Balance, Test clocks, Webhook endpoints, Debugging tools…) | None |

Dashboard edits of restricted keys dropped previously granted permissions several times during testing: after saving, re-open the key and confirm every line. Store it only in AWS Secrets Manager.

### 5.2 Live catalog
- `apps/api/scripts/stripe-provision-catalog.ts` is **test-mode only by design** (refuses `--live`). Creating the live catalog needs a reviewed live variant (same idempotent, conflict-stopping logic, explicit `--live` confirmation, run with the owner present) — **a code change still to make and review**. Do not hand-create prices.
- Set `STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>` for the 8 plan prices and only those `STRIPE_PRICE_PACK_*` whose feature has a working live provider. The server additionally refuses unavailable packs.

### 5.3 Webhook
Add to FlacronCV's own live endpoint, keeping the existing events: **`checkout.session.expired`** and **`charge.dispute.closed`**. Do not change any other application's endpoint.

### 5.4 Customer portal
Create FlacronCV's own live portal configuration (only FlacronCV plan prices; cancellation at period end; no mid-period downgrades), set `STRIPE_PORTAL_CONFIGURATION_ID`. Without it the API refuses portal sessions rather than using the shared account default. Never change the account's default configuration.

### 5.5 Currency
FlacronCV Checkout now forces USD per session. The account-wide Adaptive Pricing setting must **not** be changed for FlacronCV's sake.

## 6. Validate cross-app isolation
Before deploy (read-only, live key): run the permission preflight against the live key (required permissions pass; no extras), and record a fingerprint (counts + hash) of all products/prices **not** tagged `app_id=flacron-cv`.
After deploy:
1. Recompute the fingerprint — it must be identical (FlacronCV never touches other apps' objects).
2. One staff test purchase in live mode (refunded the same day) shows `app_id=flacron-cv` on customer, session, subscription and payment; the ledger records it once under `flacron-cv`.
3. API logs for 24 h: `app_mismatch` and `unattributed` events are acknowledged without changes; no other application's events change FlacronCV data.
4. Revenue report filtered by `application_id=flacron-cv` matches the Dashboard's FlacronCV-tagged payments (gross and refunds; fees excluded).
5. Portal: a FlacronCV customer sees only FlacronCV plans; a customer shared with another app is refused (`PORTAL_SHARED_CUSTOMER`).

## 7. Professional trial — current policy and open decision
**What runs today (unchanged by this work):** Professional only, monthly and annual; **7 days**; card required (charged when the trial ends unless cancelled); **first-time subscribers only** — no earlier Stripe subscription on the FlacronCV customer and no recorded trial. The trial is offered only through a new checkout, never on an in-app plan change. The old mobile app's legacy Pro checkout keeps its legacy 7-day trial. Since this work, eligibility is used up only when a trial actually starts (abandoned checkouts no longer consume it) — verified in real test mode.

**Decision still needed from the client:** the pricing document does not mention a trial. Keep the 7-day Professional trial, change it, or remove it? Until answered, the current policy stays.

## 8. Deployment order and rollback
Follow `docs/STRIPE_PRODUCTION_CHECKLIST.md` §6–7: API before web; watch logs 24 h; rollback = previous task definition / build, unset price variables to stop selling; new Firestore data is additive. Never delete Stripe objects as a rollback step.

## 9. Open items
| Item | Owner |
|---|---|
| Live account verification (§3) | Operator with Stripe + AWS access |
| Trial decision (§7) | Client |
| Live key, catalog script live variant, webhook events, portal configuration (§5) | Engineering + account owner |
| Central dashboard end-to-end check | Platform owner |
| Mobile store purchase testing | Mobile release owner |
