/**
 * Operator audit. The row names the action and the target. It does not
 * store a candidate document.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE admin_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_auth_user_id text NOT NULL,
      action text NOT NULL,
      target text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX admin_audit_created_idx ON admin_audit (created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE admin_audit;`);
};
