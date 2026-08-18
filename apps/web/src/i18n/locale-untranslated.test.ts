import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No locale may quietly ship an English string.
 *
 * WHY THIS EXISTS. `locale-parity.test.ts` proves every locale has every KEY;
 * `no-hardcoded-english.test.ts` proves no English is hardcoded in TSX. Neither
 * catches the case in between: a key that exists in all six files but whose
 * value in `de` is still the English sentence. next-intl renders it happily and
 * the build is green, so a German user reads English and nothing anywhere says
 * so.
 *
 * That is not hypothetical. This test was written after finding four keys that
 * were English in ALL FIVE non-English locales — including the pricing page's
 * "/mo, billed yearly" and "Save {percent}% vs monthly", and both strings on the
 * 404 page. They had been that way since they were added.
 *
 * A failure here means: translate the value in the named locale. If the string
 * is genuinely meant to stay Latin — a brand, a product name, an example URL —
 * add it to ALLOWED below with a reason. Never silence it by changing `en`.
 */

const LOCALES = ['es', 'fr', 'de', 'ar', 'ur'] as const;
const LOCALES_DIR = join(__dirname, '..', '..', 'public', 'locales');

/**
 * Values that are legitimately identical to English in every locale.
 *
 * Each entry needs a reason. The bar: would a native reader consider it a
 * translation failure? A brand does not translate; a sentence does.
 */
const ALLOWED: Record<string, string> = {
  // Brands and proper nouns.
  'app.name': 'product name',
  'parent_company.product1_title': 'product name',
  'footer.parent_company': 'company name',
  'parent_company.title': 'company name',
  'auth.github': 'brand',
  'settings.profile.github': 'brand',
  'settings.profile.linkedin': 'brand',
  'linkedin.button': 'brand',
  'crm.linkedin': 'brand',
  'crm.user_detail_stripe_id': 'brand + identifier',
  'footer.powered_by_engine': 'brand — the engine name, never translated',
  // A postal address must stay in the form the postal service delivers to.
  'footer.address': 'postal address — must remain deliverable as written',
  // Product and plan names — deliberately not localised, like "Pro".
  'pricing.career_accelerator': 'plan name',
  'templates.career_accelerator': 'plan name',
  'crm.plan_career_accelerator': 'plan name',
  'template_picker.layout_slate_gold': 'template name',
  // Example values shown inside form fields — illustrative, not prose.
  'cv_builder.ph_linkedin': 'example URL',
  'cv_builder.ph_website': 'example URL',
  'contact.info_email': 'literal address',
  'footer.email': 'literal address',
  'footer.parent_email': 'literal address',
  'newsletter.email_placeholder': 'example address',
  // Language names are shown in their own language, by convention.
  'settings.preferences.languages.en': 'endonym',
  'settings.preferences.languages.es': 'endonym',
  'settings.preferences.languages.fr': 'endonym',
  'settings.preferences.languages.de': 'endonym',
  // Pure interpolation — contributes no words of its own.
  'template_picker.layout_tooltip': 'placeholders only',
};

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out[prefix] = String(value);
  }
  return out;
}

const load = (locale: string) =>
  flatten(JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8')));

const en = load('en');

/**
 * Latin words in a value, ignoring placeholders and bare acronyms. "24/7",
 * "PDF", "{count}" and "—" are the same in every language and say nothing about
 * whether translation happened.
 */
function proseWords(value: string): string[] {
  return (value.replace(/\{[^}]*\}/g, ' ').match(/[A-Za-z]{3,}/g) ?? [])
    // A lone all-caps token is an acronym (PDF, DOCX, ATS), not prose.
    .filter((w) => !/^[A-Z]+$/.test(w));
}

/**
 * How much Latin text has to be present before identity with English counts as
 * a translation failure. This differs by script, and the difference is the
 * whole reason this test is usable rather than noise.
 *
 * Arabic and Urdu do not use the Latin alphabet, so ANY Latin word left in
 * those files is visibly foreign on screen — one word is enough to flag.
 *
 * Spanish, French and German do, and share a great deal of vocabulary with
 * English: "Plan", "Legal", "Blog", "General", "Formal", "Final", "Avatar" are
 * correct translations that happen to be spelled identically. Flagging single
 * words there produced ~77 false positives per locale and would have trained
 * everyone to ignore the test. Two or more words is a phrase, and a phrase
 * identical to English is a real miss — which is exactly the shape of the four
 * defects that prompted this file.
 */
const MIN_WORDS: Record<string, number> = { ar: 1, ur: 1, es: 2, fr: 2, de: 2 };

describe('locale values are actually translated', () => {
  it.each(LOCALES)('%s has no value left in English', (locale) => {
    const target = load(locale);
    const threshold = MIN_WORDS[locale];

    const untranslated = Object.keys(en).filter(
      (key) =>
        !(key in ALLOWED) &&
        target[key] === en[key] &&
        proseWords(en[key]).length >= threshold,
    );

    expect(
      untranslated,
      `${locale}: ${untranslated.length} value(s) still in English.\n` +
        untranslated.map((k) => `  ${k} = ${JSON.stringify(en[k])}`).join('\n') +
        '\nTranslate them, or add to ALLOWED with a reason if they must stay Latin.',
    ).toEqual([]);
  });

  it('every ALLOWED entry is still a real key, so the list cannot rot', () => {
    const stale = Object.keys(ALLOWED).filter((k) => !(k in en));
    expect(stale, `ALLOWED references keys that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });
});
