/**
 * Client-side resume text extraction for the file-upload import (B3).
 *
 * PDF is parsed with `pdfjs-dist`, DOCX with `mammoth`. Both are **dynamically
 * imported** inside the handlers so these heavy parsers stay out of the initial
 * bundle and never execute during SSR. Extraction runs entirely in the browser;
 * only the resulting plain text is sent to the existing `POST /cvs/import`, so
 * no binary ever reaches the backend.
 *
 * pdfjs worker: served from `/public/pdf.worker.min.mjs` (same-origin → no CSP
 * issue, no CDN dependency). It is version-pinned — **re-copy it from
 * `node_modules/pdfjs-dist/build/` whenever pdfjs-dist is upgraded** (the worker
 * and API versions must match).
 */

export const RESUME_UPLOAD_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const RESUME_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type ResumeExtractErrorCode = 'unsupported' | 'too_large' | 'empty' | 'failed';

/** Typed error so the UI can map each cause to a localized message. */
export class ResumeExtractError extends Error {
  constructor(public readonly code: ResumeExtractErrorCode) {
    super(code);
    this.name = 'ResumeExtractError';
  }
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Same-origin module worker (see file header). Set once; idempotent.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' '),
    );
  }
  return parts.join('\n');
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

/**
 * Extract plain text from an uploaded resume (.pdf or .docx). Throws a
 * {@link ResumeExtractError} with a code the caller maps to a localized toast.
 */
export async function extractResumeText(file: File): Promise<string> {
  if (file.size > RESUME_UPLOAD_MAX_BYTES) throw new ResumeExtractError('too_large');

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocx =
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  let text: string;
  try {
    if (isPdf) text = await extractPdf(file);
    else if (isDocx) text = await extractDocx(file);
    else throw new ResumeExtractError('unsupported');
  } catch (err) {
    if (err instanceof ResumeExtractError) throw err;
    throw new ResumeExtractError('failed');
  }

  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!cleaned) throw new ResumeExtractError('empty'); // e.g. a scanned/image-only PDF
  return cleaned;
}
