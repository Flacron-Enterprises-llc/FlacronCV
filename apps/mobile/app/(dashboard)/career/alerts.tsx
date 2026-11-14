import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { Modal } from '../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import {
  useAlertActions,
  useAlertList,
  useAlertLocations,
  useFollowedCompanies,
  useSavedSearches,
} from '../../../src/hooks/career/alerts';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import {
  alertBalance,
  alertErrorMessage,
  channelNotConnected,
  DIGEST_OPTIONS,
  featureOff,
  fitText,
  fitTone,
  locationLabel,
  notAScore,
  parseRadius,
  parseSourceUrl,
  reasonText,
  SCHEDULE_OPTIONS,
  searchSummary,
  settingsDirty,
  settingsDraft,
  settingsPatch,
  type SettingsDraft,
} from '../../../src/lib/career/alerts';
import { formatDay } from '../../../src/lib/career-view';
import type { AlertItem, AlertLocation, AlertSettings, SavedSearch } from '../../../../../packages/career-api-client/src/types';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { colors } from '../../../src/theme/colors';

/**
 * Alert centre, mirroring the website's career/alerts page: alerts already
 * surfaced (with why and how well they overlap your confirmed facts), saved
 * searches (pause, schedule, delete), alert locations a search can use,
 * followed companies, and how alerts arrive. Email, push and Telegram delivery
 * are not connected in this environment, so alerts are listed here only.
 */
