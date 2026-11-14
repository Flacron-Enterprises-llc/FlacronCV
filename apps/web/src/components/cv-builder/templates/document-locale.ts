/**
 * The language a CV *document* is written in — which is not the language of the
 * interface it is being edited in.
 *
 * Someone browsing FlacronCV in Arabic may well be writing an English CV for an
 * English-speaking employer (and the reverse). The templates used to take both
 * their direction and their built-in headings ("Profile", "Present", month
 * names…) from the UI locale, so that English CV came out mirrored, with Arabic
 * headings sitting above English content. Everything a template prints that the
 * user did not type is resolved here, against the document's language.
 *
 * Why a label table instead of next-intl: the client only has the messages of
 * the UI locale loaded, and the document language is, by definition, allowed to
 * differ from it. The handful of words a CV prints on its own are kept here for
 * all six languages so the preview, the PDF and the DOCX always agree. The
 * values match the long-standing `cv_builder.template_*` / `ph_present`
 * translations.
 *
 * Pure module (no React) so the DOCX builder can use it too.
 */
import type { CV, CVSection } from '@flacroncv/shared-types';

export const CV_DOC_LANGS = ['en', 'fr', 'de', 'es', 'ar', 'ur'] as const;
export type CVDocLang = (typeof CV_DOC_LANGS)[number];
export type CVDocDir = 'ltr' | 'rtl';

const RTL_LANGS = new Set<CVDocLang>(['ar', 'ur']);

export interface CVDocLabels {
  professionalSummary: string;
  profile: string;
  contact: string;
  aboutMe: string;
  summary: string;
  present: string;
  technologies: string;
  credentialId: string;
  /** Prefix for a certification's expiry date, e.g. "Expires Mar 2027". */
  expires: string;
  gpa: string;
}

const LABELS: Record<CVDocLang, CVDocLabels> = {
  en: {
    professionalSummary: 'Professional Summary', profile: 'Profile', contact: 'Contact',
    aboutMe: 'About Me', summary: 'Summary', present: 'Present',
    technologies: 'Technologies', credentialId: 'Credential ID', expires: 'Expires', gpa: 'GPA',
  },
  fr: {
    professionalSummary: 'Résumé Professionnel', profile: 'Profil', contact: 'Contact',
    aboutMe: 'À Propos', summary: 'Résumé', present: 'Présent',
    technologies: 'Technologies', credentialId: 'ID de certification', expires: 'Expire', gpa: 'Moyenne',
  },
  de: {
    professionalSummary: 'Professionelle Zusammenfassung', profile: 'Profil', contact: 'Kontakt',
    aboutMe: 'Über Mich', summary: 'Zusammenfassung', present: 'Heute',
    technologies: 'Technologien', credentialId: 'Zertifikats-ID', expires: 'Gültig bis', gpa: 'Notendurchschnitt',
  },
  es: {
    professionalSummary: 'Resumen Profesional', profile: 'Perfil', contact: 'Contacto',
    aboutMe: 'Sobre Mí', summary: 'Resumen', present: 'Actualidad',
    technologies: 'Tecnologías', credentialId: 'ID de la credencial', expires: 'Caduca', gpa: 'Nota media',
  },
  ar: {
    professionalSummary: 'الملخص المهني', profile: 'الملف الشخصي', contact: 'التواصل',
    aboutMe: 'نبذة عني', summary: 'الملخص', present: 'حتى الآن',
    technologies: 'التقنيات', credentialId: 'معرّف الشهادة', expires: 'تنتهي في', gpa: 'المعدل',
  },
  ur: {
    professionalSummary: 'پیشہ ورانہ خلاصہ', profile: 'پروفائل', contact: 'رابطہ',
    aboutMe: 'میرے بارے میں', summary: 'خلاصہ', present: 'تاحال',
    technologies: 'ٹیکنالوجیز', credentialId: 'سرٹیفکیٹ آئی ڈی', expires: 'میعاد ختم', gpa: 'جی پی اے',
  },
};

export function isCVDocLang(value: unknown): value is CVDocLang {
  return typeof value === 'string' && (CV_DOC_LANGS as readonly string[]).includes(value);
}

/** Labels for a document language; unknown values fall back to English. */
export function cvDocLabels(lang: string | undefined | null): CVDocLabels {
  return LABELS[isCVDocLang(lang) ? lang : 'en'];
}

export function cvDocDir(lang: string | undefined | null): CVDocDir {
  return isCVDocLang(lang) && RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
}

// ─── Language detection ──────────────────────────────────────────────────────

// Arabic script blocks (Arabic, Supplement, Presentation Forms A/B).
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
// Latin letters incl. the accented range used by fr/de/es.
const LATIN = /[A-Za-zÀ-ɏ]/g;
// Letters Urdu uses and Arabic does not (ٹ ڈ ڑ ں ے ھ ہ ک گ).
const URDU_ONLY = /[ٹڈڑںےھہکگ]/;

/** Below this many letters there is too little text to judge; follow the UI. */
const MIN_LETTERS = 12;

