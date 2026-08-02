'use client';

import React, { useId } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/format-date';

/**
 * Shared date-range control for the CRM dashboards.
 *
 * The value is a preset PLUS two optional explicit bounds. An explicit bound
 * always wins over the one the preset implies, which is what makes "last 30
 * days but only up to the 12th" expressible without a separate "custom" mode
 * the user has to discover. Whatever the combination, `resolveDateRange`
 * collapses it to the single from/to pair that is sent to the API and shown
 * on screen, so the figures can never be ambiguous.
 */

export const DATE_RANGE_PRESETS = ['7d', '30d', '90d', 'ytd', 'all'] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export interface DateRangeValue {
  preset: DateRangePreset;
  /** Explicit lower bound as `YYYY-MM-DD`, or '' to use the preset's. */
  from: string;
  /** Explicit upper bound as `YYYY-MM-DD`, or '' to use the preset's. */
  to: string;
}

/**
 * The default. All-time keeps the dashboard showing exactly the totals it
 * showed before this filter existed — a preset default would silently change
 * every number on the page the first time someone loads it.
 */
export const ALL_TIME_RANGE: DateRangeValue = { preset: 'all', from: '', to: '' };

const PRESET_LABEL_KEY: Record<DateRangePreset, string> = {
  '7d': 'date_range_preset_7d',
  '30d': 'date_range_preset_30d',
  '90d': 'date_range_preset_90d',
  ytd: 'date_range_preset_ytd',
  all: 'date_range_preset_all',
};

/** Days covered by each rolling preset, inclusive of today. */
const PRESET_DAYS: Partial<Record<DateRangePreset, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * `YYYY-MM-DD` in LOCAL time. `toISOString()` would shift the day for anyone
 * east or west of UTC, so a user in Karachi picking "today" could export a
 * range ending yesterday.
 */
function isoDay(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Collapse a preset + optional explicit bounds into one concrete from/to pair. */
export function resolveDateRange(
  value: DateRangeValue,
  today: Date = new Date(),
): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  const date = today.getDate();

  let from = '';
  let to = '';

  const days = PRESET_DAYS[value.preset];
  if (days) {
    // `date - (days - 1)` is inclusive of today and rolls over months safely.
    from = isoDay(new Date(year, month, date - (days - 1)));
    to = isoDay(new Date(year, month, date));
  } else if (value.preset === 'ytd') {
    from = isoDay(new Date(year, 0, 1));
    to = isoDay(new Date(year, month, date));
  }

  return { from: value.from || from, to: value.to || to };
}

/** Filename-safe description of the active range, e.g. `2026-01-01_2026-07-30`. */
export function dateRangeFilenameSlug(value: DateRangeValue): string {
  const { from, to } = resolveDateRange(value);
  if (!from && !to) return 'all-time';
  return `${from || 'start'}_${to || 'today'}`;
}

/**
 * Human-readable description of the active range, translated. Exported so the
 * page can put the very same sentence in the CSV it exports.
 */
export function useDateRangeLabel(value: DateRangeValue): string {
  const t = useTranslations('crm');
  const { from, to } = resolveDateRange(value);

  if (from && to) return t('date_range_active_between', { from: formatDate(from), to: formatDate(to) });
  if (from) return t('date_range_active_since', { from: formatDate(from) });
  if (to) return t('date_range_active_until', { to: formatDate(to) });
  return t('date_range_active_all');
}

const FIELD_CLASS =
  'rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white';

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400';

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
}

export default function DateRangeFilter({
  value,
  onChange,
  className,
}: DateRangeFilterProps): React.JSX.Element {
  const t = useTranslations('crm');
  const baseId = useId();
  const presetId = `${baseId}-preset`;
  const fromId = `${baseId}-from`;
  const toId = `${baseId}-to`;

  const activeLabel = useDateRangeLabel(value);
  const hasExplicitBounds = Boolean(value.from || value.to);

  return (
    <Card padding="sm" className={className}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={presetId} className={LABEL_CLASS}>
            {t('date_range_label')}
          </label>
          <select
            id={presetId}
            value={value.preset}
            onChange={(e) => onChange({ ...value, preset: e.target.value as DateRangePreset })}
            className={FIELD_CLASS}
          >
            {DATE_RANGE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {t(PRESET_LABEL_KEY[preset])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={fromId} className={LABEL_CLASS}>
            {t('from')}
          </label>
          <input
            id={fromId}
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor={toId} className={LABEL_CLASS}>
            {t('to')}
          </label>
          <input
            id={toId}
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        {hasExplicitBounds && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => onChange({ ...value, from: '', to: '' })}
          >
            <X className="h-4 w-4 me-1" aria-hidden="true" />
            {t('clear')}
          </Button>
        )}

        {/* Announced on change: the KPI numbers below only mean something
            alongside the window they were measured over. */}
        <p
          aria-live="polite"
          className="ms-auto self-center text-xs font-medium text-stone-500 dark:text-stone-400"
        >
          {activeLabel}
        </p>
      </div>
    </Card>
  );
}
