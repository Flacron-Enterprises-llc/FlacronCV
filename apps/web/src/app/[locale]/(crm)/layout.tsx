'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import CRMSidebar from '@/components/crm/CRMSidebar';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { Loader2 } from 'lucide-react';

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') return null;

  return (
    <div className="flex h-screen bg-stone-50 dark:bg-black">
      <CRMSidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
