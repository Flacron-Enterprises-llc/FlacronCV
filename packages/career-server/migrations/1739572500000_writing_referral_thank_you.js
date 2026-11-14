/**
 * Writing studio: referral requests and thank-you notes join the prose
 * types. Widening a CHECK only; every existing row already satisfies it.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE writing_documents DROP CONSTRAINT writing_documents_document_type_check;
    ALTER TABLE writing_documents ADD CONSTRAINT writing_documents_document_type_check
      CHECK (document_type IN ('cover_letter', 'bio', 'linkedin', 'outreach', 'referral_request', 'thank_you'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM writing_documents WHERE document_type IN ('referral_request', 'thank_you');
    ALTER TABLE writing_documents DROP CONSTRAINT writing_documents_document_type_check;
    ALTER TABLE writing_documents ADD CONSTRAINT writing_documents_document_type_check
      CHECK (document_type IN ('cover_letter', 'bio', 'linkedin', 'outreach'));
  `);
};
