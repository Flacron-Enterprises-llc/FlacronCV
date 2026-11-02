import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { ResumeFile } from '../../../../packages/career-api-client/src/types';

/**
 * Saves a career export to the app cache, opens the system share sheet, and
 * removes the temporary copy afterwards. Private documents are not kept on the
 * device longer than the share takes, and nothing about them is logged.
 * Same legacy file API as hooks/useExport.ts.
 */

const MIME: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** File name from a document title: letters, digits, dash and underscore only. */
export function safeFileName(title: string, format: 'pdf' | 'docx'): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'career-document'}.${format}`;
}

/** Uint8Array → base64 without Buffer (not available in React Native). */
export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += `${alphabet[(n >> 18) & 63]}${alphabet[(n >> 12) & 63]}==`;
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += `${alphabet[(n >> 18) & 63]}${alphabet[(n >> 12) & 63]}${alphabet[(n >> 6) & 63]}=`;
  }
  return out;
}

export type ShareOutcome = 'shared' | 'sharing_unavailable';

export async function shareCareerFile(file: ResumeFile, title: string, format: 'pdf' | 'docx'): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'sharing_unavailable';
  const uri = `${FileSystem.cacheDirectory}${Date.now()}-${safeFileName(title, format)}`;
  try {
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(file.bytes), { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: MIME[format], dialogTitle: title });
    return 'shared';
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

/** Same share-then-delete pattern for a text file (the personal-data export). */
export async function shareTextFile(text: string, fileName: string, mimeType: string): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'sharing_unavailable';
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName });
    return 'shared';
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
