import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { OpportunityItem } from '../../../../../packages/career-api-client/src/types';
import {
  activeFilterCount,
  categoryLabel,
  checkPasteDraft,
  EMPTY_FILTERS,
  EMPTY_PASTE,
  formatPay,
  isCalendarDay,
  isFiltered,
  listingFacts,
  missingText,
  notAppliedText,
  pasteDetailFields,
  pasteErrorText,
  providerLabel,
  radiusLimitOf,
  searchQuery,
} from './opportunity-search';

const item = (partial: Partial<OpportunityItem> = {}): OpportunityItem => ({
  id: 'o1',
  category: 'job',
  provider: 'paste',
  title: 'Analyst',
  organization: 'Fictional Co',
  status: 'open',
  label: 'open',
  sourceUrl: null,
  checkedAt: '2026-11-01T00:00:00.000Z',
  deadline: null,
  locations: ['Leeds'],
  compensation: { minimum: null, maximum: null, currency: null, period: null },
  sponsorship: 'unknown',
  ...partial,
});

describe('searchQuery', () => {
  it('sends only what was set and hides expired listings unless asked', () => {
    expect(searchQuery(EMPTY_FILTERS)).toEqual({ q: '', includeExpired: false });
    expect(
      searchQuery({
        ...EMPTY_FILTERS,
        q: ' analyst ',
        category: 'scholarship',
        minPay: '30000',
        payCurrency: 'gbp',
        payStated: true,
        place: 'Leeds',
        radiusMiles: '25',
        remote: 'restricted',
        postedWithinDays: '7',
        deadlineBefore: '2026-12-01',
        followedOnly: true,
        provider: 'adzuna',
        includeExpired: true,
      }),
    ).toEqual({
      q: 'analyst',
      category: 'scholarship',
      minPay: 30000,
      payCurrency: 'GBP',
      payStated: true,
      place: 'Leeds',
      radiusMiles: 25,
      remote: 'restricted',
      postedWithinDays: 7,
      deadlineBefore: '2026-12-01',
      followedOnly: true,
      provider: 'adzuna',
    });
  });

  it('drops values that are not whole numbers or real days', () => {
    expect(searchQuery({ ...EMPTY_FILTERS, minPay: '30k', radiusMiles: '-5', deadlineBefore: '2026-12' })).toEqual({ q: '', includeExpired: false });
  });

  it('counts filters but not the words searched', () => {
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTERS, q: 'x' })).toBe(true);
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: 'x' })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, category: 'job', includeExpired: true, payStated: true })).toBe(3);
  });
});

describe('labels', () => {
  it('reads categories, filter categories and providers; brands are not translated', () => {
    expect(categoryLabel('scholarship')).toBe('Scholarship');
    expect(categoryLabel('remote')).toBe('Remote');
    expect(providerLabel('adzuna')).toBe('Adzuna');
    expect(providerLabel('paste')).toBe('Pasted by you');
    expect(providerLabel('something_new')).toBe('Another feed');
  });

  it('explains every filter that was not applied', () => {
    expect(notAppliedText({ filter: 'radiusMiles', reason: 'geocoding_unavailable' })).toMatch(/not connected yet/);
    expect(notAppliedText({ filter: 'followedOnly', reason: 'no_followed_companies' })).toMatch(/do not follow any companies/);
  });

  it('reads the plan radius limit from a refused distance only', () => {
    expect(radiusLimitOf(new ApiError(400, 'validation_error', { field: 'radiusMiles', limit: 25 } as never))).toBe(25);
    expect(radiusLimitOf(new ApiError(400, 'validation_error', { field: 'q' } as never))).toBeNull();
    expect(radiusLimitOf(new Error('x'))).toBeNull();
  });
});

describe('listingFacts', () => {
  it('shows employment fields for a job and lists what is not stated once', () => {
    const facts = listingFacts(item({ compensation: { minimum: 30000, maximum: 40000, currency: 'GBP', period: 'year' }, sponsorship: 'stated_no', schedule: 'full_time' }), 'en-GB');
    const labels = facts.rows.map((row) => row.label);
    expect(labels).toEqual(['Category', 'Employer', 'Location', 'Pay', 'Visa sponsorship', 'Schedule']);
    expect(facts.rows.find((row) => row.label === 'Pay')?.value).toMatch(/per year/);
    expect(facts.missing).toEqual(['Deadline']);
    expect(missingText(facts.missing)).toBe('Not stated in the listing: Deadline');
  });

  it('shows funding and eligibility for a scholarship instead of pay and sponsorship', () => {
    const facts = listingFacts(item({ category: 'scholarship', details: { stipend: null, studentEligibility: null, funding: 'Full tuition', clientScope: null, duration: null, compensationBasis: null, eventDate: null, registration: null, eligibility: null } }));
    const labels = facts.rows.map((row) => row.label);
    expect(labels).toContain('Funding');
    expect(labels).not.toContain('Pay');
    expect(facts.missing).toEqual(['Eligibility', 'Deadline']);
  });

  it('flags remote with no stated limit', () => {
    expect(listingFacts(item({ arrangement: 'remote' })).remoteNotWorldwide).toBe(true);
    expect(listingFacts(item({ arrangement: 'remote', remoteRestriction: 'UK only' })).remoteNotWorldwide).toBe(false);
  });

  it('formats pay without inventing a currency', () => {
    expect(formatPay({ minimum: null, maximum: null, currency: null, period: null })).toBeNull();
    expect(formatPay({ minimum: 20, maximum: null, currency: null, period: 'hour' }, 'en-US')).toBe('20');
    expect(formatPay({ minimum: 1, maximum: 2, currency: 'ZZZ1', period: null }, 'en-US')).toBe('1 ZZZ1–2 ZZZ1');
  });
});

describe('paste', () => {
  const text = 'Data analyst at Fictional Co in Leeds, full time, apply by email.';

  it('needs the full listing (40 characters)', () => {
    const short = checkPasteDraft({ ...EMPTY_PASTE, text: 'Analyst' });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.message).toMatch(/at least 40 characters/);
  });

  it('sends category, deadline and only the fields of that category', () => {
    const checked = checkPasteDraft({
      ...EMPTY_PASTE,
      text,
      category: 'career_fair',
      deadline: '2026-12-01',
      details: { eventDate: '2026-12-05', registration: ' On the day ', funding: 'ignored' },
    });
    expect(checked).toEqual({
      ok: true,
      input: { text, category: 'career_fair', deadline: '2026-12-01', details: { eventDate: '2026-12-05', registration: 'On the day' } },
    });
    expect(pasteDetailFields('')).toEqual([]);
    expect(pasteDetailFields('freelance')).toEqual(['clientScope', 'duration', 'compensationBasis']);
  });

  it('refuses a bad link or an impossible date before sending', () => {
    expect(checkPasteDraft({ ...EMPTY_PASTE, text, sourceUrl: 'ftp://x' }).ok).toBe(false);
    expect(checkPasteDraft({ ...EMPTY_PASTE, text, deadline: '2026-02-30' }).ok).toBe(false);
    expect(isCalendarDay('2028-02-29')).toBe(true);
  });

  it('reads the server refusal in the website words', () => {
    expect(pasteErrorText(new ApiError(400, 'validation_error', { field: 'sourceUrl' } as never))).toMatch(/https/);
    expect(pasteErrorText(new ApiError(400, 'validation_error', { field: 'deadline' } as never))).toMatch(/category and the deadline/);
    expect(pasteErrorText(new Error('x'))).toBeNull();
  });
});
