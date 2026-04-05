import type { CV, CVSection, CVSectionType } from '@flacroncv/shared-types';
import type { CoverLetter } from '@flacroncv/shared-types';
import { getTokens } from '@/components/cv-builder/templates/shared';

// ─── Shared helpers (for PDF — image-based, pixel-perfect) ───────────────────

/** Clone a preview element off-screen at A4 width, ready for html2canvas */
function cloneForCapture(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-9999px',
    'width:794px',
    'overflow:visible',
    'border-radius:0',
    'box-shadow:none',
    'max-width:none',
    'background:#fff',
  ].join(';');
  document.body.appendChild(clone);
  return clone;
}

async function getHtml2Canvas() {
  const m = await import('html2canvas');
  return (typeof m.default === 'function' ? m.default
    : typeof (m as any).html2canvas === 'function' ? (m as any).html2canvas
    : m) as typeof import('html2canvas').default;
}

async function getJsPDF() {
  const m = await import('jspdf');
  return (typeof m.jsPDF === 'function' ? m.jsPDF
    : typeof (m as any).default === 'function' ? (m as any).default
    : m) as typeof import('jspdf').jsPDF;
}

async function captureToCanvas(el: HTMLElement) {
  // Wait for all web fonts (Google Fonts, next/font) to finish loading before
  // capture — otherwise html2canvas falls back to system fonts and the PDF
  // looks different from the editor.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }
  const html2canvas = await getHtml2Canvas();
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: 794,
    windowWidth: 794,
  });
  return canvas;
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
export async function exportToPDF(cv: CV, _sections: CVSection[], locale: string = 'en'): Promise<void> {
  console.debug(`[exportToPDF] locale=${locale}, layout=${(cv.styling as any)?.layout || 'classic'}`);
  const sourceEl = document.getElementById('cv-preview-content');
  if (!sourceEl) throw new Error('CV preview not found — please keep the editor open while exporting.');

  const clone = cloneForCapture(sourceEl);
  await new Promise((r) => setTimeout(r, 150));

  try {
    const jsPDF = await getJsPDF();
    const canvas = await captureToCanvas(clone);

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pdfW) / canvas.width;

    let pos = 0, rem = imgH;
    while (rem > 2) {
      if (pos > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -pos, pdfW, imgH);
      pos += pdfH;
      rem -= pdfH;
    }

    pdf.save(`${cv.title || 'CV'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── CV DOCX helpers ──────────────────────────────────────────────────────────

// ── Map web font names → Word-safe equivalents ──────────────────────────────
const DOCX_FONT_MAP: Record<string, string> = {
  'Inter': 'Calibri', 'Roboto': 'Arial', 'Lato': 'Calibri',
  'Open Sans': 'Arial', 'Montserrat': 'Calibri', 'Raleway': 'Calibri',
  'Nunito': 'Calibri', 'Poppins': 'Calibri', 'Merriweather': 'Georgia',
  'Playfair Display': 'Times New Roman', 'Source Serif Pro': 'Georgia',
  'Lora': 'Georgia', 'PT Serif': 'Georgia', 'EB Garamond': 'Garamond',
  'Garamond': 'Garamond', 'Georgia': 'Georgia',
  'Times New Roman': 'Times New Roman', 'Calibri': 'Calibri', 'Arial': 'Arial',
};
function docxFont(fontFamily?: string): string {
  return DOCX_FONT_MAP[fontFamily || 'Inter'] ?? 'Calibri';
}

function hexColor(color: string): string {
  return color.replace('#', '').slice(0, 6);
}

// ── Unit conversion: screen-px → DOCX units ──────────────────────────────────
// 96 dpi screen → 72 dpi print: 1px = 0.75pt
// DOCX font size  = half-points → px × 1.5
// DOCX paragraph spacing = twips → px × 15
function pxToHalfPt(px: number): number { return Math.round(px * 1.5); }
function pxToTwips(px: number): number   { return Math.round(px * 15);  }

// ── Labels interface — passed from caller via next-intl t() ──────────────────
// This eliminates the static duplicate translation table and ensures DOCX uses
// the exact same translated strings as the editor.
export interface DocxLabels {
  professionalSummary: string;
  profile: string;
  contact: string;
  aboutMe: string;
  summary: string;
}

// Convenience alias for the token shape
type Tokens = ReturnType<typeof getTokens>;

// ── Text block helper ─────────────────────────────────────────────────────────
function nl2paras(d: any, text: string, halfPtSize: number, color?: string): any[] {
  if (!text) return [];
  const runOpts: any = { size: halfPtSize };
  if (color) runOpts.color = color;
  return text.split(/\n+/).filter(Boolean).map((line: string) =>
    new d.Paragraph({ children: [new d.TextRun({ text: line, ...runOpts })], spacing: { after: pxToTwips(4) } })
  );
}

// ── Section heading — all 4 sectionStyle variants ────────────────────────────
// Derives sizes and spacing from the same tokens as the React template.
function sectionHeadingDocx(d: any, title: string, color: string, tokens: Tokens): any {
  const hexCol = hexColor(color);
  const size   = pxToHalfPt(tokens.fs.sectionTitle);
  const before = pxToTwips(tokens.sp.section);
  const after  = pxToTwips(8);

  if (tokens.sectionStyle === 'card') {
    return new d.Paragraph({
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: 'FFFFFF' })],
      shading: { fill: hexCol, type: 'clear' as any, color: 'auto' },
      spacing: { before, after: pxToTwips(10) },
    });
  }
  if (tokens.sectionStyle === 'left-border') {
    return new d.Paragraph({
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
      border: { left: { style: d.BorderStyle.SINGLE, size: 18, color: hexCol } },
      indent: { left: pxToTwips(8) },
      spacing: { before, after },
    });
  }
  if (tokens.sectionStyle === 'minimal') {
    return new d.Paragraph({
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: '666666' })],
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'e5e5e5' } },
      spacing: { before, after },
    });
  }
  // default: underline
  return new d.Paragraph({
    children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: hexCol } },
    spacing: { before, after },
  });
}

// ── Sidebar section heading ───────────────────────────────────────────────────
function sidebarSectionHeadingDocx(d: any, title: string, tokens: Tokens): any {
  return new d.Paragraph({
    children: [new d.TextRun({
      text: title.toUpperCase(), bold: true,
      size: pxToHalfPt(tokens.fs.sectionTitle - 1), color: 'FFFFFF',
    })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' } },
    spacing: { before: pxToTwips(tokens.sp.section * 0.75), after: pxToTwips(6) },
  });
}

// ── Section item paragraphs ───────────────────────────────────────────────────
// All font sizes and spacing come from tokens — same values as getTokens(cv).
function buildCVSectionParagraphs(
  d: any, section: CVSection, color: string,
  tokens: Tokens, variant: 'default' | 'sidebar' = 'default',
): any[] {
  const { fs, sp } = tokens;
  const paras: any[] = [];
  const type = section.type as string;

  const textColor   = variant === 'sidebar' ? 'FFFFFF' : undefined;
  const dimColor    = variant === 'sidebar' ? 'CCCCCC' : '666666';
  const metaColor   = variant === 'sidebar' ? 'CCCCCC' : '888888';
  const accentColor = variant === 'sidebar' ? 'FFFFFF' : hexColor(color);

  const itemBefore = pxToTwips(sp.item + 2);
  const itemAfter  = pxToTwips(4);

  // ── Skills: grouped inline rows (4 per row) with · separators ──────────────
  if (type === 'skills') {
    const items = (section.items || []) as any[];
    for (let i = 0; i < items.length; i += 4) {
      const row = items.slice(i, i + 4);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const lv = it.level ? ` (${it.level})` : '';
        runs.push(new d.TextRun({ text: `${it.name}${lv}`, size: pxToHalfPt(fs.name), color: textColor, bold: true }));
        if (j < row.length - 1)
          runs.push(new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.name), color: dimColor }));
      });
      paras.push(new d.Paragraph({ children: runs, spacing: { after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  // ── Languages: grouped inline rows (3 per row) ───────────────────────────
  if (type === 'languages') {
    const items = (section.items || []) as any[];
    for (let i = 0; i < items.length; i += 3) {
      const row = items.slice(i, i + 3);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const prof = it.proficiency ? ` — ${it.proficiency}` : '';
        runs.push(new d.TextRun({ text: `${it.name}${prof}`, size: pxToHalfPt(fs.name), color: textColor }));
        if (j < row.length - 1)
          runs.push(new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.name), color: dimColor }));
      });
      paras.push(new d.Paragraph({ children: runs, spacing: { after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  for (const item of (section.items || [])) {
    const it = item as any;

    if (type === 'experience' || type === 'volunteer') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.position || it.title || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.company  ? new d.TextRun({ text: `  •  ${it.company}`,   size: pxToHalfPt(fs.name), color: accentColor }) : null,
          it.location ? new d.TextRun({ text: `  |  ${it.location}`,  size: pxToHalfPt(fs.meta), color: dimColor    }) : null,
        ].filter(Boolean),
        spacing: { before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.isCurrent ? 'Present' : it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), textColor));
      for (const h of (it.highlights || [])) {
        paras.push(new d.Paragraph({
          children: [new d.TextRun({ text: `• ${h}`, size: pxToHalfPt(fs.body), color: textColor })],
          spacing: { after: itemAfter },
        }));
      }
    } else if (type === 'education') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: [it.degree, it.field].filter(Boolean).join(' in ') || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.institution ? new d.TextRun({ text: `  •  ${it.institution}`, size: pxToHalfPt(fs.name), color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { after: itemAfter },
      }));
      if (it.gpa) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: `GPA: ${it.gpa}`, size: pxToHalfPt(fs.body), color: textColor })],
        spacing: { after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), textColor));
    } else if (type === 'projects') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.url ? new d.TextRun({ text: `  ${it.url}`, size: pxToHalfPt(fs.meta), color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), textColor));
      if (it.technologies?.length) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: `Technologies: ${it.technologies.join(', ')}`, size: pxToHalfPt(fs.meta), italics: true, color: textColor })],
        spacing: { after: itemAfter },
      }));
    } else if (type === 'certifications') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.issuer ? new d.TextRun({ text: `  •  ${it.issuer}`, size: pxToHalfPt(fs.name), color: dimColor   }) : null,
          it.date   ? new d.TextRun({ text: `  |  ${it.date}`,   size: pxToHalfPt(fs.meta), color: metaColor  }) : null,
        ].filter(Boolean),
        spacing: { before: pxToTwips(sp.item), after: itemAfter },
      }));
    } else if (type === 'references') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.title   ? new d.TextRun({ text: `, ${it.title}`,      size: pxToHalfPt(fs.name), color: textColor }) : null,
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: pxToHalfPt(fs.name), color: dimColor  }) : null,
        ].filter(Boolean),
        spacing: { before: pxToTwips(sp.item), after: itemAfter },
      }));
      if (it.email) paras.push(new d.Paragraph({
        children: [new d.TextRun({ text: it.email, size: pxToHalfPt(fs.body), color: accentColor })],
        spacing: { after: itemAfter },
      }));
    } else {
      // custom / awards / publications
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.title || it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.subtitle ? new d.TextRun({ text: `  •  ${it.subtitle}`, size: pxToHalfPt(fs.name), color: dimColor  }) : null,
          it.date     ? new d.TextRun({ text: `  |  ${it.date}`,     size: pxToHalfPt(fs.meta), color: metaColor }) : null,
        ].filter(Boolean),
        spacing: { before: pxToTwips(sp.item), after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), textColor));
    }
  }

  return paras;
}

// ─── Layout-specific DOCX builders ───────────────────────────────────────────

const SIDEBAR_TYPES = new Set(['skills', 'languages', 'certifications', 'awards']);
const COMPACT_RIGHT = new Set(['skills', 'education', 'languages', 'certifications', 'awards', 'references']);

const NoBorder  = { style: 'nil' as any, size: 0, color: 'auto' };
const NoBorders = {
  top: NoBorder, bottom: NoBorder, left: NoBorder, right: NoBorder,
  insideHorizontal: NoBorder, insideVertical: NoBorder,
};

// ── Classic ──────────────────────────────────────────────────────────────────
function buildClassicChildren(
  d: any, cv: CV, sections: CVSection[], color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const name = [cv.personalInfo?.firstName, cv.personalInfo?.lastName].filter(Boolean).join(' ') || cv.title;
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];

  const children: any[] = [];

  // Name
  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(5) },
  }));
  if (info?.headline) children.push(new d.Paragraph({
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: '555555' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(5) },
  }));
  if (contactParts.length) children.push(new d.Paragraph({
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: '999999' }) : null,
    ]).filter(Boolean) as any[],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(6) },
  }));

  // Divider
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { after: pxToTwips(sp.section) },
  }));

  // Summary
  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.professionalSummary, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name)));
  }

  // Sections
  for (const section of sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function buildSidebarChildren(
  d: any, cv: CV, sections: CVSection[], color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const initials  = ((info?.firstName?.[0] ?? '') + (info?.lastName?.[0] ?? '')).toUpperCase();
  const nameParts = [info?.firstName, info?.lastName].filter(Boolean) as string[];

  const sidebarSections = sections.filter(s => SIDEBAR_TYPES.has(s.type));
  const mainSections    = sections.filter(s => !SIDEBAR_TYPES.has(s.type));

  // ── Left cell ──
  const leftParas: any[] = [];

  if (initials) leftParas.push(new d.Paragraph({
    children: [new d.TextRun({ text: initials, bold: true, size: pxToHalfPt(fs.nameTop), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(10) },
    shading: { fill: 'FFFFFF', type: 'clear' as any, color: 'auto' },
    border: {
      top: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      bottom: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      left: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      right: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
    },
  }));

  leftParas.push(new d.Paragraph({
    children: nameParts.map((part, i) =>
      new d.TextRun({ text: part, bold: true, size: pxToHalfPt(fs.nameTop), color: 'FFFFFF', break: i > 0 ? 1 : 0 })
    ),
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(5) },
  }));

  if (info?.headline) leftParas.push(new d.Paragraph({
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: pxToTwips(sp.section * 0.5) },
  }));

  leftParas.push(sidebarSectionHeadingDocx(d, labels.contact, tokens));
  const contactLines = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];
  for (const line of contactLines) {
    leftParas.push(new d.Paragraph({
      children: [new d.TextRun({ text: line, size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
      spacing: { after: pxToTwips(3) },
    }));
  }

  for (const section of sidebarSections) {
    leftParas.push(sidebarSectionHeadingDocx(d, section.title, tokens));
    leftParas.push(...buildCVSectionParagraphs(d, section, color, tokens, 'sidebar'));
  }

  // ── Right cell ──
  const rightParas: any[] = [];

  if (info?.summary) {
    rightParas.push(sectionHeadingDocx(d, labels.profile, color, tokens));
    rightParas.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name)));
  }
  for (const section of mainSections) {
    rightParas.push(sectionHeadingDocx(d, section.title, color, tokens));
    rightParas.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  if (leftParas.length  === 0) leftParas.push(new d.Paragraph({ children: [] }));
  if (rightParas.length === 0) rightParas.push(new d.Paragraph({ children: [] }));

  return [new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        new d.TableCell({
          children: leftParas,
          width: { size: 30, type: d.WidthType.PERCENTAGE },
          shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
          margins: { top: pxToTwips(sp.headerPad), bottom: pxToTwips(sp.headerPad), left: pxToTwips(sp.pad * 0.6), right: pxToTwips(sp.pad * 0.6) },
          borders: NoBorders,
        }),
        new d.TableCell({
          children: rightParas,
          width: { size: 70, type: d.WidthType.PERCENTAGE },
          margins: { top: pxToTwips(sp.headerPad), bottom: pxToTwips(sp.headerPad), left: pxToTwips(sp.pad * 0.75), right: pxToTwips(sp.pad * 0.75) },
          borders: NoBorders,
        }),
      ],
    })],
  })];
}

// ── Top-Bar ──────────────────────────────────────────────────────────────────
function buildTopBarChildren(
  d: any, cv: CV, sections: CVSection[], color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
  ].filter(Boolean) as string[];
  const linkParts = [info?.linkedin, info?.website].filter(Boolean) as string[];

  const children: any[] = [];

  // Colored header band
  const headerParas: any[] = [
    new d.Paragraph({
      children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: 'FFFFFF' })],
      spacing: { after: pxToTwips(5) },
    }),
  ];
  if (info?.headline) headerParas.push(new d.Paragraph({
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: 'E8E8E8' })],
    spacing: { after: pxToTwips(5) },
  }));
  if (contactParts.length) headerParas.push(new d.Paragraph({
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: 'DDDDDD' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '   |   ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { after: pxToTwips(3) },
  }));
  if (linkParts.length) headerParas.push(new d.Paragraph({
    children: linkParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.meta), color: 'BBBBBB' }),
      i < linkParts.length - 1 ? new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.meta), color: '888888' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { after: 0 },
  }));

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [new d.TableCell({
        children: headerParas,
        shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
        margins: { top: pxToTwips(sp.headerPad), bottom: pxToTwips(sp.headerPad), left: pxToTwips(sp.pad), right: pxToTwips(sp.pad) },
        borders: NoBorders,
      })],
    })],
  }));

  // Accent strip
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: hexColor(color) } },
    spacing: { before: 0, after: pxToTwips(sp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.aboutMe, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name)));
  }
  for (const section of sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Compact ──────────────────────────────────────────────────────────────────
function buildCompactChildren(
  d: any, cv: CV, sections: CVSection[], color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  // Mirror the tightSp from CompactLayout.tsx
  const tightSp = { ...sp, section: Math.round(sp.section * 0.85), item: Math.round(sp.item * 0.8) };
  const tightTokens = { ...tokens, sp: tightSp };
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];

  const children: any[] = [];

  // Inline header
  const headerRuns: any[] = [
    new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameTop), color: hexColor(color) }),
  ];
  if (info?.headline) headerRuns.push(new d.TextRun({ text: `   ${info.headline}`, size: pxToHalfPt(fs.name), color: '666666' }));
  children.push(new d.Paragraph({ children: headerRuns, spacing: { after: pxToTwips(4) } }));

  if (contactParts.length) children.push(new d.Paragraph({
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { after: 0 },
  }));

  // Divider
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { before: pxToTwips(tightSp.item + 2), after: pxToTwips(tightSp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.summary, color, tightTokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.body)));
  }

  const leftSections  = sections.filter(s => !COMPACT_RIGHT.has(s.type));
  const rightSections = sections.filter(s =>  COMPACT_RIGHT.has(s.type));

  const buildColParas = (cols: CVSection[]) => {
    const paras: any[] = [];
    for (const section of cols) {
      paras.push(sectionHeadingDocx(d, section.title, color, tightTokens));
      paras.push(...buildCVSectionParagraphs(d, section, color, tightTokens));
    }
    if (paras.length === 0) paras.push(new d.Paragraph({ children: [] }));
    return paras;
  };

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        new d.TableCell({
          children: buildColParas(leftSections),
          width: { size: 60, type: d.WidthType.PERCENTAGE },
          margins: { top: 0, bottom: 0, left: 0, right: pxToTwips(20) },
          borders: NoBorders,
        }),
        new d.TableCell({
          children: buildColParas(rightSections),
          width: { size: 40, type: d.WidthType.PERCENTAGE },
          margins: { top: 0, bottom: 0, left: pxToTwips(20), right: 0 },
          borders: NoBorders,
        }),
      ],
    })],
  }));

  return children;
}

// ─── Main DOCX builder ────────────────────────────────────────────────────────
async function buildCVDocx(cv: CV, sections: CVSection[], labels: DocxLabels): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const layout = ((cv.styling as any)?.layout || 'classic') as string;
  const color  = cv.styling?.primaryColor || '#2563eb';
  const toTwip = (in_: number) =>
    (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(in_) : Math.round(in_ * 1440);

  // ── Compute tokens ONCE — same function as React templates ──────────────────
  const tokens = getTokens(cv);
  const { fs, sp } = tokens;
  const font = docxFont((cv.styling as any)?.fontFamily);

  const visibleSections = (sections || [])
    .filter((s) => s.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let children: any[];
  let margin: { top: number; bottom: number; left: number; right: number };

  if (layout === 'sidebar') {
    margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.4), right: toTwip(0.4) };
    children = buildSidebarChildren(d, cv, visibleSections, color, tokens, labels);
  } else if (layout === 'top-bar') {
    margin   = { top: toTwip(0.4), bottom: toTwip(0.75), left: toTwip(0.5), right: toTwip(0.5) };
    children = buildTopBarChildren(d, cv, visibleSections, color, tokens, labels);
  } else if (layout === 'compact') {
    margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.75), right: toTwip(0.75) };
    children = buildCompactChildren(d, cv, visibleSections, color, tokens, labels);
  } else {
    margin   = { top: toTwip(0.75), bottom: toTwip(0.75), left: toTwip(0.9), right: toTwip(0.9) };
    children = buildClassicChildren(d, cv, visibleSections, color, tokens, labels);
  }

  const bodySize = pxToHalfPt(fs.body);

  const doc = new d.Document({
    styles: {
      default: {
        document: { run: { font, size: bodySize, color: '222222' } },
      },
      // Override Word built-in heading styles to prevent blue/bold defaults leaking
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
      ],
    },
    sections: [{ properties: { page: { margin } }, children }],
  });

  return d.Packer.toBlob(doc);
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────
export async function exportToDocx(cv: CV, sections: CVSection[], _locale: string, labels: DocxLabels): Promise<void> {
  console.debug(`[exportToDocx] layout=${(cv.styling as any)?.layout || 'classic'}`);
  const blob = await buildCVDocx(cv, sections, labels);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${cv.title || 'CV'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Cover Letter PDF Export ──────────────────────────────────────────────────
export async function exportCoverLetterToPDF(title: string): Promise<void> {
  const sourceEl = document.getElementById('cl-preview-content');
  if (!sourceEl) throw new Error('Cover letter preview not found.');

  const clone = cloneForCapture(sourceEl);
  await new Promise((r) => setTimeout(r, 150));

  try {
    const jsPDF = await getJsPDF();
    const canvas = await captureToCanvas(clone);

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pdfW) / canvas.width;

    let pos = 0, rem = imgH;
    while (rem > 2) {
      if (pos > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -pos, pdfW, imgH);
      pos += pdfH;
      rem -= pdfH;
    }

    pdf.save(`${title || 'cover-letter'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── Cover Letter DOCX Export (editable) ─────────────────────────────────────
async function buildCoverLetterDocx(coverLetter: CoverLetter): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const color = coverLetter.styling?.primaryColor || '#2563eb';
  const senderName = coverLetter.styling?.senderName || '';
  const senderEmail = coverLetter.styling?.senderEmail || '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const children: any[] = [];

  // ── Sender block ──
  if (senderName) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: senderName, bold: true, size: 28, color: hexColor(color) })],
      spacing: { after: 60 },
    }));
  }
  if (senderEmail) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: senderEmail, size: 20, color: '555555' })],
      spacing: { after: 60 },
    }));
  }

  // ── Date ──
  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: today, size: 20, color: '555555' })],
    spacing: { before: 240, after: 240 },
  }));

  // ── Recipient block ──
  if (coverLetter.recipientName) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: coverLetter.recipientName, bold: true, size: 22 })],
      spacing: { after: 60 },
    }));
  }
  if (coverLetter.recipientTitle) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: coverLetter.recipientTitle, size: 20 })],
      spacing: { after: 60 },
    }));
  }
  if (coverLetter.companyName) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: coverLetter.companyName, size: 20 })],
      spacing: { after: 60 },
    }));
  }
  if (coverLetter.companyAddress) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: coverLetter.companyAddress, size: 20 })],
      spacing: { after: 60 },
    }));
  }

  // ── RE: line ──
  if (coverLetter.jobTitle) {
    children.push(new d.Paragraph({
      children: [
        new d.TextRun({ text: 'Re: ', bold: true, size: 20 }),
        new d.TextRun({ text: `Application for ${coverLetter.jobTitle}`, size: 20, color: hexColor(color) }),
      ],
      spacing: { before: 240, after: 240 },
    }));
  }

  // ── Greeting ──
  const greeting = coverLetter.recipientName
    ? `Dear ${coverLetter.recipientName},`
    : 'Dear Hiring Manager,';
  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: greeting, size: 22 })],
    spacing: { after: 200 },
  }));

  // ── Body ──
  const body = coverLetter.content || '';
  // Strip basic HTML tags for plain text
  const plainBody = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  const bodyParas = plainBody.split(/\n+/).filter(Boolean);
  for (const para of bodyParas) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: para, size: 22 })],
      spacing: { after: 160 },
    }));
  }

  // ── Closing ──
  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: 'Sincerely,', size: 22 })],
    spacing: { before: 240, after: 400 },
  }));

  if (senderName) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: senderName, bold: true, size: 22, color: hexColor(color) })],
      spacing: { after: 60 },
    }));
  }
  if (senderEmail) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: senderEmail, size: 20, color: '555555' })],
    }));
  }

  const doc = new d.Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(1) : 1440,
            bottom: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(1) : 1440,
            left: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(1.25) : 1800,
            right: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(1.25) : 1800,
          },
        },
      },
      children,
    }],
  });

  return d.Packer.toBlob(doc);
}

export async function exportCoverLetterToDocx(coverLetter: CoverLetter): Promise<void> {
  const blob = await buildCoverLetterDocx(coverLetter);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${coverLetter.title || 'cover-letter'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
