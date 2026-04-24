'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AuditLogEntry } from '@flacroncv/shared-types';
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

const ACTION_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  USER_ROLE_CHANGED: { label: 'Role Changed', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400', icon: Crown },
  USER_PLAN_CHANGED: { label: 'Plan Changed', color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400', icon: CreditCard },
  USER_SUSPENDED: { label: 'User Suspended', color: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400', icon: Ban },
  USER_REACTIVATED: { label: 'User Reactivated', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400', icon: CheckCircle },
  USER_USAGE_RESET: { label: 'Usage Reset', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400', icon: RefreshCw },
  APP_SETTINGS_UPDATED: { label: 'Settings Updated', color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400', icon: Settings },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action.replace(/_/g, ' '), color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-400', icon: Shield };
  const Icon = meta.icon;
  return (
    <span className={cn('flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', meta.color)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function DetailCell({ details }: { details: Record<string, unknown> }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-stone-400">—</span>;

  const entries = Object.entries(details).filter(([k]) => k !== 'changes');
  if (entries.length === 0) {
    const changes = details.changes as Record<string, unknown> | undefined;
    if (changes) {
      return (
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {Object.keys(changes).join(', ')} updated
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
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Audit Log</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Complete record of all admin actions taken on the platform.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          >
            <option value="">All Targets</option>
            <option value="user">User</option>
            <option value="settings">Settings</option>
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
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
          )}

          <span className="ml-auto text-xs text-stone-400">{total.toLocaleString()} entries</span>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {['Timestamp', 'Action', 'Actor', 'Target', 'Details'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : entries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500 dark:text-stone-400">
                        {entry.timestamp
                          ? new Date(entry.timestamp).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-700">
                            <User className="h-3 w-3 text-stone-500" />
                          </div>
                          <span className="text-xs text-stone-700 dark:text-stone-300">{entry.actorEmail}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-medium text-stone-700 dark:text-stone-300">{entry.targetName}</p>
                          <p className="text-xs text-stone-400 capitalize">{entry.targetType}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <DetailCell details={entry.details} />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <Shield className="mb-3 h-10 w-10" />
              <p className="text-sm font-medium">No audit log entries found</p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-2 text-xs text-brand-600 hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-sm text-stone-500 dark:text-stone-400">{total.toLocaleString()} total entries</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-stone-700 dark:text-stone-300">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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
