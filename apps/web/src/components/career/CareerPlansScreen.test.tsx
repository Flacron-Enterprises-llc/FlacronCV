import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import en from '../../../public/locales/en/common.json';
import { CareerPlansScreen } from './CareerPlansScreen';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1', subscription: { plan: 'pro', status: 'active', currentPeriodEnd: new Date(Date.now() + 86400e3) } } }),
}));
vi.mock('./CareerServices', () => ({ useCareerAccess: () => ({ data: { enabled: false, v1Plan: 'pro', reason: 'plan_not_mapped', features: {} } }) }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <CareerPlansScreen />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const status = (overrides: Record<string, unknown> = {}) => ({
  model: 'addon',
  mode: 'addon',
  purchasable: true,
  blockedReason: null,
  configuredPrices: ['professional:month'],
  stripeTestMode: true,
  careerSubscription: null,
  ...overrides,
});

describe('CareerPlansScreen (add-on)', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('says the career price is in addition to the current V1 plan and that credits are separate', async () => {
    get.mockResolvedValue(status());
    renderScreen();
    expect(await screen.findByText(/billed in addition to your current FlacronCV plan \(Pro\)/)).toBeTruthy();
    expect(screen.getAllByText(/Career credits are separate from your FlacronCV AI credits/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('in addition to your current plan').length).toBe(3);
    expect(await screen.findByText(/Test mode/)).toBeTruthy();
  });

  it('charges nothing until the customer confirms, and sends the displayed catalog amount', async () => {
    get.mockResolvedValue(status());
    post.mockResolvedValue({ url: null });
    renderScreen();
    await screen.findByText(/billed in addition/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Review this plan' })[1]);
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/Charged in addition to your current FlacronCV plan \(Pro\), which is not changed or cancelled/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue to secure checkout/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/career-billing/checkout', { plan: 'professional', interval: 'month', expectedAmountCents: 3899, confirmed: true });
  });

  it('keeps the purchase button disabled for a plan or interval that is not configured, and when sales are off', async () => {
    get.mockResolvedValue(status());
    renderScreen();
    await screen.findByText(/billed in addition/);
    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Review this plan' })[1]);
    const button = screen.getByRole('button', { name: 'Purchase not available here' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('explains when checkout is not set up in this environment', async () => {
    get.mockResolvedValue(status({ purchasable: false, blockedReason: 'prices_not_configured', configuredPrices: [], stripeTestMode: false }));
    renderScreen();
    expect(await screen.findByText(/Checkout for career plans is not set up in this environment yet/)).toBeTruthy();
  });
});
