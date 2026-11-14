/**
 * Pure helpers shared by the cover-letter preview and its DOCX export, so the
 * Word file says exactly what the on-screen letter (and its PDF) says: the same
 * salutation, subject line, closing and date, in the same language and
 * direction. The DOCX used to hard-code English ("Re:", "Application for",
 * "Dear Hiring Manager,", "Sincerely,") and an en-US date regardless of the
 * template or the interface language.
 *
 * Labels themselves come from the caller (CoverLetterPreview builds them;
 * the export call site passes the same set). No React or DOM-at-import here; `htmlToParagraphs` uses DOMParser when called.
 */
import type { CLLabels } from '@/components/cover-letter/templates/types';

/** Message keys of the `coverLetters` namespace that make up CLLabels. */
const LABEL_KEYS: Record<keyof CLLabels, string> = {
  dear: 'cl_dear',
  hiringManager: 'cl_hiring_manager',
  placeholder: 'cl_placeholder',
  yourName: 'cl_your_name',
  re: 'cl_re',
  subjectApplication: 'cl_subject_application',
  position: 'cl_position',
  closingSincerely: 'closing_sincerely',
  closingBestRegards: 'closing_best_regards',
  closingRegards: 'closing_regards',
  closingEnthusiasm: 'closing_enthusiasm',
  closingFaithfully: 'closing_faithfully',
  closingRespectfully: 'closing_respectfully',
};

/**
 * Build the letter labels from a `coverLetters` translator. Used by
 * components/cover-letter/letter-locale.ts, so the preview and the DOCX export
 * read the same keys and can never drift apart.
 */
export function coverLetterLabels(t: (key: string) => string): CLLabels {
  const out = {} as CLLabels;
  for (const [field, key] of Object.entries(LABEL_KEYS) as Array<[keyof CLLabels, string]>) out[field] = t(key);
  return out;
}

/** English labels — only used when a caller does not pass the localized set. */
export const EN_COVER_LETTER_LABELS: CLLabels = {
  dear: 'Dear',
  hiringManager: 'Hiring Manager',
  placeholder: 'Your letter content will appear here…',
  yourName: 'Your Name',
  re: 'RE:',
  subjectApplication: 'Subject: Application for',
  position: 'Position:',
  closingSincerely: 'Sincerely,',
  closingBestRegards: 'Best regards,',
  closingRegards: 'Regards,',
  closingEnthusiasm: 'With enthusiasm,',
  closingFaithfully: 'Yours faithfully,',
  closingRespectfully: 'Respectfully yours,',
};

/**
 * The template-specific wording: which subject-line prefix and which closing a
 * template uses. Mirrors components/cover-letter/templates/*Template.tsx.
 */
export function coverLetterScaffold(
  templateId: string | undefined,
  labels: CLLabels,
  recipientName?: string | null,
): { subjectPrefix: string; closing: string } {
  const named = Boolean(recipientName?.trim());
  switch (templateId) {
    case 'classic':    return { subjectPrefix: labels.re, closing: labels.closingSincerely };
    case 'minimalist': return { subjectPrefix: labels.re, closing: labels.closingRegards };
    case 'creative':   return { subjectPrefix: labels.re, closing: labels.closingEnthusiasm };
    case 'executive':  return { subjectPrefix: labels.re, closing: labels.closingRespectfully };
    case 'corporate':  return { subjectPrefix: labels.subjectApplication, closing: named ? labels.closingSincerely : labels.closingFaithfully };
    // 'modern', 'standard' and anything unknown render as ModernTemplate.
    default:           return { subjectPrefix: labels.position, closing: labels.closingBestRegards };
  }
}

/** "Dear Jane Doe," / "Dear Hiring Manager," — same rule as the preview's Salutation. */
export function coverLetterSalutation(labels: CLLabels, recipientName?: string | null): string {
  // Arabic and Urdu write the Arabic comma "،" — the same rule as the preview's
  // salutationComma (components/cover-letter/letter-locale.ts), kept local here
  // because that module imports this one.
  const comma = /[؀-ۿ]/.test(labels.dear) ? '،' : ',';
  return `${labels.dear} ${recipientName?.trim() || labels.hiringManager}${comma}`;
}

/** Long-form date in the letter's locale (the preview's `today`). */
export function formatLetterDate(locale: string, date: Date = new Date()): string {
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  try {
    return date.toLocaleDateString(locale, opts);
  } catch {
    return date.toLocaleDateString('en-US', opts);
  }
}

export const RTL_LETTER_LOCALES = ['ar', 'ur'];

/**
 * Plain-text paragraphs of the letter body (rich-text HTML from the editor or
 * paragraphised AI output).
 *
 * Parsed with DOMParser and read through `textContent`, so every entity is
 * decoded exactly once — the old regex chain decoded only four entities (so
 * "It&#39;s" reached Word verbatim) and decoded `&amp;` first, which turned a
 * literal "&amp;lt;" into "<". List items become their own paragraphs with a
 * bullet; text outside any block element is kept.
 */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  const source = (html ?? '').trim();
  if (!source) return [];
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  const out: string[] = [];
  const BLOCKS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);
  let inline = '';
  const flush = () => {
    for (const line of inline.split('\n')) if (line.trim()) out.push(line.trim());
    inline = '';
  };
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        inline += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (el.tagName === 'BR') {
          inline += '\n';
        } else if (el.tagName === 'UL' || el.tagName === 'OL') {
          flush();
          walk(el);
        } else if (el.tagName === 'LI') {
          // One paragraph per item with its marker. The editor stores items as
          // <li><p>…</p></li>, so the item's own text is gathered from all its
          // descendants except a nested list (which is walked after it).
          flush();
          const list = el.parentElement;
          const marker = list?.tagName === 'OL'
            ? `${Array.from(list.children).filter((c) => c.tagName === 'LI').indexOf(el) + (Number(list.getAttribute('start')) || 1)}.`
            : '•';
          const own = Array.from(el.childNodes)
            .filter((c) => !(c.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes((c as Element).tagName)))
            .map((c) => c.textContent ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (own) out.push(`${marker} ${own}`);
          for (const nested of Array.from(el.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL')) walk(nested);
        } else if (BLOCKS.has(el.tagName)) {
          flush();
          // A block that itself holds blocks (div > p) or line breaks is
          // walked, not flattened, so its structure survives.
          if (el.querySelector('br') || Array.from(el.children).some((c) => BLOCKS.has(c.tagName) || c.tagName === 'UL' || c.tagName === 'OL')) {
            walk(el);
            flush();
          } else {
            const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (text) out.push(text);
          }
        } else {
          walk(el);
        }
      }
    }
  };
  walk(doc.body);
  flush();
  return out;
}

/**
 * Direction of a paragraph from its first strong character — what dir="auto"
 * does in the browser. null when the text has no strong character.
 */
export function paragraphDirection(text: string): 'ltr' | 'rtl' | null {
  // Hebrew, Arabic (incl. Supplement/Extended) and the Arabic presentation forms.
  const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
  const m = text.match(/[A-Za-zÀ-ɏͰ-ӿ]|[֐-ࣿיִ-﷿ﹰ-ﻼ]/);
  if (!m) return null;
  return RTL.test(m[0]) ? 'rtl' : 'ltr';
}
