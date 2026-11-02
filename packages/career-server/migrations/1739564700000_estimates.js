/**
 * CV10: a saved estimate. Checkout refuses it once it expires or the
 * catalog version moves. Nothing here charges a card.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE estimates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      catalog_version text NOT NULL,
      plan_id text NOT NULL,
      interval text NOT NULL CHECK (interval IN ('monthly', 'annual')),
      body jsonb NOT NULL,
      result jsonb NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX estimates_account_idx ON estimates (billing_account_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE estimates;`);
};
