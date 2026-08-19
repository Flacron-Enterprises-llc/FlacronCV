import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Creation allowances are not restored by delete. The upgrade modal used to
 * tell users to "delete one you no longer need" — that becomes false the
 * moment delete stops refunding the slot, and it appears at the paywall.
 * These two keys must not carry that advice in any locale.
 *
 * MC7 framing: deleting does not *restore* the allowance. A translator
 * working from a loose English source could invert that into "deleting
 * spends one". The restore-markers below catch that inversion.
 */

const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;
const LOCALES_DIR = join(__dirname, '..', '..', 'public', 'locales');

const UPGRADE_KEYS = [
  'upgrade_modal.reasons.cvs.description',
  'upgrade_modal.reasons.cover_letters.description',
] as const;

const DELETE_KEYS = [
  'cv.delete_confirm_message',
  'coverLetters.delete_confirm_message',
] as const;

/** Old paywall advice — must not survive in any locale. */
const FORBIDDEN = [
  'delete one you no longer need',
  'elimina alguno que ya no necesites',
  'elimina alguna que ya no necesites',
  "supprimez-en un dont vous n'avez plus besoin",
  "supprimez-en une dont vous n'avez plus besoin",
  'lösche einen, den du nicht mehr brauchst',
  'lösche eines, das du nicht mehr brauchst',
  'احذف واحدة لم تعد بحاجة إليها',
  'احذف واحدًا لم تعد بحاجة إليه',
  'یا کوئی ایسا حذف کریں جس کی اب ضرورت نہیں',
];

/**
 * "Does not restore" in each locale — not "spends" / "consumes" / "uses up".
 * If a translation inverts the meaning, these markers will be missing.
 */
const RESTORE_MARKERS: Record<(typeof LOCALES)[number], RegExp> = {
  en: /does not restore/,
  es: /no restaura/,
  fr: /ne restaure pas/,
  de: /stellt keine .+ wieder her/,
  ar: /لا يستعيد/,
  ur: /بحال نہیں/,
};

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8'));
}

function get(obj: unknown, path: string): string {
  return path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj) as string;
}

describe('allowance copy: delete does not restore a creation', () => {
  it('no locale tells the user to delete a document to free a slot', () => {
    const hits: string[] = [];
    for (const locale of LOCALES) {
      const json = load(locale);
      const blob = JSON.stringify(json);
      for (const phrase of FORBIDDEN) {
        if (blob.includes(phrase)) hits.push(`${locale}: ${phrase}`);
      }
      for (const key of UPGRADE_KEYS) {
        const value = get(json, key);
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
    expect(hits).toEqual([]);
  });

  it('upgrade-modal and list-delete copy use the does-not-restore framing in every locale', () => {
    const misses: string[] = [];
    for (const locale of LOCALES) {
      const json = load(locale);
      const marker = RESTORE_MARKERS[locale];
      for (const key of [...UPGRADE_KEYS, ...DELETE_KEYS]) {
        const value = get(json, key);
        if (!marker.test(value)) misses.push(`${locale}:${key}`);
      }
    }
    expect(misses).toEqual([]);
  });
});
