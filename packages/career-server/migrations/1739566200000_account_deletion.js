/**
 * Account deletion that can be retried and cannot be undone by late writers.
 *
 * `users.deletion_requested_at` is set first. Once set, requests other than
 * the deletion itself are refused, and background writers check it under a
 * row lock before saving (packages/server/src/privacy/live-person.ts). The
 * row, and so the marker, is removed by the final erase transaction.
 *
 * `stored_object_intents` records an object key before the file is written.
 * The row is removed in the same transaction that records the file on its
 * item, so a key that is still listed after a failure belongs to an object
 * that may exist with nothing pointing at it. Account deletion and later
 * uploads delete those objects.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN deletion_requested_at timestamptz;

    CREATE TABLE stored_object_intents (
      object_key text PRIMARY KEY,
      candidate_auth_user_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX stored_object_intents_candidate_idx ON stored_object_intents (candidate_auth_user_id, created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE stored_object_intents;
    ALTER TABLE users DROP COLUMN deletion_requested_at;
  `);
};
