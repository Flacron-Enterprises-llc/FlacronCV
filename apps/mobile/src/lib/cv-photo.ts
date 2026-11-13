/**
 * CV photo rules, same as the website (apps/web/src/lib/upload-cv-photo.ts and
 * prepare-image-upload.ts):
 *   - Storage object `avatars/{uid}/cv-{timestamp}.{ext}` (same prefix as the
 *     settings avatar, so the existing Storage rules cover it);
 *   - JPEG / PNG / WebP, at most 5 MB (Storage rejects larger objects);
 *   - the saved value is the https download URL (PersonalInfoDto photoURL
 *     MaxLength 2048). Upload sets `styling.showPhoto = true`, remove sets
 *     `photoURL = ''` and `showPhoto = false`.
 * The web also accepts HEIC and re-encodes to JPEG in a canvas; the app has no
 * image re-encoder, so HEIC is refused here (the iOS picker hands back JPEG
 * when editing/quality options are used).
 */
import { t } from '../i18n';

export const CV_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CV_PHOTO_URL_MAX = 2048;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

/** English copy (tests). Messages shown to the user come from cvEditor.photo.*. */
export const CV_PHOTO_UPLOAD_FAILED = 'Could not upload the photo. Please try again.';
export const CV_PHOTO_UNAVAILABLE = 'Photo upload is unavailable right now. Please sign in again.';

export type CvPhotoErrorCode =
  | 'INVALID_TYPE'
  | 'TOO_LARGE'
  | 'PHOTO_UNAVAILABLE'
  | 'READ_FAILED'
  | 'UPLOAD_FAILED';

export class CvPhotoError extends Error {
  constructor(
    readonly code: CvPhotoErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'CvPhotoError';
  }
}

export interface CvPhotoAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

function extFromName(name: string | null | undefined): string {
  if (!name || !name.includes('.')) return '';
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Storage extension: png / webp kept, everything else jpg. */
export function cvPhotoExtension(asset: Pick<CvPhotoAsset, 'fileName' | 'mimeType'>): 'jpg' | 'png' | 'webp' {
  const fromName = extFromName(asset.fileName);
  if (fromName === 'png' || fromName === 'webp') return fromName;
  if (fromName === 'jpg' || fromName === 'jpeg') return 'jpg';
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/** Same object path rule as web `uploadCvPhotoBlob`. */
export function cvPhotoStoragePath(uid: string, timestampMs: number, ext: string): string {
  if (!uid || /[/\s]/.test(uid)) throw new CvPhotoError('PHOTO_UNAVAILABLE');
  return `avatars/${uid}/cv-${Math.trunc(timestampMs)}.${ext}`;
}

/** Content type sent to Storage — always an image/* type. */
export function cvPhotoContentType(mime: string | null | undefined, blobMime?: string | null): string {
  const raw = (mime || blobMime || '').toLowerCase();
  if (raw === 'image/png' || raw === 'image/webp') return raw;
  return 'image/jpeg';
}

/** Checks the picker result before reading it. Throws CvPhotoError. */
export function assertCvPhotoAsset(asset: CvPhotoAsset): void {
  const mime = (asset.mimeType ?? '').toLowerCase();
  const ext = extFromName(asset.fileName);
  if (mime) {
    if (!ALLOWED_MIME.has(mime)) throw new CvPhotoError('INVALID_TYPE', ext || mime.replace('image/', ''));
  } else if (ext && !ALLOWED_EXT.has(ext)) {
    throw new CvPhotoError('INVALID_TYPE', ext);
  }
  if (typeof asset.fileSize === 'number' && asset.fileSize > CV_PHOTO_MAX_BYTES) {
    throw new CvPhotoError('TOO_LARGE', (asset.fileSize / (1024 * 1024)).toFixed(1));
  }
}

/**
 * Checks the bytes actually read. RN fetch of a file/content URI often reports
 * application/octet-stream, so only a non-allowed image/* type is refused.
 */
export function assertCvPhotoBlob(size: number, blobMime: string | null | undefined): void {
  if (size > CV_PHOTO_MAX_BYTES) {
    throw new CvPhotoError('TOO_LARGE', (size / (1024 * 1024)).toFixed(1));
  }
  const mime = (blobMime ?? '').toLowerCase();
  if (mime.startsWith('image/') && !ALLOWED_MIME.has(mime)) {
    throw new CvPhotoError('INVALID_TYPE', mime.replace('image/', ''));
  }
}

/** The API stores what we send; only an https URL within 2048 chars is saved. */
export function isSavableCvPhotoUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://') && url.length <= CV_PHOTO_URL_MAX;
}

/** Web copy for each failure. */
export function cvPhotoErrorMessage(err: unknown): string {
  if (err instanceof CvPhotoError) {
    switch (err.code) {
      case 'INVALID_TYPE':
        return t('cvEditor.photo.invalid', { ext: err.detail || t('cvEditor.photo.unknownType') });
      case 'TOO_LARGE':
        return t('cvEditor.photo.tooLarge', { size: err.detail || '5' });
      case 'PHOTO_UNAVAILABLE':
        return t('cvEditor.photo.unavailable');
      default:
        return t('cvEditor.photo.uploadFailed');
    }
  }
  return t('cvEditor.photo.uploadFailed');
}
