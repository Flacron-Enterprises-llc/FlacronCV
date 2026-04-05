import type { CV, CVSection, CVSectionType } from '@flacroncv/shared-types';
import type { CoverLetter } from '@flacroncv/shared-types';

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

// Map web font names → Word-safe equivalents
const DOCX_FONT_MAP: Record<string, string> = {
  'Inter':              'Calibri',
  'Roboto':             'Arial',
  'Lato':               'Calibri',
  'Open Sans':          'Arial',
  'Montserrat':         'Calibri',
  'Raleway':            'Calibri',
  'Nunito':             'Calibri',
  'Poppins':            'Calibri',
  'Merriweather':       'Georgia',
  'Playfair Display':   'Times New Roman',
  'Source Serif Pro':   'Georgia',
  'Lora':               'Georgia',
  'PT Serif':           'Georgia',
  'EB Garamond':        'Garamond',
  'Garamond':           'Garamond',
  'Georgia':            'Georgia',
  'Times New Roman':    'Times New Roman',
  'Calibri':            'Calibri',
  'Arial':              'Arial',
};

function docxFont(fontFamily?: string): string {
  return DOCX_FONT_MAP[fontFamily || 'Inter'] ?? 'Calibri';
}

function hexColor(color: string): string {
  return color.replace('#', '').slice(0, 6);
}

function nl2paras(d: any, text: string, opts: any = {}): any[] {
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line: string) =>
    new d.Paragraph({ children: [new d.TextRun({ text: line, size: 20, ...opts })], spacing: { after: 60 } })
  );
}

/** Standard section heading: colored ALL-CAPS label + colored bottom border */
function sectionHeading(d: any, title: string, color: string): any {
  return new d.Paragraph({
    children: [
      new d.TextRun({ text: title.toUpperCase(), bold: true, size: 22, color: hexColor(color) }),
    ],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: hexColor(color) } },
    spacing: { before: 240, after: 80 },
  });
}

/** Sidebar heading: white ALL-CAPS label + white/translucent bottom border */
function sidebarSectionHeading(d: any, title: string): any {
  return new d.Paragraph({
    children: [
      new d.TextRun({ text: title.toUpperCase(), bold: true, size: 18, color: 'FFFFFF' }),
    ],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' } },
    spacing: { before: 180, after: 60 },
  });
}

