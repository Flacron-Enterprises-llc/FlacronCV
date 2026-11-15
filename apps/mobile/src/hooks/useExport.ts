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
import { t } from '../i18n';
import { api } from '../lib/api';
import { ExportResponse } from '../types/api.types';
import { useAuthStore } from '../store/auth-store';
import {
  docxNotIncludedMessage,
  exportLimitReachedMessage,
  upgradeAlertButtons,
} from '../config/paid-upgrades';
import { planForDisplay } from '../lib/entitlements';

/** The signed-in account's effective plan, for limit copy (null before the account loads). */
function currentPlan(): string | undefined {
  const user = useAuthStore.getState().user;
  return user ? planForDisplay(user.subscription) : undefined;
}

/** API Puppeteer export body (before TransformInterceptor wrap). */
type ServerExportBody = { downloadUrl: string; expiresAt: string | Date };

/**
 * Filename choice (reported for the record):
 * 1. Last path segment of the signed URL (server stores `exports/{uid}/{uuid}.pdf|docx`).
 * 2. Fallback `cv-{id}.{format}` / `cover-letter-{id}.{format}` if the URL has no usable name.
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
    return t('common.noConnection');
  }
  if (isLimitRejection(err)) {
    return exportLimitReachedMessage(currentPlan());
  }
  if (isDocxRejection(err)) {
    return docxNotIncludedMessage(currentPlan());
  }
  return t('exports.failed');
}

function alertExportRequestError(err: unknown): void {
  if (isLimitRejection(err)) {
    Alert.alert(
      t('exports.limitTitle'),
      exportRequestFailureMessage(err),
      upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
    );
    return;
  }
  if (isDocxRejection(err)) {
    Alert.alert(
      t('exports.failedTitle'),
      exportRequestFailureMessage(err),
      upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
    );
    return;
  }
  Alert.alert(t('exports.failedTitle'), exportRequestFailureMessage(err));
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
    Alert.alert(t('exports.failedTitle'), t('exports.downloadFailed'));
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(downloadResult.uri, { mimeType, dialogTitle });
    return;
  }

  Alert.alert(t('exports.downloadCompleteTitle'), t('exports.downloadCompleteBody'));
}

function alertDownloadError(): void {
  Alert.alert(t('exports.failedTitle'), t('common.noConnection'));
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
      await useAuthStore.getState().syncUser();

      try {
        await downloadAndShare(
          data.url,
          data.filename,
          t('exports.shareCvTitle'),
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

/**
 * POST /cover-letters/:id/export/pdf|docx, then download and open the share
 * sheet — same flow as useExportCV. The server renders the SAVED letter, so
 * callers save pending edits first. DOCX is paid-only server-side (403 handled
 * by alertExportRequestError).
 */
export function useExportCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clId,
      format,
    }: {
      clId: string;
      format: 'pdf' | 'docx';
    }) => {
      const raw = await api.post<unknown>(`/cover-letters/${clId}/export/${format}`);
      return normalizeExportPayload(raw, `cover-letter-${clId}.${format}`);
    },
    onSuccess: async (data) => {
      qc.invalidateQueries({ queryKey: ['user'] });
      await useAuthStore.getState().syncUser();

      try {
        await downloadAndShare(
          data.url,
          data.filename,
          t('exports.shareCoverLetterTitle'),
          data.filename.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
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
