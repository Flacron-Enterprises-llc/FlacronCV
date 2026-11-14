import type { CareerPreferences } from './facts';
import { categoryFamily, foldText, listingLabel, placeMatchesLocations } from './opportunities';
import type { ListingArrangement, ListingCompensation, ListingSchedule, ListingSeniority } from './opportunities';

const DIMENSIONS = 32;

/**
 * Words a listing uses for framing, not requirements. Without this list a
 * comparison reports "looking", "team" or "hybrid" as skills the person lacks.
 */
const STOP = new Set([
  // Function words.
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were', 'will',
  'not', 'but', 'have', 'has', 'into', 'over', 'than', 'then', 'them', 'they', 'our', 'out', 'all',
  'any', 'can', 'its', 'who', 'what', 'when', 'where', 'which', 'about', 'also', 'able', 'across',
  'after', 'been', 'being', 'both', 'each', 'every', 'here', 'how', 'more', 'most', 'much', 'other',
  'own', 'some', 'such', 'very', 'well', 'would', 'could', 'should', 'may', 'might', 'there', 'their',
  'these', 'those', 'via', 'per', 'etc', 'while', 'within', 'without', 'just', 'like', 'only', 'one',
  'two', 'three', 'new', 'get', 'make', 'many', 'way', 'yourself', 'ourselves', 'whom', 'whose', 'why',
  // Vacancy framing.
  'job', 'jobs', 'role', 'roles', 'work', 'working', 'must', 'know', 'looking', 'seeking', 'seek',
  'build', 'building', 'team', 'teams', 'hybrid', 'remote', 'onsite', 'office', 'company', 'candidate',
  'candidates', 'ideal', 'join', 'joining', 'position', 'positions', 'opportunity', 'opportunities',
  'year', 'years', 'month', 'months', 'week', 'weeks', 'day', 'days', 'hour', 'hours', 'experience',
  'experienced', 'strong', 'skills', 'skill', 'ability', 'required', 'require', 'requires',
  'requirement', 'requirements', 'responsibilities', 'responsible', 'preferred', 'plus', 'including',
  'include', 'includes', 'using', 'use', 'apply', 'applicants', 'salary', 'pay', 'benefits', 'full',
  'time', 'part', 'location', 'based', 'help', 'helping', 'want', 'need', 'needs', 'great', 'good',
  'excellent', 'familiarity', 'knowledge', 'understanding', 'level', 'senior', 'junior', 'mid',
  'lead', 'please', 'send', 'contact', 'email', 'deadline', 'start', 'starting', 'date', 'immediately',
  'world', 'class', 'fast', 'paced', 'environment', 'culture', 'mission', 'values', 'passionate',
  'exciting', 'collaborate', 'collaborative', 'members', 'member', 'people', 'person', 'staff',
  'employee', 'employees', 'employer', 'hiring', 'hire', 'fictional', 'sample', 'example', 'demo',
]);

export type MatchFit = 'blocked' | 'none' | 'partial' | 'strong';

export interface MatchLine {
  factId: string;
  text: string;
  confirmed: boolean;
}

export interface MatchListing {
  status: 'open' | 'closed';
  deadline: string | null;
  title: string;
  description: string;
  locations: string[];
  payKnown: boolean;
  sponsorship: 'unknown' | 'stated_yes' | 'stated_no';
  /** The fields below are optional so older callers keep compiling; absent means not stated. */
  category?: string;
  arrangement?: ListingArrangement | null;
  schedule?: ListingSchedule | null;
  seniority?: ListingSeniority | null;
  remoteRestriction?: string | null;
  compensation?: ListingCompensation;
}

/** A certification fact from the profile, compared with credentials the listing requires. */
export interface MatchCredential {
  factId: string;
  name: string;
  confirmed: boolean;
}

export interface MatchReason {
  /** `credential_held`: a confirmed certification names a credential the listing requires. */
  code: 'confirmed_overlap' | 'credential_held';
  factId: string;
  token: string;
}

export interface MatchGap {
  /** `credential_missing`: the listing requires a credential no confirmed certification names. */
  code: 'not_in_facts' | 'credential_missing';
  token: string;
}

export const PREFERENCE_DIMENSIONS = ['location', 'arrangement', 'schedule', 'seniority', 'pay', 'remote_restriction'] as const;
export type PreferenceDimension = (typeof PREFERENCE_DIMENSIONS)[number];

