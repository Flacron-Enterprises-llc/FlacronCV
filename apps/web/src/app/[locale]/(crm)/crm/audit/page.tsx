'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { AuditLogEntry } from '@flacroncv/shared-types';
import { formatDateTime } from '@/lib/format-date';
import {
  Shield,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Settings,
  CreditCard,
  Ban,
  CheckCircle,
  RefreshCw,
  Crown,
  XCircle,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface ListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ACTION_META: Record<string, { labelKey: string; color: string; icon: React.ElementType }> = {
  USER_ROLE_CHANGED: { labelKey: 'audit_action_role_changed', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400', icon: Crown },
  USER_PLAN_CHANGED: { labelKey: 'audit_action_plan_changed', color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400', icon: CreditCard },
  USER_SUSPENDED: { labelKey: 'audit_action_user_suspended', color: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400', icon: Ban },
  USER_REACTIVATED: { labelKey: 'audit_action_user_reactivated', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400', icon: CheckCircle },
  USER_USAGE_RESET: { labelKey: 'audit_action_usage_reset', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400', icon: RefreshCw },
  SUBSCRIPTION_CANCELED: { labelKey: 'audit_action_subscription_canceled', color: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400', icon: XCircle },
  APP_SETTINGS_UPDATED: { labelKey: 'audit_action_settings_updated', color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400', icon: Settings },
};

// Responsive columns. Timestamp and Action stay visible at every width — they are
// what the log is scanned on — and the rest reappear as the viewport allows.
// Anything hidden is repeated inside the Timestamp cell, so no information is lost.
const COLUMNS: { key: string; hiddenClass: string }[] = [
  { key: 'th_timestamp', hiddenClass: '' },
  { key: 'th_action', hiddenClass: '' },
  { key: 'th_actor', hiddenClass: 'hidden md:table-cell' },
  { key: 'th_target', hiddenClass: 'hidden lg:table-cell' },
  { key: 'th_details', hiddenClass: 'hidden xl:table-cell' },
];

function ActionBadge({ action }: { action: string }) {
  const t = useTranslations('crm');
  const meta = ACTION_META[action];
  const Icon = meta?.icon ?? Shield;
  const color = meta?.color ?? 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400';
  return (
    <span className={cn('flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', color)}>
      <Icon className="h-3 w-3" />
      {meta ? t(meta.labelKey) : action.replace(/_/g, ' ')}
    </span>
  );
}

function DetailCell({ details }: { details: Record<string, unknown> }) {
  const t = useTranslations('crm');
  if (!details || Object.keys(details).length === 0) return <span className="text-stone-400">—</span>;

  const entries = Object.entries(details).filter(([k]) => k !== 'changes');
  if (entries.length === 0) {
    const changes = details.changes as Record<string, unknown> | undefined;
    if (changes) {
      return (
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {t('audit_changes_updated', { fields: Object.keys(changes).join(', ') })}
        </span>
      );
    }
    return <span className="text-stone-400">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs text-stone-500 dark:text-stone-400">
          <span className="font-medium">{k}:</span>{' '}
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </div>
      ))}
    </div>
  );
}

export default function CRMAuditPage(): React.JSX.Element {
  const t = useTranslations('crm');
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = new URLSearchParams({
    page: String(page),
    limit: '50',
    ...(actionFilter && { action: actionFilter }),
    ...(targetTypeFilter && { targetType: targetTypeFilter }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  });

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['crm', 'audit', page, actionFilter, targetTypeFilter, startDate, endDate],
    queryFn: () => api.get(`/crm/audit?${params}`),
    staleTime: 30_000,
  });

  const entries = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  const clearFilters = () => {
    setActionFilter('');
    setTargetTypeFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasFilters = actionFilter || targetTypeFilter || startDate || endDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('audit_title')}</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {t('audit_subtitle')}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            aria-label={t('filter_by_action')}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          >
            <option value="">{t('audit_filter_all_actions')}</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>{t(meta.labelKey)}</option>
            ))}
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            aria-label={t('filter_by_target_type')}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          >
            <option value="">{t('audit_filter_all_targets')}</option>
            <option value="user">{t('user')}</option>
            <option value="subscription">{t('audit_target_subscription')}</option>
            <option value="settings">{t('settings')}</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            />
            <span className="text-stone-400">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>{t('clear')}</Button>
          )}

          <span className="ml-auto text-xs text-stone-400">{t('audit_entries_count', { count: total.toLocaleString() })}</span>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400',
                      col.hiddenClass,
                    )}
                  >
                    {t(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className={cn('px-4 py-3 sm:px-6', col.hiddenClass)}>
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : entries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="px-4 py-3 text-xs text-stone-500 sm:px-6 dark:text-stone-400">
                        <span className="whitespace-nowrap">
                          {formatDateTime(entry.timestamp, {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        {/* Values of the columns hidden at this width, repeated so a
                            narrow screen still shows who did what to which target. */}
                        <p className="mt-1 text-xs text-stone-700 md:hidden dark:text-stone-300">
                          {entry.actorEmail}
                        </p>
                        <p className="mt-1 text-xs text-stone-400 lg:hidden">
                          {entry.targetName} · <span className="capitalize">{entry.targetType}</span>
                        </p>
                        <div className="mt-1 xl:hidden">
                          <DetailCell details={entry.details} />
                        </div>
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell sm:px-6">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-700">
                            <User className="h-3 w-3 text-stone-500" />
                          </div>
                          <span className="text-xs text-stone-700 dark:text-stone-300">{entry.actorEmail}</span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell sm:px-6">
                        <div>
                          <p className="text-xs font-medium text-stone-700 dark:text-stone-300">{entry.targetName}</p>
                          <p className="text-xs text-stone-400 capitalize">{entry.targetType}</p>
                        </div>
                      </td>
                      <td className="hidden max-w-xs px-4 py-3 xl:table-cell sm:px-6">
                        <DetailCell details={entry.details} />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <Shield className="mb-3 h-10 w-10" />
              <p className="text-sm font-medium">{t('audit_empty_state')}</p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-2 text-xs text-brand-600 hover:underline">
                  {t('clear_filters')}
                </button>
              )}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('audit_total_entries', { count: total.toLocaleString() })}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t('pagination_previous_page')}
                title={t('pagination_previous_page')}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-stone-700 dark:text-stone-300">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label={t('pagination_next_page')}
                title={t('pagination_next_page')}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
