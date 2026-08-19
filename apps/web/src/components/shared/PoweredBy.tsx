'use client';

import { useTranslations } from 'next-intl';

/**
 * TODO: point this at the real Flacron Engine page when the client supplies it.
 * The interim target is the parent-company site so the link is never a dead `#`.
 * This is the ONLY place the URL appears — the landing footer, the auth panel and
 * the dashboard all render this component.
 */
const FLACRON_ENGINE_URL = 'https://flacronenterprises.com/';

/**
 * "Powered by Flacron Engine". Deliberately quieter than the copyright it sits
 * next to (§57): the prefix is one step down in colour, while the brand itself
 * keeps enough contrast to read as a link rather than disabled text.
 *
 * `tone="dark"` is for permanently dark surfaces (auth panel near-black, and
 * the light-mode navy `chrome` footer) where the light palette would fail AA.
 */
export default function PoweredBy({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const t = useTranslations();

  const prefixClass = tone === 'dark' ? 'text-stone-300' : 'text-stone-400 dark:text-stone-500';
  const linkClass =
    tone === 'dark'
      ? 'font-medium text-stone-200 transition-colors hover:text-brand-400'
      : 'font-medium text-stone-500 transition-colors hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-400';

  return (
    <p className={`text-xs ${prefixClass}`}>
      {t('footer.powered_by')}{' '}
      <a
        href={FLACRON_ENGINE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {t('footer.powered_by_engine')}
      </a>
    </p>
  );
}
