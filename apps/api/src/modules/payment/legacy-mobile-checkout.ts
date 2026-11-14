import { SubscriptionPlan } from '@flacroncv/shared-types';

/**
 * Temporary compatibility for the mobile app build that is already in users'
 * hands. That build only knows Free / Pro / Enterprise and buys them through
 * POST /payments/create-checkout-session `{ plan, interval }`. The five-plan
 * catalog refuses legacy plans for new checkouts, which would break every
 * purchase in that app the moment the API deploys. Until an app update ships
 * the five plans, a NATIVE mobile client may still buy those two plans at their
 * existing legacy Stripe prices. Remove this file once the updated app is the
 * minimum supported version.
 */

/** Who is asking for a checkout; set by the controller from the request. */
export interface CheckoutClient {
  /** True only for the native mobile app (see `isNativeMobileRequest`). */
  nativeMobile?: boolean;
}

/** The legacy plans the live mobile app offers. Career Accelerator never was. */
const LEGACY_MOBILE_PLANS: ReadonlySet<string> = new Set([SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE]);

export function isLegacyMobileCheckoutPlan(plan: SubscriptionPlan | string | null | undefined): boolean {
  return !!plan && LEGACY_MOBILE_PLANS.has(plan);
}

type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * The native mobile app: it sends `X-Device-Token` and, being a native HTTP
 * client, no `Origin`. The web app ALSO sends `X-Device-Token` (lib/api.ts), so
 * the header alone cannot tell them apart; but a browser always attaches
 * `Origin` to a POST and page script cannot remove it, so the web can never
 * take this path by accident. A hand-crafted request could, and would only get
 * a legacy plan at its full legacy price — no discount and no extra access.
 */
export function isNativeMobileRequest(headers: Record<string, HeaderValue>): boolean {
  return firstHeader(headers['x-device-token']).length > 0 && firstHeader(headers['origin']).length === 0;
}
