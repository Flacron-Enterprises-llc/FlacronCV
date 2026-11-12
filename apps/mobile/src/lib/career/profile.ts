import {
  CORE_FACT_TYPES,
  FACT_FIELDS,
  FACT_TYPES,
  PAY_PERIODS,
  SCHEDULES,
  SENIORITIES,
  WORK_ARRANGEMENTS,
  validateFactValue,
  validatePreferences,
  type CareerPreferences,
  type FactConfirmation,
  type FactFieldValue,
  type FactType,
  type FactValue,
  type FieldError,
  type FieldSpec,
  type PayPeriod,
  type Schedule,
  type Seniority,
  type WorkArrangement,
} from '../../../../../packages/career-shared/src/facts';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { Fact, ImportAllowance } from '../../../../../packages/career-api-client/src/types';

/**
 * Pure logic for the mobile career profile (facts, import, preferences).
 * Mirrors the website's profile screen (apps/web/src/components/career/profile
 * and apps/web/src/lib/career/fact-draft.ts) so a value the phone accepts is
 * a value the website and the API accept. English copy matches the web's
 * `career.profile` strings.
 */

export { FACT_TYPES, PAY_PERIODS, SCHEDULES, SENIORITIES, WORK_ARRANGEMENTS };
export type { FactType };

/** The career API's ceiling for pasted resume text (`RESUME_TEXT_MAX`). */
export const IMPORT_TEXT_MAX = 100_000;

export const FIELD_LABEL: Record<string, string> = {
  fullName: 'Full name',
  headline: 'Headline',
  email: 'Email',
  phone: 'Phone',
  city: 'City',
  country: 'Country',
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  text: 'Text',
  position: 'Position',
  company: 'Employer',
  location: 'Location',
  startDate: 'Start',
  endDate: 'End',
  current: 'Current role',
  responsibilities: 'Responsibilities',
  institution: 'Institution',
  degree: 'Degree',
  field: 'Field',
  details: 'Details',
  name: 'Name',
  category: 'Category',
  description: 'Description',
  url: 'Link',
  technologies: 'Technologies',
  statement: 'Statement',
  metric: 'Number, if you have one',
  experienceFactId: 'Linked role',
  date: 'Date',
  issuer: 'Issuer',
  issueDate: 'Issued',
  expiryDate: 'Expires',
  credentialId: 'Credential id',
  proficiency: 'Proficiency',
  title: 'Title',
  relationship: 'Relationship',
};

export const REASON_TEXT: Record<string, string> = {
  required: 'This is needed.',
  too_long: 'This is too long.',
  invalid_date: 'Use YYYY, YYYY-MM, or YYYY-MM-DD.',
  date_order: 'The end is before the start.',
  invalid_email: 'Enter a valid email address.',
  invalid_url: 'Enter a web address.',
  invalid_type: 'This value is not usable.',
  too_many_items: 'There are too many items.',
  current_with_end_date: 'A current role has no end date.',
  unknown_field: 'This field is not part of the fact.',
};

export const UNCERTAIN_TEXT: Record<string, string> = {
  model_flagged: 'The import was unsure about this.',
  unparsed_date: 'The date could not be stored as written.',
  date_order: 'The dates were out of order, so one was left empty.',
  not_found_in_source: 'This was not found in the resume text.',
  number_not_in_source: 'A number here is not in the resume text.',
  truncated: 'This was cut to fit the field.',
  invalid_format: 'The format was not usable, so the value was left empty.',
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Typed',
  paste: 'Pasted',
  import: 'Imported',
  migrated: 'Copied from the previous account',
};

export const CHANGE_LABEL: Record<string, string> = { created: 'created', edited: 'edited', confirmed: 'confirmed' };

export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const SCHEDULE_LABEL: Record<Schedule, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
};
export const SENIORITY_LABEL: Record<Seniority, string> = { entry: 'Entry', mid: 'Mid', senior: 'Senior', lead: 'Lead', executive: 'Executive' };
export const PERIOD_LABEL: Record<PayPeriod, string> = { hour: 'Hour', month: 'Month', year: 'Year' };

