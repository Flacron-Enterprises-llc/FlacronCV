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
} from '@flacroncv/shared-types';

/* ─── Distinct visual mockups per template slug ─── */

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
      <div className="flex gap-1">
        <div className="flex-1 space-y-0.5">
          <div className="h-1 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="h-1 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-0.5 w-full rounded bg-stone-200 dark:bg-stone-700" />
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
        <div className="mt-1.5 h-1.5 w-1/2 rounded bg-stone-300 dark:bg-stone-600" />
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
      <div className="h-px w-full bg-stone-200 dark:bg-stone-700" />
      <div className="space-y-0.5">
        <div className="h-1.5 w-1/4 rounded bg-stone-400 dark:bg-stone-500" />
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
      <div className="flex gap-2 p-1">
        <div className="h-4 w-1 rounded-full bg-brand-400 dark:bg-brand-600" />
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-1/3 rounded bg-stone-400 dark:bg-stone-500" />
          <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-700" />
          <div className="h-1 w-4/5 rounded bg-stone-200 dark:bg-stone-700" />
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
                const Mockup = mockupMap[tmpl.slug] || (() => <MockupFallback />);

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
                    {/* Mockup preview */}
                    <div className="relative mb-2 h-28 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200/50 dark:bg-stone-900 dark:ring-stone-700/50">
                      <Mockup />
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                          <Lock className="h-5 w-5 text-white drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Name + tier */}
                    <p className="font-medium text-stone-900 dark:text-white">
                      {tmpl.name}
                    </p>
                    <div className="mt-1">
                      <Badge variant={tierVariantMap[tmpl.tier]} className="text-[10px]">
                        {tierLabelMap[tmpl.tier]}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-stone-500 dark:text-stone-400">
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
