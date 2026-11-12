import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AccountExport } from '../../../../../packages/career-api-client/src/types';
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

export const EXPORT_FAILED = 'The export could not be prepared. Try again in a few minutes.';
export const NOTHING_TO_EXPORT = 'There is no career data to export.';

export function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_found') return NOTHING_TO_EXPORT;
  return careerErrorMessage(error, EXPORT_FAILED);
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
