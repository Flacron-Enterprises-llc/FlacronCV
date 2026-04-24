'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { User } from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import {
  ArrowLeft,
  Mail,
  MapPin,
  Calendar,
  Crown,
  ShieldCheck,
  User as UserIcon,
  FileText,
  Bot,
  Download,
  Ban,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Clock,
  Briefcase,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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
  user: UserIcon,
  admin: ShieldCheck,
  super_admin: Crown,
};

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-stone-600 dark:text-stone-400">{label}</span>
        <span className="font-medium text-stone-800 dark:text-stone-200">
          {used} {limit > 0 ? `/ ${limit}` : '/ ∞'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CRMUserDetailPage(): React.JSX.Element {
  const params = useParams();
  const uid = params.id as string;
  const qc = useQueryClient();

  const [roleEdit, setRoleEdit] = useState(false);
  const [planEdit, setPlanEdit] = useState(false);

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['crm', 'users', uid],
    queryFn: () => api.get(`/crm/users/${uid}`),
    enabled: !!uid,
  });

  const suspendMutation = useMutation({
    mutationFn: () => api.put(`/crm/users/${uid}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users', uid] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.put(`/crm/users/${uid}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users', uid] }),
  });

  const resetUsageMutation = useMutation({
    mutationFn: () => api.delete(`/crm/users/${uid}/usage`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'users', uid] }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: (role: string) => api.put(`/crm/users/${uid}/role`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'users', uid] });
      setRoleEdit(false);
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: (plan: string) => api.put(`/crm/users/${uid}/plan`, { plan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'users', uid] });
      setPlanEdit(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-stone-400">
        <UserIcon className="mb-3 h-12 w-12" />
        <p className="font-medium">User not found</p>
        <Link href="/crm/users">
          <Button variant="ghost" className="mt-4">Back to Users</Button>
        </Link>
      </div>
    );
  }

  const initials = (user.displayName || user.email).split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const RoleIcon = ROLE_ICONS[user.role] ?? UserIcon;

  const stats = [
    {
      label: 'CVs Created',
      value: user.usage?.cvsCreated ?? 0,
      icon: FileText,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: 'Cover Letters',
      value: user.usage?.coverLettersCreated ?? 0,
      icon: Briefcase,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    },
    {
      label: 'AI Credits Used',
      value: user.usage?.aiCreditsUsed ?? 0,
      icon: Bot,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
    },
    {
      label: 'Exports This Month',
      value: user.usage?.exportsThisMonth ?? 0,
      icon: Download,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/crm/users">
        <button className="flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </button>
      </Link>

      {/* Profile header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 dark:text-white">
                {user.displayName || '(No name)'}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {user.email}
                </span>
                {user.profile?.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {user.profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined {new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                  <RoleIcon className="h-3 w-3" />
                  {user.role.replace('_', ' ')}
                </span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', PLAN_COLORS[user.subscription?.plan ?? 'free'] ?? PLAN_COLORS.free)}>
                  {user.subscription?.plan ?? 'free'} plan
                </span>
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  user.isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
                )}>
                  {user.isActive ? 'Active' : 'Suspended'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {user.isActive ? (
              <Button
                variant="danger"
                size="sm"
                icon={<Ban className="h-4 w-4" />}
                loading={suspendMutation.isPending}
                onClick={() => {
                  if (confirm(`Suspend account for ${user.email}?`)) suspendMutation.mutate();
                }}
              >
                Suspend
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCircle className="h-4 w-4" />}
                loading={reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate()}
              >
                Reactivate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={resetUsageMutation.isPending}
              onClick={() => {
                if (confirm('Reset AI credits and exports counter?')) resetUsageMutation.mutate();
              }}
            >
              Reset Usage
            </Button>
          </div>
        </div>
      </Card>

      {/* Usage stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-stone-500 dark:text-stone-400">{s.label}</p>
                <p className="text-xl font-bold text-stone-900 dark:text-white">{s.value.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subscription & Role Management */}
        <div className="space-y-6">
          {/* Subscription */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Subscription</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600 dark:text-stone-400">Plan</span>
                <div className="flex items-center gap-2">
                  {planEdit ? (
                    <div className="flex gap-1">
                      {['free', 'pro', 'enterprise'].map((p) => (
                        <button
                          key={p}
                          onClick={() => changePlanMutation.mutate(p)}
                          disabled={changePlanMutation.isPending}
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-semibold capitalize transition-colors',
                            user.subscription?.plan === p
                              ? 'bg-brand-600 text-white'
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300',
                          )}
                        >
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPlanEdit(false)} className="ml-1 text-xs text-stone-400 hover:text-stone-600">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPlanEdit(true)}
                      className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize transition-opacity hover:opacity-70', PLAN_COLORS[user.subscription?.plan ?? 'free'])}
                    >
                      {user.subscription?.plan ?? 'free'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600 dark:text-stone-400">Status</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', {
                  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400': user.subscription?.status === 'active',
                  'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400': user.subscription?.status === 'trialing',
                  'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400': user.subscription?.status === 'canceled' || user.subscription?.status === 'past_due',
                  'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400': !user.subscription?.status,
                })}>
                  {user.subscription?.status ?? 'active'}
                </span>
              </div>
              {user.subscription?.currentPeriodEnd && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600 dark:text-stone-400">Period End</span>
                  <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}
              {user.subscription?.stripeCustomerId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600 dark:text-stone-400">Stripe ID</span>
                  <span className="flex items-center gap-1 font-mono text-xs text-stone-500">
                    {user.subscription.stripeCustomerId.slice(0, 14)}…
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Role */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Role</h2>
            <div className="space-y-2">
              {['user', 'admin', 'super_admin'].map((r) => {
                const RI = ROLE_ICONS[r] ?? UserIcon;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      if (user.role !== r) changeRoleMutation.mutate(r);
                    }}
                    disabled={changeRoleMutation.isPending}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium capitalize transition-colors',
                      user.role === r
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                        : 'text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-800',
                    )}
                  >
                    <RI className="h-4 w-4 flex-shrink-0" />
                    {r.replace('_', ' ')}
                    {user.role === r && <span className="ml-auto text-brand-500">✓</span>}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Usage */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Usage</h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={resetUsageMutation.isPending}
              onClick={() => {
                if (confirm('Reset AI credits and monthly export counter?')) resetUsageMutation.mutate();
              }}
            >
              Reset
            </Button>
          </div>
          <div className="space-y-5">
            <UsageMeter
              label="CVs Created"
              used={user.usage?.cvsCreated ?? 0}
              limit={user.usage?.cvsCreated ?? 0}
            />
            <UsageMeter
              label="Cover Letters"
              used={user.usage?.coverLettersCreated ?? 0}
              limit={user.usage?.coverLettersCreated ?? 0}
            />
            <UsageMeter
              label="AI Credits"
              used={user.usage?.aiCreditsUsed ?? 0}
              limit={user.usage?.aiCreditsLimit ?? 5}
            />
            <UsageMeter
              label="Exports (This Month)"
              used={user.usage?.exportsThisMonth ?? 0}
              limit={25}
            />
          </div>
        </Card>

        {/* Profile */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Profile</h2>
          <div className="space-y-3 text-sm">
            {[
              { label: 'First Name', value: user.profile?.firstName },
              { label: 'Last Name', value: user.profile?.lastName },
              { label: 'Headline', value: user.profile?.headline },
              { label: 'Location', value: user.profile?.location },
              { label: 'Website', value: user.profile?.website },
              { label: 'LinkedIn', value: user.profile?.linkedin },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex justify-between gap-4">
                  <span className="flex-shrink-0 text-stone-500 dark:text-stone-400">{label}</span>
                  <span className="truncate text-right font-medium text-stone-800 dark:text-stone-200">{value}</span>
                </div>
              ) : null,
            )}
            <div className="border-t border-stone-100 pt-3 dark:border-stone-800">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Clock className="h-3.5 w-3.5" />
                Last login: {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
