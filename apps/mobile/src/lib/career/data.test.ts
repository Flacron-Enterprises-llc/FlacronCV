import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AccountExport } from '../../../../../packages/career-api-client/src/types';
import { EXPORT_FAILED, exportErrorMessage, exportFileName, formatExportText, NOTHING_TO_EXPORT, prepareExport } from './data';

function deps(sequence: AccountExport[], created: AccountExport = { id: 'e1', status: 'queued' }) {
  const sleeps: number[] = [];
  const polled: string[] = [];
  return {
    sleeps,
    polled,
    run: (polls?: number) =>
      prepareExport({
        createExport: async () => created,
        accountExport: async (id) => {
          polled.push(id);
          return sequence.shift() ?? { id, status: 'queued' };
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        polls,
      }),
  };
}

describe('prepareExport', () => {
  it('polls until the file is ready', async () => {
    const d = deps([{ id: 'e1', status: 'queued' }, { id: 'e1', status: 'ready', url: 'https://x/f', expiresAt: '2026-01-01T00:00:00Z' }]);
    await expect(d.run()).resolves.toEqual({ kind: 'ready', url: 'https://x/f', expiresAt: '2026-01-01T00:00:00Z' });
    expect(d.polled).toEqual(['e1', 'e1']);
    expect(d.sleeps).toEqual([1500, 1500]);
  });

  it('gives up after the polling budget', async () => {
    const d = deps([]);
    await expect(d.run(3)).resolves.toEqual({ kind: 'failed' });
    expect(d.polled).toHaveLength(3);
  });

  it('treats failed or link-less results as failed', async () => {
    await expect(deps([{ id: 'e1', status: 'failed' }]).run()).resolves.toEqual({ kind: 'failed' });
    await expect(deps([{ id: 'e1', status: 'ready' }]).run()).resolves.toEqual({ kind: 'failed' });
  });
});

describe('export view', () => {
  it('uses website wording for errors', () => {
    expect(exportErrorMessage(new ApiError(404, 'not_found', { code: 'not_found' }))).toBe(NOTHING_TO_EXPORT);
    expect(exportErrorMessage(new Error('x'))).toBe(EXPORT_FAILED);
    expect(exportErrorMessage(new ApiError(0, 'network_error', { code: 'network_error' }))).toMatch(/No connection/);
  });

  it('names and formats the file', () => {
    expect(exportFileName(new Date('2026-11-12T10:00:00Z'))).toBe('flacroncv-career-data-2026-11-12.json');
    expect(formatExportText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(formatExportText('not json')).toBe('not json');
  });
});
