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

/**
 * The same facts as a compact job card line-up for result lists: employer and
 * place under the title, the stated terms as chips, dates in small print, and
 * one muted line for what the listing does not state (still never guessed).
 * The detail page keeps the full labelled list.
 */
export function ListingSummary({ item }: { item: OpportunityItem }) {
  const t = useTranslations('career.opportunities');
  const locale = useLocale();
  const fields = fieldsForCategory(item.category);
  const pay = formatPay(item.compensation, locale);
  const period = item.compensation.period && PERIODS.has(item.compensation.period) ? item.compensation.period : null;
  const chips: string[] = [];
  const missing: string[] = [];
  if (!item.organization) missing.push(t('field_employer'));
  if (item.locations.length === 0) missing.push(t('field_location'));
  if (isOpportunityCategory(item.category) && item.category !== 'job') chips.push(t(`category_${item.category}`));
  if (item.arrangement) chips.push(t(`arrangement_${item.arrangement}`));
  if (item.remoteRestriction) chips.push(item.remoteRestriction);
  if (fields.employment) {
    if (pay) chips.push(period ? t(`pay_per_${period}`, { pay }) : pay);
    else missing.push(t('field_pay'));
    if (item.schedule) chips.push(t(`schedule_${item.schedule}`));
    if (item.seniority) chips.push(t(`seniority_${item.seniority}`));
    if (item.sponsorship !== 'unknown') chips.push(`${t('field_sponsorship')}: ${t(`sponsorship_${item.sponsorship}`)}`);
  }
  // Category-specific facts (a scholarship's funding, an event's date, …).
  for (const field of fields.details) {
    const value = item.details?.[field] ?? null;
    if (value) chips.push(field === 'eventDate' ? formatDay(value, locale) : value);
    else missing.push(t(`detail_${field}` as `detail_${ListingDetailField}`));
  }
  const dates = [
    item.publishedAt ? `${t('field_published')} ${formatDay(item.publishedAt, locale)}` : null,
    item.deadline ? `${t('field_deadline')} ${formatDay(item.deadline, locale)}` : null,
  ].filter(Boolean);
  if (!item.deadline) missing.push(t('field_deadline'));

  return (
    <div className="min-w-0">
      {item.organization || item.locations.length > 0 ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-career-ink/80">
          {item.organization ? <span className="font-medium" dir="auto">{item.organization}</span> : null}
          {item.organization && item.locations.length > 0 ? <span aria-hidden="true" className="text-career-muted">·</span> : null}
          {item.locations.length > 0 ? <span className="min-w-0 truncate" dir="auto">{item.locations.slice(0, 2).join(' · ')}</span> : null}
        </p>
      ) : null}
      {chips.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip} className="rounded-full border border-career-line bg-career-wash px-2.5 py-0.5 text-xs font-medium text-career-ink" dir="auto">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      {item.arrangement === 'remote' && !item.remoteRestriction ? <p className="mt-2 text-xs text-career-muted">{t('remote_not_worldwide')}</p> : null}
      {dates.length > 0 ? <p className="mt-2.5 text-xs text-career-muted">{dates.join(' · ')}</p> : null}
      {missing.length > 0 ? (
        <p className="mt-1 text-xs text-career-muted">{t('not_stated_list', { fields: new Intl.ListFormat(locale, { type: 'conjunction' }).format(missing) })}</p>
      ) : null}
    </div>
  );
}
