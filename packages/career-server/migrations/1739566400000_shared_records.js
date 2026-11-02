/**
 * Shared customer records (docs/SHARED_RECORDS.md). V2's Postgres is the
 * one store for the CVs, cover letters and job applications that both V1
 * and V2 show. V1 reaches them through `/shared/v1`.
 *
 * `revision` is the optimistic-concurrency counter both sites send back
 * as `If-Match`. Triggers bump it on every write, whichever code path
 * wrote, so a V2 edit is never invisible to a V1 save in flight.
 *
 * `shared_record_tombstones` stops a late or retried write from bringing
 * a deleted record back. `shared_record_requests` makes a retried create
 * return the record the first attempt made. Both name the person and are
 * removed with the account.
 *
 * `writing_documents.shared_fields` keeps V1 letter fields V2 has no column
 * for (recipient, company, job, styling, status, and V1's letter HTML).
 * V1 creates a letter before it has text, so a cover letter body may be
 * empty; V2's own edit path still requires text.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE resumes ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);
    ALTER TABLE writing_documents ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);
    ALTER TABLE writing_documents ADD COLUMN shared_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shared_fields) = 'object');
    ALTER TABLE writing_documents DROP CONSTRAINT writing_documents_body_check;
    ALTER TABLE writing_documents ADD CONSTRAINT writing_documents_body_check
      CHECK (length(body) <= 20000 AND (length(body) >= 1 OR document_type = 'cover_letter'));
    ALTER TABLE applications ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);

    CREATE FUNCTION shared_bump_revision() RETURNS trigger AS $$
    BEGIN
      IF NEW.revision = OLD.revision THEN
        NEW.revision := OLD.revision + 1;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE FUNCTION shared_bump_resume_revision() RETURNS trigger AS $$
    BEGIN
      UPDATE resumes SET revision = revision + 1 WHERE id = NEW.resume_id;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER resumes_revision BEFORE UPDATE ON resumes
      FOR EACH ROW EXECUTE FUNCTION shared_bump_revision();
    CREATE TRIGGER writing_documents_revision BEFORE UPDATE ON writing_documents
      FOR EACH ROW EXECUTE FUNCTION shared_bump_revision();
    CREATE TRIGGER applications_revision BEFORE UPDATE ON applications
      FOR EACH ROW EXECUTE FUNCTION shared_bump_revision();
    CREATE TRIGGER resume_versions_revision AFTER INSERT OR UPDATE ON resume_versions
      FOR EACH ROW EXECUTE FUNCTION shared_bump_resume_revision();

    CREATE TABLE shared_record_tombstones (
      kind text NOT NULL CHECK (kind IN ('cv', 'cover_letter', 'job_application')),
      record_id uuid NOT NULL,
      candidate_auth_user_id text NOT NULL,
      deleted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, record_id)
    );
    CREATE INDEX shared_record_tombstones_owner_idx ON shared_record_tombstones (candidate_auth_user_id);

    CREATE TABLE shared_record_requests (
      auth_user_id text NOT NULL,
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
      kind text NOT NULL CHECK (kind IN ('cv', 'cover_letter', 'job_application')),
      request_hash text NOT NULL,
      record_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (auth_user_id, idempotency_key)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE shared_record_requests;
    DROP TABLE shared_record_tombstones;
    DROP TRIGGER resume_versions_revision ON resume_versions;
    DROP TRIGGER applications_revision ON applications;
    DROP TRIGGER writing_documents_revision ON writing_documents;
    DROP TRIGGER resumes_revision ON resumes;
    DROP FUNCTION shared_bump_resume_revision();
    DROP FUNCTION shared_bump_revision();
    ALTER TABLE applications DROP COLUMN revision;
    ALTER TABLE writing_documents DROP CONSTRAINT writing_documents_body_check;
    UPDATE writing_documents SET body = '-' WHERE length(body) = 0;
    ALTER TABLE writing_documents ADD CONSTRAINT writing_documents_body_check CHECK (length(body) BETWEEN 1 AND 20000);
    ALTER TABLE writing_documents DROP COLUMN shared_fields;
    ALTER TABLE writing_documents DROP COLUMN revision;
    ALTER TABLE resumes DROP COLUMN revision;
  `);
};
