/**
 * CV05: dedupe key and extra sources for one listing, and a private owner
 * for a pasted vacancy. Feed rows leave `candidate_auth_user_id` null and
 * stay shared. A paste names the person and is not shown to anyone else.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE opportunities
      ADD COLUMN dedupe_key text,
      ADD COLUMN candidate_auth_user_id text;
    CREATE UNIQUE INDEX opportunities_dedupe_key_idx
      ON opportunities (dedupe_key) WHERE dedupe_key IS NOT NULL;

    CREATE TABLE opportunity_sources (
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
      source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
      source_url text,
      PRIMARY KEY (provider, source_id)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE opportunity_sources;
    DROP INDEX opportunities_dedupe_key_idx;
    ALTER TABLE opportunities
      DROP COLUMN dedupe_key,
      DROP COLUMN candidate_auth_user_id;
  `);
};
