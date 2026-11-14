import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  CareerEvidence,
  CreateEvidenceInput,
  EvidenceLabel,
  EvidenceType,
  EvidenceVerification,
  UpdateEvidenceInput,
} from '../../../../../packages/career-api-client/src/types';
import { EVIDENCE_TYPES, safeEvidenceUrl } from '../../../../../packages/career-shared/src/evidence';
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

/**
 * What a label does and does not establish (the website's `label_*_limit`).
 * The API computes the label from the active checks; the app only explains it.
 */
export function evidenceLabelLimit(label: EvidenceLabel | string): string {
  switch (label) {
    case 'evidence_attached':
    case 'assessment_completed':
    case 'issuer_verified':
    case 'reference_confirmed':
      return t(`careerEvidence.labelLimits.${label}`);
    default:
      return t('careerEvidence.labelLimits.self_reported');
  }
}

/** One recorded check, ready to show. Read-only: checks are recorded by an operator, never by the person. */
export interface VerificationRow {
  id: string;
  label: string;
  status: 'active' | 'expired' | 'revoked';
  /** Null while the check is active. */
  statusText: string | null;
  lines: string[];
}

/** Every check, newest first as the API sends them, including expired and revoked ones. */
export function verificationRows(checks: readonly EvidenceVerification[] | null | undefined): VerificationRow[] {
  return (checks ?? []).map((check) => {
    const status: VerificationRow['status'] = check.revokedAt ? 'revoked' : check.active ? 'active' : 'expired';
    const lines = [
      t('careerEvidence.history.checkedOn', { date: check.checkedOn, method: verificationMethodLabel(check.method) }),
      t('careerEvidence.history.issuer', { issuer: check.issuerName }),
      t('careerEvidence.history.scope', { scope: check.scope }),
    ];
    if (check.expiresOn) lines.push(t('careerEvidence.history.expires', { date: check.expiresOn }));
    if (check.revokedAt && check.revokedReason) lines.push(t('careerEvidence.history.revokedReason', { reason: check.revokedReason }));
    return {
      id: check.id,
      label: evidenceLabelView(check.label).text,
      status,
      statusText: status === 'active' ? null : t(`careerEvidence.history.${status}`),
      lines,
    };
  });
}

const METHODS = ['issuer_registry', 'issuer_contact', 'assessment', 'reference_contact', 'other'];

export function verificationMethodLabel(method: string): string {
  return t(`careerEvidence.methods.${METHODS.includes(method) ? method : 'other'}`);
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
  redactionNote: 1000,
  linkedFacts: 50,
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
  /** Contains employer or client material that must be redacted before it is shared. */
  confidential: boolean;
  redactionNote: string;
  /** The person confirmed the redaction (the API stores when). */
  redactionConfirmed: boolean;
  /** Profile facts this item is proof of. */
  linkedFactIds: string[];
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
  confidential: false,
  redactionNote: '',
  redactionConfirmed: false,
  linkedFactIds: [],
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
    confidential: item.confidential === true,
    redactionNote: item.redactionNote ?? '',
    redactionConfirmed: item.confidential === true && Boolean(item.redactionConfirmedAt),
    linkedFactIds: [...(item.linkedFactIds ?? [])],
  };
}

export function toggleFactId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** A confidential item that is (or is about to be) shared needs a confirmed redaction; the API refuses it otherwise. */
export function needsRedactionConfirm(form: Pick<EvidenceForm, 'confidential' | 'isPortfolioShared' | 'redactionConfirmed'>): boolean {
  return form.confidential && form.isPortfolioShared && !form.redactionConfirmed;
}

export function evidenceFormDirty(form: EvidenceForm, base: EvidenceForm): boolean {
  return (Object.keys(base) as (keyof EvidenceForm)[]).some((key) => {
    const a = form[key];
    const b = base[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      const x = [...a].sort();
      const y = [...b].sort();
      return x.length !== y.length || x.some((v, i) => v !== y[i]);
    }
    return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b;
  });
}

export type EvidenceFormErrors = Partial<
  Record<
    | 'title'
    | 'description'
    | 'ownershipStatement'
    | 'attachmentUrl'
    | 'attachmentName'
    | 'redactionNote'
    | 'redactionConfirmed'
    | 'linkedFactIds',
    string
  >
>;

/** http(s) only, no embedded credentials: the API's own rule (shared `safeEvidenceUrl`). */
function isWebLink(value: string): boolean {
  return safeEvidenceUrl(value) !== null;
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
  if (form.confidential && form.redactionNote.trim().length > EVIDENCE_LIMITS.redactionNote) {
    errors.redactionNote = tooLong(EVIDENCE_LIMITS.redactionNote);
  }
  if (needsRedactionConfirm(form)) errors.redactionConfirmed = t('careerEvidence.redaction.required');
  if (form.linkedFactIds.length > EVIDENCE_LIMITS.linkedFacts) {
    errors.linkedFactIds = t('careerEvidence.facts.tooMany', { max: EVIDENCE_LIMITS.linkedFacts });
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
    linkedFactIds: form.linkedFactIds.length > 0 ? form.linkedFactIds : undefined,
    confidential: form.confidential || undefined,
    redactionNote: form.confidential ? form.redactionNote.trim() || null : undefined,
    redactionConfirmed: form.confidential && form.redactionConfirmed ? true : undefined,
  };
}

/**
 * The type is fixed after creation (the API does not accept it on update).
 * Cleared text is sent as empty so it really clears. Link fields are left out
 * while a private file is stored, so an edit never touches the stored file.
 */
