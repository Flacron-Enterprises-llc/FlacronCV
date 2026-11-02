/**
 * CV02: docs/DATA_MODEL.md `resumes` and `resume_versions`. A generation
 * inserts a version. It does not overwrite an older one, because an
 * application stores the version id.
 *
 * `opportunities` and `opportunity_revisions` are the listing a tailored
 * version points at. Item 9 fills them from the feeds. Until then only
 * tests and a later paste insert rows. `description` is the listing text
 * the tailor may read; the data model had no column for it.
 *
 * Resume rows are personal. Account deletion removes them by
 * `candidate_auth_user_id`. Opportunity rows are shared listings and stay.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE opportunities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category text NOT NULL CHECK (length(category) BETWEEN 1 AND 64),
      provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
      source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      organization text NOT NULL CHECK (length(organization) BETWEEN 1 AND 300),
      status text NOT NULL CHECK (status IN ('open', 'closed')),
      current_revision_id uuid,
      UNIQUE (provider, source_id)
    );

    CREATE TABLE opportunity_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      revision integer NOT NULL CHECK (revision >= 1),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      organization text NOT NULL CHECK (length(organization) BETWEEN 1 AND 300),
      locations jsonb NOT NULL DEFAULT '[]'::jsonb,
      eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
      compensation jsonb NOT NULL DEFAULT '{}'::jsonb,
      deadline text,
      source_url text,
      checked_at timestamptz NOT NULL DEFAULT now(),
      material boolean NOT NULL DEFAULT true,
      status text NOT NULL CHECK (status IN ('open', 'closed')),
      description text NOT NULL DEFAULT '',
      UNIQUE (opportunity_id, revision)
    );

    ALTER TABLE opportunities
      ADD CONSTRAINT opportunities_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES opportunity_revisions(id);

    CREATE TABLE resumes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      language text NOT NULL CHECK (language IN ('en', 'fr')),
      template_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX resumes_candidate_idx ON resumes (workspace_id, candidate_auth_user_id);

    CREATE TABLE resume_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      version_number integer NOT NULL CHECK (version_number >= 1),
      body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
      fact_ids uuid[] NOT NULL DEFAULT '{}',
      opportunity_revision_id uuid REFERENCES opportunity_revisions(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (resume_id, version_number)
    );
    CREATE INDEX resume_versions_resume_idx ON resume_versions (resume_id, version_number DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE resume_versions;
    DROP TABLE resumes;
    ALTER TABLE opportunities DROP CONSTRAINT opportunities_current_revision_fk;
    DROP TABLE opportunity_revisions;
    DROP TABLE opportunities;
  `);
};
