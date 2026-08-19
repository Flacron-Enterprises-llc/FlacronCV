import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { User } from '../types/user.types';

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
    onSuccess: (updated) => {
      qc.setQueryData(['user', firebaseUser?.uid], updated);
    },
  });
}

export function useUploadProfilePhoto() {
  // TODO(mobile-photo): Profile photo upload is disabled until a Storage path
  // exists. Design (mirrors web): upload the image to Firebase Storage, then
  // PUT /users/me { photoURL } with the resulting download URL. Do NOT invent
  // POST /users/:uid/photo — that route does not exist on the API.
  // When building: enable the settings avatar control and reintroduce
  // ImagePicker + upload here.
  return useMutation({
    mutationFn: async () => {
      throw new Error('Profile photo upload is not available in this build.');
    },
  });
}
