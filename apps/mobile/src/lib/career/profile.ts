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
import JSZip from 'jszip';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { Fact, ImportAllowance } from '../../../../../packages/career-api-client/src/types';
import { hasKey, t } from '../../i18n';
import { FACT_TYPE_LABEL, labelMap } from '../career-view';

/**
 * Pure logic for the mobile career profile (facts, import, preferences).
 * Mirrors the website's profile screen (apps/web/src/components/career/profile
 * and apps/web/src/lib/career/fact-draft.ts) so a value the phone accepts is
 * a value the website and the API accept. Copy lives in the
 * `careerProfile` namespace (English matches the web's `career.profile` strings).
 */

export { FACT_TYPES, PAY_PERIODS, SCHEDULES, SENIORITIES, WORK_ARRANGEMENTS };
export type { FactType };

/** The career API's ceiling for pasted resume text (`RESUME_TEXT_MAX`). */
export const IMPORT_TEXT_MAX = 100_000;

export const FIELD_LABEL: Record<string, string> = labelMap('careerProfile.fields', [
  'fullName', 'headline', 'email', 'phone', 'city', 'country', 'website', 'linkedin', 'github', 'text', 'position', 'company',
  'location', 'startDate', 'endDate', 'current', 'responsibilities', 'institution', 'degree', 'field', 'details', 'name',
  'category', 'description', 'url', 'technologies', 'statement', 'metric', 'experienceFactId', 'date', 'issuer', 'issueDate',
  'expiryDate', 'credentialId', 'proficiency', 'title', 'relationship',
] as const);

export const REASON_TEXT: Record<string, string> = labelMap('careerProfile.reasons', [
  'required', 'too_long', 'invalid_date', 'date_order', 'invalid_email', 'invalid_url', 'invalid_type', 'too_many_items',
  'current_with_end_date', 'unknown_field',
] as const);

export const UNCERTAIN_TEXT: Record<string, string> = labelMap('careerProfile.uncertain', [
  'model_flagged', 'unparsed_date', 'date_order', 'not_found_in_source', 'number_not_in_source', 'truncated', 'invalid_format',
] as const);

export const SOURCE_LABEL: Record<string, string> = labelMap('careerProfile.sources', ['manual', 'paste', 'import', 'migrated'] as const);

export const CHANGE_LABEL: Record<string, string> = labelMap('careerProfile.changes', ['created', 'edited', 'confirmed'] as const);

export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = labelMap('careerProfile.arrangement', ['onsite', 'hybrid', 'remote'] as const);
export const SCHEDULE_LABEL: Record<Schedule, string> = labelMap('careerProfile.schedule', [
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'internship',
] as const);
export const SENIORITY_LABEL: Record<Seniority, string> = labelMap('careerProfile.seniority', ['entry', 'mid', 'senior', 'lead', 'executive'] as const);
export const PERIOD_LABEL: Record<PayPeriod, string> = labelMap('careerProfile.period', ['hour', 'month', 'year'] as const);
/** The period inside a sentence ("60000 EUR a year"). */
const PERIOD_LOWER: Record<PayPeriod, string> = labelMap('careerProfile.periodLower', ['hour', 'month', 'year'] as const);

export const PREFERENCE_FIELD_LABEL: Record<string, string> = labelMap('careerProfile.prefFields', [
  'targetRoles',
  'locations',
  'arrangements',
  'schedules',
  'seniority',
  'minimumPay',
  'learningHoursPerWeek',
  'careerGoals',
  'preferences',
] as const);

export function typeLabel(type: string): string {
  return FACT_TYPE_LABEL[type] ?? type;
}

export function isFactType(value: unknown): value is FactType {
  return typeof value === 'string' && (FACT_TYPES as readonly string[]).includes(value);
}

/** The fields of a fact type, in the catalog's order, with their form label. */
export function factFields(type: FactType): Array<{ field: string; spec: FieldSpec; label: string }> {
  return Object.entries(FACT_FIELDS[type]).map(([field, spec]) => ({
    field,
    spec,
    label: spec.required ? t('careerProfile.fieldRequired', { label: FIELD_LABEL[field] ?? field }) : (FIELD_LABEL[field] ?? field),
  }));
}

