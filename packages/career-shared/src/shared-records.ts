/**
 * Shared customer records between V1 (Firestore web app) and V2.
 *
 * V2's Postgres is the one authoritative store for the records both sites
 * show: CVs, cover letters, job applications, profile basics and
 * preferences. V1 reads and writes them through V2's `/shared/v1` API in
 * V1's own document shapes. This file is the pure conversion between the
 * two shapes, so the API, the migration and the reverse export use one
 * rule.
 *
 * A CV that V1 has written is stored as a `SharedCvDocument` on the
 * resume version (`body.document`). V2 shows it through the usual
 * fact-typed lines, projected from the document. Projected lines are not
 * edited as text: a text line cannot be split back into V1's fields
 * without guessing. Both sites edit the document's fields instead.
 */

import { factLineText, isResumeTemplateId } from './resume';
import type { ResumeBody, ResumeSection, ResumeTemplateId } from './resume';
import type { FactType } from './facts';

export const SHARED_CV_SECTION_TYPES = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'references',
  'awards',
  'publications',
  'volunteer',
  'custom',
] as const;
export type SharedCvSectionType = (typeof SHARED_CV_SECTION_TYPES)[number];

export const SHARED_PERSONAL_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'country',
  'postalCode',
  'website',
  'linkedin',
  'github',
  'photoURL',
  'headline',
  'summary',
] as const;

export type SharedItemValue = string | number | boolean | null | string[];
export type SharedCvItem = Record<string, SharedItemValue>;

export interface SharedCvSection {
  id: string;
  type: SharedCvSectionType;
  title: string;
  isVisible: boolean;
  order: number;
  items: SharedCvItem[];
}

/** V1's CV document without its counters (views, downloads) and timestamps. */
export interface SharedCvDocument {
  title: string;
  /** The V1 template id, verbatim, so V1 renders what it rendered before. */
  templateId: string;
  status: 'draft' | 'published';
  isPublic: boolean;
  publicSlug: string | null;
  personalInfo: Record<string, string | null>;
  sectionOrder: string[];
  styling: Record<string, SharedItemValue>;
  aiGenerated: boolean;
  aiProvider: string | null;
  sections: SharedCvSection[];
}

/** V1 CV layouts (`styling.layout`) and the V2 template that draws the same family. */
const LAYOUT_TEMPLATE: Record<string, ResumeTemplateId> = {
  classic: 'classic',
  sidebar: 'sidebar',
  'top-bar': 'topbar',
  compact: 'compact',
  'slate-gold': 'slate-gold',
};

/** V2 templates V1 can also draw. Choosing any other one in V2 leaves V1 on its last template. */
export const V1_CV_TEMPLATE_IDS = ['modern', 'classic', 'minimal', 'professional', 'creative', 'executive', 'compact', 'two-column', 'academic', 'bold'] as const;

/** The V2 template for a V1 CV: the same id when V2 has it, else the V1 layout's family, else classic. */
export function v2ResumeTemplateFor(document: Pick<SharedCvDocument, 'templateId' | 'styling'>): ResumeTemplateId {
  if (isResumeTemplateId(document.templateId)) return document.templateId;
  const layout = typeof document.styling.layout === 'string' ? document.styling.layout : '';
  return LAYOUT_TEMPLATE[layout] ?? 'classic';
}

/** The V1 template after V2 picks `v2TemplateId`: that id when V1 has it, otherwise V1's current one. */
export function v1TemplateAfter(currentV1TemplateId: string, v2TemplateId: string): string {
  return (V1_CV_TEMPLATE_IDS as readonly string[]).includes(v2TemplateId) ? v2TemplateId : currentV1TemplateId;
}

/** V1 cover-letter ids are V2 ids, except the legacy alias `standard`. */
export function v2LetterTemplateFor(v1TemplateId: string | null | undefined): string {
  if (!v1TemplateId || v1TemplateId === 'standard') return v1TemplateId === 'standard' ? 'modern' : 'classic';
  return v1TemplateId;
}

const SECTION_FACT: Record<SharedCvSectionType, FactType> = {
  experience: 'experience',
  education: 'education',
  skills: 'skill',
  projects: 'project',
  certifications: 'certification',
  languages: 'language',
  references: 'reference',
  awards: 'achievement',
  publications: 'achievement',
  volunteer: 'experience',
  custom: 'achievement',
};

const FACT_SECTION: Record<FactType, SharedCvSectionType | null> = {
  contact: null,
  summary: null,
  experience: 'experience',
  education: 'education',
  skill: 'skills',
  project: 'projects',
  achievement: 'custom',
  certification: 'certifications',
  language: 'languages',
  reference: 'references',
};

