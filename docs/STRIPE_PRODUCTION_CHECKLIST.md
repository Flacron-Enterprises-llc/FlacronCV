# FlacronCV Stripe — production deployment and rollback checklist

Prepared 17 Nov 2026. **Not executed.** Every step below needs an explicit go-ahead.
Shared Stripe account; FlacronCV is identified only by `app_id=flacron-cv` metadata and its own Firestore records.

## 0. Gates that must be closed first (blockers)

| Gate | Why | Evidence required |
|---|---|---|
| G1. Production Stripe account verified | The live API's current account was never verified; price IDs in old docs suggest a different account. Moving accounts would strand live subscribers. | Owner confirms the account of the live webhook endpoint and live subscriptions in the Dashboard. |
| G2. Real test-mode journeys passed | Only mocked tests and catalog read-backs ran so far; FlacronCV's restricted test key was not available. | Section 3 below completed against the test catalog with the restricted `rk_test_` key and a local listener. |
| G3. Trial policy confirmed by the client | The pricing PDF does not mention the 7-day Professional trial that the code offers. | Written client decision: keep, change or remove. |
| G4. Legacy objects mapped | Pre-standard (untagged) legacy subscriptions are attributed only through the verified mapping (stored subscription id **and** customer id). Others stay unattributed. | `node apps/api/scripts/verify-stripe-standard.mjs` (dry) on live, read-only; review unattributed count. |
| G5. Live catalog | The live account has no five-plan catalog yet. | Section 2 dry run approved. |
| G6. Provider launch gates | Packs stay closed until their feature has a working provider (AI, storage, speech, maps, job feeds). Configuration alone is not proof. | One real end-to-end use of each provider in staging before its packs are sold. |

## 1. Live restricted key (Dashboard, owner action)

Create **one** restricted key for FlacronCV only (Developers → API keys → Create restricted key; two-factor required — Stripe offers no API for this). Grant only what the code calls:

| Resource | Level | Used by |
|---|---|---|
| Checkout Sessions | Write | create, retrieve, list line items, expire |
| Customers | Write | create, retrieve, update metadata |
| Customer portal | Write | portal sessions (with FlacronCV's own configuration) |
| Subscriptions | Write | retrieve, list, update (plan change, metadata), cancel |
| Subscription schedules | Write | downgrade at period end |
| PaymentIntents | Write | automatic top-up, metadata stamping, retrieve |
| Invoices | Read | list, retrieve, upcoming preview |
| Prices, Products | Read | price ownership checks |
| Charges, Refunds, Disputes | Read | refund/dispute attribution |
| Everything else | None | |

Stripe states write implies read; exact Dashboard labels were not all confirmed from the docs page (only Payment Intents, Customers, Disputes were named there). A restricted key cannot be limited to one application's objects — ownership is enforced in code.

Store it in AWS Secrets Manager as the API's `STRIPE_SECRET_KEY`; never in Git, chat or tickets.

## 2. Live catalog (after G1, G5)

1. `npx ts-node --transpile-only apps/api/scripts/stripe-provision-catalog.ts --account=<live acct>` is **test-mode only by design**; a live run needs a reviewed live variant (same code, explicit `--live` confirmation, owner present). Do not hand-create prices.
2. Read back every product/price; record the 8 plan + approved pack price IDs.
3. Set `STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>` and only the `STRIPE_PRICE_PACK_*` of packs whose feature passes the availability rules **with live providers** (unset = not on sale; the server also refuses unavailable packs).
4. Keep the four legacy price variables (`STRIPE_PRO_*`, `STRIPE_ENTERPRISE_*`) — the API refuses to boot live without them.

## 3. Test-mode journeys (G2) — local, isolated

Run with `C:\Users\win 11\FlacronCV-integration-local\start-v1-api-stripe-test.ps1` (refuses sk_/live keys, non-emulator Firebase, wrong APP_ID, bad prices) and `stripe listen --forward-to localhost:4100/api/v1/webhooks/stripe` (its whsec_ is a LOCAL secret, never the production one). Fictional users only.

- Starter monthly checkout → plan active, one month of credits.
- Professional annual (trial on, card `4242…`) → trialing; abandon a second checkout → trial not consumed; complete → recorded once.
- Pack (only an available one) → units granted once; replay webhook → no duplicate.
- Capacity add-on → renews with a test clock; cancel → lapses at period end.
- Upgrade (prorated, paid) and failing upgrade (card `4000 0000 0000 0341`) → no plan change.
- Downgrade at period end (schedule) → applies at renewal.
- Renewal failure (test clock + failing card) → no new month, no new credits; recovery → one renewal.
- Refund of a payment created in this run → only that purchase revoked; ledger gross unchanged, net reduced.
- Invalid signature → 400, nothing applied.
- Report: `GET /admin/billing/revenue?application_id=flacron-cv&livemode=false`.

## 4. Live webhook endpoint (owner action, after code deploy)

Add these events to FlacronCV's own endpoint (`https://api.flacroncv.com/api/v1/webhooks/stripe`), keeping the existing ones:
`checkout.session.completed`, `checkout.session.expired` (new), `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `charge.refunded`, `charge.refund.updated`, `charge.dispute.created`, `charge.dispute.closed` (new).
Do not change any other application's endpoint. The signing secret stays in Secrets Manager.

## 5. Customer portal

Create FlacronCV's own portal configuration (only FlacronCV prices; no mid-period downgrades) and set `STRIPE_PORTAL_CONFIGURATION_ID`. Without it the API now refuses portal sessions instead of using the shared account default.

## 6. Deploy order

1. Merge reviewed branch → main (CI green).
2. API (ECS) deploys first with the new env; web (Amplify) after.
3. Watch logs for `app_mismatch`, `unattributed`, `ADDON_UNAVAILABLE`, `PORTAL_NOT_CONFIGURED` for 24 h.
4. Reconcile: admin revenue report vs Stripe Dashboard for FlacronCV-tagged payments (gross and refunds; fees are not in the ledger).

## 7. Rollback

- Code: redeploy the previous ECS task definition / Amplify build (no data migration is involved; new Firestore fields are additive: `checkout_coordination`, `billing_disputes`, `subscription.stripeStateAt`).
- Selling: unset the `STRIPE_PRICE_*` variables → plans show "Coming soon", packs "Not on sale"; existing subscriptions keep renewing.
- Webhook: the two new events are harmless to an older build (acknowledged, not applied).
- Never delete or archive Stripe objects as a rollback step; never touch other applications' objects.
