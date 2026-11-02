export type PortfolioVisibility = 'draft' | 'private' | 'public';

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
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface PortfolioQr {
  svg: string;
  path: string;
}

/** The slug is the stable id. A display-name change must not appear in this path. */
export function portfolioPath(locale: 'en' | 'fr', slug: string, token?: string | null): string {
  const path = `/${locale}/p/${slug}`;
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}
