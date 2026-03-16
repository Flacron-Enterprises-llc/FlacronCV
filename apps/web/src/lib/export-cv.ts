import type { CV, CVSection } from '@flacroncv/shared-types';

// ─── PDF Export ──────────────────────────────────────────────────────────────
/**
 * Captures the live editor preview (id="cv-preview-content") directly with
 * html2canvas so the exported PDF is pixel-for-pixel identical to what the
 * user sees in the editor — including layout, colors, fonts, and photos.
 */
export async function exportToPDF(cv: CV, _sections: CVSection[]): Promise<void> {
  const sourceEl = document.getElementById('cv-preview-content');
  if (!sourceEl) throw new Error('CV preview not found — please keep the editor open while exporting.');

  // Clone the element so we can resize/strip decorations without touching the UI
  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-9999px',
    'width:794px',          // A4 at 96 dpi
    'overflow:visible',
    'border-radius:0',
    'box-shadow:none',
    'max-width:none',
  ].join(';');
  document.body.appendChild(clone);

  // Let the browser do a layout pass with the new width
  await new Promise((r) => setTimeout(r, 150));

  try {
    const h2cModule = await import('html2canvas');
    const html2canvas = (
      typeof h2cModule.default === 'function'
        ? h2cModule.default
        : typeof (h2cModule as any).html2canvas === 'function'
          ? (h2cModule as any).html2canvas
          : (h2cModule as any)
    ) as typeof import('html2canvas').default;

    const jsPDFModule = await import('jspdf');
    const jsPDF = (
      typeof jsPDFModule.jsPDF === 'function'
        ? jsPDFModule.jsPDF
        : typeof (jsPDFModule as any).default === 'function'
          ? (jsPDFModule as any).default
          : (jsPDFModule as any)
    ) as typeof import('jspdf').jsPDF;

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth  = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let position = 0;
    let remaining = imgHeight;
    while (remaining > 2) {
      if (position > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -position, pdfWidth, imgHeight);
      position  += pdfHeight;
      remaining -= pdfHeight;
    }

    pdf.save(`${cv.title || 'CV'}.pdf`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────
/**
 * Generates a DOCX that mirrors the template styling (color, fonts, layout).
 * Sidebar layout → 2-column table. All other layouts → styled single column.
 */
export async function exportToDocx(cv: CV, sections: CVSection[]): Promise<void> {
  const docxModule = await import('docx');
  const resolved = (
    docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule
  ) as typeof docxModule;

  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
    ShadingType,
  } = resolved;

  const color     = (cv.styling.primaryColor || '#2563eb').replace('#', '');
  const layout    = (cv.styling as any).layout as string || 'classic';
  const bodyFont  = cv.styling.fontFamily || 'Calibri';
  const headFont  = (cv.styling as any).headingFontFamily || bodyFont;

  const visibleSections = sections
    .filter((s) => s.isVisible)
    .sort((a, b) => cv.sectionOrder.indexOf(a.id) - cv.sectionOrder.indexOf(b.id));

  // ── helpers ──
  const makeSectionHeading = (title: string) =>
    new Paragraph({
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 24, color, font: headFont })],
      spacing: { before: 240, after: 80 },
      border: { bottom: { color, size: 6, style: BorderStyle.SINGLE } },
    });

  const makeItem = (item: any): Paragraph[] => {
    const paras: Paragraph[] = [];
    if (item.company || item.position) {
      paras.push(
        new Paragraph({
          children: [
            new TextRun({ text: item.position || '', bold: true, size: 22, font: bodyFont }),
            new TextRun({ text: `   ${item.startDate || ''} – ${item.endDate || 'Present'}`, size: 20, color: '888888', font: bodyFont }),
          ],
          spacing: { before: 120 },
        }),
        new Paragraph({ children: [new TextRun({ text: `${item.company || ''}${item.location ? ' | ' + item.location : ''}`, size: 20, color: '555555', font: bodyFont })] }),
      );
      if (item.description) paras.push(new Paragraph({ children: [new TextRun({ text: item.description, size: 20, font: bodyFont })], spacing: { after: 80 } }));
    } else if (item.institution) {
      paras.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${item.degree || ''}${item.field ? ' in ' + item.field : ''}`, bold: true, size: 22, font: bodyFont }),
            new TextRun({ text: `   ${item.startDate || ''}`, size: 20, color: '888888', font: bodyFont }),
          ],
          spacing: { before: 120 },
        }),
        new Paragraph({ children: [new TextRun({ text: item.institution, size: 20, color: '555555', font: bodyFont })] }),
      );
      if (item.description) paras.push(new Paragraph({ children: [new TextRun({ text: item.description, size: 20, font: bodyFont })], spacing: { after: 80 } }));
    } else if (item.name) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: `${item.name}${item.level ? ' (' + item.level + ')' : ''}`, size: 20, font: bodyFont })],
        bullet: { level: 0 },
      }));
    }
    return paras;
  };

  // ── header block (shared across all layouts) ──
  const headerParas: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: `${cv.personalInfo.firstName} ${cv.personalInfo.lastName}`, bold: true, size: 44, color, font: headFont })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
  ];
  if (cv.personalInfo.headline) {
    headerParas.push(new Paragraph({
      children: [new TextRun({ text: cv.personalInfo.headline, italics: true, size: 24, color: '555555', font: headFont })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }));
  }
  const contactLine = [
    cv.personalInfo.email,
    cv.personalInfo.phone,
    [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', '),
  ].filter(Boolean).join(' | ');
  if (contactLine) {
    headerParas.push(new Paragraph({
      children: [new TextRun({ text: contactLine, size: 20, color: '666666', font: bodyFont })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }));
  }
  const links = [cv.personalInfo.linkedin, cv.personalInfo.website].filter(Boolean).join(' | ');
  if (links) {
    headerParas.push(new Paragraph({
      children: [new TextRun({ text: links, size: 18, color: '888888', font: bodyFont })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));
  }

  // ── summary ──
  const summaryParas: Paragraph[] = [];
  if (cv.personalInfo.summary) {
    summaryParas.push(
      makeSectionHeading('Professional Summary'),
      new Paragraph({ children: [new TextRun({ text: cv.personalInfo.summary, size: 22, font: bodyFont })], spacing: { after: 200 } }),
    );
  }

  // ── SIDEBAR LAYOUT: 2-column table ──────────────────────────────────────────
  if (layout === 'sidebar') {
    const sidebarTypes = new Set(['skills', 'languages', 'certifications', 'awards']);
    const sidebarSections = visibleSections.filter((s) => sidebarTypes.has(s.type));
    const mainSections    = visibleSections.filter((s) => !sidebarTypes.has(s.type));

    const sidebarChildren: (Paragraph)[] = [];
    for (const sec of sidebarSections) {
      sidebarChildren.push(makeSectionHeading(sec.title));
      for (const item of sec.items) sidebarChildren.push(...makeItem(item));
    }

    const mainChildren: (Paragraph)[] = [...summaryParas];
    for (const sec of mainSections) {
      mainChildren.push(makeSectionHeading(sec.title));
      for (const item of sec.items) mainChildren.push(...makeItem(item));
    }

    const bodyChildren: any[] = [
      ...headerParas,
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0 },
          bottom: { style: BorderStyle.NONE, size: 0 },
          left: { style: BorderStyle.NONE, size: 0 },
          right: { style: BorderStyle.NONE, size: 0 },
          insideH: { style: BorderStyle.NONE, size: 0 },
          insideV: { style: BorderStyle.NONE, size: 0 },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.SOLID, color: color + '15', fill: color + '15' },
                children: sidebarChildren.length ? sidebarChildren : [new Paragraph({ children: [] })],
                margins: { top: 120, bottom: 120, left: 120, right: 200 },
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                children: mainChildren.length ? mainChildren : [new Paragraph({ children: [] })],
                margins: { top: 120, bottom: 120, left: 200, right: 120 },
              }),
            ],
          }),
        ],
      }),
    ];

    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 480, bottom: 480, left: 480, right: 480 } } }, children: bodyChildren }] });
    return downloadDocx(doc, Packer, cv.title);
  }

  // ── ALL OTHER LAYOUTS: single-column ────────────────────────────────────────
  const bodyChildren: Paragraph[] = [...headerParas, ...summaryParas];
  for (const sec of visibleSections) {
    bodyChildren.push(makeSectionHeading(sec.title));
    for (const item of sec.items) bodyChildren.push(...makeItem(item));
  }

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: bodyChildren }] });
  return downloadDocx(doc, Packer, cv.title);
}

async function downloadDocx(doc: any, Packer: any, title?: string) {
  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'CV'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
