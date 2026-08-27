import { useMutation, useQueryClient } from '@tanstack/react-query';
// `expo-file-system` v19 replaced the flat API with `Paths` / `File` /
// `Directory`; `cacheDirectory` and `downloadAsync` now live behind the
// `/legacy` entrypoint. This file still uses the flat API, so importing the
// package root left `FileSystem.cacheDirectory` and `FileSystem.downloadAsync`
// as `undefined` — the download path became the string "undefined<filename>"
// and the call threw, i.e. mobile CV/cover-letter export was broken outright.
// Nothing surfaced it because the app had no ESLint config wired up.
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import { Alert } from 'react-native';
import { api } from '../lib/api';
import { ExportResponse } from '../types/api.types';
import {
  exportLimitReachedMessage,
  PAID_UPGRADES_ENABLED,
  upgradeAlertButtons,
} from '../config/paid-upgrades';

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

function nestErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) return '';
  const data = err.response?.data;
  if (!data || typeof data !== 'object') return '';
  const raw = (data as { message?: unknown }).message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === 'string').join(' ');
  return '';
}

function isLimitRejection(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 403) return false;
  const message = nestErrorMessage(err);
  return /export limit|limit reached/i.test(message);
}

function isDocxRejection(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 403) return false;
  return /docx/i.test(nestErrorMessage(err));
}

function exportRequestFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  if (isLimitRejection(err)) {
    return exportLimitReachedMessage();
  }
  if (isDocxRejection(err)) {
    return PAID_UPGRADES_ENABLED
      ? 'DOCX export requires a Pro plan or higher.'
      : 'DOCX export is not included in your current plan.';
  }
  return 'Could not export. Please try again.';
}

function alertExportRequestError(err: unknown): void {
  if (isLimitRejection(err)) {
    Alert.alert(
      'Export Limit Reached',
      exportRequestFailureMessage(err),
      upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
    );
    return;
  }
  Alert.alert('Could not export', exportRequestFailureMessage(err));
}

function normalizeExportPayload(
  raw: unknown,
  fallbackFilename: string,
): ExportResponse {
  // Envelope unwrap now lives in `api.ts`. This stays dual-shape on purpose:
  // central unwrap returns `{ downloadUrl, expiresAt }`, and the `.data` /
  // `url` branches remain so a missed unwrap cannot silently drop the file.
  // Do not "simplify" this back into a second envelope peel.
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

async function downloadAndShare(
  url: string,
  filename: string,
  dialogTitle: string,
  mimeType: string,
): Promise<void> {
  const localUri = FileSystem.cacheDirectory + filename;
  const downloadResult = await FileSystem.downloadAsync(url, localUri);

  if (downloadResult.status !== 200) {
    Alert.alert(
      'Could not export',
      'The file could not be downloaded. Please try again.',
    );
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloadResult.uri, { mimeType, dialogTitle });
    return;
  }

  Alert.alert(
    'Download complete',
    'Sharing is not available on this device. The file is saved in the app cache.',
  );
}

function alertDownloadError(): void {
  Alert.alert(
    'Could not export',
    'No connection. Check your network and try again.',
  );
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
        await downloadAndShare(
          data.url,
          data.filename,
          'Save or Share your CV',
          data.filename.endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
      } catch {
        alertDownloadError();
      }
    },
    onError: (err) => {
      alertExportRequestError(err);
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
        await downloadAndShare(
          data.url,
          data.filename,
          'Save or Share your Cover Letter',
          'application/pdf',
        );
      } catch {
        alertDownloadError();
      }
    },
    onError: (err) => {
      alertExportRequestError(err);
    },
  });
}
