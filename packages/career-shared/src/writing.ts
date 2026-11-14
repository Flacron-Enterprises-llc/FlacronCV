import { factLineText, generateProfileReady } from './resume';
import type { ResumeFactInput } from './resume';

export const WRITING_TYPES = ['cover_letter', 'bio', 'linkedin', 'outreach', 'referral_request', 'thank_you'] as const;
export type WritingType = (typeof WRITING_TYPES)[number];

/** Every type except the cover letter: one prose body written by the text model and claim-checked. */
export const PROSE_WRITING_TYPES = ['bio', 'linkedin', 'outreach', 'referral_request', 'thank_you'] as const;
export type ProseWritingType = (typeof PROSE_WRITING_TYPES)[number];

export function isProseWritingType(value: string): value is ProseWritingType {
  return (PROSE_WRITING_TYPES as readonly string[]).includes(value);
}

/** Types that address one organization or role and are useless without one. */
export const TARGETED_WRITING_TYPES: readonly WritingType[] = ['referral_request', 'thank_you'];

export function isWritingType(value: string): value is WritingType {
  return (WRITING_TYPES as readonly string[]).includes(value);
}

/** V1 cover-letter React templates, adapted as V2 preview families. */
export const COVER_LETTER_TEMPLATES = [
  { id: 'classic', header: 'letterhead', accent: '#1e3a5f' },
  { id: 'modern', header: 'band', accent: '#2563eb' },
  { id: 'minimalist', header: 'plain', accent: '#374151' },
  { id: 'creative', header: 'rail', accent: '#7c3aed' },
  { id: 'corporate', header: 'block', accent: '#0f766e' },
  { id: 'executive', header: 'rule', accent: '#0c0c0c' },
  { id: 'editorial', header: 'masthead', accent: '#002B62' },
  { id: 'structured', header: 'split', accent: '#1f3b57' },
] as const;

export type CoverLetterTemplateId = (typeof COVER_LETTER_TEMPLATES)[number]['id'];
export type CoverLetterTemplate = (typeof COVER_LETTER_TEMPLATES)[number];
export const DEFAULT_COVER_LETTER_TEMPLATE: CoverLetterTemplateId = 'classic';
export const FEATURED_COVER_LETTER_TEMPLATE_IDS: CoverLetterTemplateId[] = [
  'classic',
  'editorial',
  'structured',
  'modern',
  'creative',
  'corporate',
];
export const COVER_LETTER_TEMPLATE_IDS = COVER_LETTER_TEMPLATES.map((template) => template.id);

export function isCoverLetterTemplateId(value: string): value is CoverLetterTemplateId {
  return COVER_LETTER_TEMPLATES.some((template) => template.id === value);
}

export function coverLetterTemplateOf(id: string): CoverLetterTemplate {
  return COVER_LETTER_TEMPLATES.find((template) => template.id === id) ?? COVER_LETTER_TEMPLATES[0];
}

/** A stored name. The body never comes from this string. */
export function writingTitle(type: WritingType, organization: string | null): string {
  const org = organization?.trim() ?? '';
  const title =
    type === 'cover_letter'
      ? org.length > 0
        ? `Cover letter for ${org}`
        : 'Cover letter'
      : type === 'bio'
        ? 'Bio'
        : type === 'linkedin'
          ? 'LinkedIn'
          : type === 'referral_request'
            ? org.length > 0
              ? `Referral request for ${org}`
              : 'Referral request'
            : type === 'thank_you'
              ? org.length > 0
                ? `Thank-you note to ${org}`
                : 'Thank-you note'
              : org.length > 0
                ? `Outreach to ${org}`
                : 'Outreach';
  return title.length <= 200 ? title : title.slice(0, 200);
}

export interface WritingDraft {
  body: string;
  factIds: string[];
}

