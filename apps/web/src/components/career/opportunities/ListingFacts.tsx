'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { OpportunityItem } from '@flacroncv/career-api-client';

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

/**
 * The stated facts of a listing, each with its label. Unknown fields are not
 * listed one by one; a single line says what the listing did not state.
 */
export function ListingFacts({ item, className }: { item: OpportunityItem; className?: string }) {
  const t = useTranslations('career.opportunities');
  const locale = useLocale();
  const pay = formatPay(item.compensation, locale);
  const period = item.compensation.period && PERIODS.has(item.compensation.period) ? item.compensation.period : null;
  const rows: Array<[string, string]> = [];
  if (item.organization) rows.push([t('field_employer'), item.organization]);
  if (item.locations.length > 0) rows.push([t('field_location'), item.locations.join(' · ')]);
  if (pay) rows.push([t('field_pay'), period ? t(`pay_per_${period}`, { pay }) : pay]);
  if (item.sponsorship !== 'unknown') rows.push([t('field_sponsorship'), t(`sponsorship_${item.sponsorship}`)]);
  const missing = [
    item.organization ? null : t('field_employer'),
    item.locations.length > 0 ? null : t('field_location'),
    pay ? null : t('field_pay'),
  ].filter((value): value is string => value !== null);

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
      {missing.length > 0 ? (
        <p className="mt-1 text-sm text-career-muted">{t('not_stated_list', { fields: new Intl.ListFormat(locale, { type: 'conjunction' }).format(missing) })}</p>
      ) : null}
    </div>
  );
}
