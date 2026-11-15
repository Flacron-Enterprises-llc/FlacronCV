import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  AlertItem,
  AlertList,
  FollowedCompany,
  SavedSearch,
  SavedSearchInput,
} from '../../../../../packages/career-api-client/src/types';
import { alertTierAtLeast, RELEVANCE_THRESHOLDS, type AlertTier } from '../../../../../packages/career-shared/src/alerts';
import { LISTING_SCHEDULES, OPPORTUNITY_CATEGORIES } from '../../../../../packages/career-shared/src/opportunities';
import { hasKey, intlLocale, t } from '../../i18n';
import { formatListingDay, formatPay } from './opportunity-search';

/**
 * Alert-centre logic added for parity with the website's AlertsScreen /
 * AlertTargets: why each alert was raised, honest delivery and channel
 * states, the plan's alert-intelligence tier, saved-search filters and the
 * company watch. Copy: `careerAlerts.centre` (the website's `career.alerts`).
 */

const C = (suffix: string, params?: Record<string, string | number>) => {
  const key = `careerAlerts.centre.${suffix}`;
  return hasKey(key) ? t(key, params) : suffix;
};

export const SEARCH_CATEGORIES = ['full_time', 'part_time', 'temporary', 'contract', 'remote', 'hybrid', ...OPPORTUNITY_CATEGORIES] as const;
export const WORK_SCHEDULES = LISTING_SCHEDULES;
export { RELEVANCE_THRESHOLDS };

export function searchCategoryLabel(value: string): string {
  return C(`category_${value}`);
}

export function relevanceLabel(value: string): string {
  return C(`relevance_${value}`);
}

/** Channel names from the existing settings copy (brand names stay as they are). */
export function channelName(channel: 'email' | 'push' | 'telegram'): string {
  return t(`careerAlerts.settings.${channel}`);
}

/** Whether a channel has a provider. Older servers omit `channels`: then only email is assumed connected (website rule). */
export function channelConnected(list: Pick<AlertList, 'channels'>, channel: 'email' | 'push' | 'telegram'): boolean {
  return list.channels ? list.channels[channel] === 'connected' : channel === 'email';
}

/** Why this alert was raised: the saved search or followed company by name when the server names it. */
export function alertWhy(item: AlertItem): string {
  const reason = item.reason;
  if (reason.code === 'followed_company') {
    return reason.companyName ? C('reason_followed_company_named', { company: reason.companyName }) : C('reason_followed_company');
  }
  return reason.searchLabel ? C('reason_saved_search_named', { search: reason.searchLabel }) : C('reason_saved_search');
}

