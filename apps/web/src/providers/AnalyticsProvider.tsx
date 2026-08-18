'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { identify, page, resetAnalytics } from '@/lib/analytics';
import { syncConsentOnLoad } from '@/lib/consent';

/**
 * Bridges auth + routing state into the provider-agnostic analytics layer:
 * identifies the user on sign-in (resets on sign-out) and records a page view
 * on every route change. A pure no-op until a provider + consent are active
 * (see {@link @/lib/analytics}), so it is safe to mount unconditionally.
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const lastKey = useRef<string | null>(null);

  // FIRST, deliberately. `analytics.ts` trusts its own `analytics_consent` key at
  // import time, and a visitor from the one-boolean banner can still hold a grant
  // there while holding no current decision. Effects run in declaration order, so
  // reconciling here — ahead of the page view below — is what stops GA4 loading
  // before the visitor has answered the banner.
  useEffect(() => {
    syncConsentOnLoad();
  }, []);

  // Identify on sign-in, reset on sign-out. Re-identify when the id OR the plan
  // changes for the same user (e.g. an upgrade mid-session), so traits stay fresh.
  useEffect(() => {
    const uid = user?.uid ?? null;
    const plan = user?.subscription?.plan ?? null;
    const key = uid ? `${uid}:${plan ?? ''}` : null;
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (uid) identify(uid, { plan: plan ?? undefined });
    else resetAnalytics();
  }, [user]);

  // Page view on navigation (locale-agnostic path from next-intl routing).
  useEffect(() => {
    page(pathname);
  }, [pathname]);

  return <>{children}</>;
}
