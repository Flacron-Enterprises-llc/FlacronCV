# Access request: read-only verification of FlacronCV live billing

**Purpose.** Before any live change, confirm which Stripe account the live FlacronCV API uses, its webhook, the legacy Pro/Enterprise prices and subscribers, and the running API image. Everything below is **read-only**: nothing is created, changed or deleted in Stripe, AWS or Firebase, and no live catalog or deployment is prepared until this is verified.

## 1. Preferred: a separate live **read-only** Stripe key (not the production API secret)
In the Stripe Dashboard of the account whose **Developers → Webhooks** lists an endpoint for `https://api.flacroncv.com/api/v1/webhooks/stripe` (live mode):

Developers → API keys → **Create restricted key**, name `flacroncv-live-readonly`:

| Permission | Level | Used to verify |
|---|---|---|
| Webhook Endpoints | **Read** | the registered endpoint and its enabled events |
| Customers | **Read** | that sampled FlacronCV customers exist in this account |
| Subscriptions | **Read** | subscriber counts per legacy price; sampled subscriptions |
| Prices | **Read** | the four legacy prices (amount, interval, active) |
| Products | **Read** | the legacy products |
| Everything else, **including Balance** | **None** | Balance must stay None: Stripe's refusal names the account the key belongs to |

After saving, re-open the key and confirm the list (edits have silently dropped permissions before).

**Storing it privately — never in chat, email, tickets or Git:**
- On the engineer's machine, create `C:\Users\win 11\FlacronCV-integration-local\stripe-live-readonly.env` (outside the repository) containing one line `STRIPE_LIVE_READONLY_KEY=rk_live_…`, save, and close the editor tab. Or share it once through a password-manager item restricted to the engineer.
- **Delete the key** in the Dashboard as soon as the verification report is done.

## 2. Minimum AWS read access (account `482881544977`, region `us-east-1`)
A read-only SSO role or IAM user with only:

| Action | Resource | Used to verify |
|---|---|---|
| `ecs:DescribeServices` | `service/flacroncv-production/flacroncv-api` | the running task definition |
| `ecs:DescribeTaskDefinition` | `task-definition/flacroncv-api:*` | the running image tag and the four legacy price ids |
| `ecr:DescribeImages` | `repository/flacroncv-api` | the image's push date and tag |

**Not needed:** `secretsmanager:GetSecretValue` or any write permission. The live API key itself is never read.

## 3. Minimum Firestore read access
**Cloud Datastore Viewer** (`roles/datastore.viewer`) on project `flacron-cv` for the person running the sample, used through their own login (`gcloud auth application-default login`). Only three users' stored Stripe customer and subscription ids are read; names and emails are not.

## 4. If AWS or Firestore access cannot be granted: the owner runs it
Everything below is read-only and prints no keys or personal information. The output can be shared as is.

**4a. Running image and legacy price ids (AWS CLI, owner's own login):**
```bash
TD=$(aws ecs describe-services --region us-east-1 --cluster flacroncv-production --services flacroncv-api \
     --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --region us-east-1 --task-definition "$TD" \
  --query 'taskDefinition.{taskDefinition:taskDefinitionArn, image:containerDefinitions[0].image,
           legacyPrices:containerDefinitions[0].environment[?contains(name, `_PRICE_ID`)],
           envNames:containerDefinitions[0].environment[].name,
           secretNames:containerDefinitions[0].secrets[].name}'
```
This prints the image, the price ids (not secrets), and only the **names** of other variables and secrets.

**4b. Stripe account, webhook, legacy prices and three subscribers (from the repository):**
```bash
cd apps/api
gcloud auth application-default login            # only for the Firestore sample
node scripts/verify-live-billing.mjs --key-file=PATH\stripe-live-readonly.env \
  --prices=<the four ids from 4a> --expected-account=<acct_… from your Dashboard URL> --firestore
```
The script sends **only GET requests** to Stripe and reads only three Stripe-id fields from Firestore. It refuses unrestricted, test, and Balance-readable keys, and prints:
- the account id **as stated by Stripe**;
- the endpoint URL and enabled events, plus which events the new code still needs;
- each legacy price with its subscriber counts by status;
- for three sampled subscribers, only shortened ids and whether they are found in this account.

It ends with **ACCOUNT VERIFIED** only if all of these agree:
- Stripe's statement of the key's account;
- the Dashboard account id;
- the webhook endpoint;
- the deployed prices;
- the customers and subscriptions stored by the live API.

Otherwise it ends with **STOP** (or **INCOMPLETE** if a check was skipped). The script cannot test write permissions without writing, so confirm in the Dashboard that every permission on the key is Read or None.

## 5. What happens after
The results decide the account. If any check points to a second Stripe account, everything stops for a separate, approved plan; existing subscribers are never moved, cancelled or re-priced. Only after verification: review of the live catalog variant, the live FlacronCV key, webhook events and portal configuration (see `docs/STRIPE_DEPLOYMENT_REVIEW.md`). The Professional trial stays exactly as implemented.
