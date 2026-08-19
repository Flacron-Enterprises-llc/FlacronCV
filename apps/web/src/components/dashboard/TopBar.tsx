'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Menu, Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import Logo from '@/components/ui/Logo';

export type TopBarArea = 'dashboard' | 'admin' | 'crm';

interface TopBarProps {
  onMenuClick: () => void;
  /**
   * Which shell owns this header. Drives the logo home link and the admin/CRM
   * area badge so a shared TopBar still tells staff which surface they are on.
   */
  area?: TopBarArea;
}

const AREA_HOME: Record<TopBarArea, '/dashboard' | '/admin' | '/crm'> = {
  dashboard: '/dashboard',
  admin: '/admin',
  crm: '/crm',
};

export default function TopBar({ onMenuClick, area = 'dashboard' }: TopBarProps) {
  const { user, logout } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const t = useTranslations();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const isSuperAdmin = user?.role === 'super_admin';

  // Get display name with fallbacks: displayName > firstName lastName > email
  const getDisplayName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.profile?.firstName && user?.profile?.lastName) {
      return `${user.profile.firstName} ${user.profile.lastName}`;
    }
    if (user?.profile?.firstName) return user.profile.firstName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const displayName = getDisplayName();
  const initial = displayName[0]?.toUpperCase() || 'U';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close the user menu with Escape and return focus to its trigger.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        dropdownTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dropdownOpen]);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-chrome px-4 dark:border-stone-700 dark:bg-stone-900">
      {/* Start: menu + logo (+ area badge). Logical start so RTL mirrors. */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          className="rounded-lg p-2 text-stone-300 hover:bg-white/10 lg:hidden dark:text-stone-400 dark:hover:bg-stone-800"
          onClick={onMenuClick}
          aria-label={t('common.open_menu')}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href={AREA_HOME[area]} className="flex min-w-0 items-center gap-2.5">
          <Logo className="h-8" variant="on-dark" priority />
          {area === 'admin' && (
            <span className="hidden rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-300 sm:inline">
              {t('admin.title')}
            </span>
          )}
          {area === 'crm' && (
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-300">
                {t('crm.chrome_badge')}
              </span>
              {isSuperAdmin && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-red-400">
                  {t('crm.nav_owner_badge')}
                </span>
              )}
            </span>
          )}
        </Link>
      </div>

      {/* End: existing controls. Logical end so RTL mirrors. */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher />

        <button
          className="rounded-lg p-2 text-stone-300 hover:bg-white/10 dark:text-stone-400 dark:hover:bg-stone-800"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label={resolvedTheme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
        >
          {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            ref={dropdownTriggerRef}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-white/10 dark:hover:bg-stone-800"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label={t('common.user_menu')}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              {initial}
            </div>
            <span className="hidden max-w-[8rem] truncate text-sm font-medium text-stone-300 sm:block dark:text-stone-300">
              {displayName}
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute end-0 mt-2 w-48 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
              <div className="border-b border-stone-100 px-4 py-2 dark:border-stone-700">
                <p className="text-sm font-medium text-stone-900 dark:text-white">{displayName}</p>
                {user?.profile?.headline ? (
                  <p className="truncate text-xs text-stone-500">{user.profile.headline}</p>
                ) : (
                  <p className="truncate text-xs text-stone-500">{user?.email}</p>
                )}
              </div>
              <button
                onClick={() => {
                  router.push('/settings');
                  setDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                <UserIcon className="h-4 w-4" /> {t('settings.nav.profile')}
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <LogOut className="h-4 w-4" /> {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
