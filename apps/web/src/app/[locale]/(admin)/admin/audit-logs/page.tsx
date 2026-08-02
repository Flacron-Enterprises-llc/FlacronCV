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

// Mirrors apps/api/src/modules/audit/audit-actions.ts — keep the two in step.
// Grouped so the filter reads as categories rather than one flat list.
const AUDIT_ACTION_GROUPS: { labelKey: string; actions: string[] }[] = [
  {
    labelKey: 'audit_group_auth',
    actions: [
      'AUTH_LOGIN',
      'AUTH_LOGOUT',
      'AUTH_LOGIN_FAILED',
      'AUTH_REGISTERED',
      'AUTH_PASSWORD_RESET_REQUESTED',
    ],
  },
  {
    labelKey: 'audit_group_users',
    actions: [
      'USER_ROLE_CHANGED',
      'USER_SUSPENDED',
      'USER_REACTIVATED',
      'USER_DELETED',
      'ADMIN_USER_UPDATED',
    ],
  },
  {
    labelKey: 'audit_group_billing',
    actions: [
      'SUBSCRIPTION_ACTIVATED',
      'SUBSCRIPTION_CHANGED',
      'SUBSCRIPTION_CANCELLED',
      'SUBSCRIPTION_REVOKED',
      'PAYMENT_FAILED',
    ],
  },
  {
    labelKey: 'audit_group_templates',
    actions: ['TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED'],
  },
  {
    labelKey: 'audit_group_support',
    actions: ['TICKET_CREATED', 'TICKET_CLOSED', 'ADMIN_TICKET_REPLIED', 'ADMIN_TICKET_UPDATED'],
  },
  {
    labelKey: 'audit_group_content',
    actions: ['AI_GENERATION', 'DOCUMENT_EXPORTED'],
  },
];

const actionColors: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  AUTH_LOGIN: 'success',
  AUTH_LOGOUT: 'default',
  AUTH_LOGIN_FAILED: 'danger',
  AUTH_REGISTERED: 'success',
  AUTH_PASSWORD_RESET_REQUESTED: 'warning',
  USER_ROLE_CHANGED: 'danger',
  USER_SUSPENDED: 'danger',
  USER_REACTIVATED: 'success',
  USER_DELETED: 'danger',
  SUBSCRIPTION_ACTIVATED: 'success',
  SUBSCRIPTION_CHANGED: 'info',
  SUBSCRIPTION_CANCELLED: 'warning',
  SUBSCRIPTION_REVOKED: 'danger',
  PAYMENT_FAILED: 'danger',
  TEMPLATE_CREATED: 'success',
  TEMPLATE_UPDATED: 'info',
  TEMPLATE_DELETED: 'warning',
  TICKET_CREATED: 'info',
  TICKET_CLOSED: 'default',
  AI_GENERATION: 'info',
  DOCUMENT_EXPORTED: 'default',
  ADMIN_USER_UPDATED: 'info',
  ADMIN_TICKET_REPLIED: 'success',
  ADMIN_TICKET_UPDATED: 'warning',
};