export const PREFERENCE_FIELD_LABEL: Record<string, string> = {
  targetRoles: 'Target roles',
  locations: 'Locations',
  arrangements: 'Work arrangement',
  schedules: 'Schedule',
  seniority: 'Seniority',
  minimumPay: 'Minimum pay',
  learningHoursPerWeek: 'Learning hours a week',
  careerGoals: 'Career goals',
  preferences: 'preferences',
};

const TYPE_LABEL: Record<FactType, string> = {
  contact: 'Contact',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skill: 'Skill',
  project: 'Project',
  achievement: 'Achievement',
  certification: 'Certification',
  language: 'Language',
  reference: 'Reference',
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type as FactType] ?? type;
}

export function isFactType(value: unknown): value is FactType {
  return typeof value === 'string' && (FACT_TYPES as readonly string[]).includes(value);
}

/** The fields of a fact type, in the catalog's order, with their form label. */
export function factFields(type: FactType): Array<{ field: string; spec: FieldSpec; label: string }> {
  return Object.entries(FACT_FIELDS[type]).map(([field, spec]) => ({
    field,
    spec,
    label: `${FIELD_LABEL[field] ?? field}${spec.required ? ' (required)' : ''}`,
  }));
}

/** Form hint per field kind (same hints as the web form). */
export function fieldHint(spec: FieldSpec): string | undefined {
  if (spec.kind === 'date') return 'YYYY, YYYY-MM, or YYYY-MM-DD';
  if (spec.kind === 'list') return 'Separate items with commas';
  return undefined;
}

/** What the form holds. Empty string means the field was left blank. */
export type FactDraft = Record<string, string>;

const TITLE_FIELDS: Record<FactType, readonly string[]> = {
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

/** The web's fact title (`factTitle`), or the type label when nothing is filled. */
export function factTitle(type: FactType, value: FactValue): string {
  const parts: string[] = [];
  for (const field of TITLE_FIELDS[type] ?? []) {
    const current = value[field];
    if (typeof current === 'string' && current.length > 0) parts.push(current);
  }
  const title = parts.join(' · ');
  return title || typeLabel(type);
}

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

export function draftsEqual(a: FactDraft, b: FactDraft): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? '') !== (b[key] ?? '')) return false;
  return true;
}

/**
 * The fields that differ from the stored fact, or null when nothing changed
 * (web `changedPatch`). Only those are sent, so an untouched uncertain field
 * keeps its flag. `confirmed` mode also needs every required field.
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

/**
 * The value for a new fact. Drafts may leave required fields empty (as on
 * the web); a fact with nothing filled in at all is refused here so an
 * accidental tap does not create a blank card.
 */
export function newFactValue(
  type: FactType,
  draft: FactDraft,
  mode: FactConfirmation,
): { ok: true; value: FactValue } | { ok: false; errors: FieldError[] } | { ok: false; empty: true } {
  const checked = validateFactValue(type, fromDraft(type, draft), mode);
  if (!checked.ok) return checked;
  const filled = Object.values(checked.value).some((v) => v !== null);
  if (!filled) return { ok: false, empty: true };
  return { ok: true, value: checked.value };
}

/** `{ field, reason }` pairs → one message per field, as the web form shows them. */
export function fieldErrorMap(errors: ReadonlyArray<{ field: string; reason: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    if (out[error.field]) continue;
    out[error.field] = REASON_TEXT[error.reason] ?? REASON_TEXT.invalid_type;
  }
  return out;
}

/** Errors on fields the form does not show (e.g. `''`), as one line. */
export function unplacedErrors(type: FactType, errors: Record<string, string>): string | null {
  const known = new Set(Object.keys(FACT_FIELDS[type]));
  const rest = Object.entries(errors).filter(([field]) => !known.has(field));
  return rest.length === 0 ? null : rest.map(([, message]) => message).join(' ');
}

export function uncertainNote(reason: string, raw?: string): string {
  const text = UNCERTAIN_TEXT[reason] ?? UNCERTAIN_TEXT.model_flagged;
  return raw ? `${text} The resume said “${raw}”.` : text;
}

