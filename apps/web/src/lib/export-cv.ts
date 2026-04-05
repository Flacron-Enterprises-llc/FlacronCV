import type { CV, CVSection, CVSectionType } from '@flacroncv/shared-types';
import type { CoverLetter } from '@flacroncv/shared-types';
import { getTokens } from '@/components/cv-builder/templates/shared';
import { renderLayout, SIDEBAR_LEFT_TYPES, type LayoutDescriptor } from '@/lib/render-layout';

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

// ── Line-spacing constants — keyed to React template lineHeight values ────────
// Word default "Normal" paragraph style uses 1.15× (276 twips). We set EVERY
// paragraph explicitly so Word cannot override with its own defaults.
//
// Mapping: browser CSS lineHeight → DOCX line (240 = 1× single spacing)
//   1.0×  (tight — headers, meta)  → 240
//   1.15× (normal body)            → 276   ← Word's "Normal" baseline
//   1.4×  (comfortable)            → 336
//   1.65× (descriptions)           → 396   ← matches lineHeight:1.65 in ItemRenderer
//   1.75× (summaries)              → 420   ← matches lineHeight:1.75 in Classic/Sidebar
const LS = {
  tight:   240,
  normal:  276,
  body:    396,
  summary: 420,
} as const;

// ── Labels interface — passed from caller via next-intl t() ──────────────────
// Eliminates the static translation table; DOCX uses same strings as the editor.
export interface DocxLabels {
  professionalSummary: string;
  profile: string;
  contact: string;
  aboutMe: string;
  summary: string;
}

type Tokens = ReturnType<typeof getTokens>;

// ── Paragraph factory ─────────────────────────────────────────────────────────
// Wraps new d.Paragraph() and injects:
//   • explicit line spacing    → prevents Word 1.15× default drift
//   • contextualSpacing: false → prevents Word silently removing paragraph
//                                spacing when adjacent paragraphs share a style
//
// Usage: para(d, { children: [...], spacing: { line: LS.body, ... }, ...rest })
function para(d: any, opts: { children: any[]; spacing?: Record<string, any>; [k: string]: any }): any {
  const { spacing = {}, ...rest } = opts;
  return new d.Paragraph({
    contextualSpacing: false,
    ...rest,
    spacing: {
      line:     LS.normal,   // safe default; override via spacing.line
      lineRule: 'auto',
      ...spacing,
    },
  });
}

// ── Text block helper ─────────────────────────────────────────────────────────
function nl2paras(d: any, text: string, halfPtSize: number, lineSpacing: number, color?: string): any[] {
  if (!text) return [];
  const runOpts: any = { size: halfPtSize };
  if (color) runOpts.color = color;
  return text.split(/\n+/).filter(Boolean).map((line: string) =>
    para(d, {
      children: [new d.TextRun({ text: line, ...runOpts })],
      spacing: { line: lineSpacing, after: pxToTwips(4) },
    })
  );
}

// ── Section heading — all 4 sectionStyle variants ────────────────────────────
function sectionHeadingDocx(d: any, title: string, color: string, tokens: Tokens): any {
  const hexCol = hexColor(color);
  const size   = pxToHalfPt(tokens.fs.sectionTitle);
  const before = pxToTwips(tokens.sp.section);
  const after  = pxToTwips(8);

  if (tokens.sectionStyle === 'card') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: 'FFFFFF' })],
      shading: { fill: hexCol, type: 'clear' as any, color: 'auto' },
      spacing: { line: LS.tight, before, after: pxToTwips(10) },
    });
  }
  if (tokens.sectionStyle === 'left-border') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
      border: { left: { style: d.BorderStyle.SINGLE, size: 18, color: hexCol } },
      indent: { left: pxToTwips(8) },
      spacing: { line: LS.tight, before, after },
    });
  }
  if (tokens.sectionStyle === 'minimal') {
    return para(d, {
      children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: '666666' })],
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'e5e5e5' } },
      spacing: { line: LS.tight, before, after },
    });
  }
  // default: underline
  return para(d, {
    children: [new d.TextRun({ text: title.toUpperCase(), bold: true, size, color: hexCol })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: hexCol } },
    spacing: { line: LS.tight, before, after },
  });
}

