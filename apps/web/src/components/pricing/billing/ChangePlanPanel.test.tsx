import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderPricing } from '../test-utils';
import { ApiError } from '@/lib/api';
import { ChangePlanPanel, type ChangePlanPanelProps } from './ChangePlanPanel';
import { UsageWarningsBanner, AllowanceTable } from './AllowancePanel';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({
  // A stand-in with the real fields: lib/api pulls in Firebase.
  ApiError: class extends Error {
    kind: string; status?: number; code?: string; details?: Record<string, unknown>;
    constructor(message: string, opts: { kind: string; status?: number; code?: string }) {
      super(message);
      this.kind = opts.kind; this.status = opts.status; this.code = opts.code;
    }
  },
  api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ON_SALE = {
  plans: ['starter', 'professional', 'career_pro', 'business'].map((id) => ({ id, configured: true })),
};

function panel(over: Partial<ChangePlanPanelProps> = {}) {
  const props: ChangePlanPanelProps = {
    currentPlan: 'free',
    hasPaidStripeSubscription: false,
    managedElsewhere: false,
    trialEligible: false,
    checkoutPending: false,
    portalPending: false,
    onCheckout: vi.fn(),
    onPortal: vi.fn(),
    ...over,
  };
  return { props, ...renderPricing(<ChangePlanPanel {...props} />) };
}

describe('Settings → Billing: change plan', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue(ON_SALE);
    post.mockReset();
  });

  it('reviews price and automatic renewal before a Free customer goes to checkout', async () => {
    const { props, missing } = panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Professional' }));
    const review = within(screen.getByTestId('plan-review'));
    expect(review.getByText('$38.99 a month')).toBeTruthy();
    expect(review.getByText('Renews automatically every month at $38.99 until you cancel.')).toBeTruthy();
    expect(props.onCheckout).not.toHaveBeenCalled();
    fireEvent.click(review.getByRole('button', { name: 'Continue to secure checkout' }));
    expect(props.onCheckout).toHaveBeenCalledWith('professional', 'monthly', false);
    expect(missing).toEqual([]);
  });

  it('pre-selects the plan and interval chosen on the pricing page', async () => {
    const { props } = panel({ initialPlan: 'career_pro', initialInterval: 'annual' });
    const review = within(await screen.findByTestId('plan-review'));
    expect(review.getByText('$689.90 a year, paid upfront')).toBeTruthy();
    expect(review.getByText('Allowances still renew monthly.')).toBeTruthy();
    fireEvent.click(review.getByRole('button', { name: 'Continue to secure checkout' }));
    expect(props.onCheckout).toHaveBeenCalledWith('career_pro', 'annual', false);
  });

  it('brings the checkout review into view when a plan is clicked, even the pre-selected one', async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      panel({ initialPlan: 'starter', initialInterval: 'monthly' });
      await screen.findByTestId('plan-review');
      scroll.mockClear();
      fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Starter' }));
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      expect(scroll.mock.contexts.some((el) => (el as Element).getAttribute('data-testid') === 'plan-review')).toBe(true);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('says Coming soon with Contact us for plans without a price', async () => {
    get.mockResolvedValue({ plans: [{ id: 'starter', configured: true }] });
    panel();
    await screen.findByRole('button', { name: 'Upgrade to Starter' });
    const pro = within(screen.getByTestId('change-plan-professional'));
    expect(pro.getByText('Coming soon')).toBeTruthy();
    expect(pro.getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/contact-us');
    expect(pro.queryByRole('button')).toBeNull();
  });

  it('tells a legacy customer the legacy price is lost, and falls back to the portal when the switch is refused', async () => {
    post.mockRejectedValue(new ApiError('This account is billed by the App Store or Google Play', { kind: 'http', status: 409 }));
    const { props } = panel({ currentPlan: 'pro', hasPaidStripeSubscription: true });
    expect(screen.getByText(/Switching to one of the current plans ends your legacy price and limits for good/)).toBeTruthy();
    // Pro maps to Starter: Starter is a switch, Professional an upgrade, Free a downgrade.
    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Professional' }));
    const review = within(screen.getByTestId('plan-review'));
    expect(review.getByText(/prorated difference/)).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/payments/change-plan/preview', { plan: 'professional', interval: 'monthly' });
    expect(await review.findByText(/You can still change your plan in the billing portal/)).toBeTruthy();
    fireEvent.click(review.getByRole('button', { name: 'Continue in the billing portal' }));
    expect(props.onPortal).toHaveBeenCalled();
    expect(props.onCheckout).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Switch to Starter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Downgrade to Free' })).toBeTruthy();
  });

  it('shows the proration preview, then switches in-app with the previewed proration date', async () => {
    post.mockImplementation((endpoint: string) =>
      Promise.resolve(
        endpoint === '/payments/change-plan/preview'
          ? { toPlan: 'career_pro', currency: 'usd', prorationAmount: 1500, amountDue: 1500, prorationDate: 1763100000, currentPeriodEnd: '2026-12-01T00:00:00.000Z' }
          : { plan: 'career_pro', status: 'active' },
      ),
    );
    const { props } = panel({ currentPlan: 'professional', hasPaidStripeSubscription: true, onPlanChanged: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Career Pro' }));
    const preview = within(await screen.findByTestId('plan-change-preview'));
    expect(await preview.findByText('Due now')).toBeTruthy();
    expect(preview.getByText('Prorated difference')).toBeTruthy();
    expect(preview.getAllByText('$15.00')).toHaveLength(2);
    expect(preview.getByText('December 1, 2026')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue in the billing portal' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and pay $15.00' }));
    await waitFor(() => expect(props.onPlanChanged).toHaveBeenCalledWith('career_pro'));
    expect(post).toHaveBeenLastCalledWith('/payments/change-plan', { plan: 'career_pro', interval: 'monthly', prorationDate: 1763100000 });
    expect(props.onPortal).not.toHaveBeenCalled();
  });

  it('an upgrade waiting for its payment is announced as pending, not as switched', async () => {
    const { toast } = await import('sonner');
    post.mockImplementation((endpoint: string) =>
      Promise.resolve(
        endpoint === '/payments/change-plan/preview'
          ? { toPlan: 'career_pro', currency: 'usd', prorationAmount: 1500, amountDue: 1500, prorationDate: 1763100000, currentPeriodEnd: '2026-12-01T00:00:00.000Z' }
          : { plan: 'professional', status: 'active', paymentPending: true },
      ),
    );
    const { props } = panel({ currentPlan: 'professional', hasPaidStripeSubscription: true, onPlanChanged: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Upgrade to Career Pro' }));
    await screen.findByTestId('plan-change-preview');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and pay $15.00' }));
    await waitFor(() => expect(props.onPlanChanged).toHaveBeenCalledWith('professional'));
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Career Pro will apply as soon as the payment/));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('labels a downgrade credit and translates a refused switch', async () => {
    post.mockImplementation((endpoint: string) =>
      endpoint === '/payments/change-plan/preview'
        ? Promise.resolve({ toPlan: 'starter', currency: 'usd', prorationAmount: -900, amountDue: 0, prorationDate: 1763100000, currentPeriodEnd: '2026-12-01T00:00:00.000Z' })
        : Promise.reject(new ApiError('This plan is not available', { kind: 'http', status: 503, code: 'PLAN_NOT_CONFIGURED' })),
    );
    panel({ currentPlan: 'professional', hasPaidStripeSubscription: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Downgrade to Starter' }));
    const preview = within(await screen.findByTestId('plan-change-preview'));
    expect(await preview.findByText('Credit for unused time')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan change' }));
    expect(await preview.findByText(/This plan is not on sale yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue in the billing portal' })).toBeTruthy();
  });

  it('marks the current plan and offers no button for it', async () => {
    panel({ currentPlan: 'professional', hasPaidStripeSubscription: true });
    const current = within(screen.getByTestId('change-plan-professional'));
    expect(current.getByText('Current plan')).toBeTruthy();
    expect(current.queryByRole('button')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Downgrade to Starter' })).toBeTruthy();
  });
});

describe('Settings → Billing: allowances and warnings', () => {
  it('shows one banner with each unit at 80/95/100% and the renewal date', () => {
    renderPricing(
      <UsageWarningsBanner
        renewal="December 1, 2026"
        canBuyPacks={false}
        warnings={[
          { key: 'document_credit', source: 'career', level: 100, percent: 100 },
          { key: 'aiCredits', source: 'v1', level: 80, percent: 83 },
        ]}
      />,
    );
    const banner = screen.getByTestId('usage-warnings');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(within(banner).getByText('Document credits: used up')).toBeTruthy();
    expect(within(banner).getByText('AI document credits: 83% used')).toBeTruthy();
    expect(banner.textContent).toContain('Allowances renew on December 1, 2026.');
  });

  it('lists granted, used and remaining per unit, and units the plan does not include', () => {
    renderPricing(
      <AllowanceTable
        title="Usage"
        rows={[
          { key: 'document_credit', source: 'career', granted: 60, used: 50, remaining: 40, packRemaining: 30, capacity: false },
          { key: 'voice_minute', source: 'career', granted: 0, used: 0, remaining: 0, packRemaining: 0, capacity: false },
        ]}
      />,
    );
    const docs = within(screen.getByTestId('allowance-document_credit'));
    expect(docs.getByText('60')).toBeTruthy();
    expect(docs.getByText('50')).toBeTruthy();
    expect(docs.getByText('40')).toBeTruthy();
    expect(docs.getByText('Includes 30 units from packs')).toBeTruthy();
    expect(within(screen.getByTestId('allowance-voice_minute')).getByText('Not included in your plan')).toBeTruthy();
  });
});
