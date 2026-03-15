'use client';

import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Shield,
  Ban,
  CheckCircle,
  User as UserIcon,
} from 'lucide-react';

interface UserData {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  subscription?: {
    plan: string;
  };
  profile?: {
    firstName: string;
    lastName: string;
    phone: string;
    country: string;
  };
  createdAt: string;
  lastLoginAt: string;
}

interface UsersResponse {
  users: UserData[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminUsersPage(): React.JSX.Element {
  const t = useTranslations('admin');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const limit = 20;

  const { data, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ['admin', 'users', page, searchQuery],
    queryFn: () =>
      api.get(
        `/admin/users?page=${page}&limit=${limit}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`,
      ),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(t('role_updated'));
    },
    onError: () => {
      toast.error(t('role_update_failed'));
    },
  });

  const toggleBanMutation = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'ban' | 'unban' }) =>
      api.patch(`/admin/users/${userId}/status`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(t('status_updated'));
    },
    onError: () => {
      toast.error(t('status_update_failed'));
    },
  });

  const handleSearch = () => {
    setSearchQuery(search);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const handleToggleBan = (user: UserData) => {
    const action = user.status === 'banned' ? 'unban' : 'ban';
    toggleBanMutation.mutate({ userId: user.id, action });
  };

  const openUserDetail = (user: UserData) => {
    setSelectedUser(user);
    setDetailModalOpen(true);
  };

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('users')}</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('users_description')}
        </p>
      </div>

      {/* Search */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder={t('search_users_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleSearch} icon={<Search className="h-4 w-4" />}>
            {t('search')}
          </Button>
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('name')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('email')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('role')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('plan')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('status')}
                </th>
                <th className="px-6 py-3 text-end text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {t('actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data?.users?.map((user) => (
                <tr
                  key={user.id}
                  className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => openUserDetail(user)}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">
                    {user.displayName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-stone-600 dark:text-stone-400">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <select
                      value={user.role}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleRoleChange(user.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300"
                    >
                      <option value="user">{t('role_user')}</option>
                      <option value="admin">{t('role_admin')}</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant="brand">
                      {user.subscription?.plan?.toUpperCase() || 'FREE'}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Badge variant={user.status === 'banned' ? 'danger' : 'success'}>
                      {user.status === 'banned' ? t('banned') : t('active')}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-end">
                    <Button
                      variant={user.status === 'banned' ? 'secondary' : 'danger'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleBan(user);
                      }}
                      loading={toggleBanMutation.isPending}
                      icon={
                        user.status === 'banned' ? (
                          <CheckCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )
                      }
                    >
                      {user.status === 'banned' ? t('unban') : t('ban')}
                    </Button>
                  </td>
                </tr>
              ))}
              {(!data?.users || data.users.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    {t('no_users_found')}
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
              {t('showing_page', { page: data.page, total: data.totalPages })}
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

      {/* User Detail Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={t('user_details')}
        size="lg"
      >
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                {selectedUser.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
                  {selectedUser.displayName}
                </h3>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {selectedUser.email}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {t('role')}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-stone-400" />
                  <span className="text-sm font-medium text-stone-900 dark:text-white">
                    {selectedUser.role}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {t('plan')}
                </p>
                <p className="mt-1 text-sm font-medium text-stone-900 dark:text-white">
                  {selectedUser.subscription?.plan?.toUpperCase() || 'FREE'}
                </p>
              </div>
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {t('status')}
                </p>
                <div className="mt-1">
                  <Badge variant={selectedUser.status === 'banned' ? 'danger' : 'success'}>
                    {selectedUser.status === 'banned' ? t('banned') : t('active')}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {t('joined')}
                </p>
                <p className="mt-1 text-sm font-medium text-stone-900 dark:text-white">
                  {formatDate(selectedUser.createdAt)}
                </p>
              </div>
            </div>

            {selectedUser.profile && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-stone-900 dark:text-white">
                  {t('profile_info')}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedUser.profile.firstName && (
                    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('first_name')}
                      </p>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {selectedUser.profile.firstName}
                      </p>
                    </div>
                  )}
                  {selectedUser.profile.lastName && (
                    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('last_name')}
                      </p>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {selectedUser.profile.lastName}
                      </p>
                    </div>
                  )}
                  {selectedUser.profile.phone && (
                    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('phone')}
                      </p>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {selectedUser.profile.phone}
                      </p>
                    </div>
                  )}
                  {selectedUser.profile.country && (
                    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-700/50">
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('country')}
                      </p>
                      <p className="text-sm text-stone-900 dark:text-white">
                        {selectedUser.profile.country}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedUser.lastLoginAt && (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {t('last_login')}: {formatDate(selectedUser.lastLoginAt)}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