/** Form hint per field kind (same hints as the web form). */
export function fieldHint(spec: FieldSpec): string | undefined {
  if (spec.kind === 'date') return t('careerProfile.hints.date');
  if (spec.kind === 'list') return t('careerProfile.hints.list');
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
  return raw ? [text, t('careerProfile.uncertainRaw', { raw })].join(' ') : text;
}

export function missingFieldsLine(fields: readonly string[]): string | null {
  if (fields.length === 0) return null;
  return t('careerProfile.missingFields', { fields: fields.map((f) => FIELD_LABEL[f] ?? f).join(', ') });
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
  const head = t('careerProfile.counts', { confirmed, draft });
  return missing.length > 0 ? `${head}. ${t('careerProfile.missingCore', { sections: missing.map(typeLabel).join(', ') })}` : head;
}

/** Revision row text (web `revision`). */
export function revisionLine(revision: { revision: number; change: string }): string {
  const change = hasKey(`careerProfile.changes.${revision.change}`) ? CHANGE_LABEL[revision.change] : revision.change;
  return t('careerProfile.revision', { revision: revision.revision, change });
}

// ---------------------------------------------------------------- import

export function allowanceLine(allowance: Pick<ImportAllowance, 'limit' | 'remaining' | 'resetsAt'>): string {
  if (allowance.remaining <= 0) {
    return t('careerProfile.import.limit', { limit: allowance.limit, date: allowance.resetsAt.slice(0, 10) });
  }
  return t('careerProfile.import.remaining', { count: allowance.remaining });
}

/** Pasted text, cleaned the way the web cleans extracted text, or why it cannot be sent. */
export function checkImportText(text: string): { ok: true; text: string } | { ok: false; message: string } {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (cleaned.length === 0) return { ok: false, message: t('careerProfile.import.empty') };
  if (cleaned.length > IMPORT_TEXT_MAX) return { ok: false, message: t('careerProfile.import.tooLong') };
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
      title: t('careerProfile.import.unavailableTitle'),
      body: t('careerProfile.import.unavailableBody'),
    };
  }
  if (error instanceof ApiError && error.code === 'import_daily_limit') {
    const limit = typeof error.body.limit === 'number' ? error.body.limit : (allowance?.limit ?? 0);
    const resetsAt = typeof error.body.resetsAt === 'string' ? error.body.resetsAt : (allowance?.resetsAt ?? '');
    return { kind: 'limit', limit, resetsAt };
  }
  if (error instanceof ApiError && error.code === 'network_error') {
    return { kind: 'failed', title: t('careerProfile.import.noConnectionTitle'), body: t('careerProfile.import.noConnectionBody') };
  }
  return {
    kind: 'failed',
    title: t('careerProfile.import.failedTitle'),
    body: t('careerProfile.import.failedBody'),
  };
}

export function missingSectionsLine(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  return t('careerProfile.import.missingSections', { sections: missing.map(typeLabel).join(', ') });
}

// ---------------------------------------------------------------- import from a file

/**
 * Same ceiling as the website's file import (`RESUME_UPLOAD_MAX_BYTES` in
 * apps/web/src/lib/career/extract-resume.ts). Like the web, the phone reads
 * the file itself and sends only the text; the API never receives the file.
 */
export const RESUME_FILE_MAX_BYTES = 5 * 1024 * 1024;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * What the document picker offers. PDF is offered so choosing one explains
 * why it cannot be read here instead of the file being greyed out.
 */
export const RESUME_PICKER_TYPES = [DOCX_MIME, 'text/plain', 'application/pdf'];

/** `format` as the import API takes it (`IsIn(['pdf', 'docx', 'text'])`). */
export type ResumeFileFormat = 'docx' | 'text';

export type ResumeFileCode = 'unsupported' | 'pdf' | 'too_large' | 'empty' | 'failed' | 'too_long';

export class ResumeFileError extends Error {
  constructor(readonly code: ResumeFileCode) {
    super(code);
    this.name = 'ResumeFileError';
  }
}

