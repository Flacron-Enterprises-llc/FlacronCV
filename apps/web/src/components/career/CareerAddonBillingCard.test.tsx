import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import en from '../../../public/locales/en/common.json';
import { CareerAddonBillingCard } from './CareerAddonBillingCard';

const get = vi.fn();
let switchOn = true;
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('./CareerServices', () => ({
  isCareerEnabled: () => switchOn,
  useCareerAccess: () => ({ data: { enabled: false } }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderCard(onManage = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <CareerAddonBillingCard onManage={onManage} managing={false} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...view, onManage };
}

const status = (careerSubscription: unknown) => ({
  mode: 'addon',
  purchasable: false,
  blockedReason: 'prices_not_configured',
  configuredPrices: [],
  stripeTestMode: false,
  careerSubscription,
});

describe('CareerAddonBillingCard', () => {
  beforeEach(() => {
    get.mockReset();
    switchOn = true;
  });

  it('links to the career plans when there is no add-on', async () => {
    get.mockResolvedValue(status(null));
    renderCard();
    expect(await screen.findByText('No career add-on')).toBeTruthy();
    expect(screen.getByText(/from \$21\.99\/month, billed in addition to your current plan/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See career plans' }).getAttribute('href')).toBe('/career/plans');
    expect(screen.queryByRole('button', { name: 'Manage add-on' })).toBeNull();
  });

  it('shows the subscribed plan, its renewal date and opens the Stripe portal', async () => {
    get.mockResolvedValue(
      status({ plan: 'career_pro', status: 'active', currentPeriodEnd: '2026-12-13T12:00:00.000Z', cancelAtPeriodEnd: false, source: 'stripe' }),
    );
    const { onManage } = renderCard();
    expect(await screen.findByText('Career Pro career plan')).toBeTruthy();
    expect(screen.getByText('Renews on December 13, 2026.')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Manage add-on' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('renders nothing and calls nothing without the career build switch', () => {
    switchOn = false;
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
    expect(get).not.toHaveBeenCalled();
  });
});
