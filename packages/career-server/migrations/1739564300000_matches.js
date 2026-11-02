/**
 * CV06: one saved comparison per person, profile version, listing revision,
 * and resume version. Reopening that row does not write the ledger.
 * There is no hiring-probability column.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE match_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      profile_version integer NOT NULL CHECK (profile_version >= 0),
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      opportunity_revision_id uuid NOT NULL REFERENCES opportunity_revisions(id),
      resume_version_id uuid NOT NULL REFERENCES resume_versions(id),
      fit text NOT NULL CHECK (fit IN ('blocked', 'none', 'partial', 'strong')),
      overlap real NOT NULL,
      reasons jsonb NOT NULL,
      gaps jsonb NOT NULL,
      unknowns jsonb NOT NULL,
      preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (candidate_auth_user_id, profile_version, opportunity_revision_id, resume_version_id)
    );
    CREATE INDEX match_results_candidate_idx
      ON match_results (workspace_id, candidate_auth_user_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE match_results;`);
};
