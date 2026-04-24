import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
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
    mutationFn: (data: Partial<User>) => api.patch<User>('/users/me', data),
    onSuccess: (updated) => {
      qc.setQueryData(['user', firebaseUser?.uid], updated);
    },
  });
}

export function useUploadProfilePhoto() {
  const qc = useQueryClient();
  const { firebaseUser } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert('Permission required', 'Please allow access to your photos.');
        throw new Error('Permission denied');
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        throw new Error('Cancelled');
      }

      const asset = pickerResult.assets[0];
      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        type: 'image/jpeg',
        name: 'profile.jpg',
      } as unknown as Blob);

      return api.postForm<{ photoURL: string }>(`/users/${firebaseUser!.uid}/photo`, formData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', firebaseUser?.uid] });
    },
  });
}