function buildCVSectionParagraphs(d: any, section: CVSection, color: string, variant: 'default' | 'sidebar' = 'default'): any[] {
  const paras: any[] = [];
  const type = section.type as string;
  const textColor = variant === 'sidebar' ? 'FFFFFF' : undefined;
  const dimColor  = variant === 'sidebar' ? 'CCCCCC' : '666666';
  const metaColor = variant === 'sidebar' ? 'CCCCCC' : '888888';
  const accentColor = variant === 'sidebar' ? 'FFFFFF' : hexColor(color);

  // ── Skills: grouped inline rows (4 per row) with · separators ──
  if (type === 'skills') {
    const items = (section.items || []) as any[];
    const COLS = 4;
    for (let i = 0; i < items.length; i += COLS) {
      const row = items.slice(i, i + COLS);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const level = it.level ? ` (${it.level})` : '';
        runs.push(new d.TextRun({ text: `${it.name}${level}`, size: 20, color: textColor, bold: true }));
        if (j < row.length - 1) {
          runs.push(new d.TextRun({ text: '   ·   ', size: 20, color: dimColor }));
        }
      });
      paras.push(new d.Paragraph({ children: runs, spacing: { after: 60 } }));
    }
    return paras;
  }

  // ── Languages: grouped inline rows (3 per row) with · separators ──
  if (type === 'languages') {
    const items = (section.items || []) as any[];
    const COLS = 3;
    for (let i = 0; i < items.length; i += COLS) {
      const row = items.slice(i, i + COLS);
      const runs: any[] = [];
      row.forEach((it: any, j: number) => {
        const prof = it.proficiency ? ` — ${it.proficiency}` : '';
        runs.push(new d.TextRun({ text: `${it.name}${prof}`, size: 20, color: textColor }));
        if (j < row.length - 1) {
          runs.push(new d.TextRun({ text: '   ·   ', size: 20, color: dimColor }));
        }
      });
      paras.push(new d.Paragraph({ children: runs, spacing: { after: 60 } }));
    }
    return paras;
  }

  for (const item of (section.items || [])) {
    const it = item as any;

    if (type === 'experience' || type === 'volunteer') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.position || it.title || '', bold: true, size: 22, color: textColor }),
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: 20, color: accentColor }) : null,
          it.location ? new d.TextRun({ text: `  |  ${it.location}`, size: 18, color: dimColor }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.isCurrent ? 'Present' : it.endDate].filter(Boolean).join(' – ');
      if (dates) {
        paras.push(new d.Paragraph({
          children: [new d.TextRun({ text: dates, size: 18, italics: true, color: metaColor })],
          spacing: { after: 40 },
        }));
      }
      paras.push(...nl2paras(d, it.description, textColor ? { color: textColor } : {}));
      if (it.highlights?.length) {
        for (const h of it.highlights) {
          paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `• ${h}`, size: 20, color: textColor })], spacing: { after: 40 } }));
        }
      }
    } else if (type === 'education') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: [it.degree, it.field].filter(Boolean).join(' in ') || '', bold: true, size: 22, color: textColor }),
          it.institution ? new d.TextRun({ text: `  •  ${it.institution}`, size: 20, color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: dates, size: 18, italics: true, color: metaColor })], spacing: { after: 40 } }));
      if (it.gpa) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `GPA: ${it.gpa}`, size: 18, color: textColor })], spacing: { after: 40 } }));
      paras.push(...nl2paras(d, it.description, textColor ? { color: textColor } : {}));
    } else if (type === 'projects') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22, color: textColor }),
          it.url ? new d.TextRun({ text: `  ${it.url}`, size: 18, color: accentColor }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: dates, size: 18, italics: true, color: metaColor })], spacing: { after: 40 } }));
      paras.push(...nl2paras(d, it.description, textColor ? { color: textColor } : {}));
      if (it.technologies?.length) {
        paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `Technologies: ${it.technologies.join(', ')}`, size: 18, italics: true, color: textColor })], spacing: { after: 40 } }));
      }
    } else if (type === 'certifications') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22, color: textColor }),
          it.issuer ? new d.TextRun({ text: `  •  ${it.issuer}`, size: 20, color: dimColor }) : null,
          it.date ? new d.TextRun({ text: `  |  ${it.date}`, size: 18, color: metaColor }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
    } else if (type === 'references') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22, color: textColor }),
          it.title ? new d.TextRun({ text: `, ${it.title}`, size: 20, color: textColor }) : null,
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: 20, color: dimColor }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
      if (it.email) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: it.email, size: 18, color: accentColor })], spacing: { after: 40 } }));
    } else {
      // custom / awards / publications
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.title || it.name || '', bold: true, size: 22, color: textColor }),
          it.subtitle ? new d.TextRun({ text: `  •  ${it.subtitle}`, size: 20, color: dimColor }) : null,
          it.date ? new d.TextRun({ text: `  |  ${it.date}`, size: 18, color: metaColor }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
      paras.push(...nl2paras(d, it.description, textColor ? { color: textColor } : {}));
    }
  }

  return paras;
}

// ─── Layout-specific DOCX builders ───────────────────────────────────────────

// Section types that live in the sidebar (SidebarLayout) or right column (CompactLayout)
const SIDEBAR_TYPES  = new Set(['skills', 'languages', 'certifications', 'awards']);
const COMPACT_RIGHT  = new Set(['skills', 'education', 'languages', 'certifications', 'awards', 'references']);

/** No-border definition reused across tables */
const NoBorder = { style: 'nil' as any, size: 0, color: 'auto' };
const NoBorders = {
  top: NoBorder, bottom: NoBorder, left: NoBorder, right: NoBorder,
  insideHorizontal: NoBorder, insideVertical: NoBorder,
};

// ─── DOCX label translation table ────────────────────────────────────────────
// Cannot use React hooks in async non-component functions, so we maintain a
// static lookup keyed by locale code.
const DOCX_LABELS: Record<string, Record<string, string>> = {
  en: {
    professional_summary: 'Professional Summary',
    profile: 'Profile',
    contact: 'Contact',
    about_me: 'About Me',
    summary: 'Summary',
  },
  es: {
    professional_summary: 'Resumen Profesional',
    profile: 'Perfil',
    contact: 'Contacto',
    about_me: 'Sobre Mí',
    summary: 'Resumen',
  },
  fr: {
    professional_summary: 'Résumé Professionnel',
    profile: 'Profil',
    contact: 'Contact',
    about_me: 'À Propos',
    summary: 'Résumé',
  },
  de: {
    professional_summary: 'Professionelle Zusammenfassung',
    profile: 'Profil',
    contact: 'Kontakt',
    about_me: 'Über Mich',
    summary: 'Zusammenfassung',
  },
  ar: {
    professional_summary: 'الملخص المهني',
    profile: 'الملف الشخصي',
    contact: 'التواصل',
    about_me: 'نبذة عني',
    summary: 'الملخص',
  },
  ur: {
    professional_summary: 'پیشہ ورانہ خلاصہ',
    profile: 'پروفائل',
    contact: 'رابطہ',
    about_me: 'میرے بارے میں',
    summary: 'خلاصہ',
  },
};

