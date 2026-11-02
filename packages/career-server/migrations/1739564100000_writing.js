/**
 * CV04: the data model's `letters` row, built as `writing_documents`.
 * A cover letter, bio, LinkedIn text, or outreach draft. The body is
 * confirmed fact text, then any edit the person saves. Item 18 copies a
 * V1 cover letter into this table (type `cover_letter`, empty fact_ids).
 *
 * Rows are personal. Account deletion removes them by
 * `candidate_auth_user_id`. A copied letter does not write `usage_ledger`;
 * a completed generation does, through the metering service.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE writing_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      document_type text NOT NULL CHECK (document_type IN ('cover_letter', 'bio', 'linkedin', 'outreach')),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
      fact_ids uuid[] NOT NULL DEFAULT '{}',
      opportunity_revision_id uuid REFERENCES opportunity_revisions(id),
      linked_resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
      confirmation text NOT NULL DEFAULT 'draft' CHECK (confirmation IN ('draft', 'confirmed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX writing_documents_candidate_idx
      ON writing_documents (workspace_id, candidate_auth_user_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE writing_documents;`);
};
