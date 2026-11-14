/**
 * CV12 follow-up: one pack reservation across component retries, edits and
 * the copy into Documents.
 *
 * - `status`: a pack whose letter failed is saved as `partial` and keeps its
 *   one `action_pack` reservation (`ledger_id`, held by `job_id`'s lease) so a
 *   retry is not charged again; it is `complete` once the credit is
 *   committed. Every existing row is a finished pack, hence the default.
 * - `cover_letter` may be null while the letter has not been written (the
 *   service writes `complete` only together with a letter).
 * - `ledger_id` / `job_id` carry no foreign key on purpose: account erasure
 *   deletes packs and ledger rows in its own order.
 * - `saved_*` point at the copies in Documents; they become null when the
 *   person deletes those documents.
 * Additive only; existing packs read exactly as before.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE action_packs
      ADD COLUMN status text NOT NULL DEFAULT 'complete'
        CHECK (status IN ('generating', 'partial', 'complete')),
      ADD COLUMN ledger_id uuid,
      ADD COLUMN job_id uuid,
      ADD COLUMN idempotency_key text,
      ADD COLUMN component_errors jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN letter_attempts integer NOT NULL DEFAULT 1 CHECK (letter_attempts >= 0),
      ADD COLUMN edited_components text[] NOT NULL DEFAULT '{}',
      ADD COLUMN saved_resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
      ADD COLUMN saved_resume_version_id uuid REFERENCES resume_versions(id) ON DELETE SET NULL,
      ADD COLUMN saved_letter_document_id uuid REFERENCES writing_documents(id) ON DELETE SET NULL;

    ALTER TABLE action_packs ALTER COLUMN cover_letter DROP NOT NULL;

    CREATE UNIQUE INDEX action_packs_ledger_idx ON action_packs (ledger_id) WHERE ledger_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX action_packs_ledger_idx;
    DELETE FROM action_packs WHERE cover_letter IS NULL;
    ALTER TABLE action_packs ALTER COLUMN cover_letter SET NOT NULL;
    ALTER TABLE action_packs
      DROP COLUMN saved_letter_document_id,
      DROP COLUMN saved_resume_version_id,
      DROP COLUMN saved_resume_id,
      DROP COLUMN edited_components,
      DROP COLUMN letter_attempts,
      DROP COLUMN component_errors,
      DROP COLUMN idempotency_key,
      DROP COLUMN job_id,
      DROP COLUMN ledger_id,
      DROP COLUMN status;
  `);
};
