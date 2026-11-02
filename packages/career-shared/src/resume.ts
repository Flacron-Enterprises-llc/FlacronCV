/**
 * Resume documents (CV02). The body is assembled from career facts.
 * A model may choose which facts appear and in what order. It does not
 * supply sentences: the line text is the fact's own fields, or a later
 * edit the person typed.
 *
 * Ids keep the original five V2 layouts and add the distinct V1 catalog
 * presets. `layout` is the shared page family used by preview and export.
 */

import { FACT_FIELDS, FACT_TYPES } from './facts';
import type { FactConfirmation, FactType, UncertainFields } from './facts';

export const RESUME_LAYOUTS = ['classic', 'sidebar', 'topbar', 'compact', 'slate-gold', 'editorial', 'structured'] as const;
export type ResumeLayoutFamily = (typeof RESUME_LAYOUTS)[number];

export const RESUME_TEMPLATES = [
  { id: 'classic', layout: 'classic', columns: 1, header: 'centered', accent: '#1e3a5f' },
  { id: 'modern', layout: 'sidebar', columns: 2, header: 'sidebar', accent: '#2563eb' },
  { id: 'minimal', layout: 'classic', columns: 1, header: 'centered', accent: '#374151' },
  { id: 'compact', layout: 'compact', columns: 1, header: 'inline', accent: '#1d4ed8' },
  { id: 'academic', layout: 'classic', columns: 1, header: 'centered', accent: '#6b21a8' },
  { id: 'professional', layout: 'topbar', columns: 1, header: 'band', accent: '#0f766e' },
  { id: 'creative', layout: 'topbar', columns: 1, header: 'band', accent: '#7c3aed' },
  { id: 'executive', layout: 'compact', columns: 1, header: 'inline', accent: '#0c0c0c' },
  { id: 'two-column', layout: 'sidebar', columns: 2, header: 'sidebar', accent: '#059669' },
  { id: 'bold', layout: 'topbar', columns: 1, header: 'band', accent: '#dc2626' },
  { id: 'sidebar', layout: 'sidebar', columns: 2, header: 'sidebar', accent: '#002B62' },
  { id: 'topbar', layout: 'topbar', columns: 1, header: 'band', accent: '#002B62' },
  { id: 'slate-gold', layout: 'slate-gold', columns: 1, header: 'rule', accent: '#C9A84C' },
  { id: 'editorial', layout: 'editorial', columns: 1, header: 'masthead', accent: '#002B62' },
  { id: 'structured', layout: 'structured', columns: 1, header: 'dates', accent: '#1f3b57' },
] as const;

export type ResumeTemplateId = (typeof RESUME_TEMPLATES)[number]['id'];
export type ResumeTemplate = (typeof RESUME_TEMPLATES)[number];

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = 'classic';
export const FEATURED_RESUME_TEMPLATE_IDS: ResumeTemplateId[] = [
  'professional',
  'editorial',
  'structured',
  'classic',
  'modern',
  'compact',
  'slate-gold',
  'creative',
];

export function isResumeTemplateId(value: string): value is ResumeTemplateId {
  return RESUME_TEMPLATES.some((template) => template.id === value);
}

export function resumeTemplateOf(id: string): ResumeTemplate {
  return RESUME_TEMPLATES.find((template) => template.id === id) ?? RESUME_TEMPLATES[0];
}

export function resumeLayoutOf(id: string): ResumeLayoutFamily {
  return resumeTemplateOf(id).layout;
}

export interface ResumeFactInput {
  id: string;
  factType: FactType;
  value: Record<string, unknown>;
  confirmation: FactConfirmation;
  uncertain: UncertainFields;
}

export interface ResumeLine {
  factId: string;
  factType: FactType;
  text: string;
  uncertain: boolean;
}

export interface ResumeSection {
  factType: FactType;
  lines: ResumeLine[];
}

export interface ResumeBody {
  templateId: ResumeTemplateId;
  confirmation: 'draft' | 'confirmed';
  sections: ResumeSection[];
}

export interface ResumeLineEdit {
  factId: string;
  text: string;
}

const LINE_TEXT_MAX = 5000;

/** The fact's own words, in field order. Reference ids and booleans are not sentences. */
export function factLineText(factType: FactType, value: Record<string, unknown>): string {
  // Skills and languages are listed inline with ' · ' between items, so the category or level
  // stays inside its item ("SQL (Data)") instead of reading as another skill.
  const qualifier = factType === 'skill' ? 'category' : factType === 'language' ? 'proficiency' : null;
  if (qualifier) {
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const extra = typeof value[qualifier] === 'string' ? (value[qualifier] as string).trim() : '';
    return name && extra ? `${name} (${extra})` : name || extra;
  }
  const parts: string[] = [];
  for (const [key, spec] of Object.entries(FACT_FIELDS[factType])) {
    if (spec.kind === 'ref' || spec.kind === 'boolean') continue;
    const raw = value[key];
    if (typeof raw === 'string' && raw.trim().length > 0) parts.push(raw.trim());
    if (Array.isArray(raw)) {
      const items = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (items.length > 0) parts.push(items.join(', '));
    }
  }
  return parts.join(' · ');
}

function lineUncertain(fact: ResumeFactInput): boolean {
  return fact.confirmation !== 'confirmed' || Object.keys(fact.uncertain).length > 0;
}

/** One section per fact type that has text, in the profile's type order. */
export function composeResume(facts: ResumeFactInput[], templateId: ResumeTemplateId): ResumeBody {
  const sections: ResumeSection[] = [];
  for (const factType of FACT_TYPES) {
    const lines = facts
      .filter((fact) => fact.factType === factType)
      .map((fact) => ({
        factId: fact.id,
        factType,
        text: factLineText(factType, fact.value),
        uncertain: lineUncertain(fact),
      }))
      .filter((line) => line.text.length > 0);
    if (lines.length > 0) sections.push({ factType, lines });
  }
  return finish(templateId, sections);
}

