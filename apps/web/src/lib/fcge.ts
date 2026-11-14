/**
 * Flacron Growth Engine (client). Loads only when it is configured (the
 * NEXT_PUBLIC_FCGE_* env vars, or the production fallback below) AND the
 * visitor has accepted analytics cookies AND the page is not /admin or /crm.
 * Missing config, a declined or unanswered banner, staff pages and the server
 * are no-ops. Never throws. `loadFcge()` is the only way the SDK or the chat
 * widget reaches the page.
 *
 * There is no marketing-cookie category. Analytics is the gate.
 * marketingConsent on identify is the account's marketing-email opt-in, and
 * it is true only when that preference is explicitly true.
 */

import { isAllowed } from '@/lib/consent';
import {
  PLAN_CONFIGS,
  resolveEffectivePlan,
  type User,
} from '@flacroncv/shared-types';

const METHODS = ['identify', 'track', 'registerWebinar', 'page', 'showForm', 'reset'] as const;
type FcgeMethod = (typeof METHODS)[number];

interface FcgeStub {
  appId: string;
  key: string;
  endpoint: string;
  q: unknown[];
  identify: (...args: unknown[]) => void;
  track: (...args: unknown[]) => void;
  registerWebinar: (...args: unknown[]) => void;
  page: (...args: unknown[]) => void;
  showForm: (...args: unknown[]) => void;
  reset: (...args: unknown[]) => void;
}

export interface FcgeIdentify {
  email?: string;
  name?: string;
  externalUserId: string;
  plan: string;
  phone?: string;
  role?: string;
  marketingConsent: boolean;
}

declare global {
  interface Window {
    FCGE?: FcgeStub;
  }
}

const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'ur'];
const LIMIT_MARK = 'fcge_usage_90';
const PRICING_MARK = 'fcge_pricing_visited';

/**
 * Production build-time fallback. These values used to live in hard-coded
 * <script> tags in the root layout, which loaded the SDK before (and
 * regardless of) consent. The tags are gone; the values stay here ONLY so a
 * production build that never set the NEXT_PUBLIC_FCGE_* variables keeps
 * working as before — now behind the consent gate. Development and test builds
 * never fall back: no env, no tracker. The key is a publishable (pk_) key that
 * is meant to ship in the browser bundle. Setting a variable to the empty
 * string disables FCGE in any environment.
 */
const PRODUCTION_FALLBACK = {
  appId: 'cmujjip0p0163jy1j3qxh7bt7',
  key: 'pk_live_f68b3b4b2ef9cd1ce3258a4efe9ace85ed12d13b8e7e89ee',
  endpoint: 'https://dleleyb9ufrgz.cloudfront.net',
  chatWidgetId: 'wid_bOgLvgKF5D8g',
} as const;

interface FcgeConfig {
  appId: string;
  key: string;
  endpoint: string;
  /** Support-chat widget id; null when the chat is not configured. */
  chatWidgetId: string | null;
}

function pick(value: string | undefined, fallback: string, useFallback: boolean): string | null {
  if (value === '') return null; // explicit opt-out
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return useFallback ? fallback : null;
}

/** The deployed site: flacroncv.com and its subdomains (www.). */
export function isLiveHost(hostname?: string): boolean {
  const host = hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname);
  return /(^|\.)flacroncv\.com$/i.test(host);
}

function readConfig(): FcgeConfig | null {
  // Literal process.env.X reads: Next only inlines NEXT_PUBLIC_* values into
  // the client bundle when the property access is written out in full.
  // The production fallback is tied to the live site's own hostname, not just
  // to NODE_ENV: a production build run anywhere else (`next start` on a
  // laptop, a preview host) must never send events to the live project.
  const useFallback = process.env.NODE_ENV === 'production' && isLiveHost();
  const appId = pick(process.env.NEXT_PUBLIC_FCGE_APP_ID, PRODUCTION_FALLBACK.appId, useFallback);
  const key = pick(process.env.NEXT_PUBLIC_FCGE_KEY, PRODUCTION_FALLBACK.key, useFallback);
  const endpoint = pick(process.env.NEXT_PUBLIC_FCGE_ENDPOINT, PRODUCTION_FALLBACK.endpoint, useFallback);
  if (!appId || !key || !endpoint) return null;
  const chatWidgetId = pick(
    process.env.NEXT_PUBLIC_FCGE_CHAT_WIDGET_ID,
    PRODUCTION_FALLBACK.chatWidgetId,
    useFallback,
  );
  return { appId, key, endpoint: endpoint.replace(/\/$/, ''), chatWidgetId };
}

