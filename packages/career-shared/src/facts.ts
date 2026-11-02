/**
 * Career facts (CV01). One schema for the API, the web form, and the
 * mobile form, so a value the screen accepts is a value the API stores.
 *
 * A draft may be incomplete: an import returns what it found and leaves
 * the rest missing. Confirming needs the required fields. Formats are
 * checked in both states, so a malformed date is never stored.
 */

export const FACT_TYPES = [
  'contact',
  'summary',
  'experience',
  'education',
  'skill',
  'project',
  'achievement',
  'certification',
  'language',
  'reference',
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export const FACT_SOURCES = ['manual', 'paste', 'import', 'migrated'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export type FactConfirmation = 'draft' | 'confirmed';

export type FieldKind = 'text' | 'longtext' | 'date' | 'boolean' | 'list' | 'email' | 'url' | 'ref';

export interface FieldSpec {
  kind: FieldKind;
  required?: boolean;
}

export const TEXT_MAX = 300;
export const LONGTEXT_MAX = 5000;
export const LIST_MAX_ITEMS = 50;
export const LIST_ITEM_MAX = 100;
/** ASSUMED: a ceiling against runaway imports, not a plan limit. */
export const MAX_FACTS_PER_CANDIDATE = 500;

export const FACT_FIELDS: { readonly [T in FactType]: Readonly<Record<string, FieldSpec>> } = {
  contact: {
    fullName: { kind: 'text', required: true },
    headline: { kind: 'text' },
    email: { kind: 'email' },
    phone: { kind: 'text' },
    city: { kind: 'text' },
    country: { kind: 'text' },
    website: { kind: 'url' },
    linkedin: { kind: 'url' },
    github: { kind: 'url' },
  },
  summary: {
    text: { kind: 'longtext', required: true },
  },
  experience: {
    position: { kind: 'text', required: true },
    company: { kind: 'text', required: true },
    location: { kind: 'text' },
    startDate: { kind: 'date' },
    endDate: { kind: 'date' },
    current: { kind: 'boolean' },
    responsibilities: { kind: 'longtext' },
  },
  education: {
    institution: { kind: 'text', required: true },
    degree: { kind: 'text' },
    field: { kind: 'text' },
    location: { kind: 'text' },
    startDate: { kind: 'date' },
    endDate: { kind: 'date' },
    details: { kind: 'longtext' },
  },
  skill: {
    name: { kind: 'text', required: true },
    category: { kind: 'text' },
  },
  project: {
    name: { kind: 'text', required: true },
    description: { kind: 'longtext' },
    url: { kind: 'url' },
    technologies: { kind: 'list' },
    startDate: { kind: 'date' },
    endDate: { kind: 'date' },
  },
  achievement: {
    statement: { kind: 'longtext', required: true },
    /** The number, as the person states it. Empty means none was given; nothing fills it. */
    metric: { kind: 'text' },
    /** The experience fact this result belongs to (role ownership). */
    experienceFactId: { kind: 'ref' },
    date: { kind: 'date' },
  },
  certification: {
    name: { kind: 'text', required: true },
    issuer: { kind: 'text' },
    issueDate: { kind: 'date' },
    expiryDate: { kind: 'date' },
    credentialId: { kind: 'text' },
    url: { kind: 'url' },
  },
  language: {
    name: { kind: 'text', required: true },
    proficiency: { kind: 'text' },
  },
  reference: {
    name: { kind: 'text', required: true },
    title: { kind: 'text' },
    company: { kind: 'text' },
    email: { kind: 'email' },
    phone: { kind: 'text' },
    relationship: { kind: 'text' },
  },
};

/** Start and end pairs checked for order. */
const DATE_PAIRS: Partial<Record<FactType, Array<[string, string]>>> = {
  experience: [['startDate', 'endDate']],
  education: [['startDate', 'endDate']],
  project: [['startDate', 'endDate']],
  certification: [['issueDate', 'expiryDate']],
};

export type FactFieldValue = string | boolean | string[] | null;
export type FactValue = Record<string, FactFieldValue>;

export type FieldErrorReason =
  | 'unknown_field'
  | 'required'
  | 'too_long'
  | 'invalid_date'
  | 'date_order'
  | 'invalid_email'
  | 'invalid_url'
  | 'invalid_type'
  | 'too_many_items'
  | 'current_with_end_date';

export interface FieldError {
  field: string;
  reason: FieldErrorReason;
}

export type FactValidation = { ok: true; value: FactValue } | { ok: false; errors: FieldError[] };

export function isFactType(value: unknown): value is FactType {
  return typeof value === 'string' && (FACT_TYPES as readonly string[]).includes(value);
}

export function isFactSource(value: unknown): value is FactSource {
  return typeof value === 'string' && (FACT_SOURCES as readonly string[]).includes(value);
}

const PARTIAL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * A date with only the precision the source gave: `YYYY`, `YYYY-MM`, or
 * `YYYY-MM-DD`. "March 2020" is stored as `2020-03`, never as a made-up
 * first of the month. ASSUMED: DATA_MODEL says date-only values are
 * `YYYY-MM-DD`; a resume rarely gives the day, and filling one in would
 * change the fact.
 */
export function isPartialDate(value: string): boolean {
  const match = PARTIAL_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  if (year < 1900 || year > 2100) return false;
  if (match[2] === undefined) return true;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return false;
  if (match[3] === undefined) return true;
  const day = Number(match[3]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= days;
}

/**
 * Orders two partial dates at the precision they share. `2020` and
 * `2020-05` are not in conflict; `2021-01` before `2020-12` is.
 */
export function comparePartialDates(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  const left = a.slice(0, length);
  const right = b.slice(0, length);
  return left < right ? -1 : left > right ? 1 : 0;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Normalizes one field. Strings are trimmed; an empty string is `null`
 * (missing). A URL without a scheme gets `https://` so `linkedin.com/in/x`
 * is accepted as typed.
 */
function normalizeField(spec: FieldSpec, raw: unknown): { value: FactFieldValue } | { error: FieldErrorReason } {
  if (raw === null || raw === undefined) return { value: null };
  switch (spec.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw } : { error: 'invalid_type' };
    case 'list': {
      if (!Array.isArray(raw)) return { error: 'invalid_type' };
      const items: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string') return { error: 'invalid_type' };
        const trimmed = item.trim();
        if (trimmed.length === 0) continue;
        if (trimmed.length > LIST_ITEM_MAX) return { error: 'too_long' };
        if (!items.includes(trimmed)) items.push(trimmed);
      }
      if (items.length > LIST_MAX_ITEMS) return { error: 'too_many_items' };
      return { value: items.length === 0 ? null : items };
    }
    default: {
      if (typeof raw !== 'string') return { error: 'invalid_type' };
      const trimmed = raw.trim();
      if (trimmed.length === 0) return { value: null };
      const max = spec.kind === 'longtext' ? LONGTEXT_MAX : TEXT_MAX;
      if (trimmed.length > max) return { error: 'too_long' };
      if (spec.kind === 'date' && !isPartialDate(trimmed)) return { error: 'invalid_date' };
      if (spec.kind === 'email' && !EMAIL.test(trimmed)) return { error: 'invalid_email' };
      if (spec.kind === 'ref' && !UUID.test(trimmed)) return { error: 'invalid_type' };
      if (spec.kind === 'url') {
        const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
        if (!isHttpUrl(withScheme)) return { error: 'invalid_url' };
        return { value: withScheme };
      }
      return { value: spec.kind === 'ref' ? trimmed.toLowerCase() : trimmed };
    }
  }
}

/**
 * Checks and normalizes a fact value. `draft` checks formats only;
 * `confirmed` also needs every required field. Every listed field is
 * present in the result, `null` when missing.
 */
export function validateFactValue(type: FactType, raw: unknown, mode: FactConfirmation): FactValidation {
  const fields = FACT_FIELDS[type];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: '', reason: 'invalid_type' }] };
  }
  const input = raw as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) errors.push({ field: key, reason: 'unknown_field' });
  }

  const value: FactValue = {};
  for (const [field, spec] of Object.entries(fields)) {
    const result = normalizeField(spec, input[field]);
    if ('error' in result) {
      errors.push({ field, reason: result.error });
      value[field] = null;
      continue;
    }
    value[field] = result.value;
    if (mode === 'confirmed' && spec.required && result.value === null) errors.push({ field, reason: 'required' });
  }

  for (const [start, end] of DATE_PAIRS[type] ?? []) {
    const from = value[start];
    const to = value[end];
    if (typeof from === 'string' && typeof to === 'string' && comparePartialDates(from, to) > 0) {
      errors.push({ field: end, reason: 'date_order' });
    }
  }
  if (value.current === true && value.endDate !== null && value.endDate !== undefined) {
    errors.push({ field: 'endDate', reason: 'current_with_end_date' });
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

/** Required fields still empty. An import shows these as missing, not guessed. */
export function missingRequiredFields(type: FactType, value: FactValue): string[] {
  return Object.entries(FACT_FIELDS[type])
    .filter(([field, spec]) => spec.required && (value[field] === null || value[field] === undefined))
    .map(([field]) => field);
}

/** A field an import could not trust, kept until the person confirms or edits it. */
export type UncertainReason =
  | 'model_flagged'
  | 'unparsed_date'
  | 'date_order'
  | 'not_found_in_source'
  | 'number_not_in_source'
  | 'truncated'
  | 'invalid_format';

export interface UncertainField {
  reason: UncertainReason;
  /** What the source said when it could not be stored as is (for example "Summer 2019"). */
  raw?: string;
}

export type UncertainFields = Record<string, UncertainField>;

/** The sections a usable profile has. An import names the ones it did not find. */
export const CORE_FACT_TYPES: readonly FactType[] = ['contact', 'summary', 'experience', 'education', 'skill'];

export interface FactCounts {
  confirmed: number;
  draft: number;
  uncertain: number;
  /** Core sections with no confirmed fact yet. */
  missingCore: FactType[];
}

/** Completeness is a count of confirmed facts, not a score (SCREENS dashboard). */
export function countFacts(
  facts: ReadonlyArray<{ factType: FactType; confirmation: FactConfirmation; uncertain: UncertainFields }>,
): FactCounts {
  let confirmed = 0;
  let draft = 0;
  let uncertain = 0;
  const confirmedTypes = new Set<FactType>();
  for (const fact of facts) {
    if (fact.confirmation === 'confirmed') {
      confirmed += 1;
      confirmedTypes.add(fact.factType);
    } else {
      draft += 1;
    }
    if (Object.keys(fact.uncertain).length > 0) uncertain += 1;
  }
  return { confirmed, draft, uncertain, missingCore: CORE_FACT_TYPES.filter((t) => !confirmedTypes.has(t)) };
}

export const WORK_ARRANGEMENTS = ['onsite', 'hybrid', 'remote'] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const SCHEDULES = ['full_time', 'part_time', 'contract', 'temporary', 'internship'] as const;
export type Schedule = (typeof SCHEDULES)[number];

export const SENIORITIES = ['entry', 'mid', 'senior', 'lead', 'executive'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const PAY_PERIODS = ['hour', 'month', 'year'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/** Onboarding answers (spec section 2). Matching reads these; resumes do not. */
export interface CareerPreferences {
  targetRoles: string[];
  locations: string[];
  arrangements: WorkArrangement[];
  schedules: Schedule[];
  seniority: Seniority | null;
  /** Whole currency units, not cents: a preference, not a price. */
  minimumPay: { amount: number; currency: string; period: PayPeriod } | null;
  learningHoursPerWeek: number | null;
  careerGoals: string | null;
}

export const EMPTY_PREFERENCES: CareerPreferences = {
  targetRoles: [],
  locations: [],
  arrangements: [],
  schedules: [],
  seniority: null,
  minimumPay: null,
  learningHoursPerWeek: null,
  careerGoals: null,
};

const PREFERENCE_LIST_MAX = 10;
const CURRENCY = /^[A-Z]{3}$/;

export type PreferencesValidation = { ok: true; value: CareerPreferences } | { ok: false; errors: FieldError[] };

function stringList(raw: unknown, field: string, errors: FieldError[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    errors.push({ field, reason: 'invalid_type' });
    return [];
  }
  const items = [...new Set((raw as string[]).map((item) => item.trim()).filter((item) => item.length > 0))];
  if (items.length > PREFERENCE_LIST_MAX) errors.push({ field, reason: 'too_many_items' });
  if (items.some((item) => item.length > LIST_ITEM_MAX)) errors.push({ field, reason: 'too_long' });
  return items;
}

function enumList<T extends string>(raw: unknown, allowed: readonly T[], field: string, errors: FieldError[]): T[] {
  const items = stringList(raw, field, errors);
  const out: T[] = [];
  for (const item of items) {
    const match = allowed.find((a) => a === item);
    if (match === undefined) {
      errors.push({ field, reason: 'invalid_type' });
      return [];
    }
    out.push(match);
  }
  return out;
}

/** Validates a whole preferences object. A missing key keeps its empty default. */
export function validatePreferences(raw: unknown): PreferencesValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: '', reason: 'invalid_type' }] };
  }
  const input = raw as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(EMPTY_PREFERENCES, key)) errors.push({ field: key, reason: 'unknown_field' });
  }

  const value: CareerPreferences = {
    targetRoles: stringList(input.targetRoles, 'targetRoles', errors),
    locations: stringList(input.locations, 'locations', errors),
    arrangements: enumList(input.arrangements, WORK_ARRANGEMENTS, 'arrangements', errors),
    schedules: enumList(input.schedules, SCHEDULES, 'schedules', errors),
    seniority: null,
    minimumPay: null,
    learningHoursPerWeek: null,
    careerGoals: null,
  };

  if (input.seniority !== undefined && input.seniority !== null) {
    const match = SENIORITIES.find((s) => s === input.seniority);
    if (match === undefined) errors.push({ field: 'seniority', reason: 'invalid_type' });
    else value.seniority = match;
  }

  if (input.minimumPay !== undefined && input.minimumPay !== null) {
    const pay = input.minimumPay;
    if (typeof pay !== 'object' || Array.isArray(pay)) {
      errors.push({ field: 'minimumPay', reason: 'invalid_type' });
    } else {
      const { amount, currency, period } = pay as Record<string, unknown>;
      const periodMatch = PAY_PERIODS.find((p) => p === period);
      if (
        typeof amount !== 'number' ||
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > 100_000_000 ||
        typeof currency !== 'string' ||
        !CURRENCY.test(currency) ||
        periodMatch === undefined
      ) {
        errors.push({ field: 'minimumPay', reason: 'invalid_type' });
      } else {
        value.minimumPay = { amount, currency, period: periodMatch };
      }
    }
  }

  if (input.learningHoursPerWeek !== undefined && input.learningHoursPerWeek !== null) {
    const hours = input.learningHoursPerWeek;
    if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 0 || hours > 80) {
      errors.push({ field: 'learningHoursPerWeek', reason: 'invalid_type' });
    } else {
      value.learningHoursPerWeek = hours;
    }
  }

  if (input.careerGoals !== undefined && input.careerGoals !== null) {
    if (typeof input.careerGoals !== 'string') {
      errors.push({ field: 'careerGoals', reason: 'invalid_type' });
    } else {
      const goals = input.careerGoals.trim();
      if (goals.length > 2000) errors.push({ field: 'careerGoals', reason: 'too_long' });
      else value.careerGoals = goals.length === 0 ? null : goals;
    }
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

/** The UTC day an import counts against, and when the next one starts. */
export function importDay(now: Date): { day: string; resetsAt: Date } {
  const day = now.toISOString().slice(0, 10);
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return { day, resetsAt };
}
