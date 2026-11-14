import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../public/locales/en/common.json';
import UpgradeModal from './UpgradeModal';

const push = vi.fn();
let plan: string | undefined = 'free';
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1', subscription: { plan } }, degraded: false, placeholderAccount: false }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/components/ui/Modal', () => ({
  default: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: ReactNode }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

function open(reason: 'ai_credits' | 'templates' = 'ai_credits') {
  const missing: string[] = [];
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" onError={(e) => missing.push(e.message)}>
      <UpgradeModal isOpen onClose={() => undefined} reason={reason} />
    </NextIntlClientProvider>,
  );
  return missing;
}

describe('UpgradeModal offers the next of the five plans', () => {
  beforeEach(() => push.mockReset());

  it('Free → Starter, with catalog benefits and its monthly price, to the billing review', () => {
    plan = 'free';
    const missing = open();
    expect(screen.getByText('The Starter plan includes:')).toBeTruthy();
    expect(screen.getByText('$21.99/month')).toBeTruthy();
    expect(screen.getByText('20 document credits a month')).toBeTruthy();
    expect(screen.getByText('DOCX (Word) export')).toBeTruthy();
    expect(screen.queryByText(/Upgrade to Pro/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See Starter' }));
    expect(push).toHaveBeenCalledWith('/settings/billing?plan=starter&interval=monthly#change-plan');
    expect(missing).toEqual([]);
  });

  it('a legacy Pro customer is offered Professional', () => {
    plan = 'pro';
    open('templates');
    expect(screen.getByText('The Professional plan includes:')).toBeTruthy();
  });

  it('Business has nothing above it: Contact Sales', () => {
    plan = 'business';
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Contact Sales' }));
    expect(push).toHaveBeenCalledWith('/pricing#contact-sales');
  });
});
