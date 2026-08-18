'use client';

import { useTranslations } from 'next-intl';

/**
 * Parent-company social accounts (these are Flacron Enterprises' channels, not
 * FlacronCV-specific ones).
 *
 * Platform names are DATA, not copy: they are interpolated into
 * `footer.social_aria` so the sentence around them still translates while the
 * brand itself stays as written. Keeping them out of the locale files also
 * keeps six untranslatable proper nouns out of the parity and untranslated-value
 * gates.
 *
 * LinkedIn is deliberately absent. The URL the client supplied points at
 * `/admin/dashboard/`, which shows a visitor a login wall rather than a company
 * page. Add it here once the public company URL is confirmed — see Q-7 in
 * CLIENT_REQUIREMENTS.md.
 *
 * TODO(design): these render as text links. Official brand marks need exact SVG
 * path data, and `lucide-react` 0.309 ships none of Pinterest, TikTok, Bluesky
 * or the current X mark — so an icon set means either a new dependency or paths
 * from the brand owner. An approximated logo is worse than a word, so this ships
 * as words until we have the real marks; swap the label for an icon then.
 */
const ACCOUNTS = [
  { platform: 'Pinterest', href: 'https://www.pinterest.com/rodrigue0435' },
  { platform: 'X', href: 'https://x.com/flacron14958' },
  { platform: 'Bluesky', href: 'https://bsky.app/profile/flacronenterprises.bsky.social' },
  { platform: 'YouTube', href: 'https://www.youtube.com/@FlacronEnterprises' },
  { platform: 'TikTok', href: 'https://www.tiktok.com/@flacronenterprises' },
  { platform: 'Instagram', href: 'https://www.instagram.com/flacronenterprisesllc/' },
] as const;

export default function SocialLinks() {
  const t = useTranslations();

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-2">
      {ACCOUNTS.map(({ platform, href }) => (
        <li key={platform}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('footer.social_aria', { platform })}
            className="rounded-md px-2 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200 transition-colors hover:text-brand-600 hover:ring-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-stone-300 dark:ring-stone-700 dark:hover:text-brand-400 dark:hover:ring-brand-700"
          >
            {platform}
          </a>
        </li>
      ))}
    </ul>
  );
}
