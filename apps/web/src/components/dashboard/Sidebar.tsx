'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import {
  LayoutDashboard,
  FileText,
  Mail,
  Palette,
  Briefcase,
  Settings,
  HelpCircle,
  CreditCard,
  ChevronsLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Mobile drawer open state (below `lg`). */
  open: boolean;
  onClose: () => void;
  /** Desktop rail state (`lg` and up). Ignored on mobile, where the drawer
   *  always shows full labels. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ open, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: t('title') },
    { href: '/cv', icon: FileText, label: t('my_cvs') },
    { href: '/cover-letters', icon: Mail, label: t('my_cover_letters') },
    { href: '/jobs', icon: Briefcase, label: t('job_tracker') },
    { href: '/templates', icon: Palette, label: t('templates') },
  ];

  const bottomItems = [
    { href: '/settings', icon: Settings, label: t('settings') },
    { href: '/settings/billing', icon: CreditCard, label: t('billing') },
    { href: '/support', icon: HelpCircle, label: t('support') },
  ];

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Only the most specific matching item is active, so /settings/billing
  // highlights Billing without also highlighting Settings.
  const activeHref = [...navItems, ...bottomItems]
    .filter(({ href }) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => (
    <Link
      href={href}
      onClick={onClose}
      aria-current={href === activeHref ? 'page' : undefined}
      // Native tooltip is the affordance that replaces the hidden label on the rail.
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
        href === activeHref
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200',
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {/* sr-only (not hidden) on the rail so screen readers still announce the
          destination — the label is only *visually* removed. */}
      <span className={cn('truncate', collapsed && 'lg:sr-only')}>{label}</span>
    </Link>
  );

  return (
    <>
      {/* Overlay starts below the navy TopBar so the header stays visible. */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar sits under the full-width TopBar (`top-16` on mobile). The
          closed-state transform must flip with writing direction. */}
      <aside
        className={cn(
          'fixed bottom-0 start-0 top-16 z-50 flex w-64 flex-col border-e border-stone-200 bg-white transition-[transform,width] duration-200 lg:static lg:top-auto lg:translate-x-0 dark:border-stone-700 dark:bg-stone-900',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0',
          // Rail width applies only from `lg` up; the mobile drawer stays 16rem.
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
        )}
      >
        {/* Collapse (desktop) + close (mobile). Logo lives in TopBar. */}
        <div
          className={cn(
            'flex items-center justify-end border-b border-stone-200 px-3 py-2 dark:border-stone-700',
            collapsed ? 'lg:justify-center lg:px-2' : 'lg:justify-start',
          )}
        >
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? tCommon('expand_sidebar') : tCommon('collapse_sidebar')}
              aria-expanded={!collapsed}
              title={collapsed ? tCommon('expand_sidebar') : tCommon('collapse_sidebar')}
              className="hidden rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 lg:flex dark:hover:bg-stone-800 dark:hover:text-stone-300"
            >
              <ChevronsLeft
                className={cn(
                  'h-5 w-5 transition-transform',
                  collapsed ? 'rotate-180 rtl:rotate-0' : 'rtl:rotate-180',
                )}
              />
            </button>
          )}

          <button
            type="button"
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 lg:hidden dark:hover:bg-stone-800"
            onClick={onClose}
            aria-label={tCommon('close_menu')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label={tCommon('main_navigation')} className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="border-t border-stone-200 p-3 dark:border-stone-700">
          {bottomItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
      </aside>
    </>
  );
}
