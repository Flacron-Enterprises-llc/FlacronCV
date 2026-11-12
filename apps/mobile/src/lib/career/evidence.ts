import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  UpdateEvidenceInput,
} from '../../../../../packages/career-api-client/src/types';
import { EVIDENCE_TYPES } from '../../../../../packages/career-shared/src/evidence';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile Evidence vault (tested in evidence.test.ts).
 * Mirrors the website's EvidenceScreen: the same fields, the same limits the
 * career API validates (apps/career-api evidence.controller.ts) and the same
 * file rules (packages/career-server evidence-files.ts). The server stays the
 * judge; these checks only stop a request that would certainly be refused.
 */

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  project: 'Project',
  credential: 'Credential',
  work_sample: 'Work sample',
  reference: 'Reference',
  publication: 'Publication',
};

export const EVIDENCE_TYPE_OPTIONS: { value: EvidenceType; label: string }[] = EVIDENCE_TYPES.map((value) => ({
  value,
  label: EVIDENCE_TYPE_LABEL[value],
}));

export function evidenceTypeLabel(type: string): string {
  return (EVIDENCE_TYPE_LABEL as Record<string, string>)[type] ?? type;
}

/** What has actually been established about an item (never upgraded by the app). */
export function evidenceLabelView(label: EvidenceLabel | string): { text: string; tone: 'default' | 'brand' | 'warning' | 'success' } {
  switch (label) {
    case 'evidence_attached':
      return { text: 'EVIDENCE ATTACHED', tone: 'brand' };
    case 'assessment_completed':
      return { text: 'ASSESSMENT COMPLETED', tone: 'success' };
    case 'issuer_verified':
      return { text: 'ISSUER VERIFIED', tone: 'success' };
    case 'reference_confirmed':
      return { text: 'REFERENCE CONFIRMED', tone: 'success' };
    default:
      return { text: 'SELF-REPORTED', tone: 'default' };
  }
}

/** Decimal units, as the website and the plan storage allowance count them. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
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
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > EVIDENCE_LIMITS.title) errors.title = `Use at most ${EVIDENCE_LIMITS.title} characters.`;
  if (form.description.trim().length > EVIDENCE_LIMITS.description) errors.description = `Use at most ${EVIDENCE_LIMITS.description} characters.`;
  if (form.ownershipStatement.trim().length > EVIDENCE_LIMITS.ownershipStatement) {
    errors.ownershipStatement = `Use at most ${EVIDENCE_LIMITS.ownershipStatement} characters.`;
  }
  const url = form.attachmentUrl.trim();
  if (url.length > EVIDENCE_LIMITS.attachmentUrl) errors.attachmentUrl = `Use at most ${EVIDENCE_LIMITS.attachmentUrl} characters.`;
  else if (url && !isWebLink(url)) errors.attachmentUrl = 'Enter a full web link starting with https://';
  if (form.attachmentName.trim().length > EVIDENCE_LIMITS.attachmentName) {
    errors.attachmentName = `Use at most ${EVIDENCE_LIMITS.attachmentName} characters.`;
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

export const UPLOAD_TOO_LARGE = 'That file is larger than the upload limit (10 MB).';
export const UPLOAD_WRONG_TYPE = 'Choose a PNG or JPEG photo. Upload PDFs and Word files on the FlacronCV website.';

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
  if (!contentType) return { ok: false, message: UPLOAD_WRONG_TYPE };
  if (typeof asset.fileSize === 'number' && asset.fileSize > EVIDENCE_UPLOAD_MAX_BYTES) return { ok: false, message: UPLOAD_TOO_LARGE };
  return { ok: true, contentType, fileName: uploadFileName(asset.fileName ?? asset.uri.split('/').pop() ?? '', contentType) };
}

/** Byte count check once the file is read (the picker does not always report a size). */
export function checkUploadSize(bytes: number): string | null {
  if (bytes <= 0) return 'That file is empty.';
  if (bytes > EVIDENCE_UPLOAD_MAX_BYTES) return UPLOAD_TOO_LARGE;
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
    if (error.status === 413) return UPLOAD_TOO_LARGE;
    if (error.code === 'validation_error') {
      return (error.body as { reason?: string }).reason === 'too_large'
        ? UPLOAD_TOO_LARGE
        : 'Use a PDF, PNG, JPEG, or DOCX file. The file must really be that type.';
    }
    if (error.code === 'capacity_exceeded') return 'Your plan’s storage is full. Remove a file to add another.';
    if (error.code === 'provider_unavailable') return 'File storage is not available right now. Nothing was charged.';
  }
  return careerErrorMessage(error, 'The file action did not finish. Try again.');
}

export function evidenceSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'capacity_exceeded') return 'Your career plan has no room for another evidence item.';
    if (error.code === 'feature_unavailable') return 'The Evidence vault is switched off right now.';
    if (error.code === 'validation_error') return 'Please check the fields for errors.';
  }
  return careerErrorMessage(error, 'The evidence item was not saved. Try again.');
}
