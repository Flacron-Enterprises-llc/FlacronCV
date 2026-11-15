import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OpportunityItem } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { ListingFacts } from '../../../../src/components/career/ListingFacts';
import { OptionChips, ToggleField } from '../../../../src/components/career/OptionChips';
import { DateInput } from '../../../../src/components/jobs/DateInput';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useCareerFeature,
  useOpportunitySearch,
  usePasteOpportunity,
  useToggleSaveOpportunity,
} from '../../../../src/hooks/career/opportunities';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { useT } from '../../../../src/i18n';
import {
  activeFilterCount,
  categoryLabel,
  checkPasteDraft,
  detailLabel,
  EMPTY_FILTERS,
  EMPTY_PASTE,
  FILTER_CATEGORIES,
  isFiltered,
  LISTING_SCHEDULES,
  LISTING_SENIORITIES,
  MIN_LISTING_TEXT,
  notAppliedText,
  OPPORTUNITY_CATEGORIES,
  PASTE_MAX,
  pasteDetailFields,
  pasteErrorText,
  POSTED_WITHIN,
  providerLabel,
  PROVIDERS,
  radiusLimitOf,
  scheduleLabel,
  searchQuery,
  seniorityLabel,
  type OpportunityFilters,
  type PasteDraft,
} from '../../../../src/lib/career/opportunity-search';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Job search over the career service (website: career/opportunities): search
 * with the full filter set, see which filters could not be applied and why,
 * save listings, and paste a vacancy with its category, deadline and
 * category-specific details. Missing pay, sponsorship and deadline stay
 * "not stated". No licensed job feed is promised.
 */
