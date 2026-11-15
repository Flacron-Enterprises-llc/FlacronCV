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
  locationLabel,
  notAScore,
  parseRadius,
  parseSourceUrl,
  SCHEDULE_OPTIONS,
  searchSummary,
  settingsDirty,
  settingsDraft,
  settingsPatch,
  type SettingsDraft,
} from '../../../src/lib/career/alerts';
import { formatDay } from '../../../src/lib/career-view';
import {
  advancedLines,
  alertBasicLine,
  alertFitLabel,
  alertGapsLine,
  alertWhy,
  channelConnected,
  companyDetail,
  companyDraftOf,
  companyInput,
  deliveryLines,
  EMPTY_COMPANY,
  EMPTY_SEARCH,
  RELEVANCE_THRESHOLDS,
  relevanceLabel,
  SEARCH_CATEGORIES,
  savedSearchInput,
  searchCategoryLabel,
  searchName,
  tierRefusal,
  tierView,
  WORK_SCHEDULES,
  type CompanyDraft,
  type SearchDraft,
  type TierView,
} from '../../../src/lib/career/alert-centre';
import { OptionChips } from '../../../src/components/career/OptionChips';
import type { AlertItem, AlertList, AlertLocation, AlertSettings, FollowedCompany, SavedSearch } from '../../../../../packages/career-api-client/src/types';
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
  const router = useRouter();
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
    const tier = tierView(list.data);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-2 leading-5">{t('screen.intro')}</Text>
        <Text className="text-stone-500 text-sm mb-4 leading-5">{tier.text}</Text>
        <Pressable
          onPress={() => router.push('/(dashboard)/career/reminders' as Href)}
          className="bg-white border border-stone-100 rounded-2xl p-4 mb-4 flex-row items-center min-h-[56px]"
          accessibilityRole="link"
        >
          <Ionicons name="alarm-outline" size={20} color={colors.stone[500]} />
          <View className="flex-1 ms-3">
            <Text className="text-stone-900 font-semibold">{t('centre.reminders_title')}</Text>
            <Text className="text-stone-500 text-xs mt-0.5 leading-4">{t('centre.reminders_body')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.stone[400]} style={RTL_FLIP} />
        </Pressable>

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
            tier={tier}
          />
        ) : null}
        {locationsOn ? <LocationsSection locations={locations} /> : null}
        <CompaniesSection companies={companies} />
        {draft ? <SettingsSection draft={draft} setDraft={setDraft} dirty={dirty} list={list.data} /> : null}
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

/**
 * One alert (website AlertCard): why it was raised (the saved search or the
 * followed company by name), the source details, the fit label the plan's
 * tier allows, honest delivery states, and the next steps.
 */
function AlertCard({ item }: { item: AlertItem }) {
  const router = useRouter();
  const t = useT('careerAlerts');
  const { markRead } = useAlertActions();
  const isUnread = item.read === false;
  const fit = alertFitLabel(item);
  const basic = alertBasicLine(item);
  const gaps = alertGapsLine(item);
  const advanced = advancedLines(item);
  const delivery = deliveryLines(item);
  const listing = `/(dashboard)/career/opportunities/${item.opportunityId}`;
  const pack = `/(dashboard)/career/action-pack?opportunityId=${encodeURIComponent(item.opportunityId)}`;
  const open = (route: string) => {
    if (isUnread) markRead.mutate(item.id);
    router.push(route as Href);
  };
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
      <View className="flex-row items-start">
        <Pressable onPress={() => open(listing)} className="flex-1 me-2 min-h-[44px]" accessibilityRole="link" accessibilityLabel={t('screen.openA11y', { name: [item.title, item.organization].filter(Boolean).join(', ') })}>
          <Text className="font-bold text-brand-700">{item.title}</Text>
          {item.organization ? <Text className="text-stone-500 text-sm mt-0.5">{item.organization}</Text> : null}
        </Pressable>
        {isUnread ? <Pill label={t('screen.unread')} tone="brand" /> : null}
      </View>
      <Text className="text-stone-700 text-sm mt-2">{alertWhy(item)}</Text>
      {item.reason.code === 'material_update' ? <Text className="text-stone-700 text-sm mt-1">{t('centre.reason_material_update')}</Text> : null}
      {basic ? <Text className="text-stone-500 text-xs mt-1 leading-4">{basic}</Text> : null}
      {fit ? <Text className="text-stone-900 text-sm font-semibold mt-2">{fit}</Text> : null}
      {gaps ? <Text className="text-stone-700 text-sm mt-1">{gaps}</Text> : null}
      {advanced ? (
        <View className="mt-2">
          {advanced.role ? <Text className="text-stone-700 text-sm">{advanced.role}</Text> : null}
          {advanced.goal ? <Text className="text-stone-700 text-sm">{advanced.goal}</Text> : null}
          {advanced.learningPlan ? (
            <TouchableLink label={t('centre.advanced_learning_plan')} onPress={() => open('/(dashboard)/career/learning')} />
          ) : null}
        </View>
      ) : null}
      {delivery.sent ? <Text className="text-stone-400 text-xs mt-2">{delivery.sent}</Text> : null}
      {delivery.waiting ? <Text className="text-stone-400 text-xs mt-1 leading-4">{delivery.waiting}</Text> : null}
      <Text className="text-stone-400 text-xs mt-2">{formatDay(item.createdAt) ?? ''}</Text>
      <View className="flex-row flex-wrap mt-1">
        <TouchableLink label={t('centre.open_compare')} onPress={() => open(listing)} />
        <TouchableLink label={advanced ? advanced.packLabel : t('centre.prepare_application')} onPress={() => open(pack)} />
        {isUnread ? (
          <TouchableLink label={t('centre.mark_read')} onPress={() => markRead.mutate(item.id)} a11y={`${t('centre.mark_read')}: ${item.title}`} />
        ) : null}
      </View>
    </View>
  );
}