export default function CareerAlertsScreen() {
  const t = useT('careerAlerts');
  const tk = useT('career');
  const access = useCareerAccess();
  const features = access.data?.features;
  const searchesOn = !featureOff(features, 'savedSearches');
  const locationsOn = !featureOff(features, 'locationProfiles');
  const list = useAlertList();
  const searches = useSavedSearches(searchesOn);
  const locations = useAlertLocations(locationsOn);
  const companies = useFollowedCompanies();
  const { markAllRead } = useAlertActions();
  // Older servers omit read flags: then nothing is shown as unread.
  const unread = list.data?.unread ?? (list.data?.items ?? []).filter((item) => item.read === false).length;

  // Settings draft: synced from the server until the user edits it.
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const synced = useRef<AlertSettings | null>(null);
  const settings = list.data?.settings;
  useEffect(() => {
    if (!settings) return;
    const previous = synced.current;
    synced.current = settings;
    // Keep the user's unsaved edits; otherwise follow the server.
    setDraft((current) => (current === null || !previous || !settingsDirty(current, previous) ? settingsDraft(settings) : current));
  }, [settings]);
  const dirty = Boolean(draft && settings && settingsDirty(draft, settings));
  useLeaveGuard(dirty);

  const refreshing = list.isRefetching || searches.isRefetching || locations.isRefetching || companies.isRefetching;
  const refreshAll = () => {
    void list.refetch();
    if (searchesOn) void searches.refetch();
    if (locationsOn) void locations.refetch();
    void companies.refetch();
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} />;
  } else if (featureOff(features, 'alertItems')) {
    content = (
      <EmptyState
        icon="notifications-off-outline"
        title={t('screen.offTitle')}
        description={t('screen.offBody')}
      />
    );
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={alertErrorMessage(list.error ?? access.error, 'load')} onRetry={() => void list.refetch()} />;
  } else {
    const balance = alertBalance(list.data);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">
          {[t('screen.intro'), channelNotConnected()].join(' ')}
        </Text>

        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4 flex-row items-center">
          <Ionicons name="notifications-outline" size={20} color={colors.stone[500]} />
          <Text className="flex-1 ms-3 text-stone-700 text-sm">
            {balance.remaining === 0
              ? balance.renews
                ? t('balance.noneRenews', { date: balance.renews })
                : t('balance.none')
              : [t('balance.left', { count: balance.remaining }), balance.renews ? t('balance.renews', { date: balance.renews }) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <SectionTitle title={t('screen.yourAlerts')} />
        {unread > 0 ? (
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-stone-600 text-sm flex-1 me-2">{t('screen.unreadCount', { count: unread })}</Text>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              onPress={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
              disabled={markAllRead.isPending}
            >
              {t('screen.markAllRead')}
            </Button>
          </View>
        ) : null}
        {list.data.items.length === 0 ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <Text className="font-bold text-stone-900">{t('screen.emptyTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">
              {t('screen.emptyBody')}
            </Text>
          </View>
        ) : (
          list.data.items.map((item) => <AlertCard key={item.id} item={item} />)
        )}
        <Text className="text-stone-400 text-xs mb-6">{notAScore()}</Text>

        {searchesOn ? (
          <SavedSearchesSection
            searches={searches}
            locations={locationsOn ? locations.data : undefined}
          />
        ) : null}
        {locationsOn ? <LocationsSection locations={locations} /> : null}
        <CompaniesSection companies={companies} />
        {draft ? <SettingsSection draft={draft} setDraft={setDraft} dirty={dirty} /> : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={tk('areas.alerts.title')} />
      {content}
    </SafeAreaView>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-3">
      <Text className="text-lg font-black text-stone-900" accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text className="text-stone-500 text-sm mt-0.5 leading-5">{hint}</Text> : null}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">{children}</View>;
}

function Note({ text, tone = 'info' }: { text: string | null; tone?: 'info' | 'error' }) {
  if (!text) return null;
  return (
    <Text className={`${tone === 'error' ? 'text-red-600' : 'text-stone-600'} text-sm mt-2`} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

function Chip({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      className={`min-h-[44px] px-3 me-2 mb-2 rounded-full border items-center justify-center ${
        selected ? 'bg-brand-50 border-brand-500' : 'bg-white border-stone-200'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-sm ${selected ? 'text-brand-700 font-semibold' : 'text-stone-700'}`}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-11 w-11 items-center justify-center ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={20} color={colors.stone[500]} />
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View className="mb-2">
      <View className="flex-row items-center justify-between min-h-[44px]">
        <Text className="text-stone-800 text-base flex-1 me-3">{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand[600] }} accessibilityLabel={label} />
      </View>
      {hint ? <Text className="text-stone-400 text-xs">{hint}</Text> : null}
    </View>
  );
}

function AlertCard({ item }: { item: AlertItem }) {
  const router = useRouter();
  const t = useT('careerAlerts');
  const { markRead } = useAlertActions();
  const fit = fitText(item.reason.fit);
  const isUnread = item.read === false;
  return (
    <Pressable
      onPress={() => {
        if (isUnread) markRead.mutate(item.id);
        router.push(`/(dashboard)/career/opportunities/${item.opportunityId}` as Href);
      }}
      accessibilityRole="button"
      accessibilityLabel={t('screen.openA11y', { name: [item.title, item.organization].filter(Boolean).join(', ') })}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 active:bg-stone-50"
    >
      <View className="flex-row items-start">
        <View className="flex-1 me-2">
          <Text className="font-bold text-brand-700">{item.title}</Text>
          {item.organization ? <Text className="text-stone-500 text-sm mt-0.5">{item.organization}</Text> : null}
        </View>
        {isUnread ? (
          <View className="me-2">
            <Pill label={t('screen.unread')} tone="brand" />
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} style={RTL_FLIP} />
      </View>
      <Text className="text-stone-700 text-sm mt-2">{reasonText(item.reason.code)}</Text>
      {fit ? (
        <View className="mt-2">
          <Pill label={fit.toUpperCase()} tone={fitTone(item.reason.fit)} />
        </View>
      ) : null}
      <Text className="text-stone-400 text-xs mt-2">{formatDay(item.createdAt) ?? ''}</Text>
    </Pressable>
  );
}

function SavedSearchesSection({
  searches,
  locations,
}: {
  searches: ReturnType<typeof useSavedSearches>;
  locations: AlertLocation[] | undefined;
}) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const tc = useT('common');
  const [query, setQuery] = useState('');
  const [schedule, setSchedule] = useState<SavedSearch['schedule'] | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<SavedSearch | null>(null);

  // A location deleted elsewhere cannot stay selected.
  useEffect(() => {
    if (locationId && locations && !locations.some((l) => l.id === locationId)) setLocationId(null);
  }, [locations, locationId]);

  const save = () => {
    if (actions.createSearch.isPending) return;
    const q = query.trim();
    if (q.length === 0) {
      setNote({ text: t('errors.q'), tone: 'error' });
      return;
    }
    setNote(null);
    actions.createSearch.mutate(
      { q, ...(schedule ? { schedule } : {}), ...(locationId ? { locationProfileId: locationId } : {}) },
      {
        onSuccess: () => {
          setQuery('');
          setNote({ text: t('searches.saved'), tone: 'info' });
        },
        onError: (error) => setNote({ text: alertErrorMessage(error, 'search'), tone: 'error' }),
      },
    );
  };

  const update = (search: SavedSearch, patch: { paused?: boolean; schedule?: SavedSearch['schedule'] }) => {
    setBusyId(search.id);
    setNote(null);
    actions.updateSearch.mutate(
      { id: search.id, patch },
      {
        onError: (error) => setNote({ text: alertErrorMessage(error, 'search'), tone: 'error' }),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const remove = (search: SavedSearch, title: string) => {
    Alert.alert(t('searches.deleteTitle'), t('searches.deleteBody', { title }), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          setBusyId(search.id);
          setNote(null);
          actions.deleteSearch.mutate(search.id, {
            onError: (error) => setNote({ text: alertErrorMessage(error, 'search'), tone: 'error' }),
            onSettled: () => setBusyId(null),
          });
        },
      },
    ]);
  };

  return (
    <View className="mb-6">
      <SectionTitle title={t('searches.title')} hint={t('searches.hint')} />
      <Card>
        <Input label={t('searches.label')} value={query} onChangeText={setQuery} placeholder={t('searches.placeholder')} maxLength={200} returnKeyType="done" onSubmitEditing={save} />
        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('searches.howOften')}</Text>
        <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
          <Chip label={t('searches.planDefault')} selected={schedule === null} onPress={() => setSchedule(null)} />
          {SCHEDULE_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={schedule === o.value} onPress={() => setSchedule(o.value)} />
          ))}
        </View>
        {locations && locations.length > 0 ? (
          <>
            <Text className="text-sm font-medium text-stone-700 mb-1.5 mt-1">{t('searches.location')}</Text>
            <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
              <Chip label={t('searches.anywhere')} selected={locationId === null} onPress={() => setLocationId(null)} />
              {locations.map((l) => (
                <Chip key={l.id} label={locationLabel(l)} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
              ))}
            </View>
          </>
        ) : null}
        <Button onPress={save} loading={actions.createSearch.isPending} className="mt-2">
          {t('searches.save')}
        </Button>
        <Note text={note?.text ?? null} tone={note?.tone} />
      </Card>

      {searches.isLoading ? (
        <SkeletonCard />
      ) : searches.error ? (
        <Card>
          <Text className="text-stone-700 text-sm">{t('searches.loadFailed')}</Text>
          <Button variant="outline" size="sm" className="mt-3 self-start" onPress={() => void searches.refetch()}>
            {tc('retry')}
          </Button>
        </Card>
      ) : (searches.data ?? []).length === 0 ? (
        <Text className="text-stone-500 text-sm mb-3">{t('searches.empty')}</Text>
      ) : (
        (searches.data ?? []).map((search) => {
          const summary = searchSummary(search, locations);
          const busy = busyId === search.id;
          return (
            <Card key={search.id}>
              <View className="flex-row items-start">
                <View className="flex-1 me-2">
                  <Text className="font-bold text-stone-900">{summary.title}</Text>
                  <Text className="text-stone-500 text-xs mt-1">{summary.detail}</Text>
                </View>
                {search.paused ? <Pill label={t('searches.paused')} /> : null}
              </View>
              <View className="flex-row items-center mt-3">
                <Button variant="outline" size="sm" disabled={busy} onPress={() => update(search, { paused: !search.paused })}>
                  {search.paused ? t('searches.resume') : t('searches.pause')}
                </Button>
                <Button variant="ghost" size="sm" className="ms-2" disabled={busy} onPress={() => setScheduleFor(search)}>
                  {t('searches.schedule')}
                </Button>
                <View className="flex-1" />
                <IconButton icon="trash-outline" label={t('searches.deleteA11y', { query: summary.title })} disabled={busy} onPress={() => remove(search, summary.title)} />
              </View>
            </Card>
          );
        })
      )}

      <Modal visible={scheduleFor !== null} onClose={() => setScheduleFor(null)} title={t('searches.howOften')} size="sm">
        <View className="flex-row flex-wrap">
          {SCHEDULE_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={scheduleFor?.schedule === o.value}
              onPress={() => {
                const target = scheduleFor;
                setScheduleFor(null);
                if (target && target.schedule !== o.value) update(target, { schedule: o.value });
              }}
            />
          ))}
        </View>
        <Text className="text-stone-400 text-xs mt-1">{t('searches.scheduleNote')}</Text>
      </Modal>
    </View>
  );
}

