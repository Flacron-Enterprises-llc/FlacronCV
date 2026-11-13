import {
  AddCVSectionPayload,
  CertificationItem,
  CustomItem,
  CV,
  CVSection,
  CVSectionItem,
  UpdateCVPayload,
  UpdateCVSectionPayload,
} from '../types/cv.types';
import { CVSectionType } from '../types/enums';
import { t } from '../i18n';

/**
 * Pure helpers for the CV editor (title, sections, item payloads). Limits are
 * the V1 API DTO limits (CreateCvDto / UpdateCvDto / AddSectionDto /
 * is-loose-section-items). Wording is the website's `cv_builder` English copy.
 */

/** CreateCvDto / UpdateCvDto `title` MaxLength. */
export const CV_TITLE_MAX = 200;
/** AddSectionDto / UpdateSectionDto `title` MaxLength. */
export const SECTION_TITLE_MAX = 200;
/** is-loose-section-items: string arrays (highlights, technologies) hold at most 50 strings. */
export const ITEM_ARRAY_MAX = 50;
/** AddSectionDto / UpdateSectionDto `order` is an int in [0, 1000]. */
export const SECTION_ORDER_MAX = 1000;

/** English copy (tests). The validators return the current language (cvEditor.validation.*). */
export const CV_TITLE_REQUIRED = 'Please enter a title for your CV.';
export const CV_TITLE_TOO_LONG = `Title must be ${CV_TITLE_MAX} characters or fewer.`;
export const SECTION_TITLE_REQUIRED = 'Please enter a section title.';
export const SECTION_TITLE_TOO_LONG = `Section title must be ${SECTION_TITLE_MAX} characters or fewer.`;

/** Quick-fill names offered under the free-text title field (saved as CV data). */
export const CV_TITLE_SUGGESTIONS = [
  'My Professional CV',
  'Software Engineer CV',
  'Product Manager CV',
  'Marketing CV',
  'Designer CV',
] as const;

export type TitleCheck = { ok: true; title: string } | { ok: false; error: string };

/**
 * Web create requires a non-blank title; the API ignores a blank title on
 * update (`if (data.title)`), so a rename must be non-blank too.
 */
export function validateCvTitle(raw: string | null | undefined): TitleCheck {
  const title = (raw ?? '').trim();
  if (!title) return { ok: false, error: t('cvEditor.validation.titleRequired') };
  if (title.length > CV_TITLE_MAX) {
    return { ok: false, error: t('cvEditor.validation.titleTooLong', { max: CV_TITLE_MAX }) };
  }
  return { ok: true, title };
}

/** AddSectionDto requires a non-blank title (`Matches(/\S/)`). */
export function validateSectionTitle(raw: string | null | undefined): TitleCheck {
  const title = (raw ?? '').trim();
  if (!title) return { ok: false, error: t('cvEditor.validation.sectionTitleRequired') };
  if (title.length > SECTION_TITLE_MAX) {
    return { ok: false, error: t('cvEditor.validation.sectionTitleTooLong', { max: SECTION_TITLE_MAX }) };
  }
  return { ok: true, title };
}

/** Section types that have their own wizard step (one form per type). */
export const STANDARD_SECTION_TYPES: readonly CVSectionType[] = [
  CVSectionType.EXPERIENCE,
  CVSectionType.EDUCATION,
  CVSectionType.SKILLS,
  CVSectionType.PROJECTS,
  CVSectionType.CERTIFICATIONS,
  CVSectionType.LANGUAGES,
  CVSectionType.REFERENCES,
];

export function isStandardSectionType(type: string): boolean {
  return (STANDARD_SECTION_TYPES as readonly string[]).includes(type);
}

/**
 * Type labels in the current language. They are also the default title of a
 * new section, like the web AddSectionButton (translated cv_builder.experience
 * …). A title already saved on a CV is data and is never translated.
 */
const TYPE_LABEL_KEYS: Record<string, string> = {
  [CVSectionType.EXPERIENCE]: 'cvEditor.sectionTypes.experience',
  [CVSectionType.EDUCATION]: 'cvEditor.sectionTypes.education',
  [CVSectionType.SKILLS]: 'cvEditor.sectionTypes.skills',
  [CVSectionType.PROJECTS]: 'cvEditor.sectionTypes.projects',
  [CVSectionType.CERTIFICATIONS]: 'cvEditor.sectionTypes.certifications',
  [CVSectionType.LANGUAGES]: 'cvEditor.sectionTypes.languages',
  [CVSectionType.REFERENCES]: 'cvEditor.sectionTypes.references',
  [CVSectionType.AWARDS]: 'cvEditor.sectionTypes.awards',
  [CVSectionType.PUBLICATIONS]: 'cvEditor.sectionTypes.publications',
  [CVSectionType.VOLUNTEER]: 'cvEditor.sectionTypes.volunteer',
  [CVSectionType.CUSTOM]: 'cvEditor.sectionTypes.custom',
};

export function sectionTypeLabel(type: string): string {
  const key = TYPE_LABEL_KEYS[type];
  return key ? t(key) : t('cvEditor.sectionTypes.fallback');
}

/** Web AddSectionButton list, same order. `label` is read in the current language. */
export const ADDABLE_SECTION_TYPES: readonly { readonly type: CVSectionType; readonly label: string }[] = [
  CVSectionType.EXPERIENCE,
  CVSectionType.EDUCATION,
  CVSectionType.SKILLS,
  CVSectionType.PROJECTS,
  CVSectionType.CERTIFICATIONS,
  CVSectionType.LANGUAGES,
  CVSectionType.REFERENCES,
  CVSectionType.CUSTOM,
].map((type) => ({
  type,
  get label() {
    return sectionTypeLabel(type);
  },
}));

