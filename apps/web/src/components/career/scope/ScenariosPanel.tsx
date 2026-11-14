'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  newIdempotencyKey,
  type ApiClient,
  type ScenarioList,
  type ScenarioOptionInput,
  type ScenarioResult,
} from '@flacroncv/career-api-client';
import { isCalendarDate } from '@flacroncv/career-shared';
import { Badge, Button, Card, ConfirmDialog, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

type Source = ScenarioOptionInput['source'];
type Uncertainty = NonNullable<ScenarioOptionInput['uncertainty']>;

interface RouteDraft {
  name: string;
  destination: string;
  /** Whole currency units as typed; converted to cents when sent. */
  pay: string;
  cost: string;
  months: string;
  source: Source;
  sourceName: string;
  sourceDate: string;
  uncertainty: Uncertainty;
  requirements: string;
  locationProfileId: string;
  skillReportId: string;
}

const EMPTY: RouteDraft = {
  name: '',
  destination: '',
  pay: '',
  cost: '',
  months: '',
  source: 'user',
  sourceName: '',
  sourceDate: '',
  uncertainty: 'unknown',
  requirements: '',
  locationProfileId: '',
  skillReportId: '',
};
const MAX_ROUTES = 3;

const selectClass =
  'block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink focus:border-career-navy focus:outline-none focus:ring-2 focus:ring-career-orange-text/40';

/** "55 000" / "55,000.50" -> cents; null when blank; NaN when not a number. */
export function payToCents(value: string): number | null {
  const clean = value.replace(/[\s,]/g, '');
  if (clean === '') return null;
  const amount = Number(clean);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

/** Whole months; null when blank; NaN when not a whole number. */
export function wholeOrBlank(value: string): number | null {
  const clean = value.trim();
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

/** The first problem with a route, as a `career.scope` key, or null. */
export function routeProblem(route: RouteDraft): string | null {
  if (!route.name.trim() || !route.destination.trim()) return 'scenario_need_route';
  if ([payToCents(route.pay), payToCents(route.cost), wholeOrBlank(route.months)].some((v) => Number.isNaN(v))) return 'scenario_bad_pay';
  if (route.sourceDate && !isCalendarDate(route.sourceDate)) return 'scenario_bad_date';
  // Market figures are only market data when they say where and when they come from.
  if (route.source === 'market' && (!route.sourceName.trim() || !route.sourceDate)) return 'scenario_market_needs_source';
  return null;
}

export function routeToInput(route: RouteDraft): ScenarioOptionInput {
  return {
    name: route.name.trim(),
    destination: route.destination.trim(),
    costCents: payToCents(route.cost),
    months: wholeOrBlank(route.months),
    wageCents: payToCents(route.pay),
    source: route.source,
    sourceName: route.sourceName.trim() || null,
    sourceDate: route.sourceDate || null,
    uncertainty: route.uncertainty,
    requirements: route.requirements.trim() || null,
    locationProfileId: route.locationProfileId || null,
    skillReportId: route.skillReportId || null,
  };
}

function resultToDrafts(result: ScenarioResult): RouteDraft[] {
  const text = (cents: number | null) => (cents === null ? '' : String(cents / 100));
  return result.options.map((option) => ({
    name: option.name,
    destination: option.destination,
    pay: text(option.wageCents),
    cost: text(option.costCents),
    months: option.months === null ? '' : String(option.months),
    source: option.source,
    sourceName: option.sourceName ?? '',
    sourceDate: option.sourceDate ?? '',
    uncertainty: option.uncertainty,
    requirements: option.requirements ?? '',
    locationProfileId: option.locationProfileId ?? '',
    skillReportId: option.skillReportId ?? '',
  }));
}

/**
 * CV18 scenario planner: up to three routes, each with its figures, where
 * they come from, and how uncertain they are. A new comparison uses one
 * scenario report after a confirmation that shows the balance; reopening and
 * editing a saved one recomputes from the person's values and is free.
 */
export function ScenariosPanel({ api, initial }: { api: ApiClient; initial?: ScenarioList }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const { busy, run } = useScopeBusy();
  const [saved, setSaved] = useState<ScenarioResult[]>(initial?.items ?? []);
  const [remaining, setRemaining] = useState<number | null>(initial?.remaining ?? null);
  const [routes, setRoutes] = useState<RouteDraft[]>([{ ...EMPTY }]);
  const [title, setTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [places, setPlaces] = useState<Array<{ id: string; label: string }>>([]);
  const [reports, setReports] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let live = true;
    // Links are optional: a plan without location profiles or skill reports just shows none.
    api
      .locations()
      .then((list) => live && setPlaces(list.items.map((item) => ({ id: item.id, label: item.place }))))
      .catch(() => undefined);
    api
      .skillReports()
      .then((list) => live && setReports(list.items.map((item) => ({ id: item.id, label: item.targetRole }))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);

  function update(index: number, patch: Partial<RouteDraft>) {
    setRoutes((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function check(): ScenarioOptionInput[] | null {
    setNote(null);
    const filled = routes.filter((route) => route.name.trim() || route.destination.trim());
    if (filled.length === 0) {
      setNote({ tone: 'error', key: 'scenario_need_route' });
      return null;
    }
    for (const route of filled) {
      const problem = routeProblem(route);
      if (problem) {
        setNote({ tone: 'error', key: problem });
        return null;
      }
    }
    return filled.slice(0, MAX_ROUTES).map(routeToInput);
  }

  function ask() {
    if (check()) setConfirming(true);
  }

  async function compare() {
    const options = check();
    if (!options) return;
    await run(async () => {
      try {
        const paid = await api.createScenario(options, newIdempotencyKey(), { title: title.trim() || undefined });
        setResult(paid.result);
        setSaved((current) => [paid.result, ...current.filter((item) => item.id !== paid.result.id)]);
        setRemaining(paid.usage.includedRemaining + paid.usage.packRemaining);
        setEditingId(paid.result.id);
      } catch (error) {
        setNote(errorNote(error));
      } finally {
        setConfirming(false);
      }
    });
  }

  async function saveEdits() {
    if (!editingId) return;
    const options = check();
    if (!options) return;
    await run(async () => {
      try {
        const updated = await api.updateScenario(editingId, { options, title: title.trim() || undefined });
        setResult(updated);
        setSaved((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setNote({ tone: 'success', key: 'scenario_updated' });
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  function reopen(item: ScenarioResult) {
    setEditingId(item.id);
    setTitle(item.title);
    setRoutes(resultToDrafts(item));
    setResult(item);
    setNote(null);
  }

  function startNew() {
    setEditingId(null);
    setTitle('');
    setRoutes([{ ...EMPTY }]);
    setResult(null);
    setNote(null);
  }

  async function remove(id: string) {
    await run(async () => {
      try {
        await api.deleteScenario(id);
        setSaved((current) => current.filter((item) => item.id !== id));
        if (editingId === id) startNew();
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const amount = (cents: number | null) => (cents === null ? t('wage_unknown') : money.format(cents / 100));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <h2 className="text-lg font-semibold text-career-ink">{t('scenario_saved_heading')}</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-career-muted">{t('scenario_saved_empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {saved.map((item) => (
              <li key={item.id} className="rounded-md border border-career-line p-3 text-sm">
                <p className="font-semibold text-career-ink" dir="auto">{item.title}</p>
                <p className="text-career-muted">{date.format(new Date(item.createdAt))}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => reopen(item)}>{t('scenario_open')}</Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void remove(item.id)}>{t('delete')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" className="mt-4" variant="secondary" disabled={busy} onClick={startNew}>{t('scenario_new')}</Button>
      </Card>

      <Card className="lg:col-span-2">
        <p className="text-sm text-career-muted">{t('scenario_help')}</p>
        <div className="mt-3">
          <Input label={t('scenario_title')} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {routes.map((route, index) => (
            <fieldset key={index} className="grid grid-cols-1 gap-3 rounded-md border border-career-line p-3 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold text-career-ink">{t('route_n', { n: index + 1 })}</legend>
              <Input label={t('option_name')} placeholder={t('option_name_placeholder')} value={route.name} onChange={(e) => update(index, { name: e.target.value })} />
              <Input label={t('destination')} placeholder={t('destination_placeholder')} value={route.destination} onChange={(e) => update(index, { destination: e.target.value })} />
              <Input
                label={t('pay')}
                inputMode="decimal"
                placeholder={t('pay_placeholder')}
                hint={t('wage_help')}
                value={route.pay}
                error={Number.isNaN(payToCents(route.pay)) ? t('scenario_bad_pay') : undefined}
                onChange={(e) => update(index, { pay: e.target.value })}
              />
              <Input
                label={t('scenario_cost')}
                inputMode="decimal"
                value={route.cost}
                error={Number.isNaN(payToCents(route.cost)) ? t('scenario_bad_pay') : undefined}
                onChange={(e) => update(index, { cost: e.target.value })}
              />
              <Input
                label={t('scenario_months')}
                inputMode="numeric"
                value={route.months}
                error={Number.isNaN(wholeOrBlank(route.months)) ? t('scenario_bad_pay') : undefined}
                onChange={(e) => update(index, { months: e.target.value })}
              />
              <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
                <span>{t('scenario_source')}</span>
                <select className={selectClass} value={route.source} onChange={(e) => update(index, { source: e.target.value as Source })}>
                  <option value="user">{t('source_user')}</option>
                  <option value="market">{t('source_market')}</option>
                  <option value="estimate">{t('source_estimate')}</option>
                </select>
              </label>
              <Input label={t('scenario_source_name')} hint={t('scenario_source_name_hint')} value={route.sourceName} maxLength={120} onChange={(e) => update(index, { sourceName: e.target.value })} />
              <Input label={t('scenario_source_date')} type="date" value={route.sourceDate} onChange={(e) => update(index, { sourceDate: e.target.value })} />
              <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
                <span>{t('scenario_uncertainty')}</span>
                <select className={selectClass} value={route.uncertainty} onChange={(e) => update(index, { uncertainty: e.target.value as Uncertainty })}>
                  {(['unknown', 'low', 'medium', 'high'] as const).map((level) => (
                    <option key={level} value={level}>{t(`uncertainty_${level}`)}</option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-3">
                <Input label={t('scenario_requirements')} hint={t('scenario_requirements_hint')} value={route.requirements} maxLength={500} onChange={(e) => update(index, { requirements: e.target.value })} />
              </div>
              <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
                <span>{t('scenario_location')}</span>
                <select className={selectClass} value={route.locationProfileId} onChange={(e) => update(index, { locationProfileId: e.target.value })}>
                  <option value="">{t('scenario_no_link')}</option>
                  {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm font-semibold text-career-ink">
                <span>{t('scenario_skill_report')}</span>
                <select className={selectClass} value={route.skillReportId} onChange={(e) => update(index, { skillReportId: e.target.value })}>
                  <option value="">{t('scenario_no_link')}</option>
                  {reports.map((report) => <option key={report.id} value={report.id}>{report.label}</option>)}
                </select>
              </label>
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
          {editingId ? (
            <Button type="button" disabled={busy} onClick={() => void saveEdits()}>{t('scenario_save_edits')}</Button>
          ) : (
            <Button type="button" disabled={busy} onClick={ask}>{t('compare')}</Button>
          )}
        </div>
        <ScopeNote note={note} className="mt-3" />
        <ConfirmDialog
          open={confirming}
          title={t('scenario_confirm_title')}
          body={
            remaining === null
              ? t('scenario_confirm_body')
              : t('scenario_confirm_balance', { remaining, after: Math.max(0, remaining - 1) })
          }
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
              <table className="w-full min-w-[36rem] border-collapse text-start text-sm">
                <thead>
                  <tr className="border-b border-career-line text-career-muted">
                    <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('option_name')}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('destination')}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('pay')}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('scenario_cost')}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-semibold">{t('scenario_months')}</th>
                    <th scope="col" className="py-2 text-start font-semibold">{t('scenario_source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.options.map((option, index) => (
                    <tr key={`${option.name}-${index}`} className="border-b border-career-line align-top text-career-ink">
                      <td className="py-2 pe-3" dir="auto">
                        {option.name}
                        {option.requirements ? <p className="text-xs text-career-muted" dir="auto">{option.requirements}</p> : null}
                      </td>
                      <td className="py-2 pe-3" dir="auto">{option.destination}</td>
                      <td className="py-2 pe-3">
                        {amount(option.wageCents)}
                        <div><Badge tone="neutral">{t(`wage_label_${option.wageLabel}`)}</Badge></div>
                      </td>
                      <td className="py-2 pe-3">{amount(option.costCents)}</td>
                      <td className="py-2 pe-3">{option.months === null ? t('wage_unknown') : option.months}</td>
                      <td className="py-2 text-xs text-career-muted">
                        {option.sourceName ? <span dir="auto">{option.sourceName}</span> : null}
                        {option.sourceDate ? <span> · {date.format(new Date(`${option.sourceDate}T00:00:00Z`))}</span> : null}
                        <div>{t('uncertainty_is', { level: t(`uncertainty_${option.uncertainty}`) })}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-career-muted">{t('scenario_tradeoff')}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
