import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fcgeIdentify, fcgeReset, fcgeTrack, installFcgeStub } from './fcge';

const CONSENT = 'cookie_consent';

describe('FCGE wrapper', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.FCGE;
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', '');
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.FCGE;
  });

  it('no-ops without env and does not throw', () => {
    localStorage.setItem(CONSENT, JSON.stringify({ v: 2, preferences: false, analytics: true, ts: 1 }));
    expect(() => installFcgeStub()).not.toThrow();
    expect(() => fcgeIdentify({
      externalUserId: 'uid',
      plan: 'free',
      marketingConsent: false,
    })).not.toThrow();
    expect(() => fcgeTrack('user_registered')).not.toThrow();
    expect(() => fcgeReset()).not.toThrow();
    expect(window.FCGE).toBeUndefined();
  });

  it('no-ops on the server', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    // @ts-expect-error simulating the server, where window is absent
    delete globalThis.window;
    try {
      expect(() => installFcgeStub()).not.toThrow();
      expect(() => fcgeIdentify({
        externalUserId: 'uid',
        plan: 'free',
        marketingConsent: false,
      })).not.toThrow();
      expect(() => fcgeTrack('user_registered')).not.toThrow();
      expect(() => fcgeReset()).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    }
  });

  it('reset on logout calls FCGE.reset when the stub exists', () => {
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', 'app');
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', 'publishable-test');
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', 'https://example.test');
    localStorage.setItem(CONSENT, JSON.stringify({ v: 2, preferences: false, analytics: true, ts: 1 }));
    installFcgeStub();
    const reset = vi.fn();
    window.FCGE!.reset = reset;
    fcgeReset();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
