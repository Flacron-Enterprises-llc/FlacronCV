import { useMutation, useQueryClient } from '@tanstack/react-query';
// `expo-file-system` v19 replaced the flat API with `Paths` / `File` /
// `Directory`; `cacheDirectory` and `downloadAsync` now live behind the
// `/legacy` entrypoint. This file still uses the flat API, so importing the
// package root left `FileSystem.cacheDirectory` and `FileSystem.downloadAsync`
// as `undefined` — the download path became the string "undefined<filename>"
// and the call threw, i.e. mobile CV/cover-letter export was broken outright.
// Nothing surfaced it because the app had no ESLint config wired up.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { api } from '../lib/api';
import { ExportResponse } from '../types/api.types';

export function useExportCV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cvId,
      format,
    }: {
      cvId: string;
      format: 'pdf' | 'docx';
    }) => {
      const response = await api.post<ExportResponse>(`/exports/cv/${cvId}/${format}`);
      return response;
    },
    onSuccess: async (data, { cvId }) => {
      // Invalidate user usage (download count changed)
      qc.invalidateQueries({ queryKey: ['user'] });
      qc.invalidateQueries({ queryKey: ['cv', cvId] });

      // Download and share
      try {
        const filename = data.filename;
        const localUri = FileSystem.cacheDirectory + filename;

        const downloadResult = await FileSystem.downloadAsync(data.url, localUri);

        if (downloadResult.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              dialogTitle: 'Save or Share your CV',
            });
          } else {
            Alert.alert('Success', 'File saved to device');
          }
        }
      } catch {
        Alert.alert('Error', 'Failed to download file');
      }
    },
  });
}

export function useExportCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clId: string) => {
      const response = await api.post<ExportResponse>(`/exports/cover-letter/${clId}/pdf`);
      return response;
    },
    onSuccess: async (data) => {
      qc.invalidateQueries({ queryKey: ['user'] });

      try {
        const localUri = FileSystem.cacheDirectory + data.filename;
        const downloadResult = await FileSystem.downloadAsync(data.url, localUri);

        if (downloadResult.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Save or Share your Cover Letter',
            });
          }
        }
      } catch {
        Alert.alert('Error', 'Failed to download file');
      }
    },
  });
}
