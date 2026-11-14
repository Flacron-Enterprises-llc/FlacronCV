'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Package } from 'lucide-react';
import type { UsagePack } from '@flacroncv/career-api-client';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { usePlanFormat } from '../plan-format';
import { expiresSoon, type AllowanceRow, type UsageWarning } from './billing-model';

function useRowLabel() {
  const t = useTranslations('plan_catalog.usage_units');
  return (row: { key: string }) => t(row.key);
}

/** Spec §11 warnings at 80, 95 and 100 percent, as one banner above the allowances. */
export function UsageWarningsBanner({
  warnings,
  renewal,
  canBuyPacks,
}: {
  warnings: readonly UsageWarning[];
  renewal: string | null;
  canBuyPacks: boolean;
}) {
  const t = useTranslations('plan_catalog.warnings');
  const label = useRowLabel();
  if (warnings.length === 0) return null;
  const exhausted = warnings.some((w) => w.level === 100);
  return (
    <div
      role={exhausted ? 'alert' : 'status'}
      data-testid="usage-warnings"
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-4 sm:px-5',
        exhausted
          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
      )}
    >
      <AlertTriangle
        className={cn('mt-0.5 h-5 w-5 shrink-0', exhausted ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}
        aria-hidden
      />
      <div className="min-w-0 text-sm">
        <p className={cn('font-semibold', exhausted ? 'text-red-800 dark:text-red-300' : 'text-amber-900 dark:text-amber-200')}>
          {exhausted ? t('title_exhausted') : t('title')}
        </p>
        <ul className="mt-1 space-y-0.5 text-stone-700 dark:text-stone-300">
          {warnings.map((warning) => (
            <li key={`${warning.source}-${warning.key}`}>
              {t(`level_${warning.level}`, { unit: label(warning), percent: warning.percent })}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {exhausted ? t('exhausted_help') : null}
          {renewal ? ` ${t('renews', { date: renewal })}` : ''}
          {' '}
          {canBuyPacks ? t('options_with_packs') : t('options')}
        </p>
      </div>
    </div>
  );
}

/** Allowance by unit: granted, used and remaining for the V1 counters and the career units. */
export function AllowanceTable({ rows, title }: { rows: readonly AllowanceRow[]; title: string }) {
  const t = useTranslations('plan_catalog.allowance_table');
  const fmt = usePlanFormat();
  const label = useRowLabel();
  const value = (v: number | null, unknownKey: 'unlimited' | 'unknown') => (v === null ? t(unknownKey) : fmt.count(v));
  if (rows.length === 0) return null;
  return (
    <Card>
      <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{title}</h3>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const notIncluded = row.granted === 0 && row.packRemaining === 0;
          const percent = row.granted && row.used !== null ? Math.min(100, Math.round((row.used / row.granted) * 100)) : 0;
          return (
            <li key={`${row.source}-${row.key}`} data-testid={`allowance-${row.key}`} className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{label(row)}</p>
              {notIncluded ? (
                <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t('not_in_plan')}</p>
              ) : row.granted === null ? (
                // Unlimited: one line, so a long word never squeezes a three-column grid.
                <p className="mt-2 text-sm text-stone-800 dark:text-stone-200">
                  <span className="font-semibold">{t('unlimited')}</span>
                  {row.used !== null ? ` · ${t('used')}: ${fmt.count(row.used)}` : ''}
                </p>
              ) : (
                <>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dt className="text-xs text-stone-500 dark:text-stone-400">{t(row.capacity ? 'capacity' : 'granted')}</dt>
                      <dd className="min-w-0 break-words font-semibold tabular-nums text-stone-900 dark:text-white">{value(row.granted, 'unlimited')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500 dark:text-stone-400">{t('used')}</dt>
                      <dd className="min-w-0 break-words font-semibold tabular-nums text-stone-900 dark:text-white">{value(row.used, 'unknown')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-stone-500 dark:text-stone-400">{t('remaining')}</dt>
                      <dd className="min-w-0 break-words font-semibold tabular-nums text-stone-900 dark:text-white">
                        {value(row.remaining, 'unknown')}
                      </dd>
                    </div>
                  </dl>
                  {row.granted !== null && row.used !== null ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-700" aria-hidden>
                      <div
                        className={cn('h-full rounded-full', percent >= 95 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-500')}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  ) : null}
                  {row.packRemaining > 0 ? (
                    <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{t('pack_units', { count: row.packRemaining, amount: fmt.count(row.packRemaining) })}</p>
                  ) : null}
                  {row.capacity ? <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{t('capacity_note')}</p> : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Purchased packs still holding units, with their expiry dates (spec §11). */
export function PackBalances({ packs, formatDate }: { packs: readonly UsagePack[]; formatDate: (iso: string) => string }) {
  const t = useTranslations('plan_catalog');
  const label = useTranslations('plan_catalog.usage_units');
  const fmt = usePlanFormat();
  if (packs.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-stone-400" aria-hidden />
        <h3 className="text-lg font-semibold text-stone-900 dark:text-white">{t('packs_title')}</h3>
      </div>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('packs_order_note')}</p>
      <ul className="mt-3 divide-y divide-stone-100 dark:divide-stone-700/50">
        {packs.map((pack) => (
          <li key={pack.id} data-testid={`pack-${pack.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-white">{t(`addons.${pack.addonId}`)}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {t('pack_remaining', {
                  remaining: fmt.count(pack.remainingUnits),
                  purchased: fmt.count(pack.purchasedUnits),
                  unit: label(pack.unit),
                })}
              </p>
            </div>
            <Badge variant={expiresSoon(pack) ? 'warning' : 'default'}>{t('pack_expires', { date: formatDate(pack.expiresAt) })}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
