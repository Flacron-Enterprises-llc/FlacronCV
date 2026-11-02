/**
 * Persist the cover-letter preview family on writing_documents.
 * Existing rows default to classic. Bios and other types keep the column
 * but only cover letters use it for preview and export chrome.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE writing_documents
      ADD COLUMN template_id text NOT NULL DEFAULT 'classic';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE writing_documents DROP COLUMN template_id;`);
};