export function missingFieldsLine(fields: readonly string[]): string | null {
  if (fields.length === 0) return null;
  return `Still needed before you can confirm: ${fields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}`;
}

/** "3 confirmed, 2 still to review" plus the core sections with no confirmed fact (web `counts` + `missing_core`). */
export function countsLine(facts: ReadonlyArray<Pick<Fact, 'factType' | 'confirmation'>>): string {
  let confirmed = 0;
  let draft = 0;
  const confirmedTypes = new Set<string>();
  for (const fact of facts) {
    if (fact.confirmation === 'confirmed') {
      confirmed += 1;
      confirmedTypes.add(fact.factType);
    } else draft += 1;
  }
  const missing = CORE_FACT_TYPES.filter((type) => !confirmedTypes.has(type));
  const head = `${confirmed} confirmed, ${draft} still to review`;
  return missing.length > 0 ? `${head}. Still to confirm: ${missing.map(typeLabel).join(', ')}` : head;
}

/** Revision row text (web `revision`). */
export function revisionLine(revision: { revision: number; change: string }): string {
  return `Version ${revision.revision}: ${CHANGE_LABEL[revision.change] ?? revision.change}`;
}

// ---------------------------------------------------------------- import

export function allowanceLine(allowance: Pick<ImportAllowance, 'limit' | 'remaining' | 'resetsAt'>): string {
  if (allowance.remaining <= 0) {
    return `The daily import limit is ${allowance.limit}. It resets on ${allowance.resetsAt.slice(0, 10)} UTC.`;
  }
  return `${allowance.remaining} ${allowance.remaining === 1 ? 'import' : 'imports'} left today`;
}

/** Pasted text, cleaned the way the web cleans extracted text, or why it cannot be sent. */
export function checkImportText(text: string): { ok: true; text: string } | { ok: false; message: string } {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (cleaned.length === 0) return { ok: false, message: 'Paste the text of your resume first.' };
  if (cleaned.length > IMPORT_TEXT_MAX) return { ok: false, message: 'That text is too long. Paste at most 100,000 characters.' };
  return { ok: true, text: cleaned };
}

export type ImportOutcome =
  | { kind: 'unavailable'; title: string; body: string }
  | { kind: 'limit'; limit: number; resetsAt: string }
  | { kind: 'failed'; title: string; body: string };

/** How a failed import is shown (web `runImport` catch). Never claims anything was added. */
export function importFailure(error: unknown, allowance: Pick<ImportAllowance, 'limit' | 'resetsAt'> | undefined): ImportOutcome {
  if (error instanceof ApiError && error.code === 'provider_unavailable') {
    return {
      kind: 'unavailable',
      title: 'Import is unavailable',
      body: 'Needs the AI provider, which is not configured in this environment. The daily import was not counted, and no document credit was used.',
    };
  }
  if (error instanceof ApiError && error.code === 'import_daily_limit') {
    const limit = typeof error.body.limit === 'number' ? error.body.limit : (allowance?.limit ?? 0);
    const resetsAt = typeof error.body.resetsAt === 'string' ? error.body.resetsAt : (allowance?.resetsAt ?? '');
    return { kind: 'limit', limit, resetsAt };
  }
  if (error instanceof ApiError && error.code === 'network_error') {
    return { kind: 'failed', title: 'No connection', body: 'Nothing was imported and the daily import was not counted. Your text is still here.' };
  }
  return {
    kind: 'failed',
    title: 'The import did not finish',
    body: 'The daily import was not counted, and no document credit was used. What you pasted is still here.',
  };
}

export function missingSectionsLine(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  return `The resume had no ${missing.map(typeLabel).join(', ')}. Nothing was added for them.`;
}

// ---------------------------------------------------------------- preferences

/** Preferences as the form holds them (text inputs + selections). */
export interface PreferencesDraft {
  targetRoles: string;
  locations: string;
  arrangements: WorkArrangement[];
  schedules: Schedule[];
  seniority: Seniority | null;
  amount: string;
  currency: string;
  period: PayPeriod;
  hours: string;
  goals: string;
}

