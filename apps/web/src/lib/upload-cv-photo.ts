import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from './firebase';

export function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/** Same Storage prefix as the settings avatar (`avatars/{uid}/`). */
export async function uploadCvPhotoBlob(blob: Blob, ext = 'jpg'): Promise<string> {
  if (!storage || !auth?.currentUser) {
    throw new Error('PHOTO_UNAVAILABLE');
  }
  const uid = auth.currentUser.uid;
  const storageRef = ref(storage, `avatars/${uid}/cv-${Date.now()}.${ext}`);
  const contentType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType });
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      null,
      reject,
      async () => {
        resolve(await getDownloadURL(uploadTask.snapshot.ref));
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