export function fcgeConfigured(): boolean {
  return readConfig() !== null;
}

/** Locale-prefixed or not. Admin and CRM never load the SDK. */
export function isStaffPath(pathname: string): boolean {
  const stripped = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`), '') || '/';
  return stripped === '/admin' || stripped.startsWith('/admin/') || stripped === '/crm' || stripped.startsWith('/crm/');
}

/** Whether the visitor and the current page permit FCGE at all. */
function mayRun(): boolean {
  return typeof window !== 'undefined'
    && !isStaffPath(window.location.pathname)
    && isAllowed('analytics');
}

function canSend(): boolean {
  // Consent is re-checked on every call: a visitor who withdraws it mid-session
  // must stop being tracked even though the SDK is already on the page.
  return mayRun() && !!window.FCGE;
}

function call(method: FcgeMethod, args: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    const fn = window.FCGE?.[method];
    if (typeof fn !== 'function') return;
    fn(...args);
  } catch {
    /* growth tracking must never break a user flow */
  }
}

/**
 * Install the queueing stub. Does nothing without config, analytics consent,
 * a browser, or on a staff (admin/CRM) path.
 */
export function installFcgeStub(): void {
  if (!mayRun()) return;
  if (window.FCGE) return;
  const config = readConfig();
  if (!config) return;
  const stub = {
    appId: config.appId,
    key: config.key,
    endpoint: config.endpoint,
    q: [] as unknown[],
  } as FcgeStub;
  for (const method of METHODS) {
    stub[method] = function queue() {
      // The SDK reads each entry as [name, arguments].
      // eslint-disable-next-line prefer-rest-params
      stub.q.push([method, arguments]);
    };
  }
  window.FCGE = stub;
}

export function fcgeScriptSrc(): string | null {
  const config = readConfig();
  if (!config || typeof window === 'undefined') return null;
  return `${config.endpoint}/sdk/fcge.min.js`;
}

const SDK_SCRIPT_ID = 'fcge-sdk';
const CHAT_SCRIPT_ID = 'fcge-chat';

function appendScript(id: string, src: string, attrs: Record<string, string> = {}): void {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  for (const [name, value] of Object.entries(attrs)) script.setAttribute(name, value);
  document.body.appendChild(script);
}

/** Whether the SDK script has been injected into this document. */
export function fcgeLoaded(): boolean {
  return typeof document !== 'undefined' && !!document.getElementById(SDK_SCRIPT_ID);
}

/**
 * Install the stub, then inject the SDK and (when configured) the support-chat
 * widget. This is the only way either script reaches the page.
 *
 * The chat is gated by ANALYTICS consent too, not treated as strictly
 * necessary: it is third-party code from the tracker's host, it runs on every
 * page whether or not the visitor wants support, and it shares the SDK's
 * anonymous visitor id. Visitors who reject still have the contact form.
 * Idempotent; returns whether FCGE is (now) loaded.
 */
export function loadFcge(): boolean {
  if (!mayRun()) return false;
  const config = readConfig();
  if (!config) return false;
  try {
    installFcgeStub();
    appendScript(SDK_SCRIPT_ID, `${config.endpoint}/sdk/fcge.min.js`);
    if (config.chatWidgetId) {
      appendScript(CHAT_SCRIPT_ID, `${config.endpoint}/sdk/fcge-chat.min.js`, {
        'data-widget': config.chatWidgetId,
      });
    }
    guardStaffNavigation();
    return true;
  } catch {
    return false; // growth tracking must never break a page
  }
}

let staffGuardInstalled = false;

/**
 * Client-side navigation into /admin or /crm becomes a full page load while the
 * SDK is on the page. The SDK tracks history changes itself, so by the time
 * React re-renders (and FcgeLoader reloads the document without it) a pageview
 * for the staff page has already been sent. Wrapping pushState/replaceState and
 * leaving through location.assign means the SDK never sees the staff URL.
 */
function guardStaffNavigation(): void {
  if (staffGuardInstalled || typeof window === 'undefined') return;
  staffGuardInstalled = true;
  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = window.history[method];
    window.history[method] = function guarded(this: History, data: unknown, unused: string, url?: string | URL | null) {
      if (url != null && fcgeLoaded()) {
        try {
          const target = new URL(String(url), window.location.href);
          if (target.origin === window.location.origin && isStaffPath(target.pathname)) {
            window.location.assign(target.href);
            return;
          }
        } catch {
          /* fall through to the normal navigation */
        }
      }
      return original.call(this, data, unused, url);
    } as History[typeof method];
  };
  wrap('pushState');
  wrap('replaceState');
}

export function fcgeIdentify(traits: FcgeIdentify): void {
  if (!canSend()) return;
  call('identify', [traits]);
}

export function fcgeTrack(name: string, props?: Record<string, unknown>): void {
  if (!canSend()) return;
  call('track', props ? [name, props] : [name]);
}

/** Sign-out. No-ops when the stub was never installed. */
export function fcgeReset(): void {
  if (typeof window === 'undefined') return;
  try {
    window.FCGE?.reset();
  } catch {
    /* no-op */
  }
}

export const FCGE = {
  identify: fcgeIdentify,
  track: fcgeTrack,
  reset: fcgeReset,
};

export function fcgeUpgradeClicked(plan: string): void {
  fcgeTrack('upgrade_clicked', { plan });
}

/** Once per browser session, after the pricing section is actually in view. */
export function fcgePricingVisited(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(PRICING_MARK) === '1') return;
    if (!canSend()) return;
    window.sessionStorage.setItem(PRICING_MARK, '1');
    fcgeTrack('pricing_page_visited');
  } catch {
    /* storage blocked — skip rather than fire on every scroll */
  }
}

function periodKey(user: User): string {
  const end = user.subscription?.currentPeriodEnd;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (Number.isFinite(endMs)) return String(endMs);
  const reset = user.usage?.lastExportReset;
  const resetMs = reset ? new Date(reset).getTime() : NaN;
  const stamp = Number.isFinite(resetMs) ? new Date(resetMs) : new Date();
  return `${stamp.getUTCFullYear()}-${stamp.getUTCMonth()}`;
}

function ratio(used: number, limit: number | 'unlimited' | undefined): number | null {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
  if (!Number.isFinite(used) || used < 0) return null;
  return used / limit;
}

/**
 * Fire `usage_limit_90` once per limit per billing period when usage reaches
 * 90 percent. Unlimited limits are skipped.
 */
export function fcgeNoteUsage(user: User): void {
  if (!canSend()) return;
  const plan = resolveEffectivePlan(user.subscription);
  const limits = PLAN_CONFIGS[plan].limits;
  const usage = user.usage;
  const checks: Array<[string, number | null]> = [
    ['cvs', ratio(usage?.cvsCreated ?? 0, limits.cvs)],
    ['cover_letters', ratio(usage?.coverLettersCreated ?? 0, limits.coverLetters)],
    ['exports', ratio(usage?.exportsThisMonth ?? 0, limits.exports)],
    ['ai_credits', ratio(usage?.aiCreditsUsed ?? 0, usage?.aiCreditsLimit || limits.aiCredits)],
  ];
  const period = periodKey(user);
  for (const [limit, value] of checks) {
    if (value == null || value < 0.9) continue;
    const mark = `${LIMIT_MARK}:${user.uid}:${period}:${limit}`;
    try {
      if (window.localStorage.getItem(mark) === '1') continue;
      window.localStorage.setItem(mark, '1');
    } catch {
      continue;
    }
    fcgeTrack('usage_limit_90', { limit });
  }
}

/** Traits for identify. Omits phone and role when the account has none. Never sends the admin role. */
export function fcgeTraits(user: User): FcgeIdentify {
  const first = user.profile?.firstName?.trim() ?? '';
  const last = user.profile?.lastName?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  const name = user.displayName?.trim() || combined;
  const phone = user.phoneNumber?.trim() ?? '';
  const headline = user.profile?.headline?.trim() ?? '';
  const traits: FcgeIdentify = {
    externalUserId: user.uid,
    plan: resolveEffectivePlan(user.subscription),
    marketingConsent: user.preferences?.marketingEmails === true,
  };
  if (user.email?.trim()) traits.email = user.email.trim();
  if (name) traits.name = name;
  if (phone) traits.phone = phone;
  if (headline) traits.role = headline;
  return traits;
}
