/**
 * Message formatting: the subset of ICU MessageFormat the website's strings use.
 *
 *   "Hello {name}"                                       → placeholder
 *   "{count, plural, =0 {None} one {# CV} other {# CVs}}" → plural (# = the number)
 *   "{kind, select, cv {CV} other {letter}}"             → select
 *
 * Plural categories come from `Intl.PluralRules` when the engine has it, and
 * otherwise from the CLDR rules below for the six shipped languages (Hermes
 * does not guarantee `Intl.PluralRules`). Arabic uses zero/one/two/few/many/
 * other; a branch that is not present falls back to `other`.
 *
 * Not supported (keep strings simple): apostrophe quoting, `offset:`,
 * `selectordinal`, number/date skeletons inside the message. Format numbers and
 * dates with intl.ts and pass the result as a string param.
 *
 * Never throws: a malformed message is returned as written.
 */

export type MessageParams = Record<string, string | number | null | undefined>;

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** CLDR cardinal rules (integers and decimals as the languages need them). */
function builtinPluralCategory(language: string, n: number): PluralCategory {
  const abs = Math.abs(n);
  const isInt = Number.isInteger(abs);
  switch (language) {
    case 'ar': {
      if (abs === 0) return 'zero';
      if (abs === 1) return 'one';
      if (abs === 2) return 'two';
      if (!isInt) return 'other';
      const mod100 = abs % 100;
      if (mod100 >= 3 && mod100 <= 10) return 'few';
      if (mod100 >= 11 && mod100 <= 99) return 'many';
      return 'other';
    }
    case 'fr':
      // French: 0 and 1 (and 1.5) are singular.
      return abs < 2 ? 'one' : 'other';
    default:
      // en, es, de, ur: exactly 1 (integer) is singular.
      return abs === 1 && isInt ? 'one' : 'other';
  }
}

const pluralRulesCache = new Map<string, Intl.PluralRules | null>();

export function pluralCategory(locale: string, n: number): PluralCategory {
  let rules = pluralRulesCache.get(locale);
  if (rules === undefined) {
    try {
      rules = typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function'
        ? new Intl.PluralRules(locale)
        : null;
    } catch {
      rules = null;
    }
    pluralRulesCache.set(locale, rules);
  }
  if (rules) {
    try {
      return rules.select(n) as PluralCategory;
    } catch {
      /* fall through to the built-in rules */
    }
  }
  return builtinPluralCategory(locale.split('-')[0].toLowerCase(), n);
}

/** Test seam: the built-in table, to compare against Intl.PluralRules. */
export const __builtinPluralCategory = builtinPluralCategory;

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parses `=0 {…} one {…} other {…}` into selector → branch text. */
function parseBranches(body: string): Map<string, string> | null {
  const branches = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    const start = i;
    while (i < body.length && body[i] !== '{' && !/\s/.test(body[i])) i++;
    const selector = body.slice(start, i);
    while (i < body.length && /\s/.test(body[i])) i++;
    if (body[i] !== '{' || !selector) return null;
    const close = matchBrace(body, i);
    if (close < 0) return null;
    branches.set(selector, body.slice(i + 1, close));
    i = close + 1;
  }
  return branches.size > 0 ? branches : null;
}

function formatArgument(inner: string, locale: string, params: MessageParams, pound: string | null): string | null {
  const firstComma = inner.indexOf(',');
  if (firstComma < 0) {
    const name = inner.trim();
    const value = params[name];
    return value === undefined || value === null ? null : String(value);
  }
  const name = inner.slice(0, firstComma).trim();
  const rest = inner.slice(firstComma + 1);
  const secondComma = rest.indexOf(',');
  if (secondComma < 0) return null;
  const type = rest.slice(0, secondComma).trim();
  const branches = parseBranches(rest.slice(secondComma + 1));
  if (!branches) return null;
  const raw = params[name];

  if (type === 'plural') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (raw === undefined || raw === null || raw === '' || Number.isNaN(n)) return null;
    const branch =
      branches.get(`=${n}`) ?? branches.get(pluralCategory(locale, n)) ?? branches.get('other');
    return branch === undefined ? null : formatMessage(branch, locale, params, String(n));
  }
  if (type === 'select') {
    const key = raw === undefined || raw === null ? 'other' : String(raw);
    const branch = branches.get(key) ?? branches.get('other');
    return branch === undefined ? null : formatMessage(branch, locale, params, pound);
  }
  return null;
}

/**
 * Fills `{name}` placeholders and plural/select blocks. A placeholder whose
 * param is missing stays visible as `{name}` so the gap is noticed, not hidden.
 * `pound` is the plural number while formatting inside a plural branch.
 */
export function formatMessage(
  message: string,
  locale: string,
  params: MessageParams = {},
  pound: string | null = null,
): string {
  if (!message.includes('{') && (pound === null || !message.includes('#'))) return message;
  let out = '';
  let i = 0;
  while (i < message.length) {
    const ch = message[i];
    if (ch === '{') {
      const close = matchBrace(message, i);
      if (close < 0) return out + message.slice(i);
      const whole = message.slice(i, close + 1);
      let formatted: string | null = null;
      try {
        formatted = formatArgument(message.slice(i + 1, close), locale, params, pound);
      } catch {
        formatted = null;
      }
      out += formatted ?? whole;
      i = close + 1;
    } else if (ch === '#' && pound !== null) {
      out += pound;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * Names of every argument in a message, with their kind — used by the tests to
 * check translations keep the same placeholders as English.
 */
export function messageArguments(message: string): string[] {
  const found = new Set<string>();
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      if (text[i] === '{') {
        const close = matchBrace(text, i);
        if (close < 0) return;
        const inner = text.slice(i + 1, close);
        const comma = inner.indexOf(',');
        if (comma < 0) {
          found.add(`{${inner.trim()}}`);
        } else {
          const name = inner.slice(0, comma).trim();
          const rest = inner.slice(comma + 1);
          const second = rest.indexOf(',');
          const type = (second < 0 ? rest : rest.slice(0, second)).trim();
          found.add(`{${name}, ${type}}`);
          const branches = second < 0 ? null : parseBranches(rest.slice(second + 1));
          branches?.forEach((branch) => walk(branch));
        }
        i = close + 1;
      } else {
        i++;
      }
    }
  };
  walk(message);
  return [...found].sort();
}
