# Remaining integrations: credentials, permissions and costs (web + mobile)

Prepared 2 Nov 2026 on branch `integration/v2-features`. Prices and rules were checked on official pages on **2 Nov 2026**; links are listed per item. Estimates are **illustrations under stated usage assumptions**, not quotes; usage-based services have no fixed monthly price. Nothing here was configured, purchased or called: no provider was contacted from this environment.

**How to share secrets:** never by chat, email or ticket. Prefer a **role or invitation instead of a secret** wherever this list says so. When a secret is unavoidable, the owner stores it directly in AWS Secrets Manager / SSM Parameter Store (SecureString) in the production account, or shares it once through a password manager vault item (1Password/Bitwarden) restricted to the deployer; we reference it by name only.

**Status legend**
- **Ready – needs credentials**: code is implemented and tested with mocks; only configuration is missing.
- **Missing implementation**: no live adapter exists yet; credentials alone will not enable it.
- **Disabled by design**: built, deliberately off until a decision.
- **Commercial decision**: blocked on a business choice, not on engineering.

**Launch impact:** *Core* = needed to launch the integrated website with sellable career tools. *Optional* = only that feature stays unavailable (it is labelled unavailable in the product).

## A. Summary

| # | Feature / purpose | Provider (R = recommendation) | Status | Config names read by the code | Launch impact | Platform |
|---|---|---|---|---|---|---|
| 1 | Career service database + worker queue | AWS RDS PostgreSQL (R) | Ready – needs provisioning | `DATABASE_URL`, `PGBOSS_SCHEMA` | Core | Shared |
| 2 | Career API + worker hosting | AWS ECS Fargate beside V1 (R) | Ready – needs provisioning | `PORT`, `NODE_ENV`, `DEPLOY_ENV`, `CORS_ORIGINS` | Core | Shared |
| 3 | Read V1 accounts/job tracker (Firestore) | Google Firebase (existing project `flacron-cv`) | Ready – needs a read-only role | `FIREBASE_PROJECT_ID`, `V1_ACCOUNT_SOURCE`; only if no workload identity: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Core | Shared |
| 4 | Career operators | Firebase uids (no secret) | Ready – needs values | `ADMIN_AUTH_USER_IDS` | Core (moderation) | Web |
| 5 | Career add-on payments | Stripe (existing V1 account) | Ready – needs 3–6 Prices | V1 API: `CAREER_BILLING_MODE`, `CAREER_STRIPE_PRICES` (+ existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) | Core (to sell) | Web |
| 6 | AI drafting, import, tailoring, letters, text interviews | OpenAI | Ready – needs key | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, optional `OPENAI_TEXT_MODEL` (V1: `OPENAI_MODEL`; default `gpt-4o-mini`) | Core (main value of the add-on) | Shared |
| 7 | Evidence files, exports storage | AWS S3 (R) | Ready – needs bucket + role | `OBJECT_STORAGE=s3`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_PREFIX`, `OBJECT_STORAGE_KMS_KEY_ID`, `EVIDENCE_UPLOAD_MAX_BYTES` (local only: `OBJECT_STORAGE_DIR`, `OBJECT_STORAGE_SECRET`) | Core if evidence is switched on; else Optional | Shared |
| 8 | Malware scan of uploads | GuardDuty Malware Protection for S3 (R) | Missing implementation | — | Recommended before evidence goes live | Shared |
| 9 | Career email (alerts, notices) | Amazon SES (existing V1 identity) | Ready – needs role/identity | `MAIL_DELIVERY`, `SES_REGION`, `SES_FROM_EMAIL`, `SES_FROM_NAME`, `SES_REPLY_TO`, `MAIL_ALLOWED_RECIPIENTS`; keys only if no role: `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY` | Optional (in-app alerts work) | Shared |
| 10 | Geocoding (relocation, map list) | Google Maps Geocoding API | Ready – needs key | `GEOCODING_PROVIDER=google`, `GEOCODING_API_KEY` | Optional | Shared |
| 11 | Map tiles | Google Maps JavaScript (R) | Missing implementation | — | Optional (list fallback works) | Web |
| 12 | Speech transcription (voice practice) | OpenAI `gpt-transcribe` (R) | Missing implementation | — | Optional (typed practice works) | Shared |
| 13 | Licensed job feeds | Adzuna / USAJOBS / Greenhouse / Lever (R) | Missing implementation (parsers only) + licensing | — | Optional (pasted adverts work) | Shared |
| 14 | Career push notifications | Expo Push + FCM + APNs (V1 already sends via Expo) | Missing implementation for career alerts | V1 mobile: existing Expo setup | Optional | Mobile |
| 15 | Telegram alerts | Telegram Bot API | Missing implementation (preference flag only) | — | Optional | Shared |
| 16 | Career purchase in the apps | Apple In-App Purchase / Google Play Billing | Missing implementation + **commercial decision** | V1 API already reads `APPLE_*`, `GOOGLE_*` for Pro/Enterprise; career needs new product IDs | Optional for web launch; **blocks enabling career on iOS** (§B) | Mobile |
| 17 | Browser extension (form filling) | Chrome Web Store / Edge Add-ons / Firefox AMO | Ready (unpacked) – publication accounts optional | extension host permissions | Optional | Web (desktop) |
| 18 | Mobile signing and store release | Apple Developer / Google Play Console (existing) + EAS | Existing V1 process | `EXPO_PUBLIC_CAREER_API_URL`, `EXPO_PUBLIC_CAREER_ENABLED` | Optional (career off in apps by default) | Mobile |
| 19 | Web build switches | — (public config) | Ready | `NEXT_PUBLIC_CAREER_ENABLED`, `NEXT_PUBLIC_CAREER_API_URL` | Core | Web |

Plan mapping (`CAREER_PLAN_MAP`) is a commercial setting, empty by default (no V1 plan includes career access).

## B. Details per integration

### 1–2. Hosting: RDS PostgreSQL + Fargate (recommendation)
- **Implemented:** career API (`apps/career-api`), worker (`apps/career-worker`, pg-boss), 36 migrations with status/dry-run tooling (rehearsed locally).
- **Needs:** a Postgres 16+ database and two containers next to V1; `/api/career/*` routed on the existing load balancer. **Credential:** `DATABASE_URL` stored in Secrets Manager; the containers get it via their task definition. No human needs the password.
- **Reuse:** V1's VPC, cluster, load balancer and logging can be reused; the database must be separate (V1 has none).
- **Test vs prod:** a staging database first; run `migrate:status` → `migrate:dry-run` → `migrate`.
- **Cost (AWS Price List, us-east-1, checked 2 Nov 2026):** db.t4g.small Multi-AZ $0.065/h + gp3 $0.23/GB-month → ~**$52/month** with 20 GB; Fargate API 0.5 vCPU/1 GB + worker 0.25 vCPU/0.5 GB (x86 $0.04048/vCPU-h, $0.004445/GB-h) → ~**$27/month**, excluding load balancer/NAT if not already present. Sources: https://aws.amazon.com/rds/postgresql/pricing/ , https://aws.amazon.com/fargate/pricing/

### 3. Firebase / Firestore read access
- **Implemented:** V1 plan bridge reads `users/{uid}` and `job_applications` read-only; token verification uses the project id. The career service never deletes sign-ins (V1 keeps that).
- **Minimum permission:** read-only Firestore on project `flacron-cv`: role **Cloud Datastore Viewer** (`roles/datastore.viewer`). Prefer **Workload Identity Federation from AWS** (no key file). Only if that is not possible: a dedicated service account key with that role alone (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
- **Do not reuse** V1's admin service-account key (it has write access; a V1 key is also listed as an open rotation incident). **Cost:** reads within existing Firestore billing (negligible).

### 4. Operators
`ADMIN_AUTH_USER_IDS` = Firebase uids of staff who already have V1 `admin`/`super_admin`. Not a secret; send the list of staff names and we look up the uids.

### 5. Stripe — career add-on
- **Implemented:** checkout on the V1 customer, webhook routing, idempotent state, refunds, cancellation, failure, account closure (154 tests with mocked Stripe). **Ask:** the client creates, in the existing Stripe account, a Product "FlacronCV Career" with **USD recurring Prices exactly per catalog** — Starter $21.99/mo, $219.90/yr; Professional $38.99/mo, $389.90/yr; Career Pro $68.99/mo, $689.90/yr — no trial. Send the **price IDs** (not secret). Then set `CAREER_STRIPE_PRICES=starter:month=price_…,starter:year=price_…,…` and `CAREER_BILLING_MODE=addon`.
- **Webhook:** reuse V1's existing endpoint and secret; make sure it receives `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. **No new key needed.** If V1 uses a restricted key, it additionally needs Checkout Sessions: Write, Prices: Read, Subscriptions: Write (labels to confirm in the Dashboard form).
- **Test vs prod:** create the same Prices in a Stripe sandbox first (test price IDs differ from live).
- **Cost:** 2.9% + 30¢ per US card charge plus Stripe Billing 0.7% (https://stripe.com/pricing , https://stripe.com/billing/pricing). Example: 1,000 Professional monthly charges ($38,990) ≈ **$1,704** in fees.

### 6. OpenAI
- **Implemented:** `AI_PROVIDER=openai` + `OPENAI_API_KEY`; failures release reserved credits (verified). **Credential:** a **project service-account key**, separate projects for staging and production, with a project budget. **Minimum permission:** restricted key with model requests only (Chat Completions/Responses; Audio if #12 is built), everything else None (exact UI labels unverified: OpenAI's help page returned 403).
- **Reuse:** V1's key could work technically, but a separate project gives separate spend limits and revocation — recommended.
- **Action needed:** OpenAI lists `gpt-4o-mini-2024-07-18` (the only snapshot behind the `gpt-4o-mini` alias both adapters use) for **shutdown on 14 Jan 2027**, replacement `gpt-6-luna` (https://developers.openai.com/api/docs/deprecations, checked 3 Nov 2026). The model is now configurable (`OPENAI_MODEL` for V1, `OPENAI_TEXT_MODEL` for career); test the replacement with a real key before switching.
- **Cost (https://developers.openai.com/api/docs/pricing):** gpt-4o-mini $0.15 in / $0.60 out per 1M tokens. Assumption: 1,000 active users × (10 drafts + 5 imports + 2 interviews) ≈ 47M in / 19.3M out tokens → **≈ $19/month**. Data: API data not used for training; up to 30 days abuse-monitoring retention (https://developers.openai.com/api/docs/guides/your-data).

### 7–8. S3 storage and malware scanning
- **Implemented:** S3 adapter (presigned owner downloads, quotas, cleanup; covered by mocked tests), private bucket expected. **Minimum permission (task role, no keys):** `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/PREFIX/*`; `s3:ListBucket` limited to `PREFIX/*`; `kms:GenerateDataKey`/`kms:Decrypt` only with SSE-KMS. Block Public Access on.
- **Reuse:** a new private bucket (or a dedicated prefix) is safer than V1's Firebase Storage bucket.
- **Cost (AWS Price List, 2 Nov 2026):** $0.023/GB-month, $0.005 per 1k PUT, $0.0004 per 1k GET; 200 GB + 50k PUT + 500k GET → **≈ $5/month** (+ up to $9 egress beyond the free 100 GB).
- **Malware scanning — missing implementation.** Recommendation: GuardDuty Malware Protection for S3 ($0.09/GB scanned + $0.215 per 1k objects after 1 GB/1k free; ≈ **$15/month** for 50k files of 1 MB). Uploads are already size/type-limited; scanning should be added before evidence uploads are opened publicly. Source: https://aws.amazon.com/guardduty/pricing/

### 9. Amazon SES (career mail)
- **Implemented:** SES mailer; without configuration mail is recorded, not sent. **Reuse:** V1's verified domain identity and sender. **Minimum permission:** task role with `ses:SendEmail`/`ses:SendRawEmail` on the identity ARN, condition `ses:FromAddress` = the sender. `MAIL_ALLOWED_RECIPIENTS` restricts staging.
- **Cost:** $0.10 per 1,000 emails (https://aws.amazon.com/ses/pricing/); 30,000/month ≈ **$3**.

### 10–11. Google Maps
- **Geocoding (implemented):** server key restricted to **Geocoding API** and by **IP address** (needs a fixed egress IP, e.g. NAT Elastic IP). Billing must be enabled on the Google Cloud project.
- **Map tiles: missing implementation** (the map view shows the list fallback). If built: a separate browser key restricted to Maps JavaScript API and the site's HTTP referrers.
- **Cost (https://developers.google.com/maps/billing-and-pricing/pricing):** Geocoding $5 per 1k after 10k free events/month; Dynamic Maps $7 per 1k after 10k free. 3k geocodes + 6k map loads → **$0**.

### 12. Speech transcription — missing implementation
Only an "unconfigured" adapter exists. Recommendation: OpenAI `gpt-transcribe` ($0.0045/min; the older `gpt-4o-*-transcribe`/`whisper-1` shut down 26 Feb 2027). 15,000 min/month ≈ **$68**. Decision + build needed; the same OpenAI project key could be used.

### 13. Licensed job feeds — missing implementation + licensing
Parsers exist for Adzuna, USAJOBS, Greenhouse, Lever; no live loader. Licensing (checked 2 Nov 2026): **Adzuna** free tier is evaluation-only; revenue-generating use needs a paid licence and "Adzuna" attribution on each ad (https://developer.adzuna.com/docs/terms_of_service). **USAJOBS** commercial use allowed with an API key and registered User-Agent email (https://developer.usajobs.gov/guides/terms-of-service). **Greenhouse/Lever** public board GETs need no key, but each employer's board terms apply. **O*NET** needs permission for paid apps. Commercial decision first.

### 14. Push notifications (mobile)
V1 mobile already registers Expo push tokens with V1 and V1 sends via Expo (job reminders). **Career alerts are not sent by push** (career `/push-tokens` not served). Building it needs no new provider. For store builds the existing Expo project needs its FCM V1 credentials and APNs key (Account Holder/Admin creates the .p8; upload to EAS — never by chat). Expo push, FCM and APNs: **$0** (https://docs.expo.dev/push-notifications/faq/ , https://firebase.google.com/pricing).

### 15. Telegram — missing implementation
Only a "telegram" preference flag exists. If wanted: a bot token from @BotFather (secret), webhook with `secret_token`; Bot API messaging is free (https://core.telegram.org/bots/faq).

### 16. Mobile purchases of the career add-on — missing implementation + decision
- **Store rules (official pages, re-checked 3 Nov 2026; guidelines last updated 16 Oct 2026):** FlacronCV is not a Reader app (3.1.3(a)) or a free companion app (3.1.3(f)); under 3.1.3(b) it may unlock web-bought subscriptions "provided those items are also available as in-app purchases within the app", and that condition applies on every storefront including the US; outside the US storefront no buttons/links/calls to action to other purchase methods (3.1.1(a), 3.1.3) (https://developer.apple.com/app-store/review/guidelines/). Google Play: apps "may not lead users to a payment method other than Google Play's billing system" outside the US External Content Links programme (https://support.google.com/googleplay/android-developer/answer/9858738 , …/16470497).
- **Current app:** career tools off by default; when on, status only (no price, button or link). Existing Pro/Enterprise store purchases unchanged.
- **To offer it in-app:** Apple auto-renewable subscription(s) in a separate subscription group + App Store Server API key (In-App Purchase key, Account Holder/Admin creates it; `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID` already exist for V1 and can be reused) + Server Notifications V2; Google subscription + base plans, the existing Play service account (`GOOGLE_PLAY_CLIENT_EMAIL`/`GOOGLE_PLAY_PRIVATE_KEY`, "View financial data" + "Manage orders and subscriptions") and RTDN (existing `GOOGLE_RTDN_*`). Only **product IDs** are new; no new secret. Then build career store verification + a merge rule with Stripe.
- **Fees:** Apple 15% (Small Business Program) or 30% → 15% after a year for subscriptions; Google 15% on auto-renewing subscriptions (US/UK/EEA structure since 30 Jun 2026: 10% + 5% billing fee — table partly garbled, recheck). Sources: https://developer.apple.com/app-store/subscriptions/ , https://support.google.com/googleplay/android-developer/answer/112622

### 17. Browser extension distribution (optional)
Works unpacked locally. Publishing needs store accounts: Chrome Web Store one-time registration fee (amount not stated on the official page), Edge Add-ons no fee, Firefox AMO no fee. **Invitation, not secret:** add our account as a publisher/collaborator. Not required for launch.

### 18. Mobile signing and release
Use V1's existing Apple Developer (US$99/yr) and Google Play (US$25 once) accounts and EAS project; no new signing keys. Invite rather than share credentials. Career stays off in store builds until §16 is decided. **Not done here:** no device/emulator, Android SDK or Xcode was available, so no installable app was built (a local Android JavaScript bundle was produced to prove it compiles).

## C. Assumptions behind estimates
1,000 monthly active career users; per user/month: 10 AI drafts (1.5k in/0.7k out tokens), 5 imports (4k/1.5k), 2 interviews (6 calls × 1k/0.4k), 15 audio minutes, 3 geocodes, 6 map loads, 30 emails, 20 pushes; 200 GB stored, 50k uploads, 500k downloads; 1,000 Stripe charges at $38.99, US cards; on-demand AWS prices in us-east-1; no discounts or free credits unless stated.

## D. Could not verify (2 Nov 2026)
OpenAI restricted-key UI labels (help page 403); CareerOneStop terms (site 403); Chrome Web Store fee amount; Identity Platform prices above 50k MAU; exact Stripe restricted-key labels; Google Play fee table (garbled); Apple's enforcement of 3.1.3(b) for an add-on; App Store Server API host names.