function str(value: SharedItemValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function list(value: SharedItemValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function joinText(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter((part) => part.length > 0).join('\n');
}

/** A V1 section item as V2 fact fields, for display lines and V2 features that read facts. */
export function itemFactValue(type: SharedCvSectionType, item: SharedCvItem): Record<string, string | boolean | string[]> {
  switch (SECTION_FACT[type]) {
    case 'experience':
      return {
        position: str(item.position) || str(item.role),
        company: str(item.company) || str(item.organization),
        location: str(item.location),
        startDate: str(item.startDate),
        endDate: str(item.endDate),
        current: item.isCurrent === true,
        responsibilities: joinText(str(item.description), list(item.highlights).join('\n')),
      };
    case 'education':
      return {
        institution: str(item.institution),
        degree: str(item.degree),
        field: str(item.field),
        location: str(item.location),
        startDate: str(item.startDate),
        endDate: str(item.endDate),
        details: joinText(str(item.gpa) ? `GPA ${str(item.gpa)}` : '', str(item.description)),
      };
    case 'skill':
      return { name: str(item.name), category: str(item.category) };
    case 'project':
      return {
        name: str(item.name),
        description: str(item.description),
        url: str(item.url),
        technologies: list(item.technologies),
        startDate: str(item.startDate),
        endDate: str(item.endDate),
      };
    case 'certification':
      return {
        name: str(item.name),
        issuer: str(item.issuer),
        issueDate: str(item.date),
        expiryDate: str(item.expiryDate),
        credentialId: str(item.credentialId),
        url: str(item.url),
      };
    case 'language':
      return { name: str(item.name), proficiency: str(item.proficiency) };
    case 'reference':
      return {
        name: str(item.name),
        title: str(item.title),
        company: str(item.company),
        email: str(item.email),
        phone: str(item.phone),
        relationship: str(item.relationship),
      };
    case 'achievement':
    default:
      return { statement: joinText([str(item.title), str(item.subtitle)].filter(Boolean).join(' — '), str(item.description)), date: str(item.date) };
  }
}

/** A V2 fact value as a V1 section item (for a V2-made version that V1 opens). */
export function factItem(factType: FactType, value: Record<string, unknown>, id: string, order: number): SharedCvItem {
  const s = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '');
  switch (factType) {
    case 'experience':
      return { id, company: s('company'), position: s('position'), location: s('location'), startDate: s('startDate'), endDate: s('endDate') || null, isCurrent: value.current === true, description: s('responsibilities'), highlights: [], order };
    case 'education':
      return { id, institution: s('institution'), degree: s('degree'), field: s('field'), location: s('location'), startDate: s('startDate'), endDate: s('endDate') || null, gpa: '', description: s('details'), order };
    case 'skill':
      return { id, name: s('name'), level: 'intermediate', category: s('category'), order };
    case 'project':
      return { id, name: s('name'), description: s('description'), url: s('url'), technologies: Array.isArray(value.technologies) ? value.technologies.filter((t): t is string => typeof t === 'string') : [], startDate: s('startDate'), endDate: s('endDate') || null, order };
    case 'certification':
      return { id, name: s('name'), issuer: s('issuer'), date: s('issueDate'), expiryDate: s('expiryDate') || null, credentialId: s('credentialId'), url: s('url'), order };
    case 'language':
      return { id, name: s('name'), proficiency: s('proficiency'), order };
    case 'reference':
      return { id, name: s('name'), title: s('title'), company: s('company'), email: s('email'), phone: s('phone'), relationship: s('relationship'), order };
    default:
      return { id, title: '', subtitle: '', date: s('date'), description: s('statement') || s('text'), order };
  }
}

/** Line ids for projected document lines. Never a career-fact uuid, so they are not stored in `fact_ids`. */
export function documentLineId(sectionId: string, itemId: string): string {
  return `doc:${sectionId}:${itemId}`;
}

export function isDocumentLineId(id: string): boolean {
  return id.startsWith('doc:');
}

/** Sections in the document's own order: `sectionOrder` first, then by `order`. */
export function orderedSections(document: SharedCvDocument): SharedCvSection[] {
  const rank = new Map(document.sectionOrder.map((id, index) => [id, index]));
  return [...document.sections].sort((a, b) => (rank.get(a.id) ?? 1e6 + a.order) - (rank.get(b.id) ?? 1e6 + b.order));
}

/** V2's line view of a V1-shaped document. Hidden sections and empty items are left out, as V1 leaves them out. */
export function projectDocument(document: SharedCvDocument, templateId: ResumeTemplateId, confirmation: 'draft' | 'confirmed' = 'draft'): ResumeBody {
  const info = document.personalInfo;
  const p = (key: string) => (typeof info[key] === 'string' ? (info[key] as string) : '');
  const sections: ResumeSection[] = [];
  const contact = factLineText('contact', {
    fullName: [p('firstName'), p('lastName')].filter(Boolean).join(' '),
    headline: p('headline'),
    email: p('email'),
    phone: p('phone'),
    city: p('city'),
    country: p('country'),
    website: p('website'),
    linkedin: p('linkedin'),
    github: p('github'),
  });
  if (contact) sections.push({ factType: 'contact', lines: [{ factId: 'doc:personal', factType: 'contact', text: contact, uncertain: false }] });
  if (p('summary').trim()) sections.push({ factType: 'summary', lines: [{ factId: 'doc:summary', factType: 'summary', text: p('summary').trim(), uncertain: false }] });
  for (const section of orderedSections(document)) {
    if (!section.isVisible) continue;
    const factType = SECTION_FACT[section.type];
    const lines = [...section.items]
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((item) => ({
        factId: documentLineId(section.id, str(item.id)),
        factType,
        text: factLineText(factType, itemFactValue(section.type, item)),
        uncertain: false,
      }))
      .filter((line) => line.text.length > 0);
    if (lines.length === 0) continue;
    const existing = sections.find((candidate) => candidate.factType === factType);
    if (existing) existing.lines.push(...lines);
    else sections.push({ factType, lines });
  }
  return { templateId, confirmation, sections };
}

export interface FactForDocument {
  id: string;
  factType: FactType;
  value: Record<string, unknown>;
}

/**
 * A V1-shaped document for a version V2 composed from career facts. Each
 * line becomes an item built from its fact's fields; a line the person
 * retyped in V2 keeps their words as the item description.
 */
export function documentFromBody(body: ResumeBody, facts: FactForDocument[], meta: { title: string; v1TemplateId?: string }): SharedCvDocument {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const personalInfo: Record<string, string | null> = Object.fromEntries(SHARED_PERSONAL_FIELDS.map((key) => [key, key === 'photoURL' ? null : '']));
  const sections: SharedCvSection[] = [];
  for (const section of body.sections) {
    for (const line of section.lines) {
      const fact = byId.get(line.factId);
      if (section.factType === 'contact') {
        const value = fact?.value ?? {};
        const name = typeof value.fullName === 'string' ? value.fullName.trim() : '';
        const [first, ...rest] = name.split(/\s+/);
        Object.assign(personalInfo, {
          firstName: first ?? '',
          lastName: rest.join(' '),
          headline: typeof value.headline === 'string' ? value.headline : '',
          email: typeof value.email === 'string' ? value.email : '',
          phone: typeof value.phone === 'string' ? value.phone : '',
          city: typeof value.city === 'string' ? value.city : '',
          country: typeof value.country === 'string' ? value.country : '',
          website: typeof value.website === 'string' ? value.website : '',
          linkedin: typeof value.linkedin === 'string' ? value.linkedin : '',
          github: typeof value.github === 'string' ? value.github : '',
        });
        continue;
      }
      if (section.factType === 'summary') {
        personalInfo.summary = line.text;
        continue;
      }
      const type = FACT_SECTION[section.factType];
      if (!type) continue;
      let target = sections.find((candidate) => candidate.type === type);
      if (!target) {
        target = { id: `v2-${type}`, type, title: type, isVisible: true, order: sections.length, items: [] };
        sections.push(target);
      }
      const item = factItem(section.factType, fact?.value ?? { statement: line.text }, line.factId, target.items.length);
      if (fact && line.text !== factLineText(section.factType, fact.value as Record<string, string>)) item.description = line.text;
      target.items.push(item);
    }
  }
  const templateId = meta.v1TemplateId ?? ((V1_CV_TEMPLATE_IDS as readonly string[]).includes(body.templateId) ? body.templateId : 'classic');
  return {
    title: meta.title,
    templateId,
    status: 'draft',
    isPublic: false,
    publicSlug: null,
    personalInfo,
    sectionOrder: sections.map((section) => section.id),
    styling: {},
    aiGenerated: false,
    aiProvider: null,
    sections,
  };
}

export type SharedDocumentResult = { ok: true; document: SharedCvDocument } | { ok: false; field: string; reason: string };

const TITLE_MAX = 200;
const FIELD_MAX = 5000;
const MAX_SECTIONS = 30;
const MAX_ITEMS = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function itemValue(value: unknown): SharedItemValue | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= FIELD_MAX ? value : undefined;
  if (Array.isArray(value) && value.length <= 50 && value.every((entry) => typeof entry === 'string' && entry.length <= 500)) return value as string[];
  return undefined;
}

