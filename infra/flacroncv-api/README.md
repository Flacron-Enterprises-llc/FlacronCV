# FlacronCV API: move credentials to Secrets Manager and stop using FlacronAI's AWS key

**Prepared, not executed.** This is the runbook for `docs/SECRETS_MANAGER_MIGRATION.md`, phases A and B in one revision.
- **Run it as:** an operator with IAM and ECS rights in account `482881544977`, region `us-east-1`.
- **FlacronCV only:** it creates FlacronCV roles and one FlacronCV secret. It never edits `flacronai-ses`, FlacronAI's key, the shared `ecsTaskExecutionRole`, or any other application's resources.

## Why
- Revision `flacroncv-api:89` holds every credential as a plaintext variable.
- Its `AWS_ACCESS_KEY_ID` (`…MK5P`) belongs to the IAM user **`flacronai-ses`**, which is FlacronAI's. AWS flagged that key as exposed on 15 Aug 2026.
- The existing task role `flacroncv-ses-service-role` has `AWSCompromisedKeyQuarantineV3` attached, so it is **not used**. A new, clean FlacronCV task role replaces it.

## Files
| File | Purpose |
|---|---|
| `execution-role-trust.json`, `task-role-trust.json` | ECS tasks may assume the roles (this account only) |
| `execution-role-secrets-policy.json` | the execution role may read only `flacroncv/production/api-*` |
| `task-role-ses-policy.json` | the task role may send only as FlacronCV's sender. **Fill in** the identity ARN and From address first. |
| `apps/api/scripts/ecs-secrets-task-definition.ts` | builds the register-ready revision; fails closed on any unclassified credential |

## Steps (bash, `--profile flacroncv-production`)
```bash
export AWS_PROFILE=flacroncv-production AWS_REGION=us-east-1
cd infra/flacroncv-api

# 1. Roles (FlacronCV-owned)
aws iam create-role --role-name flacroncv-api-execution --assume-role-policy-document file://execution-role-trust.json --tags Key=app,Value=flacroncv
aws iam attach-role-policy --role-name flacroncv-api-execution --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name flacroncv-api-execution --policy-name read-flacroncv-api-secret --policy-document file://execution-role-secrets-policy.json
aws iam create-role --role-name flacroncv-api-task --assume-role-policy-document file://task-role-trust.json --tags Key=app,Value=flacroncv
aws iam put-role-policy --role-name flacroncv-api-task --policy-name send-as-flacroncv --policy-document file://task-role-ses-policy.json
#    The CodePipeline service role needs iam:PassRole on both roles, or the pipeline's ECS deploy fails.

# 2. Private working copy of the current revision (contains secrets: keep it outside Git, delete it at step 5)
PRIV="$HOME/flacroncv-secrets-work"; mkdir -p "$PRIV" && chmod 700 "$PRIV"
aws ecs describe-task-definition --task-definition flacroncv-api:89 --output json > "$PRIV/td-89.json"

# 3. The secret (same values as today: no behaviour change yet)
aws secretsmanager create-secret --name flacroncv/production/api --tags Key=app,Value=flacroncv --query ARN --output text
#    → copy the printed ARN (it ends in -XXXXXX) into SECRET_ARN
SECRET_ARN=...
npx ts-node --transpile-only ../../apps/api/scripts/ecs-secrets-task-definition.ts --from="$PRIV/td-89.json" \
  --secret-arn="$SECRET_ARN" \
  --execution-role-arn=arn:aws:iam::482881544977:role/flacroncv-api-execution \
  --task-role-arn=arn:aws:iam::482881544977:role/flacroncv-api-task \
  --register-out="$PRIV/td-new.json" --payload-out="$PRIV/secret.json"
aws secretsmanager put-secret-value --secret-id "$SECRET_ARN" --secret-string "file://$PRIV/secret.json"

# 4. Register and deploy (the circuit breaker with rollback is enabled on the service)
aws ecs register-task-definition --cli-input-json "file://$PRIV/td-new.json" --query taskDefinition.revision
aws ecs update-service --cluster flacroncv-production --service flacroncv-api --task-definition flacroncv-api:<new revision>
aws ecs wait services-stable --cluster flacroncv-production --services flacroncv-api

# 5. Clean up the private copies
rm -f "$PRIV/td-89.json" "$PRIV/secret.json"
```

## Verify after step 4
- The service shows 1/1 running on the new revision, and `GET https://api.flacroncv.com/api/v1/plans` returns 200.
- `describe-task-definition` of the new revision: `secrets` lists the 8 names; `environment` has no credential values and no `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.
- One verification or password-reset email is delivered (SES now sends through `flacroncv-api-task`).
- In the Stripe Dashboard, resend one recent event to the FlacronCV endpoint; it returns 2xx.

## Rollback
Run `aws ecs update-service … --task-definition flacroncv-api:89`. Revision `:89` still has the same, unrotated values.

## After it is stable (separate, approved steps)
1. **Rotate each credential** in Phase C order, one per deployment: update the secret, then `update-service --force-new-deployment`.
2. **Do not delete or deactivate FlacronAI's key from here.** Tell FlacronAI's owner that FlacronCV no longer uses `…MK5P`; the decision is theirs.
3. **Retire the old role.** Detach and delete `flacroncv-ses-service-role` once nothing references it. Have the account admin confirm that first.
