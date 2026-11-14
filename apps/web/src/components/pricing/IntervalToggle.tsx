'use client';

import type { KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { BillingInterval } from '@flacroncv/career-shared';
import { cn } from '@/lib/utils';

const INTERVALS: readonly BillingInterval[] = ['monthly', 'annual'];

/** Monthly / annual radio group. Arrow keys move and select; Tab leaves the group. */
export function IntervalToggle({
  value,
  onChange,
  className,
}: {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
  className?: string;
}) {
  const t = useTranslations('plan_catalog');

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = INTERVALS[(INTERVALS.indexOf(value) + 1) % INTERVALS.length];
    onChange(next);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [INTERVALS.indexOf(next)]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('interval_label')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-800',
        className,
      )}
    >
      {INTERVALS.map((interval) => {
        const checked = value === interval;
        return (
          <button
            key={interval}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(interval)}
            onKeyDown={onKey}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950 sm:px-5',
              checked
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
            )}
          >
            {t(interval === 'monthly' ? 'monthly' : 'annual_toggle')}
          </button>
        );
      })}
    </div>
  );
}
