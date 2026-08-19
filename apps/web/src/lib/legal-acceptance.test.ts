import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { needsAcceptance } from '@flacroncv/shared-types';
import { LEGAL_VERSION } from '@/legal/types';
import { LEGAL_VERSION_MAP } from '@/legal/versions';
import { api } from './api';
import {
  PENDING_LEGAL_ACCEPTANCE_KEY,
  clearAcceptancePending,
  currentLegalVersions,
  hasPendingAcceptance,
  recordAcceptanceAfterSignup,
  retryPendingLegalAcceptance,
  shouldPromptForAcceptance,
} from './legal-acceptance';

vi.mock('./api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}));

const current = {
  termsVersion: '2026-08-16',
  privacyVersion: '2026-08-16',
  disclaimerVersion: '2026-08-16',
};

const SRC = join(__dirname, '..');

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\./.test(p)) out.push(p);
  }
  return out;
}

describe('needsAcceptance / grandfathering', () => {
  it('does not prompt when there is no record (treatMissingAsStale defaults off)', () => {
    expect(needsAcceptance(null, current)).toBe(false);
    expect(shouldPromptForAcceptance(null)).toBe(false);
  });

  it('does not prompt when stored versions match the current map', () => {
    expect(
      needsAcceptance(
        {
          termsVersion: current.termsVersion,
          privacyVersion: current.privacyVersion,
          disclaimerVersion: current.disclaimerVersion,
        },
        current,
      ),
    ).toBe(false);
  });

  it('prompts when a stored version differs (re-consent mechanism)', () => {
    expect(
      needsAcceptance(
        {
          termsVersion: '2019-01-01',
          privacyVersion: current.privacyVersion,
          disclaimerVersion: current.disclaimerVersion,
        },
        current,
      ),
    ).toBe(true);
  });

  it('only prompts on a missing record when treatMissingAsStale is explicitly true', () => {
    expect(needsAcceptance(null, current, true)).toBe(true);
  });
});

describe('privacy version gap until B.1', () => {
  it('stamps privacyVersion from LEGAL_VERSION_MAP while the live body is still locale-json', () => {
    expect(currentLegalVersions().privacyVersion).toBe(LEGAL_VERSION_MAP.privacy.version);
    expect(currentLegalVersions().privacyVersion).toBe(LEGAL_VERSION);
    expect(LEGAL_VERSION_MAP.privacy.status).toBe('pending-client-subprocessors');
    expect(LEGAL_VERSION_MAP.privacy.liveSource).toBe('locale-json');
  });
});

describe('treatMissingAsStale is not flipped in this batch', () => {
  it('no production caller passes true', () => {
    const hits: string[] = [];
    for (const file of walkTs(SRC)) {
      const src = readFileSync(file, 'utf8');
      if (/shouldPromptForAcceptance\([^)]*,\s*true/.test(src)) hits.push(file);
      if (/needsAcceptance\([^)]*,\s*[^)]*,\s*true/.test(src)) hits.push(file);
      if (/treatMissingAsStale\s*=\s*true/.test(src) && !file.endsWith('legal-acceptance.types.ts')) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('session retry after a failed write', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(api.post).mockReset();
  });

  it('keeps the pending flag and does not throw when the write fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('unavailable'));
    await expect(recordAcceptanceAfterSignup()).resolves.toBeUndefined();
    expect(hasPendingAcceptance()).toBe(true);
    expect(sessionStorage.getItem(PENDING_LEGAL_ACCEPTANCE_KEY)).toBe('1');
  });

  it('clears the pending flag when the write succeeds', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await recordAcceptanceAfterSignup();
    expect(hasPendingAcceptance()).toBe(false);
  });

  it('retries only when the session flag is set — grandfathered sign-in does not POST', async () => {
    clearAcceptancePending();
    await retryPendingLegalAcceptance();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('retries the write when the session flag is set', async () => {
    sessionStorage.setItem(PENDING_LEGAL_ACCEPTANCE_KEY, '1');
    vi.mocked(api.post).mockResolvedValueOnce({});
    await retryPendingLegalAcceptance();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(hasPendingAcceptance()).toBe(false);
  });
});

describe('grandfather: existing users keep the product', () => {
  it('DashboardShell does not gate on legal acceptance', () => {
    const src = readFileSync(join(SRC, 'components/dashboard/DashboardShell.tsx'), 'utf8');
    expect(src).not.toMatch(/needsAcceptance|shouldPromptForAcceptance|legalAcceptances|LegalAcceptance/);
  });

  it('login Google does not open the legal modal', () => {
    const src = readFileSync(join(SRC, 'app/[locale]/(auth)/login/page.tsx'), 'utf8');
    expect(src).not.toMatch(/LegalAcceptanceModal|recordAcceptanceAfterSignup/);
  });
});
