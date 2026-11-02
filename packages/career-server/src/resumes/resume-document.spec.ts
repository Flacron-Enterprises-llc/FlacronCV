import { composeResume } from '@flacroncv/career-shared';
import { renderPdf } from '../documents/portable-document';
import { renderResumeDocx, renderResumePdf } from './resume-document';

const body = composeResume(
  [
    {
      id: 's1',
      factType: 'skill',
      value: { name: 'SQL' },
      confirmation: 'confirmed',
      uncertain: {},
    },
  ],
  'classic',
);

describe('resume files', () => {
  it('uses the contact name for the export heading instead of the library title', () => {
    const withContact = composeResume(
      [
        {
          id: 'c1',
          factType: 'contact',
          value: { fullName: 'Ada Review', email: 'ada@example.test', city: 'Montreal' },
          confirmation: 'confirmed',
          uncertain: {},
        },
        {
          id: 's1',
          factType: 'skill',
          value: { name: 'SQL' },
          confirmation: 'confirmed',
          uncertain: {},
        },
      ],
      'professional',
    );
    const pdf = renderResumePdf(withContact, 'Ada Review — Harbourfront (fictional)', false).toString('latin1');
    expect(pdf).toContain('Ada Review');
    expect(pdf).not.toContain('Harbourfront (fictional)');
    const docx = renderResumeDocx(withContact, 'Ada Review — Harbourfront (fictional)', false).toString('utf8');
    expect(docx).toContain('Ada Review');
    expect(docx).not.toContain('Harbourfront (fictional)');
  });

  it('writes a PDF the free plan watermarks and a DOCX that keeps the fact text', () => {
    const pdf = renderResumePdf(body, 'Ada', true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('SQL');
    expect(pdf.toString('latin1')).toContain('Prepared with FlacronCV');
    expect(pdf.toString('latin1')).toContain('/WinAnsiEncoding');
    const docx = renderResumeDocx(body, 'Ada', false);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(docx.toString('utf8')).toContain('SQL');
    expect(docx.toString('utf8')).not.toContain('Prepared with FlacronCV');
  });

  it('keeps French letters in PDF and DOCX instead of replacing them', () => {
    const french = {
      ...body,
      sections: body.sections.map((section) => ({
        ...section,
        lines: section.lines.map((line) => ({ ...line, text: 'Généré à Montréal' })),
      })),
    };
    const pdf = renderResumePdf(french, 'Café', false);
    expect(pdf.toString('latin1')).toContain('\\351');
    expect(pdf.toString('latin1')).not.toContain('G?n?r?');
    const docx = renderResumeDocx(french, 'Café', false);
    expect(docx.toString('utf8')).toContain('Généré à Montréal');
    expect(docx.toString('utf8')).toContain('Café');
  });

  it('wraps long PDF lines, paginates, and encodes WinAnsi punctuation', () => {
    const sample = body.sections[0].lines[0];
    const long =
      'Coordinated cataloguing programmes across civic branches in Montréal, Québec, with measurable circulation gains each quarter for community members who rely on the service.';
    const punctuation = '«Café» généré — naïve, ça, 50 %, $1,000.';
    // Fifty separate entries force a second page (skills now share one wrapped line).
    const many = Array.from({ length: 50 }, (_, index) => `Catalogue project ${index + 1}`);
    const rich = {
      ...body,
      sections: [
        { factType: 'summary' as const, lines: [{ ...sample, text: long }] },
        { factType: 'experience' as const, lines: [{ ...sample, text: punctuation }] },
        { factType: 'project' as const, lines: many.map((text) => ({ ...sample, text })) },
      ],
    };
    const pdf = renderResumePdf(rich, 'Ada', false);
    const bytes = pdf.toString('latin1');
    expect(bytes).toContain('Coordinated cataloguing');
    expect(bytes).toContain('community members who');
    expect(bytes).not.toContain(`(${long})`);
    expect(bytes).toContain('\\253');
    expect(bytes).toContain('\\227');
    expect(bytes).toContain('\\347');
    expect((bytes.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThanOrEqual(2);
    const docx = renderResumeDocx(rich, 'Ada', false);
    expect(docx.toString('utf8')).toContain(long);
    expect(docx.toString('utf8')).toContain('«Café» généré — naïve, ça, 50 %, $1,000.');
  });

  it('draws sidebar chrome for two-column templates', () => {
    const pdf = renderResumePdf({ ...body, templateId: 'modern' }, 'Ada', false);
    expect(pdf.toString('latin1')).toContain('0 0 168 792 re');
  });

  it('draws a heading band for professional templates', () => {
    const pdf = renderResumePdf({ ...body, templateId: 'professional' }, 'Ada', false);
    expect(pdf.toString('latin1')).toContain('0 720 612 72 re');
    // The white name must sit inside the band (720–792), not on the white page below it.
    const nameY = Number(/1 1 1 rg\n54 (\d+) Td/.exec(pdf.toString('latin1'))?.[1]);
    expect(nameY).toBeGreaterThan(720);
    expect(nameY).toBeLessThan(792);
    expect(pdf.toString('latin1')).toContain('/Helvetica-Bold');
  });

  it('draws a thin rail for editorial and a date rule for structured', () => {
    const editorial = renderResumePdf({ ...body, templateId: 'editorial' }, 'Ada', false).toString('latin1');
    expect(editorial).toContain('0 0 36 792 re');
    expect(editorial).not.toContain('0 0 168 792 re');
    const structured = renderResumePdf({ ...body, templateId: 'structured' }, 'Ada', false).toString('latin1');
    expect(structured).toContain('118 48 1.1 700 re');
  });

  it('keeps a long editorial email intact in the main column', () => {
    const pdf = renderPdf(
      [
        { role: 'name', text: 'Ada Review' },
        { role: 'contact', text: 'ada.review@example.test' },
      ],
      { family: 'editorial', accent: '#002B62' },
    ).toString('latin1');
    expect(pdf).toContain('0 0 36 792 re');
    expect(pdf).toContain('(ada.review@example.test) Tj');
  });

  const reviewFacts = [
    { id: 'c1', factType: 'contact', value: { fullName: 'Ada Review', email: 'ada@example.test', city: 'Montréal' }, confirmation: 'confirmed', uncertain: {} },
    {
      id: 'e1',
      factType: 'experience',
      value: { position: 'Programme coordinator', company: 'Northbridge Civic Library', startDate: '2021-01', endDate: '2024-06', responsibilities: 'Led catalogue clinics' },
      confirmation: 'confirmed',
      uncertain: {},
    },
    { id: 'k1', factType: 'skill', value: { name: 'Cataloguing' }, confirmation: 'confirmed', uncertain: {} },
    { id: 'k2', factType: 'skill', value: { name: 'Main-d’œuvre bénévole' }, confirmation: 'confirmed', uncertain: {} },
  ] as const;

  it('prints CV headings, the contact line without the name, formatted dates, and inline skills', () => {
    const cv = composeResume([...reviewFacts], 'classic');
    const en = renderResumePdf(cv, 'Resume', false, 'en').toString('latin1');
    expect(en).toContain('(Experience) Tj');
    expect(en).toContain('(Skills) Tj');
    expect(en).not.toMatch(/\((contact|experience|skill)\) Tj/);
    expect(en).toContain('(ada@example.test \\267 Montr\\351al) Tj');
    expect(en).toContain('(Programme coordinator \\267 Northbridge Civic Library) Tj');
    expect(en).toContain('(Jan 2021 \\226 Jun 2024) Tj');
    expect(en).toContain('(Led catalogue clinics) Tj');
    // Skills share one line; œ is WinAnsi 0x9C (octal 234), not "?".
    expect(en).toContain('(Cataloguing \\267 Main-d\\222\\234uvre b\\351n\\351vole) Tj');
    const fr = renderResumePdf(cv, 'Resume', true, 'fr').toString('latin1');
    expect(fr).toContain('(Exp\\351rience professionnelle) Tj');
    expect(fr).toContain('(Comp\\351tences) Tj');
    expect(fr).toContain('(janv. 2021 \\226 juin 2024) Tj');
    expect(fr).toContain('(Pr\\351par\\351 avec FlacronCV) Tj');
    const docx = renderResumeDocx(cv, 'Resume', false, 'fr').toString('utf8');
    expect(docx).toContain('Expérience professionnelle');
    expect(docx).toContain('janv. 2021 – juin 2024');
  });

  it('draws a visible name on sidebar templates and the band on page 1 only', () => {
    const cv = composeResume([...reviewFacts], 'modern');
    const sidebar = renderResumePdf(cv, 'Resume', false, 'en').toString('latin1');
    expect(sidebar).not.toMatch(/1 1 1 rg\n\d+ \d+ Td\n\(Ada Review\) Tj/);
    expect(sidebar).toMatch(/0 0 0 rg\n\d+ \d+ Td\n\(Ada Review\) Tj/);
    const many = composeResume(
      [...reviewFacts, ...Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, factType: 'project', value: { name: `Project ${i}` }, confirmation: 'confirmed', uncertain: {} }))] as never,
      'professional',
    );
    const banded = renderResumePdf(many, 'Resume', false, 'en').toString('latin1');
    expect((banded.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((banded.match(/0 720 612 72 re/g) ?? []).length).toBe(1);
  });
});