function LocationsSection({ locations }: { locations: ReturnType<typeof useAlertLocations> }) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const tc = useT('common');
  const [place, setPlace] = useState('');
  const [radius, setRadius] = useState('25');
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [editing, setEditing] = useState<AlertLocation | null>(null);
  const [editPlace, setEditPlace] = useState('');
  const [editRadius, setEditRadius] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = () => {
    if (actions.createLocation.isPending) return;
    const name = place.trim();
    if (name.length === 0) {
      setNote({ text: t('errors.place'), tone: 'error' });
      return;
    }
    const miles = parseRadius(radius);
    if (!miles.ok) {
      setNote({ text: miles.message, tone: 'error' });
      return;
    }
    setNote(null);
    actions.createLocation.mutate(
      { place: name, radiusMiles: miles.miles },
      {
        onSuccess: () => {
          setPlace('');
          setNote({ text: t('locations.saved'), tone: 'info' });
        },
        onError: (error) => setNote({ text: alertErrorMessage(error, 'location'), tone: 'error' }),
      },
    );
  };

  const openEdit = (location: AlertLocation) => {
    setEditing(location);
    setEditPlace(location.place);
    setEditRadius(String(location.radiusMiles));
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editing || actions.updateLocation.isPending) return;
    const name = editPlace.trim();
    if (name.length === 0) {
      setEditError(t('errors.place'));
      return;
    }
    const miles = parseRadius(editRadius);
    if (!miles.ok) {
      setEditError(miles.message);
      return;
    }
    setEditError(null);
    actions.updateLocation.mutate(
      { id: editing.id, place: name, radiusMiles: miles.miles },
      { onSuccess: () => setEditing(null), onError: (error) => setEditError(alertErrorMessage(error, 'location')) },
    );
  };

  const remove = (location: AlertLocation) => {
    Alert.alert(t('locations.deleteTitle'), t('locations.deleteBody', { place: location.place }), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          setBusyId(location.id);
          setNote(null);
          actions.deleteLocation.mutate(location.id, {
            onError: (error) => setNote({ text: alertErrorMessage(error, 'location'), tone: 'error' }),
            onSettled: () => setBusyId(null),
          });
        },
      },
    ]);
  };

  return (
    <View className="mb-6">
      <SectionTitle title={t('locations.title')} hint={t('locations.hint')} />
      <Card>
        <Input label={t('locations.place')} value={place} onChangeText={setPlace} placeholder={t('locations.placePlaceholder')} maxLength={200} />
        <Input label={t('locations.radius')} value={radius} onChangeText={setRadius} keyboardType="number-pad" maxLength={5} />
        <Button onPress={add} loading={actions.createLocation.isPending}>
          {t('locations.add')}
        </Button>
        <Note text={note?.text ?? null} tone={note?.tone} />
      </Card>
      {locations.isLoading ? (
        <SkeletonCard />
      ) : locations.error ? (
        <Card>
          <Text className="text-stone-700 text-sm">{t('locations.loadFailed')}</Text>
          <Button variant="outline" size="sm" className="mt-3 self-start" onPress={() => void locations.refetch()}>
            {tc('retry')}
          </Button>
        </Card>
      ) : (locations.data ?? []).length === 0 ? (
        <Text className="text-stone-500 text-sm mb-3">{t('locations.empty')}</Text>
      ) : (
        (locations.data ?? []).map((location) => (
          <Card key={location.id}>
            <View className="flex-row items-center">
              <Ionicons name="location-outline" size={18} color={colors.stone[500]} />
              <Text className="flex-1 ms-2 text-stone-900 font-semibold">{locationLabel(location)}</Text>
              <IconButton icon="create-outline" label={t('locations.editA11y', { place: location.place })} disabled={busyId === location.id} onPress={() => openEdit(location)} />
              <IconButton icon="trash-outline" label={t('locations.deleteA11y', { place: location.place })} disabled={busyId === location.id} onPress={() => remove(location)} />
            </View>
          </Card>
        ))
      )}

      <Modal visible={editing !== null} onClose={() => setEditing(null)} title={t('locations.editTitle')} closeDisabled={actions.updateLocation.isPending}>
        <Input label={t('locations.place')} value={editPlace} onChangeText={setEditPlace} maxLength={200} />
        <Input label={t('locations.radius')} value={editRadius} onChangeText={setEditRadius} keyboardType="number-pad" maxLength={5} />
        <Button onPress={saveEdit} loading={actions.updateLocation.isPending}>
          {t('locations.save')}
        </Button>
        <Note text={editError} tone="error" />
      </Modal>
    </View>
  );
}

