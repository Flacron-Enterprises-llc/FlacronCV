'use client';

import { useTranslations } from 'next-intl';

export type PublicTemplateId = 'classic' | 'sidebar' | 'compact';

export function CvTemplatePreview({ template }: { template: PublicTemplateId }) {
  const t = useTranslations('career.home');
  const lines = [t('sample_experience'), t('sample_education'), t('sample_skills')];

  if (template === 'sidebar') {
    return (
      <article className="overflow-hidden rounded-lg border border-career-line bg-white shadow-sm">
        <p className="border-b border-career-line bg-career-wash px-3 py-2 text-xs font-semibold uppercase tracking-wide text-career-muted">{t('template_sidebar')}</p>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)]">
          <div className="bg-career-navy px-2 py-3 text-[0.65rem] text-white">
            <p className="font-semibold">{t('sample_name')}</p>
            <p className="mt-2 opacity-80">{t('sample_skills')}</p>
          </div>
          <div className="px-3 py-3">
            <p className="text-sm font-semibold text-career-navy">{t('sample_role')}</p>
            <p className="mt-1 text-[0.7rem] leading-5 text-career-muted">{t('sample_summary')}</p>
            <ul className="mt-2 space-y-1 text-[0.7rem] text-career-navy">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    );
  }

  if (template === 'compact') {
    return (
      <article className="overflow-hidden rounded-lg border border-career-line bg-white shadow-sm">
        <p className="border-b border-career-line bg-career-wash px-3 py-2 text-xs font-semibold uppercase tracking-wide text-career-muted">{t('template_compact')}</p>
        <div className="px-3 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-career-navy">{t('sample_name')}</p>
            <p className="text-[0.65rem] text-career-muted">{t('sample_role')}</p>
          </div>
          <p className="mt-1 text-[0.65rem] leading-4 text-career-muted">{t('sample_summary')}</p>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[0.65rem] text-career-navy">
            {lines.map((line) => (
              <p key={line} className="truncate border border-career-line px-1 py-0.5">
                {line}
              </p>
            ))}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg border border-career-line bg-white shadow-sm">
      <p className="border-b border-career-line bg-career-wash px-3 py-2 text-xs font-semibold uppercase tracking-wide text-career-muted">{t('template_classic')}</p>
      <div className="px-3 py-4 text-center">
        <p className="text-sm font-semibold text-career-navy">{t('sample_name')}</p>
        <p className="text-[0.7rem] text-career-orange-text">{t('sample_role')}</p>
        <p className="mt-2 text-[0.7rem] leading-5 text-career-muted">{t('sample_summary')}</p>
        <ul className="mt-3 space-y-1 text-start text-[0.7rem] text-career-navy">
          {lines.map((line) => (
            <li key={line} className="border-t border-career-line pt-1">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
