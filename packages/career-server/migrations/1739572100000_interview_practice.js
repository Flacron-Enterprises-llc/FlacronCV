/**
 * CV09 completion: practice by role or stage without a saved listing (so the
 * listing columns may be empty, together), and an edit time on STAR stories.
 * Additive only: existing sessions keep their listing and stories get now().
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE interview_sessions ALTER COLUMN opportunity_id DROP NOT NULL;
    ALTER TABLE interview_sessions ALTER COLUMN opportunity_revision_id DROP NOT NULL;
    ALTER TABLE interview_sessions
      ADD CONSTRAINT interview_sessions_listing_pair
      CHECK ((opportunity_id IS NULL) = (opportunity_revision_id IS NULL));

    ALTER TABLE star_stories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE star_stories DROP COLUMN updated_at;
    ALTER TABLE interview_sessions DROP CONSTRAINT interview_sessions_listing_pair;
    DELETE FROM interview_answers WHERE session_id IN (SELECT id FROM interview_sessions WHERE opportunity_id IS NULL);
    DELETE FROM interview_sessions WHERE opportunity_id IS NULL;
    ALTER TABLE interview_sessions ALTER COLUMN opportunity_revision_id SET NOT NULL;
    ALTER TABLE interview_sessions ALTER COLUMN opportunity_id SET NOT NULL;
  `);
};
