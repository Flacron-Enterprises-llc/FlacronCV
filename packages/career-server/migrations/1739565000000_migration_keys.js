/**
 * One row per copied V1 document. A second apply finds the pair and
 * does not rewrite the destination.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE migration_keys (
      origin_collection text NOT NULL,
      origin_id text NOT NULL,
      destination_table text NOT NULL,
      destination_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (origin_collection, origin_id)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE migration_keys;`);
};
