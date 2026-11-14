import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';

export function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/**
 * Give up on a photo upload after this long.
 *
 * The Storage SDK retries a failing upload with backoff for up to
 * `maxUploadRetryTime` (10 minutes by default) and reports nothing while it
 * does — so when Storage is unreachable the editor sat on a spinner for ten
 * minutes. A 400px JPEG is ~50 KB; 30 s is generous on any working connection.
 */
export const PHOTO_UPLOAD_TIMEOUT_MS = 30_000;

/** Same Storage prefix as the settings avatar (`avatars/{uid}/`). */
export async function uploadCvPhotoBlob(
  blob: Blob,
  ext = 'jpg',
  timeoutMs: number = PHOTO_UPLOAD_TIMEOUT_MS,
): Promise<string> {
  // Two different problems, two different messages in the editor: no signed-in
  // user is fixed by signing in again; Storage not being configured or reachable
  // is not the user's session at all.
  if (!auth?.currentUser) {
    throw new Error('PHOTO_SIGNED_OUT');
  }
  if (!storage) {
    throw new Error('PHOTO_STORAGE_UNAVAILABLE');
  }
  const uid = auth.currentUser.uid;
  const storageRef = ref(storage, `avatars/${uid}/cv-${Date.now()}.${ext}`);
  const contentType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      // Stop the SDK's background retries too, not just our wait for them.
      try { uploadTask.cancel(); } catch { /* already finished */ }
      finish(() => reject(new Error('PHOTO_UPLOAD_TIMEOUT')));
    }, timeoutMs);
    uploadTask.on(
      'state_changed',
      null,
      (err) => finish(() => reject(err)),
      () => {
        // getDownloadURL is a second network call; keep it under the same timer.
        getDownloadURL(uploadTask.snapshot.ref).then(
          (url) => finish(() => resolve(url)),
          (err) => finish(() => reject(err)),
        );
      },
    );
  });
}

export async function uploadCvPhotoDataUrl(dataUrl: string): Promise<string> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('PHOTO_READ_FAILED');
  }
  const blob = await response.blob();
  return uploadCvPhotoBlob(blob, 'jpg');
}

/** Replace an inlined data URL with a Storage https URL; leave other values alone. */
export async function resolveCvPhotoForSave(
  photoURL: string | null | undefined,
): Promise<string | null | undefined> {
  if (!isDataUrl(photoURL)) return photoURL;
  return uploadCvPhotoDataUrl(photoURL as string);
}
