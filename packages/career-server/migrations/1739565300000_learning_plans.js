/**
 * CV13: Skill gaps, learning plans, course/credential links,
 * time/budget constraints, practical project briefs and rubrics,
 * progress tracking, and resulting evidence mapping.
 *
 * Entitlement: 'skill_report' unit (feature 'skillReports').
 * Included project brief with rubrics is included at 0 extra debit.
 * Activates 'skillReports' and 'projectBriefInSkillReport' feature flags.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE skill_gap_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      target_role text NOT NULL,
      target_industry text,
      time_budget_hours_per_week integer NOT NULL DEFAULT 5,
      financial_budget_cents integer NOT NULL DEFAULT 0,
      skill_gaps jsonb NOT NULL,
      learning_plan jsonb NOT NULL,
      project_brief jsonb,
      progress jsonb NOT NULL DEFAULT '{"completedItemIds": [], "percent": 0}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX skill_gap_reports_candidate_idx
      ON skill_gap_reports (workspace_id, candidate_auth_user_id, created_at DESC);

    INSERT INTO feature_flags (feature, enabled)
    VALUES 
      ('skillReports', true),
      ('projectBriefInSkillReport', true)
    ON CONFLICT (feature) DO UPDATE SET enabled = true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE skill_gap_reports;
  `);
};
