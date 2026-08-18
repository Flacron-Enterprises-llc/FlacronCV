const STORAGE_KEY = 'flacroncv_did';
const COOKIE_NAME = 'flacroncv_did';
const TOKEN_RE = /^[0-9a-f]{32}$/i;
const MAX_AGE_SEC = 60 * 60 * 24 * 365;

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function persist(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Quota / private mode — cookie still helps on this origin.
  }
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

/**
 * Persistent 128-bit device token for abuse signals.
 *
 * Survives logout. Does not survive clearing cookies AND localStorage,
 * incognito / a fresh profile, another browser, or another machine.
 * Hashed server-side before storage — this raw value must never be logged.
 */
export function getOrCreateDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    const fromCookie = readCookie(COOKIE_NAME);
    const existing =
      (fromStorage && TOKEN_RE.test(fromStorage) ? fromStorage.toLowerCase() : null) ||
      (fromCookie && TOKEN_RE.test(fromCookie) ? fromCookie.toLowerCase() : null);
    if (existing) {
      persist(existing);
      return existing;
    }
    const token = randomToken();
    persist(token);
    return token;
  } catch {
    return null;
  }
}
