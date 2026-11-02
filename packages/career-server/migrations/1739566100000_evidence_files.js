/**
 * CV11 private evidence files (spec "Security and data control"). A stored
 * file lives in object storage under a server-built key; the row keeps the
 * key, the verified type, size, and a SHA-256. `attachment_url` stays for an
 * external link, and an item has either a link or a stored file.
 * Retained bytes for the storage allowance are the sum of
 * `attachment_size_bytes` where `attachment_object_key` is set.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE career_evidence
      ADD COLUMN attachment_object_key text,
      ADD COLUMN attachment_content_type text,
      ADD COLUMN attachment_sha256 text,
      ADD COLUMN attachment_uploaded_at timestamptz,
      ADD CONSTRAINT career_evidence_stored_file_complete CHECK (
        attachment_object_key IS NULL OR (
          attachment_content_type IS NOT NULL
          AND attachment_size_bytes IS NOT NULL
          AND attachment_sha256 IS NOT NULL
          AND attachment_uploaded_at IS NOT NULL
          AND attachment_url IS NULL
        )
      );

    CREATE UNIQUE INDEX career_evidence_object_key_idx
      ON career_evidence (attachment_object_key) WHERE attachment_object_key IS NOT NULL;
    CREATE INDEX career_evidence_stored_bytes_idx
      ON career_evidence (workspace_id) WHERE attachment_object_key IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX career_evidence_stored_bytes_idx;
    DROP INDEX career_evidence_object_key_idx;
    ALTER TABLE career_evidence
      DROP CONSTRAINT career_evidence_stored_file_complete,
      DROP COLUMN attachment_uploaded_at,
      DROP COLUMN attachment_sha256,
      DROP COLUMN attachment_content_type,
      DROP COLUMN attachment_object_key;
  `);
};
