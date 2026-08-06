'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { User, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const t = useTranslations('settings');
  const pathname = usePathname();

  const navItems = [
    {
      href: '/settings' as const,
      label: t('nav.profile'),
      icon: User,
      exact: true,
    },
    {
      href: '/settings/billing' as const,
      label: t('nav.billing'),
      icon: CreditCard,
      exact: false,
    },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold text-stone-900 dark:text-white">
        {t('title')}
      </h1>

      {/* Mobile tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50 md:hidden">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-stone-700 dark:text-brand-400'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white',
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Desktop sidebar */}
        <nav className="hidden w-56 shrink-0 md:block">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white',
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content area */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