/**
 * Personal preference fit, kept apart from qualification fit (spec section 2).
 * `check`: the listing states a limit the person must confirm themselves
 * (a remote-residency restriction); eligibility is never inferred.
 */
export interface PreferenceCheck {
  dimension: PreferenceDimension;
  status: 'meets' | 'conflict' | 'unknown' | 'not_set' | 'check';
  /** The listing's own value (place, level, pay figure, restriction words) when one is stated. */
  detail?: string;
}

/** The label a person reads. Never a hiring probability. */
export type MatchLabel = 'strong_fit' | 'possible_fit' | 'stretch' | 'expired';
export type MatchLabelReason =
  | 'skills_overlap'
  | 'little_overlap'
  | 'no_overlap'
  | 'credential_missing'
  | 'preference_conflict'
  | 'expired';

export interface MatchUnknown {
  code: 'pay' | 'sponsorship' | 'location' | 'unconfirmed';
  factId?: string;
  token?: string;
}

export interface MatchExplanation {
  fit: MatchFit;
  /** Cosine of the fake embeddings. Not a hiring probability and not an employer score. */
  overlap: number;
  reasons: MatchReason[];
  gaps: MatchGap[];
  unknowns: MatchUnknown[];
  preferenceFit: PreferenceCheck[];
  label: MatchLabel;
  labelReasons: MatchLabelReason[];
}

/** Deterministic stand-in for an embedding model. The same words always land in the same buckets. */
export function fakeEmbedding(text: string): number[] {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of tokens(text)) {
    let hash = 0;
    for (const char of token) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
    const bucket = hash % DIMENSIONS;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  return vector;
}

export function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * Explain one listing against one resume. Expired listings are blocked.
 * A word only on a draft fact stays unknown. Nothing here is a hire chance.
 */
export function explainMatch(
  listing: MatchListing,
  lines: MatchLine[],
  today: string,
  context: {
    preferences?: Pick<CareerPreferences, 'locations' | 'arrangements' | 'schedules' | 'seniority' | 'minimumPay'> | null;
    credentials?: readonly MatchCredential[];
  } = {},
): MatchExplanation {
  const listingTokens = tokens(`${listing.title} ${listing.description}`);
  const confirmed = new Set<string>();
  const reasons: MatchReason[] = [];
  const unknowns: MatchUnknown[] = [];
  for (const line of lines) {
    const words = tokens(line.text);
    if (line.confirmed) {
      for (const word of words) confirmed.add(word);
    }
    for (const word of words) {
      if (!listingTokens.includes(word)) continue;
      if (line.confirmed) {
        if (reasons.length < 8 && !reasons.some((reason) => reason.factId === line.factId && reason.token === word)) {
          reasons.push({ code: 'confirmed_overlap', factId: line.factId, token: word });
        }
      } else if (unknowns.length < 8 && !unknowns.some((item) => item.code === 'unconfirmed' && item.factId === line.factId && item.token === word)) {
        unknowns.push({ code: 'unconfirmed', factId: line.factId, token: word });
      }
    }
  }
  const gaps: MatchGap[] = [];
  for (const token of listingTokens) {
    if (confirmed.has(token)) continue;
    if (lines.some((line) => !line.confirmed && tokens(line.text).includes(token))) continue;
    if (gaps.some((gap) => gap.token === token)) continue;
    gaps.push({ code: 'not_in_facts', token });
    if (gaps.length >= 8) break;
  }
  // Pay and sponsorship are employment fields; a scholarship or an event is not "missing" them.
  const employment = listing.category === undefined || ['employment', 'early_career'].includes(categoryFamily(listing.category));
  if (employment && !listing.payKnown) unknowns.push({ code: 'pay' });
  if (employment && listing.sponsorship === 'unknown') unknowns.push({ code: 'sponsorship' });
  if (listing.locations.length === 0) unknowns.push({ code: 'location' });

  // Credentials the listing requires, against certification facts.
  for (const required of requiredCredentials(`${listing.title}\n${listing.description}`)) {
    const held = (context.credentials ?? []).find((credential) => credentialNames(credential.name, required));
    if (held?.confirmed) {
      if (!reasons.some((reason) => reason.code === 'credential_held' && reason.token === required)) {
        reasons.push({ code: 'credential_held', factId: held.factId, token: required });
      }
    } else if (held) {
      unknowns.push({ code: 'unconfirmed', factId: held.factId, token: required });
    } else if (!gaps.some((gap) => gap.code === 'credential_missing' && gap.token === required)) {
      gaps.unshift({ code: 'credential_missing', token: required });
    }
  }

  const confirmedText = lines
    .filter((line) => line.confirmed)
    .map((line) => line.text)
    .join(' ');
  const overlap = round(cosine(fakeEmbedding(confirmedText), fakeEmbedding(`${listing.title} ${listing.description}`)));
  const expired = listingLabel(listing.status, listing.deadline, today) === 'expired';
  const fit: MatchFit = expired ? 'blocked' : overlap === 0 ? 'none' : overlap < 0.35 ? 'partial' : 'strong';
  const preferenceFit = preferenceChecks(listing, context.preferences ?? null, employment);
  const { label, labelReasons } = matchLabel(fit, gaps, preferenceFit);
  return { fit, overlap, reasons, gaps, unknowns, preferenceFit, label, labelReasons };
}

