import type { CoverLetter, CreateCoverLetterData, UpdateCoverLetterData } from '@flacroncv/shared-types';

/**
 * Languages a cover letter can be written in — the web app's locales.
 *
 * Stored per letter as `letterLocale`, separately from the user's interface
 * language: someone browsing in Arabic may be applying to an English-speaking
 * employer, and the letter's salutation, closing, date and text direction must
 * follow the letter, not the UI.
 *
 * The field is not (yet) on the shared `CoverLetter` type, so this module adds
 * it locally for the API; documents written before it existed simply lack it.
 */
export const LETTER_LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'] as const;
export type LetterLocale = (typeof LETTER_LOCALES)[number];

export type StoredCoverLetter = CoverLetter & { letterLocale?: LetterLocale };
export type CreateCoverLetterInput = CreateCoverLetterData & { letterLocale?: LetterLocale };
export type UpdateCoverLetterInput = UpdateCoverLetterData & { letterLocale?: LetterLocale };
