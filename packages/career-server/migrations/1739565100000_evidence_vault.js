/**
 * CV11: Career Evidence Vault.
 * Supports claimed skills with selected projects, credentials, work samples,
 * references, and publications. Capacity is tracked against plan limits.
 * Creating/updating consumes no AI generation credits.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE career_evidence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      evidence_type text NOT NULL
        CHECK (evidence_type IN ('project', 'credential', 'work_sample', 'reference', 'publication')),
      ownership_statement text NOT NULL DEFAULT '',
      linked_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
      attachment_url text,
      attachment_name text,
      attachment_size_bytes bigint,
      evidence_label text NOT NULL DEFAULT 'self_reported'
        CHECK (evidence_label IN ('self_reported', 'evidence_attached', 'assessment_completed', 'issuer_verified', 'reference_confirmed')),
      verification_notes text,
      verified_at timestamptz,
      verifier_name text,
      is_portfolio_shared boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX career_evidence_candidate_idx
      ON career_evidence (workspace_id, candidate_auth_user_id, updated_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE career_evidence;
  `);
};