/**
 * The label from stored parts, so a cached comparison made before labels
 * existed still reads correctly. Strong needs real overlap, no missing
 * required credential and no preference conflict; no overlap or a missing
 * credential is a stretch; the rest is a possible fit.
 */
export function matchLabel(
  fit: MatchFit,
  gaps: readonly MatchGap[],
  preferenceFit: readonly PreferenceCheck[],
): { label: MatchLabel; labelReasons: MatchLabelReason[] } {
  if (fit === 'blocked') return { label: 'expired', labelReasons: ['expired'] };
  const reasons: MatchLabelReason[] = [fit === 'strong' ? 'skills_overlap' : fit === 'partial' ? 'little_overlap' : 'no_overlap'];
  const credentialMissing = gaps.some((gap) => gap.code === 'credential_missing');
  const conflict = preferenceFit.some((check) => check.status === 'conflict');
  if (credentialMissing) reasons.push('credential_missing');
  if (conflict) reasons.push('preference_conflict');
  if (fit === 'none' || credentialMissing) return { label: 'stretch', labelReasons: reasons };
  if (fit === 'strong' && !conflict) return { label: 'strong_fit', labelReasons: reasons };
  return { label: 'possible_fit', labelReasons: reasons };
}

const SENIORITY_ORDER = ['entry', 'mid', 'senior', 'lead', 'executive'] as const;

/**
 * Personal preferences against what the listing states. Nothing is
 * converted or guessed: a different currency or pay period is unknown, and a
 * remote residency limit is something the person checks, not a verdict.
 */
