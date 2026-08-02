'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Info, AlertTriangle, CheckCircle, XCircle, X, type LucideIcon } from 'lucide-react';

interface AppConfig {
  announcement: {
    enabled: boolean;
    message: string;
    type: 'info' | 'warning' | 'success' | 'danger';
  };
  maintenanceMode: { enabled: boolean; message: string };
  featureFlags: Record<string, boolean>;
}

const STYLES: Record<string, { wrap: string; icon: LucideIcon; iconColor: string }> = {
  info: {
    wrap: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300',
    icon: Info,
    iconColor: 'text-blue-500',
  },
  warning: {
    wrap: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  success: {
    wrap: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300',
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
  },
  danger: {
    wrap: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800/60 dark:bg-red-900/20 dark:text-red-300',
    icon: XCircle,
    iconColor: 'text-red-500',
  },
};

const DISMISS_KEY = 'flacroncv_announcement_dismissed';

/**
 * Renders the operator-controlled announcement from CRM Settings (via the public
 * /app-config endpoint). Dismissal is keyed by the message text, so editing the
 * announcement re-shows it to everyone. The message is operator-authored free
 * text, so it is intentionally NOT run through i18n.
 */
export default function AnnouncementBanner() {
  const t = useTranslations('common');
  const [dismissed, setDismissed] = useState<string | null>(null);

  const { data } = useQuery<AppConfig>({
    queryKey: ['app-config'],
    queryFn: () => api.get('/app-config'),
    staleTime: 60_000,
  });

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const announcement = data?.announcement;
  if (!announcement?.enabled || !announcement.message) return null;
  if (dismissed === announcement.message) return null;

  const style = STYLES[announcement.type] ?? STYLES.info;
  const Icon = style.icon;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, announcement.message);
    } catch {
      /* storage unavailable — hide for this render only */
    }
    setDismissed(announcement.message);
  };

  return (
    <div
      role="status"
      className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 ${style.wrap}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} />
      <p className="flex-1 text-sm">{announcement.message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('close')}
        className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
