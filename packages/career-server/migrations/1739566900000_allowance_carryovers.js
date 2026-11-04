/**
 * Deleting and re-creating a career account must not hand out a second
 * allowance in the same period.
 *
 * At erase time the units already used in the current allowance period are
 * recorded per unit under `person_key` (a one-way hash of the sign-in id, the
 * same `personKey` used in idempotency keys and storage paths; no name,
 * email or content). A new account for the same sign-in in that period gets
 * the same period and starts with those units already used. A row is needed
 * only until its period ends and is pruned after that, so nothing is kept
 * beyond one allowance period. Legitimate renewals in the next period are
 * untouched. Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE allowance_carryovers (
      person_key text NOT NULL,
      unit text NOT NULL,
      period_end timestamptz NOT NULL,
      anchor timestamptz NOT NULL,
      used integer NOT NULL CHECK (used >= 0),
      recorded_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (person_key, unit, period_end)
    );
    CREATE INDEX allowance_carryovers_period_end_idx ON allowance_carryovers (period_end);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE allowance_carryovers;`);
};
