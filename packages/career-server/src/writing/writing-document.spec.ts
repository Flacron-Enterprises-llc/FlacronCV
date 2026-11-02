import { letterLines, renderCoverLetterDocx, renderCoverLetterPdf } from './writing-document';

const input = {
  title: 'Cover letter',
  body: 'Généré à Montréal.\n\nI coordinated catalogue programmes for civic libraries.',
  templateId: 'modern' as const,
  watermark: false,
};

describe('cover letter files', () => {
  it('prints the title once when no sender is set, and sender then title when both exist', () => {
    expect(letterLines({ ...input, watermark: false }).filter((line) => line.role === 'name' || line.role === 'heading')).toEqual([
      { role: 'name', text: 'Cover letter' },
    ]);
    expect(
      letterLines({ ...input, sender: 'Ada Review', watermark: false }).filter((line) => line.role === 'name' || line.role === 'heading'),
    ).toEqual([
      { role: 'name', text: 'Ada Review' },
      { role: 'heading', text: 'Cover letter' },
    ]);
  });

  it('writes PDF chrome for the saved template and keeps French letters', () => {
    const pdf = renderCoverLetterPdf(input);
    const bytes = pdf.toString('latin1');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes).toContain('\\351');
    expect(bytes).toContain('catalogue programmes');
    expect(bytes).toContain('/Helvetica-Bold');
    expect(bytes).toContain('0 720 612 72 re');
  });

  it('writes a DOCX that keeps the paragraphs', () => {
    const docx = renderCoverLetterDocx({ ...input, watermark: true });
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(docx.toString('utf8')).toContain('Généré à Montréal');
    expect(docx.toString('utf8')).toContain('Prepared with FlacronCV');
  });

  it('draws a rail for the creative letter', () => {
    const pdf = renderCoverLetterPdf({ ...input, templateId: 'creative' });
    expect(pdf.toString('latin1')).toContain('0 0 168 792 re');
  });

  it('draws editorial and structured letter chrome', () => {
    const editorial = renderCoverLetterPdf({ ...input, templateId: 'editorial' }).toString('latin1');
    expect(editorial).toContain('0 0 36 792 re');
    const structured = renderCoverLetterPdf({ ...input, templateId: 'structured' }).toString('latin1');
    expect(structured).toContain('118 48 1.1 700 re');
  });

  it('keeps a paragraph’s own line breaks and spaces paragraphs apart', () => {
    const signed = { ...input, body: 'Dear committee,\n\nI coordinated catalogue programmes.\n\nSincerely,\nAda Review', sender: 'Ada Review' };
    const lines = letterLines({ ...signed, watermark: false }).filter((line) => line.role === 'body');
    expect(lines.map((line) => line.text)).toEqual(['Dear committee,', 'I coordinated catalogue programmes.', 'Sincerely,', 'Ada Review']);
    expect(lines[2]?.paragraph).toBe(lines[3]?.paragraph);
    const pdf = renderCoverLetterPdf({ ...signed, templateId: 'classic' }).toString('latin1');
    expect(pdf).toContain('(Sincerely,) Tj');
    expect(pdf).not.toContain('Sincerely, Ada Review');
    // Last occurrence: the signature "Ada Review", not the sender name at the top.
    const y = (text: string) => Number([...pdf.matchAll(new RegExp(`(\\d+) Td\\n\\(${text}\\) Tj`, 'g'))].pop()?.[1]);
    // 14pt leading inside a paragraph, 14 + 8pt gap between paragraphs.
    expect(y('Sincerely,') - y('Ada Review')).toBe(14);
    expect(y('I coordinated catalogue programmes.') - y('Sincerely,')).toBe(22);
    const docx = renderCoverLetterDocx(signed).toString('utf8');
    expect(docx).toContain('<w:p><w:pPr><w:spacing w:before="160"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Sincerely,</w:t>');
    expect(docx).toContain('<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Ada Review</w:t>');
  });
});