/**
 * Keeps only the ids the model named, in that order. An id that is not
 * already a line is dropped. Omitting the list keeps every line.
 */
export function applyModelOrder(body: ResumeBody, factIds: readonly string[] | undefined): ResumeBody {
  if (!factIds) return body;
  const rank = new Map(factIds.map((id, index) => [id, index]));
  const sections = body.sections
    .map((section) => ({
      ...section,
      lines: section.lines
        .filter((line) => rank.has(line.factId))
        .slice()
        .sort((a, b) => (rank.get(a.factId) ?? 0) - (rank.get(b.factId) ?? 0)),
    }))
    .filter((section) => section.lines.length > 0)
    .sort((a, b) => (rank.get(a.lines[0]?.factId ?? '') ?? 0) - (rank.get(b.lines[0]?.factId ?? '') ?? 0));
  return finish(body.templateId, sections);
}

/**
 * Contact the person put on the profile, plus confirmed employers,
 * schools, and skills. A model may reorder these; it may not drop them.
 */
export const KEPT_GENERATE_FACT_TYPES = ['contact', 'experience', 'education', 'skill'] as const;

export function generateProfileReady(
  facts: ResumeFactInput[],
): { ok: true } | { ok: false; field: string; reason: string } {
  const withText = facts.filter((fact) => factLineText(fact.factType, fact.value).length > 0);
  if (withText.length === 0) return { ok: false, field: 'facts', reason: 'no_facts' };
  const hasRole = facts.some(
    (fact) =>
      fact.confirmation === 'confirmed' &&
      (fact.factType === 'experience' || fact.factType === 'education') &&
      factLineText(fact.factType, fact.value).length > 0,
  );
  if (!hasRole) return { ok: false, field: 'facts', reason: 'need_experience_or_education' };
  return { ok: true };
}

/** Ids that must survive generate even when the model returns a subset. */
export function keptGenerateFactIds(facts: ResumeFactInput[]): string[] {
  return facts
    .filter((fact) => {
      if (factLineText(fact.factType, fact.value).length === 0) return false;
      if (fact.factType === 'contact') return true;
      return (
        fact.confirmation === 'confirmed' &&
        (KEPT_GENERATE_FACT_TYPES as readonly string[]).includes(fact.factType)
      );
    })
    .map((fact) => fact.id);
}

/**
 * Applies the model's order, then puts back any required line the model
 * omitted. Unknown ids are still dropped.
 */
export function applyModelOrderKeepingRequired(
  body: ResumeBody,
  factIds: readonly string[] | undefined,
  requiredIds: readonly string[],
): ResumeBody {
  if (!factIds) return body;
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of requiredIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of factIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return applyModelOrder(body, merged);
}

export function resumeFactIds(body: ResumeBody): string[] {
  return body.sections.flatMap((section) => section.lines.map((line) => line.factId));
}

export function resumePlainLines(body: ResumeBody, watermark: boolean): string[] {
  const lines: string[] = [];
  for (const section of body.sections) {
    if (lines.length > 0) lines.push('');
    lines.push(section.factType);
    for (const line of section.lines) lines.push(line.uncertain ? `${line.text} *` : line.text);
  }
  if (watermark) {
    lines.push('');
    lines.push('Prepared with FlacronCV');
  }
  return lines;
}

export type ResumePatchResult =
  | { ok: true; body: ResumeBody }
  | { ok: false; field: string; reason: string };

/**
 * Edits the person typed. A line that is not already on the version
 * cannot be added here. Editing a line clears its uncertain flag.
 * Confirming clears every flag. Neither action is a new version.
 */
export function patchResumeBody(
  body: ResumeBody,
  patch: { templateId?: string; confirmation?: 'draft' | 'confirmed'; lines?: ResumeLineEdit[] },
): ResumePatchResult {
  let templateId = body.templateId;
  if (patch.templateId !== undefined) {
    if (!isResumeTemplateId(patch.templateId)) return { ok: false, field: 'templateId', reason: 'invalid' };
    templateId = patch.templateId;
  }
  const edits = new Map<string, string>();
  for (const line of patch.lines ?? []) {
    const text = line.text.trim();
    if (text.length === 0 || text.length > LINE_TEXT_MAX) return { ok: false, field: line.factId, reason: 'invalid' };
    edits.set(line.factId, text);
  }
  let unknown: string | null = null;
  const sections = body.sections.map((section) => ({
    ...section,
    lines: section.lines.map((line) => {
      const text = edits.get(line.factId);
      if (text === undefined) return line;
      edits.delete(line.factId);
      return { ...line, text, uncertain: false };
    }),
  }));
  if (edits.size > 0) unknown = edits.keys().next().value ?? null;
  if (unknown) return { ok: false, field: unknown, reason: 'not_on_version' };
  let confirmation = body.confirmation;
  let nextSections = sections;
  if (patch.confirmation === 'confirmed') {
    confirmation = 'confirmed';
    nextSections = sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({ ...line, uncertain: false })),
    }));
  } else if (patch.confirmation === 'draft') {
    confirmation = 'draft';
  }
  return { ok: true, body: { templateId, confirmation, sections: nextSections } };
}

function finish(templateId: ResumeTemplateId, sections: ResumeSection[]): ResumeBody {
  const uncertain = sections.some((section) => section.lines.some((line) => line.uncertain));
  return { templateId, confirmation: uncertain ? 'draft' : 'confirmed', sections };
}
