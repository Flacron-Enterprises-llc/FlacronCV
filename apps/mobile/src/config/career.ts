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

/**
 * Career plan prices on the plans comparison screen. Off unless
 * EXPO_PUBLIC_SHOW_CAREER_PRICES=true (read as a literal so Expo inlines it).
 *
 * Why off by default: career plans are sold only on the website (Stripe);
 * the app has no in-app purchase for them. Apple App Review 3.1.1 / 3.1.3
 * does not let an app show the price of a digital subscription it does not
 * sell through in-app purchase, or otherwise point people to buying it
 * elsewhere (outside the storefronts and entitlements where Apple allows
 * that), and Google Play's Payments policy likewise bars steering users to a
 * payment method other than Play billing for digital goods (outside its
 * user-choice / alternative-billing programmes). Listing what each plan
 * includes is information; a price for something bought outside the app reads
 * as a sales pitch for it. Turn this on only for a build whose store
 * arrangement allows it (e.g. once the plans are also in-app purchases, or for
 * internal/test builds); even then the screen shows plain amounts and never a
 * button or link to buy.
 */
export const SHOW_CAREER_PRICES = process.env.EXPO_PUBLIC_SHOW_CAREER_PRICES === 'true';
