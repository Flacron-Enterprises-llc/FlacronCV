/**
 * Turns a described ECS task definition (with credentials in plaintext `environment`) into a
 * register-ready one that reads them from ONE Secrets Manager secret, drops the borrowed AWS key
 * pair (mail uses the task role instead), and uses FlacronCV-owned execution and task roles.
 *
 * Pure: no AWS calls. The operator runs scripts/ecs-secrets-task-definition.ts. Fails closed:
 * any variable that looks like a credential and is not classified here stops the run, and the
 * result is checked to contain none of the original secret values.
 * Plan: docs/SECRETS_MANAGER_MIGRATION.md.
 */

/** Moved into the secret, referenced by `secrets` (JSON key = variable name). */
export const SECRET_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FIREBASE_PRIVATE_KEY',
  'OPENAI_API_KEY',
  'WATSONX_API_KEY',
  'BREVO_API_KEY',
  'APPLE_PRIVATE_KEY',
  'GOOGLE_PLAY_PRIVATE_KEY',
] as const;

/** Removed entirely: another application's IAM user keys; the task role replaces them. */
export const REMOVED_VARS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] as const;

/** Names that look sensitive but are identifiers, not secrets. */
export const NOT_SECRET = new Set([
  'APPLE_KEY_ID', 'APPLE_ISSUER_ID', 'FIREBASE_CLIENT_EMAIL', 'GOOGLE_PLAY_CLIENT_EMAIL',
  'BREVO_TEMPLATE_PASSWORD_RESET', // a Brevo template id, not a password
]);

const LOOKS_SECRET = /(SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY|_KEY$|CREDENTIAL)/;

interface EnvVar { name: string; value: string }
interface SecretRef { name: string; valueFrom: string }
export interface ContainerDef { name: string; environment?: EnvVar[]; secrets?: SecretRef[] | null; [k: string]: unknown }
export interface TaskDef {
  family: string;
  containerDefinitions: ContainerDef[];
  executionRoleArn?: string;
  taskRoleArn?: string;
  [k: string]: unknown;
}

export interface TransformInput {
  taskDefinition: TaskDef;
  secretArn: string;
  executionRoleArn: string;
  taskRoleArn: string;
}

export interface TransformResult {
  /** Body for `aws ecs register-task-definition --cli-input-json`. */
  register: Record<string, unknown>;
  /** Names that must exist as JSON keys in the secret. */
  secretKeys: string[];
  removed: string[];
}

/** Fields `describe-task-definition` returns that `register-task-definition` rejects. */
const READ_ONLY = ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt'];

export function transformTaskDefinition(input: TransformInput): TransformResult {
  const { taskDefinition: td, secretArn, executionRoleArn, taskRoleArn } = input;
  if (!/^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:flacroncv\/production\/api-[A-Za-z0-9]{6}$/.test(secretArn)) {
    throw new Error('secret ARN must be the full ARN of flacroncv/production/api (with its 6-character suffix)');
  }
  for (const [label, arn] of [['execution', executionRoleArn], ['task', taskRoleArn]] as const) {
    if (!/^arn:aws:iam::\d{12}:role\/flacroncv-[A-Za-z0-9-]+$/.test(arn)) throw new Error(`${label} role must be a FlacronCV role (arn:aws:iam::<acct>:role/flacroncv-…)`);
  }
  if (/ecsTaskExecutionRole$/.test(executionRoleArn)) throw new Error('do not use the shared ecsTaskExecutionRole');
  if (td.containerDefinitions.length !== 1) throw new Error('expected exactly one container');

  const c = td.containerDefinitions[0]!;
  const env = c.environment ?? [];
  const names = new Set(env.map((e) => e.name));
  const unknown = env.filter(
    (e) => LOOKS_SECRET.test(e.name) && !NOT_SECRET.has(e.name) && !(SECRET_VARS as readonly string[]).includes(e.name) && !(REMOVED_VARS as readonly string[]).includes(e.name),
  );
  if (unknown.length) throw new Error(`unclassified credential-like variables: ${unknown.map((e) => e.name).join(', ')}`);
  if ((c.secrets ?? []).length) throw new Error('the container already has a secrets block; review manually');

  const secretKeys = SECRET_VARS.filter((n) => names.has(n));
  const removed = REMOVED_VARS.filter((n) => names.has(n));
  const drop = new Set<string>([...secretKeys, ...removed]);
  const container: ContainerDef = {
    ...c,
    environment: env.filter((e) => !drop.has(e.name)),
    secrets: secretKeys.map((n) => ({ name: n, valueFrom: `${secretArn}:${n}::` })),
  };

  const register: Record<string, unknown> = { ...td, containerDefinitions: [container], executionRoleArn, taskRoleArn };
  for (const k of READ_ONLY) delete register[k];

  // Safety: no original secret value may survive anywhere in the output.
  const text = JSON.stringify(register);
  for (const e of env) {
    if (drop.has(e.name) && e.value && e.value.length >= 8 && text.includes(e.value)) {
      throw new Error(`value of ${e.name} still present in the output`);
    }
  }
  return { register, secretKeys: [...secretKeys], removed: [...removed] };
}

/** The secret's JSON body (operator-only; written to a private file, never logged). */
export function secretPayload(td: TaskDef): Record<string, string> {
  const env = td.containerDefinitions[0]?.environment ?? [];
  return Object.fromEntries(env.filter((e) => (SECRET_VARS as readonly string[]).includes(e.name)).map((e) => [e.name, e.value]));
}
