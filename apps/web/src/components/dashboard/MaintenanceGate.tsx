'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { Wrench } from 'lucide-react';

interface AppConfig {
  maintenanceMode: { enabled: boolean; message: string };
  announcement: { enabled: boolean; message: string; type: string };
  featureFlags: Record<string, boolean>;
}

/**
 * When the operator turns on Maintenance Mode in CRM Settings, non-admin users
 * see a maintenance screen instead of the app. Admins/super-admins pass through
 * so they can keep working (and can turn it back off).
 *
 * The operator-authored message is shown verbatim (it is already written in
 * whatever language the operator chose). Only the FALLBACK — used when the
 * operator leaves the message blank — is translated; it used to be a hardcoded
 * English sentence shown to every locale.
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const t = useTranslations('common');
  const { data } = useQuery<AppConfig>({
    queryKey: ['app-config'],
    queryFn: () => api.get('/app-config'),
    staleTime: 60_000,
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const maintenance = data?.maintenanceMode;

  if (maintenance?.enabled && !isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-950 dark:text-amber-400">
          <Wrench className="h-8 w-8" />
        </div>
        <p className="max-w-md text-lg font-medium text-stone-700 dark:text-stone-200">
          {maintenance.message || t('maintenance_default')}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
