'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  ALLOWANCES,
  CATALOG_VERSION,
  RECOMMENDED_PLAN_ID,
  estimate,
  formatCount,
  formatUsd,
  monthlyEquivalentCents,
  planMeets,
  subscriptionChargeCents,
  trialFor,
  type BillingInterval,
  type DesiredUnits,
  type PlanAllowances,
  type PlanId,
} from '@flacroncv/career-shared';
import type { ApiClient } from '@flacroncv/career-api-client';
import { Link } from '@/i18n/routing';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { ContactSalesForm } from './ContactSalesForm';

/**
 * Career plans sold as an add-on. The career catalog's Free plan is not
 * offered: without a purchased add-on a FlacronCV account has no career
 * access (docs/V2_INTEGRATION.md §0.2), so a "$0 career plan" would mislead.
 */
export const CAREER_PRICING_PLANS = ['starter', 'professional', 'career_pro', 'business'] as const satisfies readonly PlanId[];
type SoldPlan = (typeof CAREER_PRICING_PLANS)[number];

/** Where a signed-in customer buys a career plan (V1 billing). */
export const CAREER_PLANS_PATH = '/career/plans';

const QUANTITY_CAP = 10_000;

/** Every allowance V2's comparison table lists, in the same order. */
const ROWS: ReadonlyArray<keyof PlanAllowances> = [
  'documentCredits',
  'alertItems',
  'alertIntelligence',
  'alertDelivery',
  'savedSearches',
  'locationProfiles',
  'localRadiusMiles',
  'textInterviewSessions',
  'voiceMinutes',
  'resumeVersions',
  'resumeAnalyses',
  'actionPacks',
  'trackedApplications',
  'coachingResponses',
  'pdfExport',
  'docxExport',
  'skillReports',
  'scenarioReports',
  'evidenceItems',
  'portfolioPages',
  'portfolioAnalytics',
  'projectBriefInSkillReport',
  'assistedForms',
  'mapSessions',
  'applicationAnalytics',
  'staffSeats',
  'activeCandidates',
];

const DEFINITIONS = [
  'documentCredits',
  'resumeAnalyses',
  'actionPacks',
  'alertItems',
  'textInterviewSessions',
  'voiceMinutes',
  'skillReports',
  'scenarioReports',
  'coachingResponses',
  'assistedForms',
] as const;

const INTERVALS = ['monthly', 'annual'] as const;

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950';
const linkButton = cn(
  'inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
  focusRing,
);

function monthsFree(id: PlanId): number {
  const monthly = subscriptionChargeCents(id, 'monthly');
  const annual = subscriptionChargeCents(id, 'annual');
  if (monthly <= 0) return 0;
  return 12 - Math.round(annual / monthly);
}

/** Whole numbers 0..10,000; anything else leaves the field unchanged. */
export function parseQuantity(value: string): number | null {
  if (value.trim() === '') return 0;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed > QUANTITY_CAP) return null;
  return parsed;
}

/**
 * The career tools add-on on the public pricing page: a port of V2's pricing
 * page (plan cards, allowance comparison, definitions, cost estimate and the
 * Business contact form) inside V1's look. Prices and allowances come straight
 * from the career catalog. Only the plan itself (Starter, Professional, Career
 * Pro) can be bought, in the customer's account; packs, extra capacity and
 * Business seats are estimated from the catalog but are not on sale.
 */
