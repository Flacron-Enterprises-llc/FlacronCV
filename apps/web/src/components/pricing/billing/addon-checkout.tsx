'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { addonById, type Addon } from '@flacroncv/career-shared';
import { newIdempotencyKey } from '@flacroncv/career-api-client';
import { api } from '@/lib/api';
import { CAPACITY_CHECKOUT_ENDPOINT, PACK_CHECKOUT_ENDPOINT } from '@/components/pricing/plan-availability';

/** The career usage query (balances, packs). Prefix of `['career-usage', uid]`. */
export const CAREER_USAGE_QUERY_KEY = ['career-usage'] as const;

/**
 * After a pack or add-on checkout returns with `?pack=success`, the pack is
 * granted by the Stripe webhook, which may land a few seconds later. Refetch
 * at once and then a few more times over ~10 s so the new balance appears
 * without a manual reload.
 */
export const ADDON_RETURN_REFETCH_DELAYS_MS: readonly number[] = [2000, 5000, 10000];

export function useAddonReturnRefresh(addonReturn: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (addonReturn !== 'success') return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: CAREER_USAGE_QUERY_KEY });
    refresh();
    const timers = ADDON_RETURN_REFETCH_DELAYS_MS.map((delay) => setTimeout(refresh, delay));
    return () => timers.forEach(clearTimeout);
  }, [addonReturn, queryClient]);
}

/** "Payment received…" / "Checkout was cancelled…" after an add-on checkout returns. */
export function AddonReturnBanner({ addonReturn }: { addonReturn: string | null }) {
  const t = useTranslations('plan_catalog');
  if (addonReturn !== 'success' && addonReturn !== 'canceled') return null;
  return (
    <div
      role="status"
      data-testid="addon-return"
      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-700 dark:bg-stone-900"
    >
      <Info className="h-5 w-5 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden />
      <p className="text-sm text-stone-700 dark:text-stone-300">
        {t(addonReturn === 'success' ? 'addon_return_success' : 'addon_return_canceled')}
      </p>
    </div>
  );
}

export interface AddonCheckout {
  /** The add-on under review (spec §11: explicit consent before checkout). */
  reviewAddon: string | null;
  /** The add-on whose checkout request is running. */
  buyingAddon: string | null;
  openReview(addonId: string): void;
  cancelReview(): void;
  /** Confirms the review. Clicks while a request runs are ignored. */
  confirm(addonId: string): Promise<void>;
}

/**
 * Pack and capacity checkout from the billing page. One `Idempotency-Key` per
 * review: retries of the same confirmation (after an error or a lost
 * response) reuse it, so the server returns the same checkout instead of
 * opening a second one; a new review gets a new key.
 */
export function useAddonCheckout(options: {
  locale: string;
  onError: (addon: Addon, error: unknown) => void;
  navigate?: (url: string) => void;
}): AddonCheckout {
  const { locale, onError } = options;
  const navigate = options.navigate ?? defaultNavigate;
  const [reviewAddon, setReviewAddon] = useState<string | null>(null);
  const [buyingAddon, setBuyingAddon] = useState<string | null>(null);
  const inFlight = useRef(false);
  const reviewKey = useRef<{ addonId: string; key: string } | null>(null);

  const openReview = useCallback((addonId: string) => {
    if (reviewKey.current?.addonId !== addonId) reviewKey.current = { addonId, key: newIdempotencyKey() };
    setReviewAddon(addonId);
  }, []);

  const cancelReview = useCallback(() => {
    reviewKey.current = null;
    setReviewAddon(null);
  }, []);

  const confirm = useCallback(
    async (addonId: string) => {
      if (inFlight.current) return;
      const addon = addonById(addonId);
      if (!addon) return;
      if (reviewKey.current?.addonId !== addonId) reviewKey.current = { addonId, key: newIdempotencyKey() };
      const headers = { 'Idempotency-Key': reviewKey.current.key };
      inFlight.current = true;
      setBuyingAddon(addonId);
      try {
        // The server re-checks the plan, the Stripe price and that this amount is what it will charge.
        const data =
          addon.billing === 'monthly'
            ? await api.post<{ url: string }>(
                CAPACITY_CHECKOUT_ENDPOINT,
                // Stripe returns to /{locale}/settings/billing in the visitor's language.
                { addonId, quantity: 1, expectedAmountCents: addon.priceCents, confirmed: true, locale },
                { headers },
              )
            : await api.post<{ url: string }>(
                PACK_CHECKOUT_ENDPOINT,
                { addonId, expectedAmountCents: addon.priceCents, confirmed: true, locale },
                { headers },
              );
        // Leaving for Stripe: keep the guard on so nothing is sent twice meanwhile.
        navigate(data.url);
      } catch (error) {
        inFlight.current = false;
        setBuyingAddon(null);
        onError(addon, error);
      }
    },
    [locale, navigate, onError],
  );

  return { reviewAddon, buyingAddon, openReview, cancelReview, confirm };
}

function defaultNavigate(url: string): void {
  window.location.href = url;
}
