/**
 * CV09: one text-interview session spends one text_interview.
 * Later answers, challenges, and STAR stories do not write the ledger.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE interview_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      opportunity_id uuid NOT NULL REFERENCES opportunities(id),
      opportunity_revision_id uuid NOT NULL REFERENCES opportunity_revisions(id),
      stage text NOT NULL
        CHECK (stage IN ('recruiter', 'behavioral', 'technical', 'panel', 'presentation')),
      title text NOT NULL,
      questions jsonb NOT NULL,
      summary text NOT NULL DEFAULT 'No answers yet.',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX interview_sessions_candidate_idx
      ON interview_sessions (workspace_id, candidate_auth_user_id, created_at DESC);

    CREATE TABLE interview_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES interview_sessions(id),
      question_index int NOT NULL CHECK (question_index BETWEEN 1 AND 10),
      answer text NOT NULL,
      feedback jsonb NOT NULL,
      challenge text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (session_id, question_index)
    );

    CREATE TABLE star_stories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      fact_ids uuid[] NOT NULL DEFAULT '{}',
      situation text NOT NULL,
      task text NOT NULL,
      action text NOT NULL,
      result text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX star_stories_candidate_idx
      ON star_stories (workspace_id, candidate_auth_user_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE star_stories;
    DROP TABLE interview_answers;
    DROP TABLE interview_sessions;
  `);
};
