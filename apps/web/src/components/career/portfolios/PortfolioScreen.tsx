'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isApiError, type ApiClient, type CareerEvidence, type PortfolioPage } from '@flacroncv/career-api-client';
import { DEFAULT_PORTFOLIO_SECTIONS, type PortfolioSections } from '@flacroncv/career-shared';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageHeader,
  PermissionDeniedState,
  PlanUpgradeState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';

export function PortfolioScreen({
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
  const t = useTranslations('career.portfolios');
  const locale = useLocale();
  const busy = useRef(false);
  const [load, setLoad] = useState<'loading' | 'permission' | 'unavailable' | 'upgrade' | 'switched-off' | 'signed-out' | 'ready'>('loading');
  const [items, setItems] = useState<PortfolioPage[]>([]);
  const [evidence, setEvidence] = useState<CareerEvidence[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [sections, setSections] = useState<PortfolioSections>({ ...DEFAULT_PORTFOLIO_SECTIONS });
  const [caseStudies, setCaseStudies] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Clears the form for a new page; Career Pro allows more than one. */
  function startNew() {
    setSelectedId(null);
    setTitle('');
    setHeadline('');
    setDisplayName('');
    setEmail('');
    setPhone('');
    setShowEmail(false);
    setShowPhone(false);
    setEvidenceIds([]);
    setSections({ ...DEFAULT_PORTFOLIO_SECTIONS });
    setCaseStudies({});
    setNote(null);
    setError(null);
  }

  async function remove() {
    if (!selected || busy.current) return;
    busy.current = true;
    setWorking(true);
    setNote(null);
    setError(null);
    try {
      await api.deletePortfolio(selected.id);
      const rest = items.filter((item) => item.id !== selected.id);
      setItems(rest);
      if (rest[0]) apply(rest[0]);
      else startNew();
      setNote(t('deleted'));
    } catch {
      setError(t('failed'));
    } finally {
      busy.current = false;
      setWorking(false);
      setConfirmDelete(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNote(t('link_copied'));
    } catch {
      setError(t('link_copy_failed'));
    }
  }

  const apply = useCallback((page: PortfolioPage) => {
    setTitle(page.title);
    setHeadline(page.headline);
    setDisplayName(page.displayName);
    setEmail(page.contactEmail ?? '');
    setPhone(page.contactPhone ?? '');
    setShowEmail(page.showEmail);
    setShowPhone(page.showPhone);
    setEvidenceIds(page.evidenceIds);
    setSections(page.sections ?? { ...DEFAULT_PORTFOLIO_SECTIONS });
    setCaseStudies(page.caseStudies ?? {});
    setSelectedId(page.id);
  }, []);

  const loadPages = useCallback(async () => {
    setLoad('loading');
    setNote(null);
    setError(null);
    try {
      const [pages, vault] = await Promise.all([api.portfolios(), api.evidence().catch(() => ({ items: [] as CareerEvidence[] }))]);
      setItems(pages.items);
      setEvidence(vault.items);
      const first = pages.items[0];
      if (first) apply(first);
      setLoad('ready');
    } catch (caught) {
      if (isApiError(caught, 'plan_upgrade_required')) {
        setLoad('upgrade');
        return;
      }
      // The operator switch is off: this is not a plan matter, and retrying cannot help.
      if (isApiError(caught, 'feature_unavailable')) {
        setLoad('switched-off');
        return;
      }
      const failure = profileLoadFailure(caught);
      setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
    }
  }, [api, apply]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadPages();
  }, [ready, user, loadPages]);

  function replace(page: PortfolioPage) {
    setItems((current) => {
      const next = current.some((item) => item.id === page.id) ? current.map((item) => (item.id === page.id ? page : item)) : [page, ...current];
      return next;
    });
    apply(page);
  }

  async function run(action: () => Promise<PortfolioPage>, success: string) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setNote(null);
    setError(null);
    try {
      replace(await action());
      setNote(success);
    } catch (caught) {
      if (isApiError(caught, 'plan_upgrade_required')) setError(t('upgrade_body'));
      else if (isApiError(caught, 'capacity_exceeded')) setError(t('capacity'));
      else setError(t('failed'));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  async function create() {
    await run(() => api.createPortfolio({ title: title.trim(), headline, displayName, locale: locale === 'fr' ? 'fr' : 'en' }), t('saved'));
  }

  async function save() {
    if (!selected) return;
    await run(() => api.updatePortfolio(selected.id, {
      title: title.trim(),
      headline,
      displayName,
      showEmail,
      showPhone,
      contactEmail: email.trim() || null,
      contactPhone: phone.trim() || null,
      evidenceIds,
      sections,
      // Case studies only for items that stay on the page.
      caseStudies: Object.fromEntries(evidenceIds.map((id) => [id, caseStudies[id] ?? ''])),
    }), t('saved'));
  }

  async function downloadQr() {
    if (!selected || busy.current) return;
    busy.current = true;
    setWorking(true);
    setNote(null);
    setError(null);
    try {
      const qr = await api.portfolioQr(selected.id, window.location.origin);
      const blob = new Blob([qr.svg], { type: 'image/svg+xml' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `flacroncv-${selected.slug}.svg`;
      link.click();
      URL.revokeObjectURL(href);
      setNote(t('qr_ready'));
    } catch {
      setError(t('failed'));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'upgrade') return <PlanUpgradeState title={t('upgrade_title')} body={t('upgrade_body')} />;
  if (load === 'switched-off') return <EmptyState title={t('off_title')} body={t('off_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadPages()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
    return (
      <EmptyState
        title={t('signed_out_title')}
        body={t('signed_out_body')}
        action={<a className="inline-flex min-h-career-touch items-center rounded-md bg-career-navy px-4 text-sm font-semibold text-white dark:text-stone-950" href={signInHref}>{t('go_sign_in')}</a>}
      />
    );
  }

  // Only evidence marked "share on portfolio" is ever shown publicly, so only that can be picked.
  const shareable = evidence.filter((item) => item.isPortfolioShared);
  const hiddenCount = evidence.length - shareable.length;
  const sharePath = selected ? `/${selected.locale}/portfolio/${selected.slug}${selected.visibility === 'private' && selected.shareToken ? `?token=${selected.shareToken}` : ''}` : '';

  return (
    <ScreenStack>
      <PageHeader
        title={t('title')}
        actions={
          items.length > 0 ? (
            <Button type="button" variant="secondary" disabled={working} onClick={startNew}>
              {t('new_page')}
            </Button>
          ) : null
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('delete_title')}
        body={selected ? t('delete_body', { title: selected.title }) : undefined}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        busy={working}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      {items.length === 0 ? <EmptyState title={t('empty_title')} body={t('empty_body')} /> : null}
      <ul className="grid grid-cols-1 gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={item.id === selectedId}
              className={`min-h-career-touch w-full rounded-md border px-3 text-start text-sm text-career-ink ${item.id === selectedId ? 'border-career-navy bg-career-navy/5' : 'border-career-line'}`}
              onClick={() => apply(item)}
            >
              {item.title} · {t(item.visibility)}
              {item.visitCount === null ? '' : ` · ${t('visits', { count: item.visitCount })}`}
            </button>
          </li>
        ))}
      </ul>
      <Card>
        <div className="grid grid-cols-1 gap-3">
          <label className="block text-sm font-semibold text-career-ink" htmlFor="portfolio-title">{t('title_label')}</label>
          <input id="portfolio-title" className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
          <label className="block text-sm font-semibold text-career-ink" htmlFor="portfolio-headline">{t('headline_label')}</label>
          <input id="portfolio-headline" className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink" value={headline} maxLength={280} onChange={(event) => setHeadline(event.target.value)} />
          <label className="block text-sm font-semibold text-career-ink" htmlFor="portfolio-name">{t('display_name_label')}</label>
          <input id="portfolio-name" className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink" value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} />
          <p className="text-sm text-career-muted">{t('slug_stable')}</p>
          <label className="block text-sm font-semibold text-career-ink" htmlFor="portfolio-email">{t('email_label')}</label>
          <input id="portfolio-email" className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink" value={email} maxLength={200} onChange={(event) => setEmail(event.target.value)} />
          <label className="inline-flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
            <input type="checkbox" checked={showEmail} onChange={(event) => setShowEmail(event.target.checked)} />
            {t('show_email')}
          </label>
          <label className="block text-sm font-semibold text-career-ink" htmlFor="portfolio-phone">{t('phone_label')}</label>
          <input id="portfolio-phone" className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink" value={phone} maxLength={40} onChange={(event) => setPhone(event.target.value)} />
          <label className="inline-flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
            <input type="checkbox" checked={showPhone} onChange={(event) => setShowPhone(event.target.checked)} />
            {t('show_phone')}
          </label>
          <fieldset className="grid grid-cols-1 gap-1">
            <legend className="text-sm font-semibold text-career-ink">{t('sections_label')}</legend>
            <p className="text-sm text-career-muted">{t('sections_help')}</p>
            {(['summary', 'evidence', 'skills', 'contact'] as const).map((key) => (
              <label key={key} className="inline-flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
                <input type="checkbox" checked={sections[key]} onChange={(event) => setSections((current) => ({ ...current, [key]: event.target.checked }))} />
                {t(`section_${key}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid grid-cols-1 gap-2">
            <legend className="text-sm font-semibold text-career-ink">{t('evidence_label')}</legend>
            {shareable.length === 0 ? <p className="text-sm text-career-muted">{t('evidence_empty')}</p> : null}
            {hiddenCount > 0 ? <p className="text-sm text-career-muted">{t('evidence_not_shared', { count: hiddenCount })}</p> : null}
            {shareable.map((item) => (
              <label key={item.id} className="inline-flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
                <input
                  type="checkbox"
                  checked={evidenceIds.includes(item.id)}
                  onChange={(event) => setEvidenceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                />
                {item.title}
              </label>
            ))}
            {evidence
              .filter((item) => evidenceIds.includes(item.id))
              .map((item) => (
                <div key={`case-${item.id}`} className="space-y-1">
                  <label className="block text-sm font-semibold text-career-ink" htmlFor={`case-${item.id}`}>
                    {t('case_study_label', { title: item.title })}
                  </label>
                  <textarea
                    id={`case-${item.id}`}
                    rows={3}
                    maxLength={4000}
                    className="block w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-base text-career-ink"
                    value={caseStudies[item.id] ?? ''}
                    onChange={(event) => setCaseStudies((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                </div>
              ))}
          </fieldset>
          {selected && selected.visibility !== 'draft' && sharePath ? (
            <div className="flex flex-wrap items-center gap-2">
              <a className="min-w-0 break-all text-sm font-semibold text-career-orange-text underline" href={sharePath} target="_blank" rel="noreferrer" dir="ltr">
                {typeof window === 'undefined' ? sharePath : `${window.location.origin}${sharePath}`}
              </a>
              <Button type="button" variant="secondary" onClick={() => void copyLink(`${window.location.origin}${sharePath}`)}>
                {t('copy_link')}
              </Button>
            </div>
          ) : null}
          {selected && selected.visitCount === null ? <p className="text-sm text-career-muted">{t('visits_hidden')}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {selected ? (
              <Button type="button" loading={working} loadingLabel={t('saving')} onClick={() => void save()}>{t('save')}</Button>
            ) : (
              <Button type="button" loading={working} loadingLabel={t('creating')} disabled={title.trim().length === 0} onClick={() => void create()}>{t('create')}</Button>
            )}
            {selected ? <Button type="button" variant="secondary" disabled={working} onClick={() => void run(() => api.publishPortfolio(selected.id, 'public'), t('published'))}>{t('publish_public')}</Button> : null}
            {selected ? <Button type="button" variant="secondary" disabled={working} onClick={() => void run(() => api.publishPortfolio(selected.id, 'private'), t('made_private'))}>{t('publish_private')}</Button> : null}
            {selected && selected.visibility !== 'draft' ? <Button type="button" variant="secondary" disabled={working} onClick={() => void run(() => api.unpublishPortfolio(selected.id), t('unpublished'))}>{t('unpublish')}</Button> : null}
            {selected?.visibility === 'private' ? <Button type="button" variant="secondary" disabled={working} onClick={() => void run(() => api.revokePortfolio(selected.id), t('revoked'))}>{t('revoke')}</Button> : null}
            {selected && selected.visibility !== 'draft' ? <Button type="button" variant="secondary" disabled={working} onClick={() => void downloadQr()}>{t('download_qr')}</Button> : null}
            {selected ? <Button type="button" variant="danger-ghost" disabled={working} onClick={() => setConfirmDelete(true)}>{t('delete')}</Button> : null}
          </div>
          {note ? <p role="status" className="text-sm text-career-ink">{note}</p> : null}
          {error ? <p role="alert" className="text-sm text-career-danger">{error}</p> : null}
        </div>
      </Card>
    </ScreenStack>
  );
}
