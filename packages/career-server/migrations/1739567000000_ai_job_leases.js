/**
 * A paid AI job owns its credit reservation through a lease. The process
 * running the provider call renews `lease_expires_at` while it is alive (up
 * to a hard maximum); the worker sweep releases only jobs whose lease ran
 * out, so a slow but live request keeps its reservation and a crashed one
 * gives it back. The final save accepts only the current `lease_token`, so a
 * stale process cannot save or commit after the sweep released its unit.
 * Rows from before this migration have no lease and keep the old age rule.
 * Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_jobs ADD COLUMN lease_token uuid;
    ALTER TABLE ai_jobs ADD COLUMN lease_expires_at timestamptz;
    CREATE INDEX ai_jobs_running_lease_idx ON ai_jobs (lease_expires_at) WHERE status = 'running';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX ai_jobs_running_lease_idx;
    ALTER TABLE ai_jobs DROP COLUMN lease_expires_at;
    ALTER TABLE ai_jobs DROP COLUMN lease_token;
  `);
};
