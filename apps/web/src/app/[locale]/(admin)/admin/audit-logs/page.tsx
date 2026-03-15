'use client';

import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import {
  FileSearch,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  changes?: { before?: unknown; after?: unknown };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

const actionColors: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'default',
  export: 'warning',
};

export default function AdminAuditLogsPage(): React.JSX.Element | null {
  const t = useTranslations('admin');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('all');

  const { data, isLoading, error } = useQuery<AuditLogsResponse>({
    queryKey: ['admin', 'audit-logs', page, actionFilter],
    queryFn: () =>
      api.get(
        `/admin/audit-logs?page=${page}&limit=50${actionFilter !== 'all' ? `&action=${actionFilter}` : ''}`,
      ),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-stone-500">
        <AlertCircle className="h-8 w-8" />
        <p>{t('error_loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          View system activity and changes
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-stone-600 dark:text-stone-400">
          Filter by action:
        </label>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="input-field py-1.5 text-sm"
        >
          <option value="all">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
          <option value="export">Export</option>
        </select>
      </div>

      {/* Audit logs table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="w-8 px-4 py-3" />
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Actor
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Action
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Resource
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  IP Address
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.logs?.map((log) => (
                <>
                  <tr
                    key={log.id}
                    onClick={() =>
                      setExpandedRow(expandedRow === log.id ? null : log.id)
                    }
                    className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  >
                    <td className="px-4 py-3">
                      {log.changes && (
                        <button className="text-stone-400">
                          {expandedRow === log.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <div>
                        <p className="text-sm font-medium text-stone-900 dark:text-white">
                          {log.actorEmail}
                        </p>
                        <p className="text-xs text-stone-500">{log.actorRole}</p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <Badge variant={actionColors[log.action] || 'default'}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span className="text-sm text-stone-900 dark:text-white">
                        {log.resource}
                      </span>
                      <span className="ms-1 text-xs text-stone-400">
                        #{log.resourceId?.slice(0, 8)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-stone-500">
                      {log.ipAddress || '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-stone-500">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                  {expandedRow === log.id && log.changes && (
                    <tr key={`${log.id}-expanded`}>
                      <td colSpan={6} className="bg-stone-50 px-6 py-4 dark:bg-stone-800/50">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {!!log.changes.before && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-red-500">
                                Before
                              </p>
                              <pre className="overflow-auto rounded-lg bg-white p-3 text-xs text-stone-700 dark:bg-stone-900 dark:text-stone-300">
                                {JSON.stringify(log.changes.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {!!log.changes.after && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-emerald-500">
                                After
                              </p>
                              <pre className="overflow-auto rounded-lg bg-white p-3 text-xs text-stone-700 dark:bg-stone-900 dark:text-stone-300">
                                {JSON.stringify(log.changes.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {(!data?.logs || data.logs.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center"
                  >
                    <FileSearch className="mx-auto h-10 w-10 text-stone-300 dark:text-stone-600" />
                    <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
                      No audit logs found
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-6 py-3 dark:border-stone-700">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Page {data.page} of {data.totalPages} ({data.total} total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
              >
                Next
                <ChevronRight className="ms-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
