/**
 * CV17: voice practice time is metered by the second.
 * Whole minutes already consumed are voice_minute ledger rows.
 * The leftover seconds live on voice_meter_remainders.
 * Deleting a recording keeps the session summary.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE recording_consents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      consent_version text NOT NULL,
      consented_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, candidate_auth_user_id, consent_version)
    );

    CREATE TABLE voice_interview_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      candidate_auth_user_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('practice', 'negotiation')),
      opportunity_id uuid REFERENCES opportunities(id),
      stage text,
      title text NOT NULL,
      prompt text NOT NULL,
      fact_text text NOT NULL DEFAULT '',
      guidance text,
      summary text NOT NULL DEFAULT 'No recording yet.',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX voice_interview_sessions_candidate_idx
      ON voice_interview_sessions (workspace_id, candidate_auth_user_id, created_at DESC);

    CREATE TABLE voice_audio_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL UNIQUE REFERENCES voice_interview_sessions(id),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      idempotency_key text NOT NULL,
      request_fingerprint text NOT NULL,
      duration_seconds int NOT NULL CHECK (duration_seconds >= 1),
      requested_seconds int NOT NULL CHECK (requested_seconds >= 1),
      truncated boolean NOT NULL DEFAULT false,
      transcript text NOT NULL,
      feedback jsonb NOT NULL,
      audio_deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (billing_account_id, idempotency_key)
    );

    CREATE TABLE voice_meter_remainders (
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      allowance_period_start timestamptz NOT NULL,
      remainder_seconds int NOT NULL CHECK (remainder_seconds >= 0 AND remainder_seconds < 60),
      PRIMARY KEY (billing_account_id, allowance_period_start)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE voice_meter_remainders;
    DROP TABLE voice_audio_records;
    DROP TABLE voice_interview_sessions;
    DROP TABLE recording_consents;
  `);
};