export default function CareerOpportunitiesScreen() {
  const router = useRouter();
  const t = useT('careerOpportunities');
  const tk = useT('career');
  const access = useCareerAccess();
  const mapFeature = useCareerFeature('mapSessions');
  const [draft, setDraft] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const query = useMemo(() => searchQuery(applied), [applied]);
  const list = useOpportunitySearch(query);
  const save = useToggleSaveOpportunity();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const filtered = isFiltered(applied);
  const filterCount = activeFilterCount(applied);
  const radiusLimit = radiusLimitOf(list.error);

  const run = (next: OpportunityFilters) => {
    setApplied(next);
    setFiltersOpen(false);
  };

  const toggleSave = (item: OpportunityItem) => {
    if (save.isPending) return;
    save.mutate(item, { onError: (error) => Alert.alert(t('unavailable_title'), careerErrorMessage(error, t('unavailable_body'))) });
  };

  const mapButton = mapFeature.on ? (
    <TouchableOpacity
      onPress={() => router.push('/(dashboard)/career/opportunities/map' as Href)}
      className="h-11 w-11 items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel={tk('areas.map.title')}
    >
      <Ionicons name="map-outline" size={22} color={colors.stone[700]} />
    </TouchableOpacity>
  ) : undefined;

  const header = (
    <View className="mb-2">
      <Input
        label={t('query_label')}
        value={draft.q}
        onChangeText={(q) => setDraft((current) => ({ ...current, q }))}
        returnKeyType="search"
        onSubmitEditing={() => run(draft)}
        maxLength={200}
      />
      <View className="flex-row gap-2 mb-3">
        <View className="flex-1">
          <Button fullWidth onPress={() => run(draft)} loading={list.isFetching && !list.isLoading}>
            {t('search')}
          </Button>
        </View>
        <Button
          variant="outline"
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel={[t('filters_title'), filterCount > 0 ? t('filters_active', { count: filterCount }) : null].filter(Boolean).join(', ')}
          icon={<Ionicons name="options-outline" size={18} color={colors.stone[700]} />}
        >
          {filterCount > 0 ? `${t('filters_title')} (${filterCount})` : t('filters_title')}
        </Button>
      </View>
      <Button
        variant="ghost"
        onPress={() => setPasteOpen(true)}
        icon={<Ionicons name="clipboard-outline" size={18} color={colors.brand[600]} />}
      >
        {t('paste_heading')}
      </Button>
      {filtered ? (
        <TouchableOpacity
          onPress={() => {
            setDraft(EMPTY_FILTERS);
            setApplied(EMPTY_FILTERS);
          }}
          className="min-h-[44px] justify-center"
          accessibilityRole="button"
        >
          <Text className="text-brand-600 text-sm font-semibold">{t('filters_clear')}</Text>
        </TouchableOpacity>
      ) : null}
      {radiusLimit !== null ? <Note text={t('radius', { limit: radiusLimit })} /> : null}
      {(list.data?.notApplied ?? []).map((entry) => (
        <Note key={`${entry.filter}-${entry.reason}`} text={notAppliedText(entry)} />
      ))}
    </View>
  );

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || (list.error && !list.data && radiusLimit === null)) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, t('unavailable_body'))}
        onRetry={() => {
          void access.refetch();
          void list.refetch();
        }}
      />
    );
  } else {
    content = (
      <FlatList
        data={radiusLimit !== null ? [] : (list.data?.items ?? [])}
        keyExtractor={(o) => o.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          filtered ? (
            <EmptyState icon="search-outline" title={t('no_results_title')} description={t('no_results_filters_body')} />
          ) : (
            <EmptyState icon="briefcase-outline" title={t('empty_title')} description={t('empty_body')} />
          )
        }
        renderItem={({ item }) => (
          <ListingCard
            item={item}
            onOpen={() => router.push(`/(dashboard)/career/opportunities/${item.id}` as Href)}
            onToggleSave={() => toggleSave(item)}
            saving={save.isPending && save.variables?.id === item.id}
          />
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} right={mapButton} />
      {content}
      <FiltersModal
        visible={filtersOpen}
        value={draft}
        onChange={setDraft}
        onClose={() => setFiltersOpen(false)}
        onApply={() => run(draft)}
        onClear={() => setDraft({ ...EMPTY_FILTERS, q: draft.q })}
      />
      <PasteModal visible={pasteOpen} onClose={() => setPasteOpen(false)} onCreated={(id) => router.push(`/(dashboard)/career/opportunities/${id}` as Href)} />
    </SafeAreaView>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View className="bg-warning-bg rounded-xl p-3 mb-3 flex-row" accessibilityLiveRegion="polite">
      <Ionicons name="information-circle-outline" size={18} color={colors.warning.DEFAULT} />
      <Text className="text-warning text-sm ms-2 flex-1 leading-5">{text}</Text>
    </View>
  );
}

function ListingCard({ item, onOpen, onToggleSave, saving }: { item: OpportunityItem; onOpen: () => void; onToggleSave: () => void; saving: boolean }) {
  const t = useT('careerOpportunities');
  const saved = item.saved === true;
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
      <View className="flex-row items-start">
        <Pressable onPress={onOpen} className="flex-1 me-2 min-h-[44px]" accessibilityRole="link" accessibilityLabel={item.title}>
          <Text className="font-bold text-stone-900 text-base">{item.title}</Text>
          {item.label === 'expired' ? <Text className="text-warning text-xs mt-1">{t('expired')}</Text> : null}
          {item.stale ? <Text className="text-stone-500 text-xs mt-1">{t('stale_short')}</Text> : null}
        </Pressable>
        <TouchableOpacity
          onPress={onToggleSave}
          disabled={saving}
          className="h-11 min-w-[44px] px-2 flex-row items-center justify-center"
          accessibilityRole="button"
          accessibilityState={{ selected: saved, disabled: saving }}
          accessibilityLabel={`${saved ? t('saved_button') : t('save_button')}: ${item.title}`}
        >
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.brand[600] : colors.stone[500]} />
          <Text className={`text-xs ms-1 ${saved ? 'text-brand-700 font-semibold' : 'text-stone-600'}`}>{saved ? t('saved_button') : t('save_button')}</Text>
        </TouchableOpacity>
      </View>
      <ListingFacts item={item} compact />
      <View className="mt-2 flex-row items-center justify-between">
        <Pill label={providerLabel(item.provider)} />
        <TouchableOpacity onPress={onOpen} className="min-h-[44px] justify-center" accessibilityRole="link" accessibilityLabel={`${t('open_listing')}: ${item.title}`}>
          <Text className="text-brand-600 text-sm font-semibold">{t('open_listing')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FiltersModal({
  visible,
  value,
  onChange,
  onClose,
  onApply,
  onClear,
}: {
  visible: boolean;
  value: OpportunityFilters;
  onChange: (next: OpportunityFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const t = useT('careerOpportunities');
  const set = <K extends keyof OpportunityFilters>(key: K, next: OpportunityFilters[K]) => onChange({ ...value, [key]: next });
  const any = { value: '', label: t('filter_any') };
  return (
    <Modal visible={visible} onClose={onClose} title={t('filters_title')} size="lg">
      <OptionChips
        label={t('filter_category')}
        value={value.category}
        onChange={(v) => set('category', v)}
        options={[any, ...FILTER_CATEGORIES.map((v) => ({ value: v, label: categoryLabel(v) }))]}
      />
      <Input label={t('filter_role')} value={value.role} onChangeText={(v) => set('role', v)} maxLength={200} />
      <Input
        label={t('filter_min_pay')}
        value={value.minPay}
        onChangeText={(v) => set('minPay', v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        hint={t('filter_min_pay_hint')}
        maxLength={9}
      />
      <Input
        label={t('filter_currency')}
        value={value.payCurrency}
        onChangeText={(v) => set('payCurrency', v.replace(/[^A-Za-z]/g, '').toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={3}
      />
      <ToggleField label={t('filter_pay_stated')} value={value.payStated} onChange={(v) => set('payStated', v)} />
      <OptionChips
        label={t('field_schedule')}
        value={value.schedule}
        onChange={(v) => set('schedule', v)}
        options={[any, ...LISTING_SCHEDULES.map((v) => ({ value: v, label: scheduleLabel(v) }))]}
      />
      <OptionChips
        label={t('field_seniority')}
        value={value.seniority}
        onChange={(v) => set('seniority', v)}
        options={[any, ...LISTING_SENIORITIES.map((v) => ({ value: v, label: seniorityLabel(v) }))]}
      />
      <Input label={t('filter_place')} value={value.place} onChangeText={(v) => set('place', v)} maxLength={200} />
      <Input
        label={t('filter_radius')}
        value={value.radiusMiles}
        onChangeText={(v) => set('radiusMiles', v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        hint={t('filter_radius_hint')}
        maxLength={5}
      />
      <OptionChips
        label={t('field_remote_restriction')}
        value={value.remote}
        onChange={(v) => set('remote', v)}
        options={[any, { value: 'restricted', label: t('filter_remote_restricted') }, { value: 'unrestricted', label: t('filter_remote_unrestricted') }]}
      />
      <OptionChips
        label={t('filter_posted')}
        value={value.postedWithinDays}
        onChange={(v) => set('postedWithinDays', v)}
        options={[any, ...POSTED_WITHIN.map((v) => ({ value: v, label: t('filter_posted_days', { count: Number(v) }) }))]}
      />
      <DateInput label={t('filter_deadline_before')} value={value.deadlineBefore} onChange={(v) => set('deadlineBefore', v)} quickPicks={[7, 30]} />
      <OptionChips
        label={t('filter_source')}
        value={value.provider}
        onChange={(v) => set('provider', v)}
        options={[any, ...PROVIDERS.map((v) => ({ value: v, label: providerLabel(v) }))]}
      />
      <ToggleField label={t('filter_followed')} value={value.followedOnly} onChange={(v) => set('followedOnly', v)} />
      <ToggleField label={t('filter_include_expired')} value={value.includeExpired} onChange={(v) => set('includeExpired', v)} />
      <View className="flex-row gap-2 mt-2">
        <View className="flex-1">
          <Button fullWidth variant="outline" onPress={onClear}>
            {t('filters_clear')}
          </Button>
        </View>
        <View className="flex-1">
          <Button fullWidth onPress={onApply}>
            {t('search')}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function PasteModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT('careerOpportunities');
  const tk = useT('career');
  const paste = usePasteOpportunity();
  const [draft, setDraft] = useState<PasteDraft>(EMPTY_PASTE);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.text.trim().length > 0 || draft.sourceUrl.trim().length > 0;
  useLeaveGuard(dirty);
  const fields = pasteDetailFields(draft.category);
  const length = draft.text.trim().length;

  const close = () => {
    if (paste.isPending) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(t('paste_discard_title'), t('paste_discard_body'), [
      { text: tk('shared.keepEditing'), style: 'cancel' },
      {
        text: tk('shared.discard'),
        style: 'destructive',
        onPress: () => {
          setDraft(EMPTY_PASTE);
          setError(null);
          onClose();
        },
      },
    ]);
  };

  const submit = () => {
    if (paste.isPending) return;
    const checked = checkPasteDraft(draft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    paste.mutate(checked.input, {
      onSuccess: (created) => {
        setDraft(EMPTY_PASTE);
        onClose();
        Alert.alert(t('paste_saved'), created.title, [
          { text: t('paste_stay'), style: 'cancel' },
          { text: t('paste_open'), onPress: () => onCreated(created.id) },
        ]);
      },
      onError: (caught) => setError(pasteErrorText(caught) ?? careerErrorMessage(caught, t('unavailable_body'))),
    });
  };

  return (
    <Modal visible={visible} onClose={close} title={t('paste_heading')} size="lg" closeDisabled={paste.isPending}>
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('paste_label')}</Text>
      <TextInput
        value={draft.text}
        onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
        multiline
        maxLength={PASTE_MAX}
        textAlignVertical="top"
        accessibilityLabel={t('paste_label')}
        placeholder={t('paste_placeholder')}
        placeholderTextColor={colors.stone[400]}
        className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[160px]"
      />
      <Text className={`text-xs mt-1 mb-4 ${length > 0 && length < MIN_LISTING_TEXT ? 'text-warning' : 'text-stone-400'}`}>
        {t('paste_length', { count: length, min: MIN_LISTING_TEXT })}
      </Text>
      <Input
        label={t('paste_url')}
        value={draft.sourceUrl}
        onChangeText={(sourceUrl) => setDraft((current) => ({ ...current, sourceUrl }))}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://"
        maxLength={2000}
      />
      <OptionChips
        label={t('paste_category')}
        hint={t('paste_category_hint')}
        value={draft.category}
        onChange={(category) => setDraft((current) => ({ ...current, category }))}
        options={[{ value: '', label: t('paste_category_auto') }, ...OPPORTUNITY_CATEGORIES.map((v) => ({ value: v, label: categoryLabel(v) }))]}
      />
      <DateInput
        label={t('paste_deadline')}
        hint={t('paste_deadline_hint')}
        value={draft.deadline}
        onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
        quickPicks={[]}
      />
      {fields.map((field) =>
        field === 'eventDate' ? (
          <DateInput
            key={field}
            label={detailLabel(field)}
            value={draft.details[field] ?? ''}
            onChange={(v) => setDraft((current) => ({ ...current, details: { ...current.details, [field]: v } }))}
            quickPicks={[]}
          />
        ) : (
          <Input
            key={field}
            label={detailLabel(field)}
            value={draft.details[field] ?? ''}
            onChangeText={(v) => setDraft((current) => ({ ...current, details: { ...current.details, [field]: v } }))}
            maxLength={300}
          />
        ),
      )}
      {error ? (
        <Text className="text-red-600 text-sm mb-3" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button fullWidth onPress={submit} loading={paste.isPending}>
        {t('paste')}
      </Button>
    </Modal>
  );
}
