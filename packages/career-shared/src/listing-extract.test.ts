import { describe, expect, it } from 'vitest';
import { extractCompensation, extractListingFields, extractSponsorship } from './listing-extract';

describe('extractListingFields', () => {
  it('reads "Title at Employer, Place" from the first line', () => {
    const found = extractListingFields('Data Analyst at Northwind Traders, Montreal\nWe need SQL and dashboards for the finance team.');
    expect(found.title).toBe('Data Analyst');
    expect(found.organization).toBe('Northwind Traders');
    expect(found.locations).toContain('Montreal');
  });

  it('reads labelled employer and location lines in several languages', () => {
    const english = extractListingFields('Junior Cataloguer\nCompany: Harbourfront Library\nLocation: Toronto, ON\nKeep records accurate.');
    expect(english.organization).toBe('Harbourfront Library');
    expect(english.locations).toEqual(['Toronto, ON']);
    const french = extractListingFields('Analyste\nEntreprise : Banque du Nord\nLieu : Lyon\nAnalyse de données.');
    expect(french.organization).toBe('Banque du Nord');
    expect(french.locations).toEqual(['Lyon']);
  });

  it('takes a city and region closing the title as a place and strips it from the title', () => {
    const found = extractListingFields('Junior Analyst - Montreal, QC\nBuild reports in SQL for the operations group.');
    expect(found.title).toBe('Junior Analyst');
    expect(found.locations).toEqual(['Montreal, QC']);
  });

  it('adds remote and hybrid as work modes', () => {
    expect(extractListingFields('Support Engineer\nThis is a hybrid role, three days in the office.').locations).toEqual(['Hybrid']);
    expect(extractListingFields('Support Engineer\nFully remote across Canada.').locations).toEqual(['Remote']);
  });

  it('leaves the employer unknown when the paste does not name one plainly', () => {
    const found = extractListingFields('We are looking for an analyst who knows SQL and enjoys clean data.\nAbout us: a small team.');
    expect(found.organization).toBeNull();
    expect(found.locations).toEqual([]);
    expect(found.compensation).toEqual({ minimum: null, maximum: null, currency: null, period: null });
    expect(found.sponsorship).toBe('unknown');
  });

  it('reads "X is hiring" and "Join X"', () => {
    expect(extractListingFields('Analyst\nNorthwind Traders is hiring an analyst for its finance team.').organization).toBe('Northwind Traders');
    expect(extractListingFields('Analyst\nJoin Contoso Health and help patients.').organization).toBe('Contoso Health');
  });
});

describe('extractCompensation', () => {
  it('reads a dollar range with thousands separators and a period', () => {
    expect(extractCompensation('Salary: $80,000 - $95,000 per year')).toEqual({ minimum: 80000, maximum: 95000, currency: 'USD', period: 'year' });
  });

  it('reads k suffixes and prefixed dollars', () => {
    expect(extractCompensation('Pay C$70k–85k')).toEqual({ minimum: 70000, maximum: 85000, currency: 'CAD', period: null });
  });

  it('reads an amount followed by a currency code and an hourly rate', () => {
    expect(extractCompensation('Rate: 28.50 CAD per hour')).toEqual({ minimum: 29, maximum: null, currency: 'CAD', period: 'hour' });
    expect(extractCompensation('45 000 – 52 000 € par an')).toEqual({ minimum: 45000, maximum: 52000, currency: 'EUR', period: 'year' });
  });

  it('reads a leading currency code', () => {
    expect(extractCompensation('GBP 40,000 to 45,000 annually')).toEqual({ minimum: 40000, maximum: 45000, currency: 'GBP', period: 'year' });
  });

  it('never reads a bare number as pay', () => {
    expect(extractCompensation('5 years of experience, 2026 start, team of 12')).toEqual({ minimum: null, maximum: null, currency: null, period: null });
  });
});

describe('extractSponsorship', () => {
  it('reads explicit refusals and offers only', () => {
    expect(extractSponsorship('We cannot sponsor visas for this role.')).toBe('stated_no');
    expect(extractSponsorship('Visa sponsorship is not available.')).toBe('stated_no');
    expect(extractSponsorship('Visa sponsorship available for the right candidate.')).toBe('stated_yes');
    expect(extractSponsorship('We offer visa sponsorship.')).toBe('stated_yes');
    expect(extractSponsorship('Must be authorized to work in Canada.')).toBe('unknown');
  });
});
