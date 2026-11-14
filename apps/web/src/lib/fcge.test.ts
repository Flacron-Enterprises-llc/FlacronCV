import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fcgeIdentify, fcgeLoaded, fcgeReset, fcgeTrack, installFcgeStub, isLiveHost, loadFcge } from './fcge';

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

describe('FCGE loading is consent- and page-gated', () => {
  const ACCEPTED = JSON.stringify({ v: 2, preferences: false, analytics: true, ts: 1 });
  const REJECTED = JSON.stringify({ v: 2, preferences: false, analytics: false, ts: 1 });
  const sdk = () => document.getElementById('fcge-sdk') as HTMLScriptElement | null;
  const chat = () => document.getElementById('fcge-chat') as HTMLScriptElement | null;

  function configure() {
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', 'app');
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', 'publishable-test');
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', 'https://example.test/');
    vi.stubEnv('NEXT_PUBLIC_FCGE_CHAT_WIDGET_ID', 'wid_test');
  }

  beforeEach(() => {
    localStorage.clear();
    delete window.FCGE;
    sdk()?.remove();
    chat()?.remove();
    window.history.replaceState(null, '', '/en');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.FCGE;
    sdk()?.remove();
    chat()?.remove();
    window.history.replaceState(null, '', '/');
  });

  it('loads nothing before the visitor has decided', () => {
    configure();
    expect(loadFcge()).toBe(false);
    expect(sdk()).toBeNull();
    expect(chat()).toBeNull();
    expect(window.FCGE).toBeUndefined();
  });

  it('loads nothing after Reject Non-Essential', () => {
    configure();
    localStorage.setItem(CONSENT, REJECTED);
    expect(loadFcge()).toBe(false);
    expect(sdk()).toBeNull();
    expect(chat()).toBeNull();
  });

  it('loads the SDK and the chat from the configured endpoint after analytics consent', () => {
    configure();
    localStorage.setItem(CONSENT, ACCEPTED);
    expect(loadFcge()).toBe(true);
    expect(sdk()?.src).toBe('https://example.test/sdk/fcge.min.js');
    expect(chat()?.src).toBe('https://example.test/sdk/fcge-chat.min.js');
    expect(chat()?.getAttribute('data-widget')).toBe('wid_test');
    expect(window.FCGE?.appId).toBe('app');
    expect(fcgeLoaded()).toBe(true);
    // Idempotent: a second call does not add a second copy.
    loadFcge();
    expect(document.querySelectorAll('#fcge-sdk')).toHaveLength(1);
  });

  it('never loads on staff pages, even with consent', () => {
    configure();
    localStorage.setItem(CONSENT, ACCEPTED);
    for (const path of ['/en/admin', '/admin/users', '/fr/crm', '/crm/leads']) {
      window.history.replaceState(null, '', path);
      expect(loadFcge()).toBe(false);
    }
    expect(sdk()).toBeNull();
    expect(window.FCGE).toBeUndefined();
  });

  it('does nothing in a non-production build without env (no hard-coded fallback)', () => {
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', undefined as unknown as string);
    localStorage.setItem(CONSENT, ACCEPTED);
    expect(loadFcge()).toBe(false);
    expect(sdk()).toBeNull();
  });

  // vitest exposes the JSDOM instance as a global in the jsdom environment.
  const setUrl = (url: string) =>
    (globalThis as unknown as { jsdom: { reconfigure(o: { url: string }): void } }).jsdom.reconfigure({ url });

  it('keeps the production values as a fallback on the live site when env is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_CHAT_WIDGET_ID', undefined as unknown as string);
    localStorage.setItem(CONSENT, ACCEPTED);
    const before = window.location.href;
    setUrl('https://www.flacroncv.com/en');
    try {
      localStorage.setItem(CONSENT, ACCEPTED);
      expect(loadFcge()).toBe(true);
      expect(sdk()?.src).toBe('https://dleleyb9ufrgz.cloudfront.net/sdk/fcge.min.js');
      expect(chat()?.getAttribute('data-widget')).toBe('wid_bOgLvgKF5D8g');
    } finally {
      setUrl(before);
    }
  });

  it('never uses the production fallback off the live site (e.g. next start on localhost)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_KEY', undefined as unknown as string);
    vi.stubEnv('NEXT_PUBLIC_FCGE_ENDPOINT', undefined as unknown as string);
    localStorage.setItem(CONSENT, ACCEPTED);
    expect(window.location.hostname).not.toMatch(/flacroncv\.com$/);
    expect(loadFcge()).toBe(false);
    expect(sdk()).toBeNull();
  });

  it('recognises only the live hostnames', () => {
    expect(isLiveHost('flacroncv.com')).toBe(true);
    expect(isLiveHost('www.flacroncv.com')).toBe(true);
    expect(isLiveHost('localhost')).toBe(false);
    expect(isLiveHost('flacroncv.com.evil.test')).toBe(false);
    expect(isLiveHost('notflacroncv.com')).toBe(false);
  });

  it('turns an in-app navigation into a staff page into a full page load while loaded', () => {
    configure();
    localStorage.setItem(CONSENT, ACCEPTED);
    expect(loadFcge()).toBe(true);
    const assign = vi.fn();
    const realLocation = window.location;
    // location.assign is not writable on jsdom's Location; swap the object briefly.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, href: realLocation.href, origin: realLocation.origin, assign },
    });
    try {
      window.history.pushState(null, '', '/en/admin/users');
      expect(assign).toHaveBeenCalledWith(`${realLocation.origin}/en/admin/users`);
      assign.mockClear();
      window.history.pushState(null, '', '/en/pricing');
      expect(assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });

  it('an empty env value disables FCGE even in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FCGE_APP_ID', '');
    localStorage.setItem(CONSENT, ACCEPTED);
    expect(loadFcge()).toBe(false);
  });

  it('stops sending events once consent is withdrawn', () => {
    configure();
    localStorage.setItem(CONSENT, ACCEPTED);
    loadFcge();
    const track = vi.fn();
    window.FCGE!.track = track;
    fcgeTrack('feature_used');
    expect(track).toHaveBeenCalledTimes(1);
    localStorage.setItem(CONSENT, REJECTED);
    fcgeTrack('feature_used');
    expect(track).toHaveBeenCalledTimes(1);
  });
});
