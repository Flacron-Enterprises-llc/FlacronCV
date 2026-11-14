'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Briefcase,
  Calculator,
  Code2,
  GraduationCap,
  HeartPulse,
  Megaphone,
  Palette,
  Repeat,
  School,
  UtensilsCrossed,
  Wrench,
  Crown,
  Pause,
  Play,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/routing';

/**
 * Auto-scrolling "who it's for" strip under the hero, modelled on the industries
 * marquee on flacronenergy.com (CSS-only loop, edge fade, pause on hover/focus).
 *
 * Improvements over the reference:
 *  - a visible pause/play button (WCAG 2.2.2: moving content longer than 5 s
 *    must be stoppable without a mouse);
 *  - the loop is exactly seamless (each copy carries its own trailing gap, so
 *    -50% lands on the start of the second copy) and runs the other way in RTL;
 *  - with reduced motion the list is shown once, wrapped and centred.
 * Styles: `.fc-marquee*` in styles/home-theme.css.
 */

const AUDIENCES: Array<{ key: string; Icon: LucideIcon }> = [
  { key: 'students', Icon: GraduationCap },
  { key: 'changers', Icon: Repeat },
  { key: 'tech', Icon: Code2 },
  { key: 'healthcare', Icon: HeartPulse },
  { key: 'engineering', Icon: Wrench },
  { key: 'sales', Icon: Megaphone },
  { key: 'finance', Icon: Calculator },
  { key: 'education', Icon: School },
  { key: 'hospitality', Icon: UtensilsCrossed },
  { key: 'creative', Icon: Palette },
  { key: 'business', Icon: Briefcase },
  { key: 'executives', Icon: Crown },
];

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-stone-950';

function Pills({ hidden }: { hidden?: boolean }) {
  const t = useTranslations('home_marquee');
  return (
    <ul className={`fc-marquee-copy${hidden ? ' fc-marquee-dup' : ''}`} aria-hidden={hidden || undefined}>
      {AUDIENCES.map(({ key, Icon }) => (
        <li key={key} className="fc-marquee-pill">
          <span aria-hidden="true" className="fc-marquee-icon">
            <Icon className="h-4 w-4" />
          </span>
          <span className="whitespace-nowrap">{t(`items.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HomeMarquee() {
  const t = useTranslations('home_marquee');
  const [paused, setPaused] = useState(false);

  return (
    <section aria-labelledby="audience-title" className="fc-marquee-section border-y border-career-line py-10 sm:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <h2
          id="audience-title"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-career-muted sm:text-sm"
        >
          {t('eyebrow')}
        </h2>
        <div className="flex items-center gap-4">
          <Link
            href="/templates"
            className={`fc-marquee-link rounded text-sm font-semibold text-career-ink ${FOCUS}`}
          >
            {t('link')}
          </Link>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? t('play') : t('pause')}
            title={paused ? t('play') : t('pause')}
            className={`fc-marquee-toggle inline-flex h-8 w-8 items-center justify-center rounded-full border border-career-line text-career-muted transition-colors hover:text-career-ink ${FOCUS}`}
          >
            {paused ? <Play aria-hidden="true" className="h-3.5 w-3.5" /> : <Pause aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className={`fc-marquee mt-6${paused ? ' is-paused' : ''}`}>
        <div className="fc-marquee-track">
          <Pills />
          <Pills hidden />
        </div>
      </div>
    </section>
  );
}
