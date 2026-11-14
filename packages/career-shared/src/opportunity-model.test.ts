import { describe, expect, it } from 'vitest';
import { companyMatches, meetsRelevance, reminderDue, alertTierAtLeast, filterTier } from './alerts';
import { extractListingFields, parseStatedDate } from './listing-extract';
import { explainMatch, matchLabel, preferenceChecks, requiredCredentials } from './match';
import { computeTrustSignals } from './opportunity-trust';
import { dedupeKey, fieldsForCategory, filterCategoryColumn, listingDetailsOf, placeMatchesLocations } from './opportunities';
import { formatIssues, readabilityReport } from './readability';
import type { ResumeBody } from './resume';

describe('listing model', () => {
  it('keeps one employer title in two cities apart and meets two spellings of the same city', () => {
    const base = { provider: 'adzuna', organization: 'Quay Mills', title: 'Payroll clerk', sourceId: 'a' };
    expect(dedupeKey({ ...base, locations: ['Leeds'] })).not.toBe(dedupeKey({ ...base, locations: ['York'] }));
    expect(dedupeKey({ ...base, locations: ['Montréal, QC'] })).toBe(dedupeKey({ ...base, provider: 'lever', locations: ['Montreal, Quebec'] }));
  });

  it('shows funding and eligibility for a scholarship and employment fields for a job', () => {
    expect(fieldsForCategory('scholarship')).toEqual({ employment: false, details: ['funding', 'eligibility'] });
    expect(fieldsForCategory('internship')).toEqual({ employment: true, details: ['stipend', 'studentEligibility'] });
    expect(fieldsForCategory('freelance').details).toEqual(['clientScope', 'duration', 'compensationBasis']);
    expect(fieldsForCategory('career_fair').details).toEqual(['eventDate', 'registration']);
    expect(fieldsForCategory('job')).toEqual({ employment: true, details: [] });
    expect(filterCategoryColumn('remote')).toBe('arrangement');
    expect(filterCategoryColumn('part_time')).toBe('schedule');
    expect(filterCategoryColumn('fellowship')).toBe('category');
    expect(listingDetailsOf({ funding: ' Full tuition ', eventDate: 'soon', other: 1 })).toMatchObject({ funding: 'Full tuition', eventDate: null });
  });

  it('matches a place by whole words, ignoring accents', () => {
    expect(placeMatchesLocations('Montreal, QC', ['Montréal'])).toBe(true);
    expect(placeMatchesLocations('York', ['New York, NY'])).toBe(true);
    expect(placeMatchesLocations('York', ['Yorkshire'])).toBe(false);
  });
});

describe('listing extraction', () => {
  it('reads deadline, publication date, remote limit, schedule, category and labelled details; guesses nothing else', () => {
    const found = extractListingFields(
      'Summer Internship at Pine Labs\nFull-time, fully remote. Washington residents only.\nApplication deadline: December 15, 2026\nDate posted: 1 November 2026\nStipend: $2,000 per month\nWork on data.',
    );
    expect(found).toMatchObject({
      category: 'internship',
      deadline: '2026-12-15',
      publishedAt: '2026-11-01',
      remoteRestriction: 'Washington residents only',
      schedule: 'full_time',
      arrangement: 'remote',
      seniority: 'entry',
    });
    expect(found.details.stipend).toBe('$2,000 per month');
    const plain = extractListingFields('Analyst at Northwind\nApply soon. Closes 01/12/2026.\nWe value remote and on-site work equally.');
    expect(plain.deadline).toBeNull();
    expect(plain.remoteRestriction).toBeNull();
    expect(plain.category).toBeNull();
  });

  it('parses only unambiguous dates', () => {
    expect(parseStatedDate('2026-02-30')).toBeNull();
    expect(parseStatedDate('15 décembre 2026')).toBe('2026-12-15');
    expect(parseStatedDate('03/04/2026')).toBeNull();
  });
});

