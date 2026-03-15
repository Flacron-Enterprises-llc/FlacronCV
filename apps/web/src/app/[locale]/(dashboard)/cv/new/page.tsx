'use client';
import React from 'react';

import { useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import {
  CV,
  Template,
  TemplateCategory,
  SubscriptionPlan,
  type CVLayout,
} from '@flacroncv/shared-types';

/* ─── Layout + personality mapping per template slug ─── */

// Maps template slug → { layout, primaryColor, personality label }
const templateMeta: Record<string, { layout: CVLayout; color: string; personality: string }> = {
  classic:      { layout: 'classic',  color: '#1e3a5f', personality: 'Modern Minimal'         },
  modern:       { layout: 'sidebar',  color: '#2563eb', personality: 'Corporate Professional'  },
  minimal:      { layout: 'classic',  color: '#374151', personality: 'Clean & Simple'          },
  professional: { layout: 'top-bar',  color: '#0f766e', personality: 'Creative Bold'           },
  creative:     { layout: 'top-bar',  color: '#7c3aed', personality: 'Creative Bold'           },
  executive:    { layout: 'compact',  color: '#0c0c0c', personality: 'Executive Dense'         },
  compact:      { layout: 'compact',  color: '#1d4ed8', personality: 'Executive Dense'         },
  'two-column': { layout: 'sidebar',  color: '#059669', personality: 'Corporate Professional'  },
  academic:     { layout: 'classic',  color: '#6b21a8', personality: 'Clean & Simple'          },
  bold:         { layout: 'top-bar',  color: '#dc2626', personality: 'Creative Bold'           },
};

function LayoutPreview({ layout, color }: { layout: CVLayout; color: string }) {
  if (layout === 'sidebar') return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-[32%] p-1.5 flex flex-col gap-1" style={{ background: color }}>
        <div className="h-4 w-4 rounded-full mx-auto" style={{ background: 'rgba(255,255,255,0.35)' }} />
        {[80,60,90,70,55].map((w,i) => <div key={i} className="h-1 rounded" style={{ width:`${w}%`, background:'rgba(255,255,255,0.3)' }} />)}
      </div>
      <div className="flex-1 p-1.5 bg-white flex flex-col gap-1">
        {[70,90,60,80,50,75,65].map((w,i) => <div key={i} className="h-1.5 rounded bg-stone-200" style={{ width:`${w}%` }} />)}
      </div>
    </div>
  );

  if (layout === 'top-bar') return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="px-2 py-2 flex items-center gap-1.5" style={{ background: color }}>
        <div className="h-5 w-5 rounded flex-shrink-0" style={{ background:'rgba(255,255,255,0.3)' }} />
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="h-2 w-2/3 rounded" style={{ background:'rgba(255,255,255,0.85)' }} />
          <div className="h-1 w-1/2 rounded" style={{ background:'rgba(255,255,255,0.5)' }} />
        </div>
      </div>
      <div className="flex-1 bg-white p-1.5 flex flex-col gap-1">
        {[80,60,90,55,75].map((w,i) => <div key={i} className="h-1.5 rounded bg-stone-200" style={{ width:`${w}%` }} />)}
      </div>
    </div>
  );

  if (layout === 'compact') return (
    <div className="flex h-full w-full flex-col bg-white p-1.5 gap-1 overflow-hidden">
      <div className="flex items-center gap-1.5 pb-1" style={{ borderBottom:`2px solid ${color}` }}>
        <div className="h-2.5 w-1/3 rounded" style={{ background: color }} />
        <div className="h-1.5 w-1/4 rounded bg-stone-300" />
      </div>
      <div className="flex gap-1.5 flex-1">
        <div className="flex-[3] flex flex-col gap-0.5">
          {[90,70,80,60,75].map((w,i) => <div key={i} className="h-1.5 rounded bg-stone-200" style={{ width:`${w}%` }} />)}
        </div>
        <div className="flex-[2] flex flex-col gap-0.5">
          {[85,65,75,50,80].map((w,i) => <div key={i} className="h-1.5 rounded bg-stone-100" style={{ width:`${w}%` }} />)}
        </div>
      </div>
    </div>
  );

  // classic (default)
  return (
    <div className="flex h-full w-full flex-col bg-white items-center p-2 gap-1 overflow-hidden">
      <div className="h-2.5 w-1/2 rounded" style={{ background: color }} />
      <div className="h-1 w-1/3 rounded bg-stone-300" />
      <div className="w-full mt-1" style={{ borderTop:`2px solid ${color}` }} />
      {[90,70,80,55,75,60].map((w,i) => <div key={i} className="h-1.5 rounded bg-stone-200" style={{ width:`${w}%` }} />)}
    </div>
  );
}

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