/**
 * Paragraphs are the confirmed facts' own fields, in the model's order.
 * `factIds` omitted keeps every confirmed fact that has text. An id that
 * is missing, still a draft, or has no text is dropped. Nothing else is added.
 */
export function writingBody(facts: ResumeFactInput[], factIds?: string[]): WritingDraft {
  const confirmed = facts.filter((fact) => fact.confirmation === 'confirmed');
  const byId = new Map(confirmed.map((fact) => [fact.id, fact]));
  const ids = factIds ?? confirmed.map((fact) => fact.id);
  const used: string[] = [];
  const paragraphs: string[] = [];
  for (const id of ids) {
    const fact = byId.get(id);
    if (!fact) continue;
    const text = factLineText(fact.factType, fact.value);
    if (text.length === 0) continue;
    used.push(fact.id);
    paragraphs.push(text);
  }
  return { body: paragraphs.join('\n\n'), factIds: used };
}

export const COVER_LETTER_MIN_OPENING = 40;
export const COVER_LETTER_MIN_BODY = 120;
export const COVER_LETTER_MIN_CLOSING = 20;
export const COVER_LETTER_MIN_TOTAL = 200;

export interface CoverLetterParts {
  opening: string;
  body: string;
  closing: string;
  factIds?: string[];
}

export function assembleCoverLetter(parts: Pick<CoverLetterParts, 'opening' | 'body' | 'closing'>): string {
  return [parts.opening.trim(), parts.body.trim(), parts.closing.trim()].filter((part) => part.length > 0).join('\n\n');
}

export function coverLetterReady(
  facts: ResumeFactInput[],
): { ok: true } | { ok: false; field: string; reason: string } {
  const available = writingBody(facts);
  if (available.body.length === 0) return { ok: false, field: 'facts', reason: 'no_confirmed_facts' };
  return generateProfileReady(facts);
}

export type EmploymentTenure = 'current' | 'ended' | 'undated';

export interface CoverLetterContext {
  listingOrganization?: string | null;
  listingTitle?: string | null;
  listingDescription?: string | null;
}

function fieldText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Ended when an end date exists. Current only when `current` is true and there is no end date. */
export function employmentTenure(value: Record<string, unknown>): EmploymentTenure {
  if (fieldText(value.endDate)) return 'ended';
  if (value.current === true) return 'current';
  return 'undated';
}

function evidenceNames(facts: ResumeFactInput[]): string[] {
  const names: string[] = [];
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    const company = fieldText(fact.value.company);
    const institution = fieldText(fact.value.institution);
    if (fact.factType === 'experience' && company) names.push(company);
    if (fact.factType === 'education' && institution) names.push(institution);
  }
  return names;
}

function confirmedExperience(facts: ResumeFactInput[]): Array<{
  company: string;
  tenure: EmploymentTenure;
}> {
  const roles: Array<{ company: string; tenure: EmploymentTenure }> = [];
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed' || fact.factType !== 'experience') continue;
    const company = fieldText(fact.value.company);
    if (!company) continue;
    roles.push({ company, tenure: employmentTenure(fact.value) });
  }
  return roles;
}

function allowedYears(facts: ResumeFactInput[]): Set<string> {
  const years = new Set<string>();
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    for (const key of ['startDate', 'endDate'] as const) {
      const raw = fieldText(fact.value[key]);
      const year = raw?.match(/^(19|20)\d{2}/)?.[0];
      if (year) years.add(year);
    }
  }
  return years;
}

function statedListingName(value: string | null | undefined): string | null {
  const listing = value?.trim() ?? '';
  if (listing.length < 2) return null;
  if (listing.toLowerCase() === 'unstated') return null;
  return listing;
}

function listingParts(context: CoverLetterContext): string[] {
  return [statedListingName(context.listingOrganization), context.listingTitle, context.listingDescription]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
}

