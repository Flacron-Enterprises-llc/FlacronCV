import { updateProfile } from '@firebase/auth';
import { getDownloadURL, ref, uploadBytes } from '@firebase/storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getFirebaseAuth, getFirebaseStorage } from '../lib/firebase';
import { useAuthStore } from '../store/auth-store';
import { User } from '../types/user.types';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function useCurrentUser() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return useQuery({
    queryKey: ['user', firebaseUser?.uid],
    queryFn: () => api.get<User>('/users/me'),
    enabled: isInitialized && !!firebaseUser?.uid,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { firebaseUser } = useAuthStore();
  return useMutation({
    mutationFn: (data: Partial<User>) => api.put<User>('/users/me', data),
    onSuccess: async (updated) => {
      qc.setQueryData(['user', firebaseUser?.uid], updated);
      // Auth store feeds settings header / dashboard name — keep it in sync.
      await useAuthStore.getState().syncUser();
    },
  });
}

export type ProfilePhotoAsset = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

function photoExtension(asset: ProfilePhotoAsset): string {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  if (fromName === 'png' || fromName === 'webp') return fromName;
  if (fromName === 'jpeg' || fromName === 'jpg') return 'jpg';
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function storageContentType(mime: string, blobMime: string): string {
  const raw = (mime || blobMime).toLowerCase();
  if (raw === 'image/png' || raw === 'image/webp') return raw;
  return 'image/jpeg';
}

async function persistPhotoUrl(photoURL: string | null): Promise<User> {
  const current = getFirebaseAuth().currentUser;
  if (current) {
    await updateProfile(current, { photoURL: photoURL ?? '' });
  }
  return api.put<User>('/users/me', { photoURL });
}

export function useUploadProfilePhoto() {
  const qc = useQueryClient();
  const { firebaseUser } = useAuthStore();

  return useMutation({
    mutationFn: async (asset: ProfilePhotoAsset) => {
      const uid = firebaseUser?.uid ?? getFirebaseAuth().currentUser?.uid;
      if (!uid) {
        throw new Error('You must be signed in to change your photo.');
      }

      const mime = (asset.mimeType ?? '').toLowerCase();
      if (mime && !ALLOWED_MIME.has(mime)) {
        throw new Error('Please choose a JPEG, PNG, or WebP image.');
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PHOTO_BYTES) {
        throw new Error('Photo must be 5 MB or smaller.');
      }

      const response = await fetch(asset.uri);
      if (!response.ok) {
        throw new Error('Could not read the selected photo.');
      }
      const blob = await response.blob();
      if (blob.size > MAX_PHOTO_BYTES) {
        throw new Error('Photo must be 5 MB or smaller.');
      }

      // RN fetch of a content/file URI often reports application/octet-stream.
      // Only reject when the blob actually claims a non-allowed image type.
      const blobMime = (blob.type ?? '').toLowerCase();
      if (blobMime.startsWith('image/') && !ALLOWED_MIME.has(blobMime)) {
        throw new Error('Please choose a JPEG, PNG, or WebP image.');
      }

      const contentType = storageContentType(mime, blobMime);

      const storageRef = ref(
        getFirebaseStorage(),
        `avatars/${uid}/${Date.now()}.${photoExtension(asset)}`,
      );
      await uploadBytes(storageRef, blob, { contentType });
      const downloadURL = await getDownloadURL(storageRef);
      return persistPhotoUrl(downloadURL);
    },
    onSuccess: async (updated) => {
      qc.setQueryData(['user', firebaseUser?.uid], updated);
      await useAuthStore.getState().syncUser();
    },
  });
}

export function useRemoveProfilePhoto() {
  const qc = useQueryClient();
  const { firebaseUser } = useAuthStore();

  return useMutation({
    mutationFn: () => persistPhotoUrl(null),
    onSuccess: async (updated) => {
      qc.setQueryData(['user', firebaseUser?.uid], updated);
      await useAuthStore.getState().syncUser();
    },
  });
}
