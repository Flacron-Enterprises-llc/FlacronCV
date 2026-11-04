/**
 * V1 integration: the address an erasure uses to find business invitations
 * that name the person (`business_candidates.email`).
 *
 * Background and resumed erasures run without the person's ID token, so
 * before this they erased with no address and left invitations behind. The
 * column holds only an address the person's own verified Firebase token
 * carried (trimmed, lower-cased like invitations), lives on the person's own
 * `users` row, is never exported or shown, and is removed with that row when
 * the erase finishes. Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE users ADD COLUMN erasure_email text;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE users DROP COLUMN erasure_email;`);
};
