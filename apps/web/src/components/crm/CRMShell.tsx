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
 * do. Nothing below changed in that move — in particular the sign-in redirect
 * and the admin/super_admin role gate are byte-identical.
 */
export default function CRMShell({ children }: { children: React.ReactNode }) {
  const { user, loading, placeholderAccount } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
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
    <div className="flex h-screen bg-stone-50 dark:bg-black">
      <CRMSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Shared TopBar, identical to (admin)/layout.tsx.
            The CRM previously had a bespoke `lg:hidden` bar carrying only a
            menu button and a hand-typed "FlacronCRM" wordmark — so on desktop
            the CRM had NO header at all, leaving admins with no language
            switcher, no theme toggle and no account menu anywhere in the
            section, and a different header height and logo treatment from the
            other two shells. TopBar is shell-agnostic and supplies all of it. */}
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
