'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
  });

  const reactivateMutation = useMutation({
    mutationFn: (uid: string) => api.put(`/crm/users/${uid}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users'] }),
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ uid, plan }: { uid: string; plan: string }) =>
      api.put(`/crm/users/${uid}/plan`, { plan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'users'] });
      setActionMenu(null);
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) =>
      api.put(`/crm/users/${uid}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'users'] });
      setActionMenu(null);
    },
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
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Platform Users</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Manage all registered users — roles, plans, and account status.
          </p>
        </div>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={handleSearch} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:placeholder-stone-500"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>

          <div className="flex gap-2">
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Suspended</option>
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
                {['User', 'Plan', 'Role', 'CVs', 'Cover Letters', 'Joined', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {h}
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
                : users.map((user) => {
                    const RoleIcon = ROLE_ICONS[user.role] ?? User;
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
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', PLAN_COLORS[user.subscriptionPlan] ?? PLAN_COLORS.free)}>
                            {user.subscriptionPlan}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn('flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize', ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                            <RoleIcon className="h-3 w-3" />
                            {user.role.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                            <FileText className="h-3.5 w-3.5 text-stone-400" />
                            {user.cvsCreated}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                            <FileText className="h-3.5 w-3.5 text-stone-400" />
                            {user.coverLettersCreated}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                          {user.createdAt
                            ? new Date(user.createdAt).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })
                            : '—'}
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                            user.isActive
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
                          )}>
                            {user.isActive ? 'Active' : 'Suspended'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="relative flex items-center gap-1">
                            <Link href={`/crm/users/${user.uid}`}>
                              <button className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200" title="View">
                                <Eye className="h-4 w-4" />
                              </button>
                            </Link>

                            {user.isActive ? (
                              <button
                                onClick={() => suspendMutation.mutate(user.uid)}
                                disabled={suspendMutation.isPending}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                                title="Suspend"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateMutation.mutate(user.uid)}
                                disabled={reactivateMutation.isPending}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                                title="Reactivate"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}

                            <div className="relative">
                              <button
                                onClick={() => setActionMenu(actionMenu === user.uid ? null : user.uid)}
                                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>

                              {actionMenu === user.uid && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
                                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Change Plan</p>
                                    {['free', 'pro', 'enterprise'].map((p) => (
                                      <button
                                        key={p}
                                        onClick={() => changePlanMutation.mutate({ uid: user.uid, plan: p })}
                                        className={cn(
                                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors hover:bg-stone-50 dark:hover:bg-stone-800',
                                          user.subscriptionPlan === p
                                            ? 'font-semibold text-brand-600'
                                            : 'text-stone-700 dark:text-stone-300',
                                        )}
                                      >
                                        {p}
                                        {user.subscriptionPlan === p && ' ✓'}
                                      </button>
                                    ))}
                                    <div className="my-1 border-t border-stone-100 dark:border-stone-800" />
                                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Change Role</p>
                                    {['user', 'admin', 'super_admin'].map((r) => (
                                      <button
                                        key={r}
                                        onClick={() => changeRoleMutation.mutate({ uid: user.uid, role: r })}
                                        className={cn(
                                          'flex w-full items-center gap-2 px-3 py-1.5 text-sm capitalize transition-colors hover:bg-stone-50 dark:hover:bg-stone-800',
                                          user.role === r
                                            ? 'font-semibold text-brand-600'
                                            : 'text-stone-700 dark:text-stone-300',
                                        )}
                                      >
                                        {r.replace('_', ' ')}
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
              <p className="text-sm font-medium">No users found</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {total.toLocaleString()} users total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1.5 text-stone-400 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
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
