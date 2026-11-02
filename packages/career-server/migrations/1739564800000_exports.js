/**
 * CV account export. The file lives in object storage. This row is the
 * status and the expiry. Deleting an account removes these rows. It does
 * not remove purchases or the ledger.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE account_exports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      auth_user_id text NOT NULL,
      scope text NOT NULL CHECK (scope IN ('personal', 'workspace')),
      status text NOT NULL CHECK (status IN ('queued', 'ready', 'failed')),
      object_key text,
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX account_exports_owner_idx ON account_exports (auth_user_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE account_exports;`);
};
