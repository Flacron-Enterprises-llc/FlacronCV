/**
 * Career coach (spec section 26, "AI career copilot / coaching responses").
 *
 * - `coaching_threads`: one private conversation per row. `opportunity_id` is
 *   the saved listing it is about, if any; deleting the listing keeps the
 *   conversation (SET NULL).
 * - `coaching_messages`: the questions and the replies. Each assistant row was
 *   one `coaching_response`, recorded in usage_ledger / ai_jobs like every
 *   other paid AI call; provider and model are kept for provenance.
 *
 * Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE coaching_threads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
      title text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX coaching_threads_candidate_idx
      ON coaching_threads (workspace_id, candidate_auth_user_id, updated_at DESC);

    CREATE TABLE coaching_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id uuid NOT NULL REFERENCES coaching_threads(id) ON DELETE CASCADE,
      -- 1, 2, 3 … within the thread. A question and its reply are saved in one
      -- transaction (same now()), so time alone cannot order them.
      position integer NOT NULL CHECK (position >= 1),
      role text NOT NULL CHECK (role IN ('user', 'assistant')),
      content text NOT NULL,
      provider text,
      model text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (thread_id, position)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE coaching_messages;
    DROP TABLE coaching_threads;
  `);
};
