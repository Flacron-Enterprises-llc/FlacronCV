'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInView } from '@/hooks/useInView';

export default function FAQ() {
  const t = useTranslations();
  const [open, setOpen] = useState<number | null>(0);
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.1 });

  const questions = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
    { q: t('faq.q6'), a: t('faq.a6') },
  ];

  return (
    <section id="faq" className="py-16 sm:py-20">
      <div
        ref={sectionRef}
        className={`mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 transition-all duration-700 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            {t('faq.title')}
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {questions.map((item, index) => (
            <div
              key={index}
              className="rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800"
            >
              <button
                id={`faq-question-${index}`}
                className="flex w-full items-center justify-between px-6 py-4 text-start"
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span className="text-sm font-semibold text-stone-900 dark:text-white">
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 flex-shrink-0 text-stone-400 transition-transform',
                    open === index && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
              {open === index && (
                <div
                  id={`faq-answer-${index}`}
                  role="region"
                  aria-labelledby={`faq-question-${index}`}
                  className="px-6 pb-4"
                >
                  <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    {item.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
