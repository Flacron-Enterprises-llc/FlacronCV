'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isApiError, type AlertLocation, type ApiClient, type FollowedCompany } from '@flacroncv/career-api-client';
import { Button, Card, Input } from '@/components/career/ui';

type Note = 'capacity' | 'upgrade' | 'invalid' | 'failed' | null;

function noteFor(error: unknown): Note {
  if (isApiError(error, 'capacity_exceeded')) return 'capacity';
  if (isApiError(error, 'plan_upgrade_required')) return 'upgrade';
  if (isApiError(error, 'validation_error')) return 'invalid';
  return 'failed';
}

/** Whole miles 0–10000, as the API accepts; empty means the API default. */
export function parseRadius(value: string): number | undefined | 'invalid' {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^\d{1,5}$/.test(trimmed)) return 'invalid';
  const miles = Number(trimmed);
  return miles <= 10000 ? miles : 'invalid';
}

/**
 * Places a saved search can be limited to, and companies whose new listings
 * raise an alert. Each list loads and fails on its own, so one failing does not
 * hide the other or the alert centre. `onLocations` lets the saved-search form
 * offer the places as a filter.
 */
export function AlertTargets({ api, onLocations }: { api: ApiClient; onLocations: (locations: AlertLocation[]) => void }) {
  const t = useTranslations('career.alerts');
  const [locations, setLocations] = useState<AlertLocation[] | 'error' | null>(null);
  const [companies, setCompanies] = useState<FollowedCompany[] | 'error' | null>(null);
  const [place, setPlace] = useState('');
  const [radius, setRadius] = useState('');
  const [company, setCompany] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [aliases, setAliases] = useState('');
  const [roles, setRoles] = useState('');
  const [companyPlaces, setCompanyPlaces] = useState('');
  const [locationNote, setLocationNote] = useState<Note>(null);
  const [companyNote, setCompanyNote] = useState<Note>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    try {
      const items = (await api.alertLocations()).items;
      setLocations(items);
      onLocations(items);
    } catch {
      setLocations('error');
    }
  }, [api, onLocations]);

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies((await api.followedCompanies()).items);
    } catch {
      setCompanies('error');
    }
  }, [api]);

  useEffect(() => {
    void loadLocations();
    void loadCompanies();
  }, [loadLocations, loadCompanies]);

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const radiusMiles = parseRadius(radius);
    if (place.trim().length === 0 || radiusMiles === 'invalid') {
      setLocationNote('invalid');
      return;
    }
    setBusy('location');
    setLocationNote(null);
    try {
      await api.createAlertLocation({ place: place.trim(), ...(radiusMiles === undefined ? {} : { radiusMiles }) });
      setPlace('');
      setRadius('');
      await loadLocations();
    } catch (error) {
      setLocationNote(noteFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function removeLocation(location: AlertLocation) {
    setBusy(location.id);
    setLocationNote(null);
    try {
      await api.deleteAlertLocation(location.id);
      await loadLocations();
    } catch (error) {
      setLocationNote(noteFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function follow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (company.trim().length === 0) {
      setCompanyNote('invalid');
      return;
    }
    setBusy('company');
    setCompanyNote(null);
    try {
      const url = companyUrl.trim();
      const lists = { aliases: splitList(aliases), roles: splitList(roles), locations: splitList(companyPlaces) };
      await api.followCompany({
        name: company.trim(),
        ...(url ? { sourceUrl: url } : {}),
        ...(lists.aliases.length > 0 ? { aliases: lists.aliases } : {}),
        ...(lists.roles.length > 0 ? { roles: lists.roles } : {}),
        ...(lists.locations.length > 0 ? { locations: lists.locations } : {}),
      });
      setCompany('');
      setCompanyUrl('');
      setAliases('');
      setRoles('');
      setCompanyPlaces('');
      await loadCompanies();
    } catch (error) {
      setCompanyNote(noteFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function unfollow(item: FollowedCompany) {
    setBusy(item.id);
    setCompanyNote(null);
    try {
      await api.unfollowCompany(item.id);
      setCompanies((current) => (Array.isArray(current) ? current.filter((c) => c.id !== item.id) : current));
    } catch (error) {
      setCompanyNote(noteFor(error));
    } finally {
      setBusy(null);
    }
  }

  const noteText = (note: Note) =>
    note === 'capacity' ? t('capacity') : note === 'upgrade' ? t('upgrade_body') : note === 'invalid' ? t('targets_invalid') : note === 'failed' ? t('targets_failed') : null;

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('locations_title')}</h2>
        <p className="mt-1 text-sm text-slate">{t('locations_body')}</p>
        <TargetList
          items={locations}
          empty={t('locations_empty')}
          error={t('locations_error')}
          retry={() => void loadLocations()}
          render={(location) => (
            <>
              <span className="min-w-0 flex-1 break-words font-semibold">
                {t('location_line', { place: location.place, miles: location.radiusMiles })}
                {location.hasCoordinates === false ? <span className="block text-xs font-normal text-slate">{t('location_by_name')}</span> : null}
              </span>
              <Button type="button" disabled={busy === location.id} onClick={() => void removeLocation(location)} aria-label={t('location_delete_label', { place: location.place })}>
                {t('searches_delete')}
              </Button>
            </>
          )}
        />
        <form className="mt-3 space-y-3" onSubmit={(event) => void addLocation(event)}>
          <Input label={t('location_place')} value={place} onChange={(event) => setPlace(event.target.value)} maxLength={200} />
          <Input label={t('location_radius')} value={radius} onChange={(event) => setRadius(event.target.value)} inputMode="numeric" hint={t('location_radius_hint')} />
          <Button type="submit" disabled={busy === 'location'}>
            {t('location_add')}
          </Button>
          {locationNote ? <p className="text-sm">{noteText(locationNote)}</p> : null}
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-career-navy dark:text-white">{t('companies_title')}</h2>
        <p className="mt-1 text-sm text-slate">{t('companies_body')}</p>
        <TargetList
          items={companies}
          empty={t('companies_empty')}
          error={t('companies_error')}
          retry={() => void loadCompanies()}
          render={(item) => (
            <>
              <span className="min-w-0 flex-1 break-words font-semibold">
                {item.name}
                {companyDetail(item, t)}
              </span>
              <Button type="button" disabled={busy === item.id} onClick={() => void unfollow(item)} aria-label={t('company_unfollow_label', { name: item.name })}>
                {t('company_unfollow')}
              </Button>
            </>
          )}
        />
        <form className="mt-3 space-y-3" onSubmit={(event) => void follow(event)}>
          <Input label={t('company_name')} value={company} onChange={(event) => setCompany(event.target.value)} maxLength={200} />
          <Input label={t('company_url')} value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} type="url" maxLength={2000} />
          <Input label={t('company_aliases')} value={aliases} onChange={(event) => setAliases(event.target.value)} hint={t('company_list_hint')} />
          <Input label={t('company_roles')} value={roles} onChange={(event) => setRoles(event.target.value)} hint={t('company_list_hint')} />
          <Input label={t('company_places')} value={companyPlaces} onChange={(event) => setCompanyPlaces(event.target.value)} hint={t('company_list_hint')} />
          <Button type="submit" disabled={busy === 'company'}>
            {t('company_follow')}
          </Button>
          {companyNote ? <p className="text-sm">{noteText(companyNote)}</p> : null}
        </form>
      </Card>
    </>
  );
}

/** Comma-separated input to a short list (the API keeps at most 10 of each). */
export function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((part) => part.trim()).filter((part) => part.length > 0))].slice(0, 10);
}

function companyDetail(item: FollowedCompany, t: ReturnType<typeof useTranslations>) {
  const parts = [
    item.aliases && item.aliases.length > 0 ? t('company_aliases_line', { names: item.aliases.join(', ') }) : null,
    item.roles && item.roles.length > 0 ? t('company_roles_line', { roles: item.roles.join(', ') }) : null,
    item.locations && item.locations.length > 0 ? t('company_places_line', { places: item.locations.join(', ') }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? <span className="block text-xs font-normal text-slate">{parts.join(' · ')}</span> : null;
}

function TargetList<T extends { id: string }>({
  items,
  empty,
  error,
  retry,
  render,
}: {
  items: T[] | 'error' | null;
  empty: string;
  error: string;
  retry: () => void;
  render: (item: T) => React.ReactNode;
}) {
  const t = useTranslations('career.alerts');
  if (items === null) return <p className="mt-2 text-sm text-slate">{t('loading')}</p>;
  if (items === 'error') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span>{error}</span>
        <Button type="button" onClick={retry}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (items.length === 0) return <p className="mt-2 text-sm text-slate">{empty}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-career-line p-3 text-sm">
          {render(item)}
        </li>
      ))}
    </ul>
  );
}