export function toUpdateEvidenceInput(form: EvidenceForm, attachmentStored: boolean, base?: EvidenceForm): UpdateEvidenceInput {
  const input: UpdateEvidenceInput = {
    title: form.title.trim(),
    description: form.description.trim(),
    ownershipStatement: form.ownershipStatement.trim(),
    linkedSkills: parseSkills(form.skillsText),
    isPortfolioShared: form.isPortfolioShared,
    linkedFactIds: form.linkedFactIds,
    confidential: form.confidential,
    redactionNote: form.confidential ? form.redactionNote.trim() || null : null,
  };
  // Only a change is sent: re-sending true would re-stamp the confirmation
  // time, and leaving it out keeps an earlier confirmation as it was.
  if (form.confidential && form.redactionConfirmed !== (base?.redactionConfirmed ?? false)) {
    input.redactionConfirmed = form.redactionConfirmed;
  }
  if (!attachmentStored) {
    input.attachmentUrl = form.attachmentUrl.trim() || null;
    input.attachmentName = form.attachmentName.trim() || null;
  }
  return input;
}

/* ---------- Private file upload ---------- */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * The types the API stores (packages/career-server evidence-files.ts
 * `EVIDENCE_FILE_TYPES`) and the website's file input accepts: PDF, PNG,
 * JPEG and DOCX. The document picker offers all four; the photo picker
 * offers PNG and JPEG (`PHOTO_UPLOAD_TYPES`).
 */
export const MOBILE_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', DOCX_MIME] as const;
export type MobileUploadType = (typeof MOBILE_UPLOAD_TYPES)[number];
export const PHOTO_UPLOAD_TYPES = ['image/png', 'image/jpeg'] as const;
type PhotoUploadType = (typeof PHOTO_UPLOAD_TYPES)[number];

/** `type` for expo-document-picker's `getDocumentAsync`. */
export const EVIDENCE_PICKER_TYPES: string[] = [...MOBILE_UPLOAD_TYPES];

/** The API's default cap (EVIDENCE_UPLOAD_MAX_BYTES unset): 10 MiB. */
export const EVIDENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Refusal messages in the current language. */
export const uploadTooLargeMessage = (): string => t('careerEvidence.errors.tooLarge');
export const uploadWrongTypeMessage = (): string => t('careerEvidence.errors.wrongType');
export const uploadWrongFileTypeMessage = (): string => t('careerEvidence.errors.wrongFileType');

/**
 * The same messages as read when this module loaded (English unless a language
 * was already set). Kept for existing tests; the app calls the functions above
 * so the text follows the current language.
 */
export const UPLOAD_TOO_LARGE = uploadTooLargeMessage();
export const UPLOAD_WRONG_TYPE = uploadWrongTypeMessage();

const EXT_TYPE: Record<string, PhotoUploadType> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const FILE_EXT_TYPE: Record<string, MobileUploadType> = { ...EXT_TYPE, pdf: 'application/pdf', docx: DOCX_MIME };
const TYPE_EXT: Record<MobileUploadType, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  [DOCX_MIME]: 'docx',
};

/** MIME types a picker may report that say nothing about the file; the extension decides then. */
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/zip', 'application/x-zip-compressed']);

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
  let contentType: PhotoUploadType | undefined = (PHOTO_UPLOAD_TYPES as readonly string[]).includes(fromMime)
    ? (fromMime as PhotoUploadType)
    : undefined;
  if (!contentType && !declared) contentType = EXT_TYPE[extensionOf(asset.fileName)] ?? EXT_TYPE[extensionOf(asset.uri)];
  if (!contentType) return { ok: false, message: uploadWrongTypeMessage() };
  if (typeof asset.fileSize === 'number' && asset.fileSize > EVIDENCE_UPLOAD_MAX_BYTES) return { ok: false, message: uploadTooLargeMessage() };
  return { ok: true, contentType, fileName: uploadFileName(asset.fileName ?? asset.uri.split('/').pop() ?? '', contentType) };
}

/**
 * Decides whether a file from the document picker may be sent, and as what:
 * PDF, DOCX, PNG or JPEG (the API's list), up to the 10 MiB API default.
 * The picker's MIME type decides; when it is missing or generic
 * (`application/octet-stream`, some Android providers) the name's extension
 * does. The API still checks the file's signature against the type.
 */
export function planFileUpload(asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }): UploadPlan {
  const declared = (asset.mimeType ?? '').split(';')[0].trim().toLowerCase();
  const fromMime = declared === 'image/jpg' ? 'image/jpeg' : declared;
  let contentType: MobileUploadType | undefined = (MOBILE_UPLOAD_TYPES as readonly string[]).includes(fromMime)
    ? (fromMime as MobileUploadType)
    : undefined;
  if (!contentType && GENERIC_TYPES.has(declared)) {
    contentType = FILE_EXT_TYPE[extensionOf(asset.name)] ?? FILE_EXT_TYPE[extensionOf(asset.uri)];
  }
  if (!contentType) return { ok: false, message: uploadWrongFileTypeMessage() };
  if (typeof asset.size === 'number' && asset.size > EVIDENCE_UPLOAD_MAX_BYTES) return { ok: false, message: uploadTooLargeMessage() };
  return { ok: true, contentType, fileName: uploadFileName(asset.name ?? asset.uri.split('/').pop() ?? '', contentType) };
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
  return `${base || 'evidence'}.${TYPE_EXT[contentType]}`;
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
    if (error.code === 'validation_error') {
      const field = (error.body as { field?: unknown }).field;
      if (field === 'attachmentUrl') return t('careerEvidence.validation.webLink');
      if (field === 'redactionConfirmed') return t('careerEvidence.redaction.required');
      if (field === 'linkedFactIds') return t('careerEvidence.facts.invalid');
      return t('careerEvidence.errors.validation');
    }
  }
  return careerErrorMessage(error, t('careerEvidence.errors.saveFailed'));
}
