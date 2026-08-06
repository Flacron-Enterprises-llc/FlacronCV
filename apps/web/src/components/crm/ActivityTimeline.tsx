'use client';

import { useTranslations } from 'next-intl';
import { CRMActivity, CRMActivityType } from '@flacroncv/shared-types';
import {
  MessageSquare,
  RefreshCw,
  DollarSign,
  UserCheck,
  Tag,
  XCircle,
} from 'lucide-react';
import { formatRelative } from '@/lib/format-date';
import { cn } from '@/lib/utils';

// Restrained palette: neutral chips carry the icon (which conveys the type),
// with brand reserved for the single most important event (a converted lead).
const NEUTRAL = { color: 'text-stone-600 dark:text-stone-400', bg: 'bg-stone-100 dark:bg-stone-800' };

const TYPE_CONFIG: Record<
  CRMActivityType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  [CRMActivityType.NOTE]: { icon: MessageSquare, ...NEUTRAL },
  [CRMActivityType.STATUS_CHANGE]: { icon: RefreshCw, ...NEUTRAL },
  [CRMActivityType.TRANSACTION]: { icon: DollarSign, ...NEUTRAL },
  [CRMActivityType.LEAD_CONVERTED]: {
    icon: UserCheck,
    color: 'text-brand-600 dark:text-brand-400',
    bg: 'bg-brand-50 dark:bg-brand-950',
  },
  [CRMActivityType.TAG_ADDED]: { icon: Tag, ...NEUTRAL },
  [CRMActivityType.TAG_REMOVED]: { icon: XCircle, ...NEUTRAL },
};

interface ActivityTimelineProps {
  activities: CRMActivity[];
  loading?: boolean;
}

export default function ActivityTimeline({ activities, loading }: ActivityTimelineProps) {
  const t = useTranslations('crm');
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities.length) {
    return (
      <p className="text-sm text-stone-500 dark:text-stone-400">
        {t('chart_no_activity_recorded')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, idx) => {
        const config = TYPE_CONFIG[activity.type];
        const Icon = config.icon;

        return (
          <div key={activity.id} className="relative flex gap-3">
            {/* Connector line */}
            {idx < activities.length - 1 && (
              <div className="absolute start-[17px] top-9 h-full w-px bg-stone-200 dark:bg-stone-700" />
            )}

            {/* Icon */}
            <div
              className={cn(
                'relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
                config.bg,
              )}
            >
              <Icon className={cn('h-4 w-4', config.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <p className="text-sm font-medium text-stone-900 dark:text-white">
                {activity.title}
              </p>
              {activity.description && (
                <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">
                  {activity.description}
                </p>
              )}
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                {activity.authorName} &middot;{' '}
                {formatRelative(activity.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
