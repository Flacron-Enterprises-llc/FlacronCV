/**
 * CV18–CV26 tables. Human-service booking and employer checkout are not
 * sold here. API reads exist only after an organization entitlement row.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE career_scenarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      options jsonb NOT NULL,
      tradeoff text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE assisted_form_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      site text NOT NULL,
      reviewed_at timestamptz,
      external_submitted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE career_achievements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      title text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE career_promotion_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      desired_title text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE credential_reminders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      name text NOT NULL,
      expires_on date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE map_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      minutes int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE business_staff (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      auth_user_id text NOT NULL,
      role text NOT NULL CHECK (role IN ('counselor', 'manager')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, auth_user_id)
    );

    CREATE TABLE business_candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      email text NOT NULL,
      consent boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, email)
    );

    CREATE TABLE business_assignments (
      staff_id uuid NOT NULL REFERENCES business_staff(id),
      candidate_id uuid NOT NULL REFERENCES business_candidates(id),
      PRIMARY KEY (staff_id, candidate_id)
    );

    CREATE TABLE recruiting_opt_ins (
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      discoverable boolean NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, candidate_auth_user_id)
    );

    CREATE TABLE organization_entitlements (
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      addon_id text NOT NULL,
      reads_remaining int,
      PRIMARY KEY (billing_account_id, addon_id)
    );

    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      key_hash text NOT NULL UNIQUE,
      key_prefix text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE white_label_configs (
      workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
      brand_name text NOT NULL,
      attribution text NOT NULL
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE white_label_configs;
    DROP TABLE api_keys;
    DROP TABLE organization_entitlements;
    DROP TABLE recruiting_opt_ins;
    DROP TABLE business_assignments;
    DROP TABLE business_candidates;
    DROP TABLE business_staff;
    DROP TABLE map_sessions;
    DROP TABLE credential_reminders;
    DROP TABLE career_promotion_goals;
    DROP TABLE career_achievements;
    DROP TABLE assisted_form_sessions;
    DROP TABLE career_scenarios;
  `);
};
