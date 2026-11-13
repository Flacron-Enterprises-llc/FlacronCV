import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../public/locales/en/common.json';
import { PublicPricingPage } from './PublicPricingPage';
import CareerAddonTeaser from '@/components/landing/CareerAddonTeaser';

// V1's own plan cards are reused unchanged; stand in for them here.
vi.mock('@/components/landing/Pricing', () => ({ default: () => <section data-testid="v1-pricing" /> }));
vi.mock('./CareerPricing', () => ({ CareerPricing: () => <section data-testid="career-pricing" /> }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderWithIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public /pricing page', () => {
  it('shows only FlacronCV plans when the career build switch is off', () => {
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', '');
    renderWithIntl(<PublicPricingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pricing' })).toBeTruthy();
    expect(screen.getByTestId('v1-pricing')).toBeTruthy();
    expect(screen.queryByTestId('career-pricing')).toBeNull();
    expect(screen.queryByText('See the career tools add-on')).toBeNull();
    expect(screen.queryByText(/career tools are an optional add-on/)).toBeNull();
  });

  it('adds the career tools add-on under FlacronCV plans when the switch is on', () => {
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', 'true');
    renderWithIntl(<PublicPricingPage />);
    const v1 = screen.getByTestId('v1-pricing');
    const career = screen.getByTestId('career-pricing');
    expect(v1.compareDocumentPosition(career) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See the career tools add-on' }).getAttribute('href')).toBe('#career');
  });
});

describe('homepage career add-on teaser', () => {
  it('renders nothing without the career build switch', () => {
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', 'false');
    const { container } = renderWithIntl(<CareerAddonTeaser />);
    expect(container.innerHTML).toBe('');
  });

  it('gives the lowest add-on price from the catalog and links to the career section of /pricing', () => {
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', 'true');
    renderWithIntl(<CareerAddonTeaser />);
    expect(screen.getByRole('heading', { name: 'Career tools add-on — from $21.99/month' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /See career plans/ }).getAttribute('href')).toBe('/pricing#career');
  });
});
