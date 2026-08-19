import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Consent gate — prove the negative: nothing reaches gtag before Analytics
 * consent. Happy-path dispatch is covered indirectly by production wiring;
 * this file exists so a regression that fires before consent fails CI.
 */

describe('analytics consent gate', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    // gtag may be left on window by a prior test; start clean.
    window.gtag = undefined;
    window.dataLayer = undefined;
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_PROVIDER', 'ga4');
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-TESTMEASURE');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not call gtag when Analytics consent has not been granted', async () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    const { track, page, identify, hasAnalyticsConsent } = await import('./analytics');

    expect(hasAnalyticsConsent()).toBe(false);

    track('signup_started');
    track('sign_up', { method: 'password' });
    track('ai_generation', { feature: 'cv-summary' });
    track('free_allowance_exhausted', { reason: 'ai_credits' });
    track('abuse_grant_blocked', { reason: 'ABUSE_GRANT_BLOCKED' });
    page('/en/register');
    identify('uid-test', { plan: 'free' });

    expect(gtag).not.toHaveBeenCalled();
  });

  it('still does not call gtag for track after an explicit revoke', async () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    const { track, setAnalyticsConsent } = await import('./analytics');
    setAnalyticsConsent(true);
    setAnalyticsConsent(false);
    // revoke may call gtag('set', …) via adapter.reset — that is not a product event
    gtag.mockClear();

    track('signup_started');
    track('ai_generation', { feature: 'ats-check' });
    expect(gtag).not.toHaveBeenCalled();
  });
});
