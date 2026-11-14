'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  newIdempotencyKey,
  type ApiClient,
  type ApiKeyEnvironment,
  type ApiKeyView,
  type DeveloperStatus,
  type HumanServiceList,
  type LearningLoopView,
  type MapList,
} from '@flacroncv/career-api-client';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input } from '@/components/career/ui';
import { errorNote, ScopeNote, useScopeBusy, type ActionNote } from './scope-actions';

/**
 * The application-outcome report, worded on the client from the numbers the
 * API returns, so it reads naturally in every interface language.
 */
export function LoopPanel({ report }: { report: LearningLoopView }) {
  const t = useTranslations('career.scope');
  return (
    <Card>
      <p className="text-base text-career-ink">
        {report.interviewRatePercent === null
          ? t('loop_counts', { count: report.recordedApplications })
          : t('loop_rate', { interviews: report.interviews, count: report.recordedApplications, percent: report.interviewRatePercent })}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['loop_recorded', report.recordedApplications],
            ['loop_no_response', report.noResponse],
            ['loop_interviews', report.interviews],
            ['loop_offers', report.offers],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-md border border-career-line p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-career-muted">{t(key)}</dt>
            <dd className="mt-1 text-xl font-bold text-career-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {report.unrecorded > 0 ? <p className="mt-3 text-sm text-career-muted">{t('loop_unrecorded', { count: report.unrecorded })}</p> : null}
      {report.suggestion ? <p className="mt-3 text-sm text-career-ink">{t('loop_suggestion')}</p> : null}
    </Card>
  );
}

/**
 * Map discovery. Until a tile provider is configured there is no visual map,
 * so no session is offered or charged: the list below is the whole feature.
 */
