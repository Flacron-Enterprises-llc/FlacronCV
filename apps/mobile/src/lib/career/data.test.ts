import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AccountExport } from '../../../../../packages/career-api-client/src/types';
import {
  ERASE_CONFIRM_WORD,
  eraseCareerData,
  eraseConfirmed,
  eraseResultMessage,
  EXPORT_FAILED,
  exportErrorMessage,
  exportFileName,
  formatExportText,
  NOTHING_TO_EXPORT,
  prepareExport,
} from './data';

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

describe('eraseCareerData (career data only)', () => {
  const run = (deleteAccount: (input: { idToken: string; confirm: string }) => Promise<unknown>, freshIdToken = async () => 'fresh-token') =>
    eraseCareerData({ deleteAccount, freshIdToken });

  it('sends the website request: a fresh token and the word DELETE', async () => {
    const calls: unknown[] = [];
    await expect(run(async (input) => calls.push(input))).resolves.toBe('erased');
    expect(calls).toEqual([{ idToken: 'fresh-token', confirm: 'DELETE' }]);
  });

  it('maps the career service answers to the website messages', async () => {
    await expect(run(async () => { throw new ApiError(404, 'not_found', { code: 'not_found' }); })).resolves.toBe('none');
    await expect(run(async () => { throw new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'stale' }); })).resolves.toBe('stale');
    await expect(run(async () => { throw new ApiError(400, 'validation_error', { code: 'validation_error' }); })).resolves.toBe('failed');
    await expect(run(async () => { throw new Error('network'); })).resolves.toBe('failed');
    expect(eraseResultMessage('erased')).toBe('Your career data has been erased.');
    expect(eraseResultMessage('none')).toBe('There is no career data to erase.');
    expect(eraseResultMessage('stale')).toBe('For your security, sign out and sign in again, then erase within five minutes.');
    expect(eraseResultMessage('failed')).toBe('Career data could not be erased completely. Nothing else was changed. Try again.');
  });

  it('never calls the service without a session token', async () => {
    let called = false;
    const result = await run(async () => { called = true; }, async () => { throw new Error('signed out'); });
    expect(result).toBe('stale');
    expect(called).toBe(false);
  });

  it('accepts only the exact word', () => {
    expect(ERASE_CONFIRM_WORD).toBe('DELETE');
    expect(eraseConfirmed('DELETE')).toBe(true);
    expect(eraseConfirmed('delete')).toBe(false);
    expect(eraseConfirmed(' DELETE')).toBe(false);
  });
});
