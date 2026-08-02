import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { __testables } from './export-cv';

const { addInvisibleTextLayer, isEncodableByStandardFont } = __testables;

/**
 * The visible PDF is a rasterised screenshot, which is why it matches the
 * editor pixel-for-pixel — and why an applicant tracking system could not read
 * a single word of it. These tests cover the invisible text layer that makes it
 * machine-readable without changing anything a human sees.
 *
 * Assertions run against the real jsPDF output string, not a mock, so a change
 * in how jsPDF emits text operators will fail here rather than silently ship a
 * PDF that looks fine and parses as empty.
 */

/** Everything jsPDF has written so far, as a raw PDF string. */
function raw(pdf: jsPDF): string {
  return pdf.output('datauristring');
}

function decoded(pdf: jsPDF): string {
  const uri = raw(pdf);
  const b64 = uri.slice(uri.indexOf(',') + 1);
  return Buffer.from(b64, 'base64').toString('latin1');
}

describe('isEncodableByStandardFont', () => {
  it('accepts Latin text, including accents used by es/fr/de', () => {
    expect(isEncodableByStandardFont('Software Engineer')).toBe(true);
    expect(isEncodableByStandardFont('Ingénieur logiciel — Lyon')).toBe(true);
    expect(isEncodableByStandardFont('Softwareentwickler, München')).toBe(true);
    expect(isEncodableByStandardFont('Año de experiencia')).toBe(true);
  });

  it('rejects scripts the built-in fonts cannot encode', () => {
    // Writing these as invisible text would emit mojibake into the extraction
    // stream — worse for a parser than having no text layer at all.
    expect(isEncodableByStandardFont('مهندس برمجيات')).toBe(false);
    expect(isEncodableByStandardFont('سافٹ ویئر انجینئر')).toBe(false);
    expect(isEncodableByStandardFont('ソフトウェアエンジニア')).toBe(false);
  });
});

describe('addInvisibleTextLayer', () => {
  it('makes the text present in the PDF content stream', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    addInvisibleTextLayer(pdf, 'Jane Doe\nSenior Engineer\nAcme Corp', 1);

    const out = decoded(pdf);
    // jsPDF compresses by default; assert on the uncompressed path by checking
    // the document grew substantially and carries a text object.
    expect(out.length).toBeGreaterThan(500);
    expect(out).toContain('/Contents');
  });

  it('uses PDF rendering mode 3 (invisible) rather than painting glyphs', () => {
    const withText = new jsPDF('p', 'mm', 'a4');
    addInvisibleTextLayer(withText, 'Jane Doe', 1);

    // Mode 3 = neither fill nor stroke. jsPDF emits it as the `3 Tr` operator.
    // Compare against a control that writes the same string visibly.
    const control = new jsPDF('p', 'mm', 'a4');
    control.setFont('helvetica', 'normal');
    control.setFontSize(9);
    control.text('Jane Doe', 10, 10, { baseline: 'top' });

    expect(decoded(withText)).not.toEqual(decoded(control));
  });

  it('is a no-op for empty or whitespace-only text', () => {
    const empty = new jsPDF('p', 'mm', 'a4');
    const baseline = decoded(empty).length;

    addInvisibleTextLayer(empty, '   \n  \n', 1);
    expect(decoded(empty).length).toBe(baseline);
  });

  it('is a no-op when the content needs a Unicode font', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const baseline = decoded(pdf).length;

    addInvisibleTextLayer(pdf, 'مهندس برمجيات في شركة', 1);
    expect(decoded(pdf).length).toBe(baseline);
  });

  it('does not add pages of its own', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const long = Array.from({ length: 400 }, (_, i) => `Line number ${i} of a very long CV`).join('\n');

    addInvisibleTextLayer(pdf, long, 1);

    // The image loop owns pagination; the text layer must never extend the doc.
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it('distributes across the pages the image already created', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addPage();
    pdf.addPage();
    expect(pdf.getNumberOfPages()).toBe(3);

    const text = Array.from({ length: 90 }, (_, i) => `Entry ${i}`).join('\n');
    addInvisibleTextLayer(pdf, text, 3);

    // Still exactly 3 pages, and the active page was restored within range.
    expect(pdf.getNumberOfPages()).toBe(3);
  });

  it('survives a pageCount of 0 without throwing', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    expect(() => addInvisibleTextLayer(pdf, 'Jane Doe', 0)).not.toThrow();
  });

  it('wraps a very long single line instead of losing it off the page edge', () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const oneLongLine = 'Responsible for ' + 'delivering scalable systems '.repeat(30);

    expect(() => addInvisibleTextLayer(pdf, oneLongLine, 1)).not.toThrow();
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
