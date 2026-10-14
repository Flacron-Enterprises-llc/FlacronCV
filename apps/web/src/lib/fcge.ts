/**
 * Flacron Growth Engine (client). Loads only when all three public env vars
 * are set AND the visitor has accepted analytics cookies. Missing config,
 * a declined or unanswered banner, and the server are no-ops. Never throws.
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

function readConfig(): { appId: string; key: string; endpoint: string } | null {
  const appId = process.env.NEXT_PUBLIC_FCGE_APP_ID?.trim() ?? '';
  const key = process.env.NEXT_PUBLIC_FCGE_KEY?.trim() ?? '';
  const endpoint = process.env.NEXT_PUBLIC_FCGE_ENDPOINT?.trim() ?? '';
  if (!appId || !key || !endpoint) return null;
  return { appId, key, endpoint };
}

export function fcgeConfigured(): boolean {
  return readConfig() !== null;
}

/** Locale-prefixed or not. Admin and CRM never load the SDK. */
export function isStaffPath(pathname: string): boolean {
  const stripped = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`), '') || '/';
  return stripped === '/admin' || stripped.startsWith('/admin/') || stripped === '/crm' || stripped.startsWith('/crm/');
}

function canSend(): boolean {
  return typeof window !== 'undefined'
    && !isStaffPath(window.location.pathname)
    && readConfig() !== null
    && isAllowed('analytics')
    && !!window.FCGE;
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

/** Install the queueing stub. Does nothing without config, consent, or a browser. */
export function installFcgeStub(): void {
  if (typeof window === 'undefined') return;
  if (!isAllowed('analytics')) return;
  const config = readConfig();
  if (!config) return;
  if (window.FCGE) return;
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
  if (!config || typeof window === 'undefined' || !isAllowed('analytics')) return null;
  return `${config.endpoint.replace(/\/$/, '')}/sdk/fcge.min.js`;
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
