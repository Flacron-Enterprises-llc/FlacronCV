import { describe, it, expect } from 'vitest';
import { LEGAL_VERSION, LEGAL_LAST_UPDATED } from '@/legal/types';
import { LEGAL_VERSION_MAP } from '@/legal/versions';
import {
  DELETE_ACCOUNT,
  DELETE_ACCOUNT_PATH,
  DELETE_ACCOUNT_LAST_UPDATED,
} from './delete-account';

function flatten(doc: typeof DELETE_ACCOUNT): string {
  const bits: string[] = [];
  for (const block of [...doc.preamble, ...doc.sections.flatMap((s) => s.blocks)]) {
    if (block.type === 'p') bits.push(block.text);
    if (block.type === 'ul' || block.type === 'ol') bits.push(...block.items);
  }
  return bits.join('\n');
}

describe('DELETE_ACCOUNT copy', () => {
  const text = flatten(DELETE_ACCOUNT);

  it('is the Play delete-account URL, English-only, not a LEGAL_VERSION stamp', () => {
    expect(DELETE_ACCOUNT_PATH).toBe('/delete-account');
    expect(DELETE_ACCOUNT.lastUpdated).toBe('August 28, 2026');
    expect(DELETE_ACCOUNT_LAST_UPDATED).toBe('August 28, 2026');
    expect(DELETE_ACCOUNT.lastUpdated).not.toBe(LEGAL_LAST_UPDATED);
    expect(LEGAL_VERSION).toBe('2026-08-16');
    expect(DELETE_ACCOUNT).not.toHaveProperty('version');
    expect(LEGAL_VERSION_MAP).not.toHaveProperty('delete-account');
    expect(LEGAL_VERSION_MAP).not.toHaveProperty('deleteAccount');
  });

  it('names FlacronCV and does not claim uninstall deletes the account', () => {
    expect(DELETE_ACCOUNT.title).toContain('FlacronCV');
    expect(text).toMatch(/Uninstalling the FlacronCV app from your device does not delete your account/);
  });

  it('describes deactivation, not automated permanent erasure, on the Settings step', () => {
    expect(text).toMatch(/That step deactivates your account immediately/);
    expect(text).not.toMatch(/All your data will be permanently removed/);
    expect(text).toMatch(/contact@flacroncv.com/);
    expect(text).toMatch(/within 30 days/);
  });
});
