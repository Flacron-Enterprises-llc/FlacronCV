import { isStripeLiveSecret } from '../billing/payments/live-stripe';

/**
 * FlacronCV V1's public hosts (site and its API load balancer).
 *
 * V1 integration (supersedes the V2 independence rules of 29 Oct 2026): the
 * career service is part of V1, so production serves these hosts. Staging
 * must never name them, so a test deployment cannot answer the live site.
 */
export const V1_HOSTS = ['flacroncv.com', 'www.flacroncv.com', 'api.flacroncv.com'];

/**
 * V1's live Firebase project. In production it is the *only* project the
 * career service accepts tokens from: V1 owns the customer identity. Local
 * runs and tests never use it; they use the Auth emulator with a `demo-` id.
 */
export const V1_FIREBASE_PROJECT_ID = 'flacron-cv';

export type DeployEnv = 'staging' | 'production';

/** `DEPLOY_ENV` names a hosted deployment. Unset means a local run or a test. */
export function deployEnv(env: NodeJS.ProcessEnv = process.env): DeployEnv | null {
  const value = env.DEPLOY_ENV?.trim().toLowerCase() ?? '';
  return value === 'staging' || value === 'production' ? value : null;
}

/** `DEPLOY_ENV=staging` marks a hosted test environment that still runs with `NODE_ENV=production`. */
export function isStagingDeploy(env: NodeJS.ProcessEnv = process.env): boolean {
  return deployEnv(env) === 'staging';
}

/** Explicitly approved staging mail recipients (comma-separated). Synthetic and SES simulator addresses are always allowed. */
export function stagingMailRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.MAIL_ALLOWED_RECIPIENTS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

/**
 * Every API and worker process checks this at boot. Messages name the rule, never a value.
 *
 * - A local run or a test (no `DEPLOY_ENV`) refuses V1's live project, so
 *   development can never verify live tokens or read live Firestore.
 * - `NODE_ENV=production` must say which hosted deployment it is.
 * - Staging and production each have their own rules (below). The worker has
 *   no storage, sign-in or payment settings, so only the rules that apply to it run.
 */
export function assertDeploySafety(env: NodeJS.ProcessEnv = process.env, role: 'api' | 'worker' = 'api'): void {
  const target = deployEnv(env);
  if (env.NODE_ENV?.trim() === 'production' && !target) {
    throw new Error('DEPLOY_ENV must be staging or production when NODE_ENV is production');
  }
  if (!target && (env.FIREBASE_PROJECT_ID?.trim() ?? '') === V1_FIREBASE_PROJECT_ID) {
    throw new Error('Local runs and tests cannot use V1\'s live Firebase project; use the emulator with a demo- project');
  }
  if (target === 'staging') assertStagingSafety(env);
  if (target === 'production') assertProductionSafety(env, role);
}

/**
 * Refuses staging settings that could charge real money, mail real people, or reach production users.
 * Does nothing outside staging.
 */
export function assertStagingSafety(env: NodeJS.ProcessEnv = process.env): void {
  if (!isStagingDeploy(env)) return;
  if (isStripeLiveSecret(env.STRIPE_SECRET_KEY ?? '')) {
    throw new Error('staging cannot use a live Stripe key (use sk_test_)');
  }
  if (env.MAIL_DELIVERY?.trim().toLowerCase() === 'live') {
    throw new Error('staging MAIL_DELIVERY cannot be live (use record, or set MAIL_ALLOWED_RECIPIENTS)');
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    throw new Error('staging cannot use the Firebase Auth emulator');
  }
  const project = env.FIREBASE_PROJECT_ID?.trim() ?? '';
  if (project === V1_FIREBASE_PROJECT_ID || project.startsWith('demo-')) {
    throw new Error('staging FIREBASE_PROJECT_ID must be a dedicated hosted staging project');
  }
  if (env.OBJECT_STORAGE?.trim().toLowerCase() === 'local' && !env.OBJECT_STORAGE_SECRET?.trim()) {
    throw new Error('staging local OBJECT_STORAGE needs OBJECT_STORAGE_SECRET');
  }
  if (env.OBJECT_STORAGE?.trim().toLowerCase() === 's3') {
    if (!/staging/i.test(env.OBJECT_STORAGE_BUCKET ?? '')) {
      throw new Error('staging OBJECT_STORAGE_BUCKET must be a dedicated staging bucket (its name contains "staging")');
    }
    if (env.AWS_ACCESS_KEY_ID?.trim() && env.SES_FROM_EMAIL?.trim() && !env.SES_ACCESS_KEY_ID?.trim()) {
      throw new Error('staging SES keys must use SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY so S3 uses the task role');
    }
  }
  assertOrigins(env, 'staging');
}