export function MapPanel({ api, list }: { api: ApiClient; list: MapList }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const available = list.available === true;

  async function start() {
    await run(async () => {
      setNote(null);
      try {
        const paid = await api.startMap(newIdempotencyKey());
        setMinutes(paid.result.minutes);
      } catch (error) {
        setNote(errorNote(error));
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <Card>
      {available ? null : (
        <div className="mb-4 flex flex-wrap items-start gap-2">
          <Badge tone="later">{t('coming_soon')}</Badge>
          <p className="min-w-0 flex-1 text-sm text-career-muted">{t('map_soon_body')}</p>
        </div>
      )}
      <h2 className="text-base font-semibold text-career-ink">{t('map_list_heading')}</h2>
      {list.items.length === 0 ? (
        <p className="mt-3 text-sm text-career-muted">{t('map_empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.items.map((item) => (
            <li key={item.id} className="rounded-md border border-career-line px-3 py-2 text-sm text-career-ink" dir="auto">
              {item.title}
            </li>
          ))}
        </ul>
      )}
      {available ? (
        <>
          <Button type="button" className="mt-4" disabled={busy} onClick={() => setConfirming(true)}>
            {t('start_map')}
          </Button>
          <ScopeNote note={note} className="mt-3" />
          {minutes !== null ? <ScopeNote note={{ tone: 'success', key: 'minutes', values: { minutes } }} className="mt-3" /> : null}
          <ConfirmDialog
            open={confirming}
            title={t('map_confirm_title')}
            body={t('map_confirm_body')}
            confirmLabel={t('start_map')}
            cancelLabel={t('cancel')}
            busy={busy}
            onConfirm={() => void start()}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </Card>
  );
}

/**
 * Human review. Booking opens only when a provider's booking is open; today
 * none is, so the page says what the service will be and that it is coming.
 */
export function ServicesPanel({ api, services }: { api: ApiClient; services: HumanServiceList }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [notes, setNotes] = useState<Record<string, ActionNote | null>>({});

  async function book(providerId: string) {
    await run(async () => {
      setNotes((current) => ({ ...current, [providerId]: null }));
      try {
        await api.bookHumanService(providerId);
        setNotes((current) => ({ ...current, [providerId]: { tone: 'success', key: 'booking_requested' } }));
      } catch (error) {
        setNotes((current) => ({ ...current, [providerId]: errorNote(error, 'booking_closed_body') }));
      }
    });
  }

  return (
    <div className="space-y-4">
      <ComingSoonCard title={t('services_soon_title')} body={t('services_soon_body')} />
      {services.items.length === 0 ? (
        <EmptyState title={t('services_empty')} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.items.map((item) => {
            // The one provider the service ships is described here in every language.
            const known = item.id === 'review-not-open';
            return (
              <li key={item.id}>
                <Card className="h-full">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-career-ink" dir="auto">{known ? t('services_review_name') : item.name}</h2>
                    {item.bookingOpen ? null : <Badge tone="later">{t('coming_soon')}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-career-muted" dir="auto">{known ? t('services_review_scope') : item.scope}</p>
                  <p className="mt-3 text-sm text-career-ink" dir="auto">{known ? t('services_note') : item.note}</p>
                  <Button type="button" className="mt-4" disabled={busy || !item.bookingOpen} onClick={() => void book(item.id)}>
                    {t('book')}
                  </Button>
                  <ScopeNote note={notes[item.id] ?? null} className="mt-3" />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A plain "coming soon" explanation: what the area will do, and that nothing is sold yet. */
export function ComingSoonCard({ title, body }: { title: string; body: string }) {
  const t = useTranslations('career.scope');
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone="later">{t('coming_soon')}</Badge>
        <h2 className="min-w-0 flex-1 text-base font-semibold text-career-ink">{title}</h2>
      </div>
      <p className="mt-2 text-sm text-career-muted">{body}</p>
    </Card>
  );
}

export function RecruitingPanel({ api, initialDiscoverable }: { api: ApiClient; initialDiscoverable: boolean }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [saveNote, setSaveNote] = useState<ActionNote | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [searchNote, setSearchNote] = useState<ActionNote | null>(null);

  async function save() {
    await run(async () => {
      setSaveNote(null);
      try {
        const saved = await api.setRecruitingOptIn(discoverable);
        setDiscoverable(saved.discoverable);
        setSaveNote({ tone: 'success', key: saved.discoverable ? 'opt_in_saved_on' : 'opt_in_saved_off' });
      } catch (error) {
        setSaveNote(errorNote(error));
      }
    });
  }

  // Only a count comes back: nobody can see who else opted in.
  async function countOptIns() {
    await run(async () => {
      setSearchNote(null);
      try {
        setCount((await api.recruitingSearch()).count);
      } catch (error) {
        setSearchNote(errorNote(error, 'checkout_closed_body'));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="text-lg font-semibold text-career-ink">{t('opt_in_heading')}</h2>
        <p className="mt-1 text-sm text-career-muted">{t('recruiting_help')}</p>
        <label className="mt-4 flex min-h-career-touch items-center gap-2 text-sm text-career-ink">
          <input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} />
          {t('discoverable')}
        </label>
        <Button type="button" className="mt-3" disabled={busy} onClick={() => void save()}>
          {t('save_opt_in')}
        </Button>
        <ScopeNote note={saveNote} className="mt-3" />
      </Card>
      <Card>
        <div className="flex flex-wrap items-start gap-2">
          <Badge tone="later">{t('coming_soon')}</Badge>
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-career-ink">{t('employer_heading')}</h2>
        </div>
        <p className="mt-2 text-sm text-career-muted">{t('employer_soon_body')}</p>
        <Button type="button" variant="secondary" className="mt-4" disabled={busy} onClick={() => void countOptIns()}>
          {t('count_opt_ins')}
        </Button>
        <ScopeNote note={searchNote} className="mt-3" />
        {count !== null ? <ScopeNote note={{ tone: 'info', key: 'search_count', values: { count } }} className="mt-3" /> : null}
      </Card>
    </div>
  );
}

/**
 * Organization tools. Each action is enabled only when its add-on is on the
 * account; otherwise the reason is shown where the button would be. Keys
 * belong to one environment: test keys never spend paid reads.
 */
export function DeveloperPanel({ api, initial }: { api: ApiClient; initial: DeveloperStatus }) {
  const t = useTranslations('career.scope');
  const locale = useLocale();
  const { busy, run } = useScopeBusy();
  const [token, setToken] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyView[]>(initial.keys ?? []);
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>('test');
  const [keyNote, setKeyNote] = useState<ActionNote | null>(null);
  const [brand, setBrand] = useState(initial.brand?.brandName ?? '');
  const [attribution, setAttribution] = useState(initial.brand?.attribution ?? '');
  const [brandNote, setBrandNote] = useState<ActionNote | null>(null);
  const limits = initial.rateLimits ?? { test: 30, live: 120 };
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  async function createKey() {
    await run(async () => {
      setKeyNote(null);
      setToken(null);
      try {
        const created = await api.createDeveloperKey(environment);
        setToken(created.token);
        setKeys((current) => [
          { id: created.id, prefix: created.prefix, environment: created.environment, createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null },
          ...current,
        ]);
      } catch (error) {
        setKeyNote(errorNote(error, 'api_package_missing'));
      }
    });
  }

  async function revoke(keyId: string) {
    await run(async () => {
      setKeyNote(null);
      try {
        await api.revokeDeveloperKey(keyId);
        setKeys((current) => current.map((key) => (key.id === keyId ? { ...key, revokedAt: new Date().toISOString() } : key)));
        setKeyNote({ tone: 'success', key: 'key_revoked' });
      } catch (error) {
        setKeyNote(errorNote(error));
      }
    });
  }

  async function saveBrand(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      setBrandNote(null);
      try {
        const saved = await api.setWhiteLabel(brand, attribution);
        setBrand(saved.brandName);
        setAttribution(saved.attribution);
        setBrandNote({ tone: 'success', key: 'brand_saved' });
      } catch (error) {
        setBrandNote(errorNote(error, 'white_label_missing'));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-career-ink">{t('api_heading')}</h2>
          {initial.apiPackage ? null : <Badge tone="later">{t('coming_soon')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-career-muted">{t('developer_help')}</p>
        <p className="mt-2 text-sm text-career-muted">{t('rate_limits', { test: limits.test, live: limits.live })}</p>
        <label className="mt-4 block space-y-1.5 text-sm font-semibold text-career-ink">
          <span>{t('key_environment')}</span>
          <select
            className="block h-11 w-full rounded-md border border-career-line bg-career-surface px-3 text-base text-career-ink"
            value={environment}
            disabled={!initial.apiPackage}
            onChange={(event) => setEnvironment(event.target.value === 'live' ? 'live' : 'test')}
          >
            <option value="test">{t('env_test')}</option>
            <option value="live">{t('env_live')}</option>
          </select>
        </label>
        <Button type="button" className="mt-3" disabled={busy || !initial.apiPackage} onClick={() => void createKey()}>
          {t('create_key')}
        </Button>
        {initial.apiPackage ? null : <p className="mt-3 text-sm text-career-muted">{t('api_package_missing')}</p>}
        <ScopeNote note={keyNote} className="mt-3" />
        {token ? (
          <div className="mt-3 rounded-md border border-career-line bg-career-wash p-3 text-sm text-career-ink" role="status">
            <p>{t('key_once')}</p>
            <code className="mt-2 block break-all font-mono text-xs" dir="ltr">{token}</code>
          </div>
        ) : null}
        {keys.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-career-line px-3 py-2 text-sm">
                <span className="min-w-0">
                  <code className="font-mono text-xs" dir="ltr">{key.prefix}…</code>{' '}
                  <Badge tone="neutral">{t(key.environment === 'test' ? 'env_test' : 'env_live')}</Badge>
                  <span className="ms-2 text-career-muted">{t('key_created', { date: date.format(new Date(key.createdAt)) })}</span>
                </span>
                {key.revokedAt ? (
                  <Badge tone="later">{t('key_revoked_badge')}</Badge>
                ) : (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void revoke(key.id)}>
                    {t('revoke_key')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <Card>
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-career-ink">{t('brand_heading')}</h2>
          {initial.whiteLabel ? null : <Badge tone="later">{t('coming_soon')}</Badge>}
        </div>
        <form className="mt-3 grid grid-cols-1 gap-3" onSubmit={(event) => void saveBrand(event)}>
          <Input label={t('brand')} value={brand} maxLength={80} disabled={!initial.whiteLabel} onChange={(event) => setBrand(event.target.value)} />
          <Input
            label={t('attribution')}
            hint={t('attribution_hint')}
            value={attribution}
            maxLength={200}
            disabled={!initial.whiteLabel}
            onChange={(event) => setAttribution(event.target.value)}
          />
          <div>
            <Button type="submit" disabled={busy || !initial.whiteLabel}>{t('save_brand')}</Button>
          </div>
          {initial.whiteLabel ? null : <p className="text-sm text-career-muted">{t('white_label_missing')}</p>}
          <ScopeNote note={brandNote} />
        </form>
      </Card>
    </div>
  );
}

/**
 * Whether the browser extension that fills reviewed forms is published.
 * Until it is, the menu leaves the page out and the page says it is coming.
 */
export function formExtensionAvailable(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_FORM_EXTENSION?.trim() === 'true';
}

export function FormsPanel({ api }: { api: ApiClient }) {
  const t = useTranslations('career.scope');
  const { busy, run } = useScopeBusy();
  const [site, setSite] = useState('');
  const [formId, setFormId] = useState<string | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);

  if (!formExtensionAvailable()) return <EmptyState title={t('forms_soon_title')} body={t('forms_soon_body')} />;

  async function prepare(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      setNote(null);
      try {
        setFormId((await api.createForm(site.trim(), newIdempotencyKey())).result.id);
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  async function review() {
    if (!formId) return;
    await run(async () => {
      setNote(null);
      try {
        await api.reviewForm(formId, true);
        await api.fillForm(formId);
        // The service never submits a form; the person sends it on the site.
        setNote({ tone: 'success', key: 'form_ready' });
      } catch (error) {
        setNote(errorNote(error));
      }
    });
  }

  return (
    <Card>
      <form className="grid grid-cols-1 gap-3" onSubmit={(event) => void prepare(event)}>
        <Input label={t('site')} placeholder={t('site_placeholder')} value={site} onChange={(event) => setSite(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !site.trim()}>{t('preview')}</Button>
          {formId ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void review()}>{t('review')}</Button> : null}
        </div>
        <ScopeNote note={note} />
      </form>
    </Card>
  );
}