const SUPPORTED_LOCALES = new Set(Object.keys(DOCX_LABELS));

function getLabel(key: string, locale: string): string {
  const loc = SUPPORTED_LOCALES.has(locale) ? locale : 'en';
  return DOCX_LABELS[loc]?.[key] ?? DOCX_LABELS['en'][key] ?? key;
}

// ── Classic (unchanged logic, extracted into a helper) ──────────────────────
function buildClassicChildren(d: any, cv: CV, sections: CVSection[], color: string, locale: string): any[] {
  const name = [cv.personalInfo?.firstName, cv.personalInfo?.lastName].filter(Boolean).join(' ') || cv.title;
  const info = cv.personalInfo;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];

  const children: any[] = [];

  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: name, bold: true, size: 52, color: hexColor(color) })],
    alignment: d.AlignmentType.CENTER,
    spacing: { after: 60 },
  }));
  if (info?.headline) {
    children.push(new d.Paragraph({
      children: [new d.TextRun({ text: info.headline, size: 24, color: '555555' })],
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
  }
  if (contactParts.length) {
    children.push(new d.Paragraph({
      children: contactParts.flatMap((part, i) => [
        new d.TextRun({ text: part, size: 18, color: '555555' }),
        i < contactParts.length - 1 ? new d.TextRun({ text: '  |  ', size: 18, color: '999999' }) : null,
      ]).filter(Boolean) as any[],
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
  }
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { after: 120 },
  }));
  if (info?.summary) {
    children.push(sectionHeading(d, getLabel('professional_summary', locale), color));
    children.push(...nl2paras(d, info.summary, { size: 20 }));
  }
  for (const section of sections) {
    children.push(sectionHeading(d, section.title, color));
    children.push(...buildCVSectionParagraphs(d, section, color));
  }
  return children;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function buildSidebarChildren(d: any, cv: CV, sections: CVSection[], color: string, locale: string): any[] {
  const info = cv.personalInfo;
  const initials = ((info?.firstName?.[0] ?? '') + (info?.lastName?.[0] ?? '')).toUpperCase();
  const fullName  = [info?.firstName, info?.lastName].filter(Boolean).join('\n') || cv.title;

  const sidebarSections = sections.filter(s => SIDEBAR_TYPES.has(s.type));
  const mainSections    = sections.filter(s => !SIDEBAR_TYPES.has(s.type));

  // ── Left cell paragraphs ──
  const leftParas: any[] = [];

  // Monogram
  if (initials) {
    leftParas.push(new d.Paragraph({
      children: [new d.TextRun({ text: initials, bold: true, size: 36, color: hexColor(color) })],
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 60 },
      shading: { fill: 'FFFFFF', type: 'clear' as any, color: 'auto' },
      // monogram circle approximated with a bordered paragraph
      border: {
        top: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
        bottom: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
        left: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
        right: { style: d.BorderStyle.SINGLE, size: 12, color: 'FFFFFF' },
      },
    }));
  }

  // Name (split on newline → two TextRuns)
  const nameParts = fullName.split('\n').filter(Boolean);
  leftParas.push(new d.Paragraph({
    children: nameParts.map((part, i) =>
      new d.TextRun({ text: part + (i < nameParts.length - 1 ? '\n' : ''), bold: true, size: 28, color: 'FFFFFF', break: i > 0 ? 1 : 0 })
    ),
    alignment: d.AlignmentType.CENTER,
    spacing: { after: 60 },
  }));

  if (info?.headline) {
    leftParas.push(new d.Paragraph({
      children: [new d.TextRun({ text: info.headline, size: 18, color: 'E0E0E0' })],
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 120 },
    }));
  }

  // Contact
  leftParas.push(sidebarSectionHeading(d, getLabel('contact', locale)));
  const contactLines = [
    info?.email,
    info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin,
    info?.website,
  ].filter(Boolean) as string[];
  for (const line of contactLines) {
    leftParas.push(new d.Paragraph({
      children: [new d.TextRun({ text: line, size: 18, color: 'E0E0E0' })],
      spacing: { after: 40 },
    }));
  }

  // Sidebar sections (skills, languages, certs, awards)
  for (const section of sidebarSections) {
    leftParas.push(sidebarSectionHeading(d, section.title));
    leftParas.push(...buildCVSectionParagraphs(d, section, color, 'sidebar'));
  }

  // ── Right cell paragraphs ──
  const rightParas: any[] = [];

  if (info?.summary) {
    rightParas.push(sectionHeading(d, getLabel('profile', locale), color));
    rightParas.push(...nl2paras(d, info.summary, { size: 20 }));
  }
  for (const section of mainSections) {
    rightParas.push(sectionHeading(d, section.title, color));
    rightParas.push(...buildCVSectionParagraphs(d, section, color));
  }
  // Ensure cells are never empty (Word requires at least one paragraph per cell)
  if (leftParas.length === 0)  leftParas.push(new d.Paragraph({ children: [] }));
  if (rightParas.length === 0) rightParas.push(new d.Paragraph({ children: [] }));

  const table = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [
      new d.TableRow({
        children: [
          // Left sidebar cell — colored background
          new d.TableCell({
            children: leftParas,
            width: { size: 30, type: d.WidthType.PERCENTAGE },
            shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
            margins: { top: 200, bottom: 200, left: 160, right: 160 },
            borders: NoBorders,
          }),
          // Right main cell — white background
          new d.TableCell({
            children: rightParas,
            width: { size: 70, type: d.WidthType.PERCENTAGE },
            margins: { top: 200, bottom: 200, left: 200, right: 160 },
            borders: NoBorders,
          }),
        ],
      }),
    ],
  });

  return [table];
}

