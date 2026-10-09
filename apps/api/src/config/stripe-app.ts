/**
 * FlacronCV's identity on the shared Flacron Stripe account.
 *
 * Every Flacron application bills through ONE Stripe account. What keeps their
 * money apart is the `app_id` metadata stamped on every Stripe object an app
 * creates, plus the `application_id` on every row it stores. The id is
 * permanent and spelled identically everywhere — never "app", "website" or a
 * per-environment variant — because the central dashboard filters on it.
 */
export const APP_ID_METADATA_KEY = 'app_id';
export const DEFAULT_APP_ID = 'flacron-cv';

const APP_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** APP_ID from the environment, falling back to this app's permanent id. */
export function resolveAppId(env: Record<string, string | undefined> = process.env): string {
  const value = (env.APP_ID ?? '').trim() || DEFAULT_APP_ID;
  if (!APP_ID_PATTERN.test(value)) {
    throw new Error(`APP_ID "${value}" is not a valid application id (lowercase letters, digits and dashes).`);
  }
  return value;
}

export type StripeKeyMode = 'live' | 'test';

/**
 * `live` / `test` from a secret (`sk_`) or restricted (`rk_`) key prefix, or
 * null for anything else. Never log or return the key itself.
 */
export function stripeKeyMode(secret: string | undefined | null): StripeKeyMode | null {
  const match = /^(?:sk|rk)_(live|test)_/.exec((secret ?? '').trim());
  return match ? (match[1] as StripeKeyMode) : null;
}

export function isRestrictedStripeKey(secret: string | undefined | null): boolean {
  return /^rk_(live|test)_/.test((secret ?? '').trim());
}

/**
 * Boot gate for STRIPE_SECRET_KEY's shape.
 *
 * A publishable key (`pk_`) or a webhook secret pasted into the wrong variable
 * fails here with a message that names the problem, instead of every Stripe
 * call failing later with "Invalid API Key". Returns a warning (not an error)
 * for an unrestricted `sk_` key: the standard is a restricted key per app, and
 * a shared secret key can see and change every other app's billing.
 */
export function checkStripeSecretKey(secret: string | undefined | null): { warning: string | null } {
  if (!stripeKeyMode(secret)) {
    throw new Error(
      'STRIPE_SECRET_KEY must be this application\'s Stripe restricted key (rk_live_… / rk_test_…) ' +
        'or a secret key (sk_live_… / sk_test_…).',
    );
  }
  if (!isRestrictedStripeKey(secret)) {
    return {
      warning:
        'STRIPE_SECRET_KEY is an unrestricted secret key. The Flacron Stripe standard requires each ' +
        'application to use its own restricted key (rk_…) with only the permissions it needs.',
    };
  }
  return { warning: null };
}
