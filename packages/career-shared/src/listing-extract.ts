import { EMPTY_LISTING_DETAILS } from './opportunities';
import type { ListingArrangement, ListingCompensation, ListingDetails, ListingSchedule, ListingSeniority, OpportunityCategory } from './opportunities';

/**
 * A pasted listing shorter than this is not a vacancy ("abc", a title alone):
 * nothing can be matched against it and an action pack built on it is empty.
 */
export const MIN_LISTING_TEXT = 40;

export type ListingSponsorship = 'unknown' | 'stated_yes' | 'stated_no';

export interface ExtractedListing {
  title: string;
  /** null when the paste does not name the employer in a recognised way. */
  organization: string | null;
  locations: string[];
  compensation: ListingCompensation;
  sponsorship: ListingSponsorship;
  /** YYYY-MM-DD from an explicit deadline sentence or label; null when not stated. */
  deadline: string | null;
  /** YYYY-MM-DD from an explicit posted/published label; null when not stated. */
  publishedAt: string | null;
  /** The listing's own words limiting where a remote worker may live ("US residents only"). */
  remoteRestriction: string | null;
  schedule: ListingSchedule | null;
  arrangement: ListingArrangement | null;
  seniority: ListingSeniority | null;
  /** A category the title states plainly ("Summer internship"); null leaves the caller's choice. */
  category: OpportunityCategory | null;
  details: ListingDetails;
}

const NO_PAY: ListingCompensation = { minimum: null, maximum: null, currency: null, period: null };

const MAX_FIELD = 120;

/** "Company: X", "Employer - X", "Organisation: X" (en/fr/de/es labels). */
const ORGANIZATION_LABEL =
  /^\s*(?:company|employer|organi[sz]ation|hiring (?:company|organi[sz]ation)|entreprise|employeur|soci[ée]t[ée]|organisme|unternehmen|arbeitgeber|firma|empresa|empleador)\s*[:\-–—]\s*(.+)$/i;

/** "Location: X", "Based in: X", "Lieu : X", "Standort: X", "Ubicación: X". */
const LOCATION_LABEL =
  /^\s*(?:location|locations|job location|work location|based in|office|lieu|localisation|emplacement|standort|arbeitsort|ort|ubicaci[óo]n|lugar)\s*[:\-–—]\s*(.+)$/i;

/** Title lines such as "Data Analyst at Northwind Traders" or "Data Analyst - Northwind Traders, Montreal". */
const TITLE_AT = /^(.{2,80}?)\s+(?:at|@|chez|bei|en)\s+([A-Z0-9][^,;|()\n]{1,80})(?:[,;|(]\s*(.+?)\)?)?\s*$/;

/** Words that make a "location" capture a sentence instead of a place. */
const SENTENCE_WORDS = /\b(?:we|you|our|your|will|must|are|is|the role|responsib|experience|required)\b/i;

/** "About us", "Join the team": the word after the verb is not an employer. */
const NOT_A_NAME = /^(?:us|we|the|this|our|a|an|you|team)\b/i;

/** "Montreal, QC" / "Lyon, France" closing the first line, after a dash or in brackets. */
const TRAILING_PLACE = /(?:\s[-–—|]\s|\()\s*([A-Z][\p{L}.' -]{1,40},\s*[A-Z][\p{L}.' -]{1,30})\)?\s*$/u;

const WORK_MODES: Array<[RegExp, string]> = [
  [/\b(?:fully\s+)?remote\b|\bt[ée]l[ée]travail\b|\bremoto\b/i, 'Remote'],
  [/\bhybrid\b|\bhybride\b|\bh[íi]brido\b/i, 'Hybrid'],
];

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR' };
const CURRENCY_CODES = ['USD', 'CAD', 'AUD', 'NZD', 'GBP', 'EUR', 'CHF', 'INR', 'PKR', 'AED', 'SAR', 'JPY', 'MXN'];
/** "C$", "CA$", "A$", "US$" name the currency more precisely than the bare symbol. */
const PREFIXED_DOLLAR: Record<string, string> = { C: 'CAD', CA: 'CAD', CAN: 'CAD', A: 'AUD', AU: 'AUD', US: 'USD', NZ: 'NZD' };

