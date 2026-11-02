/**
 * catalog_versions from docs/DATA_MODEL.md.
 * version is the primary key. The snapshot holds the published catalog.
 */
exports.up = (pgm) => {
  pgm.createTable('catalog_versions', {
    version: { type: 'text', primaryKey: true, notNull: true },
    published_at: { type: 'timestamptz', notNull: true },
    snapshot: { type: 'jsonb', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('catalog_versions');
};