export default function NewCVPage(): React.JSX.Element | null {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    enabled: !!user,
  });

  const cvTemplates = templates?.filter(
    (t) => t.category === TemplateCategory.CV,
  );

  // Pre-select from ?template= query param or first template
  useEffect(() => {
    if (!cvTemplates?.length) return;
    if (selectedTemplate) return;

    const fromParam = searchParams.get('template');
    if (fromParam && cvTemplates.some((t) => t.id === fromParam || t.slug === fromParam)) {
      setSelectedTemplate(fromParam);
    } else {
      setSelectedTemplate(cvTemplates[0].slug);
    }
  }, [cvTemplates, searchParams, selectedTemplate]);

  const userPlan = user?.subscription?.plan || SubscriptionPlan.FREE;

  const canUseTemplate = (template: Template): boolean => {
    const planOrder = [SubscriptionPlan.FREE, SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE];
    return planOrder.indexOf(userPlan as SubscriptionPlan) >= planOrder.indexOf(template.tier);
  };

  const createMutation = useMutation({
    mutationFn: (data: { title: string; templateId: string }) =>
      api.post<CV>('/cvs', data),
    onSuccess: (cv) => {
      toast.success('CV created!');
      router.push(`/cv/${cv.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    const tmpl = cvTemplates?.find(
      (t) => t.slug === selectedTemplate || t.id === selectedTemplate,
    );
    if (tmpl && !canUseTemplate(tmpl)) {
      toast.error('Please upgrade your plan to use this template');
      return;
    }
    createMutation.mutate({ title: title.trim(), templateId: selectedTemplate });
  };

  const handleSelectTemplate = (template: Template) => {
    if (!canUseTemplate(template)) {
      toast.error('Please upgrade your plan to use this template');
      return;
    }
    setSelectedTemplate(template.slug);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('dashboard.create_cv')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <Input
            id="title"
            label="CV Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Software Engineer CV 2025"
            required
          />
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            Choose a Template
          </h3>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border-2 border-stone-200 p-3 dark:border-stone-700">
                  <div className="mb-2 h-24 rounded-lg bg-stone-200 dark:bg-stone-700" />
                  <div className="h-4 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
                  <div className="mt-1.5 h-3 w-1/3 rounded bg-stone-200 dark:bg-stone-700" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cvTemplates?.map((tmpl) => {
                const isSelected =
                  selectedTemplate === tmpl.slug || selectedTemplate === tmpl.id;
                const isLocked = !canUseTemplate(tmpl);
                const meta = templateMeta[tmpl.slug] || { layout: 'classic' as CVLayout, color: '#374151', personality: 'Clean & Simple' };

                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    className={cn(
                      'relative rounded-xl border-2 p-3 text-start transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950'
                        : isLocked
                          ? 'border-stone-200 opacity-75 dark:border-stone-700'
                          : 'border-stone-200 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600',
                    )}
                  >
                    {/* Layout preview */}
                    <div className="relative mb-2 h-28 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200/50 dark:bg-stone-900 dark:ring-stone-700/50">
                      <LayoutPreview layout={meta.layout} color={meta.color} />
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                          <Lock className="h-5 w-5 text-white drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Name + tier + personality */}
                    <p className="font-medium text-stone-900 dark:text-white">
                      {tmpl.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant={tierVariantMap[tmpl.tier]} className="text-[10px]">
                        {tierLabelMap[tmpl.tier]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                      {meta.personality}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-stone-500 dark:text-stone-400">
                      {tmpl.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Create CV
          </Button>
        </div>
      </form>
    </div>
  );
}
