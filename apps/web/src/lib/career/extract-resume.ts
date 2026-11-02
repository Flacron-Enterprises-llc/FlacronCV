/** Same ceiling as the API (`RESUME_TEXT_MAX`) and as V1's upload. */
export const RESUME_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const RESUME_UPLOAD_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ResumeExtractCode = 'unsupported' | 'too_large' | 'empty' | 'failed';

export class ResumeExtractError extends Error {
  constructor(readonly code: ResumeExtractCode) {
    super(code);
    this.name = 'ResumeExtractError';
  }
}

export type ImportFormat = 'pdf' | 'docx';

export interface ExtractedResume {
  text: string;
  format: ImportFormat;
}

export interface ResumeParsers {
  pdf: (file: File) => Promise<string>;
  docx: (file: File) => Promise<string>;
}

export function importFormat(file: File): ImportFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  return null;
}

/**
 * Reads a resume in the browser. The API receives the text, never the
 * file (V1 `extractResumeText`). Parsers are injectable so tests do not
 * load PDF.js.
 */
export async function extractResumeText(file: File, parsers: ResumeParsers = realParsers): Promise<ExtractedResume> {
  if (file.size > RESUME_UPLOAD_MAX_BYTES) throw new ResumeExtractError('too_large');
  const format = importFormat(file);
  if (!format) throw new ResumeExtractError('unsupported');
  let text: string;
  try {
    text = format === 'pdf' ? await parsers.pdf(file) : await parsers.docx(file);
  } catch (error) {
    if (error instanceof ResumeExtractError) throw error;
    throw new ResumeExtractError('failed');
  }
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!cleaned) throw new ResumeExtractError('empty');
  return { text: cleaned, format };
}

function itemText(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'str' in item && typeof item.str === 'string') return item.str;
  return '';
}

const realParsers: ResumeParsers = {
  async pdf(file) {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      pages.push(content.items.map(itemText).join(' '));
    }
    return pages.join('\n');
  },
  async docx(file) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  },
};
