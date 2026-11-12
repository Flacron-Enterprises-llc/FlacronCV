import { getDownloadURL, ref, uploadBytes } from '@firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { getFirebaseAuth, getFirebaseStorage } from '../lib/firebase';
import {
  assertCvPhotoAsset,
  assertCvPhotoBlob,
  cvPhotoContentType,
  cvPhotoErrorMessage,
  cvPhotoExtension,
  CvPhotoError,
  cvPhotoStoragePath,
  isSavableCvPhotoUrl,
} from '../lib/cv-photo';
import { useAuthStore } from '../store/auth-store';

export type PickCvPhotoResult =
  | { status: 'uploaded'; url: string }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

/**
 * Picks an image from the library and uploads it to Firebase Storage under
 * the web's CV photo path (`avatars/{uid}/cv-{ts}.{ext}`). Returns the https
 * download URL; the caller writes it to the CV (personalInfo.photoURL) and
 * sets styling.showPhoto, exactly like the web editor. Same picker / upload
 * pattern as the profile avatar in useUser.ts.
 */
export function useCVPhoto() {
  const [isUploading, setIsUploading] = useState(false);

  const pickAndUpload = useCallback(async (): Promise<PickCvPhotoResult> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { status: 'permission-denied' };

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Square crop like the web's round avatar; also makes iOS return JPEG.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return { status: 'cancelled' };
    const asset = result.assets[0];
    if (!asset) return { status: 'cancelled' };

    setIsUploading(true);
    try {
      const photo = {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      };
      assertCvPhotoAsset(photo);

      const uid = useAuthStore.getState().firebaseUser?.uid ?? getFirebaseAuth().currentUser?.uid;
      if (!uid) throw new CvPhotoError('PHOTO_UNAVAILABLE');

      let blob: Blob;
      try {
        const response = await fetch(asset.uri);
        if (!response.ok) throw new CvPhotoError('READ_FAILED');
        blob = await response.blob();
      } catch (err) {
        if (err instanceof CvPhotoError) throw err;
        throw new CvPhotoError('READ_FAILED');
      }
      assertCvPhotoBlob(blob.size, blob.type);

      const storageRef = ref(
        getFirebaseStorage(),
        cvPhotoStoragePath(uid, Date.now(), cvPhotoExtension(photo)),
      );
      await uploadBytes(storageRef, blob, {
        contentType: cvPhotoContentType(photo.mimeType, blob.type),
      });
      const url = await getDownloadURL(storageRef);
      if (!isSavableCvPhotoUrl(url)) throw new CvPhotoError('UPLOAD_FAILED');
      return { status: 'uploaded', url };
    } catch (err) {
      return { status: 'error', message: cvPhotoErrorMessage(err) };
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { pickAndUpload, isUploading };
}
