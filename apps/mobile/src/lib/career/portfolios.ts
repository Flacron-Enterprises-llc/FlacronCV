import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type {
  CreatePortfolioInput,
  PortfolioPage,
  PortfolioVisibility,
  UpdatePortfolioInput,
} from '../../../../../packages/career-api-client/src/types';
import {
  CASE_STUDY_MAX,
  DEFAULT_PORTFOLIO_SECTIONS,
  portfolioPath,
  portfolioSections,
  type PortfolioSections,
} from '../../../../../packages/career-shared/src/portfolio';
import { careerErrorMessage } from '../career-view';
import { t } from '../../i18n';

export { CASE_STUDY_MAX };
export type { PortfolioSections };

/** The four switchable parts of a page, in the website's order. */
export const PORTFOLIO_SECTION_KEYS: readonly (keyof PortfolioSections)[] = ['summary', 'evidence', 'skills', 'contact'];

/**
 * Pure view logic for the mobile Portfolio pages (tested in portfolios.test.ts).
 * Mirrors the website's PortfolioScreen. The public page itself lives on the
 * website, so share links and QR codes use the website origin
 * (EXPO_PUBLIC_WEB_URL), never the career API origin.
 */

export const PORTFOLIO_LIMITS = {
  title: 120,
  headline: 280,
  displayName: 120,
  contactEmail: 200,
  contactPhone: 40,
} as const;

/** Visibility name in the current language (careerPortfolios.visibility.*). */
export function visibilityText(visibility: PortfolioVisibility): string {
  if (visibility === 'public') return t('careerPortfolios.visibility.public');
  if (visibility === 'private') return t('careerPortfolios.visibility.private');
  return t('careerPortfolios.visibility.draft');
}

export function visibilityPill(visibility: PortfolioVisibility): { label: string; tone: 'default' | 'brand' | 'success' } {
  if (visibility === 'public') return { label: t('careerPortfolios.pill.public'), tone: 'success' };
  if (visibility === 'private') return { label: t('careerPortfolios.pill.private'), tone: 'brand' };
  return { label: t('careerPortfolios.pill.draft'), tone: 'default' };
}

/** Null when visit counts are not on the plan (the API sends null). */
export function visitsText(count: number | null): string | null {
  if (count === null) return null;
  return t('careerPortfolios.visits', { count });
}

export interface PortfolioForm {
  title: string;
  headline: string;
  displayName: string;
  contactEmail: string;
  contactPhone: string;
  showEmail: boolean;
  showPhone: boolean;
  evidenceIds: string[];
  sections: PortfolioSections;
  /** Case-study text per evidence id; only ids on the page are sent. */
  caseStudies: Record<string, string>;
}

export const EMPTY_PORTFOLIO_FORM: PortfolioForm = {
  title: '',
  headline: '',
  displayName: '',
  contactEmail: '',
  contactPhone: '',
  showEmail: false,
  showPhone: false,
  evidenceIds: [],
  sections: { ...DEFAULT_PORTFOLIO_SECTIONS },
  caseStudies: {},
};

export function formFromPortfolio(page: PortfolioPage): PortfolioForm {
  return {
    title: page.title,
    headline: page.headline,
    displayName: page.displayName,
    contactEmail: page.contactEmail ?? '',
    contactPhone: page.contactPhone ?? '',
    showEmail: page.showEmail,
    showPhone: page.showPhone,
    evidenceIds: [...page.evidenceIds],
    // Older pages (or an older API) may send no map: the shared reader fills the defaults.
    sections: portfolioSections(page.sections),
    caseStudies: { ...(page.caseStudies ?? {}) },
  };
}

/** Case studies of the selected items, trimmed, without empty ones. */
function selectedCaseStudies(form: Pick<PortfolioForm, 'evidenceIds' | 'caseStudies'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of form.evidenceIds) {
    const text = (form.caseStudies[id] ?? '').trim();
    if (text) out[id] = text;
  }
  return out;
}

/**
 * Every selected item's text, empty included: the API updates only the ids it
 * is sent, so an emptied case study must be sent as "" to clear it. Ids not on
 * the page are refused by the API and never sent.
 */
export function caseStudiesForSave(form: Pick<PortfolioForm, 'evidenceIds' | 'caseStudies'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of form.evidenceIds) out[id] = (form.caseStudies[id] ?? '').trim();
  return out;
}

