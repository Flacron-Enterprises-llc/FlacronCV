'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Menu, X, Sun, Moon } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

interface NavbarProps {
  /** The homepage theme has a light header, so it uses the theme-aware logo. */
  logoVariant?: 'auto' | 'on-dark';
}

export default function Navbar({ logoVariant = 'on-dark' }: NavbarProps) {
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

  const locale = useLocale();

  /**
   * Home-page section links ("Features", "Pricing").
   *
   * They are plain <a href="/{locale}#id"> elements, not next-intl <Link>s.
   * From another page a client-side navigation to "/#id" sometimes did
   * nothing at all: the RSC request for the home page was aborted (the click
   * also closes the mobile menu and re-renders the bar) and the router never
   * reached the page or the hash. A document navigation cannot be dropped
   * that way, and the browser itself jumps to the fragment once the
   * server-rendered home page loads. The href carries the locale, so it never
   * bounces through the locale redirect.
   *
   * On the home page itself the click is intercepted and the section is
   * scrolled into view without a reload.
   */
  const sectionHref = (sectionId: string) => `/${locale}#${sectionId}`;
  const handleSectionLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    sectionId: string,
  ) => {
    setMobileOpen(false);
    const target = pathname === '/' ? document.getElementById(sectionId) : null;
    if (!target) return; // let the browser follow the href
    e.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    window.history.replaceState(window.history.state, '', `#${sectionId}`);
  };

  const navLinkClass = (href?: string) =>
    href && isCurrentPage(href)
      ? 'whitespace-nowrap text-sm font-medium text-brand-400 transition-colors dark:text-brand-400'
      : 'whitespace-nowrap text-sm font-medium text-stone-300 hover:text-brand-400 transition-colors dark:text-stone-400 dark:hover:text-brand-400';

  const mobileNavLinkClass = (href?: string) =>
    href && isCurrentPage(href)
      ? 'rounded-lg px-3 py-2 text-sm font-medium text-brand-400 bg-white/10 dark:text-brand-400 dark:bg-brand-950'
      : 'rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-white/10 dark:text-stone-400 dark:hover:bg-stone-800';

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-chrome dark:border-white/15 dark:bg-chrome/70 dark:backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center xl:me-6">
          {/* h-12 in an h-16 bar: the brand assets have generous internal padding,
              so a smaller height renders the wordmark almost illegibly.
              on-dark: this bar is navy in light and dark (translucent + blur in dark).
              The lockup still has a baked-in opaque black rectangle — standing
              asset request, see PROJECT_PROGRESS.md. */}
          <Logo variant={logoVariant} className="h-12" priority />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-5 xl:flex 2xl:gap-8">
          <a
            href={sectionHref('features')}
            onClick={(e) => handleSectionLink(e, 'features')}
            className={navLinkClass()}
          >
            {t('nav.features')}
          </a>
          <a
            href={sectionHref('pricing')}
            onClick={(e) => handleSectionLink(e, 'pricing')}
            className={navLinkClass()}
          >
            {t('nav.pricing')}
          </a>
          <Link href="/templates" aria-current={isCurrentPage('/templates') ? 'page' : undefined} className={navLinkClass('/templates')}>
            {t('nav.templates')}
          </Link>
          <Link href="/testimonials" aria-current={isCurrentPage('/testimonials') ? 'page' : undefined} className={navLinkClass('/testimonials')}>
            {t('footer.testimonials')}
          </Link>
          <Link href="/about-us" aria-current={isCurrentPage('/about-us') ? 'page' : undefined} className={navLinkClass('/about-us')}>
            {t('footer.about')}
          </Link>
          <Link href="/contact-us" aria-current={isCurrentPage('/contact-us') ? 'page' : undefined} className={navLinkClass('/contact-us')}>
            {t('footer.contact')}
          </Link>
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center shrink-0 gap-2 xl:flex">
          <LanguageSwitcher />
          <button
            className="rounded-lg p-2 text-stone-300 hover:bg-white/10 dark:text-stone-400 dark:hover:bg-stone-800"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {user ? (
            <Link href="/dashboard">
              <Button variant="primary" className="whitespace-nowrap">{t('nav.dashboard')}</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button
                  variant="ghost"
                  className="whitespace-nowrap text-stone-300 hover:bg-white/10 hover:text-white dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                  {t('nav.login')}
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" className="whitespace-nowrap">{t('nav.signup')}</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          ref={mobileToggleRef}
          className="rounded-lg p-2 text-stone-300 hover:bg-white/10 xl:hidden dark:text-stone-400"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? t('common.close_menu') : t('common.open_menu')}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-chrome px-4 py-4 xl:hidden dark:border-white/10 dark:bg-chrome">
          <div className="flex flex-col gap-1">
            <a
              href={sectionHref('features')}
              onClick={(e) => handleSectionLink(e, 'features')}
              className={mobileNavLinkClass()}
            >
              {t('nav.features')}
            </a>
            <a
              href={sectionHref('pricing')}
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
              href="/testimonials"
              aria-current={isCurrentPage('/testimonials') ? 'page' : undefined}
              className={mobileNavLinkClass('/testimonials')}
              onClick={() => setMobileOpen(false)}
            >
              {t('footer.testimonials')}
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
                className="rounded-lg p-2 text-stone-300 hover:bg-white/10 dark:text-stone-400 dark:hover:bg-stone-800"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label={resolvedTheme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <LanguageSwitcher />
            </div>

            <hr className="border-white/10 dark:border-stone-700" />

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