/** Sections of one type, in display order (the sections array order). */
export function sectionsOfType(sections: CVSection[], type: CVSectionType): CVSection[] {
  return sections.filter((s) => s.type === type);
}

/** Custom, awards, publications, volunteer — edited in the Custom Sections step. */
export function nonStandardSections(sections: CVSection[]): CVSection[] {
  return sections.filter((s) => !isStandardSectionType(s.type));
}

/**
 * Move `id` by `delta` places. Returns the new id order, or null when the move
 * is not possible (unknown id, already first/last). Same result as web
 * `arrayMove` for a one-step drag.
 */
export function moveSectionId(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  if (from === -1) return null;
  const to = from + delta;
  if (to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Order value for a section appended at the end, clamped to the DTO range. */
export function appendOrder(sections: CVSection[]): number {
  return Math.min(sections.length, SECTION_ORDER_MAX);
}

export function buildNewSection(
  id: string,
  type: CVSectionType,
  title: string,
  order: number,
  nowIso: string,
): CVSection {
  return {
    id,
    type,
    title,
    isVisible: true,
    order: Math.max(0, Math.min(order, SECTION_ORDER_MAX)),
    items: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** One highlight per line; blank lines dropped; capped at the API's 50 strings. */
export function parseHighlights(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, ITEM_ARRAY_MAX);
}

export function formatHighlights(highlights: string[] | null | undefined): string {
  return (highlights ?? []).filter((h) => typeof h === 'string' && h.trim()).join('\n');
}

/** Optional text field: '' stays '' so a cleared value overwrites the stored one. */
function opt(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export interface CertificationForm {
  name: string;
  issuer: string;
  date: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

/** Keeps unknown keys (order, …); a blank expiry is stored as null like web createDefaultItem. */
export function buildCertificationItem(
  id: string,
  existing: Partial<CertificationItem> | null,
  form: CertificationForm,
): CertificationItem {
  const expiry = opt(form.expiryDate);
  return {
    ...(existing ?? {}),
    id,
    name: form.name.trim(),
    issuer: form.issuer.trim(),
    date: form.date.trim(),
    expiryDate: expiry || null,
    credentialId: opt(form.credentialId),
    url: opt(form.url),
  };
}

export interface CustomItemForm {
  title: string;
  subtitle?: string;
  date?: string;
  description?: string;
}

/**
 * Web writes `title` and `name` together for custom entries and for the
 * generic (awards / publications / volunteer) editor, which only has a title
 * and a description. Subtitle/date are written for CUSTOM only.
 */
export function buildCustomItem(
  id: string,
  type: string,
  existing: Partial<CustomItem> | null,
  form: CustomItemForm,
): CustomItem {
  const title = form.title.trim();
  const base: CustomItem = {
    ...(existing ?? {}),
    id,
    title,
    name: title,
    description: opt(form.description),
  };
  if (type === CVSectionType.CUSTOM) {
    base.subtitle = opt(form.subtitle);
    base.date = opt(form.date);
  }
  return base;
}

/** Title shown for a custom/generic entry (web reads `title || name`). */
export function customItemTitle(item: CVSectionItem): string {
  const rec = item as unknown as Record<string, unknown>;
  const title = typeof rec.title === 'string' ? rec.title : '';
  const name = typeof rec.name === 'string' ? rec.name : '';
  return title || name;
}

/**
 * PUT /cvs/:id body for the editor save. Same keys as web autosave, except
 * `styling`: the content editor only owns `showPhoto` (set by photo upload /
 * remove). The API merges styling per key, so sending only that key never
 * overwrites colours/fonts/layout chosen on the design screen.
 */
export function buildCvRootUpdate(cv: CV): UpdateCVPayload {
  return {
    title: cv.title,
    personalInfo: cv.personalInfo,
    styling: { showPhoto: Boolean(cv.styling?.showPhoto) },
    sectionOrder: cv.sectionOrder,
  };
}

/** POST /cvs/:id/sections body (AddSectionDto), same fields as web. */
export function buildSectionCreate(section: CVSection): AddCVSectionPayload {
  return {
    id: section.id,
    type: section.type,
    title: section.title,
    order: section.order,
    isVisible: section.isVisible,
    items: section.items,
  };
}

/** PUT /cvs/:id/sections/:sid body (UpdateSectionDto), same fields as web. */
export function buildSectionUpdate(section: CVSection): UpdateCVSectionPayload {
  return {
    title: section.title,
    isVisible: section.isVisible,
    items: section.items,
    order: section.order,
  };
}

/**
 * Split the editor state into the three save phases the web uses:
 * POST client-only sections, PUT persisted ones, DELETE removed ones.
 */
export function planSectionSave(
  sections: CVSection[],
  persistedIds: string[],
): { create: CVSection[]; update: CVSection[]; remove: string[] } {
  return {
    create: sections.filter((s) => !persistedIds.includes(s.id)),
    update: sections.filter((s) => persistedIds.includes(s.id)),
    remove: persistedIds.filter((id) => !sections.some((s) => s.id === id)),
  };
}

/**
 * Web autosave: a PUT to a section whose Firestore doc is missing fails with
 * 404 or 500; re-POST the same client id instead of wedging the save.
 */
export function shouldRecreateSection(status: number | undefined): boolean {
  return status === 404 || status === 500;
}
