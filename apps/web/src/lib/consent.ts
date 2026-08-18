/**
 * Cookie consent: the stored record, the gate, and the enforcement.
 *
 * THREE categories, not four. The client's package enumerates a Marketing
 * category, but no advertising, pixel, or campaign technology exists anywhere in
 * the product, and the live `/cookie-policy` documents exactly three. A toggle
 * that gates nothing is a promise we do not keep, so Marketing is deliberately
 * absent until a marketing technology exists to gate. Tracked as Q-12 in
 * CLIENT_REQUIREMENTS.md §3. When one arrives, add the category here, gate it,
 * and update the policy in the same change.
 *
 * The rule this module exists to enforce: a category must gate a real
 * technology. `PREFERENCE_STORAGE_KEYS` is the whole inventory for Preferences,
 * and `setAnalyticsConsent` is the whole gate for Analytics. Anything new that
 * writes to the browser belongs in one of these lists or under Strictly
 * Necessary — with a reason.
 */

import { setAnalyticsConsent } from '@/lib/analytics';

export type ConsentCategory = 'necessary' | 'preferences' | 'analytics';

/** The persisted decision. `necessary` is not stored: it can only ever be true. */
export interface ConsentRecord {
  v: 2;
  preferences: boolean;
  analytics: boolean;
  /** When the choice was made (epoch ms) — the auditable part of the record. */
  ts: number;
}

export type ConsentChoice = Pick<ConsentRecord, 'preferences' | 'analytics'>;

const STORAGE_KEY = 'cookie_consent';
const VERSION = 2;

/**
 * Every `localStorage` key written on behalf of the Preferences category —
 * language, theme and sidebar rail, which is exactly what the Cookie Policy
 * lists as its examples. Denying Preferences deletes these.
 *
 * Two other first-party writers are Strictly Necessary on purpose and are NOT
 * here: the CV editor's local crash backup (data-loss protection for the
 * user's own document) and the pending-template hand-off (it completes an
 * action the user just took). Both are storage "strictly necessary to provide
 * a service explicitly requested by the user".
 */
export const PREFERENCE_STORAGE_KEYS = [
  'theme',
  'flacroncv_locale',
  'flacroncv_sidebar_collapsed',
] as const;

/** Fired to reopen the preference centre from anywhere (e.g. the footer). */
const OPEN_EVENT = 'flacroncv:consent-open';

export const ACCEPT_ALL: ConsentChoice = { preferences: true, analytics: true };
export const REJECT_NON_ESSENTIAL: ConsentChoice = { preferences: false, analytics: false };

function readRaw(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked (private mode)
  }
}

/**
 * The current decision, or `null` when the visitor has not made one.
 *
 * v1 stored the bare strings `'accepted'` / `'declined'` under this same key.
 * Those are deliberately NOT migrated: that banner only ever asked about
 * analytics, so it cannot supply specific, informed consent for Preferences,
 * and a previous "accept" must not survive as a pre-ticked default. A v1 value
 * therefore reads as "undecided" and the visitor is asked once more.
 */
export function readConsent(): ConsentRecord | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord> | null;
    if (!parsed || parsed.v !== VERSION) return null;
    return {
      v: VERSION,
      // Anything other than an explicit `true` is a denial. A corrupted or
      // hand-edited record must fail closed, never open.
      preferences: parsed.preferences === true,
      analytics: parsed.analytics === true,
      ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
    };
  } catch {
    return null; // not JSON — a v1 string, or corrupt
  }
}

export function hasDecided(): boolean {
  return readConsent() !== null;
}

/** The gate. Call before writing anything non-essential to the browser. */
export function isAllowed(category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  const record = readConsent();
  if (!record) return false; // no decision yet ⇒ nothing optional runs
  return category === 'analytics' ? record.analytics : record.preferences;
}

function clearPreferenceStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of PREFERENCE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable — nothing was written either */
    }
  }
}

/**
 * Persist a decision and make it real immediately: flip the analytics gate, and
 * erase preference storage if Preferences was denied. Withdrawal has to remove
 * what was already stored, or "reject" would only mean "stop adding more".
 */
export function saveConsent(choice: ConsentChoice): ConsentRecord {
  const record: ConsentRecord = {
    v: VERSION,
    preferences: choice.preferences === true,
    analytics: choice.analytics === true,
    ts: Date.now(),
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* storage blocked — the in-memory analytics gate below still applies */
    }
  }

  setAnalyticsConsent(record.analytics);
  if (!record.preferences) clearPreferenceStorage();

  return record;
}

/**
 * Reconcile the analytics gate with the stored decision on page load.
 *
 * `analytics.ts` owns a separate `analytics_consent` key and reads it at import
 * time. A v1 visitor can still hold `'1'` there while holding no v2 decision,
 * so without this GA4 would load and send a page view before the re-prompt is
 * even answered. Must run before the first analytics call of the session.
 *
 * Note this does NOT clear preference storage for an undecided visitor: while
 * the banner is open we stop writing new preference values but keep honouring
 * the ones already stored, so the page does not visibly change under them
 * before they have chosen.
 */
export function syncConsentOnLoad(): void {
  setAnalyticsConsent(readConsent()?.analytics === true);
}

/** Reopen the preference centre. The banner is mounted globally and listens. */
export function openPreferences(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Subscribe to {@link openPreferences}. Returns an unsubscribe function. */
export function onPreferencesOpen(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