function listingMentionAllowed(context: CoverLetterContext, mention: string): boolean {
  const mentionName = normalizeName(mention);
  if (mentionName.length < 2) return false;
  const parts = listingParts(context);
  const haystack = parts.map(normalizeName).join('\n');
  if (haystack.includes(mentionName)) return true;
  return parts.some((part) => namesOverlap(part, mention));
}

function allowedOrganizations(facts: ResumeFactInput[], context: CoverLetterContext): string[] {
  const names = evidenceNames(facts);
  const listing = statedListingName(context.listingOrganization);
  if (listing) names.push(listing);
  return names;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function namesOverlap(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (a.length < 2 || b.length < 2) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = (value: string) => value.split(/[^a-z0-9]+/g).filter((token) => token.length >= 8);
  const leftTokens = tokens(a);
  const rightTokens = new Set(tokens(b));
  return leftTokens.some((token) => rightTokens.has(token));
}

const MENTION_STOP = new Set([
  'i',
  'we',
  'my',
  'our',
  'he',
  'she',
  'they',
  "i'm",
  "i've",
  'je',
  "j'ai",
  "j'etais",
  "j'étais",
]);

/** Title-case names after "at" / "chez". Stops before a pronoun so "at Northwind I" keeps the employer. */
export function employerMentions(text: string): string[] {
  const mentions: string[] = [];
  const pattern =
    /\b(?:[Aa]t|[Cc]hez)[ \t]+(?:l['’]|the[ \t]+)?(\p{Lu}[\p{L}0-9&.'’-]*)((?:[ \t]+(?:de|du|des|la|le|the|of|and|et|&)[ \t]+\p{Lu}[\p{L}0-9&.'’-]*|[ \t]+\p{Lu}[\p{L}0-9&.'’-]*)*)/gu;
  for (const match of text.matchAll(pattern)) {
    const first = match[1] ?? '';
    const rest = (match[2] ?? '')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0 && !MENTION_STOP.has(normalizeName(token)));
    const tokens = [first, ...rest].filter((token) => token.length > 0 && !MENTION_STOP.has(normalizeName(token)));
    const name = tokens.join(' ').replace(/[.,;:]+$/g, '').trim();
    if (name.length >= 2) mentions.push(name);
  }
  return mentions;
}

const CURRENT_LANGUAGE =
  /\b(currently|presently|actuellement|présentement|presentement|current (?:role|position|employer|job)|still (?:work|working|employed)|en poste)\b/i;

function hasCurrentLanguage(text: string): boolean {
  return CURRENT_LANGUAGE.test(text);
}

function pastEmploymentOf(text: string, organization: string): boolean {
  const escaped = organization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `\\b(?:worked|served|employed|held|coordinated|catalogued|was|were)\\s+(?:as\\s+[\\p{L}\\s]+\\s+)?(?:at|for|chez)\\s+${escaped}\\b`,
      'iu',
    ),
    new RegExp(`\\bat\\s+${escaped}\\s+I\\s+(?:worked|was|served|held)`, 'iu'),
    new RegExp(`\\b(?:j['’]ai travaillé|j['’]étais|ai occupé)\\s+(?:chez|à)\\s+${escaped}\\b`, 'iu'),
    new RegExp(`\\bchez\\s+${escaped}[\\s,]+(?:j['’]ai|j['’]étais)`, 'iu'),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function nearCurrentLanguage(text: string, organization: string): boolean {
  const haystack = text.toLowerCase();
  const name = organization.toLowerCase();
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(name, from);
    if (at < 0) return false;
    const window = text.slice(Math.max(0, at - 120), Math.min(text.length, at + name.length + 120));
    if (hasCurrentLanguage(window)) return true;
    from = at + name.length;
  }
  return false;
}

/**
 * Structured confirmed facts for the cover-letter model. Tenure is computed
 * from `current` and `endDate` so missing dates never read as current work.
 */
