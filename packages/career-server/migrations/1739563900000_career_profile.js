/**
 * CV01: docs/DATA_MODEL.md `career_facts` and `import_daily_counts`, plus
 * what spec section 21 "Master profile" asks the store to keep:
 * provenance (`source`, `import_id`), confirmation, dates, role ownership
 * (an achievement's `experienceFactId` in `value`), and version history
 * (`career_fact_revisions`).
 *
 * `career_profiles.version` is the profile version a match result is
 * cached against (section 18). Every fact or preference change bumps it in
 * the same transaction.
 *
 * `resume_imports` records where draft facts came from. It stores a hash
 * and a length, not the resume text.
 *
 * `import_daily_counts.pending` holds imports still running, so two at
 * once cannot both take the last slot. Only a completed import moves to
 * `count`; a failure gives its pending slot back.
 *
 * Every row here is personal data. Account deletion removes it by
 * `candidate_auth_user_id` (DATA_MODEL "Account deletion"): facts first,
 * then imports, which is why `import_id` has no ON DELETE action.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE career_profiles (
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, candidate_auth_user_id)
    );

    CREATE TABLE resume_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      file_name text CHECK (file_name IS NULL OR length(file_name) <= 255),
      format text NOT NULL CHECK (format IN ('pdf', 'docx', 'text')),
      text_sha256 text NOT NULL CHECK (length(text_sha256) = 64),
      char_count integer NOT NULL CHECK (char_count > 0),
      provider text NOT NULL,
      model text NOT NULL,
      prompt_template_version text NOT NULL,
      output_schema_version text NOT NULL,
      fact_count integer NOT NULL CHECK (fact_count >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX resume_imports_candidate_idx ON resume_imports (workspace_id, candidate_auth_user_id);

    CREATE TABLE career_facts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      fact_type text NOT NULL CHECK (fact_type IN (
        'contact', 'summary', 'experience', 'education', 'skill',
        'project', 'achievement', 'certification', 'language', 'reference'
      )),
      value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
      source text NOT NULL CHECK (source IN ('manual', 'paste', 'import', 'migrated')),
      confirmation text NOT NULL CHECK (confirmation IN ('draft', 'confirmed')),
      uncertain jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(uncertain) = 'object'),
      import_id uuid REFERENCES resume_imports(id),
      revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      confirmed_at timestamptz,
      CONSTRAINT career_facts_confirmed_at CHECK ((confirmation = 'confirmed') = (confirmed_at IS NOT NULL)),
      CONSTRAINT career_facts_confirmed_is_certain CHECK (confirmation = 'draft' OR uncertain = '{}'::jsonb),
      CONSTRAINT career_facts_import_source CHECK (source <> 'import' OR import_id IS NOT NULL)
    );
    CREATE INDEX career_facts_candidate_idx ON career_facts (workspace_id, candidate_auth_user_id, fact_type);

    CREATE TABLE career_fact_revisions (
      fact_id uuid NOT NULL REFERENCES career_facts(id) ON DELETE CASCADE,
      revision integer NOT NULL,
      value jsonb NOT NULL,
      confirmation text NOT NULL CHECK (confirmation IN ('draft', 'confirmed')),
      uncertain jsonb NOT NULL,
      change text NOT NULL CHECK (change IN ('created', 'edited', 'confirmed')),
      changed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (fact_id, revision)
    );

    CREATE TABLE import_daily_counts (
      auth_user_id text NOT NULL,
      usage_date date NOT NULL,
      count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
      pending integer NOT NULL DEFAULT 0 CHECK (pending >= 0),
      PRIMARY KEY (auth_user_id, usage_date)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE import_daily_counts;
    DROP TABLE career_fact_revisions;
    DROP TABLE career_facts;
    DROP TABLE resume_imports;
    DROP TABLE career_profiles;
  `);
};
