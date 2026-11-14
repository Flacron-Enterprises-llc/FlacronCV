import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { PublicPortfolioView } from '@flacroncv/career-api-client';
import en from '../../../../public/locales/en/common.json';
import { PublicPortfolioScreen } from './PublicPortfolioScreen';

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/career/CareerServices', () => ({ careerApiOrigin: () => 'http://career.test' }));

const page: PublicPortfolioView = {
  slug: 'ada',
  title: 'Ada Lovelace',
  headline: 'Analyst',
  displayName: 'Ada Lovelace',
  items: [
    {
      id: 'e1',
      title: 'Churn model',
      description: 'Built a churn model.',
      evidenceType: 'project',
      evidenceLabel: 'self_reported',
      linkedSkills: ['SQL'],
      caseStudy: 'The problem, what I did, and the result.',
    },
  ],
  skills: ['SQL', 'Python'],
  sections: { summary: true, evidence: true, skills: true, contact: false },
  contactEmail: null,
  contactPhone: null,
};

function renderPage(view: PublicPortfolioView) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <PublicPortfolioScreen slug="ada" token={null} initial={view} />
    </NextIntlClientProvider>,
  );
}

describe('public portfolio page', () => {
  it('shows each item’s case study and the page’s skills', () => {
    renderPage(page);
    expect(screen.getByText('Case study')).toBeTruthy();
    expect(screen.getByText('The problem, what I did, and the result.')).toBeTruthy();
    const skills = within(screen.getByTestId('portfolio-skills'));
    expect(skills.getByText('Python')).toBeTruthy();
  });

  it('leaves out an empty case study and a switched-off skills section', () => {
    renderPage({ ...page, items: [{ ...page.items[0], caseStudy: '  ' }], sections: { ...page.sections, skills: false } });
    expect(screen.queryByText('Case study')).toBeNull();
    expect(screen.queryByTestId('portfolio-skills')).toBeNull();
  });
});
