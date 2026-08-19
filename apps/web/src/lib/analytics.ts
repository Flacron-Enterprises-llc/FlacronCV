/**
 * Provider-agnostic product analytics.
 *
 * Design goals:
 *  - **Privacy-safe by default.** Nothing is sent until BOTH a provider is
 *    configured (`NEXT_PUBLIC_ANALYTICS_PROVIDER`) AND the user has granted
 *    consent (`setAnalyticsConsent(true)`, to be called by a future cookie
 *    banner). With the default `provider = 'none'` this module is a pure no-op.
 *  - **Provider-agnostic.** Event tracking is expressed against a typed event
 *    catalog and dispatched to a pluggable {@link AnalyticsAdapter}. Swapping in
 *    GA4 / PostHog / Segment / etc. is a matter of writing one adapter and
 *    setting the env var — no call sites change.
 *  - **Typed events.** {@link track} only accepts known event names with their
 *    documented prop shapes, so instrumentation stays consistent.
 *
 * To add a real provider: implement `AnalyticsAdapter`, register it in
 * `createAdapter()`, and set `NEXT_PUBLIC_ANALYTICS_PROVIDER` to its key.
 */

/* ── Event catalog (the "PDF events") ─────────────────────────────────────── */

export interface EventPropMap {
  sign_up: { method?: 'password' | 'google' };
  sign_in: { method?: 'password' | 'google' };
  sign_out: undefined;
  cv_created: { templateId?: string; source?: 'blank' | 'import' | 'template' };
  cv_exported: { format: 'pdf' | 'docx'; templateId?: string };
  cover_letter_created: { withAI?: boolean };
  checkout_started: { plan: string; interval: string };
  plan_upgraded: { plan?: string };
  ai_generation: { feature: string };
  abuse_grant_blocked: { reason?: string };
  abuse_step_up: { reason?: string };
  abuse_email_unverified: { reason?: string };
  abuse_rate_limited: { reason?: string };
}

export type AnalyticsEventName = keyof EventPropMap;

/* ── Adapter contract ─────────────────────────────────────────────────────── */

export interface AnalyticsAdapter {
  /** One-time setup (load SDK, init with a key). May be async. */
  init?(): void | Promise<void>;
  track(name: string, props?: Record<string, unknown>): void;
  /** Associate subsequent events with an (opaque) user id. */
  identify(userId: string, traits?: Record<string, unknown>): void;
  /** Record a page view. */
  page(path: string): void;
  /** Clear the identified user (on sign-out). */
  reset?(): void;
}

/* ── Adapters ─────────────────────────────────────────────────────────────── */

/** Sends nothing. The default. */
const noopAdapter: AnalyticsAdapter = {
  track() {},
  identify() {},
  page() {},
};

/**
 * Logs to the console — for local development / verifying instrumentation.
 * Local only; never transmits data, so it is not gated behind consent.
 */
const consoleAdapter: AnalyticsAdapter = {
  track(name, props) {
    // eslint-disable-next-line no-console
    console.debug('[analytics] track', name, props ?? {});
  },
  identify(userId, traits) {
    // eslint-disable-next-line no-console
    console.debug('[analytics] identify', userId, traits ?? {});
  },
  page(path) {
    // eslint-disable-next-line no-console
    console.debug('[analytics] page', path);
  },
  reset() {
    // eslint-disable-next-line no-console
    console.debug('[analytics] reset');
  },
};

/* ── GA4 (Google Analytics 4) ─────────────────────────────────────────────── */

// gtag.js writes to these globals.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || '';

/**
 * Google Analytics 4 via gtag.js. The script is loaded lazily in `init()`,
 * which only runs once a provider is selected AND consent is granted (see
 * {@link ensureInit}) — so GA4's cookies are never set before consent. It
 * **no-ops safely** (with a dev warning) when `NEXT_PUBLIC_GA4_MEASUREMENT_ID`
 * is unset, so nothing breaks before the client supplies their real id. SPA
 * page views are emitted manually (`send_page_view: false`).
 */
