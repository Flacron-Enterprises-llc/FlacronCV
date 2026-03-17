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
export async function exportToPDF(cv: CV, _sections: CVSection[]): Promise<void> {
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

function hexColor(color: string): string {
  return color.replace('#', '').slice(0, 6);
}

function nl2paras(d: any, text: string, opts: any = {}): any[] {
  if (!text) return [];
  return text.split(/\n+/).filter(Boolean).map((line: string) =>
    new d.Paragraph({ children: [new d.TextRun({ text: line, size: 20, ...opts })], spacing: { after: 60 } })
  );
}

function sectionHeading(d: any, title: string, color: string): any {
  return new d.Paragraph({
    children: [
      new d.TextRun({ text: title.toUpperCase(), bold: true, size: 22, color: hexColor(color) }),
    ],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: hexColor(color) } },
    spacing: { before: 240, after: 80 },
  });
}

function buildCVSectionParagraphs(d: any, section: CVSection, color: string): any[] {
  const paras: any[] = [];
  const type = section.type as string;

  for (const item of (section.items || [])) {
    const it = item as any;

    if (type === 'experience' || type === 'volunteer') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.position || it.title || '', bold: true, size: 22 }),
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: 20, color: hexColor(color) }) : null,
          it.location ? new d.TextRun({ text: `  |  ${it.location}`, size: 18, color: '666666' }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.isCurrent ? 'Present' : it.endDate].filter(Boolean).join(' – ');
      if (dates) {
        paras.push(new d.Paragraph({
          children: [new d.TextRun({ text: dates, size: 18, italics: true, color: '888888' })],
          spacing: { after: 40 },
        }));
      }
      paras.push(...nl2paras(d, it.description));
      if (it.highlights?.length) {
        for (const h of it.highlights) {
          paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `• ${h}`, size: 20 })], spacing: { after: 40 } }));
        }
      }
    } else if (type === 'education') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: [it.degree, it.field].filter(Boolean).join(' in ') || '', bold: true, size: 22 }),
          it.institution ? new d.TextRun({ text: `  •  ${it.institution}`, size: 20, color: hexColor(color) }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: dates, size: 18, italics: true, color: '888888' })], spacing: { after: 40 } }));
      if (it.gpa) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `GPA: ${it.gpa}`, size: 18 })], spacing: { after: 40 } }));
      paras.push(...nl2paras(d, it.description));
    } else if (type === 'skills') {
      const level = it.level ? ` (${it.level})` : '';
      paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `• ${it.name}${level}`, size: 20 })], spacing: { after: 40 } }));
    } else if (type === 'projects') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22 }),
          it.url ? new d.TextRun({ text: `  ${it.url}`, size: 18, color: hexColor(color) }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
      }));
      const dates = [it.startDate, it.endDate].filter(Boolean).join(' – ');
      if (dates) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: dates, size: 18, italics: true, color: '888888' })], spacing: { after: 40 } }));
      paras.push(...nl2paras(d, it.description));
      if (it.technologies?.length) {
        paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `Technologies: ${it.technologies.join(', ')}`, size: 18, italics: true })], spacing: { after: 40 } }));
      }
    } else if (type === 'certifications') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22 }),
          it.issuer ? new d.TextRun({ text: `  •  ${it.issuer}`, size: 20, color: '666666' }) : null,
          it.date ? new d.TextRun({ text: `  |  ${it.date}`, size: 18, color: '888888' }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
    } else if (type === 'languages') {
      const prof = it.proficiency ? ` — ${it.proficiency}` : '';
      paras.push(new d.Paragraph({ children: [new d.TextRun({ text: `• ${it.name}${prof}`, size: 20 })], spacing: { after: 40 } }));
    } else if (type === 'references') {
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.name || '', bold: true, size: 22 }),
          it.title ? new d.TextRun({ text: `, ${it.title}`, size: 20 }) : null,
          it.company ? new d.TextRun({ text: `  •  ${it.company}`, size: 20, color: '666666' }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
      if (it.email) paras.push(new d.Paragraph({ children: [new d.TextRun({ text: it.email, size: 18, color: hexColor(color) })], spacing: { after: 40 } }));
    } else {
      // custom / awards / publications
      paras.push(new d.Paragraph({
        children: [
          new d.TextRun({ text: it.title || it.name || '', bold: true, size: 22 }),
          it.subtitle ? new d.TextRun({ text: `  •  ${it.subtitle}`, size: 20, color: '666666' }) : null,
          it.date ? new d.TextRun({ text: `  |  ${it.date}`, size: 18, color: '888888' }) : null,
        ].filter(Boolean),
        spacing: { before: 80, after: 40 },
      }));
      paras.push(...nl2paras(d, it.description));
    }
  }

  return paras;
}

async function buildCVDocx(cv: CV, sections: CVSection[]): Promise<Blob> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;

  const color = cv.styling?.primaryColor || '#2563eb';
  const name = [cv.personalInfo?.firstName, cv.personalInfo?.lastName].filter(Boolean).join(' ') || cv.title;
  const info = cv.personalInfo;

  const contactParts = [
    info?.email,
    info?.phone,
    info?.city && info?.country ? `${info.city}, ${info.country}` : info?.city || info?.country,
    info?.linkedin,
    info?.website,
  ].filter(Boolean);

  const children: any[] = [];

  // ── Header: name + headline ──
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

  // ── Contact info ──
  if (contactParts.length) {
    children.push(new d.Paragraph({
      children: contactParts.flatMap((part, i) => [
        new d.TextRun({ text: part as string, size: 18, color: '555555' }),
        i < contactParts.length - 1 ? new d.TextRun({ text: '  |  ', size: 18, color: '999999' }) : null,
      ]).filter(Boolean) as any[],
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
  }

  // ── Divider ──
  children.push(new d.Paragraph({
    children: [],
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: hexColor(color) } },
    spacing: { after: 120 },
  }));

  // ── Summary ──
  if (info?.summary) {
    children.push(sectionHeading(d, 'Professional Summary', color));
    children.push(...nl2paras(d, info.summary, { size: 20 }));
  }

  // ── Sections ──
  const visibleSections = (sections || [])
    .filter((s) => s.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const section of visibleSections) {
    children.push(sectionHeading(d, section.title, color));
    children.push(...buildCVSectionParagraphs(d, section, color));
  }

  const doc = new d.Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(0.75) : 1080,
            bottom: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(0.75) : 1080,
            left: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(0.9) : 1296,
            right: (d as any).convertInchesToTwip ? (d as any).convertInchesToTwip(0.9) : 1296,
          },
        },
      },
      children,
    }],
  });

  return d.Packer.toBlob(doc);
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────
export async function exportToDocx(cv: CV, sections: CVSection[]): Promise<void> {
  const blob = await buildCVDocx(cv, sections);
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
