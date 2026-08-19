import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import LegalAcceptanceModal from './LegalAcceptanceModal';
import en from '../../../public/locales/en/common.json';

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderModal(props: Partial<ComponentProps<typeof LegalAcceptanceModal>> = {}) {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  const onCheckedChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LegalAcceptanceModal
        isOpen
        checked={false}
        onCheckedChange={onCheckedChange}
        onAccept={onAccept}
        onCancel={onCancel}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onAccept, onCancel, onCheckedChange };
}

describe('LegalAcceptanceModal', () => {
  it('keeps Accept disabled until the checkbox is ticked (never pre-checked)', () => {
    renderModal();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Accept & Continue' })).toBeDisabled();
  });

  it('enables Accept after the box is ticked', () => {
    renderModal({ checked: true });
    expect(screen.getByRole('button', { name: 'Accept & Continue' })).toBeEnabled();
  });

  it('Cancel does not call Accept', async () => {
    const user = userEvent.setup();
    const { onAccept, onCancel } = renderModal({ checked: true });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('opens the three legal documents in a new tab', () => {
    renderModal();
    for (const name of ['Terms of Service', 'Privacy Policy', 'AI, ATS & Employment Disclaimer']) {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute('target', '_blank');
    }
  });
});
