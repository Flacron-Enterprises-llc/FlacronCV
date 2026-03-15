'use client';
import React from 'react';

import { useState, useMemo, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  Lock,
  Star,
  Sparkles,
  LogIn,
  LayoutTemplate,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import {
  Template,
  TemplateCategory,
  SubscriptionPlan,
} from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';

/* ─── Constants ─── */

type CategoryFilter = 'all' | TemplateCategory;
type TierFilter = 'all' | SubscriptionPlan;

const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

const tierVariantMap: Record<SubscriptionPlan, 'success' | 'brand' | 'warning'> = {
  [SubscriptionPlan.FREE]: 'success',
  [SubscriptionPlan.PRO]: 'brand',
  [SubscriptionPlan.ENTERPRISE]: 'warning',
};

const tierLabelMap: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Free',
  [SubscriptionPlan.PRO]: 'Pro',
  [SubscriptionPlan.ENTERPRISE]: 'Enterprise',
};

const categoryLabelMap: Record<TemplateCategory, string> = {
  [TemplateCategory.CV]: 'CV',
  [TemplateCategory.COVER_LETTER]: 'Cover Letter',
};

/* ─── Mockup components (reused from cv/new/page) ─── */

function MockupModern() {
  return (
    <div className="flex h-full w-full gap-1 p-2">
      <div className="w-1/3 space-y-1.5 rounded bg-brand-100 p-1.5 dark:bg-brand-900/40">
        <div className="h-4 w-4 rounded-full bg-brand-300 dark:bg-brand-700" />
        <div className="h-1 w-full rounded bg-brand-200 dark:bg-brand-800" />
        <div className="h-1 w-3/4 rounded bg-brand-200 dark:bg-brand-800" />
        <div className="mt-2 h-1 w-full rounded bg-brand-200 dark:bg-brand-800" />
        <div className="h-1 w-2/3 rounded bg-brand-200 dark:bg-brand-800" />
      </div>
      <div className="flex-1 space-y-1.5 p-1">
        <div className="h-2 w-3/4 rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-5/6 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="mt-2 h-1.5 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupClassic() {
  return (
    <div className="flex h-full w-full flex-col items-center space-y-1.5 p-3">
      <div className="h-2.5 w-2/3 rounded bg-stone-400 dark:bg-stone-500" />
      <div className="h-1 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
      <div className="h-px w-full bg-stone-300 dark:bg-stone-600" />
      <div className="w-full space-y-1">
        <div className="h-1.5 w-1/3 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
      <div className="h-px w-full bg-stone-300 dark:bg-stone-600" />
      <div className="w-full space-y-1">
        <div className="h-1.5 w-1/4 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-5/6 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupMinimal() {
  return (
    <div className="flex h-full w-full flex-col space-y-3 p-4">
      <div className="h-2 w-1/3 rounded bg-stone-300 dark:bg-stone-600" />
      <div className="h-1 w-1/4 rounded bg-stone-200 dark:bg-stone-700" />
      <div className="mt-4 space-y-2">
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-1/2 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupProfessional() {
  return (
    <div className="flex h-full w-full flex-col p-2">
      <div className="mb-2 rounded bg-brand-500 p-1.5 dark:bg-brand-600">
        <div className="h-2 w-1/2 rounded bg-white/80" />
        <div className="mt-0.5 h-1 w-1/3 rounded bg-white/50" />
      </div>
      <div className="flex flex-1 gap-1.5">
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-2/3 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-2/3 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
        </div>
      </div>
    </div>
  );
}

function MockupCreative() {
  return (
    <div className="relative flex h-full w-full p-2">
      <div className="absolute end-0 top-0 h-1/2 w-1/3 rounded-bl-2xl bg-brand-400/30 dark:bg-brand-600/30" />
      <div className="z-10 flex-1 space-y-1.5 p-1.5">
        <div className="h-3 w-3/4 rounded bg-brand-400 dark:bg-brand-600" />
        <div className="h-1 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
        <div className="mt-3 h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="mt-2 flex gap-1">
          <div className="h-2 w-8 rounded-full bg-brand-200 dark:bg-brand-800" />
          <div className="h-2 w-6 rounded-full bg-brand-200 dark:bg-brand-800" />
          <div className="h-2 w-10 rounded-full bg-brand-200 dark:bg-brand-800" />
        </div>
      </div>
    </div>
  );
}

function MockupExecutive() {
  return (
    <div className="flex h-full w-full flex-col p-2">
      <div className="mb-2 rounded bg-stone-800 p-2 dark:bg-stone-200">
        <div className="h-2.5 w-2/3 rounded bg-white/90 dark:bg-stone-800" />
        <div className="mt-1 h-1 w-1/3 rounded bg-white/50 dark:bg-stone-600" />
      </div>
      <div className="space-y-1.5 p-1">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1/4 rounded bg-brand-500" />
          <div className="h-px flex-1 bg-stone-300 dark:bg-stone-600" />
        </div>
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-5/6 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="flex items-center gap-1.5 pt-1">
          <div className="h-1.5 w-1/4 rounded bg-brand-500" />
          <div className="h-px flex-1 bg-stone-300 dark:bg-stone-600" />
        </div>
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupCompact() {
  return (
    <div className="flex h-full w-full flex-col space-y-0.5 p-1.5">
      <div className="flex items-center gap-1">
        <div className="h-2 w-1/3 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-1/4 rounded bg-stone-300 dark:bg-stone-600" />
      </div>
      <div className="h-px w-full bg-stone-300 dark:bg-stone-600" />
      <div className="flex gap-1">
        <div className="flex-1 space-y-0.5">
          <div className="h-1 w-2/3 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="h-1 w-2/3 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
        </div>
      </div>
    </div>
  );
}

function MockupTwoColumn() {
  return (
    <div className="flex h-full w-full gap-1 p-2">
      <div className="w-2/5 space-y-1.5 rounded bg-stone-100 p-1.5 dark:bg-stone-800">
        <div className="h-3 w-3 rounded-full bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-full rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="mt-1.5 h-1.5 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="flex gap-0.5">
          <div className="h-1.5 w-6 rounded-full bg-brand-200 dark:bg-brand-800" />
          <div className="h-1.5 w-5 rounded-full bg-brand-200 dark:bg-brand-800" />
        </div>
      </div>
      <div className="flex-1 space-y-1.5 p-1">
        <div className="h-2 w-2/3 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="mt-1.5 h-1.5 w-1/3 rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupAcademic() {
  return (
    <div className="flex h-full w-full flex-col space-y-1.5 p-3">
      <div className="h-2 w-1/2 rounded bg-stone-400 dark:bg-stone-500" />
      <div className="h-1 w-1/3 rounded bg-stone-300 dark:bg-stone-600" />
      <div className="h-px w-full bg-stone-200 dark:bg-stone-700" />
      <div className="space-y-0.5">
        <div className="h-1.5 w-1/4 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-5/6 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
      <div className="h-px w-full bg-stone-200 dark:bg-stone-700" />
      <div className="space-y-0.5">
        <div className="h-1.5 w-1/3 rounded bg-stone-400 dark:bg-stone-500" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

function MockupBold() {
  return (
    <div className="flex h-full w-full flex-col p-2">
      <div className="mb-1.5 rounded-lg bg-brand-500 p-2.5 dark:bg-brand-600">
        <div className="h-3 w-3/4 rounded bg-white/90" />
        <div className="mt-1 h-1.5 w-1/2 rounded bg-white/60" />
      </div>
      <div className="flex gap-2 p-1">
        <div className="h-4 w-1 rounded-full bg-brand-400 dark:bg-brand-600" />
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-1/2 rounded bg-stone-400 dark:bg-stone-500" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-5/6 rounded bg-stone-200 dark:bg-stone-700" />
        </div>
      </div>
    </div>
  );
}

function MockupFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center p-3">
      <div className="w-14 space-y-1">
        <div className="h-1.5 w-full rounded bg-stone-300 dark:bg-stone-600" />
        <div className="h-1 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-1 w-1/2 rounded bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

const mockupMap: Record<string, () => ReactNode> = {
  modern: () => <MockupModern />,
  classic: () => <MockupClassic />,
  minimal: () => <MockupMinimal />,
  professional: () => <MockupProfessional />,
  creative: () => <MockupCreative />,
  executive: () => <MockupExecutive />,
  compact: () => <MockupCompact />,
  'two-column': () => <MockupTwoColumn />,
  academic: () => <MockupAcademic />,
  bold: () => <MockupBold />,
};

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <Card padding="none" className="animate-pulse overflow-hidden">
      <div className="h-48 bg-stone-200 dark:bg-stone-700" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="flex gap-2">
          <div className="h-5 w-14 rounded-full bg-stone-200 dark:bg-stone-700" />
          <div className="h-5 w-14 rounded-full bg-stone-200 dark:bg-stone-700" />
        </div>
        <div className="h-9 w-full rounded-lg bg-stone-200 dark:bg-stone-700" />
      </div>
    </Card>
  );
}

/* ─── Main page ─── */
export default function PublicTemplatesPage(): React.JSX.Element {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['public-templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    retry: 1,
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter((tmpl) => {
      if (categoryFilter !== 'all' && tmpl.category !== categoryFilter) return false;
      if (tierFilter !== 'all' && tmpl.tier !== tierFilter) return false;
      return true;
    });
  }, [templates, categoryFilter, tierFilter]);

  const userPlan = user?.subscription?.plan || SubscriptionPlan.FREE;

  const canUseTemplate = (template: Template): boolean => {
    if (!user) return false;
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
    return planOrder.indexOf(userPlan) >= planOrder.indexOf(template.tier);
  };

  const handleUseTemplate = (template: Template) => {
    if (!user) {
      // Save pending template to localStorage, then redirect to login
      try {
        localStorage.setItem(
          PENDING_TEMPLATE_KEY,
          JSON.stringify({ templateId: template.id, category: template.category }),
        );
      } catch {
        // localStorage unavailable — proceed anyway
      }
      toast.info('Please sign in to use this template.');
      router.push('/login');
      return;
    }

    if (!canUseTemplate(template)) {
      toast.error(t('templates.upgradePlanMessage'));
      router.push('/settings/billing');
      return;
    }

    if (template.category === TemplateCategory.CV) {
      router.push(`/cv/new?template=${template.id}`);
    } else {
      router.push(`/cover-letters/new?template=${template.id}`);
    }
  };

  const categoryTabs: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: t('templates.allTemplates') },
    { value: TemplateCategory.CV, label: t('templates.cvTemplates') },
    { value: TemplateCategory.COVER_LETTER, label: t('templates.coverLetterTemplates') },
  ];

  const tierOptions: { value: TierFilter; label: string }[] = [
    { value: 'all', label: t('templates.allTiers') },
    { value: SubscriptionPlan.FREE, label: t('templates.free') },
    { value: SubscriptionPlan.PRO, label: t('templates.pro') },
    { value: SubscriptionPlan.ENTERPRISE, label: t('templates.enterprise') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {t('public_templates.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            {t('public_templates.subtitle')}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Category tabs */}
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50">
            {categoryTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setCategoryFilter(tab.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  categoryFilter === tab.value
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tier filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-600 dark:text-stone-400">
              {t('templates.tier')}:
            </span>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as TierFilter)}
              className="input-field py-1.5 text-sm"
            >
              {tierOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <Card className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutTemplate className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
              {t('common.error')}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
              Could not load templates. Please try again later.
            </p>
          </Card>
        ) : filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTemplates.map((template) => {
              const isLocked = user ? !canUseTemplate(template) : false;
              const Mockup = mockupMap[template.slug] ?? (() => <MockupFallback />);

              return (
                <Card
                  key={template.id}
                  padding="none"
                  hover
                  className="group overflow-hidden"
                >
                  {/* Thumbnail */}
                  <div className="relative">
                    <div className="relative h-52 overflow-hidden bg-white dark:bg-stone-950">
                      <Mockup />

                      {/* Lock overlay */}
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
                          <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white">
                            <Lock className="h-4 w-4" />
                            {tierLabelMap[template.tier]}
                          </div>
                        </div>
                      )}

                      {/* Featured badge */}
                      {template.isFeatured && (
                        <div className="absolute end-3 top-3">
                          <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                            <Star className="h-3 w-3 fill-current" />
                            {t('templates.featured')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="flex flex-col justify-between gap-3 p-4" style={{ minHeight: '120px' }}>
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-semibold text-stone-900 dark:text-white">
                          {template.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                          {template.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">{categoryLabelMap[template.category]}</Badge>
                        <Badge variant={tierVariantMap[template.tier]}>
                          {tierLabelMap[template.tier]}
                        </Badge>
                      </div>
                    </div>

                    {/* Action button */}
                    {!user ? (
                      <Button
                        className="w-full"
                        variant="primary"
                        size="sm"
                        icon={<LogIn className="h-4 w-4" />}
                        onClick={() => handleUseTemplate(template)}
                      >
                        {t('public_templates.login_to_use')}
                      </Button>
                    ) : isLocked ? (
                      <Button
                        className="w-full"
                        variant="secondary"
                        size="sm"
                        icon={<Lock className="h-4 w-4" />}
                        onClick={() => handleUseTemplate(template)}
                      >
                        {t('public_templates.buy_template')}
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant="primary"
                        size="sm"
                        icon={<Sparkles className="h-4 w-4" />}
                        onClick={() => handleUseTemplate(template)}
                      >
                        {t('public_templates.use_template')}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutTemplate className="mb-4 h-12 w-12 text-stone-300 dark:text-stone-600" />
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
              {t('templates.noTemplates')}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
              {t('templates.noTemplatesDescription')}
            </p>
            {(categoryFilter !== 'all' || tierFilter !== 'all') && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setCategoryFilter('all');
                  setTierFilter('all');
                }}
              >
                {t('templates.clearFilters')}
              </Button>
            )}
          </Card>
        )}
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200 bg-gradient-to-br from-brand-600 to-brand-700 dark:border-stone-800">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">
            {t('public_templates.cta_title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-200">
            {t('public_templates.cta_subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {user ? (
              <Link href="/cv/new">
                <Button
                  variant="secondary"
                  size="lg"
                  icon={<ArrowRight className="h-5 w-5" />}
                  className="bg-white text-brand-600 hover:bg-brand-50"
                >
                  {t('dashboard.create_cv')}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/register">
                  <Button
                    size="lg"
                    icon={<CheckCircle className="h-5 w-5" />}
                    className="bg-white text-brand-600 hover:bg-brand-50"
                  >
                    {t('public_templates.cta_btn')}
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" size="lg" className="text-white hover:bg-white/10">
                    {t('public_templates.cta_login')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
