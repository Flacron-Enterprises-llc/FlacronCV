/**
 * Server-side legal acceptance (Batch H). One document per user, keyed by uid.
 *
 * Collection: `legalAcceptances/{uid}` — doc-id get/set only. No where-query,
 * no composite index. Email is a stored field required by the client schema;
 * it is never a log line.
 */

export const LEGAL_ACCEPTANCES_COLLECTION = 'legalAcceptances';

export interface LegalAcceptance {
  userId: string;
  /** Stored on the document by client schema. Never log this value. */
  email: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  disclaimerAccepted: boolean;
  termsVersion: string;
  privacyVersion: string;
  disclaimerVersion: string;
  /** ISO-8601 timestamp of this snapshot. Re-consent overwrites the doc. */
  acceptedAt: string;
}

export interface LegalAcceptanceVersions {
  termsVersion: string;
  privacyVersion: string;
  disclaimerVersion: string;
}

/** Body for POST /legal/acceptances. Booleans must be true; versions are client-supplied. */
export interface RecordLegalAcceptanceData {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  disclaimerAccepted: boolean;
  termsVersion: string;
  privacyVersion: string;
  disclaimerVersion: string;
}

/**
 * Whether the signed-in user should be asked to (re)consent.
 *
 * A missing record is grandfathered: existing accounts keep sign-in, the
 * dashboard, and their documents. `treatMissingAsStale` defaults to **false**
 * and must stay false unless a later batch explicitly arms prompting for
 * users who have no row.
 */
export function needsAcceptance(
  record: Pick<LegalAcceptance, 'termsVersion' | 'privacyVersion' | 'disclaimerVersion'> | null,
  current: LegalAcceptanceVersions,
  treatMissingAsStale = false,
): boolean {
  if (!record) return treatMissingAsStale;
  return (
    record.termsVersion !== current.termsVersion ||
    record.privacyVersion !== current.privacyVersion ||
    record.disclaimerVersion !== current.disclaimerVersion
  );
}
