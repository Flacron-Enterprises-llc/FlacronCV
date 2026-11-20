import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useCareerModeLocations,
  useDeleteCareerModeLocation,
  useSaveSpecialistMode,
  useSpecialistMode,
} from '../../../../src/hooks/career/modes';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  canAddLocation,
  groupLocations,
  GUIDELINES_MAX,
  guidelinesForSave,
  isPlanUpgradeRequired,
  locationBadge,
  locationDeleteError,
  locationKind,
  locationLines,
  MAX_MODES,
  modeChecklist,
  modeFilterLabels,
  modesEqual,
  quotaHint,
  savedModes,
  specialistModeOptions,
  specialistSaveError,
  toggleMode,
} from '../../../../src/lib/career/modes';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { useT } from '../../../../src/i18n';
import { colors } from '../../../../src/theme/colors';
import type { LocationProfile, SpecialistMode } from '../../../../../../packages/career-api-client/src/types';

type Tab = 'locations' | 'specialist';
type Notice = { tone: 'success' | 'error'; text: string } | null;

/**
 * Relocation and specialist career modes (website: /career/relocation).
 * Locations: the career-mode location profiles (current area or relocation
 * targets) used for radius-aware matching, within the plan's capacity and
 * radius. Specialist mode: the career lens that shapes draft emphasis.
 */
