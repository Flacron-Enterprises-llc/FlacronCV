# Client hand-off drafts (not sent)

Drafts for review. Nothing below has been sent to the client or to Umer.

## 1. Short message (draft)

> Hi — here is what we need from you (or Umer) to switch on the remaining integrations. Please **do not send keys or passwords by chat or email**: where a secret is needed, add it yourself to AWS Secrets Manager in the production account (or to a shared password-manager item for the deployer) and tell us its name. Most items below are an invitation, a role or an ID, not a secret.
>
> **To start selling the Career add-on (website):**
> 1. In Stripe, create the Career prices exactly as in the catalog (USD, no trial): Starter $21.99/month and $219.90/year; Professional $38.99/month and $389.90/year; Career Pro $68.99/month and $689.90/year. Send us the six **price IDs** (they are not secret). We reuse the existing Stripe webhook; please confirm it also sends `checkout.session.expired` and `charge.refunded`.
> 2. Approve hosting for the career service (a small Postgres database and two containers beside the current site; roughly $80/month on AWS on-demand prices) and give our deploy role access to it.
> 3. In Google Cloud (project `flacron-cv`), grant **read-only Firestore** (Cloud Datastore Viewer) to the career service — ideally through workload identity from AWS, so no key file is needed.
> 4. An **OpenAI** project for FlacronCV Career with a budget limit; store its service-account key in Secrets Manager. (Note: OpenAI shuts down the model snapshot we use on 14 Jan 2027; the model is now a setting, and we will test and switch before then.)
> 5. Names of the staff who should moderate career content (we look up their accounts).
>
> **Optional, can come later:** a private S3 bucket + role for evidence files (and malware scanning), SES sending role reuse for career emails, a Google Maps geocoding key restricted to our server IP, a speech-to-text choice, licensed job feeds (Adzuna requires a paid commercial licence), Telegram, browser-extension store accounts, and Career subscriptions in the App Store / Google Play.
>
> **Mobile apps:** the Career tools are built into the app but stay switched off. Apple’s rule for apps like ours (guideline 3.1.3(b), all storefronts including the US) allows unlocking a subscription bought on the website only if it can also be bought in the app, so please decide whether we should add Career in-app subscriptions (see the decisions list).
>
> The full checklist with permissions, costs and official links is in `docs/INTEGRATION_CREDENTIALS_CHECKLIST.md`.

## 2. What the client or Umer must provide (one line each)

| # | Item | Type | Who |
|---|---|---|---|
| 1 | Six Stripe price IDs for Career (catalog prices, USD, no trial) | IDs (not secret) | Client (Stripe owner) |
| 2 | Confirm the existing Stripe webhook includes `checkout.session.expired`, `charge.refunded` | Setting | Client/Umer |
| 3 | Hosting approval + RDS/Fargate access for the deploy role | Approval + IAM role | Umer |
| 4 | Read-only Firestore for the career service (workload identity preferred) | Role | Umer |
| 5 | OpenAI project + service-account key in Secrets Manager | Secret (stored by owner) | Client |
| 6 | List of career moderators | Names | Client |
| 7 | (Optional) S3 bucket + task role; GuardDuty malware protection | Role | Umer |
| 8 | (Optional) SES: allow the career service's role to send from the existing identity | Role | Umer |
| 9 | (Optional) Google Maps geocoding key, IP-restricted | Secret (stored by owner) | Client |
| 10 | (Optional) App Store / Play Career products, if decided | Product IDs | Client |
| 11 | (Optional) Browser-extension store: add us as collaborator | Invitation | Client |

## 3. Unresolved commercial decisions (separate list)

1. **Career in the mobile apps.** Add Career auto-renewing subscriptions to the App Store and Google Play (prices, whether store prices differ from web because of store fees), or keep Career off in the apps. Until decided, the apps show no Career purchase and Career stays off in store builds.
2. **V1 plan bundling (`CAREER_PLAN_MAP`).** Should any existing V1 plan include a Career plan (for example Enterprise → Career Pro)? Currently none does.
3. **Credits.** Career credits are separate from V1 AI credits (implemented). Confirm that customers should never be able to spend one for the other.
4. **Trials and promotions.** The V2 catalog mentions a 7-day trial for Professional; it is **not** applied. Decide whether to offer it, and any discounts or coupons.
5. **Refunds, proration and plan changes** for the Career add-on beyond V1's current rules (full refund ends access; partial changes nothing).
6. **Closed offers:** Business plan, credit packs and extra capacity, human review bookings, employer/recruiting checkout, the $4.99 maintenance offer, developer API packages, SSO. All stay closed until priced and defined.
7. **Job feeds.** Whether to license a commercial job feed (Adzuna requires a paid licence for revenue-generating products; O*NET needs permission for paid apps).
8. **Speech transcription and map tiles.** Whether to build voice transcription (vendor choice) and an interactive map; both are optional and unbuilt.
9. **Job Tracker fields.** Whether to add V2's extra pipeline fields (deadline, checklist) to the V1 Job Tracker (D8).
10. **Data export format.** One combined personal-data file or the current two downloads (V1 + career) (D9).
11. **Hosting budget** for the career service and optional services (estimates in the checklist).
