'use client';

import { useTranslations } from 'next-intl';
import { PLANS, RECOMMENDED_PLAN_ID, type BillingInterval, type PlanId } from '@flacroncv/career-shared';
import { cn } from '@/lib/utils';
import { careerBuildEnabled } from '@/lib/career-switch';
import { COMPARISON_ROWS, DEFINED_UNITS, PRICING_PLANS, cellState, featureState } from './plan-catalog';
import { usePlanFormat } from './plan-format';
import { FeatureStateBadge } from './FeatureStateBadge';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950';

/**
 * The complete comparison (every row of spec §6, §7 and the §10 Business
 * capacities) with a feature-state marker per row, followed by the unit
 * definitions (spec §8). Phones get one expandable list per plan instead of a
 * sideways-scrolling table (client requirement K.3).
 */
export function PlanComparison({
  interval,
  plans = PRICING_PLANS,
  currentPlan,
  showDefinitions = true,
  headingId = 'compare-title',
}: {
  interval: BillingInterval;
  plans?: readonly PlanId[];
  currentPlan?: PlanId | null;
  showDefinitions?: boolean;
  headingId?: string;
}) {
  const t = useTranslations('plan_catalog');
  const tFeatures = useTranslations('career_pricing');
  const fmt = usePlanFormat();
  const careerOn = careerBuildEnabled();
  const price = (id: PlanId) =>
    id === 'free'
      ? fmt.usd(0)
      : `${fmt.usd(interval === 'annual' ? PLANS[id].annualCents : PLANS[id].monthlyCents)}${t(interval === 'annual' ? 'per_year' : 'per_month')}`;
  const rowLabel = (row: (typeof COMPARISON_ROWS)[number]) => t(`rows.${row}`);

  return (
    <div>
      <h3 id={headingId} className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('compare_title')}
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{t('compare_intro')}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-stone-600 dark:text-stone-400" aria-label={t('state_legend')}>
        <li className="flex items-center gap-1.5">
          <FeatureStateBadge state="coming_soon" className="" /> {t('state_coming_soon_desc')}
        </li>
        <li className="flex items-center gap-1.5">
          <FeatureStateBadge state="provider_dependent" className="" /> {t('state_provider_desc')}
        </li>
      </ul>

      {/* Phones: one expandable list per plan. */}
      <div className="mt-4 space-y-3 md:hidden">
        {plans.map((id) => (
          <details
            key={id}
            open={id === (currentPlan ?? RECOMMENDED_PLAN_ID)}
            className="rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
          >
            <summary className={cn('flex cursor-pointer items-baseline justify-between gap-3 rounded-xl px-4 py-3', focusRing)}>
              <span className="font-semibold text-stone-900 dark:text-white">{fmt.planName(id)}</span>
              <span className="text-sm tabular-nums text-stone-500 dark:text-stone-400">{price(id)}</span>
            </summary>
            <dl className="divide-y divide-stone-100 border-t border-stone-200 px-4 dark:divide-stone-800 dark:border-stone-700">
              {COMPARISON_ROWS.map((row) => (
                <div key={row} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <dt className="min-w-0 text-stone-600 dark:text-stone-400">
                    {rowLabel(row)}
                    <FeatureStateBadge state={featureState(row, careerOn)} />
                  </dt>
                  <dd className="max-w-[50%] shrink-0 text-end font-medium text-stone-900 dark:text-white">
                    {fmt.cell(row, id)}
                    {featureState(row, careerOn) === 'available' ? (
                      <FeatureStateBadge state={cellState(row, id, careerOn)} />
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>

      {/* Tablet and up: the full table. The scroll region is focusable so keyboard users can scroll it. */}
      <div
        className="mt-4 hidden max-w-full overflow-x-auto rounded-xl border border-stone-200 md:block dark:border-stone-700"
        tabIndex={0}
        role="region"
        aria-labelledby={headingId}
      >
        <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t('compare_title')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-[1] min-w-[12rem] border-b border-e border-stone-200 bg-stone-50 px-3 py-3 text-start font-semibold text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
              >
                {tFeatures('feature')}
              </th>
              {plans.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className={cn(
                    'min-w-[7rem] border-b border-stone-200 bg-stone-50 px-3 py-3 text-start font-semibold text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white',
                    id === currentPlan && 'bg-brand-50 dark:bg-brand-950/40',
                  )}
                >
                  {fmt.planName(id)}
                  {id === currentPlan ? (
                    <span className="block text-xs font-normal text-brand-700 dark:text-brand-400">{t('current_plan')}</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                scope="row"
                className="sticky start-0 z-[1] border-b border-e border-stone-200 bg-white px-3 py-3 text-start font-medium text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
              >
                {tFeatures('price')}
              </th>
              {plans.map((id) => (
                <td key={id} className="whitespace-nowrap border-b border-stone-200 px-3 py-3 tabular-nums text-stone-800 dark:border-stone-700 dark:text-stone-200">
                  {price(id)}
                </td>
              ))}
            </tr>
            {COMPARISON_ROWS.map((row) => {
              const rowState = featureState(row, careerOn);
              return (
                <tr key={row}>
                  <th
                    scope="row"
                    className="sticky start-0 z-[1] border-b border-e border-stone-200 bg-white px-3 py-3 text-start font-medium text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-white"
                  >
                    {rowLabel(row)}
                    <FeatureStateBadge state={rowState} />
                  </th>
                  {plans.map((id) => (
                    <td key={id} className="border-b border-stone-200 px-3 py-3 text-stone-800 dark:border-stone-700 dark:text-stone-200">
                      {fmt.cell(row, id)}
                      {rowState === 'available' ? <FeatureStateBadge state={cellState(row, id, careerOn)} /> : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t('usage_vs_capacity')}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{tFeatures('pooled_note')}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('map_note')}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('every_plan_note')}</p>

      {showDefinitions ? (
        <>
          <h3 id="definitions" className="mt-10 scroll-mt-20 text-lg font-bold text-stone-900 dark:text-white">
            {tFeatures('definitions_title')}
          </h3>
          <dl className="mt-3 border-t border-stone-200 dark:border-stone-700">
            {DEFINED_UNITS.map((row) => (
              <div key={row} className="border-b border-stone-200 py-3 dark:border-stone-700">
                <dt className="font-semibold text-stone-900 dark:text-white">
                  {t(`units.${row}`)}
                  <FeatureStateBadge state={featureState(row, careerOn)} />
                </dt>
                <dd className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t(`definitions.${row}`)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{t('charging_rules')}</p>
        </>
      ) : null}
    </div>
  );
}
