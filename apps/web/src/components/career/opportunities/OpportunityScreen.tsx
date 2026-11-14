'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  isApiError,
  type ApiClient,
  type OpportunityItem,
  type OpportunitySearchQuery,
  type OpportunitySearchResult,
} from '@flacroncv/career-api-client';
import {
  fieldsForCategory,
  LISTING_SCHEDULES,
  LISTING_SENIORITIES,
  MIN_LISTING_TEXT,
  OPPORTUNITY_CATEGORIES,
  type ListingDetailField,
} from '@flacroncv/career-shared';
import {
  Button,
  Card,
  EmptyState,
  InlineNote,
  Input,
  LoadingState,
  NoResultsState,
  PageHeader,
  PermissionDeniedState,
  ProviderUnavailableState,
  ScreenStack,
} from '@/components/career/ui';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { profileLoadFailure } from '@/lib/career/profile-load';
import { FieldCheck, FieldSelect } from './FieldSelect';
import { ListingFacts } from './ListingFacts';

/** The search form's own state; every field empty means "no filter". */
interface Filters {
  q: string;
  role: string;
  category: string;
  minPay: string;
  payCurrency: string;
  payStated: boolean;
  schedule: string;
  seniority: string;
  place: string;
  radiusMiles: string;
  remote: string;
  postedWithinDays: string;
  deadlineBefore: string;
  followedOnly: boolean;
  provider: string;
  includeExpired: boolean;
}

const EMPTY_FILTERS: Filters = {
  q: '',
  role: '',
  category: '',
  minPay: '',
  payCurrency: '',
  payStated: false,
  schedule: '',
  seniority: '',
  place: '',
  radiusMiles: '',
  remote: '',
  postedWithinDays: '',
  deadlineBefore: '',
  followedOnly: false,
  provider: '',
  includeExpired: false,
};

/** Only the filters the person set; expired listings are hidden unless asked for. */
export function searchQuery(filters: Filters): OpportunitySearchQuery {
  const query: OpportunitySearchQuery = { q: filters.q.trim() };
  const text = (value: string) => (value.trim().length > 0 ? value.trim() : undefined);
  const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined);
  const set = <K extends keyof OpportunitySearchQuery>(key: K, value: OpportunitySearchQuery[K] | undefined) => {
    if (value !== undefined) query[key] = value;
  };
  set('role', text(filters.role));
  set('category', text(filters.category));
  set('minPay', whole(filters.minPay));
  set('payCurrency', text(filters.payCurrency)?.toUpperCase());
  if (filters.payStated) query.payStated = true;
  set('schedule', text(filters.schedule));
  set('seniority', text(filters.seniority));
  set('place', text(filters.place));
  set('radiusMiles', whole(filters.radiusMiles));
  set('remote', filters.remote === 'restricted' || filters.remote === 'unrestricted' ? filters.remote : undefined);
  set('postedWithinDays', whole(filters.postedWithinDays));
  set('deadlineBefore', text(filters.deadlineBefore));
  if (filters.followedOnly) query.followedOnly = true;
  set('provider', text(filters.provider));
  if (!filters.includeExpired) query.includeExpired = false;
  return query;
}

const FILTER_CATEGORIES = ['full_time', 'part_time', 'temporary', 'contract', 'remote', 'hybrid', ...OPPORTUNITY_CATEGORIES] as const;
const PROVIDERS = ['paste', 'adzuna', 'usajobs', 'greenhouse', 'lever'] as const;

