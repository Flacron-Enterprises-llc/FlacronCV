'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Logo from '@/components/ui/Logo';
import { CONTROLLING_VERSION, type LegalBlock, type LegalDocument } from '@/legal/types';

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          return (
            <p key={i} className="text-base leading-relaxed text-stone-700 dark:text-stone-300">
              {block.text}
            </p>
          );
        }
        const List = block.type === 'ol' ? 'ol' : 'ul';
        const listClass =
          block.type === 'ol'
            ? 'list-decimal space-y-1 ps-6 text-base leading-relaxed text-stone-700 dark:text-stone-300'
            : 'list-disc space-y-1 ps-6 text-base leading-relaxed text-stone-700 dark:text-stone-300';
        return (
          <List key={i} className={listClass}>
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export default function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  const t = useTranslations();

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center" aria-label={t('legal.home')}>
        <Logo className="h-20" priority />
      </Link>

      <header className="mt-8 border-b border-stone-200 pb-6 dark:border-stone-800">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-3 text-sm font-medium text-brand-600 dark:text-brand-400">
          {t('legal.last_updated', { date: doc.lastUpdated })}
        </p>
        <p className="mt-3 text-sm italic leading-relaxed text-stone-600 dark:text-stone-400">
          {CONTROLLING_VERSION}
        </p>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <nav
          className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block"
          aria-label={t('legal.on_this_page')}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {t('legal.on_this_page')}
          </p>
          <ul className="mt-3 space-y-2 border-s-2 border-brand-200 ps-3 dark:border-brand-900">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#section-${s.id}`}
                  className="text-sm text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-400"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 space-y-8">
          <div className="space-y-3">
            <Blocks blocks={doc.preamble} />
          </div>

          {doc.sections.map((s) => (
            <section key={s.id} id={`section-${s.id}`} className="scroll-mt-24">
              <h2 className="mb-3 border-s-4 border-brand-500 ps-3 text-xl font-bold text-stone-900 dark:text-white">
                {s.title}
              </h2>
              <div className="space-y-3">
                <Blocks blocks={s.blocks} />
              </div>
            </section>
          ))}

          <div className="pt-4">
            <button
              type="button"
              onClick={() => {
                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t('legal.back_to_top')}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