export function coverLetterPromptFacts(facts: ResumeFactInput[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    if (fact.factType === 'experience') {
      const tenure = employmentTenure(fact.value);
      out.push({
        id: fact.id,
        type: 'experience',
        position: fieldText(fact.value.position),
        company: fieldText(fact.value.company),
        startDate: fieldText(fact.value.startDate),
        endDate: fieldText(fact.value.endDate),
        current: tenure === 'current',
        tenure,
      });
      continue;
    }
    if (fact.factType === 'education') {
      out.push({
        id: fact.id,
        type: 'education',
        institution: fieldText(fact.value.institution),
        degree: fieldText(fact.value.degree),
        field: fieldText(fact.value.field),
        startDate: fieldText(fact.value.startDate),
        endDate: fieldText(fact.value.endDate),
      });
      continue;
    }
    if (fact.factType === 'skill') {
      out.push({
        id: fact.id,
        type: 'skill',
        name: fieldText(fact.value.name),
        category: fieldText(fact.value.category),
      });
      continue;
    }
    if (fact.factType === 'contact') {
      out.push({
        id: fact.id,
        type: 'contact',
        fullName: fieldText(fact.value.fullName),
        email: fieldText(fact.value.email),
        phone: fieldText(fact.value.phone),
        city: fieldText(fact.value.city),
      });
      continue;
    }
    const text = factLineText(fact.factType, fact.value);
    if (text.length > 0) out.push({ id: fact.id, type: fact.factType, text });
  }
  return out;
}

/**
 * A cover letter is usable only when it has an opening, evidence-based
 * body, and closing, names a confirmed employer or school, and does not
 * describe ended or undated work as current or invent employers.
 */
export function evaluateCoverLetter(
  parts: CoverLetterParts,
  facts: ResumeFactInput[],
  context: CoverLetterContext = {},
): { ok: true; body: string; factIds: string[] } | { ok: false; reason: string; claim?: string } {
  const opening = parts.opening.trim();
  const body = parts.body.trim();
  const closing = parts.closing.trim();
  if (opening.length < COVER_LETTER_MIN_OPENING) return { ok: false, reason: 'incomplete_opening' };
  if (body.length < COVER_LETTER_MIN_BODY) return { ok: false, reason: 'incomplete_body' };
  if (closing.length < COVER_LETTER_MIN_CLOSING) return { ok: false, reason: 'incomplete_closing' };
  const assembled = assembleCoverLetter({ opening, body, closing });
  if (assembled.length < COVER_LETTER_MIN_TOTAL) return { ok: false, reason: 'incomplete_letter' };

  const haystack = assembled.toLowerCase();
  const names = evidenceNames(facts);
  if (names.length > 0 && !names.some((name) => haystack.includes(name.toLowerCase()))) {
    return { ok: false, reason: 'missing_evidence' };
  }

  const roles = confirmedExperience(facts);
  const hasCurrentRole = roles.some((role) => role.tenure === 'current');
  if (!hasCurrentRole && hasCurrentLanguage(assembled)) {
    return { ok: false, reason: 'current_role_unsupported' };
  }
  for (const role of roles) {
    if (role.tenure === 'current') continue;
    if (nearCurrentLanguage(assembled, role.company)) {
      return { ok: false, reason: 'ended_role_described_as_current' };
    }
  }

  const listing = statedListingName(context.listingOrganization);
  const listingIsPastEmployer = listing ? roles.some((role) => namesOverlap(role.company, listing)) : false;
  if (listing && !listingIsPastEmployer && pastEmploymentOf(assembled, listing)) {
    return { ok: false, reason: 'target_as_past_employer' };
  }
  for (const mention of employerMentions(assembled)) {
    const inPastFacts = roles.some((role) => namesOverlap(role.company, mention));
    const inListing = listingMentionAllowed(context, mention);
    if (!inPastFacts && inListing && pastEmploymentOf(assembled, mention)) {
      return { ok: false, reason: 'target_as_past_employer' };
    }
  }

  const allowed = allowedOrganizations(facts, context);
  for (const mention of employerMentions(assembled)) {
    const inAllowed = allowed.some((name) => namesOverlap(mention, name));
    const inListing = listingMentionAllowed(context, mention);
    if (!inAllowed && !inListing) {
      return { ok: false, reason: 'unsupported_employer', claim: mention };
    }
  }

  const years = allowedYears(facts);
  for (const match of assembled.matchAll(/\b((?:19|20)\d{2})\b/g)) {
    const year = match[1];
    if (year && !years.has(year)) return { ok: false, reason: 'unsupported_date' };
  }

  const confirmed = new Set(facts.filter((fact) => fact.confirmation === 'confirmed').map((fact) => fact.id));
  const used: string[] = [];
  const seen = new Set<string>();
  for (const id of parts.factIds ?? []) {
    if (!confirmed.has(id) || seen.has(id)) continue;
    seen.add(id);
    used.push(id);
  }
  for (const fact of facts) {
    if (!confirmed.has(fact.id) || seen.has(fact.id)) continue;
    if (fact.factType !== 'experience' && fact.factType !== 'education' && fact.factType !== 'skill') continue;
    if (factLineText(fact.factType, fact.value).length === 0) continue;
    seen.add(fact.id);
    used.push(fact.id);
  }
  return { ok: true, body: assembled, factIds: used };
}

