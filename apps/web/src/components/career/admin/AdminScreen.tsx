'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminAuditEntry, AdminCatalogVersion, AdminFlagView, AdminProviderHealth, ApiClient, ModerationQueueItem } from '@flacroncv/career-api-client';
import V1Button from '@/components/ui/Button';
import V1Card from '@/components/ui/Card';
import { BusinessOverviewTool, EvidenceVerificationTool } from './AdminCareerTools';
import { ConfirmDialog, EmptyState, InlineNote, LoadingState, PermissionDeniedState, ProviderUnavailableState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { ModerationQueue } from './ModerationQueue';

const KNOWN_PROVIDERS = new Set([
  'stripe',
  'apple',
  'google',
  'text_model',
  'speech_transcription',
  'job_feeds',
  'map_tiles',
  'geocoding',
  'storage',
  'email',
]);
const KNOWN_AUDIT = new Set(['flag.set', 'catalog.published', 'catalog.unchanged', 'opportunity.moderate']);

/**
 * Career moderation and switches, inside V1's admin panel. The moderation
 * queue is the daily task, so it comes first; switches change what every
 * customer can do, so each one asks before it flips.
 */
export function AdminScreen({
  api,
  user,
  ready,
  signInHref,
}: {
  api: ApiClient;
  user: SignedInUser | null;
  ready: boolean;
  signInHref: string;
}) {
  const t = useTranslations('career.admin');
  const tAdmin = useTranslations('admin');
  const locale = useLocale();
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [versions, setVersions] = useState<AdminCatalogVersion[]>([]);
  const [flags, setFlags] = useState<AdminFlagView[]>([]);
  const [providers, setProviders] = useState<AdminProviderHealth[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [flagNote, setFlagNote] = useState<string | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const [pendingFlag, setPendingFlag] = useState<AdminFlagView | null>(null);
  const [flagBusy, setFlagBusy] = useState(false);

  const loadAdmin = useCallback(async () => {
    setLoad('loading');
    try {
      const [catalog, flagList, health, history, moderation] = await Promise.all([
        api.adminCatalog(),
        api.adminFlags(),
        api.adminHealth(),
        api.adminAudit(),
        api.adminModerationQueue(),
      ]);
      setVersions(catalog.items);
      setFlags(flagList.items);
      setProviders(health.providers);
      setAudit(history.items);
      setQueue(moderation.items);
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
    void loadAdmin();
  }, [ready, user, loadAdmin]);

  const featureLabel = (feature: string) => (t.has(`feature_${feature}`) ? t(`feature_${feature}`) : feature);
  const providerLabel = (name: string) => (KNOWN_PROVIDERS.has(name) ? t(`provider_${name}`) : name);
  const statusLabel = (status: string) => (status === 'unconfigured' ? t('unconfigured') : status === 'configured' || status === 'ok' ? t('configured') : status);

  async function toggle(flag: AdminFlagView) {
    setFlagNote(null);
    setFlagBusy(true);
    try {
      const saved = await api.setAdminFlag(flag.feature, !flag.enabled);
      setFlags(saved.items);
      setFlagNote(t(flag.enabled ? 'flag_turned_off' : 'flag_turned_on', { feature: featureLabel(flag.feature) }));
    } catch {
      setFlagNote(t('flag_failed'));
    } finally {
      setFlagBusy(false);
      setPendingFlag(null);
    }
  }

  async function publish() {
    setCatalogNote(null);
    try {
      const result = await api.publishAdminCatalog();
      setCatalogNote(result.result === 'unchanged' ? t('catalog_unchanged') : t('catalog_published'));
      const catalog = await api.adminCatalog();
      setVersions(catalog.items);
    } catch {
      setCatalogNote(t('catalog_failed'));
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<V1Button type="button" onClick={() => void loadAdmin()}>{t('retry')}</V1Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={<a className="btn-primary min-h-career-touch" href={signInHref}>{t('go_sign_in')}</a>}
      />
    );
  }

  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div data-testid="admin-layout" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{tAdmin('career_moderation')}</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('subtitle')}</p>
      </div>

      <ModerationQueue api={api} items={queue} onChange={setQueue} />

      <EvidenceVerificationTool api={api} />

      <BusinessOverviewTool api={api} />

      <V1Card>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('flags_title')}</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('flags_help')}</p>
        <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-800">
          {flags.map((flag) => (
            <li key={flag.feature} className="flex items-center justify-between gap-4 py-2.5">
              <span className="min-w-0 text-sm text-stone-800 dark:text-stone-100">{featureLabel(flag.feature)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={featureLabel(flag.feature)}
                disabled={flagBusy}
                onClick={() => setPendingFlag(flag)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 ${
                  flag.enabled ? 'bg-brand-600' : 'bg-stone-300 dark:bg-stone-600'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${flag.enabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}`}
                />
              </button>
            </li>
          ))}
        </ul>
        {flagNote ? <InlineNote className="mt-3">{flagNote}</InlineNote> : null}
      </V1Card>
      <ConfirmDialog
        open={pendingFlag !== null}
        title={pendingFlag ? t(pendingFlag.enabled ? 'flag_confirm_off_title' : 'flag_confirm_on_title', { feature: featureLabel(pendingFlag.feature) }) : ''}
        body={pendingFlag ? t(pendingFlag.enabled ? 'flag_confirm_off_body' : 'flag_confirm_on_body') : undefined}
        confirmLabel={pendingFlag?.enabled ? t('turn_off') : t('turn_on')}
        cancelLabel={t('cancel')}
        danger={pendingFlag?.enabled === true}
        busy={flagBusy}
        onConfirm={() => pendingFlag && void toggle(pendingFlag)}
        onCancel={() => setPendingFlag(null)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <V1Card>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('health_title')}</h2>
          <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">
            {providers.map((provider) => (
              <li key={provider.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-stone-800 dark:text-stone-100">{providerLabel(provider.name)}</span>
                <span className="text-stone-500 dark:text-stone-400">{statusLabel(provider.status)}</span>
              </li>
            ))}
          </ul>
        </V1Card>
        <V1Card>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('catalog_title')}</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">{t('catalog_body')}</p>
          <ul className="mt-3 space-y-1">
            {versions.map((version) => (
              <li key={version.version} className="text-sm text-stone-800 dark:text-stone-100">{version.version}</li>
            ))}
          </ul>
          <V1Button type="button" className="mt-4" onClick={() => void publish()}>{t('publish')}</V1Button>
          {catalogNote ? <InlineNote className="mt-3">{catalogNote}</InlineNote> : null}
        </V1Card>
      </div>

      <V1Card>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-white">{t('audit_title')}</h2>
        {audit.length === 0 ? <p className="mt-2 text-sm text-stone-500">{t('audit_empty')}</p> : null}
        <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">
          {audit.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="text-stone-800 dark:text-stone-100">
                {KNOWN_AUDIT.has(entry.action) ? t(`audit_${entry.action.replace('.', '_')}`) : entry.action}
                {entry.action === 'flag.set' ? ` · ${featureLabel(entry.target)}` : ''}
              </span>
              <time className="text-xs text-stone-500 dark:text-stone-400" dateTime={entry.createdAt}>
                {dateTime.format(new Date(entry.createdAt))}
              </time>
            </li>
          ))}
        </ul>
      </V1Card>
    </div>
  );
}
