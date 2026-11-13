import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  UpdateEvidenceInput,
} from '../../../../../packages/career-api-client/src/types';
import { EVIDENCE_TYPES } from '../../../../../packages/career-shared/src/evidence';
import { formatNumber, t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile Evidence vault (tested in evidence.test.ts).
 * Mirrors the website's EvidenceScreen: the same fields, the same limits the
 * career API validates (apps/career-api evidence.controller.ts) and the same
 * file rules (packages/career-server evidence-files.ts). The server stays the
 * judge; these checks only stop a request that would certainly be refused.
 *
 * Copy lives in the `careerEvidence` namespace and is read with `t()` at call
 * time, so it follows the current app language.
 */

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, () => string> = {
  project: () => t('careerEvidence.types.project'),
  credential: () => t('careerEvidence.types.credential'),
  work_sample: () => t('careerEvidence.types.work_sample'),
  reference: () => t('careerEvidence.types.reference'),
  publication: () => t('careerEvidence.types.publication'),
};

/** Values in the API order; the label is translated at render with evidenceTypeLabel. */
export const EVIDENCE_TYPE_OPTIONS: { value: EvidenceType }[] = EVIDENCE_TYPES.map((value) => ({ value }));

export function evidenceTypeLabel(type: string): string {
  const label = (EVIDENCE_TYPE_LABEL as Record<string, (() => string) | undefined>)[type];
  return label ? label() : type;
}

/** What has actually been established about an item (never upgraded by the app). */
export function evidenceLabelView(label: EvidenceLabel | string): { text: string; tone: 'default' | 'brand' | 'warning' | 'success' } {
  switch (label) {
    case 'evidence_attached':
      return { text: t('careerEvidence.labels.evidence_attached'), tone: 'brand' };
    case 'assessment_completed':
      return { text: t('careerEvidence.labels.assessment_completed'), tone: 'success' };
    case 'issuer_verified':
      return { text: t('careerEvidence.labels.issuer_verified'), tone: 'success' };
    case 'reference_confirmed':
      return { text: t('careerEvidence.labels.reference_confirmed'), tone: 'success' };
    default:
      return { text: t('careerEvidence.labels.self_reported'), tone: 'default' };
  }
}

/** Decimal units, as the website and the plan storage allowance count them. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1_000_000) return `${formatNumber(Math.max(1, Math.round(bytes / 1000)), { useGrouping: false })} KB`;
  return `${formatNumber(bytes / 1_000_000, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })} MB`;
}

/** Comma-separated skills → list, as the website splits them. */
export function parseSkills(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const EVIDENCE_LIMITS = {
  title: 200,
  description: 4000,
  ownershipStatement: 2000,
  attachmentUrl: 2048,
  attachmentName: 255,
} as const;

export interface EvidenceForm {
  title: string;
  evidenceType: EvidenceType;
  description: string;
  ownershipStatement: string;
  skillsText: string;
  attachmentUrl: string;
  attachmentName: string;
  isPortfolioShared: boolean;
}

export const EMPTY_EVIDENCE_FORM: EvidenceForm = {
  title: '',
  evidenceType: 'project',
  description: '',
  ownershipStatement: '',
  skillsText: '',
  attachmentUrl: '',
  attachmentName: '',
  isPortfolioShared: false,
};

export function formFromEvidence(item: CareerEvidence): EvidenceForm {
  return {
    title: item.title,
    evidenceType: item.evidenceType,
    description: item.description ?? '',
    ownershipStatement: item.ownershipStatement ?? '',
    skillsText: (item.linkedSkills ?? []).join(', '),
    // A stored file has no external link; its name belongs to the file, not to the form.
    attachmentUrl: item.attachmentStored ? '' : (item.attachmentUrl ?? ''),
    attachmentName: item.attachmentStored ? '' : (item.attachmentName ?? ''),
    isPortfolioShared: item.isPortfolioShared,
  };
}

export function evidenceFormDirty(form: EvidenceForm, base: EvidenceForm): boolean {
  return (Object.keys(base) as (keyof EvidenceForm)[]).some((key) => {
    const a = form[key];
    const b = base[key];
    return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b;
  });
}

export type EvidenceFormErrors = Partial<Record<'title' | 'description' | 'ownershipStatement' | 'attachmentUrl' | 'attachmentName', string>>;

function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Empty object when the form can be sent. */
export function validateEvidenceForm(form: EvidenceForm): EvidenceFormErrors {
  const errors: EvidenceFormErrors = {};
  const title = form.title.trim();
  const tooLong = (max: number) => t('careerEvidence.validation.maxChars', { max: String(max) });
  if (!title) errors.title = t('careerEvidence.validation.titleRequired');
  else if (title.length > EVIDENCE_LIMITS.title) errors.title = tooLong(EVIDENCE_LIMITS.title);
  if (form.description.trim().length > EVIDENCE_LIMITS.description) errors.description = tooLong(EVIDENCE_LIMITS.description);
  if (form.ownershipStatement.trim().length > EVIDENCE_LIMITS.ownershipStatement) {
    errors.ownershipStatement = tooLong(EVIDENCE_LIMITS.ownershipStatement);
  }
  const url = form.attachmentUrl.trim();
  if (url.length > EVIDENCE_LIMITS.attachmentUrl) errors.attachmentUrl = tooLong(EVIDENCE_LIMITS.attachmentUrl);
  else if (url && !isWebLink(url)) errors.attachmentUrl = t('careerEvidence.validation.webLink');
  if (form.attachmentName.trim().length > EVIDENCE_LIMITS.attachmentName) {
    errors.attachmentName = tooLong(EVIDENCE_LIMITS.attachmentName);
  }
  return errors;
}

/** Same body the website sends on create. */
export function toCreateEvidenceInput(form: EvidenceForm): CreateEvidenceInput {
  const skills = parseSkills(form.skillsText);
  return {
    title: form.title.trim(),
    evidenceType: form.evidenceType,
    description: form.description.trim() || undefined,
    ownershipStatement: form.ownershipStatement.trim() || undefined,
    linkedSkills: skills.length > 0 ? skills : undefined,
    attachmentUrl: form.attachmentUrl.trim() || undefined,
    attachmentName: form.attachmentName.trim() || undefined,
    isPortfolioShared: form.isPortfolioShared,
  };
}

/**
 * The type is fixed after creation (the API does not accept it on update).
 * Cleared text is sent as empty so it really clears. Link fields are left out
 * while a private file is stored, so an edit never touches the stored file.
 */
export function toUpdateEvidenceInput(form: EvidenceForm, attachmentStored: boolean): UpdateEvidenceInput {
  const input: UpdateEvidenceInput = {
    title: form.title.trim(),
    description: form.description.trim(),
    ownershipStatement: form.ownershipStatement.trim(),
    linkedSkills: parseSkills(form.skillsText),
    isPortfolioShared: form.isPortfolioShared,
  };
  if (!attachmentStored) {
    input.attachmentUrl = form.attachmentUrl.trim() || null;
    input.attachmentName = form.attachmentName.trim() || null;
  }
  return input;
}

/* ---------- Private file upload ---------- */

/**
 * The API stores PDF, PNG, JPEG and DOCX. The app can only pick photos (no
 * document picker is installed), so it sends PNG or JPEG; PDFs and DOCX are
 * uploaded on the website.
 */
export const MOBILE_UPLOAD_TYPES = ['image/png', 'image/jpeg'] as const;
export type MobileUploadType = (typeof MOBILE_UPLOAD_TYPES)[number];

/** The API's default cap (EVIDENCE_UPLOAD_MAX_BYTES unset): 10 MiB. */
export const EVIDENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Refusal messages in the current language. */
export const uploadTooLargeMessage = (): string => t('careerEvidence.errors.tooLarge');
export const uploadWrongTypeMessage = (): string => t('careerEvidence.errors.wrongType');

/**
 * The same messages as read when this module loaded (English unless a language
 * was already set). Kept for existing tests; the app calls the functions above
 * so the text follows the current language.
 */
export const UPLOAD_TOO_LARGE = uploadTooLargeMessage();
export const UPLOAD_WRONG_TYPE = uploadWrongTypeMessage();

const EXT_TYPE: Record<string, MobileUploadType> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function extensionOf(name: string | null | undefined): string {
  const match = /\.([A-Za-z0-9]{1,8})(?:[?#].*)?$/.exec(name ?? '');
  return match ? match[1].toLowerCase() : '';
}

export type UploadPlan =
  | { ok: true; contentType: MobileUploadType; fileName: string }
  | { ok: false; message: string };

/**
 * Decides whether a picked photo may be sent, and as what. Uses the picker's
 * MIME type, then the file name / URI extension. HEIC and anything else is
 * refused before upload (the API would refuse it too).
 */
export function planImageUpload(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}): UploadPlan {
  const declared = (asset.mimeType ?? '').split(';')[0].trim().toLowerCase();
  const fromMime = declared === 'image/jpg' ? 'image/jpeg' : declared;
  let contentType: MobileUploadType | undefined = (MOBILE_UPLOAD_TYPES as readonly string[]).includes(fromMime)
    ? (fromMime as MobileUploadType)
    : undefined;
  if (!contentType && !declared) contentType = EXT_TYPE[extensionOf(asset.fileName)] ?? EXT_TYPE[extensionOf(asset.uri)];
  if (!contentType) return { ok: false, message: uploadWrongTypeMessage() };
  if (typeof asset.fileSize === 'number' && asset.fileSize > EVIDENCE_UPLOAD_MAX_BYTES) return { ok: false, message: uploadTooLargeMessage() };
  return { ok: true, contentType, fileName: uploadFileName(asset.fileName ?? asset.uri.split('/').pop() ?? '', contentType) };
}

/** Byte count check once the file is read (the picker does not always report a size). */
export function checkUploadSize(bytes: number): string | null {
  if (bytes <= 0) return t('careerEvidence.errors.empty');
  if (bytes > EVIDENCE_UPLOAD_MAX_BYTES) return uploadTooLargeMessage();
  return null;
}

/** A display name with the extension that matches the type sent (the server cleans it again). */
export function uploadFileName(raw: string, contentType: MobileUploadType): string {
  const base = raw
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '')
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .trim()
    .slice(0, 120);
  return `${base || 'evidence'}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
}

/** Same wording as the website's file errors. */
export function evidenceFileErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return uploadTooLargeMessage();
    if (error.code === 'validation_error') {
      return (error.body as { reason?: string }).reason === 'too_large'
        ? uploadTooLargeMessage()
        : t('careerEvidence.errors.fileType');
    }
    if (error.code === 'capacity_exceeded') return t('careerEvidence.errors.storageFull');
    if (error.code === 'provider_unavailable') return t('careerEvidence.errors.storageUnavailable');
  }
  return careerErrorMessage(error, t('careerEvidence.errors.fileFailed'));
}

export function evidenceSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'capacity_exceeded') return t('careerEvidence.errors.capacity');
    if (error.code === 'feature_unavailable') return t('careerEvidence.errors.switchedOff');
    if (error.code === 'validation_error') return t('careerEvidence.errors.validation');
  }
  return careerErrorMessage(error, t('careerEvidence.errors.saveFailed'));
}
