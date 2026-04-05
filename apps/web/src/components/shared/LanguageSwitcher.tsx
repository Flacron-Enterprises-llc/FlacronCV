'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ur', name: 'اردو', flag: '🇵🇰' },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitch = (newLocale: string) => {
    // Persist immediately so the preference survives hard refreshes before the
    // settings API call has a chance to write it to the database.
    try { localStorage.setItem('flacroncv_locale', newLocale); } catch {}
    router.replace(pathname, { locale: newLocale as any });
    setOpen(false);
  };

  const currentLang = LANGUAGES.find((l) => l.code === locale);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
        onClick={() => setOpen(!open)}
        title={t('switch_language')}
      >
        <Globe className="h-5 w-5" />
        <span className="hidden text-xs font-medium sm:block">{currentLang?.code.toUpperCase()}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-20 mt-1 w-48 animate-scale-in overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
            <div className="px-3 py-1.5 text-xs font-semibold text-stone-400 dark:text-stone-500">
              {t('select_language')}
            </div>
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  locale === lang.code
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-700'
                }`}
                onClick={() => handleSwitch(lang.code)}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.name}</span>
                {locale === lang.code && (
                  <span className="ms-auto text-xs text-brand-600 dark:text-brand-400">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
