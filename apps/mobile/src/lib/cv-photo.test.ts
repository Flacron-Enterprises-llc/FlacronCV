import { describe, expect, it } from 'vitest';
import {
  assertCvPhotoAsset,
  assertCvPhotoBlob,
  CV_PHOTO_MAX_BYTES,
  CV_PHOTO_UNAVAILABLE,
  CV_PHOTO_UPLOAD_FAILED,
  cvPhotoContentType,
  CvPhotoError,
  cvPhotoErrorMessage,
  cvPhotoExtension,
  cvPhotoStoragePath,
  isSavableCvPhotoUrl,
} from './cv-photo';

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof CvPhotoError ? err.code : 'OTHER';
  }
}

describe('cv photo storage path', () => {
  it('uses the web prefix avatars/{uid}/cv-{ts}.{ext}', () => {
    expect(cvPhotoStoragePath('uid123', 1700000000000, 'jpg')).toBe('avatars/uid123/cv-1700000000000.jpg');
    expect(cvPhotoStoragePath('uid123', 1.9, 'png')).toBe('avatars/uid123/cv-1.png');
  });

  it('refuses a missing or path-like uid', () => {
    expect(codeOf(() => cvPhotoStoragePath('', 1, 'jpg'))).toBe('PHOTO_UNAVAILABLE');
    expect(codeOf(() => cvPhotoStoragePath('a/b', 1, 'jpg'))).toBe('PHOTO_UNAVAILABLE');
  });

  it('picks the extension from the file name, then the mime type', () => {
    expect(cvPhotoExtension({ fileName: 'me.PNG' })).toBe('png');
    expect(cvPhotoExtension({ fileName: 'me.jpeg' })).toBe('jpg');
    expect(cvPhotoExtension({ fileName: null, mimeType: 'image/webp' })).toBe('webp');
    expect(cvPhotoExtension({})).toBe('jpg');
  });

  it('always uploads an image/* content type', () => {
    expect(cvPhotoContentType('image/png')).toBe('image/png');
    expect(cvPhotoContentType('', 'image/webp')).toBe('image/webp');
    expect(cvPhotoContentType(null, 'application/octet-stream')).toBe('image/jpeg');
    expect(cvPhotoContentType('image/jpg')).toBe('image/jpeg');
  });
});

describe('cv photo type and size rules (web: JPG/PNG/WebP, 5 MB)', () => {
  it('accepts jpeg/png/webp within 5 MB', () => {
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', mimeType: 'image/jpeg', fileSize: 1000 }))).toBeNull();
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', mimeType: 'image/png', fileSize: CV_PHOTO_MAX_BYTES }))).toBeNull();
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', fileName: 'a.webp' }))).toBeNull();
  });

  it('rejects other types by mime or extension', () => {
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', mimeType: 'image/gif' }))).toBe('INVALID_TYPE');
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', mimeType: 'image/heic', fileName: 'x.heic' }))).toBe('INVALID_TYPE');
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', fileName: 'doc.pdf' }))).toBe('INVALID_TYPE');
  });

  it('rejects files over 5 MB before and after reading', () => {
    expect(codeOf(() => assertCvPhotoAsset({ uri: 'f', mimeType: 'image/jpeg', fileSize: CV_PHOTO_MAX_BYTES + 1 }))).toBe('TOO_LARGE');
    expect(codeOf(() => assertCvPhotoBlob(CV_PHOTO_MAX_BYTES + 1, 'image/jpeg'))).toBe('TOO_LARGE');
    expect(codeOf(() => assertCvPhotoBlob(10, 'application/octet-stream'))).toBeNull();
    expect(codeOf(() => assertCvPhotoBlob(10, 'image/gif'))).toBe('INVALID_TYPE');
  });

  it('only saves an https URL within 2048 characters', () => {
    expect(isSavableCvPhotoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg')).toBe(true);
    expect(isSavableCvPhotoUrl('http://127.0.0.1:9199/a.jpg')).toBe(false);
    expect(isSavableCvPhotoUrl(`https://${'a'.repeat(2048)}`)).toBe(false);
    expect(isSavableCvPhotoUrl(null)).toBe(false);
  });

  it('uses the web error copy', () => {
    expect(cvPhotoErrorMessage(new CvPhotoError('INVALID_TYPE', 'gif'))).toBe(
      '“.gif” files aren’t supported. Please upload a JPG, PNG, or WebP image.',
    );
    expect(cvPhotoErrorMessage(new CvPhotoError('TOO_LARGE', '6.2'))).toBe(
      'That file is too large (6.2 MB). The maximum size is 5 MB.',
    );
    expect(cvPhotoErrorMessage(new CvPhotoError('PHOTO_UNAVAILABLE'))).toBe(CV_PHOTO_UNAVAILABLE);
    expect(cvPhotoErrorMessage(new Error('storage/unauthorized'))).toBe(CV_PHOTO_UPLOAD_FAILED);
  });
});
