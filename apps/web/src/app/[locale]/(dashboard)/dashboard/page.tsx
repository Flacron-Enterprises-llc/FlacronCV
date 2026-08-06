'use client';
import React from 'react';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import { Link } from '@/i18n/routing';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { PLAN_CONFIGS, SubscriptionPlan, User } from '@flacroncv/shared-types';
import {
  FileText,
  Mail,
  Sparkles,
  Download,
  Plus,
  ArrowRight,
  CreditCard,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

type Usage = User['usage'];

/** Thin usage bar shown under a stat when the plan limit is finite. */
function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700">
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Mirrors the real stat card's padding/icon size so there is no layout jump. */
function StatSkeleton() {
  return (
    <Card padding="sm">
      <div className="flex animate-pulse items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-stone-100 dark:bg-stone-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 rounded bg-stone-100 dark:bg-stone-700" />
          <div className="h-6 w-14 rounded bg-stone-100 dark:bg-stone-700" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage(): React.JSX.Element | null {
  const t = useTranslations('dashboard');
  const tPricing = useTranslations('pricing');
  const { user, degraded, refreshUser } = useAuth();

  const plan = (user?.subscription?.plan as SubscriptionPlan) || SubscriptionPlan.FREE;
  const planLimits = PLAN_CONFIGS[plan]?.limits ?? PLAN_CONFIGS[SubscriptionPlan.FREE].limits;
  // Every plan in the enum needs a translation key. `career_accelerator` was
  // missing from this list, so a Career Accelerator subscriber fell through to
  // the 'free' fallback and their dashboard reported the WRONG plan name.
  // PLAN_CONFIGS[plan].name is the last-resort fallback for any future plan.
  const planNameKey = ['free', 'pro', 'career_accelerator', 'enterprise'].includes(plan)
    ? plan
    : null;
  const planLabel = planNameKey ? tPricing(planNameKey) : PLAN_CONFIGS[plan]?.name || plan;

  // Live usage straight from the API — the auth-time snapshot goes stale as
  // soon as the user creates a CV or spends a credit elsewhere in the app.
  const {
    data: usage,
    isPending,
    isError,
    refetch,
  } = useQuery<Usage>({
    queryKey: ['me', 'usage'],
    queryFn: () => api.get<Usage>('/users/me/usage'),
    enabled: !degraded,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });

  const firstName = user?.profile?.firstName || user?.displayName?.split(' ')[0] || '';
  const aiLimit = usage?.aiCreditsLimit || planLimits.aiCredits;

  const stats = usage
    ? [
        {
          label: t('cvs_created'),
          // Spaced " / " (not "5/10") — the client asked for the full, readable
          // ratio, and the spaces also give the browser a wrap opportunity so a
          // narrow card breaks the value instead of clipping it.
          value:
            planLimits.cvs === 'unlimited'
              ? `${usage.cvsCreated || 0}`
              : `${usage.cvsCreated || 0} / ${planLimits.cvs}`,
          bar: planLimits.cvs === 'unlimited' ? null : { used: usage.cvsCreated || 0, limit: planLimits.cvs as number },
          icon: FileText,
          color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
        },
        {
          label: t('ai_credits'),
          value: `${usage.aiCreditsUsed || 0} / ${aiLimit}`,
          bar: { used: usage.aiCreditsUsed || 0, limit: aiLimit },
          icon: Sparkles,
          color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
        },
        {
          label: t('exports'),
          value:
            planLimits.exports === 'unlimited'
              ? `${usage.exportsThisMonth || 0}`
              : `${usage.exportsThisMonth || 0} / ${planLimits.exports}`,
          bar:
            planLimits.exports === 'unlimited'
              ? null
              : { used: usage.exportsThisMonth || 0, limit: planLimits.exports as number },
          icon: Download,
          color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
        },
        {
          label: t('plan'),
          value: planLabel,
          bar: null,
          icon: CreditCard,
          color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
        },
      ]
    : [];

  const quickActions = [
    {
      href: '/cv/new' as const,
      title: t('create_cv'),
      desc: t('create_cv_desc'),
      icon: Plus,
      color: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      href: '/cover-letters/new' as const,
      title: t('create_cover_letter'),
      desc: t('create_cover_letter_desc'),
      icon: Mail,
      color: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      href: '/templates' as const,
      title: t('templates'),
      desc: t('templates_desc'),
      icon: FileText,
      color: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {firstName ? t('greeting_named', { name: firstName }) : t('greeting')}
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {t('overview_subtitle')}
        </p>
      </div>

      {/* Account data unavailable — never present placeholder plan/usage as real */}
      {degraded ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-stone-900 dark:text-white">{t('degraded_title')}</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('degraded_desc')}</p>
            </div>
            <Button variant="secondary" onClick={() => refreshUser()}>
              <RefreshCw className="me-2 h-4 w-4" />
              {t('degraded_retry')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Stats */}
          {isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
          ) : isError ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:text-start">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                <p className="flex-1 text-sm text-stone-600 dark:text-stone-400">{t('stats_error')}</p>
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="me-2 h-4 w-4" />
                  {t('stats_retry')}
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} padding="sm">
                  {/* items-start, not items-center: with a wrapping value the
                      icon should stay aligned to the top of the text block. */}
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.color}`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-stone-600 dark:text-stone-400">{stat.label}</p>
                      {/* NO `truncate` here. Truncating clipped account figures to
                          "30/…" and the plan name to "Ent…". The value now steps
                          down a size on narrow cards and wraps rather than
                          ellipsing, so the full number and plan name always read.
                          `title` keeps the value available on hover regardless. */}
                      <p
                        title={stat.value}
                        className="text-xl font-bold leading-tight text-stone-900 [overflow-wrap:anywhere] sm:text-2xl dark:text-white"
                      >
                        {stat.value}
                      </p>
                      {stat.bar && <UsageBar used={stat.bar.used} limit={stat.bar.limit} />}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">{t('quick_actions')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map(({ href, title, desc, icon: Icon, color }) => (
            <Link key={href} href={href} className="group h-full focus:outline-none">
              {/* h-full on both: the Link is the grid item (stretches to the row),
                  so the Card must fill it or cards whose title wraps render taller
                  than their siblings. shrink-0 keeps the icon from being squeezed. */}
              <Card hover className="flex h-full items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                {/* min-w-0 is required: a flex item defaults to min-width:auto and
                    so refuses to shrink below its text's intrinsic width, pushing
                    the content outside the card. break-words also guards against a
                    single long word in other locales (e.g. German compounds). */}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words text-stone-900 dark:text-white">{title}</p>
                  <p className="text-xs break-words text-stone-500">{desc}</p>
                </div>
                <ArrowRight className="ms-auto h-5 w-5 shrink-0 text-stone-400 rtl:rotate-180" />
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Upgrade banner — free plan only, and never on placeholder data */}
      {!degraded && user?.subscription?.plan === 'free' && (
        <Card className="border-0 bg-gradient-to-br from-brand-600 to-brand-700 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold">{t('upgrade_title')}</h3>
              <p className="mt-1 text-sm text-white/90">{t('upgrade_desc')}</p>
            </div>
            <Link href="/settings/billing">
              <Button variant="secondary" className="whitespace-nowrap border-0 bg-white text-brand-700 hover:bg-brand-50">
                {t('upgrade_cta')}
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
