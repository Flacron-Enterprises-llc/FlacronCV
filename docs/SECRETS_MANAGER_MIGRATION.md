# Plan: move FlacronCV API credentials from ECS task-definition variables into Secrets Manager

Status: **plan only — not performed.** Prepared 17 Nov 2026 from a read-only look at the live service: `flacroncv-production/flacroncv-api` on revision `flacroncv-api:89`, account 482881544977, region us-east-1.

## 1. Current state and why rotation is required

- **No `secrets` block.** Every credential is a plaintext `environment` entry, so anyone with `ecs:DescribeTaskDefinition` can read it.
- **The values are in every revision.** All **89 revisions** are ACTIVE and contain these values. Deregistering a revision does not hide it: INACTIVE revisions can still be described.
- **So migration alone is not enough.** Moving the values hides them from future revisions only. **Every credential below must be rotated** after the move.
- **The task role has an unusual policy.** `flacroncv-ses-service-role` has `AmazonSESFullAccess` and **`AWSCompromisedKeyQuarantineV3`** attached. AWS attaches that quarantine policy after detecting an exposed key. Before any change, the account owner should confirm why it is there and whether it still applies.

Credentials currently in plaintext (names only):

| Variable | Kind | Rotation method |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe API key | create the restricted `flacroncv-live-app` key (deployment review §5.1), then expire the old key |
| `STRIPE_WEBHOOK_SECRET` | Stripe signing secret | roll the endpoint secret in the Dashboard; Stripe keeps the old one valid for an overlap window you choose |
| `FIREBASE_PRIVATE_KEY` (+ `FIREBASE_CLIENT_EMAIL`) | service-account key | create a new key for the same service account, deploy it, then delete the old key |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | IAM user keys | **remove**: the mail service falls back to the task role (`flacroncv-ses-service-role`) when they are unset; then deactivate and delete the keys |
| `OPENAI_API_KEY`, `WATSONX_API_KEY`, `BREVO_API_KEY` | vendor keys | new key in each vendor console, then revoke the old one |
| `APPLE_PRIVATE_KEY`, `GOOGLE_PLAY_PRIVATE_KEY` | store-API keys | new App Store Connect key / new Play service-account key, then revoke the old one |

Not secret, so they stay in `environment`: price ids, `STRIPE_PORTAL_CONFIGURATION_ID`, `APP_ID`, URLs, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_BUNDLE_ID`, product ids, `SES_*`, `BREVO_*` template and sender settings, `PORT`, `NODE_ENV`, `AWS_REGION`.

## 2. Target design

1. **One secret,** `flacroncv/production/api`: a JSON object with one key per credential, tagged `app=flacroncv`. Encrypt it with the default `aws/secretsmanager` key, or with a FlacronCV customer-managed KMS key if the account standard requires one.
2. **A FlacronCV-only execution role,** `flacroncv-api-execution`. Do not edit the shared `ecsTaskExecutionRole`, because other applications use it and its `allow_secret_read` policy could not be reviewed with the current access. Policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
         "Resource": "arn:aws:secretsmanager:us-east-1:482881544977:secret:flacroncv/production/api-*" },
       { "Effect": "Allow", "Action": "kms:Decrypt", "Resource": "<CMK arn, only if a customer-managed key is used>",
         "Condition": { "StringEquals": { "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com" } } }
     ]
   }
   ```
   Also attach the managed `AmazonECSTaskExecutionRolePolicy` for image pull and logs.
3. **Pass-role permission.** The CodePipeline service role and the deploying operator need `iam:PassRole` on `flacroncv-api-execution`. Without it, the pipeline's ECS deploy action fails.
4. **The task definition** references each key:
   ```json
   "secrets": [
     { "name": "STRIPE_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:482881544977:secret:flacroncv/production/api-XXXXXX:STRIPE_SECRET_KEY::" }
   ]
   ```
   Repeat for each credential, and remove those names from `environment`. The pipeline's ECS deploy action copies the service's current revision and swaps only the image, so the `secrets` block carries forward on later pushes.
5. **No AWS keys at all.** The task role supplies SES access.

## 3. Order of work

The move and the rotation are separate deployments, so each can be verified and rolled back.

**Phase A — move, same values (no behaviour change)**
1. Create the secret with the **current** values. An operator copies them from the console; they never appear in tickets or chat.
2. Create `flacroncv-api-execution` and grant the pass-role permission.
3. Register a new revision: the same image, the new execution role, `secrets` for each credential, and those names removed from `environment`. Keep `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for now.
4. Update the service to that revision. The circuit breaker with rollback is already enabled.
5. Verify:
   - the service is 1/1 healthy and `/api/v1/plans` returns 200;
   - a test email sends;
   - a Stripe webhook delivery succeeds (Dashboard → resend a recent event);
   - `describe-task-definition` shows no credential values.
6. Roll back by setting the service to `:89`. That revision still holds the same, unrotated values.

**Phase B — remove the AWS keys**
1. Confirm the task role has SES send permission and that the quarantine policy doesn't block `ses:SendEmail`.
2. Register a new revision without the two AWS variables, deploy it, and send a test email.
3. Deactivate the IAM user's access key, wait 24 h, then delete it.

**Phase C — rotate, one credential per deployment.** After each, check health and the feature that uses the credential.

| Order | Credential | Steps |
|---|---|---|
| 1 | Stripe app key | Create the restricted `flacroncv-live-app` key, put it in the secret, and force a new deployment (secrets are read when a task starts). Run a staff checkout and a portal session. Then expire the old key in the Dashboard. |
| 2 | Stripe webhook secret | Roll it in the Dashboard with an overlap of 24 h or more. Put the new value in the secret and force a new deployment. Watch the next deliveries succeed. |
| 3 | Firebase service account | Create a new key, update the secret, deploy, and check sign-in and Firestore reads. Then delete the old key in Google Cloud IAM. |
| 4–7 | OpenAI, watsonx, Brevo, Apple and Google Play keys | The same pattern, one at a time. Check AI generation, mail, and store receipt validation. |

**Phase D — clean up**
- Deregister the old revisions once no rollback target needs them. They remain describable, which is why Phase C comes first.
- Record the secret ARN and its rotation dates in the runbook.

## 4. Rollback rules

- **Before Phase C:** roll back to `:89` or to the Phase A revision.
- **After a credential is rotated:** a rollback must target a revision that reads **the secret**. The old revisions hold revoked values and would fail.
- **Never expire or delete an old credential** until the new one has served live traffic successfully.
- **Never edit** the shared `ecsTaskExecutionRole`, or any other application's secrets, roles or task definitions.

## 5. Out of scope here

- Moving other applications' secrets.
- The web build: Amplify variables are public `NEXT_PUBLIC_*` values, except `NEXT_GEMINI_API_KEY` and `NEXT_MAKE_WEBHOOK_URL`. Review those two separately, since a value baked into a client bundle is public.
