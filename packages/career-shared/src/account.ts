/** Launch languages (decision 9). Another code is `validation_error` on `PATCH /me`. */
export const LAUNCH_LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LAUNCH_LOCALES)[number];

export function isLaunchLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LAUNCH_LOCALES as readonly string[]).includes(value);
}

/**
 * The legal document versions a person accepts. V1 `apps/web/src/legal/types.ts`
 * `LEGAL_VERSION` is `2026-08-16` for all three, so a copied V1 acceptance
 * is current. Publishing a new document bumps its version here, in the same
 * change as the text.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-08-16',
  privacy: '2026-08-16',
  disclaimer: '2026-08-16',
} as const;

export type LegalDocument = keyof typeof LEGAL_VERSIONS;

export interface AcceptedLegalVersions {
  termsVersion: string;
  privacyVersion: string;
  disclaimerVersion: string;
}

/**
 * Whether to ask for (re)acceptance. A stored row is stale when any
 * version differs from `LEGAL_VERSIONS`. A missing row is stale only for
 * an account created in V2: V1 treated a missing row as grandfathered,
 * and the migration does not invent one (LAUNCH_AND_MIGRATION_PLAN).
 */
export function needsLegalAcceptance(
  record: AcceptedLegalVersions | null,
  origin: 'v2' | 'migrated',
): boolean {
  if (!record) return origin === 'v2';
  return (
    record.termsVersion !== LEGAL_VERSIONS.terms ||
    record.privacyVersion !== LEGAL_VERSIONS.privacy ||
    record.disclaimerVersion !== LEGAL_VERSIONS.disclaimer
  );
}
