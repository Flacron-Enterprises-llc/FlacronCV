/**
 * V2 has its own Firebase project, so deleting a V2 account also deletes its
 * sign-in (packages/server/src/privacy/account-privacy.service.ts).
 *
 * `users.sign_in_deleted_at` is set once the sign-in is gone. From then on
 * the person cannot sign in to retry, so an erase that was interrupted after
 * that point is finished by the API's sweep, not by the person.
 *
 * `deleted_sign_ins` keeps only the random Firebase uid of a deleted account,
 * so an ID token issued before the deletion (valid for up to an hour) cannot
 * open a new empty account. Rows older than two hours are pruned.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN sign_in_deleted_at timestamptz;
    CREATE INDEX users_sign_in_deleted_idx ON users (sign_in_deleted_at) WHERE sign_in_deleted_at IS NOT NULL;

    CREATE TABLE deleted_sign_ins (
      auth_user_id text PRIMARY KEY,
      deleted_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX deleted_sign_ins_deleted_at_idx ON deleted_sign_ins (deleted_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE deleted_sign_ins;
    DROP INDEX users_sign_in_deleted_idx;
    ALTER TABLE users DROP COLUMN sign_in_deleted_at;
  `);
};