export function OpportunityScreen({
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
  const t = useTranslations('career.opportunities');
  const [load, setLoad] = useState<'loading' | 'signed-out' | 'permission' | 'unavailable' | 'ready'>('loading');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [paste, setPaste] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [pasteCategory, setPasteCategory] = useState('');
  const [pasteDeadline, setPasteDeadline] = useState('');
  const [pasteDetails, setPasteDetails] = useState<Partial<Record<ListingDetailField, string>>>({});
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [notApplied, setNotApplied] = useState<NonNullable<OpportunitySearchResult['notApplied']>>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [radiusLimit, setRadiusLimit] = useState<number | null>(null);
  const [pasteNote, setPasteNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const note = useCallback((error: unknown) => {
    if (isApiError(error, 'validation_error') && error.body.field === 'radiusMiles' && typeof error.body.limit === 'number') {
      setRadiusLimit(error.body.limit);
      return;
    }
    const failure = profileLoadFailure(error);
    setLoad(failure === 'signed-out' ? 'signed-out' : failure === 'permission' ? 'permission' : 'unavailable');
  }, []);

  // Saved listings show as soon as the page opens, not only after a search.
  const loadSaved = useCallback(async () => {
    setLoad('loading');
    try {
      const result = await api.opportunities(searchQuery(EMPTY_FILTERS));
      setItems(result.items);
      setNotApplied(result.notApplied ?? []);
      setLoad('ready');
    } catch (error) {
      note(error);
    }
  }, [api, note]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoad('signed-out');
      return;
    }
    void loadSaved();
  }, [ready, user, loadSaved]);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setRadiusLimit(null);
    try {
      const query = searchQuery(filters);
      const result = await api.opportunities(query);
      setItems(result.items);
      setNotApplied(result.notApplied ?? []);
      // Any filter makes an empty list a "no results" answer rather than an empty page.
      setSearched(JSON.stringify(query) !== JSON.stringify(searchQuery(EMPTY_FILTERS)));
    } catch (error) {
      note(error);
    } finally {
      setPending(false);
    }
  }

  async function toggleSave(item: OpportunityItem) {
    setSavingId(item.id);
    try {
      if (item.saved) await api.unsaveOpportunity(item.id);
      else await api.saveOpportunity(item.id);
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, saved: !item.saved } : entry)));
    } catch (error) {
      note(error);
    } finally {
      setSavingId(null);
    }
  }

  async function savePaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasteNote(null);
    if (paste.trim().length < MIN_LISTING_TEXT) {
      setPasteNote({ tone: 'error', text: t('paste_too_short', { count: MIN_LISTING_TEXT }) });
      return;
    }
    setPending(true);
    try {
      const details = Object.fromEntries(
        Object.entries(pasteDetails).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
      ) as Partial<Record<ListingDetailField, string>>;
      const created = await api.pasteOpportunity({
        text: paste,
        sourceUrl: sourceUrl.trim() || undefined,
        ...(pasteCategory ? { category: pasteCategory } : {}),
        ...(pasteDeadline ? { deadline: pasteDeadline } : {}),
        ...(Object.keys(details).length > 0 ? { details } : {}),
      });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setPaste('');
      setSourceUrl('');
      setPasteCategory('');
      setPasteDeadline('');
      setPasteDetails({});
      setPasteNote({ tone: 'success', text: t('paste_saved') });
    } catch (error) {
      if (isApiError(error, 'validation_error')) {
        const field = error.body.field;
        setPasteNote({
          tone: 'error',
          text:
            field === 'sourceUrl'
              ? t('paste_bad_url')
              : field === 'deadline' || field === 'category'
                ? t('paste_bad_field')
                : t('paste_too_short', { count: MIN_LISTING_TEXT }),
        });
      } else {
        note(error);
      }
    } finally {
      setPending(false);
    }
  }

  if (!ready || load === 'loading') return <LoadingState label={t('loading')} />;
  if (load === 'permission') return <PermissionDeniedState title={t('permission_title')} body={t('permission_body')} />;
  if (load === 'unavailable') {
    return (
      <ProviderUnavailableState
        title={t('unavailable_title')}
        body={t('unavailable_body')}
        action={<Button type="button" onClick={() => void loadSaved()}>{t('retry')}</Button>}
      />
    );
  }
  if (load === 'signed-out' || !user) {
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

  const any = { value: '', label: t('filter_any') };
  const pasteFields = fieldsForCategory(pasteCategory || 'job').details;

  return (
    <ScreenStack>
      <PageHeader title={t('title')} />
      <form className="flex flex-col gap-3" onSubmit={(event) => void search(event)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input label={t('query_label')} name="q" value={filters.q} onChange={(event) => update('q', event.target.value)} />
          </div>
          <Button type="submit" disabled={pending}>{t('search')}</Button>
        </div>
        <details className="rounded-md border border-career-line p-3">
          <summary className="min-h-career-touch cursor-pointer text-sm font-semibold text-career-ink">{t('filters_title')}</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldSelect
              label={t('filter_category')}
              value={filters.category}
              onChange={(event) => update('category', event.target.value)}
              options={[any, ...FILTER_CATEGORIES.map((value) => ({ value, label: (OPPORTUNITY_CATEGORIES as readonly string[]).includes(value) ? t(`category_${value}`) : t(`filter_category_${value}`) }))]}
            />
            <Input label={t('filter_role')} value={filters.role} onChange={(event) => update('role', event.target.value)} />
            <Input label={t('filter_min_pay')} inputMode="numeric" value={filters.minPay} onChange={(event) => update('minPay', event.target.value)} hint={t('filter_min_pay_hint')} />
            <Input label={t('filter_currency')} maxLength={3} value={filters.payCurrency} onChange={(event) => update('payCurrency', event.target.value)} />
            <FieldSelect
              label={t('field_schedule')}
              value={filters.schedule}
              onChange={(event) => update('schedule', event.target.value)}
              options={[any, ...LISTING_SCHEDULES.map((value) => ({ value, label: t(`schedule_${value}`) }))]}
            />
            <FieldSelect
              label={t('field_seniority')}
              value={filters.seniority}
              onChange={(event) => update('seniority', event.target.value)}
              options={[any, ...LISTING_SENIORITIES.map((value) => ({ value, label: t(`seniority_${value}`) }))]}
            />
            <Input label={t('filter_place')} value={filters.place} onChange={(event) => update('place', event.target.value)} />
            <Input label={t('filter_radius')} inputMode="numeric" value={filters.radiusMiles} onChange={(event) => update('radiusMiles', event.target.value)} hint={t('filter_radius_hint')} />
            <FieldSelect
              label={t('field_remote_restriction')}
              value={filters.remote}
              onChange={(event) => update('remote', event.target.value)}
              options={[any, { value: 'restricted', label: t('filter_remote_restricted') }, { value: 'unrestricted', label: t('filter_remote_unrestricted') }]}
            />
            <FieldSelect
              label={t('filter_posted')}
              value={filters.postedWithinDays}
              onChange={(event) => update('postedWithinDays', event.target.value)}
              options={[any, ...['1', '7', '30'].map((value) => ({ value, label: t('filter_posted_days', { count: Number(value) }) }))]}
            />
            <Input label={t('filter_deadline_before')} type="date" value={filters.deadlineBefore} onChange={(event) => update('deadlineBefore', event.target.value)} />
            <FieldSelect
              label={t('filter_source')}
              value={filters.provider}
              onChange={(event) => update('provider', event.target.value)}
              options={[any, ...PROVIDERS.map((value) => ({ value, label: t(`provider_${value}`) }))]}
            />
            <FieldCheck label={t('filter_pay_stated')} checked={filters.payStated} onChange={(event) => update('payStated', event.target.checked)} />
            <FieldCheck label={t('filter_followed')} checked={filters.followedOnly} onChange={(event) => update('followedOnly', event.target.checked)} />
            <FieldCheck label={t('filter_include_expired')} checked={filters.includeExpired} onChange={(event) => update('includeExpired', event.target.checked)} />
          </div>
        </details>
      </form>
      {radiusLimit !== null ? <InlineNote>{t('radius', { limit: radiusLimit })}</InlineNote> : null}
      {notApplied.map((entry) => (
        <InlineNote key={`${entry.filter}-${entry.reason}`}>{t(`not_applied_${entry.reason}`)}</InlineNote>
      ))}
      {items.length === 0 ? (
        searched ? (
          <NoResultsState title={t('no_results_title')} body={t('no_results_filters_body')} />
        ) : (
          <EmptyState title={t('empty_title')} body={t('empty_body')} />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <a className="min-w-0 text-lg font-semibold text-career-ink hover:underline" dir="auto" href={`/${locale}/career/opportunities/${item.id}`}>{item.title}</a>
                  <Button type="button" variant="ghost" disabled={savingId === item.id} aria-pressed={item.saved === true} onClick={() => void toggleSave(item)}>
                    {item.saved ? t('saved_button') : t('save_button')}
                  </Button>
                </div>
                <ListingFacts item={item} className="mt-2" />
                {item.label === 'expired' ? <p className="mt-1 text-sm text-career-orange-text">{t('expired')}</p> : null}
                {item.stale ? <p className="mt-1 text-sm text-career-muted">{t('stale_short')}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(event) => void savePaste(event)}>
          <h2 className="text-lg font-semibold text-career-ink">{t('paste_heading')}</h2>
          <label className="text-sm font-semibold text-career-ink" htmlFor="paste-text">{t('paste_label')}</label>
          <textarea
            id="paste-text"
            className="min-h-[8rem] rounded-md border border-career-line bg-career-surface p-3 text-sm text-career-ink placeholder:text-career-muted"
            placeholder={t('paste_placeholder')}
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
          />
          <Input label={t('paste_url')} name="sourceUrl" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
          <FieldSelect
            label={t('paste_category')}
            hint={t('paste_category_hint')}
            value={pasteCategory}
            onChange={(event) => setPasteCategory(event.target.value)}
            options={[{ value: '', label: t('paste_category_auto') }, ...OPPORTUNITY_CATEGORIES.map((value) => ({ value, label: t(`category_${value}`) }))]}
          />
          <Input label={t('paste_deadline')} type="date" value={pasteDeadline} onChange={(event) => setPasteDeadline(event.target.value)} hint={t('paste_deadline_hint')} />
          {pasteFields.map((field) => (
            <Input
              key={field}
              label={t(`detail_${field}`)}
              type={field === 'eventDate' ? 'date' : 'text'}
              maxLength={300}
              value={pasteDetails[field] ?? ''}
              onChange={(event) => setPasteDetails((current) => ({ ...current, [field]: event.target.value }))}
            />
          ))}
          <div>
            <Button type="submit" variant="secondary" disabled={pending}>{t('paste')}</Button>
          </div>
          {pasteNote ? <InlineNote tone={pasteNote.tone}>{pasteNote.text}</InlineNote> : null}
        </form>
      </Card>
    </ScreenStack>
  );
}
