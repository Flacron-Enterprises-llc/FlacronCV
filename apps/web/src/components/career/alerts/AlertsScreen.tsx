'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type AlertItem, type AlertList, type ApiClient } from '@flacroncv/career-api-client';
import {
  Button,
  Card,
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

export function AlertsScreen({
  api,
  user,
  ready,
  signInHref,
  locale,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
  locale: string;
}) {
  const t = useTranslations('career.alerts');
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [list, setList] = useState<AlertList | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<'saved' | 'capacity' | 'upgrade' | 'quiet' | null>(null);
  const [pending, setPending] = useState(false);

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
  }, [ready, user, loadAlerts]);

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
          <a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>
            {t('go_sign_in')}
          </a>
        }
      />
    );
  }

  const settings = list.settings;
  const balance = list.alertItem.includedRemaining + list.alertItem.packRemaining;

  async function saveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNote(null);
    try {
      await api.createSavedSearch({ q: query });
      setNote('saved');
    } catch (error) {
      if (isApiError(error, 'capacity_exceeded')) setNote('capacity');
      else if (isApiError(error, 'plan_upgrade_required')) setNote('upgrade');
      else setLoad('unavailable');
    } finally {
      setPending(false);
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="alerts-layout">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-career-navy dark:text-white">{t('title')}</h1>
        {balance === 0 ? <QuotaExhaustedState title={t('quota_title')} body={t('quota_body')} /> : null}
        {note === 'upgrade' ? <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} /> : null}
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
          list.items.map((item) => <AlertCard key={item.id} item={item} locale={locale} />)
        )}
        <p className="text-sm text-slate">{t('not_a_score')}</p>
      </section>
      <section className="space-y-4">
        <Card>
          <form className="space-y-3" onSubmit={(event) => void saveSearch(event)}>
            <Input label={t('search_label')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button type="submit" disabled={pending}>
              {t('save_search')}
            </Button>
            {note === 'saved' ? <p className="text-sm">{t('saved')}</p> : null}
            {note === 'capacity' ? <p className="text-sm">{t('capacity')}</p> : null}
          </form>
        </Card>
        <Card>
          <form className="space-y-3" onSubmit={(event) => void saveSettings(event)}>
            <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('settings_title')}</h2>
            <label className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="email" defaultChecked={settings.email} />
              {t('email')}
            </label>
            <label className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="push" defaultChecked={settings.push} />
              {t('push')}
            </label>
            <label className="flex min-h-career-touch items-center gap-2 text-sm">
              <input type="checkbox" name="telegram" defaultChecked={settings.telegram} />
              {t('telegram')}
            </label>
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

function AlertCard({ item, locale }: { item: AlertItem; locale: string }) {
  const t = useTranslations('career.alerts');
  const reason =
    item.reason.code === 'material_update'
      ? t('reason_material_update')
      : item.reason.code === 'followed_company'
        ? t('reason_followed_company')
        : t('reason_saved_search');
  const fit = item.reason.fit === null ? null : t(`fit_${item.reason.fit}`);
  return (
    <Card>
      <a className="text-lg font-semibold text-career-orange-text" href={`/${locale}/career/opportunities/${item.opportunityId}`}>
        {item.title}
      </a>
      {item.organization ? <p className="text-sm">{item.organization}</p> : null}
      <p className="text-sm">{reason}</p>
      {fit ? <p className="text-sm">{fit}</p> : null}
    </Card>
  );
}
