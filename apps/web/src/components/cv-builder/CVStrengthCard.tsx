'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, CheckCircle2, Plus } from 'lucide-react';
import { useCVStore } from '@/store/cv-store';
import { cvStrength, type StrengthSection } from '@/lib/cv-strength';
import { cn } from '@/lib/utils';
import { hasSampleSummary, stripSampleItems } from './sample-content';

const OPEN_KEY = 'fcv.cvStrength.open';
const RING = { starter: '#dc2626', good: '#d97706', strong: '#65a30d', complete: '#059669' } as const;

/** Circular progress ring with the score in the middle. */
function Ring({ score, color }: { score: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-stone-200 dark:stroke-stone-700" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
      />
      <text x="28" y="28" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-navy text-[15px] font-black dark:fill-white" style={{ transformOrigin: '28px 28px' }}>
        {score}
      </text>
    </svg>
  );
}

/**
 * "CV strength" at the top of the editor: how complete the CV is and the next
 * steps that would raise it most. Updates live as the person types. It checks
 * completeness only — it never judges the writing.
 */
export default function CVStrengthCard() {
  const t = useTranslations('cv_builder.strength');
  const cv = useCVStore((s) => s.cv);
  const sections = useCVStore((s) => s.sections);
  // Score the person's own content: a template's untouched example career does not count.
  const strength = useMemo(() => {
    if (!cv) return cvStrength(null, []);
    const stripped = new Map(stripSampleItems(sections).map((c) => [c.id, c.items]));
    const own = sections.map((sec) => (stripped.has(sec.id) ? { ...sec, items: stripped.get(sec.id)! } : sec));
    const personal = hasSampleSummary(cv) ? { ...cv.personalInfo, summary: '' } : cv.personalInfo;
    return cvStrength(personal, own as unknown as StrengthSection[]);
  }, [cv, sections]);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved !== null) setOpen(saved === '1');
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  if (!cv) return null;
  const { score, band, tips } = strength;
  const listId = 'cv-strength-tips';

  return (
    <section className="mb-4 rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-stone-50 p-4 dark:border-stone-700 dark:from-stone-900 dark:to-stone-900/60" aria-label={t('title')}>
      <div className="flex items-center gap-4">
        <Ring score={score} color={RING[band]} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t('title')}</p>
          <p className="text-lg font-black text-navy dark:text-white">
            {t(`band_${band}`)} <span className="sr-only">— {score}/100</span>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">{t('note')}</p>
        </div>
        {tips.length > 0 ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={listId}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:bg-brand-950/40"
          >
            {open ? t('toggle_hide') : t('toggle_show')}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
        ) : (
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        )}
      </div>

      {tips.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">{t('complete_msg')}</p>
      ) : open ? (
        <div id={listId} className="mt-4 border-t border-stone-200 pt-3 dark:border-stone-700">
          <p className="mb-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{t('next_steps')}</p>
          <ul className="space-y-1.5">
            {tips.slice(0, 3).map((tip) => (
              <li key={tip.key} className="flex items-center gap-2.5 text-sm text-stone-700 dark:text-stone-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="flex-1">{t(`tip_${tip.key}`)}</span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t('points', { points: tip.points })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