function CompaniesSection({ companies }: { companies: ReturnType<typeof useFollowedCompanies> }) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const tc = useT('common');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const follow = () => {
    if (actions.follow.isPending) return;
    const company = name.trim();
    if (company.length === 0) {
      setNote({ text: t('errors.name'), tone: 'error' });
      return;
    }
    const source = parseSourceUrl(url);
    if (!source.ok) {
      setNote({ text: source.message, tone: 'error' });
      return;
    }
    setNote(null);
    actions.follow.mutate(
      { name: company, ...(source.url ? { sourceUrl: source.url } : {}) },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
          setNote({ text: t('companies.followed'), tone: 'info' });
        },
        onError: (error) => setNote({ text: alertErrorMessage(error, 'company'), tone: 'error' }),
      },
    );
  };

  const unfollow = (id: string, company: string) => {
    Alert.alert(t('companies.unfollowTitle'), t('companies.unfollowBody', { name: company }), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: t('companies.unfollow'),
        style: 'destructive',
        onPress: () => {
          setBusyId(id);
          setNote(null);
          actions.unfollow.mutate(id, {
            onError: (error) => setNote({ text: alertErrorMessage(error, 'company'), tone: 'error' }),
            onSettled: () => setBusyId(null),
          });
        },
      },
    ]);
  };

  return (
    <View className="mb-6">
      <SectionTitle title={t('companies.title')} hint={t('companies.hint')} />
      <Card>
        <Input label={t('companies.name')} value={name} onChangeText={setName} maxLength={200} />
        <Input
          label={t('companies.url')}
          value={url}
          onChangeText={setUrl}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={2000}
        />
        <Button onPress={follow} loading={actions.follow.isPending}>
          {t('companies.follow')}
        </Button>
        <Note text={note?.text ?? null} tone={note?.tone} />
      </Card>
      {companies.isLoading ? (
        <SkeletonCard />
      ) : companies.error ? (
        <Card>
          <Text className="text-stone-700 text-sm">{t('companies.loadFailed')}</Text>
          <Button variant="outline" size="sm" className="mt-3 self-start" onPress={() => void companies.refetch()}>
            {tc('retry')}
          </Button>
        </Card>
      ) : (companies.data ?? []).length === 0 ? (
        <Text className="text-stone-500 text-sm mb-3">{t('companies.empty')}</Text>
      ) : (
        (companies.data ?? []).map((company) => (
          <Card key={company.id}>
            <View className="flex-row items-center">
              <Ionicons name="business-outline" size={18} color={colors.stone[500]} />
              <View className="flex-1 ms-2">
                <Text className="text-stone-900 font-semibold">{company.name}</Text>
                {company.sourceUrl ? (
                  <Text className="text-stone-400 text-xs mt-0.5" numberOfLines={1}>
                    {company.sourceUrl}
                  </Text>
                ) : null}
              </View>
              <IconButton icon="close-circle-outline" label={t('companies.unfollowA11y', { name: company.name })} disabled={busyId === company.id} onPress={() => unfollow(company.id, company.name)} />
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

function SettingsSection({
  draft,
  setDraft,
  dirty,
}: {
  draft: SettingsDraft;
  setDraft: React.Dispatch<React.SetStateAction<SettingsDraft | null>>;
  dirty: boolean;
}) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setNote(null);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = () => {
    if (actions.saveSettings.isPending) return;
    const result = settingsPatch(draft);
    if (!result.ok) {
      setNote({ text: result.message, tone: 'error' });
      return;
    }
    setNote(null);
    actions.saveSettings.mutate(result.patch, {
      onSuccess: (saved) => {
        setDraft(settingsDraft(saved));
        setNote({ text: t('settings.saved'), tone: 'info' });
      },
      onError: (error) => setNote({ text: alertErrorMessage(error, 'settings'), tone: 'error' }),
    });
  };

  return (
    <View className="mb-6">
      <SectionTitle title={t('settings.title')} />
      <Card>
        <ToggleRow label={t('settings.email')} value={draft.email} onChange={(v) => set('email', v)} hint={channelNotConnected()} />
        <ToggleRow label={t('settings.push')} value={draft.push} onChange={(v) => set('push', v)} hint={channelNotConnected()} />
        <ToggleRow label={t('settings.telegram')} value={draft.telegram} onChange={(v) => set('telegram', v)} hint={channelNotConnected()} />
        <Text className="text-sm font-medium text-stone-700 mb-1.5 mt-2">{t('settings.digest')}</Text>
        <View className="flex-row flex-wrap mb-2" accessibilityRole="radiogroup">
          {DIGEST_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={draft.digest === o.value} onPress={() => set('digest', o.value)} />
          ))}
        </View>
        <View className="flex-row">
          <View className="flex-1 me-2">
            <Input
              label={t('settings.quietStart')}
              value={draft.quietStart}
              onChangeText={(v) => set('quietStart', v)}
              placeholder="22:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
          <View className="flex-1 ms-2">
            <Input
              label={t('settings.quietEnd')}
              value={draft.quietEnd}
              onChangeText={(v) => set('quietEnd', v)}
              placeholder="07:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>
        <Text className="text-stone-400 text-xs -mt-2 mb-2">{t('settings.quietHint')}</Text>
        <ToggleRow label={t('settings.paused')} value={draft.paused} onChange={(v) => set('paused', v)} />
        <Button onPress={save} loading={actions.saveSettings.isPending} disabled={!dirty} className="mt-2">
          {t('settings.save')}
        </Button>
        <Note text={note?.text ?? null} tone={note?.tone} />
      </Card>
    </View>
  );
}
