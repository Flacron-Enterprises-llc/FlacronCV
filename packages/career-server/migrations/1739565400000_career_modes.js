/**
 * CV14: Relocation planning and specialist career modes
 * Expands location_profiles with relocation timeline, work authorization, commute, and remote flexibility.
 * Creates candidate_specialist_modes with support for technical, executive, creative, transition modes.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE location_profiles
      ADD COLUMN IF NOT EXISTS target_timeline text NOT NULL DEFAULT 'not_relocating'
        CHECK (target_timeline IN ('immediate', '1_to_3_months', '3_to_6_months', 'exploring', 'not_relocating')),
      ADD COLUMN IF NOT EXISTS is_relocation boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS work_authorization text NOT NULL DEFAULT 'authorized'
        CHECK (work_authorization IN ('citizen', 'permanent_resident', 'visa_holder', 'needs_sponsorship', 'authorized')),
      ADD COLUMN IF NOT EXISTS commute_minutes_max integer NOT NULL DEFAULT 45
        CHECK (commute_minutes_max >= 0 AND commute_minutes_max <= 240),
      ADD COLUMN IF NOT EXISTS remote_flexibility text NOT NULL DEFAULT 'hybrid'
        CHECK (remote_flexibility IN ('remote_only', 'hybrid', 'onsite_only', 'any')),
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    CREATE TABLE IF NOT EXISTS candidate_specialist_modes (
      candidate_auth_user_id text PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      mode text NOT NULL DEFAULT 'general'
        CHECK (mode IN ('general', 'technical_engineering', 'executive_leadership', 'creative_design', 'academic_research', 'career_transition')),
      focus_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
      custom_guidelines text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_location_profiles_candidate
      ON location_profiles (workspace_id, candidate_auth_user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS candidate_specialist_modes;
    ALTER TABLE location_profiles
      DROP COLUMN IF EXISTS target_timeline,
      DROP COLUMN IF EXISTS is_relocation,
      DROP COLUMN IF EXISTS work_authorization,
      DROP COLUMN IF EXISTS commute_minutes_max,
      DROP COLUMN IF EXISTS remote_flexibility,
      DROP COLUMN IF EXISTS notes,
      DROP COLUMN IF EXISTS updated_at;
  `);
};
