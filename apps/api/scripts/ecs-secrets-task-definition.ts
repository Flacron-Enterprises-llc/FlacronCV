/**
 * OPERATOR-RUN helper for docs/SECRETS_MANAGER_MIGRATION.md (Phase A + B in one revision).
 * Reads a `describe-task-definition` JSON file the operator saved privately, writes:
 *   --register-out  register-ready task definition: credentials as Secrets Manager references,
 *                   AWS key pair removed, FlacronCV execution/task roles. Contains NO secret values.
 *   --payload-out   (optional) the secret's JSON body. Contains secret values: write it to a private
 *                   path, use it once with `aws secretsmanager put-secret-value --secret-string file://…`,
 *                   then delete it. Never commit or share it.
 * Prints only variable NAMES. Makes no AWS calls.
 *
 *   npx ts-node --transpile-only scripts/ecs-secrets-task-definition.ts --from=<td.json> \
 *     --secret-arn=arn:aws:secretsmanager:us-east-1:<acct>:secret:flacroncv/production/api-XXXXXX \
 *     --execution-role-arn=arn:aws:iam::<acct>:role/flacroncv-api-execution \
 *     --task-role-arn=arn:aws:iam::<acct>:role/flacroncv-api-task \
 *     --register-out=<file> [--payload-out=<private file>]
 */
import { readFileSync, writeFileSync } from 'fs';
import { secretPayload, transformTaskDefinition } from '../src/infra/ecs-task-definition-secrets';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=')]; })) as Record<string, string>;
for (const k of ['from', 'secret-arn', 'execution-role-arn', 'task-role-arn', 'register-out']) {
  if (!args[k]) { console.error(`missing --${k}`); process.exit(1); }
}
try {
  const raw = JSON.parse(readFileSync(args.from, 'utf8'));
  const td = raw.taskDefinition ?? raw;
  const { register, secretKeys, removed } = transformTaskDefinition({
    taskDefinition: td, secretArn: args['secret-arn'], executionRoleArn: args['execution-role-arn'], taskRoleArn: args['task-role-arn'],
  });
  writeFileSync(args['register-out'], JSON.stringify(register, null, 2));
  console.log(`register-ready task definition written (no secret values). Secret keys: ${secretKeys.join(', ')}. Removed: ${removed.join(', ') || 'none'}.`);
  if (args['payload-out']) {
    writeFileSync(args['payload-out'], JSON.stringify(secretPayload(td)), { mode: 0o600 });
    console.log(`secret payload written to the private file (${secretKeys.length} keys). Delete it after put-secret-value.`);
  }
} catch (e) {
  // Never echo file contents.
  console.error(`Refusing: ${(e as Error).message.replace(/\b(?:sk|rk)_(?:test|live)_\S+/g, '[key]')}`);
  process.exit(1);
}
