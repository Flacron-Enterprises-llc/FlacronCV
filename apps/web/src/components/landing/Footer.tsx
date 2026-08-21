'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import Logo from '@/components/ui/Logo';
import NewsletterSignup from '@/components/shared/NewsletterSignup';
import SocialLinks from '@/components/shared/SocialLinks';
import PoweredBy from '@/components/shared/PoweredBy';
import { openPreferences } from '@/lib/consent';

/** Tel: needs E.164; the displayed number is the translated `footer.phone`. */
const PHONE_HREF = 'tel:+19299901182';

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

  const linkClass = 'text-sm text-stone-300 hover:text-brand-400 dark:text-stone-400 dark:hover:text-brand-400 transition-colors';

  return (
    <footer className="border-t border-chrome bg-chrome dark:border-white/15 dark:bg-chrome">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Newsletter opt-in (Epic C2) */}
        <div className="mb-10 border-b border-white/10 pb-10 dark:border-stone-800">
          <NewsletterSignup />
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center">
              <Logo variant="on-dark" className="h-8" />
            </Link>
            <p className="mt-3 text-sm text-stone-300 dark:text-stone-400">
              {t('footer.description')}
            </p>
            <h3 className="mt-6 text-sm font-semibold text-white">
              {t('footer.follow_us')}
            </h3>
            <div className="mt-3">
              <SocialLinks />
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-white">
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
            <h3 className="text-sm font-semibold text-white">
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
            <h3 className="text-sm font-semibold text-white">
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
              <li>
                <Link href="/disclaimer" className={linkClass}>
                  {t('footer.disclaimer')}
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className={linkClass}>
                  {t('footer.refund')}
                </Link>
              </li>
              {/* A button, not a link: it reopens the consent manager rather than
                  navigating. Withdrawing consent has to stay as easy to reach as
                  giving it was, which means permanently and from every page. */}
              <li>
                <button type="button" onClick={openPreferences} className={`${linkClass} text-start`}>
                  {t('footer.cookie_preferences')}
                </button>
              </li>
            </ul>
          </div>

          {/* Account — static links. A signed-out visitor following Dashboard or
              Billing is redirected to sign-in, which is the normal flow; making
              the column auth-aware would pull the auth provider into a public
              layout for no real gain. */}
          <div>
            <h3 className="text-sm font-semibold text-white">
              {t('footer.account')}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/login" className={linkClass}>
                  {t('footer.sign_in')}
                </Link>
              </li>
              <li>
                <Link href="/register" className={linkClass}>
                  {t('footer.create_account')}
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className={linkClass}>
                  {t('footer.dashboard')}
                </Link>
              </li>
              <li>
                <Link href="/settings/billing" className={linkClass}>
                  {t('footer.billing')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact + parent company */}
        <div className="mt-10 grid gap-8 border-t border-white/10 pt-8 sm:grid-cols-2 dark:border-stone-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {t('footer.contact_heading')}
            </h3>
            <address className="mt-3 space-y-1 text-sm not-italic text-stone-300 dark:text-stone-400">
              <p>{t('footer.address')}</p>
              <p>
                <a href={PHONE_HREF} className={linkClass}>
                  {t('footer.phone')}
                </a>
              </p>
              <p>
                <a href={`mailto:${t('footer.email')}`} className={linkClass}>
                  {t('footer.email')}
                </a>
              </p>
            </address>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">
              {t('footer.parent_heading')}
            </h3>
            <div className="mt-3 space-y-1 text-sm text-stone-300 dark:text-stone-400">
              <p>
                <a
                  href="https://flacronenterprises.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {t('footer.parent_company')}
                </a>
              </p>
              <p>
                <a href={`mailto:${t('footer.parent_email')}`} className={linkClass}>
                  {t('footer.parent_email')}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 border-t border-white/10 pt-8 sm:flex-row sm:justify-between dark:border-stone-800">
          <p className="text-xs text-stone-300 dark:text-stone-400">
            &copy; {new Date().getFullYear()} FlacronCV. {t('footer.rights')}
          </p>
          <PoweredBy tone="dark" />
        </div>
      </div>
    </footer>
  );
}
