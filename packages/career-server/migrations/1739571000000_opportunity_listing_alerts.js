/**
 * Listing model, company watch, alert centre and in-app reminders (spec
 * sections 2, 16, 23, 24). Additive only; existing rows keep their meaning.
 *
 * - Revisions gain the fields a listing may state: publication date, remote
 *   restriction ("remote is not worldwide"), schedule, arrangement, seniority,
 *   category-specific details and coordinates. Null means not stated.
 * - Location profiles may carry coordinates from the geocoding adapter, so a
 *   radius is applied only when real coordinates exist on both sides.
 * - A followed company keeps aliases, roles and locations.
 * - An alert item can be marked read.
 * - A person can save a listing (private bookmark; no quota).
 * - Reminders are separate from alert items and never hold a ledger row, so
 *   they cannot consume opportunity credits. Off-box delivery uses the same
 *   outbox pattern as alert items.
 * - A match keeps its preference fit next to the qualification fit.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE opportunity_revisions
      ADD COLUMN published_at text CHECK (published_at IS NULL OR published_at ~ '^\\d{4}-\\d{2}-\\d{2}$'),
      ADD COLUMN remote_restriction text CHECK (remote_restriction IS NULL OR length(remote_restriction) <= 300),
      ADD COLUMN schedule text CHECK (schedule IS NULL OR schedule IN ('full_time', 'part_time', 'temporary', 'contract')),
      ADD COLUMN arrangement text CHECK (arrangement IS NULL OR arrangement IN ('remote', 'hybrid', 'onsite')),
      ADD COLUMN seniority text CHECK (seniority IS NULL OR seniority IN ('entry', 'mid', 'senior', 'lead', 'executive')),
      ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
      ADD COLUMN longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

    CREATE INDEX opportunities_category_idx ON opportunities (category);

    ALTER TABLE location_profiles
      ADD COLUMN latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
      ADD COLUMN longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
      ADD COLUMN geocoded_label text;

    ALTER TABLE followed_companies
      ADD COLUMN aliases text[] NOT NULL DEFAULT '{}',
      ADD COLUMN roles text[] NOT NULL DEFAULT '{}',
      ADD COLUMN locations text[] NOT NULL DEFAULT '{}';

    ALTER TABLE alert_items ADD COLUMN read_at timestamptz;

    ALTER TABLE match_results ADD COLUMN preference_fit jsonb NOT NULL DEFAULT '[]'::jsonb;

    CREATE TABLE saved_opportunities (
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (candidate_auth_user_id, opportunity_id)
    );

    CREATE TABLE career_reminders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('listing_deadline', 'application_follow_up', 'interview', 'certification_expiry', 'credential_maintenance')),
      source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 300),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      due_date text NOT NULL CHECK (due_date ~ '^\\d{4}-\\d{2}-\\d{2}$'),
      link text CHECK (link IS NULL OR length(link) <= 2000),
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz,
      UNIQUE (candidate_auth_user_id, kind, source_key, due_date)
    );
    CREATE INDEX career_reminders_person_idx ON career_reminders (candidate_auth_user_id, due_date DESC);

    CREATE TABLE reminder_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reminder_id uuid NOT NULL REFERENCES career_reminders(id) ON DELETE CASCADE,
      channel text NOT NULL CHECK (channel IN ('email', 'push', 'telegram')),
      status text NOT NULL CHECK (status IN ('held', 'pending', 'sending', 'sent', 'uncertain', 'failed')),
      message_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      attempts integer NOT NULL DEFAULT 0,
      claim_token uuid,
      claimed_until timestamptz,
      last_error text,
      sent_at timestamptz,
      UNIQUE (reminder_id, channel)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE reminder_deliveries;
    DROP TABLE career_reminders;
    DROP TABLE saved_opportunities;
    ALTER TABLE match_results DROP COLUMN preference_fit;
    ALTER TABLE alert_items DROP COLUMN read_at;
    ALTER TABLE followed_companies DROP COLUMN locations, DROP COLUMN roles, DROP COLUMN aliases;
    ALTER TABLE location_profiles DROP COLUMN geocoded_label, DROP COLUMN longitude, DROP COLUMN latitude;
    DROP INDEX opportunities_category_idx;
    ALTER TABLE opportunity_revisions
      DROP COLUMN longitude, DROP COLUMN latitude, DROP COLUMN details, DROP COLUMN seniority,
      DROP COLUMN arrangement, DROP COLUMN schedule, DROP COLUMN remote_restriction, DROP COLUMN published_at;
  `);
};
