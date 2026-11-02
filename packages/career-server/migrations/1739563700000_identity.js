/**
 * docs/DATA_MODEL.md `legal_acceptances` and `push_tokens`.
 *
 * Both rows belong to a `users` row and go with it on account deletion
 * (ON DELETE CASCADE). `auth_user_id` is kept on each row as the data
 * model lists it, so the V1 copy can key on the Firebase uid.
 *
 * A legal row stores no email. V1 stored the email on the document; V2
 * reads it from the token when it needs it.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE legal_acceptances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      auth_user_id text NOT NULL UNIQUE,
      terms_accepted boolean NOT NULL CHECK (terms_accepted),
      privacy_accepted boolean NOT NULL CHECK (privacy_accepted),
      disclaimer_accepted boolean NOT NULL CHECK (disclaimer_accepted),
      terms_version text NOT NULL CHECK (length(terms_version) > 0),
      privacy_version text NOT NULL CHECK (length(privacy_version) > 0),
      disclaimer_version text NOT NULL CHECK (length(disclaimer_version) > 0),
      accepted_at timestamptz NOT NULL
    );

    CREATE TABLE push_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      auth_user_id text NOT NULL,
      token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 1 AND 512),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX push_tokens_user_id_idx ON push_tokens (user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE push_tokens;
    DROP TABLE legal_acceptances;
  `);
};