export default function CareerRelocationScreen() {
  const t = useT('careerModes');
  const tc = useT('common');
  const access = useCareerAccess();
  const features = access.data?.features;
  const locationsOn = features?.locationProfiles === true;
  const specialistOn = features?.specialistModes === true;
  const [tab, setTab] = useState<Tab>('locations');
  const [specialistDirty, setSpecialistDirty] = useState(false);
  useLeaveGuard(specialistDirty);

  const locations = useCareerModeLocations(locationsOn);
  const used = locations.data?.items.length ?? 0;
  const capacity = locations.data?.capacity ?? 0;

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('common.locked')} />;
  } else if (access.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error) {
    content = <ErrorState message={careerErrorMessage(access.error, t('relocation.loadFailed'))} onRetry={() => void access.refetch()} />;
  } else if (tab === 'locations') {
    content = locationsOn ? (
      <LocationsTab />
    ) : (
      <EmptyState icon="lock-closed-outline" title={t('relocation.locationsLocked')} />
    );
  } else {
    content = specialistOn ? (
      <SpecialistTab onDirtyChange={setSpecialistDirty} />
    ) : (
      <EmptyState icon="lock-closed-outline" title={t('relocation.specialistLocked')} />
    );
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (tab === 'specialist' && specialistDirty) {
      Alert.alert(t('relocation.leave.title'), t('relocation.leave.body'), [
        { text: tc('unsaved.stay'), style: 'cancel' },
        {
          text: t('relocation.leave.discard'),
          style: 'destructive',
          onPress: () => {
            setSpecialistDirty(false);
            setTab(next);
          },
        },
      ]);
      return;
    }
    setTab(next);
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('relocation.title')} subtitle={t('relocation.subtitle')} />
      {access.data?.enabled ? (
        <View className="flex-row mx-5 mt-4 bg-stone-100 rounded-xl p-1" accessibilityRole="tablist">
          {(
            [
              [
                'locations',
                locationsOn && locations.data ? t('relocation.tabs.locationsCount', { used, capacity }) : t('relocation.tabs.locations'),
              ],
              ['specialist', t('relocation.tabs.specialist')],
            ] as const
          ).map(([key, label]) => {
            const selected = tab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => switchTab(key)}
                className={`flex-1 min-h-[44px] items-center justify-center rounded-lg ${selected ? 'bg-surface' : ''}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-stone-900' : 'text-stone-500'}`}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {content}
    </SafeAreaView>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const ok = notice.tone === 'success';
  return (
    <View
      className={`rounded-xl border p-3 mb-4 ${ok ? 'bg-success-bg border-green-200' : 'bg-red-50 border-red-200'}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text className={`text-sm ${ok ? 'text-success' : 'text-red-700'}`}>{notice.text}</Text>
    </View>
  );
}

function LocationsTab() {
  const t = useT('careerModes');
  const tc = useT('common');
  const router = useRouter();
  const list = useCareerModeLocations();
  const remove = useDeleteCareerModeLocation();
  const [notice, setNotice] = useState<Notice>(null);

  if (list.isLoading) {
    return (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (list.error || !list.data) {
    return <ErrorState message={careerErrorMessage(list.error, t('relocation.serviceUnavailable'))} onRetry={() => void list.refetch()} />;
  }

  const { items, capacity, allowedRadiusMiles } = list.data;
  const canAdd = canAddLocation(items.length, capacity);
  const groups = groupLocations(items);
  const openEditor = (id: string) => router.push(`/(dashboard)/career/relocation/${id}` as Href);

  const onDelete = (location: LocationProfile) => {
    Alert.alert(t('relocation.deleteConfirm.title'), t('relocation.deleteConfirm.body', { place: location.place }), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          setNotice(null);
          remove.mutate(location.id, {
            onSuccess: () => setNotice({ tone: 'success', text: t('relocation.removed') }),
            onError: (error) => setNotice({ tone: 'error', text: locationDeleteError(error) }),
          });
        },
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
    >
      <NoticeBanner notice={notice} />
      <Text className="text-stone-500 text-sm leading-5">{quotaHint(items.length, capacity, allowedRadiusMiles)}</Text>
      <View className="mt-3 mb-4 self-start">
        <Button
          onPress={() => openEditor('new')}
          disabled={!canAdd}
          icon={<Ionicons name="add" size={18} color={colors.white} />}
          accessibilityLabel={t('relocation.add')}
        >
          {t('relocation.add')}
        </Button>
      </View>
      {!canAdd ? (
        <Text className="text-stone-500 text-xs mb-4">{t('relocation.allInUse')}</Text>
      ) : null}

      <Text className="text-stone-500 text-xs leading-4 mb-4">{t('relocation.authNeverAssumed')}</Text>

      {items.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title={t('relocation.empty.title')}
          description={t('relocation.empty.body')}
        />
      ) : (
        (
          [
            ['current', t('relocation.groupCurrent'), groups.current],
            ['future', t('relocation.groupFuture'), groups.future],
          ] as const
        ).map(([key, heading, group]) =>
          group.length === 0 ? null : (
            <View key={key}>
              <Text className="text-stone-900 font-semibold text-sm mb-2 mt-1" accessibilityRole="header">
                {heading}
              </Text>
              {group.map(renderLocation)}
            </View>
          ),
        )
      )}
    </ScrollView>
  );

  function renderLocation(location: LocationProfile) {
    return (
      <View key={location.id} className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3">
        <View className="flex-row items-start justify-between">
          <Text className="font-bold text-stone-900 flex-1 me-2">{location.place}</Text>
          <Pill label={locationBadge(location)} tone={locationKind(location) === 'future' ? 'brand' : 'default'} />
        </View>
        <View className="mt-2">
          {locationLines(location).map((line) => (
            <Text key={line} className="text-stone-500 text-xs mt-0.5">
              {line}
            </Text>
          ))}
        </View>
        {location.notes ? (
          <Text className="text-stone-600 text-xs italic mt-2 bg-stone-50 rounded-lg p-2">“{location.notes}”</Text>
        ) : null}
        <View className="flex-row justify-end gap-2 mt-3 pt-3 border-t border-stone-100">
          <Button size="sm" variant="outline" className="min-h-[44px]" onPress={() => openEditor(location.id)} accessibilityLabel={t('relocation.editA11y', { place: location.place })}>
            {t('common.edit')}
          </Button>
          <Button
            size="sm"
            className="min-h-[44px]"
            variant="ghost"
            onPress={() => onDelete(location)}
            disabled={remove.isPending}
            accessibilityLabel={t('relocation.deleteA11y', { place: location.place })}
          >
            {tc('delete')}
          </Button>
        </View>
      </View>
    );
  }
}

function SpecialistTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const t = useT('careerModes');
  const query = useSpecialistMode();
  const save = useSaveSpecialistMode();
  const [selected, setSelected] = useState<SpecialistMode[] | null>(null);
  const [guidelines, setGuidelines] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // No fallback mode: an empty selection is a valid choice.
  const saved = savedModes(query.data);
  const savedGuidelines = query.data?.customGuidelines ?? '';
  const modes = selected ?? saved;
  const text = guidelines ?? savedGuidelines;
  const dirty = query.data !== undefined && (!modesEqual(modes, saved) || text.trim() !== savedGuidelines.trim());
  const full = modes.length >= MAX_MODES;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  if (query.isLoading) {
    return (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (isPlanUpgradeRequired(query.error)) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title={t('specialist.upgrade.title')}
        description={t('specialist.upgrade.body')}
      />
    );
  }
  if (query.error || !query.data) {
    return <ErrorState message={careerErrorMessage(query.error, t('specialist.loadFailed'))} onRetry={() => void query.refetch()} />;
  }

  const onSave = () => {
    if (text.trim().length > GUIDELINES_MAX) {
      setNotice({ tone: 'error', text: t('specialist.guidelinesTooLong', { max: GUIDELINES_MAX }) });
      return;
    }
    setNotice(null);
    save.mutate(
      { modes, customGuidelines: guidelinesForSave(text) },
      {
        onSuccess: () => {
          setSelected(null);
          setGuidelines(null);
          setNotice({ tone: 'success', text: t('specialist.saved') });
        },
        onError: (error) => setNotice({ tone: 'error', text: specialistSaveError(error) }),
      },
    );
  };

  const checklist = modeChecklist(modes);
  const filters = modeFilterLabels(modes);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <NoticeBanner notice={notice} />
        <Text className="text-stone-500 text-sm leading-5">{t('specialist.intro')}</Text>
        <Text className="text-stone-500 text-xs leading-4 mt-2">{t('specialist.noQuota')}</Text>
        <Text className="text-stone-900 text-sm font-semibold mt-3 mb-3" accessibilityLiveRegion="polite">
          {t('specialist.pick', { max: MAX_MODES })}
        </Text>
        <View>
          {specialistModeOptions().map((option) => {
            const isSelected = modes.includes(option.id);
            const disabled = !isSelected && full;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setSelected(toggleMode(modes, option.id))}
                disabled={disabled}
                className={`bg-surface rounded-2xl p-4 mb-3 border ${isSelected ? 'border-brand-600' : 'border-stone-100'} ${disabled ? 'opacity-50' : ''}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected, disabled }}
                accessibilityLabel={`${option.name}. ${option.description}`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="font-bold text-stone-900 flex-1 me-2">{option.name}</Text>
                  {isSelected ? (
                    <Ionicons name="checkbox" size={22} color={colors.brand[600]} />
                  ) : (
                    <Ionicons name="square-outline" size={22} color={colors.stone[300]} />
                  )}
                </View>
                <Text className="text-stone-500 text-xs mt-1 leading-4">{option.description}</Text>
                {saved.includes(option.id) ? (
                  <View className="mt-2 self-start">
                    <Pill label={t('specialist.activeMode')} tone="success" />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="bg-surface rounded-2xl border border-stone-100 p-4 mt-1">
          <Text className="font-bold text-stone-900">{t('specialist.checklistHeading')}</Text>
          {checklist.length === 0 ? (
            <Text className="text-stone-500 text-xs mt-1 leading-4">{t('specialist.noneSelected')}</Text>
          ) : (
            <View className="mt-2">
              {checklist.map((item) => (
                <View key={`${item.mode}-${item.id}`} className="flex-row items-start mt-1.5">
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.brand[600]} style={{ marginTop: 1 }} />
                  <Text className="text-stone-700 text-sm leading-5 ms-2 flex-1">{item.label}</Text>
                </View>
              ))}
            </View>
          )}
          {filters.length > 0 ? (
            <>
              <Text className="text-stone-500 text-xs mt-3">{t('specialist.suggestedFilters')}</Text>
              <View className="flex-row flex-wrap gap-1 mt-1">
                {filters.map((label) => (
                  <View key={label} className="bg-stone-100 rounded px-1.5 py-0.5">
                    <Text className="text-stone-700 text-[11px] font-medium">{label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View className="bg-surface rounded-2xl border border-stone-100 p-4 mt-3">
          <Text className="font-bold text-stone-900">{t('specialist.guidelinesTitle')}</Text>
          <View className="mt-3">
            <Input
              label={t('specialist.guidelinesLabel')}
              value={text}
              onChangeText={setGuidelines}
              placeholder={t('specialist.guidelinesPlaceholder')}
              multiline
              maxLength={GUIDELINES_MAX}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
          </View>
          <View className="mt-3 self-start">
            <Button onPress={onSave} loading={save.isPending} disabled={!dirty || save.isPending}>
              {t('specialist.save')}
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

