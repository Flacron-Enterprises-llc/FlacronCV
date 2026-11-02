import type { PlanId } from './catalog';

/** Spec section 6. Business uses the same local radius as Career Pro. */
export const LOCAL_RADIUS_MILES: Record<PlanId, number> = {
  free: 25,
  starter: 50,
  professional: 100,
  career_pro: 200,
  business: 200,
};

/** A listing whose checked time is older than this is shown as stale. The saved revision still shows. */
export const STALE_LISTING_DAYS = 14;

/** Stored when a paste has no employer. The API returns null and the screen says it was not stated. */
export const UNSTATED_ORGANIZATION = 'unstated';

export interface ListingCompensation {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  period: string | null;
}

export function localRadiusMiles(planId: PlanId): number {
  return LOCAL_RADIUS_MILES[planId];
}

/** Same employer and title, ignoring case and punctuation. A paste never shares a key with a feed. */
export function dedupeKey(listing: { provider: string; organization: string; title: string; sourceId: string }): string {
  if (listing.provider === 'paste') return `paste:${listing.sourceId}`;
  const organization = fold(listing.organization);
  const title = fold(listing.title);
  if (organization.length === 0 || title.length === 0) return `${listing.provider}:${listing.sourceId}`;
  return `${organization}|${title}`;
}

export function listingLabel(status: 'open' | 'closed', deadline: string | null, today: string): 'open' | 'expired' {
  if (status === 'closed') return 'expired';
  if (deadline !== null && deadline < today) return 'expired';
  return 'open';
}

export function isStaleListing(checkedAtIso: string, nowMs: number): boolean {
  const checked = Date.parse(checkedAtIso);
  if (Number.isNaN(checked)) return false;
  return nowMs - checked > STALE_LISTING_DAYS * 24 * 60 * 60 * 1000;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ');
}