function headerText(cv: Pick<CV, 'personalInfo'>): string {
  const p = cv.personalInfo ?? ({} as CV['personalInfo']);
  return [p.firstName, p.lastName, p.headline, p.summary].filter((s): s is string => typeof s === 'string').join(' ');
}

function itemsText(sections: Pick<CVSection, 'items'>[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    for (const item of (s.items ?? []) as unknown as Record<string, unknown>[]) {
      for (const v of Object.values(item)) if (typeof v === 'string') parts.push(v);
    }
  }
  return parts.join(' ');
}

function scriptCounts(text: string): { arabic: number; latin: number } {
  return { arabic: text.match(ARABIC_SCRIPT)?.length ?? 0, latin: text.match(LATIN)?.length ?? 0 };
}

/**
 * Resolve the document's language and direction.
 *
 * 1. An explicit `styling.documentLanguage` (set in the Design panel) wins.
 * 2. Otherwise the dominant script of the header (name, headline, summary —
 *    or, if that is nearly empty, the whole content) decides the direction:
 *    Arabic-script content is RTL, Latin content LTR. The language within a
 *    script follows the UI when the UI uses that script (a French UI writing a
 *    Latin CV ⇒ French headings), else the script's default (en / ar or ur).
 * 3. A near-empty CV follows the UI locale.
 */
export function resolveCVDocumentLocale(
  cv: Pick<CV, 'personalInfo' | 'styling'>,
  sections: Pick<CVSection, 'items'>[],
  uiLocale: string,
): { lang: CVDocLang; dir: CVDocDir } {
  const explicit = (cv.styling as { documentLanguage?: unknown } | undefined)?.documentLanguage;
  if (isCVDocLang(explicit)) return { lang: explicit, dir: cvDocDir(explicit) };

  const ui: CVDocLang = isCVDocLang(uiLocale) ? uiLocale : 'en';
  // The person's own name, headline and summary decide first: they are what
  // the user wrote themselves, whereas section items may still be the English
  // example content a template CV starts with. Items only decide when the
  // header is (nearly) empty.
  let text = headerText(cv);
  let { arabic, latin } = scriptCounts(text);
  if (arabic + latin < MIN_LETTERS) {
    text = `${text} ${itemsText(sections)}`;
    ({ arabic, latin } = scriptCounts(text));
  }

  if (arabic + latin < MIN_LETTERS) return { lang: ui, dir: cvDocDir(ui) };

  if (arabic > latin) {
    const lang: CVDocLang = RTL_LANGS.has(ui) ? ui : URDU_ONLY.test(text) ? 'ur' : 'ar';
    return { lang, dir: 'rtl' };
  }
  const lang: CVDocLang = RTL_LANGS.has(ui) ? 'en' : ui;
  return { lang, dir: 'ltr' };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

// English stays a fixed table: it is byte-identical to what every existing CV
// has always printed (Intl's "Sep" vs "Sept" differs between ICU versions).
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthFormatters = new Map<string, Intl.DateTimeFormat>();
function monthFormatter(lang: CVDocLang): Intl.DateTimeFormat {
  let f = monthFormatters.get(lang);
  if (!f) {
    // Latin digits for Arabic/Urdu: the years a user types are Latin digits,
    // and a CV mixing ٢٠٢١ in dates with 2021 in text reads as a mistake.
    const tag = RTL_LANGS.has(lang) ? `${lang}-u-nu-latn` : lang;
    f = new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    monthFormatters.set(lang, f);
  }
  return f;
}

/**
 * Format a stored CV date for display in the document's language.
 *   "2021-01" → "Jan 2021" (en) / "janv. 2021" (fr) / "يناير 2021" (ar)
 *   "2024"    → "2024"; "Present" → the language's word for it
 *   anything else (free text) is passed through untouched.
 */
export function formatDocDate(dateStr: string | null | undefined, lang: string = 'en'): string {
  if (!dateStr) return '';
  const s = dateStr.trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present') return cvDocLabels(lang).present;
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const m = parseInt(ym[2], 10);
    if (m >= 1 && m <= 12) {
      if (!isCVDocLang(lang) || lang === 'en') return `${EN_MONTHS[m - 1]} ${ym[1]}`;
      try {
        return monthFormatter(lang).format(new Date(Date.UTC(parseInt(ym[1], 10), m - 1, 1)));
      } catch {
        return `${EN_MONTHS[m - 1]} ${ym[1]}`;
      }
    }
  }
  return s;
}

/** "start – end" with the end defaulting to "Present" for a current role. */
export function formatDocDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  lang: string,
  opts: { current?: boolean; openEndedIsPresent?: boolean } = {},
): string {
  const s = formatDocDate(start, lang);
  const present = cvDocLabels(lang).present;
  const e = opts.current ? present : formatDocDate(end, lang) || (opts.openEndedIsPresent ? present : '');
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

/**
 * "2019 - 2023" / "2019–2023" typed into the old single "Years" field, split
 * into its two halves. Anything else (a real start date) returns null.
 */
export function splitLegacyRange(value: unknown): { start: string; end: string } | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4}(?:-\d{2})?)\s*(?:[-–—]|to)\s*(\d{4}(?:-\d{2})?|present)$/i);
  return m ? { start: m[1], end: m[2] } : null;
}
