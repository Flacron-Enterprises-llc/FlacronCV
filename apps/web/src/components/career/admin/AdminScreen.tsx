'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminAuditEntry, AdminCatalogVersion, AdminFlagView, AdminProviderHealth, ApiClient, ModerationQueueItem } from '@flacroncv/career-api-client';
import { Button, Card, EmptyState, LoadingState, PermissionDeniedState, ProviderUnavailableState } from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { ModerationQueue } from './ModerationQueue';

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
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'signed-out' | 'ready'>('loading');
  const [versions, setVersions] = useState<AdminCatalogVersion[]>([]);
  const [flags, setFlags] = useState<AdminFlagView[]>([]);
  const [providers, setProviders] = useState<AdminProviderHealth[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    setLoad('loading');
    setNote(null);
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

  async function toggle(flag: AdminFlagView) {
    setNote(null);
    try {
      const saved = await api.setAdminFlag(flag.feature, !flag.enabled);
      setFlags(saved.items);
    } catch {
      setNote(t('flag_failed'));
    }
  }

  async function publish() {
    setNote(null);
    try {
      const result = await api.publishAdminCatalog();
      setNote(result.result === 'unchanged' ? t('catalog_unchanged') : t('catalog_published'));
      const catalog = await api.adminCatalog();
      setVersions(catalog.items);
    } catch {
      setNote(t('catalog_failed'));
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadAdmin()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={<a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white" href={signInHref}>{t('go_sign_in')}</a>}
      />
    );
  }

  return (
    <div data-testid="admin-layout" className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold text-career-ink">{t('title')}</h1>
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('health_title')}</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2">
          {providers.map((provider) => (
            <li key={provider.name} className="text-sm text-career-ink">
              {provider.name}: {provider.status === 'unconfigured' ? t('unconfigured') : provider.status}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('catalog_title')}</h2>
        <p className="mt-2 text-sm text-career-ink">{t('catalog_body')}</p>
        <ul className="mt-3 grid grid-cols-1 gap-2">
          {versions.map((version) => (
            <li key={version.version} className="text-sm text-career-ink">{version.version}</li>
          ))}
        </ul>
        <Button type="button" className="mt-4" onClick={() => void publish()}>{t('publish')}</Button>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('flags_title')}</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2">
          {flags.map((flag) => (
            <li key={flag.feature}>
              <button
                type="button"
                className="min-h-career-touch w-full rounded-md border border-career-line px-3 text-left text-sm text-career-ink"
                onClick={() => void toggle(flag)}
              >
                {flag.feature}: {flag.enabled ? t('on') : t('off')}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <ModerationQueue api={api} items={queue} onChange={setQueue} />
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('audit_title')}</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2">
          {audit.map((entry) => (
            <li key={entry.id} className="text-sm text-career-ink">{entry.action}</li>
          ))}
        </ul>
      </Card>
      {note ? <p className="text-sm text-career-ink">{note}</p> : null}
    </div>
  );
}
