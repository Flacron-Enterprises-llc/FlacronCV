/**
 * Legal document version stamps for POST /legal/acceptances.
 *
 * Copied from apps/web/src/legal/types.ts `LEGAL_VERSION` ('2026-08-16').
 * Will drift when web bumps that constant — update this file in the same
 * change. Do not move versions into shared-types in this task.
 *
 * privacyVersion is recorded even though Privacy Policy section 4 is still
 * awaiting the client (same deliberate gap as web). See PROJECT_PROGRESS §8.
 */
export const LEGAL_VERSION = '2026-08-16';

export const LEGAL_PATHS = {
  terms: '/terms-of-service',
  privacy: '/privacy-policy',
  disclaimer: '/disclaimer',
} as const;

export type LegalDocKind = keyof typeof LEGAL_PATHS;

/**
 * Public English legal URLs. Origin from EXPO_PUBLIC_APP_URL (no trailing slash).
 * Missing or blank env → null; callers must not invent a production origin.
 */
export function legalDocUrl(kind: LegalDocKind): string | null {
  const origin = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (!origin) return null;
  return `${origin}/en${LEGAL_PATHS[kind]}`;
}

export function currentLegalVersions() {
  return {
    termsVersion: LEGAL_VERSION,
    privacyVersion: LEGAL_VERSION,
    disclaimerVersion: LEGAL_VERSION,
  };
}