// ── Sidebar section heading ───────────────────────────────────────────────────
function sidebarSectionHeadingDocx(d: any, title: string, tokens: Tokens): any {
  return para(d, {
    children: [new d.TextRun({
      text: title.toUpperCase(), bold: true,
      size: pxToHalfPt(tokens.fs.sectionTitle - 1), color: 'FFFFFF',
    })],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' } },
    spacing: { line: LS.tight, before: pxToTwips(tokens.sp.section * 0.75), after: pxToTwips(6) },
  });
}

// ── Table cell factory ────────────────────────────────────────────────────────
// Sets verticalAlign: TOP on every cell so Word doesn't auto-center content.
function cell(d: any, opts: { children: any[]; width?: number; shading?: any; margins?: any; borders?: any }): any {
  return new d.TableCell({
    verticalAlign: (d.VerticalAlign?.TOP ?? 'top') as any,
    ...opts,
    borders: opts.borders ?? {
      top: { style: 'nil' as any, size: 0, color: 'auto' },
      bottom: { style: 'nil' as any, size: 0, color: 'auto' },
      left: { style: 'nil' as any, size: 0, color: 'auto' },
      right: { style: 'nil' as any, size: 0, color: 'auto' },
      insideHorizontal: { style: 'nil' as any, size: 0, color: 'auto' },
      insideVertical: { style: 'nil' as any, size: 0, color: 'auto' },
    },
    ...(opts.width !== undefined ? { width: { size: opts.width, type: d.WidthType.PERCENTAGE } } : {}),
  });
}

