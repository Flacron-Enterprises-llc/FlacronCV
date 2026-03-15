import type { CV, CVSection } from '@flacroncv/shared-types';
import { fontNameToCssVar } from '@/components/cv-builder/toolbar/FontPanel';

/**
 * Build a standalone HTML document for the CV (used for PDF export).
 * Uses Google Fonts import so the HTML works outside of Next.js context.
 */
function buildCVHTML(cv: CV, sections: CVSection[]): string {
  const bodyFont = cv.styling.fontFamily || 'Inter';
  const headingFont = (cv.styling as any).headingFontFamily || bodyFont;
  const color = cv.styling.primaryColor || '#2563eb';

  // Google Fonts import for the standalone HTML
  const fontsToImport = [...new Set([bodyFont, headingFont])];
  const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontsToImport
    .map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700`)
    .join('&')}&display=swap`;

  const visibleSections = sections
    .filter((s) => s.isVisible)
    .sort((a, b) => cv.sectionOrder.indexOf(a.id) - cv.sectionOrder.indexOf(b.id));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="${googleFontsUrl}" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: '${bodyFont}', sans-serif; color: #1a1a1a; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { color: ${color}; font-size: 28px; margin-bottom: 4px; font-family: '${headingFont}', sans-serif; }
  h2 { color: ${color}; font-size: 16px; font-family: '${headingFont}', sans-serif; border-bottom: 2px solid ${color}; padding-bottom: 4px; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .header { text-align: center; margin-bottom: 24px; }
  .headline { font-size: 15px; color: #555; margin: 4px 0; }
  .contact { font-size: 12px; color: #666; }
  .summary { margin-bottom: 16px; font-size: 13px; line-height: 1.7; }
  .section { margin-bottom: 16px; }
  .item { margin-bottom: 12px; }
  .item-header { display: flex; justify-content: space-between; align-items: baseline; }
  .item-title { font-weight: 600; font-size: 14px; }
  .item-subtitle { color: #555; font-size: 13px; }
  .item-date { color: #888; font-size: 12px; white-space: nowrap; }
  .item-desc { font-size: 13px; margin-top: 4px; color: #333; line-height: 1.6; }
  .skills-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .skill-tag { background: ${color}15; color: ${color}; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</h1>
    ${cv.personalInfo.headline ? `<div class="headline">${cv.personalInfo.headline}</div>` : ''}
    <div class="contact">${[cv.personalInfo.email, cv.personalInfo.phone, [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', ')].filter(Boolean).join(' | ')}</div>
    ${cv.personalInfo.linkedin || cv.personalInfo.website ? `<div class="contact" style="margin-top:2px">${[cv.personalInfo.linkedin, cv.personalInfo.website].filter(Boolean).join(' | ')}</div>` : ''}
  </div>
  ${cv.personalInfo.summary ? `<div class="summary"><h2>Professional Summary</h2><p>${cv.personalInfo.summary}</p></div>` : ''}
  ${visibleSections
    .map(
      (section) => `
    <div class="section">
      <h2>${section.title}</h2>
      ${section.type === 'skills'
        ? `<div class="skills-list">${section.items.map((item: any) => `<span class="skill-tag">${item.name || ''}</span>`).join('')}</div>`
        : section.items
            .map((item: any) => {
              if (item.company || item.position) {
                return `<div class="item">
                  <div class="item-header"><span class="item-title">${item.position || ''}</span><span class="item-date">${item.startDate || ''} - ${item.endDate || 'Present'}</span></div>
                  <div class="item-subtitle">${item.company || ''}${item.location ? ` | ${item.location}` : ''}</div>
                  ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
                </div>`;
              }
              if (item.institution) {
                return `<div class="item">
                  <div class="item-header"><span class="item-title">${item.degree || ''}${item.field ? ` in ${item.field}` : ''}</span><span class="item-date">${item.startDate || ''}</span></div>
                  <div class="item-subtitle">${item.institution}</div>
                  ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
                </div>`;
              }
              return `<div class="item"><span class="item-title">${item.name || item.title || ''}</span>${item.description ? `<div class="item-desc">${item.description}</div>` : ''}</div>`;
            })
            .join('')
      }
    </div>`,
    )
    .join('')}
</body>
</html>`;
}

/**
 * Export CV as PDF using html2canvas + jsPDF (client-side)
 */
export async function exportToPDF(cv: CV, sections: CVSection[]): Promise<void> {
  const html = buildCVHTML(cv, sections);

  // Create hidden iframe to render the HTML
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.width = '794px'; // A4 width in px at 96dpi
  iframe.style.height = '1123px'; // A4 height in px at 96dpi
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error('Failed to create iframe');

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Wait for fonts to load
  await new Promise((r) => setTimeout(r, 500));

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

    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2, // Higher DPI for better quality
      useCORS: true,
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Calculate aspect ratio
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    // Handle multi-page if content is longer than one page
    // Use a 2mm threshold to avoid a near-blank extra page from sub-pixel overflow
    let position = 0;
    let remaining = imgHeight;

    while (remaining > 2) {
      if (position > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
      position += pdfHeight;
      remaining -= pdfHeight;
    }

    pdf.save(`${cv.title || 'CV'}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}

/**
 * Export CV as DOCX using docx library (client-side)
 */
export async function exportToDocx(cv: CV, sections: CVSection[]): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
  const { saveAs } = await import('file-saver');

  const children: any[] = [];

  // Header: Name
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${cv.personalInfo.firstName} ${cv.personalInfo.lastName}`,
          bold: true,
          size: 36,
          color: (cv.styling.primaryColor || '#2563eb').replace('#', ''),
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
  );

  // Headline
  if (cv.personalInfo.headline) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: cv.personalInfo.headline, italics: true, size: 24, color: '555555' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
    );
  }

  // Contact info
  const contactParts = [cv.personalInfo.email, cv.personalInfo.phone, [cv.personalInfo.city, cv.personalInfo.country].filter(Boolean).join(', ')].filter(Boolean);
  children.push(
    new Paragraph({
      children: [new TextRun({ text: contactParts.join(' | '), size: 20, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  // Links
  const links = [cv.personalInfo.linkedin, cv.personalInfo.website].filter(Boolean);
  if (links.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: links.join(' | '), size: 18, color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
    );
  }

  // Summary
  if (cv.personalInfo.summary) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'PROFESSIONAL SUMMARY',
            bold: true,
            size: 24,
            color: (cv.styling.primaryColor || '#2563eb').replace('#', ''),
          }),
        ],
        spacing: { after: 100 },
        border: { bottom: { color: (cv.styling.primaryColor || '#2563eb').replace('#', ''), size: 2, style: 'single' as any } },
      }),
      new Paragraph({
        children: [new TextRun({ text: cv.personalInfo.summary, size: 22 })],
        spacing: { after: 300 },
      }),
    );
  }

  // Sections
  const visibleSections = sections
    .filter((s) => s.isVisible)
    .sort((a, b) => cv.sectionOrder.indexOf(a.id) - cv.sectionOrder.indexOf(b.id));

  for (const section of visibleSections) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title.toUpperCase(),
            bold: true,
            size: 24,
            color: (cv.styling.primaryColor || '#2563eb').replace('#', ''),
          }),
        ],
        spacing: { before: 200, after: 100 },
        border: { bottom: { color: (cv.styling.primaryColor || '#2563eb').replace('#', ''), size: 2, style: 'single' as any } },
      }),
    );

    for (const item of section.items) {
      const rec = item as any;

      if (rec.company || rec.position) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: rec.position || '', bold: true, size: 22 }),
              new TextRun({ text: `  ${rec.startDate || ''} - ${rec.endDate || 'Present'}`, size: 20, color: '888888' }),
            ],
            spacing: { before: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${rec.company || ''}${rec.location ? ` | ${rec.location}` : ''}`, size: 20, color: '555555' })],
          }),
        );
        if (rec.description) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: rec.description, size: 20 })],
              spacing: { after: 100 },
            }),
          );
        }
      } else if (rec.institution) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${rec.degree || ''}${rec.field ? ` in ${rec.field}` : ''}`, bold: true, size: 22 }),
              new TextRun({ text: `  ${rec.startDate || ''}`, size: 20, color: '888888' }),
            ],
            spacing: { before: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: rec.institution, size: 20, color: '555555' })],
          }),
        );
        if (rec.description) {
          children.push(new Paragraph({ children: [new TextRun({ text: rec.description, size: 20 })], spacing: { after: 100 } }));
        }
      } else if (rec.name) {
        // Skills or generic items
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${rec.name}${rec.level ? ` (${rec.level})` : ''}`, size: 20 })],
            bullet: { level: 0 },
          }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `${cv.title || 'CV'}.docx`);
}