const ga4Adapter: AnalyticsAdapter = {
  init() {
    if (typeof window === 'undefined') return;
    if (!GA4_MEASUREMENT_ID) {
      // eslint-disable-next-line no-console
      console.warn(
        '[analytics] GA4 is selected but NEXT_PUBLIC_GA4_MEASUREMENT_ID is not set — no events will be sent.',
      );
      return;
    }
    if (window.gtag) return; // already initialised

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // gtag.js reads each dataLayer entry as an `arguments` object.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
  },
  track(name, props) {
    if (typeof window === 'undefined' || !window.gtag) return;
    window.gtag('event', name, props ?? {});
  },
  identify(userId, traits) {
    if (typeof window === 'undefined' || !window.gtag) return;
    window.gtag('set', { user_id: userId });
    if (traits && Object.keys(traits).length > 0) {
      window.gtag('set', 'user_properties', traits);
    }
  },
  page(path) {
    if (typeof window === 'undefined' || !window.gtag) return;
    window.gtag('event', 'page_view', { page_path: path });
  },
  reset() {
    if (typeof window === 'undefined' || !window.gtag) return;
    window.gtag('set', { user_id: null });
  },
};

type ProviderKey = 'none' | 'console' | 'ga4';

function getProviderKey(): ProviderKey {
  // Default provider is GA4 (client direction). It stays a privacy-safe no-op
  // until BOTH consent is granted and a measurement id is configured.
  const raw = (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || 'ga4').toLowerCase();
  if (raw === 'ga4') return 'ga4';
  if (raw === 'console') return 'console';
  return 'none';
}

function createAdapter(key: ProviderKey): AnalyticsAdapter {
  switch (key) {
    case 'ga4':
      return ga4Adapter;
    case 'console':
      return consoleAdapter;
    // case 'posthog': return posthogAdapter;   // ← add more providers here
    default:
      return noopAdapter;
  }
}

/* ── State ────────────────────────────────────────────────────────────────── */

const CONSENT_KEY = 'analytics_consent';
const provider = getProviderKey();
const adapter = createAdapter(provider);
let initialized = false;

function readStoredConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

let consentGranted = readStoredConsent();

/**
 * Whether events may actually be dispatched right now. The console adapter is
 * dev-only and transmits nothing, so it runs without consent; every real
 * provider requires explicit consent.
 */
function isEnabled(): boolean {
  if (provider === 'none') return false;
  if (provider === 'console') return true;
  return consentGranted;
}

function ensureInit(): void {
  if (initialized || !isEnabled()) return;
  initialized = true;
  void adapter.init?.();
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/** Grant/revoke analytics consent (persisted). Call from the cookie banner. */
export function setAnalyticsConsent(granted: boolean): void {
  consentGranted = granted;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_KEY, granted ? '1' : '0');
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }
  if (granted) ensureInit();
  else adapter.reset?.();
}

export function hasAnalyticsConsent(): boolean {
  return consentGranted;
}

// Props are REQUIRED when the event's shape has any required field, optional
// when all fields are optional, and omitted entirely for prop-less events.
type TrackArgs<N extends AnalyticsEventName> = EventPropMap[N] extends undefined
  ? []
  : {} extends EventPropMap[N]
  ? [props?: EventPropMap[N]]
  : [props: EventPropMap[N]];

/** Track a typed product event. No-ops unless a provider + consent are active. */
export function track<N extends AnalyticsEventName>(name: N, ...args: TrackArgs<N>): void {
  if (!isEnabled()) return;
  ensureInit();
  try {
    adapter.track(name, args[0] as Record<string, unknown> | undefined);
  } catch {
    /* analytics must never break a user flow */
  }
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!isEnabled() || !userId) return;
  ensureInit();
  try {
    adapter.identify(userId, traits);
  } catch {
    /* no-op */
  }
}

export function page(path: string): void {
  if (!isEnabled()) return;
  ensureInit();
  try {
    adapter.page(path);
  } catch {
    /* no-op */
  }
}

export function resetAnalytics(): void {
  try {
    adapter.reset?.();
  } catch {
    /* no-op */
  }
}

/** True when a real (non-`none`) provider is configured. */
export const analyticsProvider = provider;