export function preferenceChecks(
  listing: MatchListing,
  preferences: Pick<CareerPreferences, 'locations' | 'arrangements' | 'schedules' | 'seniority' | 'minimumPay'> | null,
  employment = true,
): PreferenceCheck[] {
  const checks: PreferenceCheck[] = [];
  const places = listing.locations.filter((place) => !/^(remote|hybrid)$/i.test(place.trim()));
  const arrangement = listing.arrangement ?? null;

  // Location: a remote listing meets a person who accepts remote work; otherwise a stated place must match.
  if (!preferences || preferences.locations.length === 0) {
    checks.push({ dimension: 'location', status: 'not_set' });
  } else if (arrangement === 'remote' && preferences.arrangements.includes('remote')) {
    checks.push({ dimension: 'location', status: 'meets', detail: 'remote' });
  } else if (places.length === 0) {
    checks.push({ dimension: 'location', status: 'unknown' });
  } else {
    const meets = preferences.locations.some((place) => placeMatchesLocations(place, places));
    checks.push({ dimension: 'location', status: meets ? 'meets' : 'conflict', detail: places.join('; ') });
  }

  if (!preferences || preferences.arrangements.length === 0) {
    checks.push({ dimension: 'arrangement', status: 'not_set' });
  } else if (arrangement === null) {
    checks.push({ dimension: 'arrangement', status: 'unknown' });
  } else {
    checks.push({ dimension: 'arrangement', status: preferences.arrangements.includes(arrangement) ? 'meets' : 'conflict', detail: arrangement });
  }

  if (listing.remoteRestriction) {
    checks.push({ dimension: 'remote_restriction', status: 'check', detail: listing.remoteRestriction });
  }

  if (!employment) return checks;

  const schedule = listing.schedule ?? (listing.category === 'internship' ? 'internship' : null);
  if (!preferences || preferences.schedules.length === 0) {
    checks.push({ dimension: 'schedule', status: 'not_set' });
  } else if (schedule === null) {
    checks.push({ dimension: 'schedule', status: 'unknown' });
  } else {
    const wanted = (preferences.schedules as readonly string[]).includes(schedule);
    checks.push({ dimension: 'schedule', status: wanted ? 'meets' : 'conflict', detail: schedule });
  }

  if (!preferences || preferences.seniority === null) {
    checks.push({ dimension: 'seniority', status: 'not_set' });
  } else if (!listing.seniority) {
    checks.push({ dimension: 'seniority', status: 'unknown' });
  } else {
    const distance = Math.abs(SENIORITY_ORDER.indexOf(listing.seniority) - SENIORITY_ORDER.indexOf(preferences.seniority));
    checks.push({ dimension: 'seniority', status: distance === 0 ? 'meets' : 'conflict', detail: listing.seniority });
  }

  const pay = listing.compensation;
  const top = pay ? (pay.maximum ?? pay.minimum) : null;
  if (!preferences || preferences.minimumPay === null) {
    checks.push({ dimension: 'pay', status: 'not_set' });
  } else if (!pay || top === null || pay.currency === null || pay.period === null) {
    checks.push({ dimension: 'pay', status: 'unknown' });
  } else if (pay.currency !== preferences.minimumPay.currency || pay.period !== preferences.minimumPay.period) {
    // Converting currency or period would invent a number the listing does not state.
    checks.push({ dimension: 'pay', status: 'unknown', detail: `${top} ${pay.currency}/${pay.period}` });
  } else {
    checks.push({ dimension: 'pay', status: top >= preferences.minimumPay.amount ? 'meets' : 'conflict', detail: `${top} ${pay.currency}/${pay.period}` });
  }
  return checks;
}

const CREDENTIAL_PATTERNS = [
  // "PMP certification required", "CPA license is required", "a valid CDL licence"
  /\b([A-Z][A-Za-z0-9+&-]{1,15}(?:\s[A-Z][A-Za-z0-9+&-]{1,15}){0,3})\s+(?:certification|certificate|licen[cs]e|accreditation)\b(?:\s+(?:is\s+)?(?:required|mandatory|needed))?/g,
  // "must hold a PMP", "must be a certified CPA". "Requires Python" is a skill, not a credential, so it is not read here.
  /\b(?:[Mm]ust (?:hold|possess)|[Mm]ust be (?:a |an )?(?:certified|licensed|registered))\s+(?:a |an )?(?:valid |active |current )?([A-Z][A-Za-z0-9+&-]{1,15}(?:\s[A-Z][A-Za-z0-9+&-]{1,15}){0,2})\b/g,
];

const NOT_A_CREDENTIAL = new Set(['a', 'an', 'the', 'this', 'our', 'your', 'valid', 'active', 'current', 'professional', 'relevant', 'industry', 'any', 'bachelor', 'degree', 'english', 'french']);

/** Credentials a listing names as required, in its own capitalisation. Conservative: only capitalised names next to a credential word. */
export function requiredCredentials(text: string): string[] {
  const found: string[] = [];
  for (const pattern of CREDENTIAL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const name = (match[1] ?? '').trim();
      const first = name.split(/\s+/)[0]?.toLowerCase() ?? '';
      if (name.length < 2 || NOT_A_CREDENTIAL.has(first)) continue;
      if (!found.some((item) => foldText(item) === foldText(name))) found.push(name);
      if (found.length >= 5) return found;
    }
  }
  return found;
}

function credentialNames(held: string, required: string): boolean {
  const a = ` ${foldText(held)} `;
  const b = ` ${foldText(required)} `;
  return a.trim().length > 0 && b.trim().length > 0 && (a.includes(b) || b.includes(a));
}

/** Words compared between a listing and facts: lower case, three letters or more, no stop word, no bare number. */
export function matchTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= 3 && !STOP.has(token) && !/^\d+$/.test(token),
  );
}

const tokens = matchTokens;

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
