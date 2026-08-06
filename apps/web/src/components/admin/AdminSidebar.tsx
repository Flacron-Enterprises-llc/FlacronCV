'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import {
  BarChart3,
  Users,
  CreditCard,
  Layout,
  MessageSquare,
  FileSearch,
  ArrowLeft,
  X,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const navItems = [
    { href: '/admin', icon: BarChart3, label: t('dashboard') },
    { href: '/admin/users', icon: Users, label: t('users') },
    { href: '/admin/subscriptions', icon: CreditCard, label: t('subscriptions') },
    { href: '/admin/templates', icon: Layout, label: t('templates') },
    { href: '/admin/tickets', icon: MessageSquare, label: t('tickets') },
    { href: '/admin/audit-logs', icon: FileSearch, label: t('audit_logs') },
  ];

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const NavLink = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }) => (
    <Link
      href={href}
      onClick={onClose}
      aria-current={isActive(href) ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive(href)
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200',
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {label}
    </Link>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar — the closed-state transform must flip with the writing
          direction, or the drawer stays partially on-screen in RTL. */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-stone-200 bg-white transition-transform lg:static lg:translate-x-0 dark:border-stone-700 dark:bg-stone-900',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-stone-200 px-4 dark:border-stone-700">
          <Link href="/admin" className="flex items-center">
            <Logo className="h-8" />
          </Link>
          <button
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 lg:hidden dark:hover:bg-stone-800"
            onClick={onClose}
            aria-label={tCommon('close_menu')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Admin badge */}
        <div className="mx-3 mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          {t('title')}
        </div>

        {/* Nav */}
        <nav aria-label={tCommon('main_navigation')} className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        {/* Back to Dashboard */}
        <div className="border-t border-stone-200 p-3 dark:border-stone-700">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <ArrowLeft className="h-5 w-5 flex-shrink-0 rtl:rotate-180" />
            {t('back_to_dashboard')}
          </Link>
        </div>
      </aside>
    </>
  );
}