const PERIODS: Array<[RegExp, string]> = [
  [/\b(?:per|an|a|\/)\s*h(?:ou)?r\b|\bhourly\b|\/\s*h\b|\bde l'heure\b|\bpro stunde\b|\bpor hora\b/i, 'hour'],
  [/\b(?:per|a|\/)\s*(?:day|diem)\b|\bdaily\b/i, 'day'],
  [/\b(?:per|a|\/)\s*(?:week|wk)\b|\bweekly\b/i, 'week'],
  [/\b(?:per|a|\/)\s*(?:month|mo)\b|\bmonthly\b|\bpar mois\b|\bmonatlich\b|\bal mes\b/i, 'month'],
  [/\b(?:per|a|\/)\s*(?:year|yr|annum)\b|\bannual(?:ly)?\b|\byearly\b|\bpar an\b|\bj[äa]hrlich\b|\bal a[ñn]o\b/i, 'year'],
];

/**
 * Reads the fields a pasted vacancy states plainly. Deterministic and
 * conservative: a field is filled only from an explicit label, a
 * "Title at Employer" first line, a currency amount, or a sponsorship
 * sentence. Anything else stays unknown rather than guessed, because the
 * matcher and the action pack treat these fields as facts about the listing.
 */
export function extractListingFields(text: string): ExtractedListing {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  const first = lines[0] ?? '';

  let title = first;
  let organization: string | null = null;
  const locations: string[] = [];

  const titleAt = first.match(TITLE_AT);
  if (titleAt && !SENTENCE_WORDS.test(titleAt[1] ?? '')) {
    title = (titleAt[1] ?? first).trim();
    organization = cleanName(titleAt[2]);
    const place = cleanPlace(titleAt[3]);
    if (place) locations.push(place);
  }

  const trailing = title.match(TRAILING_PLACE);
  if (trailing) {
    const place = cleanPlace(trailing[1]);
    if (place) {
      if (!locations.includes(place)) locations.push(place);
      title = title.slice(0, trailing.index).trim();
    }
  }

  for (const line of lines) {
    const org =line.match(ORGANIZATION_LABEL);
    if (org && organization === null) organization = cleanName(org[1]);
    const place = line.match(LOCATION_LABEL);
    if (place) {
      for (const part of (place[1] ?? '').split(/\s*[;|/]\s*/)) {
        const clean = cleanPlace(part);
        if (clean && !locations.includes(clean)) locations.push(clean);
      }
    }
  }

  if (organization === null) {
    // "Northwind Traders is hiring", "Join Northwind Traders", "About Northwind Traders".
    const name = String.raw`([A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*){0,4})`;
    const patterns = [new RegExp(`^(?:[Jj]oin|[Aa]bout) ${name}\\b`), new RegExp(`^${name} is hiring\\b`)];
    for (const line of lines) {
      const sentence = patterns.map((pattern) => line.match(pattern)).find(Boolean);
      const clean = sentence ? cleanName(sentence[1]) : null;
      if (clean) {
        organization = clean;
        break;
      }
    }
  }

  for (const [pattern, label] of WORK_MODES) {
    if (pattern.test(text) && !locations.some((place) => place.toLowerCase().includes(label.toLowerCase()))) {
      locations.push(label);
    }
  }

  return {
    title: title.slice(0, 300),
    organization,
    locations: locations.slice(0, 5),
    compensation: extractCompensation(text),
    sponsorship: extractSponsorship(text),
    deadline: extractDeadline(lines),
    publishedAt: extractPublishedAt(lines),
    remoteRestriction: extractRemoteRestriction(text),
    schedule: extractSchedule(text),
    arrangement: extractArrangement(text),
    seniority: extractSeniority(title),
    category: extractCategory(first),
    details: extractDetails(lines),
  };
}

function cleanName(raw: string | undefined): string | null {
  const value = (raw ?? '').replace(/[.。]+$/, '').trim();
  if (value.length < 2 || value.length > MAX_FIELD) return null;
  if (value.toLowerCase() === 'unstated') return null;
  if (SENTENCE_WORDS.test(value) || NOT_A_NAME.test(value)) return null;
  return value;
}

function cleanPlace(raw: string | undefined): string | null {
  // Trailing full stops go; a trailing ")" only when it has no opening
  // bracket, so "Manchester (hybrid, 3 days)" keeps its closing bracket.
  let value = (raw ?? '').replace(/[.。]+$/, '').trim();
  while (value.endsWith(')') && (value.match(/\(/g) ?? []).length < (value.match(/\)/g) ?? []).length) {
    value = value.slice(0, -1).trim();
  }
  if (value.length < 2 || value.length > MAX_FIELD) return null;
  if (SENTENCE_WORDS.test(value)) return null;
  // A pay figure after the comma ("..., $80k") is not a place.
  if (/\d{2,}/.test(value) && /[$£€¥₹]|\b(?:k|usd|cad|eur|gbp)\b/i.test(value)) return null;
  return value;
}

/**
 * One amount or a range with an explicit currency. A bare number without a
 * currency ("5 years", "2026") is never read as pay.
 */
export function extractCompensation(text: string): ListingCompensation {
  const amount = String.raw`(\d{1,3}(?:[,\s.]\d{3})+|\d+(?:[.,]\d+)?)\s*([kK])?`;
  const symbol = String.raw`(?:(C|CA|CAN|A|AU|US|NZ)?\$|£|€|¥|₹)`;
  const code = `(?:${CURRENCY_CODES.join('|')})`;
  const range = String.raw`\s*(?:-|–|—|to|à|bis|a)\s*`;
  const patterns = [
    // $80,000 - $95,000 / C$80k–95k / €50.000 bis €60.000
    new RegExp(`(${symbol})\\s*${amount}(?:${range}(?:${symbol})?\\s*${amount})?(?:\\s*(${code}))?`, 'i'),
    // 80,000 - 95,000 CAD / 50 000 € / 45k EUR
    new RegExp(`${amount}(?:${range}${amount})?\\s*(${code}|€|£|\\$)`, 'i'),
    // CAD 80,000 - 95,000
    new RegExp(`(${code})\\s*${amount}(?:${range}${amount})?`, 'i'),
  ];

  for (const [index, pattern] of patterns.entries()) {
    const found = text.match(pattern);
    if (!found) continue;
    let currency: string | null = null;
    let first: string | undefined;
    let firstK: string | undefined;
    let second: string | undefined;
    let secondK: string | undefined;
    if (index === 0) {
      const [, sym, prefix, a, ak, , b, bk, trailingCode] = found;
      currency = trailingCode?.toUpperCase() ?? (prefix ? PREFIXED_DOLLAR[prefix.toUpperCase()] ?? null : null) ?? CURRENCY_SYMBOLS[(sym ?? '').replace(/^[A-Z]+/i, '')] ?? null;
      [first, firstK, second, secondK] = [a, ak, b, bk];
    } else if (index === 1) {
      const [, a, ak, b, bk, cur] = found;
      currency = CURRENCY_SYMBOLS[cur ?? ''] ?? cur?.toUpperCase() ?? null;
      [first, firstK, second, secondK] = [a, ak, b, bk];
    } else {
      const [, cur, a, ak, b, bk] = found;
      currency = cur?.toUpperCase() ?? null;
      [first, firstK, second, secondK] = [a, ak, b, bk];
    }
    const minimum = parseAmount(first, firstK ?? (second === undefined ? undefined : secondK));
    const maximum = second === undefined ? null : parseAmount(second, secondK ?? firstK);
    if (minimum === null) continue;
    // A figure below 10 with no "k" is a count, not pay ("$5 off", "2 days").
    if (minimum < 10 && maximum === null) continue;
    const tail = text.slice((found.index ?? 0), (found.index ?? 0) + found[0].length + 40);
    // No period is assumed when the listing does not state one.
    const period = PERIODS.find(([periodPattern]) => periodPattern.test(tail))?.[1] ?? null;
    return {
      minimum,
      maximum: maximum !== null && maximum >= minimum ? maximum : null,
      currency,
      period,
    };
  }
  return { ...NO_PAY };
}

function parseAmount(raw: string | undefined, thousands: string | undefined): number | null {
  if (!raw) return null;
  // "80,000", "80.000" and "80 000" are thousands separators; "17.50" and "17,50" are decimals.
  const grouped = /^\d{1,3}(?:[,\s.]\d{3})+$/.test(raw);
  const normalized = grouped ? raw.replace(/[,\s.]/g, '') : raw.replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const scaled = thousands ? value * 1000 : value;
  return Math.round(scaled);
}

/**
 * Only an explicit sentence counts. "Must be authorized to work in Canada"
 * does not say sponsorship is refused, so it stays unknown.
 */
export function extractSponsorship(text: string): ListingSponsorship {
  const lower = text.toLowerCase();
  if (
    /\b(?:no|not|unable to|cannot|can't|can not|will not|won't|does not|do not)\s+(?:offer\s+|provide\s+)?(?:visa\s+)?sponsor(?:ship)?\b/.test(lower) ||
    /\bsponsorship\s+(?:is\s+)?(?:not\s+(?:available|offered|provided)|unavailable)\b/.test(lower) ||
    /\bwithout\s+(?:visa\s+)?sponsorship\b/.test(lower)
  ) {
    return 'stated_no';
  }
  if (
    /\b(?:visa\s+)?sponsorship\s+(?:is\s+)?(?:available|offered|provided|possible)\b/.test(lower) ||
    /\b(?:we|will|can)\s+(?:offer\s+|provide\s+)?sponsor\b/.test(lower) ||
    /\b(?:offers?|provides?)\s+(?:visa\s+)?sponsorship\b/.test(lower)
  ) {
    return 'stated_yes';
  }
  return 'unknown';
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, janvier: 1, januar: 1, enero: 1,
  february: 2, feb: 2, fevrier: 2, février: 2, februar: 2, febrero: 2,
  march: 3, mar: 3, mars: 3, märz: 3, marz: 3, marzo: 3,
  april: 4, apr: 4, avril: 4, abril: 4,
  may: 5, mai: 5, mayo: 5,
  june: 6, jun: 6, juin: 6, juni: 6, junio: 6,
  july: 7, jul: 7, juillet: 7, juli: 7, julio: 7,
  august: 8, aug: 8, août: 8, aout: 8, agosto: 8,
  september: 9, sep: 9, sept: 9, septembre: 9, septiembre: 9,
  october: 10, oct: 10, octobre: 10, oktober: 10, octubre: 10,
  november: 11, nov: 11, novembre: 11, noviembre: 11,
  december: 12, dec: 12, décembre: 12, decembre: 12, dezember: 12, diciembre: 12,
};

/**
 * One unambiguous date in a phrase: ISO (2026-12-01), "1 December 2026" or
 * "December 1, 2026". A numeric "01/12/2026" is skipped because day and month
 * order differ by country, and a wrong deadline is worse than none.
 */
export function parseStatedDate(phrase: string): string | null {
  const iso = phrase.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = phrase.match(/(?:^|[^\p{L}\d])(\d{1,2})(?:st|nd|rd|th|er)?\.?\s+(?:de\s+)?(\p{L}{3,10})\.?,?\s+(?:de\s+)?(\d{4})(?!\d)/u);
  if (dayFirst) {
    const month = MONTHS[(dayFirst[2] ?? '').toLowerCase()];
    if (month) return validDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }
  const monthFirst = phrase.match(/(?:^|[^\p{L}])(\p{L}{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/u);
  if (monthFirst) {
    const month = MONTHS[(monthFirst[1] ?? '').toLowerCase()];
    if (month) return validDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

const DEADLINE_CUE =
  /\b(?:deadline|closing date|closes(?: on)?|apply by|applications? (?:close|due|must be received)(?: by| on)?|apply before|date limite|candidater avant|bewerbungsschluss|bewerbungsfrist|fecha l[íi]mite|plazo)/i;
const PUBLISHED_CUE = /\b(?:posted(?: on)?|date posted|published(?: on)?|publication date|publi[ée]e? le|ver[öo]ffentlicht(?: am)?|publicad[oa](?: el)?)/i;

export function extractDeadline(lines: readonly string[]): string | null {
  return dateAfterCue(lines, DEADLINE_CUE);
}

export function extractPublishedAt(lines: readonly string[]): string | null {
  return dateAfterCue(lines, PUBLISHED_CUE);
}

function dateAfterCue(lines: readonly string[], cue: RegExp): string | null {
  for (const line of lines) {
    const found = line.match(cue);
    if (!found) continue;
    const start = (found.index ?? 0) + found[0].length;
    const date = parseStatedDate(line.slice(start, start + 60));
    if (date) return date;
  }
  return null;
}

/**
 * Remote does not mean worldwide (spec section 2). Only an explicit limit is
 * read, and it is kept in the listing's own words.
 */
export function extractRemoteRestriction(text: string): string | null {
  const patterns = [
    /(?:^|[^\p{L}])((?:[A-Z][\p{L}.]*\s){1,4}(?:residents|citizens)\sonly)(?![\p{L}])/u,
    /\b((?:remote|work from home|telecommut\w*)[^.\n]{0,40}?\b(?:only|restricted to|limited to|open to (?:candidates|applicants|residents) (?:in|of|based in))\b[^.\n]{0,60})/i,
    /\b(must (?:reside|live|be based|be located|be a resident) (?:in|of) [^.\n]{2,60})/i,
    /\b(only (?:open|available) to (?:candidates|applicants|residents|people) (?:in|of|based in|located in|living in) [^.\n]{2,60})/i,
  ];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found?.[1]) return found[1].replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  return null;
}

const SCHEDULE_WORDS: Array<[RegExp, ListingSchedule]> = [
  [/\bfull[\s-]?time\b|\btemps plein\b|\bvollzeit\b|\btiempo completo\b/i, 'full_time'],
  [/\bpart[\s-]?time\b|\btemps partiel\b|\bteilzeit\b|\bmedio tiempo\b|\btiempo parcial\b/i, 'part_time'],
  [/\btemporary\b|\bseasonal\b|\bbefristet\b|\btemporal\b/i, 'temporary'],
  [/\bcontract(?:or)? (?:role|position|basis)\b|\bfixed[\s-]term\b|\b\d+[\s-]month contract\b|\bcontrat à durée déterminée\b|\bcdd\b/i, 'contract'],
];

/** One schedule only when exactly one is stated; two different ones stay unknown. */
export function extractSchedule(text: string): ListingSchedule | null {
  const found = SCHEDULE_WORDS.filter(([pattern]) => pattern.test(text)).map(([, value]) => value);
  return found.length === 1 ? (found[0] ?? null) : null;
}

const ONSITE = /\bon[\s-]?site\b|\bin[\s-]office\b|\bsur site\b|\bvor ort\b|\bpresencial\b/i;

export function extractArrangement(text: string): ListingArrangement | null {
  if (/\bhybrid\b|\bhybride\b|\bh[íi]brido\b/i.test(text)) return 'hybrid';
  if (/\b(?:not|no|non)[\s-]remote\b/i.test(text)) return ONSITE.test(text) ? 'onsite' : null;
  if (/\b(?:fully\s+)?remote\b|\bt[ée]l[ée]travail\b|\bremoto\b/i.test(text)) return 'remote';
  if (ONSITE.test(text)) return 'onsite';
  return null;
}

/** From the title only. "Mid" is never inferred: a title without a level does not state one. */
export function extractSeniority(title: string): ListingSeniority | null {
  if (/\b(?:chief|vp|vice president|head of|director|directrice|directeur)\b/i.test(title)) return 'executive';
  if (/\b(?:lead|principal|staff)\b/i.test(title)) return 'lead';
  if (/\b(?:senior|sr)\b/i.test(title)) return 'senior';
  if (/\b(?:junior|jr|entry[\s-]level|graduate|intern|internship|trainee|apprentice|stagiaire|praktikant)\b/i.test(title)) return 'entry';
  return null;
}

const CATEGORY_WORDS: Array<[RegExp, OpportunityCategory]> = [
  [/\bapprenticeship\b|\bapprentice\b|\bapprentissage\b|\bausbildung\b/i, 'apprenticeship'],
  [/\binternship\b|\bintern\b|\bpraktikum\b|\bpr[áa]cticas\b/i, 'internship'],
  [/\bgraduate (?:programme|program|scheme|trainee)\b/i, 'graduate_program'],
  [/\bscholarship\b|\bbourse d'[ée]tudes\b|\bstipendium\b|\bbeca\b/i, 'scholarship'],
  [/\bfellowship\b/i, 'fellowship'],
  [/\b(?:career|job|jobs|recruitment) fair\b|\bhiring event\b|\bsalon de l'emploi\b|\bjobmesse\b|\bferia de empleo\b/i, 'career_fair'],
  [/\bvolunteer\b|\bb[ée]n[ée]vole\b|\bvoluntari[oa]\b/i, 'volunteer'],
  [/\bfreelance\b|\bfreelancer\b/i, 'freelance'],
  [/\b(?:funded|free) training\b|\bbootcamp\b/i, 'funded_training'],
  [/\bcertification\b/i, 'certification'],
];

/** A category from the first line only, so a body that mentions "internship" in passing changes nothing. */
export function extractCategory(firstLine: string): OpportunityCategory | null {
  return CATEGORY_WORDS.find(([pattern]) => pattern.test(firstLine))?.[1] ?? null;
}

const DETAIL_LABELS: Array<[RegExp, keyof ListingDetails]> = [
  [/^\s*(?:stipend|allowance|bursary|indemnit[ée] de stage|gratification|verg[üu]tung)\s*[:\-–—]\s*(.+)$/i, 'stipend'],
  [/^\s*(?:student eligibility|eligible students|open to students)\s*[:\-–—]\s*(.+)$/i, 'studentEligibility'],
  [/^\s*(?:funding|award|award amount|financement|montant de la bourse|f[öo]rderung|financiaci[óo]n)\s*[:\-–—]\s*(.+)$/i, 'funding'],
  [/^\s*(?:scope|project scope|deliverables)\s*[:\-–—]\s*(.+)$/i, 'clientScope'],
  [/^\s*(?:duration|length|commitment|dur[ée]e|dauer|duraci[óo]n)\s*[:\-–—]\s*(.+)$/i, 'duration'],
  [/^\s*(?:compensation basis|payment basis|budget type|rate type)\s*[:\-–—]\s*(.+)$/i, 'compensationBasis'],
  [/^\s*(?:event date|date of event|fair date|date de l'[ée]v[ée]nement)\s*[:\-–—]\s*(.+)$/i, 'eventDate'],
  [/^\s*(?:registration|register|register at|inscription|anmeldung|registro)\s*[:\-–—]\s*(.+)$/i, 'registration'],
  [/^\s*(?:eligibility|who can apply|who may apply|[ée]ligibilit[ée]|voraussetzungen|requisitos)\s*[:\-–—]\s*(.+)$/i, 'eligibility'],
];

/** Category-specific facts, only from an explicit label. */
export function extractDetails(lines: readonly string[]): ListingDetails {
  const details: ListingDetails = { ...EMPTY_LISTING_DETAILS };
  for (const line of lines) {
    for (const [pattern, field] of DETAIL_LABELS) {
      const found = line.match(pattern);
      if (!found || details[field] !== null) continue;
      const value = (found[1] ?? '').trim().slice(0, 300);
      if (value.length === 0) continue;
      details[field] = field === 'eventDate' ? parseStatedDate(value) : value;
    }
  }
  return details;
}
