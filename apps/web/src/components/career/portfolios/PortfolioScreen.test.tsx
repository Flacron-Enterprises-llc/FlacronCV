import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type PortfolioPage } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { PortfolioScreen } from './PortfolioScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const page: PortfolioPage = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'ab12cd34ef56',
  title: 'Selected work',
  headline: 'Projects',
  displayName: 'Ada',
  locale: 'en',
  visibility: 'public',
  showEmail: false,
  showPhone: false,
  contactEmail: null,
  contactPhone: null,
  evidenceIds: [],
  shareToken: null,
  publishedAt: '2026-10-18T00:00:00.000Z',
  visitCount: 2,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PortfolioScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('PortfolioScreen', () => {
  it('says portfolio pages are not open yet when the feature is switched off, not that the plan is too low', async () => {
    renderScreen(testApi({
      portfolios: async () => {
        throw new ApiError(403, 'feature_unavailable', { code: 'feature_unavailable', feature: 'portfolioPages' });
      },
    }));
    expect(await screen.findByText('Portfolio pages are not open yet')).toBeTruthy();
    expect(screen.queryByText('A public portfolio starts on Starter')).toBeNull();
  });

  it('downloads a QR code only after the page request succeeds', async () => {
    let release: (value: { svg: string; path: string }) => void = () => undefined;
    const portfolioQr = vi.fn(() => new Promise<{ svg: string; path: string }>((resolve) => {
      release = resolve;
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderScreen(testApi({
      portfolios: vi.fn().mockResolvedValue({ items: [page] }),
      evidence: vi.fn().mockResolvedValue({ items: [] }),
      portfolioQr,
    }));
    expect(await screen.findByText(/Selected work/)).toBeTruthy();
    // The share link is a real link with a copy button, not bare text.
    expect(screen.getByRole('link', { name: /\/en\/portfolio\/ab12cd34ef56$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download QR code' }));
    expect(screen.queryByText('The QR code was downloaded.')).toBeNull();
    expect(portfolioQr).toHaveBeenCalledTimes(1);
    release({ svg: '<svg></svg>', path: '/en/portfolio/ab12cd34ef56' });
    expect(await screen.findByText('The QR code was downloaded.')).toBeTruthy();
    click.mockRestore();
  });

  it('removes public access only after unpublish succeeds', async () => {
    let release: (value: PortfolioPage) => void = () => undefined;
    const unpublishPortfolio = vi.fn(() => new Promise<PortfolioPage>((resolve) => {
      release = resolve;
    }));
    renderScreen(testApi({
      portfolios: vi.fn().mockResolvedValue({ items: [page] }),
      evidence: vi.fn().mockResolvedValue({ items: [] }),
      unpublishPortfolio,
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    expect(screen.queryByText('Public access is removed.')).toBeNull();
    expect(unpublishPortfolio).toHaveBeenCalledTimes(1);
    release({ ...page, visibility: 'draft', publishedAt: null });
    expect(await screen.findByText('Public access is removed.')).toBeTruthy();
  });
});
