'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Menu, X, Sun, Moon } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

export default function Navbar() {
  const t = useTranslations();
  const { user } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  // While the mobile menu is open: lock page scroll and close on Escape,
  // returning focus to the toggle so keyboard users are not stranded.
  useEffect(() => {
    if (!mobileOpen) return;
    // Lock the root element — viewport scrolling is driven by <html>, and
    // overflow set only on <body> does not reliably lock it.
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        mobileToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const isCurrentPage = (href: string) => pathname === href;

  /**
   * When already on `/`, smooth-scroll to the section.
   * When on any other page, navigate to `/#hash` so the browser
   * lands on the homepage and jumps to the section automatically.
   */
  const handleSectionLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    if (pathname === '/') {
      e.preventDefault();
      setMobileOpen(false);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    // else: let the browser follow href="/#sectionId" normally
  };

  const navLinkClass = (href?: string) =>
    href && isCurrentPage(href)
      ? 'text-sm font-medium text-brand-600 transition-colors dark:text-brand-400'
      : 'text-sm font-medium text-stone-600 hover:text-brand-600 transition-colors dark:text-stone-400 dark:hover:text-brand-400';

  const mobileNavLinkClass = (href?: string) =>
    href && isCurrentPage(href)
      ? 'rounded-lg px-3 py-2 text-sm font-medium text-brand-600 bg-brand-50 dark:text-brand-400 dark:bg-brand-950'
      : 'rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800';

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-stone-200/70 bg-white/80 backdrop-blur-lg dark:border-stone-800/80 dark:bg-stone-950/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          {/* h-12 in an h-16 bar: the brand assets have generous internal padding,
              so a smaller height renders the wordmark almost illegibly. */}
          <Logo className="h-12" priority />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          <a
            href="/#features"
            onClick={(e) => handleSectionLink(e, 'features')}
            className={navLinkClass()}
          >
            {t('nav.features')}
          </a>
          <a
            href="/#pricing"
            onClick={(e) => handleSectionLink(e, 'pricing')}
            className={navLinkClass()}
          >
            {t('nav.pricing')}
          </a>
          <Link href="/templates" aria-current={isCurrentPage('/templates') ? 'page' : undefined} className={navLinkClass('/templates')}>
            {t('nav.templates')}
          </Link>
          <Link href="/about-us" aria-current={isCurrentPage('/about-us') ? 'page' : undefined} className={navLinkClass('/about-us')}>
            {t('footer.about')}
          </Link>
          <Link href="/contact-us" aria-current={isCurrentPage('/contact-us') ? 'page' : undefined} className={navLinkClass('/contact-us')}>
            {t('footer.contact')}
          </Link>
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <button
            className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {user ? (
            <Link href="/dashboard">
              <Button variant="primary">{t('nav.dashboard')}</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost">{t('nav.login')}</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary">{t('nav.signup')}</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          ref={mobileToggleRef}
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 md:hidden dark:text-stone-400"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t('common.close_menu') : t('common.open_menu')}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-stone-200 bg-white px-4 py-4 md:hidden dark:border-stone-700 dark:bg-black">
          <div className="flex flex-col gap-1">
            <a
              href="/#features"
              onClick={(e) => handleSectionLink(e, 'features')}
              className={mobileNavLinkClass()}
            >
              {t('nav.features')}
            </a>
            <a
              href="/#pricing"
              onClick={(e) => handleSectionLink(e, 'pricing')}
              className={mobileNavLinkClass()}
            >
              {t('nav.pricing')}
            </a>
            <Link
              href="/templates"
              aria-current={isCurrentPage('/templates') ? 'page' : undefined}
              className={mobileNavLinkClass('/templates')}
              onClick={() => setMobileOpen(false)}
            >
              {t('nav.templates')}
            </Link>
            <Link
              href="/about-us"
              aria-current={isCurrentPage('/about-us') ? 'page' : undefined}
              className={mobileNavLinkClass('/about-us')}
              onClick={() => setMobileOpen(false)}
            >
              {t('footer.about')}
            </Link>
            <Link
              href="/contact-us"
              aria-current={isCurrentPage('/contact-us') ? 'page' : undefined}
              className={mobileNavLinkClass('/contact-us')}
              onClick={() => setMobileOpen(false)}
            >
              {t('footer.contact')}
            </Link>

            <div className="flex items-center justify-between rounded-lg px-3 py-2">
              <button
                className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label={resolvedTheme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <LanguageSwitcher />
            </div>

            <hr className="border-stone-200 dark:border-stone-700" />

            {user ? (
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                <Button variant="primary" className="w-full">{t('nav.dashboard')}</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="secondary" className="w-full">{t('nav.login')}</Button>
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" className="w-full">{t('nav.signup')}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
