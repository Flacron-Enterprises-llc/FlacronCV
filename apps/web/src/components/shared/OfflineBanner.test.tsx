import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OfflineBanner from './OfflineBanner';

const messages = { common: { offline_banner: "You're offline.", back_online: 'Back online' } };
const renderBanner = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfflineBanner />
    </NextIntlClientProvider>,
  );

describe('OfflineBanner', () => {
  afterEach(() => vi.useRealTimers());

  it('shows nothing while online', () => {
    renderBanner();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces going offline, then back online briefly', () => {
    vi.useFakeTimers();
    renderBanner();
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent("You're offline.");
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).toHaveTextContent('Back online');
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('does not say "back online" when it never went offline', () => {
    renderBanner();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
