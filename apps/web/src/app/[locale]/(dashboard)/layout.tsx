'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import Sidebar from '@/components/dashboard/Sidebar';
import TopBar from '@/components/dashboard/TopBar';
import DunningBanner from '@/components/dashboard/DunningBanner';
import AnnouncementBanner from '@/components/dashboard/AnnouncementBanner';
import MaintenanceGate from '@/components/dashboard/MaintenanceGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/routing';

/** Remembers the desktop sidebar rail preference between visits. */
const SIDEBAR_COLLAPSED_KEY = 'flacroncv_sidebar_collapsed';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — keep the in-memory value */
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
    <div className="flex h-screen bg-stone-50 dark:bg-black">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            <AnnouncementBanner />
            <DunningBanner />
            <MaintenanceGate>{children}</MaintenanceGate>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
