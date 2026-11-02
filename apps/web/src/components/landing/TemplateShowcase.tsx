'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { TemplateCategory, type Template } from '@flacroncv/shared-types';
import { Link } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useInView } from '@/hooks/useInView';
import { localizedTemplateField } from '@/lib/localized-template';
import { CvThumb, LetterThumb, letterTemplateId } from './showcase/DocumentThumb';
import { IconArrowRight, IconCheck, IconLayers, TINT } from './HeroV2Icons';

/**
 * "Template showcase" ported from V2's showcase strip, on V1's own catalog.
 *
 * Counts and names come from the same public `GET /templates` the gallery
 * (/templates) uses, so they always match what a visitor can open there. If the
 * catalog cannot be loaded, the counts are left out rather than guessed.
 * Previews are the real V1 renderers with sample content. Choosing a template
 * happens in the gallery, which already keeps that choice through sign-in.
 * Export claims mirror PLAN_CONFIGS: PDF on every plan, DOCX on paid plans.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-stone-950';

const CV_PREFERENCE = ['professional', 'modern', 'classic', 'creative', 'executive', 'two-column', 'compact', 'minimal'];
const LETTER_PREFERENCE = ['cl-modern', 'cl-classic', 'cl-corporate', 'cl-executive', 'cl-creative', 'cl-minimalist'];

function careerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_ENABLED?.trim() === 'true';
}

function pick(templates: Template[], category: TemplateCategory, order: string[], count: number): Template[] {
  const pool = templates.filter((tpl) => tpl.category === category);
  const ranked = [...pool].sort((a, b) => {
    const ia = order.indexOf(a.slug);
    const ib = order.indexOf(b.slug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ranked.slice(0, count);
}

export function showcaseSelection(templates: Template[] | undefined) {
  const active = (templates ?? []).filter((tpl) => tpl.isActive !== false);
  const cvs = active.filter((tpl) => tpl.category === TemplateCategory.CV);
  const letters = active.filter(
    (tpl) => tpl.category === TemplateCategory.COVER_LETTER,
  );
  return {
    cvCount: cvs.length,
    letterCount: letters.length,
    cvPicks: pick(active, TemplateCategory.CV, CV_PREFERENCE, 4),
    letterPick: pick(
      letters.filter((tpl) => letterTemplateId(tpl.slug) !== null),
      TemplateCategory.COVER_LETTER,
      LETTER_PREFERENCE,
      1,
    )[0],
  };
}

export default function TemplateShowcase() {
  const t = useTranslations('home_showcase');
  const locale = useLocale();
  const { ref, isInView } = useInView({ threshold: 0.08 });
  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['public-templates'],
    queryFn: () => api.get<Template[]>('/templates'),
    retry: 1,
    staleTime: 5 * 60_000,
  });
  const { cvCount, letterCount, cvPicks, letterPick } = showcaseSelection(templates);
  const items = [
    ...cvPicks.map((tpl) => ({ tpl, kind: 'cv' as const })),
    ...(letterPick ? [{ tpl: letterPick, kind: 'letter' as const }] : []),
  ];
  const reveal = `transition-all duration-700 ease-out motion-reduce:transition-none ${
    isInView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
  }`;

  return (
    <section id="templates-showcase" aria-labelledby="templates-showcase-title" className="bg-career-canvas py-16 sm:py-20">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 rounded-3xl border border-career-line bg-career-wash p-5 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] lg:gap-10 lg:p-10">
          <div className={`min-w-0 ${reveal}`}>
            <span aria-hidden="true" className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${TINT.violet}`}>
              <IconLayers className="h-6 w-6" />
            </span>
            <h2 id="templates-showcase-title" className="mt-4 text-2xl font-bold leading-snug tracking-tight text-career-ink sm:text-3xl">
              {t('templates_title')}
            </h2>
            <p className="mt-3 text-sm leading-6 text-career-muted sm:text-base sm:leading-7">{t('templates_lede')}</p>
            {templates && !isError && cvCount > 0 ? (
              <p className="mt-4 text-sm font-semibold text-career-ink">
                {t('templates_count', { cv: cvCount, letters: letterCount })}
              </p>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm text-career-ink">
              {(['benefit_pdf', 'benefit_docx', 'benefit_tiers'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-career-success" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            {careerEnabled() ? <p className="mt-4 text-xs leading-5 text-career-muted">{t('templates_career_note')}</p> : null}
            <Link
              href="/templates"
              className={`group mt-6 inline-flex min-h-[3rem] items-center gap-2 rounded-md bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-800 motion-reduce:transition-none ${FOCUS}`}
            >
              {t('templates_cta')}
              <IconArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </div>

          <div className="min-w-0">
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-wide text-career-muted">{t('sample_content')}</p>
            {isLoading ? (
              <ul aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className={`${i === 4 ? 'hidden lg:block' : ''}`}>
                    <div className="aspect-[794/1123] w-full animate-pulse rounded-lg bg-career-line motion-reduce:animate-none" />
                    <div className="mx-auto mt-2 h-3 w-2/3 animate-pulse rounded bg-career-line motion-reduce:animate-none" />
                  </li>
                ))}
              </ul>
            ) : items.length > 0 ? (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                {items.map(({ tpl, kind }, index) => {
                  const name = localizedTemplateField(tpl.nameLocalized, tpl.name, locale);
                  const typeLabel = kind === 'cv' ? t('type_cv') : t('type_letter');
                  return (
                    <li
                      key={tpl.id}
                      className={`min-w-0 ${index === 4 ? 'hidden lg:block' : ''} ${reveal}`}
                      style={{ transitionDelay: `${index * 70}ms` }}
                    >
                      <figure className="m-0">
                        <div className="overflow-hidden rounded-lg border border-career-line shadow-sm">
                          {kind === 'cv' ? (
                            <CvThumb slug={tpl.slug} label={t('preview_alt', { name, type: typeLabel })} />
                          ) : (
                            <LetterThumb slug={tpl.slug} label={t('preview_alt', { name, type: typeLabel })} />
                          )}
                        </div>
                        <figcaption className="mt-2 text-center">
                          <span className="block truncate text-xs font-semibold text-career-ink">{name}</span>
                          <span className="block text-[0.7rem] text-career-muted">{typeLabel}</span>
                        </figcaption>
                      </figure>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-career-line p-6 text-center text-sm text-career-muted">
                {t('templates_unavailable')}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
