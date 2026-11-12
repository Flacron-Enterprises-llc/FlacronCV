import { useMutation } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { shareTextFile } from '../../lib/career-files';
import { exportFileName, formatExportText, prepareExport } from '../../lib/career/data';

export type CareerExportResult =
  | { kind: 'shared' }
  | { kind: 'failed' }
  /** The file is ready but could not be fetched or shared here; the signed link still works until it expires. */
  | { kind: 'link_only'; url: string; reason: 'download_failed' | 'sharing_unavailable' };

/**
 * Prepares the personal career export (same request and polling as the
 * website), downloads the JSON from the short-lived signed link, and opens the
 * share sheet from a temporary copy that is removed afterwards. Works whatever
 * the career plan, like the website, so leaving a plan never traps data.
 */
export function useCareerExport() {
  return useMutation({
    mutationFn: async (): Promise<CareerExportResult> => {
      const prepared = await prepareExport({
        createExport: () => careerApi.createExport('personal'),
        accountExport: (id) => careerApi.accountExport(id),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      if (prepared.kind === 'failed') return { kind: 'failed' };
      let text: string;
      try {
        const response = await fetch(prepared.url);
        if (!response.ok) return { kind: 'link_only', url: prepared.url, reason: 'download_failed' };
        text = await response.text();
      } catch {
        return { kind: 'link_only', url: prepared.url, reason: 'download_failed' };
      }
      const outcome = await shareTextFile(formatExportText(text), exportFileName(new Date()), 'application/json');
      return outcome === 'shared' ? { kind: 'shared' } : { kind: 'link_only', url: prepared.url, reason: 'sharing_unavailable' };
    },
  });
}
