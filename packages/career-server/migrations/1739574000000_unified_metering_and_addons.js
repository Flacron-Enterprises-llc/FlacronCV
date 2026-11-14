/**
 * Five-plan integration (spec sections 8 to 11). Additive only; existing rows
 * keep their behaviour through the defaults.
 *
 * - `billing_accounts.capacity_extras`: recurring capacity add-ons bought
 *   through V1's Stripe (extra location, saved searches, portfolio page,
 *   storage, Business seats and candidates), as `{ "<allowance field>": n }`.
 *   `checkCapacity` adds them to the plan limit. Packs never write here, so a
 *   pack can never raise alert intelligence or the local radius.
 * - `billing_accounts.auto_topup_consent_at` and `topup_addons`: the explicit
 *   opt-in for automatic top-ups (off by default) and the pack chosen per unit.
 * - `purchases.auto_topup`: a pack bought by the top-up engine, so the monthly
 *   spending cap counts only automatic purchases.
 * - `usage_warnings.seen_at`: the 80/95/100 percent notice was shown.
 * - `billing_adjustments`: append-only record of every entitlement change that
 *   is not a reservation (upgrade difference, scheduled downgrade, refund
 *   revocation, capacity change, storage grace), so completed usage is never
 *   silently rewritten (section 11).
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE billing_accounts
      ADD COLUMN capacity_extras jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN auto_topup_consent_at timestamptz,
      ADD COLUMN topup_addons jsonb NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE purchases ADD COLUMN auto_topup boolean NOT NULL DEFAULT false;

    ALTER TABLE usage_warnings ADD COLUMN seen_at timestamptz;

    CREATE TABLE billing_adjustments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      kind text NOT NULL CHECK (kind IN (
        'upgrade_difference', 'plan_regrant', 'downgrade_scheduled', 'downgrade_applied',
        'pack_granted', 'pack_revoked', 'capacity_changed', 'storage_grace_started', 'period_reanchored'
      )),
      unit text,
      quantity integer,
      reason text,
      source_ref text,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX billing_adjustments_account_idx ON billing_adjustments (billing_account_id, created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE billing_adjustments;
    ALTER TABLE usage_warnings DROP COLUMN seen_at;
    ALTER TABLE purchases DROP COLUMN auto_topup;
    ALTER TABLE billing_accounts
      DROP COLUMN topup_addons,
      DROP COLUMN auto_topup_consent_at,
      DROP COLUMN capacity_extras;
  `);
};
