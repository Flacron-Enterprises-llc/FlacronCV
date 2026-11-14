'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { newIdempotencyKey, type ApiClient, type ScenarioResult } from '@flacroncv/career-api-client';
import { Button, Card, ConfirmDialog, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

interface RouteDraft {
  name: string;
  destination: string;
  /** Whole currency units as typed; converted to cents when sent. */
  pay: string;
}

const EMPTY: RouteDraft = { name: '', destination: '', pay: '' };
const MAX_ROUTES = 3;

/** "55 000" / "55,000.50" -> cents; null when blank; NaN when not a number. */
export function payToCents(value: string): number | null {
  const clean = value.replace(/[\s,]/g, '');
  if (clean === '') return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

export function ScenariosPanel({ api }: { api: ApiClient }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const { busy, run } = useScopeBusy();
  const [routes, setRoutes] = useState<RouteDraft[]>([{ ...EMPTY }]);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [confirming, setConfirming] = useState(false);

  const filled = routes.filter((route) => route.name.trim() && route.destination.trim());
  const badPay = routes.some((route) => Number.isNaN(payToCents(route.pay)));

  function update(index: number, patch: Partial<RouteDraft>) {
    setRoutes((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function ask() {
    setNote(null);
    if (filled.length === 0) {
      setNote({ tone: 'error', key: 'scenario_need_route' });
      return;
    }
    if (badPay) {
      setNote({ tone: 'error', key: 'scenario_bad_pay' });
      return;
    }
    setConfirming(true);
  }

  async function compare() {
    await run(async () => {
      setResult(null);
      try {
        const options = filled.slice(0, MAX_ROUTES).map((route) => ({
          name: route.name.trim(),
          destination: route.destination.trim(),
          costCents: 0,
          months: 12,
          wageCents: payToCents(route.pay),
          source: 'user' as const,
        }));
        const paid = await api.createScenario(options, newIdempotencyKey());
        setResult(paid.result);
      } catch (error) {
        setNote(errorNote(error));
      } finally {
        setConfirming(false);
      }
    });
  }

  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  return (
    <Card>
      <div className="grid grid-cols-1 gap-4">
        {routes.map((route, index) => (
          <fieldset key={index} className="grid grid-cols-1 gap-3 rounded-md border border-career-line p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-semibold text-career-ink">{t('route_n', { n: index + 1 })}</legend>
            <Input label={t('option_name')} placeholder={t('option_name_placeholder')} value={route.name} onChange={(event) => update(index, { name: event.target.value })} />
            <Input label={t('destination')} placeholder={t('destination_placeholder')} value={route.destination} onChange={(event) => update(index, { destination: event.target.value })} />
            <Input
              label={t('pay')}
              inputMode="decimal"
              placeholder={t('pay_placeholder')}
              hint={t('wage_help')}
              value={route.pay}
              error={Number.isNaN(payToCents(route.pay)) ? t('scenario_bad_pay') : undefined}
              onChange={(event) => update(index, { pay: event.target.value })}
            />
          </fieldset>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || routes.length >= MAX_ROUTES}
          onClick={() => setRoutes((current) => (current.length >= MAX_ROUTES ? current : [...current, { ...EMPTY }]))}
        >
          {t('add_route')}
        </Button>
        <Button type="button" disabled={busy} onClick={ask}>
          {t('compare')}
        </Button>
      </div>
      <ScopeNote note={note} className="mt-3" />
      <ConfirmDialog
        open={confirming}
        title={t('scenario_confirm_title')}
        body={t('scenario_confirm_body')}
        confirmLabel={t('scenario_confirm_go')}
        cancelLabel={t('cancel')}
        busy={busy}
        onConfirm={() => void compare()}
        onCancel={() => setConfirming(false)}
      />
      {result ? (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-career-ink">{t('scenario_result_title')}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-career-line text-career-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('option_name')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('destination')}</th>
                  <th scope="col" className="py-2 text-start font-semibold">{t('pay')}</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((option, index) => (
                  <tr key={`${option.name}-${index}`} className="border-b border-career-line text-career-ink">
                    <td className="py-2 pe-3" dir="auto">{option.name}</td>
                    <td className="py-2 pe-3" dir="auto">{option.destination}</td>
                    <td className="py-2">{option.wageCents === null ? t('wage_unknown') : money.format(option.wageCents / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-career-muted">{t('scenario_tradeoff')}</p>
        </div>
      ) : null}
    </Card>
  );
}
