'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type AlertItem,
  type AlertList,
  type AlertLocation,
  type ApiClient,
  type CareerReminder,
  type ReminderList,
  type SavedSearch,
  type SavedSearchInput,
} from '@flacroncv/career-api-client';
import { alertTierAtLeast, LISTING_SCHEDULES, OPPORTUNITY_CATEGORIES, RELEVANCE_THRESHOLDS } from '@flacroncv/career-shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  QuotaExhaustedState,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { trackerReminders, v1JobTracker, type JobTracker } from '@/lib/career/v1-jobs';
import { FieldSelect } from '../opportunities/FieldSelect';
import { formatDay, formatPay } from '../opportunities/ListingFacts';
import { AlertTargets } from './AlertTargets';

const SEARCH_CATEGORIES = ['full_time', 'part_time', 'temporary', 'contract', 'remote', 'hybrid', ...OPPORTUNITY_CATEGORIES] as const;

export function AlertsScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
  tracker = v1JobTracker,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
  /** V1 Jobs tracker, read only for follow-up and interview reminders; tests pass a fake. */
  tracker?: JobTracker;
}) {
  const t = useTranslations('career.alerts');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [list, setList] = useState<AlertList | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [relevance, setRelevance] = useState('any');
  const [workSchedule, setWorkSchedule] = useState('');
  const [minPay, setMinPay] = useState('');
  const [note, setNote] = useState<'saved' | 'capacity' | 'upgrade' | 'quiet' | 'tier' | null>(null);
  const [pending, setPending] = useState(false);
  // Saved searches load separately: a failure here must not hide the alert centre.
  const [searches, setSearches] = useState<SavedSearch[] | 'error' | null>(null);
  const [searchBusy, setSearchBusy] = useState<string | null>(null);
  const [locations, setLocations] = useState<AlertLocation[]>([]);
  const [searchLocation, setSearchLocation] = useState('');
  // A deleted saved search stops its alerts and cannot be restored, so it asks first.
  const [confirmSearch, setConfirmSearch] = useState<SavedSearch | null>(null);
  const [reminders, setReminders] = useState<ReminderList | 'error' | null>(null);

  const loadSearches = useCallback(async () => {
    try {
      setSearches((await api.savedSearches()).items);
    } catch {
      setSearches('error');
    }
  }, [api]);

  /** Tracker dates are synced first (best effort), then the reminder list is read; reminders never use alert items. */
  const loadReminders = useCallback(async () => {
    try {
      const items = trackerReminders(await tracker.list());
      if (items.length > 0) await api.syncTrackerReminders(items);
    } catch {
      // The tracker is another service; its reminders show again on the next successful read.
    }
    try {
      setReminders(await api.reminders());
    } catch {
      setReminders('error');
    }
  }, [api, tracker]);

  const loadAlerts = useCallback(async () => {
    setLoad('loading');
    try {
      setList(await api.alerts());
      setLoad('ready');
    } catch (error) {
      const failure = profileLoadFailure(error);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadAlerts();
    void loadSearches();
    void loadReminders();
  }, [ready, user, loadAlerts, loadSearches, loadReminders]);

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={
          <Button type="button" onClick={() => void loadAlerts()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (load === 'signed-out' || !user || !list) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  const settings = list.settings;
  const balance = list.alertItem.includedRemaining + list.alertItem.packRemaining;
  const tier = list.tier ?? 'basic';
  const personalized = alertTierAtLeast(tier, 'personalized');
  const enhanced = alertTierAtLeast(tier, 'enhanced');
  const unread = list.unread ?? list.items.filter((item) => item.read === false).length;
  const connected = (channel: 'email' | 'push' | 'telegram') => (list.channels ? list.channels[channel] === 'connected' : channel === 'email');

  async function saveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNote(null);
    const pay = /^\d+$/.test(minPay.trim()) ? Number(minPay.trim()) : undefined;
    const input: SavedSearchInput = {
      q: query,
      ...(searchLocation ? { locationProfileId: searchLocation } : {}),
      ...(category ? { category } : {}),
      ...(relevance !== 'any' ? { relevance: relevance as SavedSearchInput['relevance'] } : {}),
      ...(workSchedule ? { workSchedule } : {}),
      ...(pay !== undefined ? { minPay: pay } : {}),
    };
    try {
      await api.createSavedSearch(input);
      setNote('saved');
      setQuery('');
      setSearchLocation('');
      setCategory('');
      setRelevance('any');
      setWorkSchedule('');
      setMinPay('');
      void loadSearches();
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) setNote('capacity');
      else if (isApiError(error, 'plan_upgrade_required')) setNote(error.body.feature === 'alertIntelligence' ? 'tier' : 'upgrade');
      else setLoad('unavailable');
    } finally {
      setPending(false);
    }
  }

  async function togglePaused(search: SavedSearch) {
    setSearchBusy(search.id);
    try {
      const next = await api.updateSavedSearch(search.id, { paused: !search.paused });
      setSearches((current) => (Array.isArray(current) ? current.map((s) => (s.id === search.id ? next : s)) : current));
    } catch {
      setSearches('error');
    } finally {
      setSearchBusy(null);
    }
  }

  async function changeRelevance(search: SavedSearch, value: string) {
    setSearchBusy(search.id);
    try {
      const next = await api.updateSavedSearch(search.id, { relevance: value as SavedSearchInput['relevance'] });
      setSearches((current) => (Array.isArray(current) ? current.map((s) => (s.id === search.id ? next : s)) : current));
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('tier');
      else setSearches('error');
    } finally {
      setSearchBusy(null);
    }
  }

  async function removeSearch(search: SavedSearch) {
    setSearchBusy(search.id);
    try {
      await api.deleteSavedSearch(search.id);
      setSearches((current) => (Array.isArray(current) ? current.filter((s) => s.id !== search.id) : current));
    } catch {
      setSearches('error');
    } finally {
      setSearchBusy(null);
      setConfirmSearch(null);
    }
  }

  async function markRead(item: AlertItem) {
    try {
      await api.markAlertRead(item.id);
      setList((current) =>
        current
          ? { ...current, unread: Math.max(0, (current.unread ?? 1) - 1), items: current.items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)) }
          : current,
      );
    } catch {
      // Unread state is a convenience; the alert itself is unchanged.
    }
  }

  async function markAllRead() {
    try {
      await api.markAllAlertsRead();
      setList((current) => (current ? { ...current, unread: 0, items: current.items.map((entry) => ({ ...entry, read: true })) } : current));
    } catch {
      // As above: nothing else depends on it.
    }
  }

  async function readReminder(reminder: CareerReminder) {
    try {
      await api.markReminderRead(reminder.id);
      setReminders((current) =>
        current && current !== 'error'
          ? {
              ...current,
              unread: Math.max(0, current.unread - (reminder.read ? 0 : 1)),
              upcoming: current.upcoming.map((entry) => (entry.id === reminder.id ? { ...entry, read: true } : entry)),
            }
          : current,
      );
    } catch {
      // Unchanged on failure.
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNote(null);
    const form = new FormData(event.currentTarget);
    const quietStart = String(form.get('quietStart') ?? '');
    const quietEnd = String(form.get('quietEnd') ?? '');
    const digestRaw = String(form.get('digest') ?? settings.digest);
    const digest = digestRaw === 'daily' || digestRaw === 'immediate' ? digestRaw : 'weekly';
    try {
      const next = await api.updateAlertSettings({
        email: form.get('email') === 'on',
        push: form.get('push') === 'on',
        telegram: form.get('telegram') === 'on',
        digest,
        quietStart: quietStart.length > 0 ? quietStart : null,
        quietEnd: quietEnd.length > 0 ? quietEnd : null,
        paused: form.get('paused') === 'on',
      });
      setList((current) => (current ? { ...current, settings: next } : current));
    } catch (error) {
      if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else if (isApiError(error, 'validation_error')) setNote('quiet');
      else setLoad('unavailable');
    } finally {
      setPending(false);
    }
  }

  const searchName = (search: SavedSearch) =>
    search.q || (search.category ? t(`category_${search.category}`) : null) || t('searches_any');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="alerts-layout">
      <ConfirmDialog
        open={confirmSearch !== null}
        title={t('searches_confirm_title')}
        body={confirmSearch ? t('searches_confirm_body', { query: searchName(confirmSearch) }) : undefined}
        confirmLabel={t('searches_delete')}
        cancelLabel={t('cancel')}
        danger
        busy={confirmSearch !== null && searchBusy === confirmSearch.id}
        onConfirm={() => confirmSearch && void removeSearch(confirmSearch)}
        onCancel={() => setConfirmSearch(null)}
      />
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('title')}</h1>
          {unread > 0 ? <Badge tone="neutral">{t('unread_count', { count: unread })}</Badge> : null}
          {unread > 0 ? (
            <Button type="button" variant="ghost" onClick={() => void markAllRead()}>
              {t('mark_all_read')}
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-slate">{t(`tier_${tier}`)}</p>
        {balance === 0 ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
        {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
        {note === 'tier' ? <PlanUpgradeState title={t('tier_upgrade_title')} body={t('tier_upgrade_body')} /> : null}
        {list.items.length === 0 ? (
          <EmptyState
            title={t('empty_title')}
            body={t('empty_body')}
            action={
              <a className="inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/opportunities`}>
                {t('search_link')}
              </a>
            }
          />
        ) : (
          list.items.map((item) => <AlertCard key={item.id} item={item} locale={locale} onRead={() => void markRead(item)} />)
        )}
        <p className="text-sm text-slate">{t('not_a_score')}</p>
        <RemindersCard reminders={reminders} locale={locale} onRead={(reminder) => void readReminder(reminder)} onRetry={() => void loadReminders()} />
      </section>
      <section className="space-y-4">
        <Card>
          <form className="space-y-3" onSubmit={(event) => void saveSearch(event)}>
            <Input label={t('search_label')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <FieldSelect
              label={t('search_category')}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={[{ value: '', label: t('search_category_any') }, ...SEARCH_CATEGORIES.map((value) => ({ value, label: t(`category_${value}`) }))]}
            />
            {locations.length > 0 ? (
              <>
                <label className="block text-sm font-semibold" htmlFor="search-location">
                  {t('search_location')}
                </label>
                <select
                  id="search-location"
                  value={searchLocation}
                  onChange={(event) => setSearchLocation(event.target.value)}
                  className="min-h-career-touch w-full rounded-md border px-3"
                >
                  <option value="">{t('search_location_any')}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {t('location_line', { place: location.place, miles: location.radiusMiles })}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {personalized ? (
              <>
                <FieldSelect
                  label={t('search_work_schedule')}
                  value={workSchedule}
                  onChange={(event) => setWorkSchedule(event.target.value)}
                  options={[{ value: '', label: t('search_category_any') }, ...LISTING_SCHEDULES.map((value) => ({ value, label: t(`category_${value}`) }))]}
                />
                <Input label={t('search_min_pay')} inputMode="numeric" value={minPay} onChange={(event) => setMinPay(event.target.value)} hint={t('search_min_pay_hint')} />
              </>
            ) : (
              <p className="text-xs text-slate">{t('search_personalized_locked')}</p>
            )}
            {enhanced ? (
              <FieldSelect
                label={t('search_relevance')}
                value={relevance}
                onChange={(event) => setRelevance(event.target.value)}
                options={RELEVANCE_THRESHOLDS.map((value) => ({ value, label: t(`relevance_${value}`) }))}
                hint={t('search_relevance_hint')}
              />
            ) : (
              <p className="text-xs text-slate">{t('search_relevance_locked')}</p>
            )}
            <Button type="submit" disabled={pending}>
              {t('save_search')}
            </Button>
            {note === 'saved' ? <p className="text-sm">{t('saved')}</p> : null}
            {note === 'capacity' ? <p className="text-sm">{t('capacity')}</p> : null}
          </form>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('searches_title')}</h2>
          {searches === null ? (
            <p className="mt-2 text-sm text-slate">{t('loading')}</p>
          ) : searches === 'error' ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>{t('searches_error')}</span>
              <Button type="button" onClick={() => void loadSearches()}>
                {t('retry')}
              </Button>
            </div>
          ) : searches.length === 0 ? (
            <p className="mt-2 text-sm text-slate">{t('searches_empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {searches.map((search) => (
                <li key={search.id} className="flex flex-wrap items-center gap-2 rounded-md border border-career-line p-3 text-sm">
                  <span className="min-w-0 flex-1 break-words font-semibold">
                    {searchName(search)}
                    {search.q && search.category ? <span className="block text-xs font-normal text-slate">{t(`category_${search.category}`)}</span> : null}
                    {search.locationProfileId ? <SearchPlace id={search.locationProfileId} locations={locations} mode={search.locationMode ?? null} /> : null}
                    {(search.inactiveFilters ?? []).length > 0 ? (
                      <span className="block text-xs font-normal text-career-orange-text">{t('searches_inactive_filters')}</span>
                    ) : null}
                  </span>
                  {search.paused ? <span className="text-xs font-semibold uppercase text-slate">{t('searches_paused')}</span> : null}
                  {enhanced ? (
                    <select
                      aria-label={t('search_relevance_for', { query: searchName(search) })}
                      value={search.filters?.relevance ?? 'any'}
                      disabled={searchBusy === search.id}
                      onChange={(event) => void changeRelevance(search, event.target.value)}
                      className="min-h-career-touch rounded-md border px-2"
                    >
                      {RELEVANCE_THRESHOLDS.map((value) => (
                        <option key={value} value={value}>
                          {t(`relevance_${value}`)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Button type="button" disabled={searchBusy === search.id} onClick={() => void togglePaused(search)}>
                    {search.paused ? t('searches_resume') : t('searches_pause')}
                  </Button>
                  <Button type="button" disabled={searchBusy === search.id} onClick={() => setConfirmSearch(search)} aria-label={t('searches_delete_label', { query: searchName(search) })}>
                    {t('searches_delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <AlertTargets api={api} onLocations={setLocations} />
        <Card>
          <form className="space-y-3" onSubmit={(event) => void saveSettings(event)}>
            <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('settings_title')}</h2>
            {(['email', 'push', 'telegram'] as const).map((channel) => (
              <div key={channel}>
                <label className="flex min-h-career-touch items-center gap-2 text-sm">
                  <input type="checkbox" name={channel} defaultChecked={settings[channel]} />
                  {t(channel)}
                </label>
                {connected(channel) ? null : <p className="-mt-1 text-xs text-slate">{t('channel_not_connected')}</p>}
              </div>
            ))}
            <label className="block text-sm font-semibold" htmlFor="digest">
              {t('digest')}
            </label>
            <select id="digest" name="digest" defaultValue={settings.digest} className="min-h-career-touch w-full rounded-md border px-3">
              <option value="weekly">{t('digest_weekly')}</option>
              <option value="daily">{t('digest_daily')}</option>
              <option value="immediate">{t('digest_immediate')}</option>
            </select>
            <Input label={t('quiet_start')} name="quietStart" defaultValue={settings.quietStart ?? ''} />
            <Input label={t('quiet_end')} name="quietEnd" defaultValue={settings.quietEnd ?? ''} />
            <label className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="paused" defaultChecked={settings.paused} />
              {t('paused')}
            </label>
            <Button type="submit" disabled={pending}>
              {t('save_settings')}
            </Button>
            {note === 'quiet' ? <p className="text-sm">{t('quiet_invalid')}</p> : null}
          </form>
        </Card>
      </section>
    </div>
  );
}

function SearchPlace({ id, locations, mode }: { id: string; locations: AlertLocation[]; mode: SavedSearch['locationMode'] | null }) {
  const t = useTranslations('career.alerts');
  const place = locations.find((location) => location.id === id);
  return (
    <span className="block text-xs font-normal text-slate">
      {place ? t('location_line', { place: place.place, miles: place.radiusMiles }) : t('search_location_set')}
      {mode === 'name' ? ` · ${t('location_by_name')}` : null}
    </span>
  );
}

function AlertCard({ item, locale, onRead }: { item: AlertItem; locale: string; onRead: () => void }) {
  const t = useTranslations('career.alerts');
  const reason = item.reason;
  const why =
    reason.code === 'followed_company'
      ? reason.companyName
        ? t('reason_followed_company_named', { company: reason.companyName })
        : t('reason_followed_company')
      : reason.searchLabel
        ? t('reason_saved_search_named', { search: reason.searchLabel })
        : t('reason_saved_search');
  const pay = item.basic ? formatPay(item.basic.compensation, locale) : null;
  const sent = (item.deliveries ?? []).filter((delivery) => delivery.status === 'sent').map((delivery) => t(delivery.channel));
  const waiting = (item.deliveries ?? []).filter((delivery) => delivery.lastError === 'provider_unavailable').map((delivery) => t(delivery.channel));
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-2">
        <a className="min-w-0 flex-1 text-lg font-semibold text-career-orange-text" href={`/${locale}/career/opportunities/${item.opportunityId}`} onClick={onRead}>
          {item.title}
        </a>
        {item.read === false ? <Badge tone="neutral">{t('unread')}</Badge> : null}
      </div>
      {item.organization ? <p className="text-sm">{item.organization}</p> : null}
      <p className="text-sm">{why}</p>
      {reason.code === 'material_update' ? <p className="text-sm">{t('reason_material_update')}</p> : null}
      {item.basic ? (
        <p className="text-sm text-slate">
          {[
            item.basic.locations.join(' · ') || null,
            pay,
            item.basic.deadline ? t('basic_deadline', { date: formatDay(item.basic.deadline, locale) }) : null,
            t('basic_checked', { date: formatDay(item.basic.checkedAt, locale) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      {reason.label ? <p className="text-sm">{t(`label_${reason.label}`)}</p> : reason.fit ? <p className="text-sm">{t(`fit_${reason.fit}`)}</p> : null}
      {reason.gaps && reason.gaps.length > 0 ? <p className="text-sm">{t('gaps_line', { gaps: reason.gaps.join(', ') })}</p> : null}
      {reason.advanced ? <AdvancedLinks advanced={reason.advanced} opportunityId={item.opportunityId} locale={locale} /> : null}
      {sent.length > 0 ? <p className="text-xs text-slate">{t('delivered_on', { channels: sent.join(', ') })}</p> : null}
      {waiting.length > 0 ? <p className="text-xs text-slate">{t('delivery_waiting', { channels: waiting.join(', ') })}</p> : null}
      <div className="mt-2 flex flex-wrap gap-4">
        <a className="inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/opportunities/${item.opportunityId}`}>
          {t('open_compare')}
        </a>
        <a className="inline-flex min-h-career-touch items-center text-sm font-semibold text-career-orange-text" href={`/${locale}/career/action-pack?opportunityId=${encodeURIComponent(item.opportunityId)}`}>
          {t('prepare_application')}
        </a>
        {item.read === false ? (
          <Button type="button" variant="ghost" onClick={onRead}>
            {t('mark_read')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function AdvancedLinks({ advanced, opportunityId, locale }: { advanced: NonNullable<AlertItem['reason']['advanced']>; opportunityId: string; locale: string }) {
  const t = useTranslations('career.alerts');
  const lines: React.ReactNode[] = [];
  if (advanced.targetRole) lines.push(<li key="role">{t('advanced_target_role', { role: advanced.targetRole })}</li>);
  if (advanced.promotionGoal) lines.push(<li key="goal">{t('advanced_goal', { goal: advanced.promotionGoal })}</li>);
  if (advanced.learningPlanId) {
    lines.push(
      <li key="plan">
        <a className="font-semibold text-career-orange-text" href={`/${locale}/career/learning`}>{t('advanced_learning_plan')}</a>
      </li>,
    );
  }
  lines.push(
    <li key="pack">
      <a className="font-semibold text-career-orange-text" href={`/${locale}/career/action-pack?opportunityId=${encodeURIComponent(opportunityId)}`}>
        {advanced.actionPackId ? t('advanced_open_pack') : t('advanced_next_pack')}
      </a>
    </li>,
  );
  return <ul className="mt-1 list-disc ps-5 text-sm">{lines}</ul>;
}

function RemindersCard({
  reminders,
  locale,
  onRead,
  onRetry,
}: {
  reminders: ReminderList | 'error' | null;
  locale: string;
  onRead: (reminder: CareerReminder) => void;
  onRetry: () => void;
}) {
  const t = useTranslations('career.alerts');
  return (
    <Card>
      <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('reminders_title')}</h2>
      <p className="mt-1 text-sm text-slate">{t('reminders_body')}</p>
      {reminders === null ? (
        <p className="mt-2 text-sm text-slate">{t('loading')}</p>
      ) : reminders === 'error' ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>{t('reminders_error')}</span>
          <Button type="button" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <>
          {reminders.upcoming.length === 0 ? <p className="mt-2 text-sm text-slate">{t('reminders_empty')}</p> : null}
          <ul className="mt-2 space-y-2">
            {reminders.upcoming.map((reminder) => (
              <li key={reminder.id} className="flex flex-wrap items-center gap-2 rounded-md border border-career-line p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold" dir="auto">
                    {reminder.link ? <a href={`/${locale}${reminder.link}`}>{reminder.title}</a> : reminder.title}
                  </span>
                  <span className="block text-xs text-slate">{t(`reminder_${reminder.kind}`, { date: formatDay(reminder.dueDate, locale) })}</span>
                </span>
                {reminder.read ? null : (
                  <Button type="button" variant="ghost" onClick={() => onRead(reminder)}>
                    {t('mark_read')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {reminders.history.length > 0 ? (
            <details className="mt-3">
              <summary className="min-h-career-touch cursor-pointer text-sm font-semibold">{t('reminders_history', { count: reminders.history.length })}</summary>
              <ul className="mt-2 space-y-1 text-sm text-slate">
                {reminders.history.map((reminder) => (
                  <li key={reminder.id} dir="auto">
                    {reminder.title} · {t(`reminder_${reminder.kind}`, { date: formatDay(reminder.dueDate, locale) })}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </Card>
  );
}
