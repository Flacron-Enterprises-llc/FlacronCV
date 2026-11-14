/**
 * CV13: a skill-gap report also records bridge roles (realistic steps toward
 * the target) and transferable skills (each tied to the confirmed facts that
 * show it). Existing reports read as having none. Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE skill_gap_reports
      ADD COLUMN bridge_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN transferable_skills jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE skill_gap_reports DROP COLUMN transferable_skills, DROP COLUMN bridge_roles;
  `);
};
