import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { AlertItem } from '../../../../../packages/career-api-client/src/types';
import {
  advancedLines,
  alertBasicLine,
  alertFitLabel,
  alertGapsLine,
  alertWhy,
  channelConnected,
  companyDetail,
  companyDraftOf,
  companyInput,
  deliveryLines,
  EMPTY_COMPANY,
  EMPTY_SEARCH,
  savedSearchInput,
  searchName,
  splitList,
  tierRefusal,
  tierView,
} from './alert-centre';

const alert = (reason: Partial<AlertItem['reason']> = {}, more: Partial<AlertItem> = {}): AlertItem => ({
  id: 'a1',
  opportunityId: 'o1',
  title: 'Analyst',
  organization: 'Fictional Co',
  revisionId: 'r1',
  reason: { code: 'saved_search', fit: null, ...reason },
  createdAt: '2026-11-01T00:00:00Z',
  ...more,
});

describe('why an alert was raised', () => {
  it('names the saved search or the followed company when the server does', () => {
    expect(alertWhy(alert({ searchLabel: 'data analyst' }))).toMatch(/data analyst/);
    expect(alertWhy(alert({ code: 'followed_company', companyName: 'Fictional Co' }))).toMatch(/Fictional Co/);
    expect(alertWhy(alert({ code: 'followed_company' }))).not.toMatch(/\{company\}/);
  });

  it('shows the label the tier allows, else the overlap wording, else nothing', () => {
    expect(alertFitLabel(alert({ label: 'possible_fit' }))).toBe('Possible fit');
    expect(alertFitLabel(alert({ fit: 'strong' }))).toMatch(/Strong/);
    expect(alertFitLabel(alert())).toBeNull();
    expect(alertGapsLine(alert({ gaps: ['python', 'sql'] }))).toMatch(/python, sql/);
  });

  it('lists source details and honest delivery states', () => {
    const item = alert(
      {},
      {
        basic: {
          provider: 'paste',
          category: 'job',
          locations: ['Leeds'],
          sourceUrl: null,
          checkedAt: '2026-11-01T00:00:00Z',
          compensation: { minimum: null, maximum: null, currency: null, period: null },
          deadline: '2026-12-01',
        },
        deliveries: [
          { channel: 'email', status: 'sent', lastError: null },
          { channel: 'push', status: 'held', lastError: 'provider_unavailable' },
        ],
      },
    );
    expect(alertBasicLine(item, 'en-US')).toMatch(/^Leeds · .*Dec 1, 2026.* · .*Nov 1, 2026/);
    const delivery = deliveryLines(item);
    expect(delivery.sent).toMatch(/Email/);
    expect(delivery.waiting).toMatch(/Push/);
    expect(deliveryLines(alert())).toEqual({ sent: null, waiting: null });
  });

  it('offers the next action pack and only the advanced links that exist', () => {
    expect(advancedLines(alert())).toBeNull();
    const lines = advancedLines(alert({ advanced: { targetRole: 'Lead analyst', promotionGoal: null, learningPlanId: 'l1', actionPackId: null } }));
    expect(lines?.role).toMatch(/Lead analyst/);
    expect(lines?.goal).toBeNull();
    expect(lines?.learningPlan).toBe(true);
  });
});

describe('channels and tiers', () => {
  it('only email counts as connected when an older server does not say', () => {
    expect(channelConnected({}, 'email')).toBe(true);
    expect(channelConnected({}, 'push')).toBe(false);
    expect(channelConnected({ channels: { email: 'not_connected', push: 'connected', telegram: 'not_connected' } }, 'push')).toBe(true);
    expect(channelConnected({ channels: { email: 'not_connected', push: 'connected', telegram: 'not_connected' } }, 'email')).toBe(false);
  });

  it('opens personalised and fit filters by tier', () => {
    expect(tierView({})).toMatchObject({ tier: 'basic', personalized: false, enhanced: false });
    expect(tierView({ tier: 'enhanced' })).toMatchObject({ personalized: true, enhanced: true });
  });

  it('never sends a filter above the tier', () => {
    const draft = { ...EMPTY_SEARCH, q: ' analyst ', category: 'internship', workSchedule: 'part_time', minPay: '30000', relevance: 'strong_fit' };
    expect(savedSearchInput(draft, tierView({ tier: 'basic' }))).toEqual({ ok: true, input: { q: 'analyst', category: 'internship' } });
    expect(savedSearchInput(draft, tierView({ tier: 'enhanced' }))).toEqual({
      ok: true,
      input: { q: 'analyst', category: 'internship', workSchedule: 'part_time', minPay: 30000, relevance: 'strong_fit' },
    });
    expect(savedSearchInput({ ...draft, minPay: '30k' }, tierView({ tier: 'enhanced' })).ok).toBe(false);
  });

  it('names the plan a filter starts on', () => {
    expect(tierRefusal(new ApiError(402, 'plan_upgrade_required', { feature: 'alertIntelligence', minimumPlan: 'starter' } as never))).toBe(
      'That filter starts on the Starter plan. Nothing was saved.',
    );
    expect(tierRefusal(new ApiError(402, 'plan_upgrade_required', { feature: 'alertIntelligence' } as never))).toMatch(/Starter; a fit threshold/);
    expect(tierRefusal(new ApiError(402, 'plan_upgrade_required', { feature: 'channels' } as never))).toBeNull();
  });

  it('names a search by its words, then its category', () => {
    expect(searchName({ q: 'analyst', category: null })).toBe('analyst');
    expect(searchName({ q: '', category: 'scholarship' })).toBe('Scholarship');
    expect(searchName({ q: null, category: null })).not.toBe('');
  });
});

describe('company watch', () => {
  it('splits, trims and dedupes lists, at most ten', () => {
    expect(splitList(' Acme, ACME Ltd ,, Acme ')).toEqual(['Acme', 'ACME Ltd']);
    expect(splitList(Array.from({ length: 12 }, (_, i) => `n${i}`).join(','))).toHaveLength(10);
  });

  it('round-trips a company through the edit form', () => {
    const company = { id: 'c1', name: 'Fictional Co', sourceUrl: null, aliases: ['FC'], roles: ['Analyst'], locations: [] };
    const draft = companyDraftOf(company);
    expect(draft).toEqual({ name: 'Fictional Co', sourceUrl: '', aliases: 'FC', roles: 'Analyst', places: '' });
    expect(companyInput(draft)).toEqual({ name: 'Fictional Co', aliases: ['FC'], roles: ['Analyst'], locations: [] });
    expect(companyInput(EMPTY_COMPANY)).toBeNull();
    expect(companyDetail(company)).toMatch(/FC.*Analyst/);
    expect(companyDetail({ aliases: [], roles: [], locations: [] })).toBeNull();
  });
});
