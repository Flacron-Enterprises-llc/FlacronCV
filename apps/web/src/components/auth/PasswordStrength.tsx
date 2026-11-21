'use client';

import { useTranslations } from 'next-intl';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PasswordStrength as Strength } from '@/lib/auth-quality';

const BAR = ['bg-stone-200 dark:bg-stone-700', 'bg-red-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
const TEXT = [
  'text-stone-500 dark:text-stone-400',
  'text-red-700 dark:text-red-400',
  'text-amber-700 dark:text-amber-400',
  'text-lime-700 dark:text-lime-400',
  'text-emerald-700 dark:text-emerald-400',
];

/**
 * Live strength meter under a new-password field: four segments, a word
 * ("Fair"), and the checklist behind it. The word is announced politely so
 * screen-reader users hear it change without being interrupted on every key.
 */
export default function PasswordStrength({ strength, id }: { strength: Strength; id?: string }) {
  const t = useTranslations('auth');
  const { level, checks, common } = strength;
  const items: Array<[keyof Strength['checks'], string]> = [
    ['length', t('req_length')],
    ['mixedCase', t('req_case')],
    ['number', t('req_number')],
    ['symbol', t('req_symbol')],
  ];
  return (
    <div id={id} className="mt-2 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((seg) => (
            <span key={seg} className={cn('h-1.5 flex-1 rounded-full transition-colors', level >= seg ? BAR[level] : BAR[0])} />
          ))}
        </div>
        <span className={cn('min-w-[4.5rem] text-end text-xs font-semibold', TEXT[level])} aria-live="polite">
          <span className="sr-only">{t('strength_label')}: </span>
          {t(`strength_${level}`)}
        </span>
      </div>
      {common ? (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">{t('password_common')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {items.map(([key, label]) => (
            <li key={key} className={cn('flex items-center gap-1.5 text-xs', checks[key] ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400')}>
              {checks[key] ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span>
                {label}
                <span className="sr-only">{checks[key] ? ` — ${t('req_met')}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Did you mean ada@gmail.com?" with a one-click fix. */
export function EmailSuggestion({ suggestion, onAccept }: { suggestion: string | null; onAccept: (email: string) => void }) {
  const t = useTranslations('auth');
  if (!suggestion) return null;
  return (
    <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
      {t.rich('email_suggest', {
        email: suggestion,
        fix: (chunks) => (
          <button
            type="button"
            onClick={() => onAccept(suggestion)}
            className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400"
            dir="ltr"
          >
            {chunks}
          </button>
        ),
      })}
    </p>
  );
}
