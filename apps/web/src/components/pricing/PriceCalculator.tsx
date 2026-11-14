'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CATALOG_VERSION, PLANS, addonById, type BillingInterval, type PlanId } from '@flacroncv/career-shared';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { PRICING_PLANS } from './plan-catalog';
import {
  CAPACITY_FIELDS,
  EMPTY_QUANTITIES,
  USAGE_FIELDS,
  calculate,
  parseQuantity,
  restrictionFor,
  visibleFields,
  type QuantityField,
} from './estimate-model';
import { addonOnSale, planOnSale, usePlanAvailability } from './plan-availability';
import { usePlanFormat } from './plan-format';
import { IntervalToggle } from './IntervalToggle';

/**
 * Spec §10A price estimate. Money comes from career-shared `estimate()`, the
 * same catalog and least-cost pack selection checkout uses. Recurring,
 * one-time and due-now totals are separate; incompatible items are disabled
 * with the plan they need; nothing here is a charge.
 */
export function PriceCalculator({
  initialPlan = 'professional',
  initialInterval = 'monthly',
  now,
}: {
  initialPlan?: PlanId;
  initialInterval?: BillingInterval;
  /** Fixed clock for tests. */
  now?: Date;
}) {
  const t = useTranslations('plan_catalog');
  const tc = useTranslations('plan_catalog.calc');
  const fmt = usePlanFormat();
  const { availability } = usePlanAvailability();
  const [planId, setPlanId] = useState<PlanId>(initialPlan);
  const [interval, setBillingInterval] = useState<BillingInterval>(initialInterval);
  const [quantities, setQuantities] = useState(EMPTY_QUANTITIES);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState('');

  const result = useMemo(() => calculate({ planId, interval, quantities }, now), [interval, now, planId, quantities]);
  const { estimate } = result;
  const shown = visibleFields(planId);
  const date = (value: Date) =>
    new Intl.DateTimeFormat(`${fmt.locale}-u-nu-latn`, { dateStyle: 'long', timeZone: 'UTC' }).format(value);

  const lineName = (id: string) =>
    id === planId
      ? tc('base_line', { plan: fmt.planName(planId), interval: t(interval === 'annual' ? 'annual' : 'monthly') })
      : t(`addons.${id}`);
  const lineOnSale = (id: string) => (id === planId ? planOnSale(availability, planId, interval) : addonOnSale(availability, id));
  const billingLabel = (billing: string) => tc(`billing.${billing}`);

  function setQuantity(field: QuantityField, value: string) {
    const parsed = parseQuantity(value);
    if (parsed === null) return;
    setQuantities((prev) => ({ ...prev, [field]: parsed }));
    setCopied(false);
  }

  function estimateText(): string {
    const lines = estimate.lines.map((line) => {
      const units = line.unitsPurchased && line.id !== planId ? ` (${tc('units_bought', { count: line.unitsPurchased, amount: fmt.count(line.unitsPurchased) })})` : '';
      return `${lineName(line.id)} × ${fmt.count(line.quantity)} @ ${fmt.usd(line.unitPriceCents)} = ${fmt.usd(line.lineCents)} [${billingLabel(line.billing)}]${units}${lineOnSale(line.id) ? '' : ` — ${t('not_on_sale')}`}`;
    });
    return [
      tc('copy_heading'),
      `${tc('plan')}: ${fmt.planName(planId)}`,
      `${t('interval_label')}: ${t(interval === 'annual' ? 'annual' : 'monthly')}`,
      ...lines,
      `${tc('recurring_total')}: ${fmt.usd(estimate.recurringMonthlyCents)}`,
      `${tc('one_time_total')}: ${fmt.usd(estimate.oneTimeCents)}`,
      `${tc('due_now')}: ${fmt.usd(estimate.dueNowCents)}`,
      ...(estimate.monthlyEquivalentCents !== null
        ? [`${tc('base_equivalent')}: ${fmt.usd(estimate.monthlyEquivalentCents)}${t('per_month')}`]
        : []),
      tc('currency'),
      `${tc('estimate_date')}: ${(now ?? new Date()).toISOString().slice(0, 10)}`,
      `${tc('catalog_version')}: ${estimate.catalogVersion}`,
      t('taxes_note'),
    ].join('\n');
  }

  async function copyEstimate() {
    const text = estimateText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback('');
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFallback(text);
    }
  }

  const renderField = (field: QuantityField) => {
    if (!shown.includes(field)) return null;
    const required = restrictionFor(field, planId);
    const id = `estimate-${field}`;
    const hint = required ? tc('requires', { plan: fmt.planName(required) }) : tc(`hints.${field}`);
    return (
      <div key={field} className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          {tc(`fields.${field}`)}
        </label>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          disabled={required !== null}
          aria-describedby={`${id}-hint`}
          value={quantities[field] === 0 || required ? '' : String(quantities[field])}
          placeholder="0"
          onChange={(event) => setQuantity(field, event.target.value)}
          className="input-field h-10 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p id={`${id}-hint`} className="text-xs text-stone-500 dark:text-stone-400">
          {hint}
        </p>
      </div>
    );
  };

  const usageFields = USAGE_FIELDS.map((f) => f.field);
  const capacityFields = CAPACITY_FIELDS.map((f) => f.field);

  return (
    <div>
      <h3 id="calculator-title" className="text-2xl font-bold text-stone-900 dark:text-white">
        {tc('title')}
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{tc('intro')}</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[12rem] flex-1 space-y-1 sm:flex-none">
          <label htmlFor="estimate-plan" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
            {tc('plan')}
          </label>
          <select
            id="estimate-plan"
            value={planId}
            onChange={(event) => {
              setPlanId(event.target.value as PlanId);
              setCopied(false);
            }}
            className="input-field h-10"
          >
            {PRICING_PLANS.map((id) => (
              <option key={id} value={id}>
                {fmt.planName(id)}
                {id === 'free' ? '' : ` — ${fmt.usd(interval === 'annual' ? PLANS[id].annualCents : PLANS[id].monthlyCents)}`}
              </option>
            ))}
          </select>
        </div>
        <IntervalToggle
          value={interval}
          onChange={(next) => {
            setBillingInterval(next);
            setCopied(false);
          }}
        />
      </div>
      {planId === 'free' ? (
        <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {tc('free_note')}
        </p>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-base font-semibold text-stone-900 dark:text-white">{tc('usage_legend')}</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{usageFields.map(renderField)}</div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-base font-semibold text-stone-900 dark:text-white">{tc('capacity_legend')}</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capacityFields.map(renderField)}
          {renderField('messagingDollars')}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{tc('quantity_cap')}</p>

      <div
        aria-live="polite"
        data-testid="estimate"
        className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-6 dark:border-stone-700 dark:bg-stone-900"
      >
        <ul className="space-y-3 text-sm">
          {estimate.lines.map((line) => (
            <li key={`${line.id}-${line.billing}`} data-testid={`estimate-line-${line.id}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 basis-52 text-stone-700 dark:text-stone-300">
                <span className="font-medium text-stone-900 dark:text-white">{lineName(line.id)}</span>
                <span className="block text-xs text-stone-500 dark:text-stone-400">
                  {tc('line_detail', { quantity: fmt.count(line.quantity), price: fmt.usd(line.unitPriceCents) })}
                  {' · '}
                  {billingLabel(line.billing)}
                  {line.unitsPurchased && line.id !== planId && addonById(line.id)?.kind === 'usage_pack'
                    ? ` · ${tc('units_bought', { count: line.unitsPurchased, amount: fmt.count(line.unitsPurchased) })}`
                    : ''}
                </span>
                {lineOnSale(line.id) || line.lineCents === 0 ? null : (
                  <Badge variant="warning" className="mt-1">
                    {t('not_on_sale')}
                  </Badge>
                )}
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-stone-900 dark:text-white">{fmt.usd(line.lineCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm dark:border-stone-700">
          <Total label={tc('recurring_total')} hint={tc(interval === 'annual' ? 'recurring_hint_annual' : 'recurring_hint')} value={fmt.usd(estimate.recurringMonthlyCents)} testId="estimate-recurring" />
          <Total label={tc('one_time_total')} hint={tc('one_time_hint')} value={fmt.usd(estimate.oneTimeCents)} testId="estimate-one-time" />
          <Total label={tc('due_now')} hint={interval === 'annual' && planId !== 'free' ? tc('due_now_hint_annual') : undefined} value={fmt.usd(estimate.dueNowCents)} testId="estimate-due-now" strong />
          {estimate.monthlyEquivalentCents !== null && planId !== 'free' ? (
            <Total
              label={tc('base_equivalent')}
              hint={tc('base_equivalent_hint')}
              value={`${fmt.usd(estimate.monthlyEquivalentCents)}${t('per_month')}`}
              testId="estimate-equivalent"
            />
          ) : null}
        </dl>

        {result.included.some((row) => row.purchased > 0) ? (
          <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
            <h4 className="text-sm font-semibold text-stone-900 dark:text-white">{tc('included_title')}</h4>
            <ul className="mt-2 space-y-1 text-sm text-stone-700 dark:text-stone-300">
              {result.included
                .filter((row) => row.purchased > 0)
                .map((row) => (
                  <li key={row.unit} data-testid={`estimate-units-${row.field}`}>
                    {tc(`fields.${row.field}`)}:{' '}
                    {tc('included_vs_purchased', {
                      included: row.included === null ? t('not_included_short') : fmt.count(row.included),
                      purchased: fmt.count(row.purchased),
                      requested: fmt.count(row.requested),
                    })}
                    {row.purchased > row.requested ? ` ${tc('rounding_extra', { count: row.purchased - row.requested, amount: fmt.count(row.purchased - row.requested) })}` : ''}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <ul className="mt-4 space-y-1 border-t border-stone-200 pt-4 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
          {result.nextRenewal ? (
            <li>{tc(interval === 'annual' ? 'next_renewal_annual' : 'next_renewal', { date: date(result.nextRenewal) })}</li>
          ) : (
            <li>{tc('free_renewal')}</li>
          )}
          {result.allowanceRenewal ? <li>{tc('allowance_renewal', { date: date(result.allowanceRenewal) })}</li> : null}
          {result.packExpiry ? <li>{tc('pack_expiry', { date: date(result.packExpiry) })}</li> : null}
          {result.restricted.map((item) => (
            <li key={item.field} className="text-amber-800 dark:text-amber-300">
              {tc('restricted', { item: tc(`fields.${item.field}`), plan: fmt.planName(item.requiredPlan) })}
            </li>
          ))}
          <li>{tc('checkout_preview_note')}</li>
          <li>{t('taxes_note')}</li>
          <li className="text-xs">
            {tc('catalog_version')} {availability.catalogVersion ?? CATALOG_VERSION}
          </li>
        </ul>

        <div className="mt-4">
          <Button variant="secondary" onClick={() => void copyEstimate()}>
            {copied ? tc('copied') : tc('copy')}
          </Button>
        </div>
        {copyFallback ? (
          <div className="mt-3">
            <label htmlFor="estimate-copy" className="text-sm text-stone-600 dark:text-stone-400">
              {tc('copy_failed')}
            </label>
            <textarea id="estimate-copy" readOnly className="input-field mt-2 h-48" value={copyFallback} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Total({
  label,
  hint,
  value,
  testId,
  strong = false,
}: {
  label: string;
  hint?: string;
  value: string;
  testId: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className={strong ? 'font-semibold text-stone-900 dark:text-white' : 'text-stone-600 dark:text-stone-400'}>
        {label}
        {hint ? <span className="block text-xs font-normal text-stone-500 dark:text-stone-400">{hint}</span> : null}
      </dt>
      <dd data-testid={testId} className={strong ? 'text-base font-bold tabular-nums text-stone-900 dark:text-white' : 'font-semibold tabular-nums text-stone-900 dark:text-white'}>
        {value}
      </dd>
    </div>
  );
}