// ── Section item paragraphs ───────────────────────────────────────────────────
// Uses para() for every paragraph — explicit line spacing, no contextual spacing.
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

  // ── Skills: grouped inline rows (4 per row) ─────────────────────────────────
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
      paras.push(para(d, { children: runs, spacing: { line: LS.normal, after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  // ── Languages: grouped inline rows (3 per row) ──────────────────────────────
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
      paras.push(para(d, { children: runs, spacing: { line: LS.normal, after: pxToTwips(sp.item) } }));
    }
    return paras;
  }

  for (const item of (section.items || [])) {
    const it = item as any;

    if (type === 'experience' || type === 'volunteer') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.position || it.title || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.company  ? new d.TextRun({ text: `  •  ${it.company}`,  size: pxToHalfPt(fs.name), color: accentColor }) : null,
          it.location ? new d.TextRun({ text: `  |  ${it.location}`, size: pxToHalfPt(fs.meta), color: dimColor    }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.isCurrent ? 'Present' : it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
      for (const h of (it.highlights || [])) paras.push(para(d, {
        children: [new d.TextRun({ text: `• ${h}`, size: pxToHalfPt(fs.body), color: textColor })],
        spacing: { line: LS.body, after: itemAfter },
      }));
    } else if (type === 'education') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: [it.degree, it.field].filter(Boolean).join(' in ') || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.institution ? new d.TextRun({ text: `  •  ${it.institution}`, size: pxToHalfPt(fs.name), color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      if (it.gpa) paras.push(para(d, {
        children: [new d.TextRun({ text: `GPA: ${it.gpa}`, size: pxToHalfPt(fs.body), color: textColor })],
        spacing: { line: LS.normal, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
    } else if (type === 'projects') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.url ? new d.TextRun({ text: `  ${it.url}`, size: pxToHalfPt(fs.meta), color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: itemBefore, after: itemAfter },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(para(d, {
        children: [new d.TextRun({ text: dates, size: pxToHalfPt(fs.meta), italics: true, color: metaColor })],
        spacing: { line: LS.tight, after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
      if (it.technologies?.length) paras.push(para(d, {
        children: [new d.TextRun({ text: `Technologies: ${it.technologies.join(', ')}`, size: pxToHalfPt(fs.meta), italics: true, color: textColor })],
        spacing: { line: LS.normal, after: itemAfter },
      }));
    } else if (type === 'certifications') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.issuer ? new d.TextRun({ text: `  •  ${it.issuer}`, size: pxToHalfPt(fs.name), color: dimColor   }) : null,
          it.date   ? new d.TextRun({ text: `  |  ${it.date}`,   size: pxToHalfPt(fs.meta), color: metaColor  }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter },
      }));
    } else if (type === 'references') {
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.title   ? new d.TextRun({ text: `, ${it.title}`,      size: pxToHalfPt(fs.name), color: textColor }) : null,
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: pxToHalfPt(fs.name), color: dimColor  }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter },
      }));
      if (it.email) paras.push(para(d, {
        children: [new d.TextRun({ text: it.email, size: pxToHalfPt(fs.body), color: accentColor })],
        spacing: { line: LS.normal, after: itemAfter },
      }));
    } else {
      // custom / awards / publications
      paras.push(para(d, {
        children: [
          new d.TextRun({ text: it.title || it.name || '', bold: true, size: pxToHalfPt(fs.headline), color: textColor }),
          it.subtitle ? new d.TextRun({ text: `  •  ${it.subtitle}`, size: pxToHalfPt(fs.name), color: dimColor  }) : null,
          it.date     ? new d.TextRun({ text: `  |  ${it.date}`,     size: pxToHalfPt(fs.meta), color: metaColor }) : null,
        ].filter(Boolean),
        spacing: { line: LS.normal, before: pxToTwips(sp.item), after: itemAfter },
      }));
      paras.push(...nl2paras(d, it.description, pxToHalfPt(fs.body), LS.body, textColor));
    }
  }

  return paras;
}

// ─── Layout-aware DOCX builders ──────────────────────────────────────────────
// Each builder receives the LayoutDescriptor so section routing comes from the
// same renderLayout() function used by (and matching) the React templates.

const NoBorder  = { style: 'nil' as any, size: 0, color: 'auto' };
const NoBorders = {
  top: NoBorder, bottom: NoBorder, left: NoBorder, right: NoBorder,
  insideHorizontal: NoBorder, insideVertical: NoBorder,
};

// ── Classic ──────────────────────────────────────────────────────────────────
function buildClassicChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
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

  children.push(para(d, {
    children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (info?.headline) children.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: '555555' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (contactParts.length) children.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: '999999' }) : null,
    ]).filter(Boolean) as any[],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(6) },
  }));
  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { line: LS.tight, after: pxToTwips(sp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.professionalSummary, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  // sections come from the layout descriptor — same as React template
  for (const section of layout.columns[0].sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function buildSidebarChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const leftCol  = layout.columns[0];  // 30% colored
  const rightCol = layout.columns[1];  // 70% white
  const initials = ((info?.firstName?.[0] ?? '') + (info?.lastName?.[0] ?? '')).toUpperCase();
  const nameParts = [info?.firstName, info?.lastName].filter(Boolean) as string[];

  // ── Left cell paragraphs ──
  const leftParas: any[] = [];

  if (initials) leftParas.push(para(d, {
    children: [new d.TextRun({ text: initials, bold: true, size: pxToHalfPt(fs.nameTop), color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    shading: { fill: 'FFFFFF', type: 'clear' as any, color: 'auto' },
    border: {
      top:    { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      bottom: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      left:   { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      right:  { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
    },
    spacing: { line: LS.tight, after: pxToTwips(10) },
  }));
  leftParas.push(para(d, {
    children: nameParts.map((part, i) =>
      new d.TextRun({ text: part, bold: true, size: pxToHalfPt(fs.nameTop), color: 'FFFFFF', break: i > 0 ? 1 : 0 })
    ),
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (info?.headline) leftParas.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
    alignment: d.AlignmentType.CENTER,
    spacing: { line: LS.normal, after: pxToTwips(sp.section * 0.5) },
  }));

  leftParas.push(sidebarSectionHeadingDocx(d, labels.contact, tokens));
  const contactLines = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];
  for (const line of contactLines) leftParas.push(para(d, {
    children: [new d.TextRun({ text: line, size: pxToHalfPt(fs.body), color: 'E0E0E0' })],
    spacing: { line: LS.normal, after: pxToTwips(3) },
  }));

  // Sidebar sections from layout descriptor
  for (const section of leftCol.sections) {
    leftParas.push(sidebarSectionHeadingDocx(d, section.title, tokens));
    leftParas.push(...buildCVSectionParagraphs(d, section, color, tokens, 'sidebar'));
  }

  // ── Right cell paragraphs ──
  const rightParas: any[] = [];
  if (info?.summary) {
    rightParas.push(sectionHeadingDocx(d, labels.profile, color, tokens));
    rightParas.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  for (const section of rightCol.sections) {
    rightParas.push(sectionHeadingDocx(d, section.title, color, tokens));
    rightParas.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  if (leftParas.length  === 0) leftParas.push(para(d,  { children: [] }));
  if (rightParas.length === 0) rightParas.push(para(d, { children: [] }));

  return [new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        cell(d, {
          children: leftParas,
          width: leftCol.widthPct,
          shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
          margins: {
            top:    pxToTwips(leftCol.pad.top),
            bottom: pxToTwips(leftCol.pad.bottom),
            left:   pxToTwips(leftCol.pad.left),
            right:  pxToTwips(leftCol.pad.right),
          },
        }),
        cell(d, {
          children: rightParas,
          width: rightCol.widthPct,
          margins: {
            top:    pxToTwips(rightCol.pad.top),
            bottom: pxToTwips(rightCol.pad.bottom),
            left:   pxToTwips(rightCol.pad.left),
            right:  pxToTwips(rightCol.pad.right),
          },
        }),
      ],
    })],
  })];
}

// ── Top-Bar ──────────────────────────────────────────────────────────────────
function buildTopBarChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const col = layout.columns[0];
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
  ].filter(Boolean) as string[];
  const linkParts = [info?.linkedin, info?.website].filter(Boolean) as string[];

  const children: any[] = [];

  // Colored header band
  const headerParas: any[] = [
    para(d, {
      children: [new d.TextRun({ text: name, bold: true, size: pxToHalfPt(fs.nameHero), color: 'FFFFFF' })],
      spacing: { line: LS.tight, after: pxToTwips(5) },
    }),
  ];
  if (info?.headline) headerParas.push(para(d, {
    children: [new d.TextRun({ text: info.headline, size: pxToHalfPt(fs.headline), color: 'E8E8E8' })],
    spacing: { line: LS.tight, after: pxToTwips(5) },
  }));
  if (contactParts.length) headerParas.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: 'DDDDDD' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '   |   ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: pxToTwips(3) },
  }));
  if (linkParts.length) headerParas.push(para(d, {
    children: linkParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.meta), color: 'BBBBBB' }),
      i < linkParts.length - 1 ? new d.TextRun({ text: '   ·   ', size: pxToHalfPt(fs.meta), color: '888888' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: 0 },
  }));

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [cell(d, {
        children: headerParas,
        shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
        margins: {
          top: pxToTwips(sp.headerPad), bottom: pxToTwips(sp.headerPad),
          left: pxToTwips(sp.pad),      right:  pxToTwips(sp.pad),
        },
      })],
    })],
  }));

  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: hexColor(color) } },
    spacing: { line: LS.tight, before: 0, after: pxToTwips(sp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.aboutMe, color, tokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.name), LS.summary));
  }
  for (const section of col.sections) {
    children.push(sectionHeadingDocx(d, section.title, color, tokens));
    children.push(...buildCVSectionParagraphs(d, section, color, tokens));
  }
  return children;
}

