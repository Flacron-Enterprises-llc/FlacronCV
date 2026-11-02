import { describe, expect, it } from 'vitest';
import { dedupeKey, isStaleListing, listingLabel, localRadiusMiles } from './opportunities';

describe('opportunity listing rules', () => {
  it('treats the same employer and title as one listing and keeps a paste separate', () => {
    const feed = { provider: 'adzuna', organization: 'Babbage Works', title: 'Ledger analyst', sourceId: 'a' };
    const board = { provider: 'greenhouse', organization: 'babbage  works', title: 'Ledger Analyst!', sourceId: 'b' };
    expect(dedupeKey(board)).toBe(dedupeKey(feed));
    const paste = { provider: 'paste', organization: 'Babbage Works', title: 'Ledger analyst', sourceId: 'ada:hash' };
    expect(dedupeKey(paste)).not.toBe(dedupeKey(feed));
  });

  it('labels a past deadline expired and leaves a missing deadline open', () => {
    expect(listingLabel('open', '2020-01-01', '2026-10-17')).toBe('expired');
    expect(listingLabel('open', null, '2026-10-17')).toBe('open');
    expect(listingLabel('closed', null, '2026-10-17')).toBe('expired');
  });

  it('caps local radius by plan', () => {
    expect(localRadiusMiles('free')).toBe(25);
    expect(localRadiusMiles('starter')).toBe(50);
    expect(localRadiusMiles('business')).toBe(200);
  });

  it('calls a listing stale after 14 days', () => {
    const now = Date.parse('2026-10-17T00:00:00Z');
    expect(isStaleListing('2026-10-01T00:00:00Z', now)).toBe(true);
    expect(isStaleListing('2026-10-10T00:00:00Z', now)).toBe(false);
  });
});
