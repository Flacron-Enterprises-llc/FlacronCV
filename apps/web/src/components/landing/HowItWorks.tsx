'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { UserCircle2, LayoutTemplate, Download, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useInView } from '@/hooks/useInView';
import { useAuth } from '@/providers/AuthProvider';

const steps = [
  {
    number: '01',
    icon: UserCircle2,
    titleKey: 'step1_title',
    descKey: 'step1_desc',
    color: 'from-brand-500 to-brand-600',
    bg: 'bg-brand-50 dark:bg-brand-950/40',
    border: 'border-brand-200 dark:border-brand-800',
  },
  {
    number: '02',
    icon: LayoutTemplate,
    titleKey: 'step2_title',
    descKey: 'step2_desc',
    color: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-200 dark:border-violet-800',
  },
  {
    number: '03',
    icon: Download,
    titleKey: 'step3_title',
    descKey: 'step3_desc',
    color: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
];

export default function HowItWorks() {
  const t = useTranslations('how_it_works');
  const { user } = useAuth();
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.05 });
  const ctaHref = user ? '/dashboard' : '/register';

  return (
    <section id="how-it-works" className="py-20 sm:py-28 bg-stone-50 dark:bg-stone-900/50">
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">
            {t('subtitle')}
          </p>
        </div>

        {/* Steps */}
        <div className="relative mt-16">
          {/* Connector line — desktop only */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-[52px] hidden h-px bg-gradient-to-r from-brand-200 via-violet-200 to-emerald-200 dark:from-brand-800 dark:via-violet-800 dark:to-emerald-800 lg:block"
            style={{ left: '16.666%', right: '16.666%' }}
          />

          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map(({ number, icon: Icon, titleKey, descKey, color, bg, border }, index) => (
              <div
                key={number}
                className={`relative flex flex-col items-center text-center transition-all duration-500 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                {/* Icon circle */}
                <div className="relative z-10 mb-6">
                  <div className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 ${border} ${bg}`}>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${color} text-white shadow-md`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                  {/* Step number badge */}
                  <span className={`absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${color} text-[10px] font-bold text-white shadow-sm`}>
                    {number}
                  </span>
                </div>

                {/* Content */}
                <h3 className="mb-2 text-lg font-bold text-stone-900 dark:text-white">
                  {t(titleKey)}
                </h3>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {t(descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link href={ctaHref}>
            <Button variant="gradient" size="lg" icon={<ArrowRight className="h-5 w-5" />}>
              {t('cta')}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