/**
 * Production rules for the career service hosted beside V1. Does nothing
 * outside production. A provider left unset stays unavailable; it is not an error.
 *
 * - Identity is V1's: tokens must come from V1's project.
 * - Billing is V1's: the career service sells nothing, so a Stripe key is refused.
 * - Files go to a dedicated private career bucket, never V1's Firebase bucket.
 */
export function assertProductionSafety(env: NodeJS.ProcessEnv = process.env, role: 'api' | 'worker' = 'api'): void {
  if (deployEnv(env) !== 'production') return;
  if (env.NODE_ENV?.trim() !== 'production') throw new Error('production needs NODE_ENV=production');
  if (/staging/i.test(databaseName(env.DATABASE_URL))) {
    throw new Error('production DATABASE_URL cannot name a staging database');
  }
  if (env.AWS_ACCESS_KEY_ID?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim()) {
    throw new Error('production uses the instance role for AWS; AWS_ACCESS_KEY_ID must not be set');
  }
  if (env.MAIL_ALLOWED_RECIPIENTS?.trim()) throw new Error('production cannot use the staging MAIL_ALLOWED_RECIPIENTS list');
  if (env.STRIPE_SECRET_KEY?.trim()) {
    throw new Error('production career service sells nothing (V1 owns billing); STRIPE_SECRET_KEY must not be set');
  }
  if (env.STRIPE_AUTO_TEST_PRICES?.trim()) throw new Error('production cannot create test prices (unset STRIPE_AUTO_TEST_PRICES)');
  if (role === 'worker') return;
  if (env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) throw new Error('production cannot use the Firebase Auth emulator');
  if (env.FIRESTORE_EMULATOR_HOST?.trim()) throw new Error('production cannot use the Firestore emulator');
  if ((env.FIREBASE_PROJECT_ID?.trim() ?? '') !== V1_FIREBASE_PROJECT_ID) {
    throw new Error('production FIREBASE_PROJECT_ID must be V1\'s project, which owns customer identity');
  }
  if (env.OBJECT_STORAGE?.trim().toLowerCase() !== 's3') throw new Error('production OBJECT_STORAGE must be s3');
  const bucket = env.OBJECT_STORAGE_BUCKET?.trim() ?? '';
  if (!/career/i.test(bucket) || /staging/i.test(bucket) || /appspot\.com$|firebasestorage\.app$/i.test(bucket)) {
    throw new Error('production OBJECT_STORAGE_BUCKET must be a dedicated private career bucket (its name contains "career")');
  }
  assertOrigins(env, 'production');
}

/**
 * CORS origins must be absolute https origins. Staging never names a V1
 * production host; production never names a staging host.
 */
function assertOrigins(env: NodeJS.ProcessEnv, target: DeployEnv): void {
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`${target} CORS_ORIGINS must be absolute https origins`);
    }
    if (url.protocol !== 'https:') throw new Error(`${target} CORS_ORIGINS must be absolute https origins`);
    if (target === 'staging' && V1_HOSTS.includes(url.hostname)) {
      throw new Error('staging CORS_ORIGINS cannot include a FlacronCV production host');
    }
    if (target === 'production' && /staging/i.test(url.hostname)) throw new Error('production CORS_ORIGINS cannot include a staging host');
  }
}

function databaseName(url: string | undefined): string {
  try {
    return decodeURIComponent(new URL(url ?? '').pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}
