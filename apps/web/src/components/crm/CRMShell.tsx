'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import CRMSidebar from '@/components/crm/CRMSidebar';
import TopBar from '@/components/dashboard/TopBar';
// The translated ErrorBoundary — the `ui/` twin renders hardcoded English.
// Both implementations are deliberately kept (see the release-freeze note);
// the defect was only that the CRM wired the untranslated one.
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

/**
 * The CRM chrome. This was `(crm)/layout.tsx` verbatim until 2026-08-18; it
 * moved here so the layout could become a server component and export
 * `robots: { index: false, follow: false }`, which a `'use client'` file cannot
 * do. Sign-in redirect and the admin/super_admin role gate are unchanged.
 *
 * Layout matches DashboardShell: full-width navy TopBar, sidebar below.
 */
export default function CRMShell({ children }: { children: React.ReactNode }) {
  const { user, loading, placeholderAccount } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // See (admin)/layout.tsx: a placeholder account has a default role, not a
    // known one, so it must never be treated as "not an admin".
    if (placeholderAccount) return;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [loading, user, placeholderAccount, router]);

  if (loading || !user || placeholderAccount) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') return null;

  return (
    <div className="flex h-screen flex-col bg-stone-50 dark:bg-black">
      <TopBar area="crm" onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <CRMSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
