/**
 * `stored_object_intents` becomes a durable cleanup queue.
 *
 * A row names an object that may exist and must be deleted unless an item or
 * a live export points at it, once `not_before` has passed. An upload inserts
 * its row with `not_before` ten minutes ahead and locks it for the length of
 * its transaction, so an upload in progress is never claimed. The sweeper
 * (`StorageCleanupService`) claims due rows with `FOR UPDATE SKIP LOCKED`,
 * pushes `not_before` out by a lease while it works, and on failure records
 * the error code and backs off. Deleting an object that is already gone
 * succeeds, so a repeat is harmless.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE stored_object_intents
      ADD COLUMN not_before timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      ADD COLUMN last_error text;
    UPDATE stored_object_intents SET not_before = created_at + interval '10 minutes';
    CREATE INDEX stored_object_intents_due_idx ON stored_object_intents (not_before);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX stored_object_intents_due_idx;
    ALTER TABLE stored_object_intents DROP COLUMN last_error, DROP COLUMN attempts, DROP COLUMN not_before;
  `);
};