export function CareerPricing({ api }: { api?: ApiClient } = {}) {
  const t = useTranslations('career_pricing');
  const tPlan = useTranslations('career.plans.plan');
  const { user } = useAuth();
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [planId, setPlanId] = useState<SoldPlan>(RECOMMENDED_PLAN_ID as SoldPlan);
  const [documents, setDocuments] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [actions, setActions] = useState(0);
  const [voice, setVoice] = useState(0);
  const [locations, setLocations] = useState(0);
  const [staff, setStaff] = useState(0);
  const [candidates, setCandidates] = useState(0);
  const [storageBlocks, setStorageBlocks] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState('');

  const pro = planMeets(planId, 'professional');
  const isBusiness = planId === 'business';
  // Signed out: create the V1 account first, then land on the career plans page.
  const buyHref = user ? CAREER_PLANS_PATH : `/register?callbackUrl=${encodeURIComponent(CAREER_PLANS_PATH)}`;

  const result = useMemo(() => {
    const desired: DesiredUnits[] = [
      { unit: 'document_credit', units: documents },
      { unit: 'alert_item', units: alerts },
      { unit: 'action_pack', units: pro ? actions : 0 },
      { unit: 'voice_minute', units: pro ? voice : 0 },
    ];
    return estimate({
      planId,
      interval,
      desired: desired.filter((item) => item.units > 0),
      recurring: [
        { addonId: 'location_extra', quantity: locations },
        { addonId: 'staff_seat', quantity: isBusiness ? staff : 0 },
        { addonId: 'candidates_25', quantity: isBusiness ? candidates : 0 },
        { addonId: 'storage_100gb_business', quantity: isBusiness ? storageBlocks : 0 },
      ],
    });
  }, [actions, alerts, candidates, documents, interval, isBusiness, locations, planId, pro, staff, storageBlocks, voice]);

  /** Anything other than a Starter, Professional or Career Pro plan line cannot be bought yet. */
  const onSale = (lineId: string) => lineId === planId && !isBusiness;

  function formatAllowance(id: PlanId, key: keyof PlanAllowances): string {
    const value = ALLOWANCES[id][key];
    if (typeof value === 'boolean') return value ? t('yes') : t('not_included');
    if (value === null || value === undefined) return t('not_included');
    if (key === 'alertIntelligence') return t(`intel.${value as string}`);
    if (key === 'alertDelivery') return t(`delivery.${value as string}`);
    if (key === 'applicationAnalytics' || key === 'portfolioAnalytics') {
      return value === 'none' ? t('not_included') : t(`levels.${value as string}`);
    }
    if (key === 'localRadiusMiles') return t('miles', { count: formatCount(value as number) });
    if (typeof value === 'number') return formatCount(value);
    return String(value);
  }

  function lineName(id: string): string {
    return id === planId ? `${t('base')}: ${tPlan(planId)}` : t(`addons.${id}`);
  }

  function estimateText(): string {
    const itemLines = result.lines.map(
      (line) =>
        `${lineName(line.id)} x ${formatCount(line.quantity)}: ${formatUsd(line.lineCents)}${onSale(line.id) ? '' : ` (${t('not_on_sale')})`}`,
    );
    return [
      t('copy_heading'),
      `${t('plan')}: ${tPlan(planId)}`,
      `${t('interval_label')}: ${t(interval)}`,
      ...itemLines,
      `${t('recurring')}: ${formatUsd(result.recurringMonthlyCents)}`,
      `${t('one_time')}: ${formatUsd(result.oneTimeCents)}`,
      `${t('due_now')}: ${formatUsd(result.dueNowCents)}`,
      t('in_addition_note'),
      t('not_on_sale_note'),
      t('currency_usd'),
      `${t('estimate_date')}: ${new Date().toISOString().slice(0, 10)}`,
      `${t('catalog_version')}: ${result.catalogVersion}`,
      t('taxes'),
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

  function onQuantity(value: string, set: (next: number) => void) {
    const parsed = parseQuantity(value);
    if (parsed !== null) {
      set(parsed);
      setCopied(false);
    }
  }

  // Radio-group keyboard pattern: arrows move and select, Tab leaves the group.
  function onIntervalKey(event: KeyboardEvent<HTMLButtonElement>, value: BillingInterval) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const index = INTERVALS.indexOf(value);
    const next = INTERVALS[(index + 1) % INTERVALS.length];
    setBillingInterval(next);
    setCopied(false);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[INTERVALS.indexOf(next)]?.focus();
  }

  return (
    <section
      id="career"
      aria-labelledby="career-pricing-title"
      className="scroll-mt-20 border-t border-stone-200 bg-white py-16 sm:py-20 dark:border-stone-800 dark:bg-stone-950"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">{t('eyebrow')}</p>
        <h2 id="career-pricing-title" className="mt-2 max-w-3xl text-3xl font-extrabold tracking-tight text-stone-900 dark:text-white sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-stone-600 dark:text-stone-400">{t('lede')}</p>
        <ul className="mt-4 max-w-3xl list-disc space-y-1 ps-5 text-sm text-stone-700 dark:text-stone-300">
          <li>{t('in_addition_note')}</li>
          <li>{t('credits_note')}</li>
          <li>{t('no_trial')}</li>
        </ul>

        <div
          role="radiogroup"
          aria-label={t('interval_label')}
          className="mt-8 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-800"
        >
          {INTERVALS.map((value) => {
            const checked = interval === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => {
                  setBillingInterval(value);
                  setCopied(false);
                }}
                onKeyDown={(event) => onIntervalKey(event, value)}
                className={cn(
                  'rounded-full px-5 py-2 text-sm font-medium transition-colors',
                  focusRing,
                  checked
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white',
                )}
              >
                {t(value)}
              </button>
            );
          })}
        </div>

        <div className="mt-10 grid items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {CAREER_PRICING_PLANS.map((id) => {
            const recommended = id === RECOMMENDED_PLAN_ID;
            const allowance = ALLOWANCES[id];
            const trial = trialFor(id, interval);
            const monthly = subscriptionChargeCents(id, 'monthly');
            const annual = subscriptionChargeCents(id, 'annual');
            return (
              <article
                key={id}
                aria-labelledby={`career-plan-${id}`}
                data-testid={`career-plan-${id}`}
                className={cn(
                  'flex min-w-0 flex-col rounded-2xl border p-6',
                  recommended
                    ? 'border-brand-500 bg-white shadow-xl ring-1 ring-brand-500 dark:border-brand-400 dark:bg-stone-800 dark:ring-brand-400'
                    : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800',
                )}
              >
                <h3 id={`career-plan-${id}`} className="text-xl font-bold text-stone-900 dark:text-white">
                  {tPlan(id)}
                </h3>
                {recommended ? (
                  <Badge variant="brand" className="mt-2 self-start whitespace-normal">
                    {t('recommended')}
                  </Badge>
                ) : null}
                <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t(`positioning.${id}`)}</p>
                <div className="mt-5">
                  {interval === 'monthly' ? (
                    <>
                      <p className="flex flex-wrap items-baseline gap-1">
                        <span className="text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">{formatUsd(monthly)}</span>
                        <span className="text-sm text-stone-500 dark:text-stone-400">{t('per_month')}</span>
                      </p>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {t('or_annual', { amount: formatUsd(annual), months: monthsFree(id) })}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flex flex-wrap items-baseline gap-1">
                        <span className="text-3xl font-extrabold tabular-nums text-stone-900 dark:text-white">{formatUsd(annual)}</span>
                        <span className="text-sm text-stone-500 dark:text-stone-400">{t('per_year')}</span>
                      </p>
                      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {t('billed_monthly_equivalent', { amount: formatUsd(monthlyEquivalentCents(annual)) })}
                      </p>
                    </>
                  )}
                  <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-400">{t('in_addition')}</p>
                  {trial ? (
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('trial_not_offered', { days: trial.days })}</p>
                  ) : null}
                </div>
                <dl className="mt-5 flex-1 space-y-2 text-sm">
                  <Fact label={t('documents')} value={allowance.documentCredits} />
                  <Fact label={t('features.alertItems')} value={allowance.alertItems} />
                  <div>
                    <dt className="text-stone-500 dark:text-stone-400">{t('alert_intelligence')}</dt>
                    <dd className="mt-0.5 text-stone-800 dark:text-stone-200">{t(`intel.${allowance.alertIntelligence}`)}</dd>
                  </div>
                  <Fact label={t('saved_searches')} value={allowance.savedSearches} />
                  <Fact label={t('location_profiles')} value={allowance.locationProfiles} />
                  <div>
                    <dt className="text-stone-500 dark:text-stone-400">{t('interview')}</dt>
                    <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
                      {allowance.textInterviewSessions === null
                        ? t('not_included')
                        : t('sessions', { count: formatCount(allowance.textInterviewSessions) })}
                    </dd>
                    {allowance.voiceMinutes !== null ? (
                      <dd className="mt-0.5 text-stone-800 dark:text-stone-200">
                        {t('minutes', { count: formatCount(allowance.voiceMinutes) })}
                      </dd>
                    ) : null}
                  </div>
                </dl>
                <div className="mt-6">
                  {id === 'business' ? (
                    <>
                      <a
                        href="#contact-sales"
                        className={cn(linkButton, 'border border-brand-600 text-brand-600 hover:bg-brand-50 dark:border-brand-500/60 dark:text-brand-400 dark:hover:bg-brand-950/50')}
                      >
                        {t('contact_sales')}
                      </a>
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('business_not_sold')}</p>
                    </>
                  ) : (
                    <Link
                      href={buyHref}
                      className={cn(
                        linkButton,
                        recommended
                          ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                          : 'border border-brand-600 text-brand-600 hover:bg-brand-50 dark:border-brand-500/60 dark:text-brand-400 dark:hover:bg-brand-950/50',
                      )}
                    >
                      {t(`choose_${id}`)}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-stone-600 dark:text-stone-400">{user ? t('cta_signed_in_note') : t('cta_signed_out_note')}</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('taxes')}</p>

        <section className="mt-14" aria-labelledby="career-compare-title">
          <h3 id="career-compare-title" className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('compare_title')}
          </h3>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400 xl:hidden">{t('scroll_hint')}</p>
          {/* The scroll region is focusable so keyboard users can scroll it sideways. */}
          <div
            className="mt-4 max-w-full overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700"
            tabIndex={0}
            role="region"
            aria-labelledby="career-compare-title"
          >
            <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{t('compare_title')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky start-0 z-[1] min-w-[11rem] border-b border-e border-stone-200 bg-stone-50 px-3 py-3 text-start font-semibold text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white">
                    {t('feature')}
                  </th>
                  {CAREER_PRICING_PLANS.map((id) => (
                    <th key={id} scope="col" className="min-w-[7rem] border-b border-stone-200 bg-stone-50 px-3 py-3 text-start font-semibold text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white">
                      {tPlan(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="sticky start-0 z-[1] border-b border-e border-stone-200 bg-white px-3 py-3 text-start font-medium text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-white">
                    {t('price')}
                  </th>
                  {CAREER_PRICING_PLANS.map((id) => (
                    <td key={id} className="whitespace-nowrap border-b border-stone-200 px-3 py-3 tabular-nums text-stone-800 dark:border-stone-700 dark:text-stone-200">
                      {formatUsd(subscriptionChargeCents(id, interval))}
                    </td>
                  ))}
                </tr>
                {ROWS.map((key) => (
                  <tr key={key}>
                    <th scope="row" className="sticky start-0 z-[1] border-b border-e border-stone-200 bg-white px-3 py-3 text-start font-medium text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-white">
                      {t(`features.${key}`)}
                    </th>
                    {CAREER_PRICING_PLANS.map((id) => (
                      <td
                        key={id}
                        className={cn(
                          'border-b border-stone-200 px-3 py-3 text-stone-800 dark:border-stone-700 dark:text-stone-200',
                          typeof ALLOWANCES[id][key] === 'number' && 'whitespace-nowrap tabular-nums',
                        )}
                      >
                        {formatAllowance(id, key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t('pooled_note')}</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('providers_note')}</p>

          <h3 className="mt-10 text-lg font-bold text-stone-900 dark:text-white">{t('definitions_title')}</h3>
          <div className="mt-3 border-t border-stone-200 dark:border-stone-700">
            {DEFINITIONS.map((key) => (
              <details key={key} className="border-b border-stone-200 py-3 dark:border-stone-700">
                <summary className={cn('cursor-pointer rounded font-semibold text-stone-900 dark:text-white', focusRing)}>
                  {t(`features.${key}`)}
                </summary>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t(`definitions.${key}`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="career-calculator" className="mt-14 scroll-mt-20" aria-labelledby="career-calculator-title">
          <h3 id="career-calculator-title" className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('calculator_title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{t('calculator_help')}</p>
          <p role="note" className="mt-3 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {t('not_on_sale_note')}
          </p>
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t('quantity_cap')}</p>
          {!pro ? <p className="mt-2 text-sm font-semibold text-stone-800 dark:text-stone-200">{t('professional_required')}</p> : null}
          {!isBusiness ? <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t('business_only')}</p> : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="career-estimate-plan" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                {t('plan')}
              </label>
              <select
                id="career-estimate-plan"
                value={planId}
                onChange={(event) => {
                  setPlanId(event.target.value as SoldPlan);
                  setCopied(false);
                }}
                className="input-field h-10"
              >
                {CAREER_PRICING_PLANS.map((id) => (
                  <option key={id} value={id}>
                    {tPlan(id)}
                  </option>
                ))}
              </select>
            </div>
            <QuantityField id="career-estimate-documents" label={t('documents_label')} value={documents} onChange={(v) => onQuantity(v, setDocuments)} />
            <QuantityField id="career-estimate-alerts" label={t('alerts_label')} value={alerts} onChange={(v) => onQuantity(v, setAlerts)} />
            <QuantityField id="career-estimate-actions" label={t('actions_label')} value={actions} disabled={!pro} onChange={(v) => onQuantity(v, setActions)} />
            <QuantityField id="career-estimate-voice" label={t('voice_label')} value={voice} disabled={!pro} onChange={(v) => onQuantity(v, setVoice)} />
            <QuantityField id="career-estimate-locations" label={t('locations_label')} value={locations} onChange={(v) => onQuantity(v, setLocations)} />
            {isBusiness ? (
              <>
                <QuantityField id="career-estimate-staff" label={t('staff_label')} value={staff} onChange={(v) => onQuantity(v, setStaff)} />
                <QuantityField id="career-estimate-candidates" label={t('candidates_label')} value={candidates} onChange={(v) => onQuantity(v, setCandidates)} />
                <QuantityField id="career-estimate-storage" label={t('storage_label')} value={storageBlocks} onChange={(v) => onQuantity(v, setStorageBlocks)} />
              </>
            ) : null}
          </div>

          <div aria-live="polite" data-testid="career-estimate" className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:p-6 dark:border-stone-700 dark:bg-stone-900">
            <ul className="space-y-2 text-sm">
              {result.lines.map((line) => (
                <li key={`${line.id}-${line.billing}`} className="flex justify-between gap-3">
                  <span className="text-stone-600 dark:text-stone-400">
                    {lineName(line.id)}
                    {line.quantity > 1 ? ` × ${formatCount(line.quantity)}` : ''}
                    {line.billing === 'one_time' && line.unitsPurchased
                      ? ` (${t('credits_purchased', { count: formatCount(line.unitsPurchased) })})`
                      : ''}
                    {onSale(line.id) ? null : (
                      <Badge variant="warning" className="ms-2">
                        {t('not_on_sale')}
                      </Badge>
                    )}
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-stone-900 dark:text-white">{formatUsd(line.lineCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm dark:border-stone-700">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600 dark:text-stone-400">{t('recurring')}</dt>
                <dd data-testid="career-estimate-recurring" className="font-semibold tabular-nums text-stone-900 dark:text-white">
                  {formatUsd(result.recurringMonthlyCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-600 dark:text-stone-400">{t('one_time')}</dt>
                <dd data-testid="career-estimate-one-time" className="font-semibold tabular-nums text-stone-900 dark:text-white">
                  {formatUsd(result.oneTimeCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-base">
                <dt className="font-semibold text-stone-900 dark:text-white">{t('due_now')}</dt>
                <dd data-testid="career-estimate-due-now" className="font-bold tabular-nums text-stone-900 dark:text-white">
                  {formatUsd(result.dueNowCents)}
                </dd>
              </div>
              {interval === 'annual' ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-600 dark:text-stone-400">{t('ongoing_monthly')}</dt>
                  <dd className="font-semibold tabular-nums text-stone-900 dark:text-white">{formatUsd(result.recurringMonthlyCents)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{t('in_addition_note')}</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('taxes')}</p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {t('catalog_version')} {CATALOG_VERSION}
            </p>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => void copyEstimate()}>
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
            {copyFallback ? (
              <div className="mt-3">
                <label htmlFor="career-estimate-copy" className="text-sm text-stone-600 dark:text-stone-400">
                  {t('copy_failed')}
                </label>
                <textarea id="career-estimate-copy" readOnly className="input-field mt-2 h-40" value={copyFallback} />
              </div>
            ) : null}
          </div>
        </section>

        <section
          id="contact-sales"
          aria-labelledby="contact-sales-title"
          className="mt-14 scroll-mt-20 rounded-2xl border border-stone-200 bg-stone-50 p-6 dark:border-stone-700 dark:bg-stone-900"
        >
          <h3 id="contact-sales-title" className="text-xl font-bold text-stone-900 dark:text-white">
            {t('contact_title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{t('contact_body')}</p>
          <p className="mt-2 text-sm font-medium text-stone-800 dark:text-stone-200">{t('seats_prompt')}</p>
          <ContactSalesForm api={api} />
        </section>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number | null }) {
  const t = useTranslations('career_pricing');
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="min-w-0 text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="ms-auto shrink-0 font-semibold tabular-nums text-stone-900 dark:text-white">
        {value === null ? t('not_included') : formatCount(value)}
      </dd>
    </div>
  );
}

function QuantityField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700 dark:text-stone-300">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        disabled={disabled}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        className="input-field h-10 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