export interface PickedResumeFile {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
}

/** DOCX or plain text by name or MIME type (as the web's `importFormat`); PDF is recognised so it can be explained. */
export function resumeFileKind(file: PickedResumeFile): ResumeFileFormat | 'pdf' | null {
  const name = (file.name ?? '').toLowerCase();
  const type = (file.mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || type === DOCX_MIME) return 'docx';
  if (name.endsWith('.txt') || type === 'text/plain') return 'text';
  return null;
}

/** Checks before reading, in the web's order: size first, then type. */
export function checkResumeFile(file: PickedResumeFile): { ok: true; format: ResumeFileFormat } | { ok: false; code: ResumeFileCode } {
  if (typeof file.size === 'number' && file.size > RESUME_FILE_MAX_BYTES) return { ok: false, code: 'too_large' };
  const kind = resumeFileKind(file);
  if (kind === 'pdf') return { ok: false, code: 'pdf' };
  if (!kind) return { ok: false, code: 'unsupported' };
  return { ok: true, format: kind };
}

export function resumeFileErrorMessage(code: ResumeFileCode): string {
  switch (code) {
    case 'pdf':
      return t('careerProfile.import.file.pdf');
    case 'too_large':
      return t('careerProfile.import.file.tooLarge');
    case 'empty':
      return t('careerProfile.import.file.empty');
    case 'too_long':
      return t('careerProfile.import.file.tooLong');
    case 'unsupported':
      return t('careerProfile.import.file.unsupported');
    default:
      return t('careerProfile.import.file.failed');
  }
}

/** The web's clean-up of extracted text. */
export function cleanResumeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x')) return safeCodePoint(parseInt(entity.slice(2), 16), whole);
    if (entity.startsWith('#')) return safeCodePoint(parseInt(entity.slice(1), 10), whole);
    return XML_ENTITIES[entity] ?? whole;
  });
}

/**
 * Plain text of a WordprocessingML body, the way mammoth's `extractRawText`
 * (the website's DOCX reader) produces it: each paragraph's text followed by
 * a blank line, `w:tab` as a tab. One deliberate difference: `w:br`/`w:cr`
 * become a line break (mammoth's raw text drops them, running the words
 * on either side together). Paragraph
 * and run properties (tab stops), deleted text (`w:delText`), field codes
 * (`w:instrText`) and the duplicate `mc:Choice` branch are not text.
 */
export function docxXmlToText(xml: string): string {
  const body = xml
    .replace(/<mc:Choice\b[\s\S]*?<\/mc:Choice>/g, '')
    .replace(/<w:(pPr|rPr)\b[^>]*\/>/g, '')
    .replace(/<w:(pPr|rPr)\b[^>]*>[\s\S]*?<\/w:\1>/g, '');
  const token = /<w:(p|t|tab|br|cr)\b([^>]*?)(\/?)>|<\/w:(p|t)>/g;
  const stack: string[] = [];
  let out = '';
  let textStart = -1;
  let match: RegExpExecArray | null;
  while ((match = token.exec(body)) !== null) {
    const [, open, , selfClosing, close] = match;
    if (close === 't') {
      if (textStart >= 0 && stack.length > 0) stack[stack.length - 1] += decodeXml(body.slice(textStart, match.index));
      textStart = -1;
    } else if (close === 'p') {
      out += `${stack.pop() ?? ''}\n\n`;
    } else if (open === 'p') {
      if (selfClosing) out += '\n\n';
      else stack.push('');
    } else if (open === 't') {
      if (!selfClosing) textStart = token.lastIndex;
    } else if (stack.length > 0 && textStart < 0) {
      stack[stack.length - 1] += open === 'tab' ? '\t' : '\n';
    }
  }
  return out;
}

/** The main document part named in `_rels/.rels`, else the usual `word/document.xml`. */
function mainPartPath(rels: string | null): string {
  if (!rels) return 'word/document.xml';
  for (const [element] of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (!/Type="[^"]*\/officeDocument"/.test(element)) continue;
    const target = /Target="([^"]+)"/.exec(element)?.[1];
    if (target) return target.replace(/^\//, '');
  }
  return 'word/document.xml';
}