/** "ADMIN_USER_UPDATED" -> "User Updated" (no per-action i18n keys needed). */
function humanizeAction(action: string): string {
  return action
    .replace(/^(ADMIN|AUTH)_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
          {t('audit_logs')}
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('audit_subtitle')}
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        {/* htmlFor/id, not just adjacency — a <label> that neither wraps nor
            references its control is decorative to assistive tech. */}
        <label
          htmlFor="audit-action-filter"
          className="text-sm font-medium text-stone-600 dark:text-stone-400"
        >
          {t('filter_by_action')}
        </label>
        <select
          id="audit-action-filter"
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="input-field py-1.5 text-sm"
        >
          <option value="all">{t('action_all')}</option>
          {AUDIT_ACTION_GROUPS.map((group) => (
            <optgroup key={group.labelKey} label={t(group.labelKey)}>
              {group.actions.map((a) => (
                <option key={a} value={a}>{humanizeAction(a)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Audit logs table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {/* Responsive columns. Actor and Action are what an auditor scans
                  on, so they stay visible at every width; Date, Resource and IP
                  reappear as the viewport allows. Anything hidden is repeated as
                  a sub-line inside the Actor cell (below), so no information is
                  lost on a narrow screen. */}
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400">
                  {t('th_actor')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 sm:px-6 dark:text-stone-400">
                  {t('th_action')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 lg:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_resource')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 xl:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_ip')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 md:table-cell sm:px-6 dark:text-stone-400">
                  {t('th_date')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.logs?.map((log) => (
                <React.Fragment key={log.id}>
                  {/* The row itself toggles the detail panel, so it needs the
                      same name, role and keyboard handling a button would have —
                      previously it was mouse-only and invisible to a screen
                      reader. */}
                  <tr
                    key={log.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!!log.changes && expandedRow === log.id}
                    aria-label={`${
                      expandedRow === log.id ? t('collapse_details') : t('expand_details')
                    }: ${log.actorEmail}`}
                    onClick={() =>
                      setExpandedRow(expandedRow === log.id ? null : log.id)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedRow(expandedRow === log.id ? null : log.id);
                      }
                    }}
                    className="cursor-pointer hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-stone-800/50"
                  >
                    <td className="px-4 py-3">
                      {log.changes && (
                        // Purely decorative. The ROW is the control: it carries
                        // role="button", tabIndex, aria-expanded, a descriptive
                        // label and Enter/Space handling. Making this a second
                        // focusable button gave keyboard users two consecutive
                        // stops that did the same thing and announced almost the
                        // same name. The chevron stays as the visual affordance.
                        <span aria-hidden="true" className="text-stone-400">
                          {expandedRow === log.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <div>
                        <p className="text-sm font-medium text-stone-900 dark:text-white">
                          {log.actorEmail}
                        </p>
                        <p className="text-xs text-stone-500">{log.actorRole}</p>
                        {/* Columns hidden at this width, kept legible here. */}
                        <p className="text-xs text-stone-500 md:hidden">
                          {formatDate(log.createdAt)}
                        </p>
                        <p className="text-xs text-stone-500 lg:hidden">
                          {log.resource} #{log.resourceId?.slice(0, 8)}
                        </p>
                        <p className="text-xs text-stone-500 xl:hidden">
                          {log.ipAddress || '-'}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                      <Badge variant={actionColors[log.action] || 'default'}>
                        {humanizeAction(log.action)}
                      </Badge>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell sm:px-6">
                      <span className="text-sm text-stone-900 dark:text-white">
                        {log.resource}
                      </span>
                      <span className="ms-1 text-xs text-stone-400">
                        #{log.resourceId?.slice(0, 8)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-stone-500 xl:table-cell sm:px-6">
                      {log.ipAddress || '-'}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-stone-500 md:table-cell sm:px-6">
                      {formatDate(log.createdAt)}
                    </td>
                  </tr>
                  {expandedRow === log.id && log.changes && (
                    <tr key={`${log.id}-expanded`}>
                      <td colSpan={6} className="bg-stone-50 px-4 py-4 sm:px-6 dark:bg-stone-800/50">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {!!log.changes.before && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-red-500">
                                {t('before')}
                              </p>
                              <pre className="overflow-auto rounded-lg bg-white p-3 text-xs text-stone-700 dark:bg-stone-900 dark:text-stone-300">
                                {JSON.stringify(log.changes.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {!!log.changes.after && (
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase text-emerald-500">
                                {t('after')}
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
                </React.Fragment>
              ))}
              {(!data?.logs || data.logs.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center sm:px-6"
                  >
                    <FileSearch className="mx-auto h-10 w-10 text-stone-300 dark:text-stone-600" />
                    <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
                      {t('no_audit_logs')}
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
              {t('audit_pagination', { page: data.page, pages: data.totalPages, total: data.total })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                {t('previous')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.totalPages}
              >
                {t('next')}
                <ChevronRight className="ms-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
