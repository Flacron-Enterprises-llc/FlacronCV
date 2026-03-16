import type { CV, CVSection } from '@flacroncv/shared-types';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

/**
 * Capture an element to canvas and return both the canvas and a Uint8Array of
 * the PNG bytes (for embedding in DOCX).
 */
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

async function canvasToUint8Array(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/png');
  });
}

/**
 * Render canvas to DOCX with the image filling an A4 page (no margins).
 * This guarantees the DOCX looks identical to the PDF and editor preview.
 */
async function exportAsImageDocx(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const docxModule = await import('docx');
  const d = (docxModule.Document ? docxModule : (docxModule as any).default ?? docxModule) as typeof docxModule;
  const { Document, Packer, Paragraph, ImageRun } = d;

  const imgBytes = await canvasToUint8Array(canvas);

  // A4 in twips (1 inch = 1440 twips): 210mm × 297mm
  const A4_W = 11906;
  const A4_H = 16838;

  // Image dimensions in pixels to fill the A4 content area (no margins → 794 × proportional)
  const imgW = 794;
  const imgH = Math.round((canvas.height / canvas.width) * imgW);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: A4_W, height: A4_H },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: imgBytes,
              transformation: { width: imgW, height: imgH },
              type: 'png',
            } as any),
          ],
          spacing: { before: 0, after: 0 },
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
/**
 * Captures the live editor preview (id="cv-preview-content") with html2canvas
 * so the exported PDF is pixel-for-pixel identical to the editor.
 */
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

// ─── DOCX Export ─────────────────────────────────────────────────────────────
/**
 * Captures the live editor preview and embeds it as a full-page image in DOCX.
 * Identical appearance to the PDF and the editor — all layouts, colors, and
 * photos are preserved exactly.
 */
export async function exportToDocx(cv: CV, _sections: CVSection[]): Promise<void> {
  const sourceEl = document.getElementById('cv-preview-content');
  if (!sourceEl) throw new Error('CV preview not found — please keep the editor open while exporting.');

  const clone = cloneForCapture(sourceEl);
  await new Promise((r) => setTimeout(r, 150));

  try {
    const canvas = await captureToCanvas(clone);
    await exportAsImageDocx(canvas, `${cv.title || 'CV'}.docx`);
  } finally {
    document.body.removeChild(clone);
  }
}

// ─── Cover Letter exports (called from the editor page) ──────────────────────
/**
 * Export cover letter preview (id="cl-preview-content") to PDF.
 */
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

/**
 * Export cover letter preview (id="cl-preview-content") to DOCX as image.
 */
export async function exportCoverLetterToDocx(title: string): Promise<void> {
  const sourceEl = document.getElementById('cl-preview-content');
  if (!sourceEl) throw new Error('Cover letter preview not found.');

  const clone = cloneForCapture(sourceEl);
  await new Promise((r) => setTimeout(r, 150));

  try {
    const canvas = await captureToCanvas(clone);
    await exportAsImageDocx(canvas, `${title || 'cover-letter'}.docx`);
  } finally {
    document.body.removeChild(clone);
  }
}
