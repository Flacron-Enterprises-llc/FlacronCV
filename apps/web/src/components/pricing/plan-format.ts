'use client';

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ALLOWANCES, type PlanId } from '@flacroncv/career-shared';
import { formatUsd } from '@/lib/format-price';
import type { ComparisonRow } from './plan-catalog';

const MB = 1_000_000;
const GB = 1_000_000_000;

/** Catalog cents through V1's one price formatter, so every surface prints prices the same way. */
export function usdFromCents(cents: number, locale: string): string {
  return formatUsd(cents / 100, locale);
}

/** Whole counts with Latin digits in every locale, matching the prices next to them. */
export function formatWhole(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(value);
  }
}

/** Shared formatting for plan cards, the comparison table and the billing page. */
export function usePlanFormat() {
  const locale = useLocale();
  const t = useTranslations('plan_catalog');
  const tFeatures = useTranslations('career_pricing');
  const tPlan = useTranslations('career.plans.plan');

  const usd = useCallback((cents: number) => usdFromCents(cents, locale), [locale]);
  const count = useCallback((value: number) => formatWhole(value, locale), [locale]);

  const storage = useCallback(
    (bytes: number) =>
      bytes >= GB
        ? t('storage_gb', { amount: formatWhole(bytes / GB, locale) })
        : t('storage_mb', { amount: formatWhole(bytes / MB, locale) }),
    [locale, t],
  );

  /** One comparison cell. Business scopes ("per candidate") are spelled out. */
  const cell = useCallback(
    (row: ComparisonRow, planId: PlanId): string => {
      const allowance = ALLOWANCES[planId];
      const value = allowance[row];
      if (typeof value === 'boolean') return value ? tFeatures('yes') : tFeatures('not_included');
      if (value === null || value === undefined) return tFeatures('not_included');
      switch (row) {
        case 'alertIntelligence':
          return tFeatures(`intel.${value as string}`);
        case 'alertDelivery':
          return tFeatures(`delivery.${value as string}`);
        case 'matchingSchedule':
          return t(`schedule.${value as string}`);
        case 'applicationAnalytics':
        case 'portfolioAnalytics':
          return value === 'none' ? tFeatures('not_included') : tFeatures(`levels.${value as string}`);
        case 'localRadiusMiles':
          return tFeatures('miles', { count: formatWhole(value as number, locale) });
        case 'storageBytes':
          return storage(value as number);
        default:
          break;
      }
      const amount = formatWhole(value as number, locale);
      const scope =
        (row === 'resumeVersions' && allowance.resumeVersionScope) ||
        (row === 'careerProfiles' && allowance.careerProfileScope) ||
        (row === 'trackedApplications' && allowance.trackedApplicationScope) ||
        (row === 'evidenceItems' && allowance.evidenceScope) ||
        (row === 'portfolioPages' && allowance.portfolioScope) ||
        'account';
      return scope === 'per_candidate' ? t('per_candidate', { amount }) : amount;
    },
    [locale, storage, t, tFeatures],
  );

  return useMemo(
    () => ({ locale, usd, count, storage, cell, planName: (id: PlanId) => tPlan(id) }),
    [cell, count, locale, storage, tPlan, usd],
  );
}
