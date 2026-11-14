'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { OpportunityItem } from '@flacroncv/career-api-client';
import { fieldsForCategory, isOpportunityCategory, type ListingDetailField } from '@flacroncv/career-shared';

/**
 * "60,000–70,000 US$ per year" in the interface language, or null when the
 * listing states no pay. A currency code that Intl does not know is shown as
 * the plain number.
 */
export function formatPay(compensation: OpportunityItem['compensation'], locale: string): string | null {
  const { minimum, maximum, currency } = compensation;
  if (minimum === null && maximum === null) return null;
  let format: Intl.NumberFormat;
  try {
    format = currency
      ? new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  } catch {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  }
  if (minimum !== null && maximum !== null && maximum !== minimum) return format.formatRange(minimum, maximum);
  return format.format((minimum ?? maximum) as number);
}

const PERIODS = new Set(['hour', 'day', 'week', 'month', 'year']);

/** A YYYY-MM-DD date in the interface language, read as a calendar day (no time zone shift). */
export function formatDay(value: string, locale: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/**
 * The stated facts of a listing, each with its label. Which fields appear
 * depends on the category: a scholarship shows its deadline, funding and
 * eligibility rather than pay and sponsorship (spec section 23). Unknown
 * fields are not listed one by one; a single line says what was not stated.
 */
export function ListingFacts({ item, className }: { item: OpportunityItem; className?: string }) {
  const t = useTranslations('career.opportunities');
  const locale = useLocale();
  const fields = fieldsForCategory(item.category);
  const pay = formatPay(item.compensation, locale);
  const period = item.compensation.period && PERIODS.has(item.compensation.period) ? item.compensation.period : null;
  const rows: Array<[string, string]> = [];
  const missing: string[] = [];

  if (isOpportunityCategory(item.category)) rows.push([t('field_category'), t(`category_${item.category}`)]);
  if (item.organization) rows.push([t('field_employer'), item.organization]);
  else missing.push(t('field_employer'));
  if (item.locations.length > 0) rows.push([t('field_location'), item.locations.join(' · ')]);
  else missing.push(t('field_location'));
  if (item.arrangement) rows.push([t('field_arrangement'), t(`arrangement_${item.arrangement}`)]);
  if (item.remoteRestriction) rows.push([t('field_remote_restriction'), item.remoteRestriction]);

  if (fields.employment) {
    if (pay) rows.push([t('field_pay'), period ? t(`pay_per_${period}`, { pay }) : pay]);
    else missing.push(t('field_pay'));
    if (item.sponsorship !== 'unknown') rows.push([t('field_sponsorship'), t(`sponsorship_${item.sponsorship}`)]);
    if (item.schedule) rows.push([t('field_schedule'), t(`schedule_${item.schedule}`)]);
    if (item.seniority) rows.push([t('field_seniority'), t(`seniority_${item.seniority}`)]);
  }
  for (const field of fields.details) {
    const value = item.details?.[field] ?? null;
    if (value) rows.push([t(`detail_${field}` as `detail_${ListingDetailField}`), field === 'eventDate' ? formatDay(value, locale) : value]);
    else missing.push(t(`detail_${field}` as `detail_${ListingDetailField}`));
  }
  if (item.publishedAt) rows.push([t('field_published'), formatDay(item.publishedAt, locale)]);
  if (item.deadline) rows.push([t('field_deadline'), formatDay(item.deadline, locale)]);
  else missing.push(t('field_deadline'));

  return (
    <div className={className}>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold text-career-muted">{label}</dt>
              <dd className="text-career-ink" dir="auto">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.arrangement === 'remote' && !item.remoteRestriction ? (
        <p className="mt-1 text-sm text-career-muted">{t('remote_not_worldwide')}</p>
      ) : null}
      {missing.length > 0 ? (
        <p className="mt-1 text-sm text-career-muted">{t('not_stated_list', { fields: new Intl.ListFormat(locale, { type: 'conjunction' }).format(missing) })}</p>
      ) : null}
    </div>
  );
}