export function portfolioFormDirty(form: PortfolioForm, base: PortfolioForm): boolean {
  if (form.showEmail !== base.showEmail || form.showPhone !== base.showPhone) return true;
  const texts = ['title', 'headline', 'displayName', 'contactEmail', 'contactPhone'] as const;
  if (texts.some((key) => form[key].trim() !== base[key].trim())) return true;
  if (PORTFOLIO_SECTION_KEYS.some((key) => form.sections[key] !== base.sections[key])) return true;
  const a = [...form.evidenceIds].sort();
  const b = [...base.evidenceIds].sort();
  if (a.length !== b.length || a.some((id, i) => id !== b[i])) return true;
  const ca = selectedCaseStudies(form);
  const cb = selectedCaseStudies(base);
  const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  return [...keys].some((key) => ca[key] !== cb[key]);
}

export function setSection(sections: PortfolioSections, key: keyof PortfolioSections, value: boolean): PortfolioSections {
  return { ...sections, [key]: value };
}

export function toggleEvidenceId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export type PortfolioFormErrors = Partial<
  Record<'title' | 'headline' | 'displayName' | 'contactEmail' | 'contactPhone' | 'caseStudies', string>
>;

export function validatePortfolioForm(form: PortfolioForm): PortfolioFormErrors {
  const errors: PortfolioFormErrors = {};
  if (!form.title.trim()) errors.title = t('careerPortfolios.errors.titleRequired');
  for (const key of ['title', 'headline', 'displayName', 'contactEmail', 'contactPhone'] as const) {
    if (!errors[key] && form[key].trim().length > PORTFOLIO_LIMITS[key]) {
      errors[key] = t('careerPortfolios.errors.tooLong', { max: PORTFOLIO_LIMITS[key] });
    }
  }
  const longCase = form.evidenceIds.find((id) => (form.caseStudies[id] ?? '').trim().length > CASE_STUDY_MAX);
  if (longCase) errors.caseStudies = t('careerPortfolios.errors.tooLong', { max: CASE_STUDY_MAX });
  return errors;
}

/** Same body the website sends on create (pages are created with the 'en' locale). */
export function toCreatePortfolioInput(form: PortfolioForm): CreatePortfolioInput {
  return { title: form.title.trim(), headline: form.headline, displayName: form.displayName, locale: 'en' };
}

/** Same body the website sends on save. */
export function toUpdatePortfolioInput(form: PortfolioForm): UpdatePortfolioInput {
  return {
    title: form.title.trim(),
    headline: form.headline,
    displayName: form.displayName,
    showEmail: form.showEmail,
    showPhone: form.showPhone,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    evidenceIds: form.evidenceIds,
    sections: { ...form.sections },
    caseStudies: caseStudiesForSave(form),
  };
}

/** The website origin from config, or null when it is missing or not a plain http(s) origin. */
export function webOrigin(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The page's public path, as the website and the API's QR build it. Null for a draft. */
export function portfolioSharePath(page: Pick<PortfolioPage, 'locale' | 'slug' | 'visibility' | 'shareToken'>): string | null {
  if (page.visibility === 'draft') return null;
  if (page.visibility === 'private' && !page.shareToken) return null;
  return portfolioPath(page.locale, page.slug, page.visibility === 'private' ? page.shareToken : null);
}

/** Full link to share, or null when the page is a draft or the website origin is not configured. */
export function portfolioShareUrl(
  origin: string | null,
  page: Pick<PortfolioPage, 'locale' | 'slug' | 'visibility' | 'shareToken'>,
): string | null {
  const path = portfolioSharePath(page);
  if (!origin || !path) return null;
  return `${origin}${path}`;
}

export function portfolioErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'plan_upgrade_required') return t('careerPortfolios.errors.planUpgrade');
    if (error.code === 'capacity_exceeded') return t('careerPortfolios.errors.capacity');
    if (error.code === 'feature_unavailable') return t('careerPortfolios.errors.off');
    if (error.code === 'validation_error') {
      if ((error.body as { field?: unknown }).field === 'caseStudies') {
        return t('careerPortfolios.errors.caseStudy', { max: CASE_STUDY_MAX });
      }
      return t('careerPortfolios.errors.validation');
    }
  }
  return careerErrorMessage(error, t('careerPortfolios.errors.failed'));
}

/** How a failed list load should be shown: locked by plan, switched off, or a retryable error. */
export function portfolioLoadState(error: unknown): 'upgrade' | 'off' | 'error' {
  if (error instanceof ApiError && error.code === 'plan_upgrade_required') return 'upgrade';
  if (error instanceof ApiError && error.code === 'feature_unavailable') return 'off';
  return 'error';
}
