'use client';
import React from 'react';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import { Link } from '@/i18n/routing';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { FileText, Mail, Sparkles, Download, Plus, ArrowRight } from 'lucide-react';

export default function DashboardPage(): React.JSX.Element | null {
  const t = useTranslations('dashboard');
  const { user } = useAuth();

  const stats = [
    {
      label: t('cvs_created'),
      value: user?.usage?.cvsCreated || 0,
      icon: FileText,
      color: 'text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-400',
    },
    {
      label: t('ai_credits'),
      value: `${user?.usage?.aiCreditsUsed || 0}/${user?.usage?.aiCreditsLimit || 5}`,
      icon: Sparkles,
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
    },
    {
      label: t('exports'),
      value: user?.usage?.exportsThisMonth || 0,
      icon: Download,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      label: t('plan'),
      value: user?.subscription?.plan?.toUpperCase() || 'FREE',
      icon: Mail,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
          {t('welcome')}, {user?.profile?.firstName || user?.displayName || 'there'}!
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Here&apos;s an overview of your FlacronCV account.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-stone-600 dark:text-stone-400">{stat.label}</p>
                <p className="text-2xl font-bold text-stone-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">{t('quick_actions')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/cv/new">
            <Card hover className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 dark:text-white">{t('create_cv')}</p>
                <p className="text-xs text-stone-500">Start from scratch or use a template</p>
              </div>
              <ArrowRight className="ms-auto h-5 w-5 text-stone-400" />
            </Card>
          </Link>

          <Link href="/cover-letters/new">
            <Card hover className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 dark:text-white">{t('create_cover_letter')}</p>
                <p className="text-xs text-stone-500">Generate with AI or write manually</p>
              </div>
              <ArrowRight className="ms-auto h-5 w-5 text-stone-400" />
            </Card>
          </Link>

          <Link href="/templates">
            <Card hover className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 dark:text-white">{t('templates')}</p>
                <p className="text-xs text-stone-500">Browse professional templates</p>
              </div>
              <ArrowRight className="ms-auto h-5 w-5 text-stone-400" />
            </Card>
          </Link>
        </div>
      </div>

      {/* Upgrade banner for free users */}
      {user?.subscription?.plan === 'free' && (
        <Card className="bg-gradient-to-r from-brand-600 to-violet-600 text-white border-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold">Unlock the full power of FlacronCV</h3>
              <p className="mt-1 text-sm text-brand-100">
                Upgrade to Pro for unlimited CVs, AI credits, and premium templates.
              </p>
            </div>
            <Link href="/settings/billing">
              <Button variant="secondary" className="bg-white text-brand-700 hover:bg-brand-50 border-0 whitespace-nowrap">
                Upgrade to Pro
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
