import { describe, expect, it } from 'vitest';
import type { ApiKeyView } from '../../../../../packages/career-api-client/src/types';
import {
  attributionValid,
  developerMode,
  environmentLabel,
  keyCreatedLine,
  keyPrefixLabel,
  rateLimitsLine,
  sortKeys,
  withCreatedKey,
  withRevokedKey,
} from './developer';

const key = (over: Partial<ApiKeyView>): ApiKeyView => ({
  id: 'k1',
  prefix: 'flc_test_ab',
  environment: 'test',
  createdAt: '2026-11-01T00:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  ...over,
});

describe('developer page', () => {
  it('is coming soon only without any add-on or key', () => {
    expect(developerMode({ apiPackage: false, whiteLabel: false, brand: null })).toEqual({ soon: true, keys: false, brand: false });
    expect(developerMode({ apiPackage: false, whiteLabel: false, brand: null, keys: [key({})] }).soon).toBe(false);
    expect(developerMode({ apiPackage: true, whiteLabel: false, brand: null })).toEqual({ soon: false, keys: true, brand: false });
  });

  it('words environments and rate limits, with the website defaults', () => {
    expect(environmentLabel('test')).toBe('Test');
    expect(environmentLabel('live')).toBe('Live');
    expect(rateLimitsLine({})).toMatch(/30 requests a minute for test keys and 120 for live/);
    expect(rateLimitsLine({ rateLimits: { test: 5, live: 9 } })).toMatch(/5 requests .* 9 for live/);
  });

  it('shows only the prefix of a key', () => {
    expect(keyPrefixLabel(key({}))).toBe('flc_test_ab…');
    expect(keyCreatedLine(key({}))).toMatch(/^created /);
  });

  it('adds a created key without its secret and marks a revoked one', () => {
    const now = new Date('2026-11-14T00:00:00.000Z');
    const list = withCreatedKey([key({})], { id: 'k2', token: 'flc_live_SECRET', prefix: 'flc_live_cd', environment: 'live' }, now);
    expect(list[0]).toEqual({ id: 'k2', prefix: 'flc_live_cd', environment: 'live', createdAt: now.toISOString(), lastUsedAt: null, revokedAt: null });
    expect(JSON.stringify(list)).not.toContain('SECRET');
    const revoked = withRevokedKey(list, 'k1', now);
    expect(revoked[1].revokedAt).toBe(now.toISOString());
    expect(withRevokedKey(revoked, 'k1', new Date(0))[1].revokedAt).toBe(now.toISOString());
  });

  it('sorts active keys first, newest first', () => {
    const sorted = sortKeys([
      key({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
      key({ id: 'gone', createdAt: '2026-12-01T00:00:00Z', revokedAt: '2026-12-02T00:00:00Z' }),
      key({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }),
    ]);
    expect(sorted.map((k) => k.id)).toEqual(['new', 'old', 'gone']);
  });

  it('requires FlacronCV in the attribution', () => {
    expect(attributionValid('Powered by FlacronCV')).toBe(true);
    expect(attributionValid('Powered by us')).toBe(false);
  });
});
