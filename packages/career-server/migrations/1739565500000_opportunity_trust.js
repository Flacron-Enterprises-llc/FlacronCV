/**
 * CV15: Opportunity trust signals, user reports, and moderation queue.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE opportunities
      ADD COLUMN moderation_status text NOT NULL DEFAULT 'unflagged'
        CHECK (moderation_status IN ('unflagged', 'flagged', 'under_review', 'verified', 'suppressed'));

    CREATE INDEX opportunities_moderation_idx ON opportunities (moderation_status);

    CREATE TABLE opportunity_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      candidate_auth_user_id text NOT NULL,
      reason text NOT NULL CHECK (reason IN ('suspicious_fee', 'misleading', 'expired_closed', 'duplicate', 'scam', 'other')),
      notes text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      reviewer_auth_user_id text,
      review_action text CHECK (review_action IS NULL OR review_action IN ('verify', 'suppress', 'dismiss')),
      review_notes text
    );

    CREATE INDEX opportunity_reports_opp_idx ON opportunity_reports (opportunity_id, status);
    CREATE INDEX opportunity_reports_candidate_idx ON opportunity_reports (candidate_auth_user_id, opportunity_id);
    CREATE UNIQUE INDEX opportunity_reports_pending_user_idx
      ON opportunity_reports (opportunity_id, candidate_auth_user_id)
      WHERE status = 'pending';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE opportunity_reports;
    DROP INDEX opportunities_moderation_idx;
    ALTER TABLE opportunities
      DROP COLUMN moderation_status;
  `);
};
