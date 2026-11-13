import { toDate } from '@/lib/format-date';

/** The career add-on subscription as `GET /career-billing/status` reports it (V1 API). */
export interface CareerSubscriptionView {
  plan: string | null;
  interval?: string | null;
  status: string | null;
  /** Firestore value: an ISO string, a Date, or a serialized Timestamp. */
  currentPeriodEnd: unknown;
  cancelAtPeriodEnd: boolean;
  source: string | null;
}

export interface CareerBillingStatusView {
  mode: string;
  purchasable: boolean;
  blockedReason: 'disabled' | 'stripe_not_configured' | 'prices_not_configured' | null;
  configuredPrices: string[];
  stripeTestMode: boolean;
  careerSubscription: CareerSubscriptionView | null;
}

/** Same key as the plans screen, so both views share one request. */
export const careerBillingStatusKey = (uid: string | undefined) => ['career-billing-status', uid ?? 'anon'] as const;

/** Statuses during which the subscription still renews or runs to its period end. */
const RUNNING = new Set(['active', 'trialing', 'past_due']);

export type RenewalKey = 'renews_on' | 'ends_on' | 'ended_on';

/**
 * What to say about the career add-on's billing date, or null when there is
 * nothing truthful to say (no Stripe subscription, no date).
 *   running + renewing          → "Renews on {date}"
 *   running + cancel at period end, or cancelled with time left → "Ends on {date}"
 *   cancelled and the date passed → "Ended on {date}"
 */
export function careerRenewal(
  sub: CareerSubscriptionView | null | undefined,
  now: Date = new Date(),
): { key: RenewalKey; date: Date } | null {
  if (!sub || sub.source !== 'stripe' || !sub.status) return null;
  const date = toDate(sub.currentPeriodEnd);
  if (!date) return null;
  if (RUNNING.has(sub.status)) return { key: sub.cancelAtPeriodEnd ? 'ends_on' : 'renews_on', date };
  if (sub.status === 'canceled') return { key: date.getTime() > now.getTime() ? 'ends_on' : 'ended_on', date };
  return null;
}

/** A real Stripe career subscription exists for this customer (any state), so Stripe's portal lists it. */
export function hasStripeCareerSubscription(sub: CareerSubscriptionView | null | undefined): boolean {
  return Boolean(sub && sub.source === 'stripe' && sub.status);
}

export function formatCareerDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}
