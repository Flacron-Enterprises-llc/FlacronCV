'use client';

import { useTranslations } from 'next-intl';
import type { Addon } from '@flacroncv/career-shared';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { catalogAddons } from './estimate-model';
import { addonOnSale, usePlanAvailability } from './plan-availability';
import { usePlanFormat } from './plan-format';

const GROUPS = [
  { kind: 'usage_pack', title: 'group_packs' },
  { kind: 'capacity', title: 'group_capacity' },
  { kind: 'balance', title: 'group_balance' },
  { kind: 'organization', title: 'group_business' },
] as const;

/** "10 document credits", "10 GB", "1 staff seat"… from the add-on's unit and size. */
export function useAddonAllowance() {
  const t = useTranslations('plan_catalog.allowance');
  const fmt = usePlanFormat();
  return (addon: Addon): string => {
    if (addon.unit === 'storage_byte') return fmt.storage(addon.units);
    if (addon.unit === 'messaging_balance') return t('messaging_balance');
    if (addon.unit === 'white_label') return t('white_label');
    if (addon.unit === 'api_read') return t('api_read', { count: addon.units, amount: fmt.count(addon.units) });
    return t(addon.unit, { count: addon.units, amount: fmt.count(addon.units) });
  };
}

/**
 * The add-on catalog (spec §9 and the §10 organization add-ons): every pack
 * with its price, allowance, plan restriction, one-time or monthly billing and
 * the twelve-month expiry of one-time packs. An add-on is purchasable only when
 * the server has a price for it; otherwise it says "Not on sale yet".
 */
export function AddonCatalog({
  onBuy,
  buying,
  includeAddons = false,
}: {
  /** Signed-in callers: read which add-ons are on sale from the career billing status. */
  includeAddons?: boolean;
  /** Billing page only: starts checkout for an on-sale add-on. Without it on-sale items say where to buy. */
  onBuy?: (addonId: string) => void;
  buying?: string | null;
}) {
  const t = useTranslations('plan_catalog');
  const fmt = usePlanFormat();
  const allowance = useAddonAllowance();
  const { availability } = usePlanAvailability({ includeAddons });
  const addons = catalogAddons();

  return (
    <div>
      <h3 id="addons-title" className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('addons_title')}
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-stone-600 dark:text-stone-400">{t('addons_intro')}</p>
      {GROUPS.map((group) => {
        const items = addons.filter((addon) => addon.kind === group.kind);
        if (items.length === 0) return null;
        return (
          <section key={group.kind} className="mt-6" aria-labelledby={`addons-${group.kind}`}>
            <h4 id={`addons-${group.kind}`} className="text-base font-semibold text-stone-900 dark:text-white">
              {t(group.title)}
            </h4>
            <ul className="mt-2 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white dark:divide-stone-700 dark:border-stone-700 dark:bg-stone-900">
              {items.map((addon) => {
                const onSale = addonOnSale(availability, addon.id);
                const priceText =
                  addon.billing === 'monthly'
                    ? `${fmt.usd(addon.priceCents)}${t('per_month')}`
                    : fmt.usd(addon.priceCents);
                return (
                  <li key={addon.id} data-testid={`addon-${addon.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="font-medium text-stone-900 dark:text-white">{t(`addons.${addon.id}`)}</p>
                      <p className="text-sm text-stone-600 dark:text-stone-400">
                        {allowance(addon)}
                        {' · '}
                        {addon.billing === 'monthly'
                          ? t('billing_monthly')
                          : addon.expiresAfterMonths
                            ? t('billing_one_time_expiry', { months: addon.expiresAfterMonths })
                            : t('billing_one_time')}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('requires_plan', { plan: fmt.planName(addon.minPlan) })}
                      </p>
                    </div>
                    <p className="whitespace-nowrap font-semibold tabular-nums text-stone-900 dark:text-white">
                      {addon.firmPrice ? priceText : t('price_from', { amount: priceText })}
                    </p>
                    <div className="shrink-0">
                      {onSale && addon.firmPrice && onBuy ? (
                        <Button size="sm" variant="outline" onClick={() => onBuy(addon.id)} loading={buying === addon.id}>
                          {t('buy')}
                        </Button>
                      ) : onSale && addon.firmPrice ? (
                        <Badge variant="success">{t('on_sale')}</Badge>
                      ) : (
                        <Badge variant="warning">{t('not_on_sale')}</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">{t('addons_rules')}</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('addons_human_services')}</p>
    </div>
  );
}
