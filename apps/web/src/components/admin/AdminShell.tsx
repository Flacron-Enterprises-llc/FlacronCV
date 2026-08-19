'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import AdminSidebar from '@/components/admin/AdminSidebar';
import TopBar from '@/components/dashboard/TopBar';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

/**
 * The admin chrome. This was `(admin)/layout.tsx` verbatim until 2026-08-18; it
 * moved here so the layout could become a server component and export
 * `robots: { index: false, follow: false }`, which a `'use client'` file cannot
 * do. Sign-in redirect and the admin/super_admin role gate are unchanged.
 *
 * Layout matches DashboardShell: full-width navy TopBar, sidebar below.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, placeholderAccount } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // `placeholderAccount` means the account never synced, so `role` is a
    // default and not a fact. Bouncing here would lock a genuine admin out of
    // this panel for the rest of the session over a momentary API failure.
    if (placeholderAccount) return;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [loading, user, placeholderAccount, router]);

  if (loading || !user || placeholderAccount || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-stone-50 dark:bg-black">
      <TopBar area="admin" onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