/**
 * What the person tells us about the target when there is no saved listing
 * (most V1 job-tracker applications). Each field is the person's own words;
 * a draft may repeat them but never adds to them.
 */
export interface WritingContext {
  organization?: string | null;
  role?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  /** YYYY-MM-DD; only a thank-you note uses it. */
  interviewDate?: string | null;
}

export const WRITING_CONTEXT_LIMITS = {
  organization: 120,
  role: 120,
  contactName: 80,
  contactRole: 80,
} as const;

/** Trims and validates a context object. Empty strings become absent. */
export function normalizeWritingContext(
  raw: unknown,
): { ok: true; context: WritingContext } | { ok: false; field: string; reason: string } {
  if (raw === undefined || raw === null) return { ok: true, context: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, field: 'context', reason: 'invalid' };
  const source = raw as Record<string, unknown>;
  const allowed = new Set([...Object.keys(WRITING_CONTEXT_LIMITS), 'interviewDate']);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) return { ok: false, field: `context.${key}`, reason: 'unknown_field' };
  }
  const context: WritingContext = {};
  for (const [key, limit] of Object.entries(WRITING_CONTEXT_LIMITS) as Array<[keyof typeof WRITING_CONTEXT_LIMITS, number]>) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return { ok: false, field: `context.${key}`, reason: 'invalid' };
    const text = value.replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    if (text.length > limit) return { ok: false, field: `context.${key}`, reason: 'too_long' };
    context[key] = text;
  }
  const date = source.interviewDate;
  if (date !== undefined && date !== null && date !== '') {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return { ok: false, field: 'context.interviewDate', reason: 'invalid' };
    }
    context.interviewDate = date;
  }
  return { ok: true, context };
}

/** Shortest and longest usable body per prose type, in characters. */
export const PROSE_LIMITS: Record<ProseWritingType, { min: number; max: number }> = {
  bio: { min: 150, max: 1200 },
  linkedin: { min: 200, max: 2600 },
  outreach: { min: 150, max: 1500 },
  referral_request: { min: 150, max: 1500 },
  thank_you: { min: 100, max: 1200 },
};

export interface ProseParts {
  body: string;
  factIds?: string[];
}

/** Everything a prose draft may name besides the confirmed facts. */
export interface ProseCheckContext extends WritingContext {
  listingTitle?: string | null;
  listingDescription?: string | null;
}

