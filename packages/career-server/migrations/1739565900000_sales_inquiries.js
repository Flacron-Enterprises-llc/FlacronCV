/**
 * Public Contact Sales inquiries. Email delivery is a later vendor bind.
 * Rows stay with delivered = false until that vendor is configured.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE sales_inquiries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
      email text NOT NULL CHECK (length(email) BETWEEN 3 AND 200),
      organization text NOT NULL CHECK (length(organization) BETWEEN 2 AND 120),
      message text NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
      delivered boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sales_inquiries_created_idx ON sales_inquiries (created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS sales_inquiries`);
};
