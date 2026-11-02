import {
  RESUME_WATERMARK,
  resumeContactLine,
  resumeDisplayName,
  resumeLanguage,
  resumeLayoutOf,
  resumeSectionHeading,
  resumeTemplateOf,
  splitResumeLine,
  type ResumeBody,
} from '@flacroncv/career-shared';
import { exportFileName, renderDocx, renderPdf, type PdfLine } from '../documents/portable-document';

export { exportFileName };

/** Prefer the contact full name over the library resume title for the export heading. */
export function exportDisplayName(body: ResumeBody, title: string): string {
  return resumeDisplayName(body, title);
}

/** Sections whose lines read as an entry: title, dates, then detail. */
const ENTRY_SECTIONS = new Set(['experience', 'education', 'project', 'certification', 'achievement']);
/** Entries whose title is only the first part (a name); the rest of the line is detail. */
const NAMED_ENTRIES = new Set(['project', 'certification', 'achievement']);
/** Short items printed as one wrapped line instead of one line each. */
const INLINE_SECTIONS = new Set(['skill', 'language']);

/**
 * Same layout as the studio preview: the name heads the page, contact details follow without
 * repeating it, headings are real CV headings in the resume's language, and an entry's dates are
 * found wherever they sit in the edited line.
 */
export function resumeLines(body: ResumeBody, title: string, watermark: boolean, language?: string): PdfLine[] {
  const lang = resumeLanguage(language);
  const name = exportDisplayName(body, title);
  const lines: PdfLine[] = [{ role: 'name', text: name }];
  for (const section of body.sections) {
    if (section.factType !== 'contact') continue;
    for (const line of section.lines) {
      const contact = resumeContactLine(line.text, name);
      if (contact) lines.push({ role: 'contact', text: line.uncertain ? `${contact} *` : contact });
    }
  }
  for (const section of body.sections) {
    if (section.factType === 'contact' || section.lines.length === 0) continue;
    lines.push({ role: 'heading', text: resumeSectionHeading(section.factType, lang) });
    if (INLINE_SECTIONS.has(section.factType)) {
      lines.push({ role: 'body', text: section.lines.map((line) => `${line.text}${line.uncertain ? ' *' : ''}`).join(' · ') });
      continue;
    }
    for (const line of section.lines) {
      const mark = line.uncertain ? ' *' : '';
      if (!ENTRY_SECTIONS.has(section.factType)) {
        lines.push({ role: 'body', text: `${line.text}${mark}` });
        continue;
      }
      const split = splitResumeLine(line.text, lang);
      const titleParts = split.title.split(' · ').filter(Boolean);
      const parts = NAMED_ENTRIES.has(section.factType) && titleParts.length > 1
        ? { title: titleParts[0] ?? '', dates: split.dates, detail: [titleParts.slice(1).join(' · '), split.detail].filter(Boolean).join(' · ') }
        : split;
      if (!parts.dates && !parts.detail) {
        const role = section.factType === 'experience' || section.factType === 'education' ? 'job' : 'body';
        lines.push({ role, text: `${parts.title}${mark}` });
        continue;
      }
      if (parts.title) lines.push({ role: 'job', text: `${parts.title}${mark}` });
      if (parts.dates) lines.push({ role: 'meta', text: parts.dates });
      if (parts.detail) lines.push({ role: 'body', text: parts.detail });
    }
  }
  if (watermark) lines.push({ role: 'watermark', text: RESUME_WATERMARK[lang] });
  return lines;
}

export function renderResumePdf(body: ResumeBody, title: string, watermark: boolean, language?: string): Buffer {
  const template = resumeTemplateOf(body.templateId);
  return renderPdf(resumeLines(body, title, watermark, language), {
    family: resumeLayoutOf(body.templateId),
    accent: template.accent,
  });
}

export function renderResumeDocx(body: ResumeBody, title: string, watermark: boolean, language?: string): Buffer {
  return renderDocx(resumeLines(body, title, false, language), watermark, language);
}
