/**
 * docs/DATA_MODEL.md: packs, usage_balances, and the 80 / 95 / 100 percent
 * usage warnings from spec section 11. Allowance numbers come from the
 * catalog snapshot at runtime. None are written here.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE packs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      addon_id text NOT NULL,
      catalog_version text NOT NULL REFERENCES catalog_versions(version),
      unit text NOT NULL,
      purchased_units integer NOT NULL CHECK (purchased_units > 0),
      remaining_units integer NOT NULL,
      purchased_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired', 'revoked')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT packs_remaining_in_range CHECK (remaining_units >= 0 AND remaining_units <= purchased_units),
      CONSTRAINT packs_expiry_after_purchase CHECK (expires_at > purchased_at)
    );
    CREATE INDEX packs_spend_order_idx ON packs (billing_account_id, unit, expires_at) WHERE status = 'active';
    CREATE INDEX packs_expiry_idx ON packs (expires_at) WHERE status IN ('active', 'exhausted');

    ALTER TABLE usage_ledger
      ADD CONSTRAINT usage_ledger_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES packs(id);

    CREATE TABLE usage_balances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      unit text NOT NULL,
      allowance_period_start timestamptz NOT NULL,
      allowance_period_end timestamptz NOT NULL,
      included_granted integer NOT NULL CHECK (included_granted >= 0),
      included_remaining integer NOT NULL,
      candidate_auth_user_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT usage_balances_remaining_in_range CHECK (
        included_remaining >= 0 AND included_remaining <= included_granted
      ),
      CONSTRAINT usage_balances_period_order CHECK (allowance_period_end > allowance_period_start),
      CONSTRAINT usage_balances_one_row_per_period UNIQUE NULLS NOT DISTINCT
        (billing_account_id, unit, allowance_period_start, candidate_auth_user_id)
    );

    CREATE TABLE usage_warnings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      unit text NOT NULL,
      allowance_period_start timestamptz NOT NULL,
      threshold integer NOT NULL CHECK (threshold IN (80, 95, 100)),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT usage_warnings_once_per_period UNIQUE (billing_account_id, unit, allowance_period_start, threshold)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE usage_warnings;
    DROP TABLE usage_balances;
    ALTER TABLE usage_ledger DROP CONSTRAINT usage_ledger_pack_id_fkey;
    DROP TABLE packs;
  `);
};
