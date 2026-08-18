import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACCEPT_ALL,
  PREFERENCE_STORAGE_KEYS,
  REJECT_NON_ESSENTIAL,
  hasDecided,
  isAllowed,
  readConsent,
  saveConsent,
  syncConsentOnLoad,
} from '@/lib/consent';
import { setAnalyticsConsent } from '@/lib/analytics';

// The analytics module is the gate, not the subject. Mocking it keeps these
// tests about the consent record and lets us assert the gate was actually
// flipped — the part that makes a category more than a stored boolean.
vi.mock('@/lib/analytics', () => ({ setAnalyticsConsent: vi.fn() }));

const KEY = 'cookie_consent';

describe('cookie consent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(setAnalyticsConsent).mockClear();
  });

  describe('reading the record', () => {
    it('treats a missing value as undecided', () => {
      expect(readConsent()).toBeNull();
      expect(hasDecided()).toBe(false);
    });

    it('does NOT migrate the v1 boolean — a previous accept is re-prompted', () => {
      // v1 asked about analytics only, so it cannot carry consent for
      // Preferences, and it must not survive as a pre-ticked default.
      localStorage.setItem(KEY, 'accepted');
      expect(readConsent()).toBeNull();
      expect(isAllowed('analytics')).toBe(false);
    });

    it('treats a v1 decline as undecided too', () => {
      localStorage.setItem(KEY, 'declined');
      expect(hasDecided()).toBe(false);
    });

    it('fails closed on a corrupt or hand-edited record', () => {
      localStorage.setItem(KEY, '{not json');
      expect(readConsent()).toBeNull();

      localStorage.setItem(KEY, JSON.stringify({ v: 99, analytics: true }));
      expect(readConsent()).toBeNull();

      localStorage.setItem(KEY, JSON.stringify({ v: 2, analytics: 'yes', preferences: 1 }));
      expect(readConsent()).toEqual({ v: 2, preferences: false, analytics: false, ts: 0 });
    });
  });

  describe('the gate', () => {
    it('always allows strictly necessary, decided or not', () => {
      expect(isAllowed('necessary')).toBe(true);
      saveConsent(REJECT_NON_ESSENTIAL);
      expect(isAllowed('necessary')).toBe(true);
    });

    it('denies every optional category before a decision', () => {
      expect(isAllowed('preferences')).toBe(false);
      expect(isAllowed('analytics')).toBe(false);
    });

    it('honours a partial choice', () => {
      saveConsent({ preferences: true, analytics: false });
      expect(isAllowed('preferences')).toBe(true);
      expect(isAllowed('analytics')).toBe(false);
      expect(setAnalyticsConsent).toHaveBeenCalledWith(false);
    });
  });

  describe('saving', () => {
    it('persists a versioned record and flips the analytics gate', () => {
      const record = saveConsent(ACCEPT_ALL);
      expect(record.v).toBe(2);
      expect(record.ts).toBeGreaterThan(0);
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(record);
      expect(setAnalyticsConsent).toHaveBeenCalledWith(true);
    });

    it('erases preference storage when Preferences is denied', () => {
      // Withdrawal has to remove what is already there, or "reject" would only
      // mean "stop adding more".
      for (const key of PREFERENCE_STORAGE_KEYS) localStorage.setItem(key, 'x');

      saveConsent(REJECT_NON_ESSENTIAL);

      for (const key of PREFERENCE_STORAGE_KEYS) {
        expect(localStorage.getItem(key)).toBeNull();
      }
    });

    it('leaves preference storage alone when Preferences is granted', () => {
      localStorage.setItem('theme', 'dark');
      saveConsent(ACCEPT_ALL);
      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  describe('load-time reconciliation', () => {
    it('revokes a stale v1 analytics grant that has no v2 decision behind it', () => {
      // Without this, GA4 would load and report before the re-prompt is
      // answered, because analytics.ts trusts its own key at import time.
      localStorage.setItem(KEY, 'accepted');
      localStorage.setItem('analytics_consent', '1');

      syncConsentOnLoad();

      expect(setAnalyticsConsent).toHaveBeenCalledWith(false);
    });

    it('restores a granted decision', () => {
      saveConsent(ACCEPT_ALL);
      vi.mocked(setAnalyticsConsent).mockClear();

      syncConsentOnLoad();

      expect(setAnalyticsConsent).toHaveBeenCalledWith(true);
    });
  });
});
