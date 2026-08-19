'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import Sidebar from '@/components/dashboard/Sidebar';
import TopBar from '@/components/dashboard/TopBar';
import DunningBanner from '@/components/dashboard/DunningBanner';
import AnnouncementBanner from '@/components/dashboard/AnnouncementBanner';
import MaintenanceGate from '@/components/dashboard/MaintenanceGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import PoweredBy from '@/components/shared/PoweredBy';
import { isAllowed, openPreferences } from '@/lib/consent';
import { Loader2 } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/routing';

/** Remembers the desktop sidebar rail preference between visits. */
const SIDEBAR_COLLAPSED_KEY = 'flacroncv_sidebar_collapsed';

/**
 * The dashboard chrome. This was `(dashboard)/layout.tsx` verbatim until
 * 2026-08-18; it moved here so the layout could become a server component and
 * export `robots: { index: false, follow: false }`, which a `'use client'` file
 * cannot do. Sign-in redirect and email-verification gate are unchanged.
 *
 * Layout (2026-08-19 full-width chrome): navy TopBar spans the viewport; the
 * sidebar starts below it. `min-h-0` on the row under the header is required so
 * `main` keeps scrolling inside the `h-screen` shell.
 */
export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('footer');
  const { user, loading, emailVerified } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Read the stored preference AFTER mount: starting from `false` on both the
  // server and the first client render keeps hydration in sync.
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') setSidebarCollapsed(true);
    } catch {
      /* storage unavailable — fall back to expanded */
    }
  }, []);

  // Remembering the rail between visits needs Preferences consent; collapsing it
  // for this session does not.
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (isAllowed('preferences')) {
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
        } catch {
          /* storage unavailable — keep the in-memory value */
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!emailVerified) {
      router.push('/verify-email');
    }
  }, [loading, user, emailVerified, router, pathname]);

  if (loading || !user || !emailVerified) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-stone-50 dark:bg-black">
      <TopBar area="dashboard" onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            <AnnouncementBanner />
            <DunningBanner />
            <MaintenanceGate>{children}</MaintenanceGate>
          </ErrorBoundary>

          {/* Inside the scroll container on purpose: the layout is `h-screen`, so a
              fixed strip outside `main` would permanently cost vertical space that
              the app chrome needs more than the copyright does. */}
          <footer className="mt-8 flex flex-col items-center gap-1 border-t border-stone-200 pt-6 sm:flex-row sm:justify-between dark:border-stone-800">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              &copy; {new Date().getFullYear()} FlacronCV. {t('rights')}
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={openPreferences}
                className="text-xs text-stone-500 underline underline-offset-2 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-400"
              >
                {t('cookie_preferences')}
              </button>
              <PoweredBy />
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
