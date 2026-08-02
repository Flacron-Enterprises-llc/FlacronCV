'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import Logo from '@/components/ui/Logo';
import NewsletterSignup from '@/components/shared/NewsletterSignup';

export default function Footer() {
  const t = useTranslations();
  const pathname = usePathname();

  const handleSectionLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    if (pathname === '/') {
      e.preventDefault();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  };

  const linkClass = 'text-sm text-stone-500 hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-400 transition-colors';

  return (
    <footer className="border-t border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Newsletter opt-in (Epic C2) */}
        <div className="mb-10 border-b border-stone-200 pb-10 dark:border-stone-800">
          <NewsletterSignup />
        </div>
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center">
              <Logo className="h-8" />
            </Link>
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              {t('footer.description')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
              {t('footer.product')}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="/#features"
                  onClick={(e) => handleSectionLink(e, 'features')}
                  className={linkClass}
                >
                  {t('nav.features')}
                </a>
              </li>
              <li>
                <a
                  href="/#pricing"
                  onClick={(e) => handleSectionLink(e, 'pricing')}
                  className={linkClass}
                >
                  {t('nav.pricing')}
                </a>
              </li>
              <li>
                <Link href="/templates" className={linkClass}>
                  {t('nav.templates')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
              {t('footer.company')}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/about-us" className={linkClass}>
                  {t('footer.about')}
                </Link>
              </li>
              <li>
                <Link href="/contact-us" className={linkClass}>
                  {t('footer.contact')}
                </Link>
              </li>
              <li>
                <a
                  href="https://flacronenterprises.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {t('footer.parent_company')}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
              {t('footer.legal')}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/privacy-policy" className={linkClass}>
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link href="/terms-of-service" className={linkClass}>
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link href="/cookie-policy" className={linkClass}>
                  {t('footer.cookies')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-stone-200 pt-8 dark:border-stone-800">
          <p className="text-center text-xs text-stone-500 dark:text-stone-400">
            &copy; {new Date().getFullYear()} FlacronCV. {t('footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
