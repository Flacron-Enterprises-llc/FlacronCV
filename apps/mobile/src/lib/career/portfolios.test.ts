import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { PortfolioPage } from '../../../../../packages/career-api-client/src/types';
import {
  CASE_STUDY_MAX,
  EMPTY_PORTFOLIO_FORM,
  caseStudiesForSave,
  setSection,
  formFromPortfolio,
  portfolioErrorMessage,
  portfolioFormDirty,
  portfolioLoadState,
  portfolioSharePath,
  portfolioShareUrl,
  toCreatePortfolioInput,
  toUpdatePortfolioInput,
  toggleEvidenceId,
  validatePortfolioForm,
  visibilityPill,
  visitsText,
  webOrigin,
} from './portfolios';

const page: PortfolioPage = {
  id: 'p1',
  slug: 'ada-lovelace-1a2b',
  title: 'Work',
  headline: 'Engineer',
  displayName: 'Ada',
  locale: 'en',
  visibility: 'draft',
  showEmail: false,
  showPhone: false,
  contactEmail: null,
  contactPhone: null,
  evidenceIds: ['e1', 'e2'],
  sections: { summary: true, evidence: true, skills: true, contact: true },
  caseStudies: { e1: 'Built the parser.' },
  shareToken: null,
  publishedAt: null,
  visitCount: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('portfolio links', () => {
  it('reads only a plain http(s) website origin', () => {
    expect(webOrigin(undefined)).toBeNull();
    expect(webOrigin('  ')).toBeNull();
    expect(webOrigin('not a url')).toBeNull();
    expect(webOrigin('ftp://flacroncv.test')).toBeNull();
    expect(webOrigin('https://user:pw@flacroncv.test')).toBeNull();
    expect(webOrigin('https://flacroncv.test/en/')).toBe('https://flacroncv.test');
    expect(webOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('builds the same path as the website and the API QR', () => {
    expect(portfolioSharePath(page)).toBeNull();
    expect(portfolioSharePath({ ...page, visibility: 'public', shareToken: 'ignored' })).toBe('/en/portfolio/ada-lovelace-1a2b');
    expect(portfolioSharePath({ ...page, visibility: 'private', shareToken: 'a+b/c' })).toBe('/en/portfolio/ada-lovelace-1a2b?token=a%2Bb%2Fc');
    expect(portfolioSharePath({ ...page, visibility: 'private', shareToken: null })).toBeNull();
    expect(portfolioSharePath({ ...page, visibility: 'public', locale: 'fr' })).toBe('/fr/portfolio/ada-lovelace-1a2b');
  });

  it('has no share link without a website origin or for a draft', () => {
    expect(portfolioShareUrl(null, { ...page, visibility: 'public' })).toBeNull();
    expect(portfolioShareUrl('https://flacroncv.test', page)).toBeNull();
    expect(portfolioShareUrl('https://flacroncv.test', { ...page, visibility: 'public' })).toBe('https://flacroncv.test/en/portfolio/ada-lovelace-1a2b');
  });
});

describe('portfolio view', () => {
  it('shows visibility and visits', () => {
    expect(visibilityPill('public').label).toBe('PUBLIC');
    expect(visibilityPill('private').label).toBe('PRIVATE LINK');
    expect(visibilityPill('draft').label).toBe('DRAFT');
    expect(visitsText(null)).toBeNull();
    expect(visitsText(1)).toBe('1 view');
    expect(visitsText(0)).toBe('0 views');
  });

  it('maps load failures to the locked states', () => {
    expect(portfolioLoadState(new ApiError(402, 'plan_upgrade_required', { code: 'plan_upgrade_required' }))).toBe('upgrade');
    expect(portfolioLoadState(new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable' }))).toBe('off');
    expect(portfolioLoadState(new Error('x'))).toBe('error');
  });

  it('error copy never offers a purchase', () => {
    for (const code of ['plan_upgrade_required', 'capacity_exceeded', 'feature_unavailable']) {
      expect(portfolioErrorMessage(new ApiError(402, code, { code }))).not.toMatch(/upgrade|buy|\$/i);
    }
    expect(portfolioErrorMessage(new Error('x'))).toBe('That change was not saved.');
  });
});

describe('portfolio form', () => {
  it('requires a title and enforces API limits', () => {
    expect(validatePortfolioForm(EMPTY_PORTFOLIO_FORM).title).toBeDefined();
    const errors = validatePortfolioForm({
      ...EMPTY_PORTFOLIO_FORM,
      title: 't'.repeat(121),
      headline: 'h'.repeat(281),
      displayName: 'd'.repeat(121),
      contactEmail: 'e'.repeat(201),
      contactPhone: '1'.repeat(41),
    });
    expect(Object.keys(errors).sort()).toEqual(['contactEmail', 'contactPhone', 'displayName', 'headline', 'title']);
    expect(validatePortfolioForm({ ...EMPTY_PORTFOLIO_FORM, title: 'ok' })).toEqual({});
  });

  it('builds the website create and update bodies', () => {
    expect(toCreatePortfolioInput({ ...EMPTY_PORTFOLIO_FORM, title: ' My work ', headline: 'H', displayName: 'Ada' })).toEqual({
      title: 'My work',
      headline: 'H',
      displayName: 'Ada',
      locale: 'en',
    });
    expect(toUpdatePortfolioInput({ ...formFromPortfolio(page), contactEmail: ' ', contactPhone: '+1 555', showPhone: true })).toEqual({
      title: 'Work',
      headline: 'Engineer',
      displayName: 'Ada',
      showEmail: false,
      showPhone: true,
      contactEmail: null,
      contactPhone: '+1 555',
      evidenceIds: ['e1', 'e2'],
      sections: { summary: true, evidence: true, skills: true, contact: true },
      // Every selected item is sent: an empty text clears its case study on the API.
      caseStudies: { e1: 'Built the parser.', e2: '' },
    });
  });

  it('reads missing sections as the defaults and only sends case studies for items on the page', () => {
    const legacy = formFromPortfolio({ ...page, sections: undefined as never, caseStudies: undefined as never });
    expect(legacy.sections).toEqual({ summary: true, evidence: true, skills: true, contact: true });
    expect(legacy.caseStudies).toEqual({});
    const form = { ...formFromPortfolio(page), evidenceIds: ['e2'], caseStudies: { e1: 'Old', e2: '  Ran the launch  ' } };
    expect(caseStudiesForSave(form)).toEqual({ e2: 'Ran the launch' });
    expect(toUpdatePortfolioInput({ ...form, sections: setSection(form.sections, 'contact', false) }).sections).toEqual({
      summary: true,
      evidence: true,
      skills: true,
      contact: false,
    });
  });

  it('refuses an over-long case study and names the limit for the API refusal', () => {
    const form = { ...formFromPortfolio(page), caseStudies: { e1: 'x'.repeat(CASE_STUDY_MAX + 1) } };
    expect(validatePortfolioForm(form).caseStudies).toContain(String(CASE_STUDY_MAX));
    // Text for an item that is no longer selected is not checked (and not sent).
    expect(validatePortfolioForm({ ...form, evidenceIds: ['e2'] }).caseStudies).toBeUndefined();
    const refused = new ApiError(400, 'validation_error', { code: 'validation_error', field: 'caseStudies', reason: 'too_long' });
    expect(portfolioErrorMessage(refused)).toContain(String(CASE_STUDY_MAX));
  });

  it('detects edits, ignoring evidence order', () => {
    const base = formFromPortfolio(page);
    expect(portfolioFormDirty(base, formFromPortfolio(page))).toBe(false);
    expect(portfolioFormDirty({ ...base, evidenceIds: ['e2', 'e1'] }, base)).toBe(false);
    expect(portfolioFormDirty({ ...base, evidenceIds: ['e1'] }, base)).toBe(true);
    expect(portfolioFormDirty({ ...base, showEmail: true }, base)).toBe(true);
    expect(portfolioFormDirty({ ...base, headline: 'New' }, base)).toBe(true);
    expect(portfolioFormDirty({ ...base, sections: setSection(base.sections, 'skills', false) }, base)).toBe(true);
    expect(portfolioFormDirty({ ...base, caseStudies: { e1: 'Built the parser. ' } }, base)).toBe(false);
    expect(portfolioFormDirty({ ...base, caseStudies: { e1: 'Built the parser.', e2: 'New' } }, base)).toBe(true);
  });

  it('toggles evidence ids', () => {
    expect(toggleEvidenceId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleEvidenceId(['a', 'b'], 'a')).toEqual(['b']);
  });
});