const GENERIC_SALUTATION = new Set([
  'hiring',
  'manager',
  'team',
  'recruiter',
  'recruiting',
  'recruitment',
  'committee',
  'sir',
  'madam',
  'or',
  'colleague',
  'colleagues',
  'all',
  'there',
  'friend',
  'everyone',
  'the',
  'interview',
  'panel',
  'madame',
  'monsieur',
  'equipe',
  'équipe',
]);

/** The name after a greeting at the start of a line ("Dear Grace Hopper," → "Grace Hopper"). */
export function salutationNames(text: string): string[] {
  const names: string[] = [];
  const pattern = /^[ \t]*(?:dear|hi|hello|hey|bonjour|cher|chère)[ \t]+((?:\p{Lu}[\p{L}'’.-]*)(?:[ \t]+(?:\p{Lu}[\p{L}'’.-]*|or|and|et))*)/gimu;
  for (const match of text.matchAll(pattern)) {
    const name = (match[1] ?? '').replace(/[.,;:]+$/g, '').trim();
    if (name.length > 0) names.push(name);
  }
  return names;
}

function isGenericSalutation(name: string): boolean {
  const tokens = normalizeName(name)
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => GENERIC_SALUTATION.has(token));
}

/** Number tokens a draft may repeat: those in confirmed facts and in the person's own context. */
function allowedNumbers(facts: ResumeFactInput[], context: ProseCheckContext): Set<string> {
  const sources: string[] = [];
  for (const fact of facts) {
    if (fact.confirmation !== 'confirmed') continue;
    sources.push(JSON.stringify(fact.value));
  }
  for (const value of [
    context.organization,
    context.role,
    context.contactName,
    context.contactRole,
    context.interviewDate,
    context.listingTitle,
  ]) {
    if (value) sources.push(value);
  }
  const numbers = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\d+(?:[.,]\d+)?/g)) {
      numbers.add(match[0].replace(',', '.'));
      // "05" in a date is also "5" in prose.
      numbers.add(String(Number(match[0].replace(',', '.'))));
    }
  }
  return numbers;
}

/**
 * A prose draft (bio, LinkedIn text, outreach, referral request, thank-you
 * note) is usable only when it is real prose of a sensible length, names a
 * confirmed employer or school when one exists, names the target when the
 * type needs one, and makes no claim the confirmed facts or the person's own
 * context do not support: no other employers, years, numbers, contact names,
 * no ended role described as current, no target described as a past employer.
 * The same rules as `evaluateCoverLetter`, plus numbers and salutations.
 */
