import { FACT_FIELDS, validateFactValue } from '@flacroncv/career-shared';
import type { FactConfirmation, FactFieldValue, FactType, FactValue, FieldError } from '@flacroncv/career-shared';

/** What the form holds. Empty string means the field was left blank. */
export type FactDraft = Record<string, string>;

const TITLE_FIELDS: Partial<Record<FactType, readonly string[]>> = {
  contact: ['fullName', 'headline'],
  summary: ['text'],
  experience: ['position', 'company'],
  education: ['institution', 'degree'],
  skill: ['name'],
  project: ['name'],
  achievement: ['statement'],
  certification: ['name'],
  language: ['name'],
  reference: ['name'],
};

export function toDraft(type: FactType, value: FactValue): FactDraft {
  const draft: FactDraft = {};
  for (const [field, spec] of Object.entries(FACT_FIELDS[type])) {
    const current = value[field];
    if (spec.kind === 'boolean') draft[field] = current === true ? 'true' : '';
    else if (Array.isArray(current)) draft[field] = current.join(', ');
    else if (typeof current === 'string') draft[field] = current;
    else draft[field] = '';
  }
  return draft;
}

export function fromDraft(type: FactType, draft: FactDraft): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [field, spec] of Object.entries(FACT_FIELDS[type])) {
    const text = (draft[field] ?? '').trim();
    if (spec.kind === 'boolean') raw[field] = text === 'true' ? true : null;
    else if (spec.kind === 'list') raw[field] = text.length === 0 ? [] : text.split(',').map((item) => item.trim());
    else raw[field] = text;
  }
  return raw;
}

function same(a: FactFieldValue | undefined, b: FactFieldValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The fields that differ from the stored fact, or null when nothing
 * changed. Only those are sent, so an untouched uncertain field keeps
 * its flag.
 */
export function changedPatch(
  type: FactType,
  stored: FactValue,
  draft: FactDraft,
  mode: FactConfirmation,
): { ok: true; patch: Partial<FactValue> | null } | { ok: false; errors: FieldError[] } {
  const checked = validateFactValue(type, fromDraft(type, draft), mode);
  if (!checked.ok) return checked;
  const patch: Partial<FactValue> = {};
  for (const field of Object.keys(FACT_FIELDS[type])) {
    if (!same(stored[field], checked.value[field])) patch[field] = checked.value[field];
  }
  return { ok: true, patch: Object.keys(patch).length === 0 ? null : patch };
}

export function factTitle(type: FactType, value: FactValue): string {
  const parts: string[] = [];
  for (const field of TITLE_FIELDS[type] ?? []) {
    const current = value[field];
    if (typeof current === 'string' && current.length > 0) parts.push(current);
  }
  return parts.join(' · ');
}
