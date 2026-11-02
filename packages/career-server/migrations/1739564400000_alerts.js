/**
 * CV07: saved searches, locations, followed companies, alert settings,
 * one in-app item per opportunity, recipient, and material revision,
 * channel deliveries, and digests. A delivery has no ledger id.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE location_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      place text NOT NULL,
      radius_miles integer NOT NULL CHECK (radius_miles >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE saved_searches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      filters jsonb NOT NULL,
      location_profile_id uuid REFERENCES location_profiles(id),
      radius_miles integer CHECK (radius_miles IS NULL OR radius_miles >= 0),
      schedule text NOT NULL CHECK (schedule IN ('weekly', 'daily', 'every_6_hours', 'hourly')),
      paused boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE followed_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      name text NOT NULL,
      source_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE alert_settings (
      candidate_auth_user_id text PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      email boolean NOT NULL DEFAULT true,
      push boolean NOT NULL DEFAULT false,
      telegram boolean NOT NULL DEFAULT false,
      digest text NOT NULL DEFAULT 'weekly' CHECK (digest IN ('weekly', 'daily', 'immediate')),
      quiet_start text,
      quiet_end text,
      paused boolean NOT NULL DEFAULT false,
      last_matched_at timestamptz,
      last_digest_at timestamptz
    );

    CREATE TABLE alert_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      recipient_auth_user_id text NOT NULL,
      material_revision_id uuid NOT NULL REFERENCES opportunity_revisions(id),
      ledger_id uuid NOT NULL REFERENCES usage_ledger(id),
      reason jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (opportunity_id, recipient_auth_user_id, material_revision_id)
    );

    CREATE INDEX alert_items_recipient_idx
      ON alert_items (recipient_auth_user_id, created_at DESC);

    CREATE TABLE notification_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_item_id uuid NOT NULL REFERENCES alert_items(id),
      channel text NOT NULL CHECK (channel IN ('email', 'push', 'telegram')),
      status text NOT NULL CHECK (status IN ('held', 'sent')),
      sent_at timestamptz,
      UNIQUE (alert_item_id, channel)
    );

    CREATE TABLE digests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_auth_user_id text NOT NULL,
      period_start timestamptz NOT NULL,
      channel text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (recipient_auth_user_id, period_start, channel)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE digests;
    DROP TABLE notification_deliveries;
    DROP TABLE alert_items;
    DROP TABLE alert_settings;
    DROP TABLE followed_companies;
    DROP TABLE saved_searches;
    DROP TABLE location_profiles;
  `);
};
