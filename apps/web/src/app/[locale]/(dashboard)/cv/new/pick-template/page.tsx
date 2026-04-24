'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Zap, Crown } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import TemplateCard from '@/components/cv-builder/TemplateCard';
import {
  CV,
  Template,
  TemplateCategory,
  SubscriptionPlan,
  type CVLayout,
} from '@flacroncv/shared-types';
import { CV_NEW_DRAFT_KEY as DRAFT_KEY } from '../constants';

/* ─── Constants ──────────────────────────────────────────────────────────────── */

const PLAN_ORDER: SubscriptionPlan[] = [
  SubscriptionPlan.FREE,
  SubscriptionPlan.PRO,
  SubscriptionPlan.ENTERPRISE,
];

const templateMeta: Record<string, { layout: CVLayout; color: string; personality: string }> = {
  classic:       { layout: 'classic',    color: '#1e3a5f', personality: 'Modern Minimal'          },
  modern:        { layout: 'sidebar',    color: '#2563eb', personality: 'Corporate Professional'   },
  minimal:       { layout: 'classic',    color: '#374151', personality: 'Clean & Simple'           },
  professional:  { layout: 'top-bar',   color: '#0f766e', personality: 'Creative Bold'            },
  creative:      { layout: 'top-bar',   color: '#7c3aed', personality: 'Creative Bold'            },
  executive:     { layout: 'compact',   color: '#0c0c0c', personality: 'Executive Dense'          },
  compact:       { layout: 'compact',   color: '#1d4ed8', personality: 'Executive Dense'          },
  'two-column':  { layout: 'sidebar',    color: '#059669', personality: 'Corporate Professional'   },
  academic:      { layout: 'classic',    color: '#6b21a8', personality: 'Clean & Simple'           },
  bold:          { layout: 'top-bar',   color: '#dc2626', personality: 'Creative Bold'            },
  'slate-gold':  { layout: 'slate-gold', color: '#C9A84C', personality: 'High-Impact Minimalist'  },
};

type TierFilter = 'all' | SubscriptionPlan;

/* ─── Skeleton ───────────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-2xl border-2 border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
      <div className="h-48 bg-stone-200 dark:bg-stone-700" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-4 w-full rounded bg-stone-200 dark:bg-stone-700" />
        <div className="h-5 w-16 rounded-full bg-stone-200 dark:bg-stone-700" />
        <div className="h-9 w-full rounded-lg bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function PickTemplatePage(): React.JSX.Element | null {
  const router = useRouter();
  const { user } = useAuth();
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [cvTitle, setCvTitle] = useState<string | null>(null);
  // Track which template ID is currently being created
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // Read the draft title from sessionStorage. If missing, the user navigated
  // here directly without completing step 1 — send them back.
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (!saved) { router.replace('/cv/new'); return; }
    try {
      const { title } = JSON.parse(saved) as { title: string };
      if (!title) { router.replace('/cv/new'); return; }
      setCvTitle(title);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
      router.replace('/cv/new');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    enabled: !!user,
  });

  const cvTemplates = templates?.filter((t) => t.category === TemplateCategory.CV) ?? [];

  const userPlan: SubscriptionPlan =
    (user?.subscription?.plan as SubscriptionPlan) ?? SubscriptionPlan.FREE;

  const canUseTemplate = (tmpl: Template): boolean =>
    PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(tmpl.tier as SubscriptionPlan);

  const availableTiers = Array.from(
    new Set(cvTemplates.map((t) => t.tier as SubscriptionPlan)),
  );

  const filteredTemplates = cvTemplates.filter(
    (t) => tierFilter === 'all' || t.tier === tierFilter,
  );

  const createMutation = useMutation({
    mutationFn: (data: { title: string; templateId: string }) =>
      api.post<CV>('/cvs', data),
    onSuccess: (cv) => {
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success('CV created! Opening editor…');
      router.push(`/cv/${cv.id}`);
    },
    onError: (error: Error) => {
      setCreatingId(null);
      toast.error(error.message || 'Failed to create CV. Please try again.');
    },
  });

  const handleSelect = (templateId: string) => {
    if (!cvTitle) return;
    setCreatingId(templateId);
    createMutation.mutate({ title: cvTitle, templateId });
  };

  if (!cvTitle) return null;

  const tierFilterOptions: { value: TierFilter; label: string }[] = [
    { value: 'all', label: 'All Templates' },
    ...availableTiers.map((tier) => ({
      value: tier as TierFilter,
      label: tier === SubscriptionPlan.FREE ? 'Free' :
             tier === SubscriptionPlan.PRO  ? 'Pro'  : 'Enterprise',
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 opacity-50">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">1</span>
          <span className="text-sm font-medium text-stone-500 dark:text-stone-400">CV Details</span>
        </div>
        <div className="h-px flex-1 bg-brand-300 dark:bg-brand-700" />
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">2</span>
          <span className="text-sm font-semibold text-stone-900 dark:text-white">Choose Template</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
            Choose a Template
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Creating:{' '}
            <span className="font-semibold text-stone-700 dark:text-stone-300">{cvTitle}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => router.push('/cv/new')}
        >
          Back
        </Button>
      </div>

      {/* Plan access banner */}
      {userPlan === SubscriptionPlan.FREE && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-900/20">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Free plan:</span> Free templates are available
              now. Upgrade to unlock Pro &amp; Enterprise templates.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300"
            onClick={() => router.push('/settings/billing')}
          >
            Upgrade
          </Button>
        </div>
      )}

      {userPlan === SubscriptionPlan.PRO && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800/60 dark:bg-brand-900/20">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 shrink-0 text-brand-500" />
            <p className="text-sm text-brand-800 dark:text-brand-300">
              <span className="font-semibold">Pro plan:</span> Free &amp; Pro templates are
              available. Upgrade to Enterprise for the full collection.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => router.push('/settings/billing')}
          >
            <Crown className="me-1.5 h-3.5 w-3.5" />
            Go Enterprise
          </Button>
        </div>
      )}

      {/* Tier filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {tierFilterOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTierFilter(value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
              tierFilter === value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-stone-500 dark:text-stone-400">No templates match this filter.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setTierFilter('all')}>
            Show all templates
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((tmpl) => {
            const meta = templateMeta[tmpl.slug] ?? {
              layout: 'classic' as CVLayout,
              color: '#374151',
              personality: 'Clean & Simple',
            };
            const tier = tmpl.tier as SubscriptionPlan;
            const isPro = tier !== SubscriptionPlan.FREE;
            const tierLabel =
              tier === SubscriptionPlan.ENTERPRISE ? 'Enterprise' :
              tier === SubscriptionPlan.PRO        ? 'Pro'        : 'Free';

            return (
              <TemplateCard
                key={tmpl.id}
                id={tmpl.id}
                name={tmpl.name}
                description={tmpl.description}
                layout={meta.layout}
                color={meta.color}
                personality={meta.personality}
                isPro={isPro}
                tierLabel={tierLabel}
                userCanAccess={canUseTemplate(tmpl)}
                isCreating={creatingId === tmpl.id && createMutation.isPending}
                isDisabled={createMutation.isPending}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
