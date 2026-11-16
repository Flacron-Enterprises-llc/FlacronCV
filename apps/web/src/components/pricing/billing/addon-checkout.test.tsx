import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../../public/locales/en/common.json';
import { renderPricing } from '../test-utils';
import { PACK_CHECKOUT_ENDPOINT, CAPACITY_CHECKOUT_ENDPOINT } from '../plan-availability';
import {
  ADDON_RETURN_REFETCH_DELAYS_MS,
  AddonReturnBanner,
  useAddonCheckout,
  useAddonReturnRefresh,
} from './addon-checkout';

const post = vi.fn();
vi.mock('@/lib/api', () => ({
  // lib/api pulls in Firebase; the hook only needs post.
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: (...args: unknown[]) => post(...args) },
}));

function Checkout({ navigate, onError }: { navigate: (url: string) => void; onError: () => void }) {
  const c = useAddonCheckout({ locale: 'en', navigate, onError });
  return (
    <div>
      <button onClick={() => c.openReview('document_s')}>review pack</button>
      <button onClick={() => c.openReview('saved_search_5')}>review capacity</button>
      <button onClick={c.cancelReview}>cancel review</button>
      {c.reviewAddon ? <button onClick={() => void c.confirm(c.reviewAddon!)}>confirm</button> : null}
      <span data-testid="buying">{c.buyingAddon ?? ''}</span>
    </div>
  );
}

function keyOf(call: unknown[]): string {
  return (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key'];
}

describe('billing add-on checkout', () => {
  beforeEach(() => post.mockReset());

  it('repeated clicks on confirm send one request', async () => {
    let resolve: (v: { url: string }) => void = () => undefined;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    const navigate = vi.fn();
    renderPricing(<Checkout navigate={navigate} onError={vi.fn()} />);
    fireEvent.click(screen.getByText('review pack'));
    const confirm = screen.getByText('confirm');
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ url: 'https://checkout.example/s' }));
    expect(navigate).toHaveBeenCalledWith('https://checkout.example/s');
    // Still leaving for Stripe: nothing more is sent.
    fireEvent.click(confirm);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sends an Idempotency-Key on the pack and capacity checkouts, reused on a retry of the same review', async () => {
    const onError = vi.fn();
    post.mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({ url: 'https://checkout.example/s' });
    renderPricing(<Checkout navigate={vi.fn()} onError={onError} />);

    fireEvent.click(screen.getByText('review pack'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe(PACK_CHECKOUT_ENDPOINT);
    const first = keyOf(post.mock.calls[0]);
    expect(first).toMatch(/\S{8,}/);

    // Retry of the same confirmation: same key.
    await waitFor(() => expect(screen.getByTestId('buying').textContent).toBe(''));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(keyOf(post.mock.calls[1])).toBe(first);
  });

  it('gives a new review a new key, for capacity add-ons too', async () => {
    post.mockRejectedValueOnce(new Error('refused')).mockRejectedValueOnce(new Error('refused again'));
    const onError = vi.fn();
    renderPricing(<Checkout navigate={vi.fn()} onError={onError} />);
    fireEvent.click(screen.getByText('review pack'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('cancel review'));
    fireEvent.click(screen.getByText('review capacity'));
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toBe(CAPACITY_CHECKOUT_ENDPOINT);
    expect(keyOf(post.mock.calls[1])).toMatch(/\S{8,}/);
    expect(keyOf(post.mock.calls[1])).not.toBe(keyOf(post.mock.calls[0]));
  });
});

describe('add-on checkout return', () => {
  afterEach(() => vi.useRealTimers());

  function withClient(node: ReactNode, client: QueryClient) {
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={en as AbstractIntlMessages} timeZone="UTC">
          {node}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  function Usage({ addonReturn, fetchUsage }: { addonReturn: string | null; fetchUsage: () => Promise<number> }) {
    useQuery({ queryKey: ['career-usage', 'u1'], queryFn: fetchUsage, retry: false });
    useAddonReturnRefresh(addonReturn);
    return null;
  }

  it('a pack success return refetches the career usage now and a few times over ~10 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const fetchUsage = vi.fn().mockResolvedValue(1);
    withClient(<Usage addonReturn="success" fetchUsage={fetchUsage} />, client);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['career-usage'] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.max(...ADDON_RETURN_REFETCH_DELAYS_MS));
    });
    expect(invalidate).toHaveBeenCalledTimes(1 + ADDON_RETURN_REFETCH_DELAYS_MS.length);
    expect(Math.max(...ADDON_RETURN_REFETCH_DELAYS_MS)).toBeLessThanOrEqual(10_000);
    await waitFor(() => expect(fetchUsage.mock.calls.length).toBeGreaterThan(1));
  });

  it('does not refetch on a cancelled return or without a return', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const addonReturn of ['canceled', null]) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const view = withClient(<Usage addonReturn={addonReturn} fetchUsage={vi.fn().mockResolvedValue(1)} />, client);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      expect(invalidate).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('shows the cancelled and success banners, nothing otherwise', () => {
    const { missing, rerender } = renderPricing(<AddonReturnBanner addonReturn="canceled" />);
    expect(screen.getByRole('status').textContent).toBe('Add-on checkout was cancelled. Nothing was charged.');
    rerender(
      <NextIntlClientProvider locale="en" messages={en as AbstractIntlMessages} timeZone="UTC">
        <AddonReturnBanner addonReturn="success" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/^Payment received\./);
    rerender(
      <NextIntlClientProvider locale="en" messages={en as AbstractIntlMessages} timeZone="UTC">
        <AddonReturnBanner addonReturn={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(missing).toEqual([]);
  });
});
