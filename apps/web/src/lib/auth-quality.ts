/**
 * Sign-up quality helpers shared (by copy) with the mobile app:
 * apps/mobile/src/lib/auth-quality.ts must stay identical in behaviour
 * (apps/mobile/src/lib/auth-quality-parity.test.ts compares them).
 *
 * - passwordStrength: a 0–4 score with the checks behind it, for the meter.
 * - suggestEmail: "name@gmial.com" → "name@gmail.com" for common providers.
 *
 * Pure functions, no dependencies, nothing leaves the device.
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordChecks {
  length: boolean;
  mixedCase: boolean;
  number: boolean;
  symbol: boolean;
}

export interface PasswordStrength {
  /** 0 too weak · 1 weak · 2 fair · 3 good · 4 strong */
  level: StrengthLevel;
  checks: PasswordChecks;
  /** A very common or obvious password (blocked at sign-up whatever its length). */
  common: boolean;
  /** Sign-up accepts it: at least 8 characters and not a common password. */
  acceptable: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

// Lower-cased; matched after stripping trailing digits/symbols ("password123!" → "password").
const COMMON = new Set([
  'password', 'passw0rd', 'pass', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbnm', 'letmein',
  'welcome', 'admin', 'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine',
  'princess', 'master', 'shadow', 'superman', 'batman', 'trustno1', 'abc', 'abcd', 'abcdef', 'abcdefg',
  'abcdefgh', 'changeme', 'secret', 'login', 'hello', 'freedom', 'whatever', 'computer', 'internet',
  'flacron', 'flacroncv', 'resume', 'curriculum',
]);

function isSequenceOrRepeat(value: string): boolean {
  if (value.length < 4) return false;
  if (/^(.)\1+$/.test(value)) return true; // aaaaaaaa
  const codes = [...value].map((c) => c.charCodeAt(0));
  const up = codes.every((c, i) => i === 0 || c === codes[i - 1]! + 1);
  const down = codes.every((c, i) => i === 0 || c === codes[i - 1]! - 1);
  return up || down; // 12345678, abcdefgh, 87654321
}

/** `context`: words that make a password guessable here (the person's name, email local part). */
export function passwordStrength(password: string, context: string[] = []): PasswordStrength {
  const checks: PasswordChecks = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const lower = password.toLowerCase();
  const core = lower.replace(/[\d\W_]+$/u, '').replace(/^[\d\W_]+/u, '');
  const personal = context
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3)
    .some((w) => lower.includes(w) && lower.replace(w, '').replace(/[\d\W_]/gu, '').length < 3);
  const common =
    password.length > 0 &&
    (COMMON.has(lower) || COMMON.has(core) || isSequenceOrRepeat(lower) || isSequenceOrRepeat(core) || personal);

  let level: StrengthLevel = 0;
  if (password.length > 0 && !common) {
    const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
    let score = 0;
    if (checks.length) score += 1;
    if (password.length >= 12) score += 1;
    if (variety >= 3) score += 1;
    if (variety === 4 || password.length >= 16) score += 1;
    if (!checks.length) score = Math.min(score, 1);
    level = Math.max(1, Math.min(4, score)) as StrengthLevel;
  }
  return { level, checks, common, acceptable: checks.length && !common };
}

const PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'aol.com',
  'protonmail.com', 'proton.me', 'msn.com', 'yandex.com', 'gmx.com', 'gmx.de', 'web.de', 'mail.com',
  'yahoo.co.uk', 'hotmail.co.uk', 'yahoo.fr', 'hotmail.fr', 'orange.fr', 'yahoo.es', 'me.com',
];

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      // Transposition ("gmial" → "gmail") counts as one edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * A corrected address when the domain looks like a typo of a common provider
 * ("gmial.com", "hotmail.con", "yahoo.cm"), otherwise null. Exact provider
 * domains and anything far from a known provider are left alone.
 */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (PROVIDERS.includes(domain) || !domain.includes('.')) return null;
  let best: { domain: string; d: number } | null = null;
  for (const candidate of PROVIDERS) {
    const d = distance(domain, candidate);
    if (d > 0 && d <= 2 && (!best || d < best.d)) best = { domain: candidate, d };
  }
  // Two edits only for longer domains, so short company domains are not "corrected".
  if (!best || (best.d === 2 && domain.length < 8)) return null;
  return `${local}@${best.domain}`;
}