export function toPreferencesDraft(value: Partial<CareerPreferences> | undefined): PreferencesDraft {
  return {
    targetRoles: (value?.targetRoles ?? []).join(', '),
    locations: (value?.locations ?? []).join(', '),
    arrangements: [...(value?.arrangements ?? [])],
    schedules: [...(value?.schedules ?? [])],
    seniority: value?.seniority ?? null,
    amount: value?.minimumPay ? String(value.minimumPay.amount) : '',
    currency: value?.minimumPay?.currency ?? '',
    period: value?.minimumPay?.period ?? 'year',
    hours: value?.learningHoursPerWeek === null || value?.learningHoursPerWeek === undefined ? '' : String(value.learningHoursPerWeek),
    goals: value?.careerGoals ?? '',
  };
}

/** Same mapping as the web's `preferencesFromForm`. */
export function fromPreferencesDraft(draft: PreferencesDraft): CareerPreferences {
  const list = (text: string) =>
    text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  const amountText = draft.amount.trim();
  const hoursText = draft.hours.trim();
  const goals = draft.goals.trim();
  return {
    targetRoles: list(draft.targetRoles),
    locations: list(draft.locations),
    arrangements: WORK_ARRANGEMENTS.filter((item) => draft.arrangements.includes(item)),
    schedules: SCHEDULES.filter((item) => draft.schedules.includes(item)),
    seniority: draft.seniority,
    minimumPay: amountText.length === 0 ? null : { amount: Number(amountText), currency: draft.currency.trim().toUpperCase(), period: draft.period },
    learningHoursPerWeek: hoursText.length === 0 ? null : Number(hoursText),
    careerGoals: goals.length === 0 ? null : goals,
  };
}

/** Validated preferences, or the message for the first bad field (web `preference_error`). */
export function checkPreferences(draft: PreferencesDraft): { ok: true; value: CareerPreferences } | { ok: false; field: string; message: string } {
  const checked = validatePreferences(fromPreferencesDraft(draft));
  if (checked.ok) return checked;
  const field = checked.errors[0]?.field || 'preferences';
  return { ok: false, field, message: preferenceErrorMessage(field) };
}

export function preferenceErrorMessage(field: string): string {
  if (field === 'minimumPay') return 'Check minimum pay: a whole amount above 0 and a 3-letter currency code such as USD.';
  if (field === 'learningHoursPerWeek') return 'Check learning hours a week: a whole number from 0 to 80.';
  return `Check ${PREFERENCE_FIELD_LABEL[field] ?? field}.`;
}

/** Read-only lines for the preferences card; empty when nothing is set. */
export function preferencesSummary(value: CareerPreferences | undefined): string[] {
  if (!value) return [];
  const lines: string[] = [];
  if (value.targetRoles.length > 0) lines.push(`Target roles: ${value.targetRoles.join(', ')}`);
  if (value.locations.length > 0) lines.push(`Locations: ${value.locations.join(', ')}`);
  if (value.arrangements.length > 0) lines.push(`Work arrangement: ${value.arrangements.map((a) => ARRANGEMENT_LABEL[a]).join(', ')}`);
  if (value.schedules.length > 0) lines.push(`Schedule: ${value.schedules.map((s) => SCHEDULE_LABEL[s]).join(', ')}`);
  if (value.seniority) lines.push(`Seniority: ${SENIORITY_LABEL[value.seniority]}`);
  if (value.minimumPay) {
    lines.push(`Minimum pay: ${value.minimumPay.amount} ${value.minimumPay.currency} a ${PERIOD_LABEL[value.minimumPay.period].toLowerCase()}`);
  }
  if (value.learningHoursPerWeek !== null) lines.push(`Learning hours a week: ${value.learningHoursPerWeek}`);
  if (value.careerGoals) lines.push(`Career goals: ${value.careerGoals}`);
  return lines;
}

export function preferencesDraftsEqual(a: PreferencesDraft, b: PreferencesDraft): boolean {
  const norm = (d: PreferencesDraft) =>
    JSON.stringify({ ...d, arrangements: [...d.arrangements].sort(), schedules: [...d.schedules].sort() });
  return norm(a) === norm(b);
}

export function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