// ── Top-Bar ──────────────────────────────────────────────────────────────────
function buildTopBarChildren(d: any, cv: CV, sections: CVSection[], color: string, locale: string): any[] {
  const info = cv.personalInfo;
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
  ].filter(Boolean) as string[];
  const linkParts = [info?.linkedin, info?.website].filter(Boolean) as string[];

  const children: any[] = [];

  // ── Colored header band (full-width table with 1 cell) ──
  const headerParas: any[] = [];

  headerParas.push(new d.Paragraph({
    children: [new d.TextRun({ text: name, bold: true, size: 48, color: 'FFFFFF' })],
    spacing: { after: 60 },
  }));
  if (info?.headline) {
    headerParas.push(new d.Paragraph({
      children: [new d.TextRun({ text: info.headline, size: 22, color: 'E8E8E8' })],
      spacing: { after: 60 },
    }));
  }
  if (contactParts.length) {
    headerParas.push(new d.Paragraph({
      children: contactParts.flatMap((part, i) => [
        new d.TextRun({ text: part, size: 18, color: 'DDDDDD' }),
        i < contactParts.length - 1 ? new d.TextRun({ text: '   |   ', size: 18, color: 'AAAAAA' }) : null,
      ]).filter(Boolean) as any[],
      spacing: { after: 40 },
    }));
  }
  if (linkParts.length) {
    headerParas.push(new d.Paragraph({
      children: linkParts.flatMap((part, i) => [
        new d.TextRun({ text: part, size: 16, color: 'BBBBBB' }),
        i < linkParts.length - 1 ? new d.TextRun({ text: '   ·   ', size: 16, color: '888888' }) : null,
      ]).filter(Boolean) as any[],
      spacing: { after: 0 },
    }));
  }

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [
      new d.TableRow({
        children: [
          new d.TableCell({
            children: headerParas,
            shading: { fill: hexColor(color), type: 'clear' as any, color: 'auto' },
            margins: { top: 280, bottom: 280, left: 280, right: 280 },
            borders: NoBorders,
          }),
        ],
      }),
    ],
  }));

  // Thin accent strip
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 8, color: hexColor(color) } },
    spacing: { before: 0, after: 120 },
  }));

  // Summary
  if (info?.summary) {
    children.push(sectionHeading(d, getLabel('about_me', locale), color));
    children.push(...nl2paras(d, info.summary, { size: 20 }));
  }

  // Sections
  for (const section of sections) {
    children.push(sectionHeading(d, section.title, color));
    children.push(...buildCVSectionParagraphs(d, section, color));
  }

  return children;
}

