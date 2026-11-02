/**
 * V1 integration: career data of a person whose V1 account was closed
 * (soft-deleted / deactivated in V1) is erased by a sweep, so deletions that
 * did not pass through the V1 web Settings page (mobile app, admin action)
 * still cover career data. `v1_closure_checked_at` rotates the sweep through
 * users so each is re-checked about daily. Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN v1_closure_checked_at timestamptz;
    CREATE INDEX users_v1_closure_checked_idx ON users (v1_closure_checked_at NULLS FIRST) WHERE deletion_requested_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX users_v1_closure_checked_idx;
    ALTER TABLE users DROP COLUMN v1_closure_checked_at;
  `);
};
