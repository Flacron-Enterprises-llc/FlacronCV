import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ratchet against user-visible English that is not going through next-intl.
 *
 * WHY THIS EXISTS. The product ships in six languages, but untranslated strings
 * do not fail the build or the type check — they simply render in English to
 * every user. Whole components had drifted that way unnoticed (the paywall
 * modal, the CV design panel, the landing-page mockup). A reviewer reading a
 * diff will not catch the next one either.
 *
 * This is a HEURISTIC, so it works as an allowlist ratchet rather than an
 * absolute rule: the files below are reviewed exceptions, and everything else
 * must stay clean. If this test fails, the honest fix is almost always to move
 * the string into `common.json` for all six locales — not to extend the list.
 */

const ROOT = join(__dirname, '..');

/** Reviewed exceptions. Each needs a reason; do not add without one. */
const ALLOWED: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /components[\\/]landing[\\/]Hero\.tsx$/,
    reason:
      'Sample CV *content* inside the product mockup ("Alex Johnson", "Google", "BSc Computer Science"). ' +
      'The surrounding chrome IS translated; a localised fake person would be odd, not better.',
  },
  {
    pattern: /components[\\/]ui[\\/]ErrorBoundary\.tsx$/,
    reason:
      'Untranslated twin, now unreferenced — both layouts use components/ErrorBoundary, which is ' +
      'translated. Kept on purpose (release-freeze note preserves both); its copy cannot render.',
  },
  {
    pattern: /cover-letters[\\/]\[id\][\\/]page\.tsx$/,
    reason: 'Font family names ("Times New Roman") are proper nouns and must not be translated.',
  },
  {
    pattern: /\(auth\)[\\/].*[\\/]page\.tsx$/,
    reason: 'placeholder="you@example.com" — an address-format example, understood in every locale.',
  },
  {
    pattern: /components[\\/]jobs[\\/]JobFormModal\.tsx$/,
    reason: 'placeholder="recruiter@company.com" — same address-format example.',
  },
];

const SKIP_FILE = /\.(test|spec)\.|[\\/]i18n[\\/]|[\\/]lib[\\/](seo|analytics)\./;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

/** Remove comments — English prose in a code comment is not a UI string. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

function looksLikeCopy(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (!/[a-z]/.test(t)) return false;
  if (/^[A-Z_]+$/.test(t)) return false;
  if (/^https?:|^\/|^#|^@|^\w+\.\w+$/.test(t)) return false;
  return (t.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length >= 2;
}

function findHardcoded(src: string): string[] {
  const clean = stripComments(src);
  const hits: string[] = [];
  for (const m of clean.matchAll(/>\s*([A-Z][^<>{}\n]{3,80})\s*</g)) {
    if (looksLikeCopy(m[1])) hits.push(m[1].trim());
  }
  for (const m of clean.matchAll(/\b(placeholder|title|aria-label|alt)\s*=\s*"([^"]{4,100})"/g)) {
    if (looksLikeCopy(m[2])) hits.push(`${m[1]}="${m[2]}"`);
  }
  return hits;
}

describe('no hardcoded user-visible English', () => {
  const offenders = walk(ROOT)
    .filter((f) => !ALLOWED.some((a) => a.pattern.test(f)))
    .map((f) => ({ file: f.replace(ROOT, 'src').replace(/\\/g, '/'), hits: findHardcoded(readFileSync(f, 'utf8')) }))
    .filter((r) => r.hits.length > 0);

  it('every component renders its copy through next-intl', () => {
    // Reported as file → strings so a failure names exactly what to translate.
    expect(offenders.map((o) => `${o.file}: ${o.hits.slice(0, 3).join(' | ')}`)).toEqual([]);
  });

  it('the allowlist stays small and justified', () => {
    // A growing list means the rule is being worked around rather than followed.
    expect(ALLOWED.length).toBeLessThanOrEqual(6);
    for (const a of ALLOWED) expect(a.reason.length).toBeGreaterThan(30);
  });
});