describe('explainable matching', () => {
  const listing = {
    status: 'open' as const,
    deadline: null,
    title: 'Senior payroll analyst',
    description: 'Payroll and SQL. CPA certification required.',
    locations: ['Leeds'],
    payKnown: true,
    sponsorship: 'unknown' as const,
    arrangement: 'hybrid' as const,
    schedule: 'full_time' as const,
    seniority: 'senior' as const,
    compensation: { minimum: 40000, maximum: 45000, currency: 'GBP', period: 'year' },
  };

  it('compares preferences without converting pay or inferring eligibility', () => {
    const checks = preferenceChecks(listing, {
      locations: ['Leeds'],
      arrangements: ['remote'],
      schedules: ['full_time'],
      seniority: 'senior',
      minimumPay: { amount: 50000, currency: 'USD', period: 'year' },
    });
    expect(Object.fromEntries(checks.map((c) => [c.dimension, c.status]))).toEqual({
      location: 'meets', arrangement: 'conflict', schedule: 'meets', seniority: 'meets', pay: 'unknown',
    });
    expect(preferenceChecks({ ...listing, remoteRestriction: 'UK only' }, null).find((c) => c.dimension === 'remote_restriction')?.status).toBe('check');
  });

  it('names a missing credential, credits a confirmed one and labels the result', () => {
    expect(requiredCredentials('CPA certification required. Must hold a valid CDL. Requires Python.')).toEqual(['CPA', 'CDL']);
    const missing = explainMatch(listing, [{ factId: 's', text: 'Payroll SQL analyst', confirmed: true }], '2026-10-17');
    expect(missing.gaps[0]).toEqual({ code: 'credential_missing', token: 'CPA' });
    expect(missing.label).toBe('stretch');
    const held = explainMatch(listing, [{ factId: 's', text: 'Senior payroll analyst SQL', confirmed: true }], '2026-10-17', {
      credentials: [{ factId: 'c', name: 'CPA', confirmed: true }],
    });
    expect(held.reasons).toContainEqual({ code: 'credential_held', factId: 'c', token: 'CPA' });
    expect(held.label).toBe('strong_fit');
    expect(matchLabel('strong', [], [{ dimension: 'pay', status: 'conflict' }]).label).toBe('possible_fit');
    expect(matchLabel('blocked', [], []).label).toBe('expired');
  });

  it('does not call pay or sponsorship missing on a scholarship', () => {
    const explained = explainMatch({ ...listing, category: 'scholarship', payKnown: false }, [], '2026-10-17');
    expect(explained.unknowns.map((u) => u.code)).not.toContain('pay');
    expect(explained.unknowns.map((u) => u.code)).not.toContain('sponsorship');
  });
});

describe('alerts and reminders', () => {
  it('matches companies by whole words and aliases', () => {
    expect(companyMatches('Meta Platforms', ['Meta'])).toBe('Meta');
    expect(companyMatches('Metamorphic Ltd', ['Meta'])).toBeNull();
    expect(companyMatches('Facebook UK', ['Meta', 'Facebook'])).toBe('Facebook');
  });

  it('orders alert levels and filters by tier', () => {
    expect(alertTierAtLeast('enhanced', 'personalized')).toBe(true);
    expect(alertTierAtLeast('basic', 'personalized')).toBe(false);
    expect(filterTier('minPay')).toBe('personalized');
    expect(filterTier('relevance')).toBe('enhanced');
    expect(meetsRelevance(null, 'possible_fit')).toBe(false);
    expect(meetsRelevance('possible_fit', 'strong_fit')).toBe(false);
    expect(meetsRelevance('strong_fit', 'strong_fit')).toBe(true);
  });

  it('makes a reminder due within its lead time and never for a past date', () => {
    expect(reminderDue('interview', '2026-10-20', '2026-10-17')).toBe(true);
    expect(reminderDue('interview', '2026-11-20', '2026-10-17')).toBe(false);
    expect(reminderDue('certification_expiry', '2026-12-31', '2026-10-17')).toBe(true);
    expect(reminderDue('listing_deadline', '2026-10-16', '2026-10-17')).toBe(false);
  });
});

describe('format readability', () => {
  const body = (lines: Array<[string, string]>): ResumeBody => ({
    templateId: 'classic',
    confirmation: 'confirmed',
    sections: lines.map(([factType, text], i) => ({ factType: factType as never, lines: [{ factId: `f${i}`, factType: factType as never, text, uncertain: false }] })),
  });

  it('flags long lines, table markers, unusual characters and a missing contact, separately from fit', () => {
    const report = readabilityReport(body([['skill', `SQL\tExcel`], ['summary', 'x'.repeat(301)], ['project', 'Shipped it 🚀']]));
    expect(report.formatIssues.map((issue) => issue.code).sort()).toEqual(['long_line', 'missing_contact', 'table_marker', 'unusual_characters']);
    expect(formatIssues(body([['contact', 'ada@example.test · +44 20 7946 0000'], ['skill', 'SQL · Excel']]))).toEqual([]);
  });
});

describe('trust signals', () => {
  it('uses the same 14-day stale rule as search', () => {
    const summary = computeTrustSignals({ moderationStatus: 'unflagged', checkedAtIso: '2026-10-01T00:00:00Z', nowMs: Date.parse('2026-10-17T00:00:00Z'), sourcesCount: 1, reportCount: 0 });
    expect(summary.signals.map((s) => s.key)).toContain('stale_listing');
  });
});
