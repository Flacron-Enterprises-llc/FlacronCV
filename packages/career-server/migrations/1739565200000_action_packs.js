/**
 * CV12: Opportunity to Action Engine.
 * Single pack debit (1 action_pack unit) for bundled generation:
 * - Fit explanation
 * - Skill gaps breakdown
 * - Tailored resume
 * - Grounded cover letter
 * - Preparation checklist
 * - Next steps recommendations
 * Freezes immutable snapshots of vacancy and confirmed career facts.
 * Activates 'actionPacks' feature flag.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE action_packs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      opportunity_revision_id uuid NOT NULL REFERENCES opportunity_revisions(id) ON DELETE CASCADE,
      vacancy_snapshot jsonb NOT NULL,
      profile_snapshot jsonb NOT NULL,
      fit jsonb NOT NULL,
      tailored_resume jsonb NOT NULL,
      cover_letter jsonb NOT NULL,
      checklist jsonb NOT NULL,
      next_steps jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX action_packs_candidate_idx
      ON action_packs (workspace_id, candidate_auth_user_id, created_at DESC);

    CREATE INDEX action_packs_opportunity_idx
      ON action_packs (workspace_id, candidate_auth_user_id, opportunity_id);

    INSERT INTO feature_flags (feature, enabled)
    VALUES ('actionPacks', true)
    ON CONFLICT (feature) DO UPDATE SET enabled = true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE action_packs;
  `);
};
