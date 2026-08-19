'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import {
  LayoutDashboard,
  Users,
  Target,
  DollarSign,
  ArrowLeft,
  Monitor,
  Shield,
  Settings,
  UserCog,
  CreditCard,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: React.ElementType;
  /** crm i18n key resolved via useTranslations('crm') at render. */
  label: string;
  superAdminOnly?: boolean;
}

const businessNavItems: NavItem[] = [
  { href: '/crm', icon: LayoutDashboard, label: 'overview' },
  { href: '/crm/customers', icon: Users, label: 'customers' },
  { href: '/crm/leads', icon: Target, label: 'leads' },
  { href: '/crm/revenue', icon: DollarSign, label: 'revenue' },
];

const platformNavItems: NavItem[] = [
  { href: '/crm/users', icon: UserCog, label: 'platform_users' },
  { href: '/crm/subscriptions', icon: CreditCard, label: 'subscriptions' },
  { href: '/crm/platform', icon: Monitor, label: 'analytics' },
  { href: '/crm/audit', icon: Shield, label: 'audit_log' },
];

const ownerNavItems: NavItem[] = [
  { href: '/crm/settings', icon: Settings, label: 'app_settings', superAdminOnly: true },
];

function NavSection({
  label,
  items,
  pathname,
  isSuperAdmin,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  isSuperAdmin: boolean;
  /** Called when a nav link is clicked — closes the mobile drawer. */
  onNavigate: () => void;
}) {
  const t = useTranslations('crm');
  const visibleItems = items.filter((item) => !item.superAdminOnly || isSuperAdmin);
  if (visibleItems.length === 0) return null;

  const isActive = (href: string) =>
    href === '/crm' ? pathname === '/crm' : pathname.startsWith(href);

  return (
    <div>
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-600">
        {t(label)}
      </p>
      <div className="space-y-0.5">
        {visibleItems.map(({ href, icon: Icon, label: itemLabel }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200',
            )}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {t(itemLabel)}
          </Link>
        ))}
      </div>
    </div>
  );
}

interface CRMSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function CRMSidebar({ open, onClose }: CRMSidebarProps) {
  const t = useTranslations('crm');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Overlay starts below the navy TopBar so the header stays visible. */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar under full-width TopBar. Closed-state transform flips in RTL. */}
      <aside
        className={cn(
          'fixed bottom-0 start-0 top-16 z-50 flex w-64 flex-shrink-0 flex-col border-e border-stone-200 bg-white transition-transform lg:static lg:top-auto lg:translate-x-0 dark:border-stone-700 dark:bg-stone-900',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0',
        )}
      >
        {/* Mobile close only — CRM / Owner badges live in TopBar. */}
        <div className="flex items-center justify-end border-b border-stone-200 px-3 py-2 lg:hidden dark:border-stone-700">
          <button
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            onClick={onClose}
            aria-label={tCommon('close_menu')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label={tCommon('main_navigation')} className="flex-1 space-y-5 overflow-y-auto p-3">
          <NavSection
            label="nav_section_business_crm"
            items={businessNavItems}
            pathname={pathname}
            isSuperAdmin={isSuperAdmin}
            onNavigate={onClose}
          />
          <NavSection
            label="nav_section_platform"
            items={platformNavItems}
            pathname={pathname}
            isSuperAdmin={isSuperAdmin}
            onNavigate={onClose}
          />
          {isSuperAdmin && (
            <NavSection
              label="nav_section_owner_tools"
              items={ownerNavItems}
              pathname={pathname}
              isSuperAdmin={isSuperAdmin}
              onNavigate={onClose}
            />
          )}
        </nav>

        {/* Back to app */}
        <div className="border-t border-stone-200 p-3 dark:border-stone-700">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <ArrowLeft className="h-5 w-5 flex-shrink-0 rtl:rotate-180" />
            {t('nav_back_to_app')}
          </Link>
        </div>
      </aside>
    </>
  );
}
