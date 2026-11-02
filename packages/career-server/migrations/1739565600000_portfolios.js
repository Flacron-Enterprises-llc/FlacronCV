/**
 * CV16: stable portfolio pages, selected evidence, and aggregate visit counts.
 * Visit rows store a day and a count. They do not store a person, address, or device.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE portfolios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      candidate_auth_user_id text NOT NULL,
      slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-f0-9]{12}$'),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
      headline text NOT NULL DEFAULT '',
      display_name text NOT NULL DEFAULT '',
      locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
      visibility text NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'private', 'public')),
      show_email boolean NOT NULL DEFAULT false,
      show_phone boolean NOT NULL DEFAULT false,
      contact_email text,
      contact_phone text,
      share_token text UNIQUE,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX portfolios_owner_idx ON portfolios (workspace_id, candidate_auth_user_id);

    CREATE TABLE portfolio_evidence (
      portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      evidence_id uuid NOT NULL REFERENCES career_evidence(id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      PRIMARY KEY (portfolio_id, evidence_id)
    );

    CREATE TABLE portfolio_visit_days (
      portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      visited_on date NOT NULL,
      views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
      PRIMARY KEY (portfolio_id, visited_on)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE portfolio_visit_days;
    DROP TABLE portfolio_evidence;
    DROP TABLE portfolios;
  `);
};
