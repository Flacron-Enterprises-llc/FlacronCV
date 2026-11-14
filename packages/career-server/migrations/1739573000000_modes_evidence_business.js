/**
 * Spec sections 3, 4, 19, 25, 27, 29, 30 (CV11, CV14, CV16, CV18, CV21, CV23).
 *
 * Additive and safe on existing rows:
 * - Specialist modes become the spec's nine situations. The six old values
 *   were industries, not situations, so only the two with a clear meaning are
 *   carried over (career_transition -> career_changers, executive_leadership ->
 *   experienced_professionals); every old value is kept in `legacy_mode` and
 *   the rest become "no mode chosen" rather than a guessed situation.
 * - Work authorization gains "not_stated", which is now the default. Rows that
 *   still hold the old default "authorized" were written by forms that
 *   preselected it or by the alerts writer that never asked, so they become
 *   "not_stated": an assumed authorization must not survive as a fact.
 * - Location profiles separate current and future places, move and
 *   availability dates, a remote-eligibility region distinct from the city
 *   radius, and whether a licence is confirmed to transfer (never assumed).
 * - Evidence keeps a verification history; the shown label is derived from
 *   active (not expired, not revoked) checks.
 * - Business staff and candidates gain expiring, revocable invitations, roles
 *   for billing administrators, archive state, and the candidate's consent to
 *   share. A shared opportunity queue is per workspace.
 * - API keys gain an environment (test/live), revocation, and a per-key
 *   request window for rate limiting.
 *
 * No new column ends in `auth_user_id`: an accepted candidate is linked through
 * `users.id` with ON DELETE SET NULL, so account deletion clears the link.
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- Specialist modes ------------------------------------------------------
    ALTER TABLE candidate_specialist_modes
      DROP CONSTRAINT IF EXISTS candidate_specialist_modes_mode_check,
      ADD COLUMN IF NOT EXISTS legacy_mode text,
      ADD COLUMN IF NOT EXISTS modes jsonb NOT NULL DEFAULT '[]'::jsonb,
      ALTER COLUMN mode DROP DEFAULT,
      ALTER COLUMN mode DROP NOT NULL;

    UPDATE candidate_specialist_modes
       SET legacy_mode = mode
     WHERE mode IN ('general', 'technical_engineering', 'executive_leadership', 'creative_design', 'academic_research', 'career_transition');

    UPDATE candidate_specialist_modes
       SET mode = CASE legacy_mode
                    WHEN 'career_transition' THEN 'career_changers'
                    WHEN 'executive_leadership' THEN 'experienced_professionals'
                    ELSE NULL
                  END
     WHERE legacy_mode IS NOT NULL AND mode = legacy_mode;

    UPDATE candidate_specialist_modes
       SET modes = CASE WHEN mode IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(mode) END;

    ALTER TABLE candidate_specialist_modes
      ADD CONSTRAINT candidate_specialist_modes_mode_check CHECK (
        mode IS NULL OR mode IN (
          'students_graduates', 'career_changers', 'experienced_professionals', 'freelancers',
          'returning_workers', 'veterans', 'military_spouses', 'international_candidates', 'trades_licensed'
        )
      );

    -- Location profiles ----------------------------------------------------
    ALTER TABLE location_profiles
      DROP CONSTRAINT IF EXISTS location_profiles_work_authorization_check;
    UPDATE location_profiles SET work_authorization = 'not_stated' WHERE work_authorization = 'authorized';
    ALTER TABLE location_profiles
      ALTER COLUMN work_authorization SET DEFAULT 'not_stated',
      ADD CONSTRAINT location_profiles_work_authorization_check CHECK (
        work_authorization IN ('not_stated', 'citizen', 'permanent_resident', 'visa_holder', 'needs_sponsorship', 'authorized')
      ),
      ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'current' CHECK (kind IN ('current', 'future')),
      ADD COLUMN IF NOT EXISTS move_date date,
      ADD COLUMN IF NOT EXISTS available_from date,
      ADD COLUMN IF NOT EXISTS remote_region text CHECK (remote_region IS NULL OR length(remote_region) <= 120),
      ADD COLUMN IF NOT EXISTS license_transfer text NOT NULL DEFAULT 'not_stated'
        CHECK (license_transfer IN ('not_stated', 'confirmed', 'not_confirmed'));
    UPDATE location_profiles SET kind = 'future' WHERE is_relocation = true;

    -- Scenarios --------------------------------------------------------------
    ALTER TABLE career_scenarios
      ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS location_profile_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS skill_report_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    CREATE INDEX IF NOT EXISTS career_scenarios_owner_idx ON career_scenarios (workspace_id, candidate_auth_user_id, created_at DESC);

    -- Maintenance -------------------------------------------------------------
    ALTER TABLE career_achievements
      ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS achieved_on date,
      ADD COLUMN IF NOT EXISTS fact_id uuid REFERENCES career_facts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS evidence_id uuid REFERENCES career_evidence(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE career_promotion_goals
      ADD COLUMN IF NOT EXISTS target_date date,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'dropped')),
      ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
      ADD COLUMN IF NOT EXISTS confirmed_fact_id uuid REFERENCES career_facts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE credential_reminders
      ADD COLUMN IF NOT EXISTS issuer text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS review_on date,
      ADD COLUMN IF NOT EXISTS fact_id uuid REFERENCES career_facts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS evidence_id uuid REFERENCES career_evidence(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    CREATE INDEX IF NOT EXISTS credential_reminders_due_idx ON credential_reminders (expires_on);

    -- Evidence ----------------------------------------------------------------
    ALTER TABLE career_evidence
      ADD COLUMN IF NOT EXISTS linked_fact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS redaction_note text,
      ADD COLUMN IF NOT EXISTS redaction_confirmed_at timestamptz;

    CREATE TABLE IF NOT EXISTS evidence_verifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      evidence_id uuid NOT NULL REFERENCES career_evidence(id) ON DELETE CASCADE,
      label text NOT NULL CHECK (label IN ('assessment_completed', 'issuer_verified', 'reference_confirmed')),
      method text NOT NULL CHECK (method IN ('issuer_registry', 'issuer_contact', 'assessment', 'reference_contact', 'other')),
      checked_on date NOT NULL,
      scope text NOT NULL CHECK (length(scope) BETWEEN 1 AND 500),
      issuer_name text NOT NULL CHECK (length(issuer_name) BETWEEN 1 AND 200),
      permission_evidence text NOT NULL CHECK (length(permission_evidence) BETWEEN 1 AND 500),
      expires_on date,
      revoked_at timestamptz,
      revoked_reason text,
      recorded_by text NOT NULL DEFAULT 'operator' CHECK (recorded_by IN ('operator')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS evidence_verifications_item_idx ON evidence_verifications (evidence_id, created_at DESC);

    -- Portfolios --------------------------------------------------------------
    ALTER TABLE portfolios
      ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL
        DEFAULT '{"summary": true, "evidence": true, "skills": true, "contact": true}'::jsonb;
    ALTER TABLE portfolio_evidence
      ADD COLUMN IF NOT EXISTS case_study text NOT NULL DEFAULT '' CHECK (length(case_study) <= 4000);

    -- Business workspace -----------------------------------------------------
    ALTER TABLE business_staff
      DROP CONSTRAINT IF EXISTS business_staff_role_check,
      ALTER COLUMN auth_user_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS invite_email text,
      ADD COLUMN IF NOT EXISTS invite_token_hash text UNIQUE,
      ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS invite_revoked_at timestamptz,
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
    UPDATE business_staff SET accepted_at = created_at WHERE auth_user_id IS NOT NULL AND accepted_at IS NULL;
    ALTER TABLE business_staff
      ADD CONSTRAINT business_staff_role_check CHECK (role IN ('counselor', 'manager', 'billing_admin')),
      ADD CONSTRAINT business_staff_member_or_invite CHECK (auth_user_id IS NOT NULL OR invite_email IS NOT NULL);

    ALTER TABLE business_candidates
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'archived')),
      ADD COLUMN IF NOT EXISTS invite_token_hash text UNIQUE,
      ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
      ADD COLUMN IF NOT EXISTS invite_revoked_at timestamptz,
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
      ADD COLUMN IF NOT EXISTS archived_at timestamptz,
      ADD COLUMN IF NOT EXISTS member_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS share_profile boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS business_candidates_member_idx ON business_candidates (member_user_id) WHERE member_user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS business_queue_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      url text CHECK (url IS NULL OR length(url) <= 500),
      note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
      candidate_id uuid REFERENCES business_candidates(id) ON DELETE CASCADE,
      added_by_staff_id uuid REFERENCES business_staff(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recommended', 'closed')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS business_queue_items_workspace_idx ON business_queue_items (workspace_id, created_at DESC);

    -- API keys ------------------------------------------------------------------
    ALTER TABLE api_keys
      ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('test', 'live')),
      ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
      ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

    CREATE TABLE IF NOT EXISTS api_key_windows (
      key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      window_start timestamptz NOT NULL,
      requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
      PRIMARY KEY (key_id, window_start)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS api_key_windows;
    ALTER TABLE api_keys DROP COLUMN IF EXISTS last_used_at, DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS environment;

    DROP TABLE IF EXISTS business_queue_items;
    ALTER TABLE business_candidates
      DROP COLUMN IF EXISTS share_profile, DROP COLUMN IF EXISTS member_user_id, DROP COLUMN IF EXISTS archived_at,
      DROP COLUMN IF EXISTS accepted_at, DROP COLUMN IF EXISTS invite_revoked_at, DROP COLUMN IF EXISTS invite_expires_at,
      DROP COLUMN IF EXISTS invite_token_hash, DROP COLUMN IF EXISTS status;
    DELETE FROM business_assignments WHERE staff_id IN (SELECT id FROM business_staff WHERE auth_user_id IS NULL OR role = 'billing_admin');
    DELETE FROM business_staff WHERE auth_user_id IS NULL OR role = 'billing_admin';
    ALTER TABLE business_staff
      DROP CONSTRAINT IF EXISTS business_staff_member_or_invite,
      DROP CONSTRAINT IF EXISTS business_staff_role_check,
      DROP COLUMN IF EXISTS accepted_at, DROP COLUMN IF EXISTS invite_revoked_at, DROP COLUMN IF EXISTS invite_expires_at,
      DROP COLUMN IF EXISTS invite_token_hash, DROP COLUMN IF EXISTS invite_email,
      ALTER COLUMN auth_user_id SET NOT NULL,
      ADD CONSTRAINT business_staff_role_check CHECK (role IN ('counselor', 'manager'));

    ALTER TABLE portfolio_evidence DROP COLUMN IF EXISTS case_study;
    ALTER TABLE portfolios DROP COLUMN IF EXISTS sections;

    DROP TABLE IF EXISTS evidence_verifications;
    ALTER TABLE career_evidence
      DROP COLUMN IF EXISTS redaction_confirmed_at, DROP COLUMN IF EXISTS redaction_note,
      DROP COLUMN IF EXISTS confidential, DROP COLUMN IF EXISTS linked_fact_ids;

    DROP INDEX IF EXISTS credential_reminders_due_idx;
    ALTER TABLE credential_reminders
      DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS evidence_id, DROP COLUMN IF EXISTS fact_id,
      DROP COLUMN IF EXISTS review_on, DROP COLUMN IF EXISTS region, DROP COLUMN IF EXISTS issuer;
    ALTER TABLE career_promotion_goals
      DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS confirmed_fact_id, DROP COLUMN IF EXISTS confirmed_at,
      DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS target_date;
    ALTER TABLE career_achievements
      DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS evidence_id, DROP COLUMN IF EXISTS fact_id,
      DROP COLUMN IF EXISTS achieved_on, DROP COLUMN IF EXISTS details;

    DROP INDEX IF EXISTS career_scenarios_owner_idx;
    ALTER TABLE career_scenarios
      DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS skill_report_ids,
      DROP COLUMN IF EXISTS location_profile_ids, DROP COLUMN IF EXISTS title;

    ALTER TABLE location_profiles
      DROP COLUMN IF EXISTS license_transfer, DROP COLUMN IF EXISTS remote_region, DROP COLUMN IF EXISTS available_from,
      DROP COLUMN IF EXISTS move_date, DROP COLUMN IF EXISTS kind,
      DROP CONSTRAINT IF EXISTS location_profiles_work_authorization_check;
    UPDATE location_profiles SET work_authorization = 'authorized' WHERE work_authorization = 'not_stated';
    ALTER TABLE location_profiles
      ALTER COLUMN work_authorization SET DEFAULT 'authorized',
      ADD CONSTRAINT location_profiles_work_authorization_check CHECK (
        work_authorization IN ('citizen', 'permanent_resident', 'visa_holder', 'needs_sponsorship', 'authorized')
      );

    ALTER TABLE candidate_specialist_modes DROP CONSTRAINT IF EXISTS candidate_specialist_modes_mode_check;
    UPDATE candidate_specialist_modes SET mode = COALESCE(legacy_mode, CASE mode
      WHEN 'career_changers' THEN 'career_transition'
      WHEN 'experienced_professionals' THEN 'executive_leadership'
      ELSE 'general' END);
    ALTER TABLE candidate_specialist_modes
      ALTER COLUMN mode SET NOT NULL,
      ALTER COLUMN mode SET DEFAULT 'general',
      DROP COLUMN IF EXISTS modes,
      DROP COLUMN IF EXISTS legacy_mode,
      ADD CONSTRAINT candidate_specialist_modes_mode_check CHECK (
        mode IN ('general', 'technical_engineering', 'executive_leadership', 'creative_design', 'academic_research', 'career_transition')
      );
  `);
};
