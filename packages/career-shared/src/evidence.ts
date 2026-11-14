/**
 * CV11: Career Evidence Vault contracts, types, and truthful labeling rules.
 * Spec sections 15, 25:
 * Labels show what has actually been established about each item:
 * - self_reported: claim made by candidate without attached file or check
 * - evidence_attached: file, certificate, or work sample attached
 * - assessment_completed: passed an assessment with defined criteria
 * - issuer_verified: checked directly against issuing institution / credential registry
 * - reference_confirmed: reference confirmed the specific claimed statement
 */

export const EVIDENCE_TYPES = [
  'project',
  'credential',
  'work_sample',
  'reference',
  'publication',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_LABELS = [
  'self_reported',
  'evidence_attached',
  'assessment_completed',
  'issuer_verified',
  'reference_confirmed',
] as const;

export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];

export function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === 'string' && (EVIDENCE_TYPES as readonly string[]).includes(value);
}

export function isEvidenceLabel(value: unknown): value is EvidenceLabel {
  return typeof value === 'string' && (EVIDENCE_LABELS as readonly string[]).includes(value);
}

export interface CareerEvidence {
  id: string;
  candidateAuthUserId: string;
  title: string;
  description: string;
  evidenceType: EvidenceType;
  ownershipStatement: string;
  linkedSkills: string[];
  /** An external link the person supplied. Null when a file is stored instead. */
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSizeBytes: number | null;
  /** True when a private file is stored; download it through a short-lived link from the API. */
  attachmentStored: boolean;
  attachmentContentType: string | null;
  /**
   * What has been established, as of now: the label of the newest active
   * check (not expired, not revoked), else self reported / evidence attached.
   */
  evidenceLabel: EvidenceLabel;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifierName: string | null;
  isPortfolioShared: boolean;
  /** Confirmed profile facts this item supports. */
  linkedFactIds: string[];
  /** Contains employer or client material that needs redaction before it is shared. */
  confidential: boolean;
  /** What the person removed or blurred, in their words. */
  redactionNote: string | null;
  /** When the person confirmed the redaction; a confidential item is shared only after this. */
  redactionConfirmedAt: string | null;
  /** Every check ever recorded, newest first, including expired and revoked ones. */
  verifications: EvidenceVerification[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvidenceInput {
  title: string;
  description?: string;
  evidenceType: EvidenceType;
  ownershipStatement?: string;
  linkedSkills?: string[];
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSizeBytes?: number | null;
  isPortfolioShared?: boolean;
  linkedFactIds?: string[];
  confidential?: boolean;
  redactionNote?: string | null;
  /** Sent true when the person confirms they removed confidential material. */
  redactionConfirmed?: boolean;
}

export interface UpdateEvidenceInput {
  title?: string;
  description?: string;
  ownershipStatement?: string;
  linkedSkills?: string[];
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSizeBytes?: number | null;
  isPortfolioShared?: boolean;
  linkedFactIds?: string[];
  confidential?: boolean;
  redactionNote?: string | null;
  redactionConfirmed?: boolean;
}

// ---------------------------------------------------------------------------
// Verification history (spec section 25)

/** Labels only a recorded check can give. */
export const VERIFIED_LABELS = ['assessment_completed', 'issuer_verified', 'reference_confirmed'] as const;
export type VerifiedLabel = (typeof VERIFIED_LABELS)[number];

export const VERIFICATION_METHODS = ['issuer_registry', 'issuer_contact', 'assessment', 'reference_contact', 'other'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface EvidenceVerification {
  id: string;
  label: VerifiedLabel;
  method: VerificationMethod;
  /** YYYY-MM-DD the check was made. */
  checkedOn: string;
  /** The specific claim the check covers; a reference confirms only this. */
  scope: string;
  /** The issuing body, or the named assessment. */
  issuerName: string;
  /** How permission to check was obtained (e.g. the person's signed consent of a date). */
  permissionEvidence: string;
  expiresOn: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  recordedBy: 'operator';
  createdAt: string;
  /** Derived: false once expired or revoked. */
  active: boolean;
}

export interface RecordVerificationInput {
  label: VerifiedLabel;
  method: VerificationMethod;
  checkedOn: string;
  scope: string;
  issuerName: string;
  permissionEvidence: string;
  expiresOn?: string | null;
}

export function isVerifiedLabel(value: unknown): value is VerifiedLabel {
  return typeof value === 'string' && (VERIFIED_LABELS as readonly string[]).includes(value);
}

export function isVerificationMethod(value: unknown): value is VerificationMethod {
  return typeof value === 'string' && (VERIFICATION_METHODS as readonly string[]).includes(value);
}

/** Active on `today` (YYYY-MM-DD): not revoked, and not past its expiry date. */
export function verificationActive(check: { expiresOn: string | null; revokedAt: string | null }, today: string): boolean {
  if (check.revokedAt) return false;
  return check.expiresOn === null || check.expiresOn >= today;
}

/**
 * The label shown for an item: the newest active check wins; with none, the
 * stored base label (self reported or evidence attached). Expired and revoked
 * checks never raise the label.
 */
export function effectiveEvidenceLabel(
  base: EvidenceLabel,
  checks: ReadonlyArray<{ label: VerifiedLabel; checkedOn: string; createdAt: string; expiresOn: string | null; revokedAt: string | null }>,
  today: string,
  hasAttachment = false,
): EvidenceLabel {
  const active = checks
    .filter((check) => verificationActive(check, today))
    .sort((a, b) => b.checkedOn.localeCompare(a.checkedOn) || b.createdAt.localeCompare(a.createdAt));
  if (active.length > 0) return active[0].label;
  // A verified label without a recorded check is not trusted.
  return isVerifiedLabel(base) ? defaultEvidenceLabel('project', hasAttachment) : base;
}

/**
 * Only http and https links are kept: a `javascript:` or `data:` link would
 * run in the page of whoever opens it. Returns the normalized URL or null.
 */
export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/**
 * An uploaded credential or work sample is labeled `evidence_attached`.
 * Uploading a certificate is NOT issuer verification.
 * A self-reported claim without attachment is `self_reported`.
 * A reference is NOT confirmed until verified by an outreach event.
 */
export function defaultEvidenceLabel(
  _evidenceType: EvidenceType,
  hasAttachment: boolean,
): EvidenceLabel {
  if (hasAttachment) {
    return 'evidence_attached';
  }
  return 'self_reported';
}