function TouchableLink({ label, onPress, a11y }: { label: string; onPress: () => void; a11y?: string }) {
  return (
    <Pressable onPress={onPress} className="min-h-[44px] justify-center me-4" accessibilityRole="link" accessibilityLabel={a11y ?? label}>
      <Text className="text-brand-600 font-semibold text-sm">{label}</Text>
    </Pressable>
  );
}

function SavedSearchesSection({
  searches,
  locations,
  tier,
}: {
  searches: ReturnType<typeof useSavedSearches>;
  locations: AlertLocation[] | undefined;
  tier: TierView;
}) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const tc = useT('common');
  const [form, setForm] = useState<SearchDraft>(EMPTY_SEARCH);
  const query = form.q;
  const schedule = form.schedule;
  const locationId = form.locationProfileId || null;
  const setQuery = (q: string) => setForm((current) => ({ ...current, q }));
  const setSchedule = (next: SavedSearch['schedule'] | null) => setForm((current) => ({ ...current, schedule: next }));
  const setLocationId = (id: string | null) => setForm((current) => ({ ...current, locationProfileId: id ?? '' }));
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<SavedSearch | null>(null);

  // A location deleted elsewhere cannot stay selected.
  useEffect(() => {
    if (locationId && locations && !locations.some((l) => l.id === locationId)) setLocationId(null);
  }, [locations, locationId]);

  const save = () => {
    if (actions.createSearch.isPending) return;
    const built = savedSearchInput(form, tier);
    if (!built.ok) {
      setNote({ text: built.message, tone: 'error' });
      return;
    }
    setNote(null);
    actions.createSearch.mutate(built.input, {
      onSuccess: () => {
        setForm(EMPTY_SEARCH);
        setNote({ text: t('searches.saved'), tone: 'info' });
      },
      onError: (error) => setNote({ text: tierRefusal(error) ?? alertErrorMessage(error, 'search'), tone: 'error' }),
    });
  };

  const update = (search: SavedSearch, patch: { paused?: boolean; schedule?: SavedSearch['schedule']; relevance?: 'any' | 'possible_fit' | 'strong_fit' }) => {
    setBusyId(search.id);
    setNote(null);
    actions.updateSearch.mutate(
      { id: search.id, patch },
      {
        onError: (error) => setNote({ text: tierRefusal(error) ?? alertErrorMessage(error, 'search'), tone: 'error' }),
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
        <OptionChips
          label={t('centre.search_category')}
          value={form.category}
          onChange={(category) => setForm((current) => ({ ...current, category }))}
          options={[{ value: '', label: t('centre.search_category_any') }, ...SEARCH_CATEGORIES.map((value) => ({ value, label: searchCategoryLabel(value) }))]}
        />
        {tier.personalized ? (
          <>
            <OptionChips
              label={t('centre.search_work_schedule')}
              value={form.workSchedule}
              onChange={(workSchedule) => setForm((current) => ({ ...current, workSchedule }))}
              options={[{ value: '', label: t('centre.search_category_any') }, ...WORK_SCHEDULES.map((value) => ({ value, label: searchCategoryLabel(value) }))]}
            />
            <Input
              label={t('centre.search_min_pay')}
              hint={t('centre.search_min_pay_hint')}
              value={form.minPay}
              onChangeText={(minPay) => setForm((current) => ({ ...current, minPay: minPay.replace(/\D/g, '') }))}
              keyboardType="number-pad"
              maxLength={9}
            />
          </>
        ) : (
          <Text className="text-stone-500 text-xs mb-3 leading-4">{t('centre.search_personalized_locked')}</Text>
        )}
        {tier.enhanced ? (
          <OptionChips
            label={t('centre.search_relevance')}
            hint={t('centre.search_relevance_hint')}
            value={form.relevance}
            onChange={(relevance) => setForm((current) => ({ ...current, relevance }))}
            options={RELEVANCE_THRESHOLDS.map((value) => ({ value, label: relevanceLabel(value) }))}
          />
        ) : (
          <Text className="text-stone-500 text-xs mb-3 leading-4">{t('centre.search_relevance_locked')}</Text>
        )}
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
          const summary = { ...searchSummary(search, locations), title: searchName(search) };
          const busy = busyId === search.id;
          return (
            <Card key={search.id}>
              <View className="flex-row items-start">
                <View className="flex-1 me-2">
                  <Text className="font-bold text-stone-900">{summary.title}</Text>
                  {search.q && search.category ? <Text className="text-stone-500 text-xs mt-1">{searchCategoryLabel(search.category)}</Text> : null}
                  <Text className="text-stone-500 text-xs mt-1">{summary.detail}</Text>
                  {search.locationMode === 'name' ? <Text className="text-stone-500 text-xs mt-1">{t('centre.location_by_name')}</Text> : null}
                  {(search.inactiveFilters ?? []).length > 0 ? <Text className="text-warning text-xs mt-1">{t('centre.searches_inactive_filters')}</Text> : null}
                </View>
                {search.paused ? <Pill label={t('searches.paused')} /> : null}
              </View>
              {tier.enhanced ? (
                <View className="mt-3">
                  <OptionChips
                    label={t('centre.search_relevance_for', { query: summary.title })}
                    value={search.filters?.relevance ?? 'any'}
                    disabled={busy}
                    onChange={(relevance) => update(search, { relevance: relevance as 'any' | 'possible_fit' | 'strong_fit' })}
                    options={RELEVANCE_THRESHOLDS.map((value) => ({ value, label: relevanceLabel(value) }))}
                  />
                </View>
              ) : null}
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

/**
 * Company watch (website AlertTargets): follow a company with other names it
 * posts under, the roles and the places to watch; edit or unfollow it later.
 */
function CompaniesSection({ companies }: { companies: ReturnType<typeof useFollowedCompanies> }) {
  const actions = useAlertActions();
  const t = useT('careerAlerts');
  const tc = useT('common');
  const [form, setForm] = useState<CompanyDraft>(EMPTY_COMPANY);
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FollowedCompany | null>(null);
  const [editForm, setEditForm] = useState<CompanyDraft>(EMPTY_COMPANY);
  const [editError, setEditError] = useState<string | null>(null);

  const follow = () => {
    if (actions.follow.isPending) return;
    const input = companyInput(form);
    if (!input) {
      setNote({ text: t('errors.name'), tone: 'error' });
      return;
    }
    const source = parseSourceUrl(form.sourceUrl);
    if (!source.ok) {
      setNote({ text: source.message, tone: 'error' });
      return;
    }
    setNote(null);
    actions.follow.mutate(
      {
        name: input.name,
        ...(source.url ? { sourceUrl: source.url } : {}),
        ...(input.aliases.length > 0 ? { aliases: input.aliases } : {}),
        ...(input.roles.length > 0 ? { roles: input.roles } : {}),
        ...(input.locations.length > 0 ? { locations: input.locations } : {}),
      },
      {
        onSuccess: () => {
          setForm(EMPTY_COMPANY);
          setNote({ text: t('companies.followed'), tone: 'info' });
        },
        onError: (error) => setNote({ text: alertErrorMessage(error, 'company'), tone: 'error' }),
      },
    );
  };

  const openEdit = (company: FollowedCompany) => {
    setEditing(company);
    setEditForm(companyDraftOf(company));
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editing || actions.updateCompany.isPending) return;
    const input = companyInput(editForm);
    if (!input) {
      setEditError(t('errors.name'));
      return;
    }
    setEditError(null);
    // Lists are sent whole, so clearing a list removes it.
    actions.updateCompany.mutate(
      { id: editing.id, patch: input },
      { onSuccess: () => setEditing(null), onError: (error) => setEditError(alertErrorMessage(error, 'company')) },
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
        <CompanyFields value={form} onChange={setForm} withUrl />
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
        (companies.data ?? []).map((company) => {
          const detail = companyDetail(company);
          return (
            <Card key={company.id}>
              <View className="flex-row items-center">
                <Ionicons name="business-outline" size={18} color={colors.stone[500]} />
                <View className="flex-1 ms-2">
                  <Text className="text-stone-900 font-semibold">{company.name}</Text>
                  {detail ? <Text className="text-stone-500 text-xs mt-0.5 leading-4">{detail}</Text> : null}
                  {company.sourceUrl ? (
                    <Text className="text-stone-400 text-xs mt-0.5" numberOfLines={1}>
                      {company.sourceUrl}
                    </Text>
                  ) : null}
                </View>
                <IconButton icon="create-outline" label={t('centre.company_edit_label', { name: company.name })} disabled={busyId === company.id} onPress={() => openEdit(company)} />
                <IconButton icon="close-circle-outline" label={t('companies.unfollowA11y', { name: company.name })} disabled={busyId === company.id} onPress={() => unfollow(company.id, company.name)} />
              </View>
            </Card>
          );
        })
      )}

      <Modal visible={editing !== null} onClose={() => setEditing(null)} title={t('centre.company_edit_title')} size="lg" closeDisabled={actions.updateCompany.isPending}>
        <CompanyFields value={editForm} onChange={setEditForm} />
        <Button onPress={saveEdit} loading={actions.updateCompany.isPending}>
          {t('locations.save')}
        </Button>
        <Note text={editError} tone="error" />
      </Modal>
    </View>
  );
}

function CompanyFields({ value, onChange, withUrl = false }: { value: CompanyDraft; onChange: (next: CompanyDraft) => void; withUrl?: boolean }) {
  const t = useT('careerAlerts');
  const set = (key: keyof CompanyDraft) => (text: string) => onChange({ ...value, [key]: text });
  return (
    <>
      <Input label={t('companies.name')} value={value.name} onChangeText={set('name')} maxLength={200} />
      {withUrl ? (
        <Input
          label={t('companies.url')}
          value={value.sourceUrl}
          onChangeText={set('sourceUrl')}
          placeholder="https://"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          maxLength={2000}
        />
      ) : null}
      <Input label={t('centre.company_aliases')} hint={t('centre.company_list_hint')} value={value.aliases} onChangeText={set('aliases')} maxLength={1000} />
      <Input label={t('centre.company_roles')} hint={t('centre.company_list_hint')} value={value.roles} onChangeText={set('roles')} maxLength={1000} />
      <Input label={t('centre.company_places')} hint={t('centre.company_list_hint')} value={value.places} onChangeText={set('places')} maxLength={1000} />
    </>
  );
}

function SettingsSection({
  draft,
  setDraft,
  dirty,
  list,
}: {
  draft: SettingsDraft;
  setDraft: React.Dispatch<React.SetStateAction<SettingsDraft | null>>;
  dirty: boolean;
  list: AlertList;
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
        <ToggleRow label={t('settings.email')} value={draft.email} onChange={(v) => set('email', v)} hint={channelConnected(list, 'email') ? undefined : channelNotConnected()} />
        <ToggleRow label={t('settings.push')} value={draft.push} onChange={(v) => set('push', v)} hint={channelConnected(list, 'push') ? undefined : channelNotConnected()} />
        <ToggleRow label={t('settings.telegram')} value={draft.telegram} onChange={(v) => set('telegram', v)} hint={channelConnected(list, 'telegram') ? undefined : channelNotConnected()} />
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
