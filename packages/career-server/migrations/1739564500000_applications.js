/**
 * CV08: one application per person and listing. Status, notes, contacts,
 * dates, and the checklist do not write the ledger. Reminders do not either.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      opportunity_revision_id uuid NOT NULL REFERENCES opportunity_revisions(id),
      resume_version_id uuid REFERENCES resume_versions(id),
      letter_version_id uuid REFERENCES writing_documents(id),
      status text NOT NULL DEFAULT 'saved'
        CHECK (status IN ('saved', 'preparing', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn')),
      contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
      notes text NOT NULL DEFAULT '',
      dates jsonb NOT NULL DEFAULT '{}'::jsonb,
      checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (candidate_auth_user_id, opportunity_id)
    );

    CREATE INDEX applications_candidate_idx
      ON applications (workspace_id, candidate_auth_user_id, updated_at DESC);

    CREATE TABLE application_reminders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id uuid NOT NULL REFERENCES applications(id),
      remind_at timestamptz NOT NULL,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE application_reminders;
    DROP TABLE applications;
  `);
};
