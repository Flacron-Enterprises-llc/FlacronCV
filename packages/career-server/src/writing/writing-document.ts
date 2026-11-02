import { coverLetterTemplateOf, type CoverLetterTemplateId } from '@flacroncv/career-shared';
import { exportFileName, renderDocx, renderPdf, type PdfLine } from '../documents/portable-document';

export { exportFileName };

export function letterLines(input: {
  title: string;
  body: string;
  sender?: string;
  watermark: boolean;
}): PdfLine[] {
  const paragraphs = input.body.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const sender = input.sender?.trim() ?? '';
  const lines: PdfLine[] = [];
  if (sender) {
    lines.push({ role: 'name', text: sender });
    if (sender !== input.title) lines.push({ role: 'heading', text: input.title });
  } else {
    // Without a sender, print the title once — not as both name and heading.
    lines.push({ role: 'name', text: input.title });
  }
  // Keep a paragraph's own line breaks ("Sincerely," / name) as separate lines of one paragraph.
  paragraphs.forEach((text, paragraph) => {
    for (const part of text.split(/\n/).map((piece) => piece.trim()).filter(Boolean)) {
      lines.push({ role: 'body', text: part, paragraph });
    }
  });
  if (input.watermark) lines.push({ role: 'watermark', text: 'Prepared with FlacronCV' });
  return lines;
}

export function renderCoverLetterPdf(input: {
  title: string;
  body: string;
  templateId: CoverLetterTemplateId;
  watermark: boolean;
  sender?: string;
}): Buffer {
  const template = coverLetterTemplateOf(input.templateId);
  return renderPdf(letterLines(input), {
    family:
      template.header === 'band'
        ? 'topbar'
        : template.header === 'rail'
          ? 'sidebar'
          : template.header === 'rule'
            ? 'slate-gold'
            : template.header === 'masthead'
              ? 'editorial'
              : template.header === 'split'
                ? 'structured'
                : 'classic',
    accent: template.accent,
    letterHeader: template.header,
  });
}

export function renderCoverLetterDocx(input: {
  title: string;
  body: string;
  watermark: boolean;
  sender?: string;
}): Buffer {
  return renderDocx(letterLines({ ...input, watermark: false }), input.watermark);
}
