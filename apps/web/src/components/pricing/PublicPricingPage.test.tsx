import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ApiClient } from '@flacroncv/career-api-client';
import en from '../../../public/locales/en/common.json';
import ar from '../../../public/locales/ar/common.json';
import { renderPricing } from './test-utils';
import { PublicPricingPage } from './PublicPricingPage';
import Pricing from '@/components/landing/Pricing';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));
let signedIn = false;
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: signedIn ? { uid: 'u1' } : null, firebaseUser: null }) }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: () => undefined, isInView: true }) }));

const fakeApi = { createSalesInquiry: vi.fn() } as unknown as ApiClient;
const card = (id: string) => screen.getByTestId(`plan-card-${id}`);

describe('public /pricing', () => {
  beforeEach(() => {
    signedIn = false;
    get.mockReset();
    get.mockRejectedValue(new Error('not found'));
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('shows exactly five plan cards, Professional recommended, no Enterprise and no separate career add-on', () => {
    const { missing } = renderPricing(<PublicPricingPage api={fakeApi} />);
    const cards = screen.getAllByTestId(/^plan-card-[a-z_]+$/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'plan-card-free',
      'plan-card-starter',
      'plan-card-professional',
      'plan-card-career_pro',
      'plan-card-business',
    ]);
    expect(within(card('professional')).getByText('Recommended for active job seekers')).toBeTruthy();
    expect(screen.queryByText(/Enterprise/)).toBeNull();
    expect(screen.queryByText(/career tools add-on/i)).toBeNull();
    expect(missing).toEqual([]);
  });

  it('shows monthly price, annual upfront, credits, alert intelligence, searches, locations and interviews on each card', () => {
    renderPricing(<PublicPricingPage api={fakeApi} />);
    const pro = within(card('professional'));
    expect(pro.getByText('$38.99')).toBeTruthy();
    expect(pro.getByText('or $389.90 a year, paid upfront')).toBeTruthy();
    expect(pro.getByText('Document credits')).toBeTruthy();
    expect(pro.getByText('Enhanced fit and gaps')).toBeTruthy();
    expect(pro.getByText('Saved searches')).toBeTruthy();
    expect(pro.getByText('Location profiles')).toBeTruthy();
    expect(pro.getByText('5 text sessions a month')).toBeTruthy();
    expect(pro.getByText('30 voice minutes a month')).toBeTruthy();
    expect(within(card('free')).getByText('$0')).toBeTruthy();
  });

  it('annual shows the upfront charge and the monthly equivalent, and says allowances renew monthly', () => {
    renderPricing(<PublicPricingPage api={fakeApi} />);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Annual (2 months free)' })[0]);
    const business = within(card('business'));
    expect(business.getByText('$2,080')).toBeTruthy();
    expect(business.getByText('Works out to $173.33 a month')).toBeTruthy();
    expect(business.getByText('Allowances still renew monthly.')).toBeTruthy();
  });

  it('never shows a dead button: unconfigured plans say Coming soon and offer Contact us', async () => {
    renderPricing(<PublicPricingPage api={fakeApi} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/plans'));
    for (const id of ['starter', 'professional', 'career_pro', 'business']) {
      expect(within(card(id)).getByTestId(`plan-card-${id}-coming-soon`).textContent).toBe('Coming soon');
      expect(within(card(id)).getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/contact-us');
    }
    expect(within(card('free')).getByRole('link', { name: 'Start free' }).getAttribute('href')).toBe('/register');
    expect(within(card('business')).getByRole('link', { name: 'Contact Sales' }).getAttribute('href')).toBe('#contact-sales');
    expect(screen.getAllByText(/renew automatically every month or every year, at the price shown, until you cancel/).length).toBe(1);
  });

  it('leads configured plans to the billing review (via sign-up when signed out)', async () => {
    get.mockResolvedValue({ plans: [{ id: 'professional', configured: { monthly: true, annual: false } }] });
    renderPricing(<PublicPricingPage api={fakeApi} />);
    const choose = await within(card('professional')).findByRole('link', { name: 'Choose Professional' });
    expect(choose.getAttribute('href')).toBe(
      `/register?callbackUrl=${encodeURIComponent('/settings/billing?plan=professional&interval=monthly#change-plan')}`,
    );
    expect(within(card('starter')).getByText('Coming soon')).toBeTruthy();
    // Annual is not configured for Professional: back to Coming soon.
    fireEvent.click(screen.getAllByRole('radio', { name: 'Annual (2 months free)' })[0]);
    expect(within(card('professional')).getByText('Coming soon')).toBeTruthy();
  });

  it('has the complete comparison, definitions, add-on catalog, calculator and Contact Sales', () => {
    renderPricing(<PublicPricingPage api={fakeApi} />);
    for (const label of ['Matching schedule', 'Followed companies', 'Storage', 'Career profiles', 'Remove FlacronCV branding from exports', 'Specialist career modes', 'Optional map sessions / month', 'Local radius (maximum)', 'Career and relocation scenario reports / month', 'Application analytics', 'Portfolio analytics']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/One city with a radius, one defined region, or one remote-eligibility setup/)).toBeTruthy();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs a connected provider').length).toBeGreaterThan(0);
    const voiceL = within(screen.getByTestId('addon-voice_l'));
    expect(voiceL.getByText('$24.99')).toBeTruthy();
    expect(voiceL.getByText(/one-time, expires 12 months after purchase/)).toBeTruthy();
    expect(voiceL.getByText('Requires Professional or above')).toBeTruthy();
    expect(voiceL.getByText('Not on sale yet')).toBeTruthy();
    expect(within(screen.getByTestId('addon-location_extra')).getByText('$1.99/month')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Estimate your price' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Contact Sales' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeTruthy();
  });

  it('offers a Contact us link instead of the form when the career service is off', () => {
    vi.stubEnv('NEXT_PUBLIC_CAREER_ENABLED', '');
    renderPricing(<PublicPricingPage api={fakeApi} />);
    expect(screen.queryByRole('button', { name: 'Send inquiry' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Contact Sales' })).getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/contact-us');
  });

  it('renders in Arabic without missing messages', () => {
    const { missing } = renderPricing(<PublicPricingPage api={fakeApi} />, ar, 'ar');
    expect(missing).toEqual([]);
    expect(screen.getAllByTestId(/^plan-card-[a-z_]+$/)).toHaveLength(5);
  });
});

describe('homepage pricing section', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockRejectedValue(new Error('not found'));
  });

  it('shows the same five cards and links to the full comparison', () => {
    const { missing } = renderPricing(<Pricing />);
    expect(screen.getAllByTestId(/^plan-card-[a-z_]+$/)).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Compare every feature and estimate your price' }).getAttribute('href')).toBe('/pricing#compare');
    expect(within(card('business')).getByRole('link', { name: 'Contact Sales' }).getAttribute('href')).toBe('/pricing#contact-sales');
    expect(missing).toEqual([]);
    void en;
  });
});