/**
 * Checks a document from either site before it is stored. Unknown item
 * fields are kept (V1 may add one), but every value must be a plain
 * scalar or a list of strings within the limits.
 */
export function parseSharedCvDocument(input: unknown): SharedDocumentResult {
  if (!isRecord(input)) return { ok: false, field: 'document', reason: 'invalid' };
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 1 || title.length > TITLE_MAX) return { ok: false, field: 'title', reason: 'invalid' };
  if (typeof input.templateId !== 'string' || !ID_PATTERN.test(input.templateId)) return { ok: false, field: 'templateId', reason: 'invalid' };
  const personalInfo: Record<string, string | null> = {};
  if (input.personalInfo !== undefined && !isRecord(input.personalInfo)) return { ok: false, field: 'personalInfo', reason: 'invalid' };
  for (const key of SHARED_PERSONAL_FIELDS) {
    const raw = isRecord(input.personalInfo) ? input.personalInfo[key] : undefined;
    if (raw === undefined || raw === null) personalInfo[key] = key === 'photoURL' ? null : '';
    else if (typeof raw === 'string' && raw.length <= FIELD_MAX) personalInfo[key] = raw;
    else return { ok: false, field: `personalInfo.${key}`, reason: 'invalid' };
  }
  const styling: Record<string, SharedItemValue> = {};
  if (input.styling !== undefined) {
    if (!isRecord(input.styling) || Object.keys(input.styling).length > 30) return { ok: false, field: 'styling', reason: 'invalid' };
    for (const [key, raw] of Object.entries(input.styling)) {
      const value = itemValue(raw);
      if (value === undefined || key.length > 64) return { ok: false, field: `styling.${key}`, reason: 'invalid' };
      styling[key] = value;
    }
  }
  const rawSections = input.sections ?? [];
  if (!Array.isArray(rawSections) || rawSections.length > MAX_SECTIONS) return { ok: false, field: 'sections', reason: 'invalid' };
  const sections: SharedCvSection[] = [];
  const sectionIds = new Set<string>();
  for (const [index, raw] of rawSections.entries()) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || sectionIds.has(raw.id)) return { ok: false, field: `sections.${index}.id`, reason: 'invalid' };
    if (!(SHARED_CV_SECTION_TYPES as readonly unknown[]).includes(raw.type)) return { ok: false, field: `sections.${index}.type`, reason: 'invalid' };
    if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return { ok: false, field: `sections.${index}.items`, reason: 'invalid' };
    sectionIds.add(raw.id);
    const items: SharedCvItem[] = [];
    const itemIds = new Set<string>();
    for (const [itemIndex, rawItem] of raw.items.entries()) {
      if (!isRecord(rawItem) || typeof rawItem.id !== 'string' || !ID_PATTERN.test(rawItem.id) || itemIds.has(rawItem.id) || Object.keys(rawItem).length > 40) {
        return { ok: false, field: `sections.${index}.items.${itemIndex}`, reason: 'invalid' };
      }
      itemIds.add(rawItem.id);
      const item: SharedCvItem = {};
      for (const [key, value] of Object.entries(rawItem)) {
        const checked = itemValue(value);
        if (checked === undefined || key.length > 64) return { ok: false, field: `sections.${index}.items.${itemIndex}.${key}`, reason: 'invalid' };
        item[key] = checked;
      }
      items.push(item);
    }
    sections.push({
      id: raw.id,
      type: raw.type as SharedCvSectionType,
      title: typeof raw.title === 'string' ? raw.title.slice(0, TITLE_MAX) : '',
      isVisible: raw.isVisible !== false,
      order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
      items,
    });
  }
  const sectionOrder = Array.isArray(input.sectionOrder)
    ? input.sectionOrder.filter((id): id is string => typeof id === 'string' && sectionIds.has(id))
    : sections.map((section) => section.id);
  return {
    ok: true,
    document: {
      title,
      templateId: input.templateId,
      status: input.status === 'published' ? 'published' : 'draft',
      isPublic: input.isPublic === true,
      publicSlug: typeof input.publicSlug === 'string' && ID_PATTERN.test(input.publicSlug) ? input.publicSlug : null,
      personalInfo,
      sectionOrder: [...new Set(sectionOrder)],
      styling,
      aiGenerated: input.aiGenerated === true,
      aiProvider: typeof input.aiProvider === 'string' ? input.aiProvider.slice(0, 64) : null,
      sections,
    },
  };
}

/** Plain text of V1's letter HTML (Tiptap paragraphs, breaks and lists), for V2's text body. */
export function letterHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** V1's own rule (`toLetterHtml`): blank-line paragraphs, single newlines as breaks. */
export function letterTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

