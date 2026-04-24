'use client';

import { Link, usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import {
  LayoutDashboard,
  Users,
  Target,
  DollarSign,
  ArrowLeft,
  FileText as Logo,
  Monitor,
  Shield,
  Settings,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  superAdminOnly?: boolean;
}

const businessNavItems: NavItem[] = [
  { href: '/crm', icon: LayoutDashboard, label: 'Overview' },
  { href: '/crm/customers', icon: Users, label: 'Customers' },
  { href: '/crm/leads', icon: Target, label: 'Leads' },
  { href: '/crm/revenue', icon: DollarSign, label: 'Revenue' },
];

const platformNavItems: NavItem[] = [
  { href: '/crm/users', icon: UserCog, label: 'Platform Users' },
  { href: '/crm/platform', icon: Monitor, label: 'Analytics' },
  { href: '/crm/audit', icon: Shield, label: 'Audit Log' },
];

const ownerNavItems: NavItem[] = [
  { href: '/crm/settings', icon: Settings, label: 'App Settings', superAdminOnly: true },
];

function NavSection({
  label,
  items,
  pathname,
  isSuperAdmin,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  isSuperAdmin: boolean;
}) {
  const visibleItems = items.filter((item) => !item.superAdminOnly || isSuperAdmin);
  if (visibleItems.length === 0) return null;

  const isActive = (href: string) =>
    href === '/crm' ? pathname === '/crm' : pathname.startsWith(href);

  return (
    <div>
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-600">
        {label}
      </p>
      <div className="space-y-0.5">
        {visibleItems.map(({ href, icon: Icon, label: itemLabel }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200',
            )}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {itemLabel}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CRMSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-e border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-stone-200 px-4 dark:border-stone-700">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Logo className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-bold text-stone-900 dark:text-white">
              Flacron<span className="text-brand-600">CRM</span>
            </span>
            {isSuperAdmin && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500">Owner</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        <NavSection
          label="Business CRM"
          items={businessNavItems}
          pathname={pathname}
          isSuperAdmin={isSuperAdmin}
        />
        <NavSection
          label="Platform"
          items={platformNavItems}
          pathname={pathname}
          isSuperAdmin={isSuperAdmin}
        />
        {isSuperAdmin && (
          <NavSection
            label="Owner Tools"
            items={ownerNavItems}
            pathname={pathname}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </nav>

      {/* Back to app */}
      <div className="border-t border-stone-200 p-3 dark:border-stone-700">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <ArrowLeft className="h-5 w-5 flex-shrink-0" />
          Back to App
        </Link>
      </div>
    </aside>
  );
}
