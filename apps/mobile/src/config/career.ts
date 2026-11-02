import { isPrivateOrLocalHost } from '../lib/api';

/**
 * Career tools (the integrated V2 service) in the mobile app.
 *
 * Off unless EXPO_PUBLIC_CAREER_ENABLED=true, so a store build cannot ship the
 * career screens by accident. Before turning it on for an iOS release, read
 * docs/V2_INTEGRATION.md "Mobile and the app stores": Apple 3.1.3(b) allows
 * unlocking a web-bought subscription only if the same item is also offered
 * as an in-app purchase, which the career add-on is not yet.
 */
const requested = process.env.EXPO_PUBLIC_CAREER_ENABLED?.trim() === 'true';

/** Origin of the career API (routes under /api/career/v1). Separate from EXPO_PUBLIC_API_URL. */
export const CAREER_API_URL = process.env.EXPO_PUBLIC_CAREER_API_URL?.trim() || 'http://localhost:4101';

function releaseSafe(url: string): boolean {
  if (__DEV__) return true;
  try {
    return !isPrivateOrLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** A release build pointed at a LAN career API keeps the career area off instead of failing at launch. */
export const CAREER_ENABLED = requested && releaseSafe(CAREER_API_URL);
