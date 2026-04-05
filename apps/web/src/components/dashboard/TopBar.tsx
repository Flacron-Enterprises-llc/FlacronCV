'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Menu, Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const t = useTranslations();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-4 dark:border-stone-700 dark:bg-stone-900">
      <button
        className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden dark:text-stone-400 dark:hover:bg-stone-800"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Theme toggle */}
        <button
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              {initial}
            </div>
            <span className="hidden text-sm font-medium text-stone-700 sm:block dark:text-stone-300">
              {displayName}
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute end-0 mt-2 w-48 rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
              <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-700">
                <p className="text-sm font-medium text-stone-900 dark:text-white">{displayName}</p>
                {user?.profile?.headline ? (
                  <p className="text-xs text-stone-500 truncate">{user.profile.headline}</p>
                ) : (
                  <p className="text-xs text-stone-500 truncate">{user?.email}</p>
                )}
              </div>
              <button
                onClick={() => { router.push('/settings'); setDropdownOpen(false); }}
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
