import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { ALLOWANCES, PLANS, estimate, formatUsd } from '@flacroncv/career-shared';
import type { ApiClient } from '@flacroncv/career-api-client';
import en from '../../../public/locales/en/common.json';
import ar from '../../../public/locales/ar/common.json';
import { CAREER_PRICING_PLANS, CareerPricing, parseQuantity } from './CareerPricing';

let signedIn = false;
vi.mock('@/providers/AuthProvider', () => ({ useAuth: () => ({ user: signedIn ? { uid: 'u1' } : null, firebaseUser: null }) }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const fakeApi = (createSalesInquiry = vi.fn()) => ({ createSalesInquiry }) as unknown as ApiClient;

function renderPricing(messages: Record<string, unknown> = en, locale = 'en') {
  const missing: string[] = [];
  const view = render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="UTC"
      onError={(error) => {
        missing.push(error.message);
      }}
    >
      <CareerPricing api={fakeApi()} />
    </NextIntlClientProvider>,
  );
  return { ...view, missing };
}

const card = (id: string) => screen.getByTestId(`career-plan-${id}`);

describe('CareerPricing (public career add-on)', () => {
  beforeEach(() => {
    signedIn = false;
  });

  it('shows the four sold plans with prices taken from the career catalog', () => {
    renderPricing();
    expect(CAREER_PRICING_PLANS).toEqual(['starter', 'professional', 'career_pro', 'business']);
    for (const id of CAREER_PRICING_PLANS) {
      expect(within(card(id)).getByText(formatUsd(PLANS[id].monthlyCents))).toBeTruthy();
    }
    expect(within(card('starter')).getByText('$21.99')).toBeTruthy();
    expect(within(card('business')).getByText('$208.00')).toBeTruthy();
    // Months-free label derived from the catalog (annual = 10 × monthly).
    expect(within(card('professional')).getByText('or $389.90 a year, billed upfront (2 months free)')).toBeTruthy();
    // The career Free plan is not offered as a purchase.
    expect(screen.queryByTestId('career-plan-free')).toBeNull();
  });

  it('switches to annual prices with the keyboard and says the catalog trial is not offered', () => {
    renderPricing();
    const monthly = screen.getByRole('radio', { name: 'Monthly' });
    expect(monthly.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(monthly, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Annual' }).getAttribute('aria-checked')).toBe('true');
    expect(within(card('career_pro')).getByText(formatUsd(PLANS.career_pro.annualCents))).toBeTruthy();
    expect(within(card('professional')).getByText("The catalog's 7-day trial is not offered with the add-on.")).toBeTruthy();
    expect(screen.getByText(/There is no free trial/)).toBeTruthy();
  });

  it('sends signed-out visitors through registration to the career plans page, and signed-in customers straight there', () => {
    const { unmount } = renderPricing();
    expect(within(card('starter')).getByRole('link', { name: 'Choose Starter' }).getAttribute('href')).toBe(
      '/register?callbackUrl=%2Fcareer%2Fplans',
    );
    unmount();
    signedIn = true;
    renderPricing();
    expect(within(card('professional')).getByRole('link', { name: 'Choose Professional' }).getAttribute('href')).toBe('/career/plans');
    // Business is not sold online: it goes to the contact form.
    expect(within(card('business')).getByRole('link', { name: 'Contact sales' }).getAttribute('href')).toBe('#contact-sales');
  });

  it('renders the full comparison table from the allowances', () => {
    renderPricing();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
    const docs = within(table).getByRole('row', { name: /Document credits \/ month/ });
    expect(within(docs).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      CAREER_PRICING_PLANS.map((id) => String(ALLOWANCES[id].documentCredits)),
    );
  });

  it('totals the estimate like the catalog and marks what is not on sale', () => {
    renderPricing();
    fireEvent.change(screen.getByLabelText('Extra document credits'), { target: { value: '10' } });
    const expected = estimate({ planId: 'professional', interval: 'monthly', desired: [{ unit: 'document_credit', units: 10 }] });
    expect(screen.getByTestId('career-estimate-recurring').textContent).toBe('$38.99');
    expect(screen.getByTestId('career-estimate-one-time').textContent).toBe('$4.99');
    expect(screen.getByTestId('career-estimate-due-now').textContent).toBe(formatUsd(expected.dueNowCents));
    expect(screen.getByTestId('career-estimate-due-now').textContent).toBe('$43.98');
    const box = screen.getByTestId('career-estimate');
    // The pack line is flagged, the plan line is not.
    expect(within(box).getAllByText('Not on sale yet')).toHaveLength(1);
    expect(screen.getByText(/Packs, extra capacity, Business and its seats are not on sale yet/)).toBeTruthy();
  });

  it('adds Business seats only on Business, all flagged as not on sale', () => {
    renderPricing();
    expect(screen.queryByLabelText('Extra staff seats')).toBeNull();
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'business' } });
    fireEvent.change(screen.getByLabelText('Extra staff seats'), { target: { value: '2' } });
    expect(screen.getByTestId('career-estimate-recurring').textContent).toBe('$246.00');
    const box = screen.getByTestId('career-estimate');
    expect(within(box).getAllByText('Not on sale yet')).toHaveLength(2);
  });

  it('ignores input that is not a whole number up to 10,000', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('12')).toBe(12);
    expect(parseQuantity('1.5')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('10001')).toBeNull();
    renderPricing();
    const field = screen.getByLabelText('Extra alert items') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '5' } });
    fireEvent.change(field, { target: { value: '5x' } });
    expect(field.value).toBe('5');
  });

  it('shows the estimate text when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderPricing();
    fireEvent.click(screen.getByRole('button', { name: 'Copy estimate' }));
    const text = (await screen.findByLabelText(/Copy is not available/)) as HTMLTextAreaElement;
    expect(text.value).toContain('Base subscription: Professional x 1: $38.99');
    expect(text.value).toContain('Catalog version');
  });

  it('resolves every message, including the dynamic ones, in English and Arabic', () => {
    for (const [messages, locale] of [
      [en, 'en'],
      [ar, 'ar'],
    ] as const) {
      const { missing, unmount } = renderPricing(messages, locale);
      fireEvent.click(screen.getByRole('radio', { name: locale === 'en' ? 'Annual' : 'سنوي' }));
      for (const id of CAREER_PRICING_PLANS) {
        fireEvent.change(screen.getByRole('combobox'), { target: { value: id } });
        for (const input of screen.getAllByRole('textbox').filter((el) => el.getAttribute('inputmode') === 'numeric')) {
          if (!(input as HTMLInputElement).disabled) fireEvent.change(input, { target: { value: '300' } });
        }
      }
      expect(missing).toEqual([]);
      unmount();
    }
  });
});
