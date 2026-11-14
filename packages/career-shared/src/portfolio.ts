export type PortfolioVisibility = 'draft' | 'private' | 'public';

/** Parts of a page the owner can switch on or off. Contact also needs each detail's own opt-in. */
export interface PortfolioSections {
  summary: boolean;
  evidence: boolean;
  skills: boolean;
  contact: boolean;
}

export const DEFAULT_PORTFOLIO_SECTIONS: PortfolioSections = { summary: true, evidence: true, skills: true, contact: true };
export const CASE_STUDY_MAX = 4000;

/** Reads a stored or sent section map; anything missing keeps its default. */
export function portfolioSections(value: unknown): PortfolioSections {
  const out = { ...DEFAULT_PORTFOLIO_SECTIONS };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(out) as Array<keyof PortfolioSections>) {
      const next = (value as Record<string, unknown>)[key];
      if (typeof next === 'boolean') out[key] = next;
    }
  }
  return out;
}

export interface CreatePortfolioInput {
  title: string;
  headline?: string;
  displayName?: string;
  locale?: 'en' | 'fr';
}

export interface UpdatePortfolioInput {
  title?: string;
  headline?: string;
  displayName?: string;
  locale?: 'en' | 'fr';
  evidenceIds?: string[];
  showEmail?: boolean;
  showPhone?: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
  sections?: Partial<PortfolioSections>;
  /** Case-study text per selected evidence id. Ids not on the page are refused. */
  caseStudies?: Record<string, string>;
}

export interface PublishPortfolioInput {
  visibility: 'public' | 'private';
}

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  evidenceType: string;
  evidenceLabel: string;
  linkedSkills: string[];
  /** The owner's case-study text for this item on this page; empty when none. */
  caseStudy: string;
}

export interface PortfolioPage {
  id: string;
  slug: string;
  title: string;
  headline: string;
  displayName: string;
  locale: 'en' | 'fr';
  visibility: PortfolioVisibility;
  showEmail: boolean;
  showPhone: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  evidenceIds: string[];
  sections: PortfolioSections;
  caseStudies: Record<string, string>;
  shareToken: string | null;
  publishedAt: string | null;
  visitCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A public or private-link view. Original files and hidden contact details are omitted. */
export interface PublicPortfolioView {
  slug: string;
  title: string;
  headline: string;
  displayName: string;
  items: PortfolioItem[];
  /** Union of the shown items' skills, when the skills section is on. */
  skills: string[];
  sections: PortfolioSections;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface PortfolioQr {
  svg: string;
  path: string;
}

/** The slug is the stable id. A display-name change must not appear in this path. */
export function portfolioPath(locale: 'en' | 'fr', slug: string, token?: string | null): string {
  // V1 serves public portfolios at /[locale]/portfolio/[slug] (V2 used /p/).
  const path = `/${locale}/portfolio/${slug}`;
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}
