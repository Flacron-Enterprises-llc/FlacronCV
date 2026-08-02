'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Layout, Globe, Download, GripVertical, Target, BarChart2, Lightbulb } from 'lucide-react';
import { useInView } from '@/hooks/useInView';

export default function Features() {
  const t = useTranslations();
  const { ref: headingRef, isInView: headingInView } = useInView({ threshold: 0.2 });
  const { ref: gridRef, isInView: gridInView } = useInView({ threshold: 0.1 });

  const features = [
    { icon: Sparkles, key: 'ai_writing' },
    { icon: Layout, key: 'templates' },
    { icon: Globe, key: 'multilingual' },
    { icon: Download, key: 'export' },
    { icon: GripVertical, key: 'drag_drop' },
    { icon: Target, key: 'ats' },
    { icon: BarChart2, key: 'ats_score' },
    { icon: Lightbulb, key: 'role_based' },
  ];

  return (
    <section id="features" className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          ref={headingRef}
          className={`mx-auto max-w-2xl text-center transition-all duration-700 ${headingInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <h2 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">
            {t('features.subtitle')}
          </p>
        </div>

        <div ref={gridRef} className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map(({ icon: Icon, key }, index) => (
            <div
              key={key}
              className={`group relative rounded-xl border border-stone-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-brand-900 ${gridInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDuration: '500ms', transitionDelay: gridInView ? `${index * 100}ms` : '0ms' }}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-stone-900 dark:text-white">
                {t(`features.${key}`)}
              </h3>
              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                {t(`features.${key}_desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
