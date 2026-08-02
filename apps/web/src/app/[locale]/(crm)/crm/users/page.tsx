'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { PlatformUserItem } from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import {
  Users,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Crown,
  ShieldCheck,
  User,
  ChevronDown,
  Ban,
  CheckCircle,
  Eye,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format-date';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ListResponse {
  items: PlatformUserItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  pro: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  career_accelerator: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  enterprise: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

const ROLE_COLORS: Record<string, string> = {
  user: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  admin: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  super_admin: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  user: User,
  admin: ShieldCheck,
  super_admin: Crown,
};

function UserAvatar({ user }: { user: PlatformUserItem }) {
  const initials = (user.displayName || user.email)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
      {initials}
    </div>
  );
}

export default function CRMUsersPage(): React.JSX.Element {
  const t = useTranslations('crm');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    limit: '25',
    ...(search && { search }),
    ...(planFilter && { plan: planFilter }),
    ...(roleFilter && { role: roleFilter }),
    ...(statusFilter !== '' && { isActive: statusFilter }),
  });

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['crm', 'users', page, search, planFilter, roleFilter, statusFilter],
    queryFn: () => api.get(`/crm/users?${params}`),
    staleTime: 30_000,
  });

  const suspendMutation = useMutation({
    mutationFn: (uid: string) => api.put(`/crm/users/${uid}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users'] }),
    onError: () => toast.error(t('user_detail_toast_suspend_failed')),
  });

  const reactivateMutation = useMutation({
    mutationFn: (uid: string) => api.put(`/crm/users/${uid}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users'] }),
    onError: () => toast.error(t('user_detail_toast_reactivate_failed')),
  });

  // Optimistic plan/role changes: the row's plan/role badge (bound to the list
  // cache) updates instantly and the menu closes on click, so nothing snaps back
  // to the stale value; on failure the cache is rolled back and a toast fires.
  const changePlanMutation = useMutation({
    mutationFn: ({ uid, plan }: { uid: string; plan: string }) =>
      api.put(`/crm/users/${uid}/plan`, { plan }),
    onMutate: async ({ uid, plan }) => {
      setActionMenu(null);
      await qc.cancelQueries({ queryKey: ['crm', 'users'] });
      const prev = qc.getQueriesData<ListResponse>({ queryKey: ['crm', 'users'] });
      qc.setQueriesData<ListResponse>({ queryKey: ['crm', 'users'] }, (old) =>
        old
          ? { ...old, items: old.items.map((u) => (u.uid === uid ? ({ ...u, subscriptionPlan: plan } as PlatformUserItem) : u)) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, d]) => qc.setQueryData(key, d));
      toast.error(t('user_detail_toast_plan_update_failed'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm', 'users'] }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) =>
      api.put(`/crm/users/${uid}/role`, { role }),
    onMutate: async ({ uid, role }) => {
      setActionMenu(null);
      await qc.cancelQueries({ queryKey: ['crm', 'users'] });
      const prev = qc.getQueriesData<ListResponse>({ queryKey: ['crm', 'users'] });
      qc.setQueriesData<ListResponse>({ queryKey: ['crm', 'users'] }, (old) =>
        old
          ? { ...old, items: old.items.map((u) => (u.uid === uid ? ({ ...u, role } as PlatformUserItem) : u)) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, d]) => qc.setQueryData(key, d));
      toast.error(t('user_detail_toast_role_update_failed'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm', 'users'] }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleExport = async () => {
    const { auth } = await import('@/lib/firebase');
    const token = await auth?.currentUser?.getIdToken();
    const url = `${API_URL}/crm/users/export/csv`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'platform-users.csv';
    a.click();
  };

  const users = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('users_page_title')}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('users_page_subtitle')}
          </p>
        </div>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
          {t('export_csv')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('users_search_placeholder')}
                className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pe-3 ps-9 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:placeholder-stone-500"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">{t('search')}</Button>
          </form>

          <div className="flex gap-2">
            <select
              aria-label={t('filter_by_plan')}
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">{t('users_filter_all_plans')}</option>
              <option value="free">{t('plan_free')}</option>
              <option value="pro">{t('plan_pro')}</option>
              <option value="career_accelerator">{t('plan_career_accelerator')}</option>
              <option value="enterprise">{t('plan_enterprise')}</option>
            </select>

            <select
              aria-label={t('filter_by_role')}
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">{t('users_filter_all_roles')}</option>
              <option value="user">{t('role_user')}</option>
              <option value="admin">{t('role_admin')}</option>
              <option value="super_admin">{t('role_super_admin')}</option>
            </select>

            <select
              aria-label={t('filter_by_status')}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">{t('users_filter_all_status')}</option>
              <option value="true">{t('status_active')}</option>
              <option value="false">{t('status_suspended')}</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {/* User, Status and Actions stay visible at every width; the rest
                    fold progressively and are repeated as sub-lines inside the User
                    cell, so nothing is lost. Same pattern as admin/users + admin/tickets.
                    text-start, not text-start — this table renders in Arabic and Urdu. */}
                {[
                  { label: t('col_user'), cls: '' },
                  { label: t('col_plan'), cls: 'hidden md:table-cell' },
                  { label: t('col_role'), cls: 'hidden lg:table-cell' },
                  { label: t('users_col_cvs'), cls: 'hidden xl:table-cell' },
                  { label: t('users_col_cover_letters'), cls: 'hidden xl:table-cell' },
                  { label: t('col_joined'), cls: 'hidden lg:table-cell' },
                  { label: t('col_status'), cls: '' },
                  { label: t('col_actions'), cls: '' },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={cn(
                      'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400',
                      h.cls,
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : users.map((user, rowIndex) => {
                    const RoleIcon = ROLE_ICONS[user.role] ?? User;
                    // The table wrapper is `overflow-x-auto`, so overflow-y computes to
                    // auto and clips this row menu. Rows near the bottom therefore open
                    // the menu upward; the menu itself is capped and scrolls internally.
                    // Residual limitation: on a very short viewport the menu can still be
                    // clipped by the wrapper — a portal would be needed to fix that fully.
                    // Threshold is 8, not 4: the menu is ~290px tall and a row is
                    // ~57px, so flipping upward is only safe when at least six rows
                    // sit above the trigger. At 5 rows the old threshold flipped the
                    // 3rd-from-last row into ~155px of space and overflowed the TOP
                    // of the wrapper instead — and top overflow cannot be scrolled to,
                    // so it traded a clip for a worse one.
                    const openUpward = users.length > 8 && rowIndex >= users.length - 3;
                    return (
                      <tr
                        key={user.uid}
                        className="transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={user} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-stone-900 dark:text-white">
                                {user.displayName || '—'}
                              </p>
                              <p className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{user.email}</span>
                              </p>
                              {/* Values of the columns hidden at this width. */}
                              <p className="truncate text-xs text-stone-400 md:hidden">
                                {['free', 'pro', 'career_accelerator', 'enterprise'].includes(user.subscriptionPlan)
                                  ? t(`plan_${user.subscriptionPlan}`)
                                  : user.subscriptionPlan}
                              </p>
                              <p className="truncate text-xs text-stone-400 lg:hidden">
                                {['user', 'admin', 'super_admin'].includes(user.role)
                                  ? t(`role_${user.role}`)
                                  : user.role.replace('_', ' ')}
                                {' · '}
                                {formatDate(user.createdAt)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="hidden px-4 py-3 md:table-cell">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', PLAN_COLORS[user.subscriptionPlan] ?? PLAN_COLORS.free)}>
                            {['free', 'pro', 'career_accelerator', 'enterprise'].includes(user.subscriptionPlan) ? t(`plan_${user.subscriptionPlan}`) : user.subscriptionPlan}
                          </span>
                        </td>

                        <td className="hidden px-4 py-3 lg:table-cell">
                          <span className={cn('flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize', ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                            <RoleIcon className="h-3 w-3" />
                            {['user', 'admin', 'super_admin'].includes(user.role) ? t(`role_${user.role}`) : user.role.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="hidden px-4 py-3 xl:table-cell">
                          <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                            <FileText className="h-3.5 w-3.5 text-stone-400" />
                            {user.cvsCreated}
                          </div>
                        </td>

                        <td className="hidden px-4 py-3 xl:table-cell">
                          <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                            <FileText className="h-3.5 w-3.5 text-stone-400" />
                            {user.coverLettersCreated}
                          </div>
                        </td>

                        <td className="hidden px-4 py-3 text-stone-600 lg:table-cell dark:text-stone-400">
                          {formatDate(user.createdAt)}
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            user.isActive
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
                          )}>
                            {user.isActive ? t('status_active') : t('status_suspended')}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="relative flex items-center gap-1">
                            <Link href={`/crm/users/${user.uid}`}>
                              <button className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200" title={t('view')}>
                                <Eye className="h-4 w-4" />
                              </button>
                            </Link>

                            {user.isActive ? (
                              <button
                                onClick={() => suspendMutation.mutate(user.uid)}
                                disabled={suspendMutation.isPending}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                                title={t('suspend')}
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateMutation.mutate(user.uid)}
                                disabled={reactivateMutation.isPending}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                                title={t('reactivate')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}

                            <div className="relative">
                              <button
                                onClick={() => setActionMenu(actionMenu === user.uid ? null : user.uid)}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
                                aria-haspopup="menu"
                                aria-expanded={actionMenu === user.uid}
                                aria-label={t('row_actions', { name: user.displayName || user.email })}
                                title={t('row_actions', { name: user.displayName || user.email })}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>

                              {actionMenu === user.uid && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                                  <div
                                    className={cn(
                                      // max-h-80 (320px), not 64 (256px): the menu's
                                      // natural height is ~290px, so a 256px cap put a
                                      // scrollbar on every menu and pushed "Super Admin"
                                      // below the fold. 320px clears the content and
                                      // still caps the menu on a very short viewport.
                                      'absolute end-0 z-20 max-h-80 w-44 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900',
                                      openUpward ? 'bottom-full mb-1' : 'mt-1',
                                    )}
                                  >
                                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-400">{t('users_change_plan')}</p>
                                    {['free', 'pro', 'career_accelerator', 'enterprise'].map((p) => (
                                      <button
                                        key={p}
                                        onClick={() => changePlanMutation.mutate({ uid: user.uid, plan: p })}
                                        disabled={changePlanMutation.isPending}
                                        className={cn(
                                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors hover:bg-stone-50 disabled:opacity-50 dark:hover:bg-stone-800',
                                          user.subscriptionPlan === p
                                            ? 'font-semibold text-brand-600'
                                            : 'text-stone-700 dark:text-stone-300',
                                        )}
                                      >
                                        {t(`plan_${p}`)}
                                        {user.subscriptionPlan === p && ' ✓'}
                                      </button>
                                    ))}
                                    <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-400">{t('users_change_role')}</p>
                                    {['user', 'admin', 'super_admin'].map((r) => (
                                      <button
                                        key={r}
                                        onClick={() => changeRoleMutation.mutate({ uid: user.uid, role: r })}
                                        disabled={changeRoleMutation.isPending}
                                        className={cn(
                                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors hover:bg-stone-50 disabled:opacity-50 dark:hover:bg-stone-800',
                                          user.role === r
                                            ? 'font-semibold text-brand-600'
                                            : 'text-stone-700 dark:text-stone-300',
                                        )}
                                      >
                                        {t(`role_${r}`)}
                                        {user.role === r && ' ✓'}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!isLoading && users.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <Users className="mb-3 h-10 w-10" />
              <p className="text-sm font-medium">{t('users_empty')}</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('users_pagination_total', { total: total.toLocaleString() })}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
                aria-label={t('pagination_prev')}
                title={t('pagination_prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-stone-700 dark:text-stone-300">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
                aria-label={t('pagination_next')}
                title={t('pagination_next')}
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
