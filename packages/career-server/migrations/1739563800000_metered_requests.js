/**
 * docs/DATA_MODEL.md `ai_jobs`: the execution that a `usage_ledger`
 * reservation pays for. The reservation and this row are inserted in one
 * transaction, so neither exists without the other. A replayed
 * idempotency key returns the saved `result` instead of running again.
 *
 * Added beside the data model's columns: `billing_account_id` and `kind`
 * (which operation, so a key reused for another operation is refused),
 * `error_code` instead of free-text `error` (no provider message is
 * stored), and `running` as the first status because Phase 1 executes on
 * the request. `queued` stays allowed for worker jobs.
 *
 * `feature_flags`: an operator switch per catalog feature. No row means
 * the feature's phase decides (Phase 1 on, later phases off).
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE ai_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      owner_auth_user_id text,
      kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
      unit text NOT NULL,
      ledger_id uuid NOT NULL UNIQUE REFERENCES usage_ledger(id),
      idempotency_key text NOT NULL,
      status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
      input_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
      result jsonb,
      error_code text,
      provider text,
      prompt_template_version text,
      output_schema_version text,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      CONSTRAINT ai_jobs_finished_matches CHECK ((status IN ('succeeded', 'failed')) = (finished_at IS NOT NULL)),
      CONSTRAINT ai_jobs_result_on_success CHECK (status <> 'succeeded' OR result IS NOT NULL)
    );
    CREATE INDEX ai_jobs_account_kind_open_idx ON ai_jobs (billing_account_id, kind) WHERE status IN ('queued', 'running');
    CREATE INDEX ai_jobs_running_created_idx ON ai_jobs (created_at) WHERE status = 'running';

    CREATE TABLE feature_flags (
      feature text PRIMARY KEY,
      enabled boolean NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE feature_flags;
    DROP TABLE ai_jobs;
  `);
};
