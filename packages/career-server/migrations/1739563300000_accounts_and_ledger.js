/**
 * docs/DATA_MODEL.md: users, workspaces, billing_accounts, usage_ledger.
 *
 * Unit names and plan allowances are not repeated here. The code checks a
 * unit against the catalog snapshot. Plan ids are listed because the row
 * must also hold the three legacy ids that are not in the V2 catalog.
 *
 * allowance_anchor is not in the first draft of the data model. It is the
 * instant monthly anniversaries are counted from, so 31 January renews on
 * 28 or 29 February and again on 31 March instead of drifting to the 28th.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_user_id text NOT NULL UNIQUE,
      auth_provider text NOT NULL DEFAULT 'firebase' CHECK (auth_provider = 'firebase'),
      locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE workspaces (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      kind text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual', 'business')),
      name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX workspaces_owner_user_id_idx ON workspaces (owner_user_id);

    CREATE TABLE billing_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id),
      auth_user_id text,
      plan_id text NOT NULL CHECK (plan_id IN (
        'free', 'starter', 'professional', 'career_pro', 'business',
        'legacy_pro', 'legacy_enterprise', 'legacy_career_accelerator'
      )),
      legacy_plan text CHECK (legacy_plan IN ('pro', 'enterprise', 'career_accelerator')),
      catalog_version text NOT NULL REFERENCES catalog_versions(version),
      interval text NOT NULL CHECK (interval IN ('monthly', 'annual')),
      status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
      trial_end timestamptz,
      has_used_trial boolean NOT NULL DEFAULT false,
      period_start timestamptz,
      period_end timestamptz,
      allowance_anchor timestamptz NOT NULL,
      allowance_period_start timestamptz NOT NULL,
      allowance_period_end timestamptz NOT NULL,
      provider text CHECK (provider IN ('stripe', 'apple', 'google')),
      provider_customer_id text,
      provider_subscription_id text,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      origin text NOT NULL DEFAULT 'v2' CHECK (origin IN ('v2', 'migrated')),
      spending_cap_cents integer CHECK (spending_cap_cents >= 0),
      auto_topup boolean NOT NULL DEFAULT false,
      storage_grace_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT billing_accounts_legacy_plan_matches CHECK (
        legacy_plan IS NOT DISTINCT FROM (CASE plan_id
          WHEN 'legacy_pro' THEN 'pro'
          WHEN 'legacy_enterprise' THEN 'enterprise'
          WHEN 'legacy_career_accelerator' THEN 'career_accelerator'
        END)
      ),
      CONSTRAINT billing_accounts_free_has_no_provider CHECK (plan_id <> 'free' OR provider IS NULL),
      CONSTRAINT billing_accounts_trialing_has_end CHECK (status <> 'trialing' OR trial_end IS NOT NULL),
      CONSTRAINT billing_accounts_topup_needs_cap CHECK (NOT auto_topup OR spending_cap_cents IS NOT NULL),
      CONSTRAINT billing_accounts_allowance_period_order CHECK (allowance_period_end > allowance_period_start),
      CONSTRAINT billing_accounts_period_order CHECK (
        period_start IS NULL OR period_end IS NULL OR period_end > period_start
      )
    );
    CREATE INDEX billing_accounts_allowance_period_end_idx ON billing_accounts (allowance_period_end);
    CREATE UNIQUE INDEX billing_accounts_provider_subscription_idx
      ON billing_accounts (provider, provider_subscription_id)
      WHERE provider_subscription_id IS NOT NULL;

    CREATE TABLE usage_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text,
      unit text NOT NULL,
      quantity integer NOT NULL CHECK (quantity > 0),
      request_id text NOT NULL,
      idempotency_key text NOT NULL,
      request_fingerprint text NOT NULL,
      allowance_period_start timestamptz NOT NULL,
      pack_id uuid,
      state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'committed', 'released')),
      created_at timestamptz NOT NULL DEFAULT now(),
      committed_at timestamptz,
      released_at timestamptz,
      CONSTRAINT usage_ledger_idempotency_key_unique UNIQUE (billing_account_id, idempotency_key),
      CONSTRAINT usage_ledger_committed_at_matches CHECK ((state = 'committed') = (committed_at IS NOT NULL)),
      CONSTRAINT usage_ledger_released_at_matches CHECK ((state = 'released') = (released_at IS NOT NULL))
    );
    CREATE INDEX usage_ledger_account_period_idx ON usage_ledger (billing_account_id, allowance_period_start);
    CREATE INDEX usage_ledger_reserved_idx ON usage_ledger (created_at) WHERE state = 'reserved';

    -- Append-only: no delete, no amount rewrite. The only changes after
    -- insert are reserved -> committed or released with its timestamp, and
    -- clearing candidate_auth_user_id when that person deletes the account.
    CREATE FUNCTION usage_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'usage_ledger rows are not deleted';
      END IF;
      IF (NEW.id, NEW.billing_account_id, NEW.workspace_id, NEW.unit, NEW.quantity, NEW.request_id,
          NEW.idempotency_key, NEW.request_fingerprint, NEW.allowance_period_start, NEW.pack_id, NEW.created_at)
         IS DISTINCT FROM
         (OLD.id, OLD.billing_account_id, OLD.workspace_id, OLD.unit, OLD.quantity, OLD.request_id,
          OLD.idempotency_key, OLD.request_fingerprint, OLD.allowance_period_start, OLD.pack_id, OLD.created_at) THEN
        RAISE EXCEPTION 'usage_ledger amounts and keys are not rewritten';
      END IF;
      IF NEW.candidate_auth_user_id IS DISTINCT FROM OLD.candidate_auth_user_id
         AND NEW.candidate_auth_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'usage_ledger candidate can only be cleared';
      END IF;
      IF NEW.state IS DISTINCT FROM OLD.state AND OLD.state <> 'reserved' THEN
        RAISE EXCEPTION 'usage_ledger state % is final', OLD.state;
      END IF;
      IF NEW.state = OLD.state
         AND (NEW.committed_at IS DISTINCT FROM OLD.committed_at OR NEW.released_at IS DISTINCT FROM OLD.released_at) THEN
        RAISE EXCEPTION 'usage_ledger timestamps change only with the state';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER usage_ledger_guard
      BEFORE UPDATE OR DELETE ON usage_ledger
      FOR EACH ROW EXECUTE FUNCTION usage_ledger_guard();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE usage_ledger;
    DROP FUNCTION usage_ledger_guard();
    DROP TABLE billing_accounts;
    DROP TABLE workspaces;
    DROP TABLE users;
  `);
};
