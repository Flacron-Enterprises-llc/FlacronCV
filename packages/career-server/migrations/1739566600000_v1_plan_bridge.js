/**
 * V1 integration. The career service runs inside FlacronCV V1, which owns
 * customer identity, plans, subscriptions and credits (Firestore). A career
 * billing account's plan is derived from the caller's V1 plan through
 * `CAREER_PLAN_MAP`; it is never sold by a career checkout.
 *
 * - `plan_source` says which rule set the row: `career` (V2 behaviour, used
 *   by the tests) or `v1_mapping` (the integration bridge).
 * - `v1_plan` is the V1 effective plan read at the last sync, for audit.
 * - `v1_plan_synced_at` is when that read happened.
 *
 * Additive only: existing rows keep `career` and behave exactly as before.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE billing_accounts
      ADD COLUMN plan_source text NOT NULL DEFAULT 'career' CHECK (plan_source IN ('career', 'v1_mapping')),
      ADD COLUMN v1_plan text CHECK (v1_plan IS NULL OR length(v1_plan) BETWEEN 1 AND 64),
      ADD COLUMN v1_plan_synced_at timestamptz;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE billing_accounts
      DROP COLUMN v1_plan_synced_at,
      DROP COLUMN v1_plan,
      DROP COLUMN plan_source;
  `);
};
