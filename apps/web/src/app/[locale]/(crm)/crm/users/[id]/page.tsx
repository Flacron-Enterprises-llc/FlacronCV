'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { User } from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import { toast } from 'sonner';
import { PLAN_CONFIGS } from '@flacroncv/shared-types';
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
import { formatDate, formatDateTime } from '@/lib/format-date';

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
  user: UserIcon,
  admin: ShieldCheck,
  super_admin: Crown,
};

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? Math.min(20, used) : Math.min(100, Math.round((used / limit) * 100));
  const color = isUnlimited ? 'bg-emerald-500' : pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-stone-600 dark:text-stone-400">{label}</span>
        <span className="font-medium text-stone-800 dark:text-stone-200">
          {used} {isUnlimited ? '/ ∞' : limit > 0 ? `/ ${limit}` : '/ 0'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: isUnlimited ? '15%' : `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CRMUserDetailPage(): React.JSX.Element {
  const t = useTranslations('crm');
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
    onSuccess: () => {
      toast.success(t('user_detail_toast_suspended'));
      qc.invalidateQueries({ queryKey: ['crm', 'users', uid] });
    },
    onError: () => toast.error(t('user_detail_toast_suspend_failed')),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.put(`/crm/users/${uid}/reactivate`),
    onSuccess: () => {
      toast.success(t('user_detail_toast_reactivated'));
      qc.invalidateQueries({ queryKey: ['crm', 'users', uid] });
    },
    onError: () => toast.error(t('user_detail_toast_reactivate_failed')),
  });

  const resetUsageMutation = useMutation({
    mutationFn: () => api.delete(`/crm/users/${uid}/usage`),
    onSuccess: () => {
      toast.success(t('user_detail_toast_usage_reset'));
      qc.invalidateQueries({ queryKey: ['crm', 'users', uid] });
    },
    onError: () => toast.error(t('user_detail_toast_reset_usage_failed')),
  });

  // Optimistic role/plan changes: the selected button highlights immediately
  // instead of staying on the stale server value until the refetch; rolled back
  // on failure.
  const changeRoleMutation = useMutation({
    mutationFn: (role: string) => api.put(`/crm/users/${uid}/role`, { role }),
    onMutate: async (role) => {
      await qc.cancelQueries({ queryKey: ['crm', 'users', uid] });
      const prev = qc.getQueryData<User>(['crm', 'users', uid]);
      qc.setQueryData<User>(['crm', 'users', uid], (old) => (old ? ({ ...old, role } as User) : old));
      return { prev };
    },
    onSuccess: () => {
      toast.success(t('user_detail_toast_role_updated'));
      setRoleEdit(false);
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['crm', 'users', uid], ctx.prev);
      toast.error(t('user_detail_toast_role_update_failed'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm', 'users', uid] }),
  });

  const changePlanMutation = useMutation({
    mutationFn: (plan: string) => api.put(`/crm/users/${uid}/plan`, { plan }),
    onMutate: async (plan) => {
      await qc.cancelQueries({ queryKey: ['crm', 'users', uid] });
      const prev = qc.getQueryData<User>(['crm', 'users', uid]);
      qc.setQueryData<User>(['crm', 'users', uid], (old) =>
        old ? ({ ...old, subscription: { ...old.subscription, plan } } as User) : old,
      );
      return { prev };
    },
    onSuccess: () => {
      toast.success(t('user_detail_toast_plan_updated'));
      setPlanEdit(false);
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['crm', 'users', uid], ctx.prev);
      toast.error(t('user_detail_toast_plan_update_failed'));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['crm', 'users', uid] }),
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
        <p className="font-medium">{t('user_detail_not_found')}</p>
        <Link href="/crm/users">
          <Button variant="ghost" className="mt-4">{t('back_to_users')}</Button>
        </Link>
      </div>
    );
  }

  const plan = (user.subscription?.plan ?? 'free') as keyof typeof PLAN_CONFIGS;
  const planLimits = PLAN_CONFIGS[plan]?.limits ?? PLAN_CONFIGS.free.limits;
  const cvLimit = planLimits.cvs === 'unlimited' ? -1 : planLimits.cvs;
  const clLimit = planLimits.coverLetters === 'unlimited' ? -1 : planLimits.coverLetters;
  const exportLimit = planLimits.exports === 'unlimited' ? -1 : planLimits.exports;

  const initials = (user.displayName || user.email).split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const RoleIcon = ROLE_ICONS[user.role] ?? UserIcon;

  const stats = [
    {
      label: t('cvs_created'),
      value: user.usage?.cvsCreated ?? 0,
      icon: FileText,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: t('cover_letters'),
      value: user.usage?.coverLettersCreated ?? 0,
      icon: Briefcase,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    },
    {
      label: t('user_detail_stat_ai_credits_used'),
      value: user.usage?.aiCreditsUsed ?? 0,
      icon: Bot,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    },
    {
      label: t('user_detail_stat_exports_this_month'),
      value: user.usage?.exportsThisMonth ?? 0,
      icon: Download,
      color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/crm/users">
        <button className="flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t('back_to_users')}
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
              <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
                {user.displayName || t('user_detail_no_name')}
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
                  {t('user_detail_joined', { date: formatDate(user.createdAt) })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                  <RoleIcon className="h-3 w-3" />
                  {['user', 'admin', 'super_admin'].includes(user.role) ? t(`role_${user.role}`) : user.role.replace('_', ' ')}
                </span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', PLAN_COLORS[user.subscription?.plan ?? 'free'] ?? PLAN_COLORS.free)}>
                  {t('user_detail_plan_badge', { plan: ['free', 'pro', 'career_accelerator', 'enterprise'].includes(user.subscription?.plan ?? 'free') ? t(`plan_${user.subscription?.plan ?? 'free'}`) : (user.subscription?.plan ?? 'free') })}
                </span>
                <span className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  user.isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
                )}>
                  {user.isActive ? t('status_active') : t('status_suspended')}
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
                  if (confirm(t('user_detail_confirm_suspend', { email: user.email }))) suspendMutation.mutate();
                }}
              >
                {t('suspend')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCircle className="h-4 w-4" />}
                loading={reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate()}
              >
                {t('reactivate')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={resetUsageMutation.isPending}
              onClick={() => {
                if (confirm(t('user_detail_confirm_reset_usage'))) resetUsageMutation.mutate();
              }}
            >
              {t('user_detail_reset_usage')}
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('subscription')}</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600 dark:text-stone-400">{t('plan')}</span>
                <div className="flex items-center gap-2">
                  {planEdit ? (
                    <div className="flex gap-1">
                      {['free', 'pro', 'career_accelerator', 'enterprise'].map((p) => (
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
                          {t(`plan_${p}`)}
                        </button>
                      ))}
                      <button onClick={() => setPlanEdit(false)} className="ms-1 text-xs text-stone-400 hover:text-stone-600">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPlanEdit(true)}
                      className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize transition-opacity hover:opacity-70', PLAN_COLORS[user.subscription?.plan ?? 'free'])}
                    >
                      {['free', 'pro', 'career_accelerator', 'enterprise'].includes(user.subscription?.plan ?? 'free') ? t(`plan_${user.subscription?.plan ?? 'free'}`) : (user.subscription?.plan ?? 'free')}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600 dark:text-stone-400">{t('status')}</span>
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
                  <span className="text-sm text-stone-600 dark:text-stone-400">{t('user_detail_period_end')}</span>
                  <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {formatDate(user.subscription.currentPeriodEnd)}
                  </span>
                </div>
              )}
              {user.subscription?.stripeCustomerId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600 dark:text-stone-400">{t('user_detail_stripe_id')}</span>
                  <a
                    href={`https://dashboard.stripe.com/customers/${user.subscription.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs text-stone-500 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {user.subscription.stripeCustomerId.slice(0, 14)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </Card>

          {/* Role */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('role')}</h2>
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
                    {t(`role_${r}`)}
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
            <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('usage')}</h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={resetUsageMutation.isPending}
              onClick={() => {
                if (confirm(t('user_detail_confirm_reset_usage_monthly'))) resetUsageMutation.mutate();
              }}
            >
              {t('reset')}
            </Button>
          </div>
          <div className="space-y-5">
            <UsageMeter
              label={t('cvs_created')}
              used={user.usage?.cvsCreated ?? 0}
              limit={cvLimit}
            />
            <UsageMeter
              label={t('cover_letters')}
              used={user.usage?.coverLettersCreated ?? 0}
              limit={clLimit}
            />
            <UsageMeter
              label={t('user_detail_meter_ai_credits')}
              used={user.usage?.aiCreditsUsed ?? 0}
              limit={user.usage?.aiCreditsLimit ?? 5}
            />
            <UsageMeter
              label={t('user_detail_meter_exports')}
              used={user.usage?.exportsThisMonth ?? 0}
              limit={exportLimit}
            />
          </div>
        </Card>

        {/* Profile */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('profile')}</h2>
          <div className="space-y-3 text-sm">
            {[
              { label: t('first_name'), value: user.profile?.firstName },
              { label: t('last_name'), value: user.profile?.lastName },
              { label: t('headline'), value: user.profile?.headline },
              { label: t('location'), value: user.profile?.location },
              { label: t('website'), value: user.profile?.website },
              { label: t('linkedin'), value: user.profile?.linkedin },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex justify-between gap-4">
                  <span className="flex-shrink-0 text-stone-500 dark:text-stone-400">{label}</span>
                  <span className="truncate text-end font-medium text-stone-800 dark:text-stone-200">{value}</span>
                </div>
              ) : null,
            )}
            <div className="border-t border-stone-100 pt-3 dark:border-stone-800">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Clock className="h-3.5 w-3.5" />
                {t('user_detail_last_login', { date: formatDateTime(user.lastLoginAt) })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