/** Text of a DOCX file (a zip). Throws `ResumeFileError('failed')` when it is not a readable DOCX. */
export async function extractDocxText(data: Uint8Array | ArrayBuffer): Promise<string> {
  let xml: string | undefined;
  try {
    const zip = await JSZip.loadAsync(data);
    const rels = (await zip.file('_rels/.rels')?.async('string')) ?? null;
    xml = await (zip.file(mainPartPath(rels)) ?? zip.file('word/document.xml'))?.async('string');
  } catch {
    throw new ResumeFileError('failed');
  }
  if (xml === undefined) throw new ResumeFileError('failed');
  return docxXmlToText(xml);
}

/** How the screen reads the picked file (expo-file-system on the phone, buffers in tests). */
export interface ResumeFileReader {
  bytes: () => Promise<Uint8Array>;
  text: () => Promise<string>;
}

export interface ExtractedResumeFile {
  text: string;
  format: ResumeFileFormat;
  fileName?: string;
}

/**
 * Reads a picked résumé on the phone: DOCX through its main document part,
 * plain text as is. PDF is refused with its own message (no PDF text engine
 * on the phone). Errors are `ResumeFileError`, with the web's codes plus
 * `pdf` and `too_long`.
 */
export async function extractResumeFile(file: PickedResumeFile, reader: ResumeFileReader): Promise<ExtractedResumeFile> {
  const checked = checkResumeFile(file);
  if (!checked.ok) throw new ResumeFileError(checked.code);
  let raw: string;
  try {
    if (checked.format === 'docx') {
      const bytes = await reader.bytes();
      if (bytes.byteLength > RESUME_FILE_MAX_BYTES) throw new ResumeFileError('too_large');
      raw = await extractDocxText(bytes);
    } else {
      raw = await reader.text();
      if (raw.length > RESUME_FILE_MAX_BYTES) throw new ResumeFileError('too_large');
    }
  } catch (error) {
    if (error instanceof ResumeFileError) throw error;
    throw new ResumeFileError('failed');
  }
  const text = cleanResumeText(raw.replace(/^\uFEFF/, ''));
  if (!text) throw new ResumeFileError('empty');
  if (text.length > IMPORT_TEXT_MAX) throw new ResumeFileError('too_long');
  const fileName = (file.name ?? '').trim().slice(0, 255) || undefined;
  return { text, format: checked.format, fileName };
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
  if (field === 'minimumPay') return t('careerProfile.prefErrors.pay');
  if (field === 'learningHoursPerWeek') return t('careerProfile.prefErrors.hours');
  const label = hasKey(`careerProfile.prefFields.${field}`) ? PREFERENCE_FIELD_LABEL[field] : field;
  return t('careerProfile.prefErrors.field', { field: label });
}

/** Read-only lines for the preferences card; empty when nothing is set. */
export function preferencesSummary(value: CareerPreferences | undefined): string[] {
  if (!value) return [];
  const lines: string[] = [];
  const line = (field: string, text: string | number) => lines.push(`${PREFERENCE_FIELD_LABEL[field]}: ${text}`);
  if (value.targetRoles.length > 0) line('targetRoles', value.targetRoles.join(', '));
  if (value.locations.length > 0) line('locations', value.locations.join(', '));
  if (value.arrangements.length > 0) line('arrangements', value.arrangements.map((a) => ARRANGEMENT_LABEL[a]).join(', '));
  if (value.schedules.length > 0) line('schedules', value.schedules.map((s) => SCHEDULE_LABEL[s]).join(', '));
  if (value.seniority) line('seniority', SENIORITY_LABEL[value.seniority]);
  if (value.minimumPay) {
    line(
      'minimumPay',
      t('careerProfile.payValue', { amount: value.minimumPay.amount, currency: value.minimumPay.currency, period: PERIOD_LOWER[value.minimumPay.period] }),
    );
  }
  if (value.learningHoursPerWeek !== null) line('learningHoursPerWeek', value.learningHoursPerWeek);
  if (value.careerGoals) line('careerGoals', value.careerGoals);
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