// ── Compact ──────────────────────────────────────────────────────────────────
function buildCompactChildren(d: any, cv: CV, sections: CVSection[], color: string, locale: string): any[] {
  const info = cv.personalInfo;
  const name = [info?.firstName, info?.lastName].filter(Boolean).join(' ') || cv.title;
  const contactParts = [
    info?.email, info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin, info?.website,
  ].filter(Boolean) as string[];

  const children: any[] = [];

  // ── Inline header: name + headline on one line ──
  const headerRuns: any[] = [
    new d.TextRun({ text: name, bold: true, size: 36, color: hexColor(color) }),
  ];
  if (info?.headline) {
    headerRuns.push(new d.TextRun({ text: `   ${info.headline}`, size: 20, color: '666666' }));
  }
  children.push(new d.Paragraph({
    children: headerRuns,
    spacing: { after: 40 },
  }));

  // Contact line
  if (contactParts.length) {
    children.push(new d.Paragraph({
      children: contactParts.flatMap((part, i) => [
        new d.TextRun({ text: part, size: 17, color: '777777' }),
        i < contactParts.length - 1 ? new d.TextRun({ text: '  ·  ', size: 17, color: 'AAAAAA' }) : null,
      ]).filter(Boolean) as any[],
      spacing: { after: 0 },
    }));
  }

  // Colored bottom border acting as the divider
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { before: 80, after: 160 },
  }));

  // Full-width summary
  if (info?.summary) {
    children.push(sectionHeading(d, getLabel('summary', locale), color));
    children.push(...nl2paras(d, info.summary, { size: 20 }));
  }

  // Split sections into left (60%) and right (40%)
  const leftSections  = sections.filter(s => !COMPACT_RIGHT.has(s.type));
  const rightSections = sections.filter(s =>  COMPACT_RIGHT.has(s.type));

  const buildColParas = (cols: CVSection[]) => {
    const paras: any[] = [];
    for (const section of cols) {
      paras.push(sectionHeading(d, section.title, color));
      paras.push(...buildCVSectionParagraphs(d, section, color));
    }
    if (paras.length === 0) paras.push(new d.Paragraph({ children: [] }));
    return paras;
  };

  children.push(new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: NoBorders,
    rows: [
      new d.TableRow({
        children: [
          new d.TableCell({
            children: buildColParas(leftSections),
            width: { size: 60, type: d.WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 0, left: 0, right: 200 },
            borders: NoBorders,
          }),
          new d.TableCell({
            children: buildColParas(rightSections),
            width: { size: 40, type: d.WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 0, left: 200, right: 0 },
            borders: NoBorders,
          }),
        ],
      }),
    ],
  }));

  return children;
}

// ─── Main DOCX builder ────────────────────────────────────────────────────────
async function buildCVDocx(cv: CV, sections: CVSection[], locale: string): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const layout  = ((cv.styling as any)?.layout || 'classic') as string;
  const color   = cv.styling?.primaryColor || '#2563eb';
  const toTwip  = (in_: number) =>
    (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(in_) : Math.round(in_ * 1440);

  const visibleSections = (sections || [])
    .filter((s) => s.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let children: any[];
  let margin: { top: number; bottom: number; left: number; right: number };

  if (layout === 'sidebar') {
    // Sidebar needs tighter outer margins — the table cells supply inner padding
    margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.4), right: toTwip(0.4) };
    children = buildSidebarChildren(d, cv, visibleSections, color, locale);
  } else if (layout === 'top-bar') {
    // Top-bar: reduce top margin so the header table sits near the page top
    margin   = { top: toTwip(0.4), bottom: toTwip(0.75), left: toTwip(0.9), right: toTwip(0.9) };
    children = buildTopBarChildren(d, cv, visibleSections, color, locale);
  } else if (layout === 'compact') {
    margin   = { top: toTwip(0.5), bottom: toTwip(0.75), left: toTwip(0.75), right: toTwip(0.75) };
    children = buildCompactChildren(d, cv, visibleSections, color, locale);
  } else {
    margin   = { top: toTwip(0.75), bottom: toTwip(0.75), left: toTwip(0.9), right: toTwip(0.9) };
    children = buildClassicChildren(d, cv, visibleSections, color, locale);
  }

  const font = docxFont((cv.styling as any)?.fontFamily);

  const doc = new d.Document({
    styles: {
      default: {
        document: {
          run: { font, size: 20, color: '222222' },
        },
      },
      // Override Word's built-in heading styles so they never leak blue/bold defaults
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: 20, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: 20, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { bold: false, color: '222222', size: 20, font },
          paragraph: { spacing: { before: 0, after: 0 } } },
      ],
    },
    sections: [{
      properties: { page: { margin } },
      children,
    }],
  });

  return d.Packer.toBlob(doc);
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────
export async function exportToDocx(cv: CV, sections: CVSection[], locale: string = 'en'): Promise<void> {
  if (!SUPPORTED_LOCALES.has(locale)) {
    throw new Error(`Unsupported export locale: "${locale}". Supported: ${[...SUPPORTED_LOCALES].join(', ')}`);
  }
  console.debug(`[exportToDocx] locale=${locale}, layout=${(cv.styling as any)?.layout || 'classic'}`);
  const blob = await buildCVDocx(cv, sections, locale);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
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
