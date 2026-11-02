import type { FactType } from './facts';

/**
 * How a resume reads on paper. Shared by the studio preview and the PDF/DOCX
 * exporters so a downloaded file shows the same headings, name, and dates as
 * the preview. Line text stays the editable " · "-joined string; these helpers
 * only decide how it is laid out.
 */

export type ResumeLanguage = 'en' | 'fr';

export const RESUME_SECTION_HEADINGS: Record<ResumeLanguage, Record<FactType, string>> = {
  en: {
    contact: 'Contact',
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skill: 'Skills',
    project: 'Projects',
    achievement: 'Achievements',
    certification: 'Certifications',
    language: 'Languages',
    reference: 'References',
  },
  fr: {
    contact: 'Coordonnées',
    summary: 'Profil',
    experience: 'Expérience professionnelle',
    education: 'Formation',
    skill: 'Compétences',
    project: 'Projets',
    achievement: 'Réalisations',
    certification: 'Certifications',
    language: 'Langues',
    reference: 'Références',
  },
};

export const RESUME_WATERMARK: Record<ResumeLanguage, string> = {
  en: 'Prepared with FlacronCV',
  fr: 'Préparé avec FlacronCV',
};

export function resumeLanguage(value: string | null | undefined): ResumeLanguage {
  return value === 'fr' ? 'fr' : 'en';
}

export function resumeSectionHeading(factType: FactType | string, language: string | null | undefined): string {
  return RESUME_SECTION_HEADINGS[resumeLanguage(language)][factType as FactType] ?? factType;
}

const MONTHS: Record<ResumeLanguage, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
};
const PRESENT: Record<ResumeLanguage, string> = { en: 'Present', fr: 'Aujourd’hui' };

const ISO_DATE = /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/;
const PRESENT_WORD = /^(present|current|now|ongoing|aujourd['’]hui|en cours|actuel(?:le)?)$/i;
const RANGE_SPLIT = /\s*[–—]\s*|\s+-\s+/;

function isDateToken(token: string): boolean {
  return ISO_DATE.test(token) || PRESENT_WORD.test(token);
}

/** A whole " · " part that is a date, "present", or a range of those. */
export function isResumeDatePart(part: string): boolean {
  const trimmed = part.trim();
  if (!trimmed) return false;
  return trimmed.split(RANGE_SPLIT).every((token) => isDateToken(token.trim()));
}

function formatToken(token: string, language: ResumeLanguage): string {
  const trimmed = token.trim();
  if (PRESENT_WORD.test(trimmed)) return PRESENT[language];
  const match = ISO_DATE.exec(trimmed);
  if (!match) return trimmed;
  const month = match[2] ? Number(match[2]) : 0;
  if (month >= 1 && month <= 12) return `${MONTHS[language][month - 1]} ${match[1]}`;
  return match[1] ?? trimmed;
}

/** "2021-01" → "Jan 2021" / "janv. 2021"; a range keeps its order; anything else is returned as typed. */
export function formatResumeDate(part: string, language: string | null | undefined): string {
  const lang = resumeLanguage(language);
  return part
    .trim()
    .split(RANGE_SPLIT)
    .map((token) => formatToken(token, lang))
    .join(' – ');
}

export interface ResumeLineParts {
  /** Role and organisation (or the whole line when it has no date). */
  title: string;
  /** Formatted dates, e.g. "Jan 2021 – Jun 2024". Empty when the line has none. */
  dates: string;
  /** Text after the dates, such as responsibilities or a location. */
  detail: string;
}

/**
 * Splits an edited line wherever its dates are, not only when the date is the
 * last part: "Coordinator · Library · 2021-01 · 2024-06 · Led clinics" becomes
 * title "Coordinator · Library", dates "Jan 2021 – Jun 2024", detail "Led clinics".
 */
export function splitResumeLine(text: string, language: string | null | undefined): ResumeLineParts {
  const parts = text.split(' · ').map((part) => part.trim()).filter(Boolean);
  const dateIndexes = parts.flatMap((part, index) => (isResumeDatePart(part) ? [index] : []));
  if (dateIndexes.length === 0) return { title: parts.join(' · '), dates: '', detail: '' };
  const first = dateIndexes[0] ?? 0;
  const last = dateIndexes[dateIndexes.length - 1] ?? first;
  const between = parts.slice(first, last + 1);
  return {
    title: parts.slice(0, first).join(' · '),
    dates: between.filter(isResumeDatePart).map((part) => formatResumeDate(part, language)).join(' – '),
    detail: [...between.filter((part) => !isResumeDatePart(part)), ...parts.slice(last + 1)].join(' · '),
  };
}

/** Any body shape with sections of fact-typed lines (the shared ResumeBody or the API client copy). */
export interface ResumeLinesLike {
  sections: ReadonlyArray<{ factType: string; lines: ReadonlyArray<{ factId: string; text: string }> }>;
}

/** The contact full name (first part of the first contact line), else the fallback. */
export function resumeDisplayName(body: ResumeLinesLike, fallback: string, edits: Record<string, string> = {}): string {
  for (const section of body.sections) {
    if (section.factType !== 'contact') continue;
    for (const line of section.lines) {
      const name = (edits[line.factId] ?? line.text).split(' · ')[0]?.trim();
      if (name) return name;
    }
  }
  return fallback;
}

/** Contact details without the name that already heads the page. */
export function resumeContactLine(text: string, name: string): string {
  const parts = text.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (parts[0] && parts[0] === name.trim()) parts.shift();
  return parts.join(' · ');
}