export function evaluateProse(
  type: ProseWritingType,
  parts: ProseParts,
  facts: ResumeFactInput[],
  context: ProseCheckContext = {},
): { ok: true; body: string; factIds: string[] } | { ok: false; reason: string; claim?: string } {
  const body = parts.body.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const limits = PROSE_LIMITS[type];
  if (body.length < limits.min) return { ok: false, reason: 'incomplete_body' };
  if (body.length > limits.max) return { ok: false, reason: 'too_long' };
  // Prose, not a list of fact lines: at least two sentences.
  if ((body.match(/[.!?](?:\s|$)/g) ?? []).length < 2) return { ok: false, reason: 'not_prose' };
  if (body === writingBody(facts).body) return { ok: false, reason: 'not_prose' };

  const haystack = normalizeName(body);
  const names = evidenceNames(facts);
  if (type !== 'thank_you' && names.length > 0 && !names.some((name) => haystack.includes(normalizeName(name)))) {
    return { ok: false, reason: 'missing_evidence' };
  }

  const letterContext: CoverLetterContext = {
    listingOrganization: context.organization ?? null,
    listingTitle: [context.role, context.listingTitle].filter(Boolean).join('\n') || null,
    listingDescription: context.listingDescription ?? null,
  };
  if (TARGETED_WRITING_TYPES.includes(type)) {
    const targets = [statedListingName(context.organization), context.role, context.listingTitle].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 1,
    );
    if (targets.length > 0 && !targets.some((target) => haystack.includes(normalizeName(target)) || namesOverlap(body, target))) {
      return { ok: false, reason: 'missing_target' };
    }
  }

  const roles = confirmedExperience(facts);
  const hasCurrentRole = roles.some((role) => role.tenure === 'current');
  if (!hasCurrentRole && hasCurrentLanguage(body)) return { ok: false, reason: 'current_role_unsupported' };
  for (const role of roles) {
    if (role.tenure === 'current') continue;
    if (nearCurrentLanguage(body, role.company)) return { ok: false, reason: 'ended_role_described_as_current' };
  }

  const target = statedListingName(context.organization);
  const targetIsPastEmployer = target ? roles.some((role) => namesOverlap(role.company, target)) : false;
  if (target && !targetIsPastEmployer && pastEmploymentOf(body, target)) {
    return { ok: false, reason: 'target_as_past_employer' };
  }
  const allowed = allowedOrganizations(facts, letterContext);
  for (const mention of employerMentions(body)) {
    const inPastFacts = roles.some((role) => namesOverlap(role.company, mention));
    const inTarget = listingMentionAllowed(letterContext, mention);
    if (!inPastFacts && inTarget && pastEmploymentOf(body, mention)) return { ok: false, reason: 'target_as_past_employer' };
    const inAllowed = allowed.some((name) => namesOverlap(mention, name));
    if (!inAllowed && !inTarget) return { ok: false, reason: 'unsupported_employer', claim: mention };
  }

  const years = allowedYears(facts);
  const interviewYear = context.interviewDate?.slice(0, 4);
  if (interviewYear) years.add(interviewYear);
  for (const match of body.matchAll(/\b((?:19|20)\d{2})\b/g)) {
    const year = match[1];
    if (year && !years.has(year)) return { ok: false, reason: 'unsupported_date', claim: year };
  }

  const numbers = allowedNumbers(facts, context);
  for (const match of body.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const token = match[0].replace(',', '.');
    if (/^(?:19|20)\d{2}$/.test(token)) continue;
    if (!numbers.has(token) && !numbers.has(String(Number(token)))) {
      return { ok: false, reason: 'unsupported_number', claim: match[0] };
    }
  }

  for (const name of salutationNames(body)) {
    if (isGenericSalutation(name)) continue;
    if (context.contactName && namesOverlap(name, context.contactName)) continue;
    if (context.contactName && normalizeName(context.contactName).split(' ').includes(normalizeName(name))) continue;
    return { ok: false, reason: 'unsupported_contact', claim: name };
  }

  const confirmed = facts.filter((fact) => fact.confirmation === 'confirmed');
  const confirmedIds = new Set(confirmed.map((fact) => fact.id));
  const used: string[] = [];
  const seen = new Set<string>();
  for (const id of parts.factIds ?? []) {
    if (!confirmedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    used.push(id);
  }
  // Provenance also records any confirmed employer, school, or skill the text names.
  for (const fact of confirmed) {
    if (seen.has(fact.id)) continue;
    const label = fieldText(fact.value.company) ?? fieldText(fact.value.institution) ?? fieldText(fact.value.name);
    if (!label || !haystack.includes(normalizeName(label))) continue;
    seen.add(fact.id);
    used.push(fact.id);
  }
  return { ok: true, body, factIds: used };
}

/** A targeted draft needs a listing or the person's own organization or role. */
export function proseReady(
  type: ProseWritingType,
  facts: ResumeFactInput[],
  target: { listing: boolean; context: WritingContext },
): { ok: true } | { ok: false; field: string; reason: string } {
  if (writingBody(facts).body.length === 0) return { ok: false, field: 'facts', reason: 'no_confirmed_facts' };
  if (TARGETED_WRITING_TYPES.includes(type) && !target.listing && !target.context.organization && !target.context.role) {
    return { ok: false, field: 'context', reason: 'missing_target' };
  }
  return { ok: true };
}