// ── Compact ──────────────────────────────────────────────────────────────────
function buildCompactChildren(
  d: any, cv: CV, layout: LayoutDescriptor, color: string, tokens: Tokens, labels: DocxLabels,
): any[] {
  const info = cv.personalInfo;
  const { fs, sp } = tokens;
  const leftCol  = layout.columns[0];  // 60%
  const rightCol = layout.columns[1];  // 40%
  // tightSp mirrors CompactLayout.tsx
  const tightSp     = { ...sp, section: Math.round(sp.section * 0.85), item: Math.round(sp.item * 0.8) };
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
  children.push(para(d, { children: headerRuns, spacing: { line: LS.tight, after: pxToTwips(4) } }));

  if (contactParts.length) children.push(para(d, {
    children: contactParts.flatMap((part, i) => [
      new d.TextRun({ text: part, size: pxToHalfPt(fs.body), color: '888888' }),
      i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: pxToHalfPt(fs.body), color: 'AAAAAA' }) : null,
    ]).filter(Boolean) as any[],
    spacing: { line: LS.tight, after: 0 },
  }));

  children.push(para(d, {
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { line: LS.tight, before: pxToTwips(tightSp.item + 2), after: pxToTwips(tightSp.section) },
  }));

  if (info?.summary) {
    children.push(sectionHeadingDocx(d, labels.summary, color, tightTokens));
    children.push(...nl2paras(d, info.summary, pxToHalfPt(fs.body), LS.summary));
  }

  // Build column content from layout descriptor sections
  const buildColParas = (col: typeof leftCol): any[] => {
    const paras: any[] = [];
    for (const section of col.sections) {
      paras.push(sectionHeadingDocx(d, section.title, color, tightTokens));
      paras.push(...buildCVSectionParagraphs(d, section, color, tightTokens));
    }
    if (paras.length === 0) paras.push(para(d, { children: [] }));
    return paras;
  };

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [new d.TableRow({
      children: [
        cell(d, {
          children: buildColParas(leftCol),
          width:    leftCol.widthPct,
          margins:  { top: 0, bottom: 0, left: 0, right: pxToTwips(leftCol.pad.right) },
        }),
        cell(d, {
          children: buildColParas(rightCol),
          width:    rightCol.widthPct,
          margins:  { top: 0, bottom: 0, left: pxToTwips(rightCol.pad.left), right: 0 },
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

  const color  = cv.styling?.primaryColor || '#2563eb';
  const toTwip = (in_: number) =>
    (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(in_) : Math.round(in_ * 1440);

  // ── Single source of truth: compute tokens + layout once ─────────────────────
  const tokens  = getTokens(cv);
  const { fs }  = tokens;
  const font    = docxFont((cv.styling as any)?.fontFamily);

  // renderLayout() gives the same column structure as the React templates.
  // All builders consume the descriptor; section routing happens here only.
  const visibleSections = (sections || [])
    .filter((s) => s.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const descriptor = renderLayout(cv, visibleSections, tokens);
  const layoutType = descriptor.layoutType;

  let children: any[];
  let margin: { top: number; bottom: number; left: number; right: number };

  switch (layoutType) {
    case 'sidebar':
      margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.4), right: toTwip(0.4) };
      children = buildSidebarChildren(d, cv, descriptor, color, tokens, labels);
      break;
    case 'top-bar':
      margin   = { top: toTwip(0.4), bottom: toTwip(0.75), left: toTwip(0.5), right: toTwip(0.5) };
      children = buildTopBarChildren(d, cv, descriptor, color, tokens, labels);
      break;
    case 'compact':
      margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.75), right: toTwip(0.75) };
      children = buildCompactChildren(d, cv, descriptor, color, tokens, labels);
      break;
    default: // classic
      margin   = { top: toTwip(0.75), bottom: toTwip(0.75), left: toTwip(0.9), right: toTwip(0.9) };
      children = buildClassicChildren(d, cv, descriptor, color, tokens, labels);
  }

  const bodySize = pxToHalfPt(fs.body);

  const doc = new d.Document({
    styles: {
      default: {
        // Document-level defaults — all paragraphs inherit unless overridden
        document: {
          run: { font, size: bodySize, color: '222222' },
          paragraph: {
            spacing: { line: LS.normal, lineRule: 'auto' as any },
          },
        },
      },
      // Override Word built-in heading styles → prevent blue/bold defaults
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: bodySize, font },
          paragraph: { spacing: { line: LS.normal, before: 0, after: 0 } } },
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