/** Source details every tier shows: places, stated pay, deadline, when it was checked. */
export function alertBasicLine(item: AlertItem, locale: string = intlLocale()): string | null {
  if (!item.basic) return null;
  return [
    item.basic.locations.join(' · ') || null,
    formatPay(item.basic.compensation, locale),
    item.basic.deadline ? C('basic_deadline', { date: formatListingDay(item.basic.deadline, locale) }) : null,
    C('basic_checked', { date: formatListingDay(item.basic.checkedAt, locale) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The strong / possible / stretch label when the tier explains fit; else the older overlap wording. */
export function alertFitLabel(item: AlertItem): string | null {
  if (item.reason.label) return C(`label_${item.reason.label}`);
  if (item.reason.fit) return C(`fit_${item.reason.fit}`);
  return null;
}

export function alertGapsLine(item: AlertItem): string | null {
  return item.reason.gaps && item.reason.gaps.length > 0 ? C('gaps_line', { gaps: item.reason.gaps.join(', ') }) : null;
}

/** "Sent by email" and "not sent by push: not connected yet" lines. Nothing is claimed that did not happen. */
export function deliveryLines(item: AlertItem): { sent: string | null; waiting: string | null } {
  const deliveries = item.deliveries ?? [];
  const sent = deliveries.filter((d) => d.status === 'sent').map((d) => channelName(d.channel));
  const waiting = deliveries.filter((d) => d.lastError === 'provider_unavailable').map((d) => channelName(d.channel));
  return {
    sent: sent.length > 0 ? C('delivered_on', { channels: sent.join(', ') }) : null,
    waiting: waiting.length > 0 ? C('delivery_waiting', { channels: waiting.join(', ') }) : null,
  };
}

/** Advanced-tier links: target role, goal, learning plan, action pack. */
export function advancedLines(item: AlertItem): { role: string | null; goal: string | null; learningPlan: boolean; packLabel: string } | null {
  const advanced = item.reason.advanced;
  if (!advanced) return null;
  return {
    role: advanced.targetRole ? C('advanced_target_role', { role: advanced.targetRole }) : null,
    goal: advanced.promotionGoal ? C('advanced_goal', { goal: advanced.promotionGoal }) : null,
    learningPlan: Boolean(advanced.learningPlanId),
    packLabel: advanced.actionPackId ? C('advanced_open_pack') : C('advanced_next_pack'),
  };
}

export interface TierView {
  tier: AlertTier;
  text: string;
  personalized: boolean;
  enhanced: boolean;
}

export function tierView(list: Pick<AlertList, 'tier'>): TierView {
  const tier = list.tier ?? 'basic';
  return { tier, text: C(`tier_${tier}`), personalized: alertTierAtLeast(tier, 'personalized'), enhanced: alertTierAtLeast(tier, 'enhanced') };
}

export interface SearchDraft {
  q: string;
  category: string;
  locationProfileId: string;
  schedule: SavedSearch['schedule'] | null;
  workSchedule: string;
  minPay: string;
  relevance: string;
}

export const EMPTY_SEARCH: SearchDraft = { q: '', category: '', locationProfileId: '', schedule: null, workSchedule: '', minPay: '', relevance: 'any' };

/**
 * `POST /saved-searches` body. Filters above the plan's tier are not sent (the
 * form does not offer them); the server still checks and answers with
 * `plan_upgrade_required` + `minimumPlan` if one slips through.
 */
export function savedSearchInput(draft: SearchDraft, tier: TierView): { ok: true; input: SavedSearchInput } | { ok: false; message: string } {
  // An empty search is allowed, as on the website: it matches any listing ("Any listing").
  const q = draft.q.trim();
  const minPay = draft.minPay.trim();
  if (minPay && !/^\d+$/.test(minPay)) return { ok: false, message: C('search_min_pay_hint') };
  return {
    ok: true,
    input: {
      q,
      ...(draft.category ? { category: draft.category } : {}),
      ...(draft.locationProfileId ? { locationProfileId: draft.locationProfileId } : {}),
      ...(draft.schedule ? { schedule: draft.schedule } : {}),
      ...(tier.personalized && draft.workSchedule ? { workSchedule: draft.workSchedule } : {}),
      ...(tier.personalized && minPay ? { minPay: Number(minPay) } : {}),
      ...(tier.enhanced && draft.relevance !== 'any' ? { relevance: draft.relevance as SavedSearchInput['relevance'] } : {}),
    },
  };
}

/** A saved search's name: its words, else its category, else "any listing". */
export function searchName(search: Pick<SavedSearch, 'q' | 'category'>): string {
  return search.q || (search.category ? searchCategoryLabel(search.category) : null) || C('searches_any');
}

/** Plan names as the app's plan screens show them. */
export function planName(plan: string): string {
  const key = `settings.plans.${plan}`;
  return hasKey(key) ? t(key) : plan;
}

/**
 * A filter or threshold above the plan: the website's tier message, naming
 * the plan it starts on when the server says so. Information only — never a
 * purchase link (store rules).
 */
export function tierRefusal(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'plan_upgrade_required') return null;
  if (error.body?.feature !== 'alertIntelligence') return null;
  const minimum = typeof error.body.minimumPlan === 'string' ? error.body.minimumPlan : null;
  return minimum ? C('tier_upgrade_plan', { plan: planName(minimum) }) : C('tier_upgrade_body');
}

/** Comma-separated input to a short list (the API keeps at most 10 of each). */
export function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((part) => part.trim()).filter((part) => part.length > 0))].slice(0, 10);
}

/** "Also known as …, Roles: …, Places: …" under a followed company. */
export function companyDetail(company: Pick<FollowedCompany, 'aliases' | 'roles' | 'locations'>): string | null {
  const parts = [
    company.aliases && company.aliases.length > 0 ? C('company_aliases_line', { names: company.aliases.join(', ') }) : null,
    company.roles && company.roles.length > 0 ? C('company_roles_line', { roles: company.roles.join(', ') }) : null,
    company.locations && company.locations.length > 0 ? C('company_places_line', { places: company.locations.join(', ') }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export interface CompanyDraft {
  name: string;
  sourceUrl: string;
  aliases: string;
  roles: string;
  places: string;
}

export const EMPTY_COMPANY: CompanyDraft = { name: '', sourceUrl: '', aliases: '', roles: '', places: '' };

export function companyDraftOf(company: FollowedCompany): CompanyDraft {
  return {
    name: company.name,
    sourceUrl: company.sourceUrl ?? '',
    aliases: (company.aliases ?? []).join(', '),
    roles: (company.roles ?? []).join(', '),
    places: (company.locations ?? []).join(', '),
  };
}

/** Follow (create) body. The careers-page link is only set on create; the API's PATCH does not take it. */
export function companyInput(draft: CompanyDraft): { name: string; aliases: string[]; roles: string[]; locations: string[] } | null {
  const name = draft.name.trim();
  if (name.length === 0) return null;
  return { name, aliases: splitList(draft.aliases), roles: splitList(draft.roles), locations: splitList(draft.places) };
}
