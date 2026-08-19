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

/** API Puppeteer export body (before TransformInterceptor wrap). */
type ServerExportBody = { downloadUrl: string; expiresAt: string | Date };

/**
 * Filename choice (reported for the record):
 * 1. Last path segment of the signed URL (server stores `exports/{uid}/{uuid}.pdf|docx`).
 * 2. Fallback `cv-{id}.{format}` / `cover-letter-{id}.pdf` if the URL has no usable name.
 * We do not invent a pretty title from the document — the API does not return one.
 */
function filenameFromDownloadUrl(
  url: string,
  fallback: string,
): string {
  try {
    const path = url.split('?')[0] ?? url;
    const segment = path.split('/').filter(Boolean).pop();
    if (segment && /\.(pdf|docx)$/i.test(segment)) {
      return decodeURIComponent(segment);
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

function normalizeExportPayload(
  raw: unknown,
  fallbackFilename: string,
): ExportResponse {
  // api.post returns axios `response.data`. Nest TransformInterceptor wraps as
  // `{ success, data: T, timestamp }`; tolerate either the wrap or a bare body.
  const envelope = raw as { data?: ServerExportBody } & Partial<ServerExportBody> & Partial<ExportResponse>;
  const body: ServerExportBody | null =
    envelope?.downloadUrl
      ? { downloadUrl: envelope.downloadUrl, expiresAt: envelope.expiresAt as string | Date }
      : envelope?.data?.downloadUrl
        ? envelope.data
        : envelope?.url
          ? { downloadUrl: envelope.url, expiresAt: envelope.expiresAt as string | Date }
          : null;

  if (!body?.downloadUrl) {
    throw new Error('Export response missing downloadUrl');
  }

  const expiresAt =
    typeof body.expiresAt === 'string'
      ? body.expiresAt
      : body.expiresAt instanceof Date
        ? body.expiresAt.toISOString()
        : new Date(body.expiresAt as string | number).toISOString();

  return {
    url: body.downloadUrl,
    expiresAt,
    filename: filenameFromDownloadUrl(body.downloadUrl, fallbackFilename),
  };
}

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
      const raw = await api.post<unknown>(`/cvs/${cvId}/export/${format}`);
      return normalizeExportPayload(raw, `cv-${cvId}.${format}`);
    },
    onSuccess: async (data, { cvId }) => {
      qc.invalidateQueries({ queryKey: ['user'] });
      qc.invalidateQueries({ queryKey: ['cv', cvId] });

      try {
        const filename = data.filename;
        const localUri = FileSystem.cacheDirectory + filename;

        const downloadResult = await FileSystem.downloadAsync(data.url, localUri);

        if (downloadResult.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: filename.endsWith('.pdf')
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
      const raw = await api.post<unknown>(`/cover-letters/${clId}/export/pdf`);
      return normalizeExportPayload(raw, `cover-letter-${clId}.pdf`);
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
