/**
 * Spec section 11: a refund or a reversed purchase revokes only the unused
 * part of a pack and records the adjustment. Used units stay in the ledger.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE packs
      ADD COLUMN revoked_units integer NOT NULL DEFAULT 0,
      ADD COLUMN revoked_at timestamptz,
      ADD COLUMN revoke_reason text CHECK (revoke_reason IN ('refund', 'chargeback', 'reversed')),
      ADD CONSTRAINT packs_revoked_in_range CHECK (
        revoked_units >= 0 AND remaining_units + revoked_units <= purchased_units
      ),
      ADD CONSTRAINT packs_revoked_matches CHECK (
        (status = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE packs
      DROP CONSTRAINT packs_revoked_matches,
      DROP CONSTRAINT packs_revoked_in_range,
      DROP COLUMN revoke_reason,
      DROP COLUMN revoked_at,
      DROP COLUMN revoked_units;
  `);
};
