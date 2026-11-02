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
  evidenceLabel: EvidenceLabel;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifierName: string | null;
  isPortfolioShared: boolean;
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
}

/**
 * An uploaded credential or work sample is labeled `evidence_attached`.
 * Uploading a certificate is NOT issuer verification.
 * A self-reported claim without attachment is `self_reported`.
 * A reference is NOT confirmed until verified by an outreach event.
 */
export function defaultEvidenceLabel(
  evidenceType: EvidenceType,
  hasAttachment: boolean,
): EvidenceLabel {
  if (hasAttachment) {
    return 'evidence_attached';
  }
  return 'self_reported';
}
