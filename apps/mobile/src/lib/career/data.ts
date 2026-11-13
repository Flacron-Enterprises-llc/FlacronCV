import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AccountExport } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Career data export (website: /career/data, CareerDataScreen). The career
 * service prepares a JSON file of every career record and returns a short-lived
 * signed link. Same polling budget as the website: 20 checks, 1.5 s apart.
 */

export const EXPORT_POLLS = 20;
export const EXPORT_POLL_MS = 1500;

export type PreparedExport =
  | { kind: 'ready'; url: string; expiresAt: string | null }
  | { kind: 'failed' };

export async function prepareExport(deps: {
  createExport: () => Promise<{ id: string; status: AccountExport['status'] }>;
  accountExport: (id: string) => Promise<AccountExport>;
  sleep: (ms: number) => Promise<void>;
  polls?: number;
  intervalMs?: number;
}): Promise<PreparedExport> {
  const polls = deps.polls ?? EXPORT_POLLS;
  const interval = deps.intervalMs ?? EXPORT_POLL_MS;
  let current: AccountExport = await deps.createExport();
  for (let i = 0; current.status === 'queued' && i < polls; i++) {
    await deps.sleep(interval);
    current = await deps.accountExport(current.id);
  }
  if (current.status === 'ready' && current.url) {
    return { kind: 'ready', url: current.url, expiresAt: current.expiresAt ?? null };
  }
  return { kind: 'failed' };
}

/** Website wording (`career.data.export_failed`), in the current language. */
export function exportFailedMessage(): string {
  return t('careerModes.data.export.failed');
}

export function nothingToExportMessage(): string {
  return t('careerModes.data.export.nothing');
}

/**
 * The same messages, read once when this module loads (English unless a
 * language was already chosen). Kept for callers comparing results; screens
 * use the functions above so the text follows the current language.
 */
export const EXPORT_FAILED = exportFailedMessage();
export const NOTHING_TO_EXPORT = nothingToExportMessage();

export function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_found') return nothingToExportMessage();
  return careerErrorMessage(error, exportFailedMessage());
}

export function exportFileName(now: Date): string {
  return `flacroncv-career-data-${now.toISOString().slice(0, 10)}.json`;
}

/** Pretty-prints the downloaded JSON for reading; anything else is kept byte for byte. */
export function formatExportText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * Erase career data only (website: /career/data, CareerDataScreen `erase`).
 * The FlacronCV account, CVs, cover letters, Job Tracker and subscription are
 * not touched. Same request as the website: `POST /account/delete` on the
 * career API with the typed word `DELETE` (not translated, so the same word
 * works on both sites) and a freshly fetched ID token; the career service
 * refuses an erase from an old sign-in (`validation_error`, reason `stale`).
 */
export const ERASE_CONFIRM_WORD = 'DELETE';

export type CareerEraseResult = 'erased' | 'none' | 'stale' | 'failed';

export function eraseConfirmed(typed: string): boolean {
  return typed === ERASE_CONFIRM_WORD;
}

export async function eraseCareerData(deps: {
  deleteAccount: (input: { idToken: string; confirm: string }) => Promise<unknown>;
  freshIdToken: () => Promise<string>;
}): Promise<CareerEraseResult> {
  let idToken: string;
  try {
    idToken = await deps.freshIdToken();
  } catch {
    // No session to refresh: the person has to sign in again.
    return 'stale';
  }
  try {
    await deps.deleteAccount({ idToken, confirm: ERASE_CONFIRM_WORD });
    return 'erased';
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') return 'none';
    if (error instanceof ApiError && error.code === 'validation_error' && error.body.reason === 'stale') return 'stale';
    return 'failed';
  }
}

/** Website wording (`career.data.erased` / `nothing_to_erase` / `sign_in_again` / `erase_failed`). */
export function eraseResultMessage(result: CareerEraseResult): string {
  if (result === 'erased') return t('careerHub.erase.erased');
  if (result === 'none') return t('careerHub.erase.nothing');
  if (result === 'stale') return t('careerHub.erase.signInAgain');
  return t('careerHub.erase.failed');
}
