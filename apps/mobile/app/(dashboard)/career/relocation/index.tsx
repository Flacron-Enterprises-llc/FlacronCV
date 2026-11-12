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
  GUIDELINES_MAX,
  guidelinesForSave,
  isPlanUpgradeRequired,
  locationBadge,
  locationDeleteError,
  locationLines,
  quotaHint,
  SPECIALIST_MODE_OPTIONS,
  specialistModeMeta,
  specialistSaveError,
} from '../../../../src/lib/career/modes';
import { careerErrorMessage } from '../../../../src/lib/career-view';
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
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error) {
    content = <ErrorState message={careerErrorMessage(access.error, 'Could not load your career tools.')} onRetry={() => void access.refetch()} />;
  } else if (tab === 'locations') {
    content = locationsOn ? (
      <LocationsTab />
    ) : (
      <EmptyState icon="lock-closed-outline" title="Location profiles are not included in your plan" />
    );
  } else {
    content = specialistOn ? (
      <SpecialistTab onDirtyChange={setSpecialistDirty} />
    ) : (
      <EmptyState icon="lock-closed-outline" title="Specialist modes are not included in your plan" />
    );
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (tab === 'specialist' && specialistDirty) {
      Alert.alert('Leave without saving?', 'Your specialist mode changes are not saved.', [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Discard',
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
      <CareerHeader title="Relocation & career modes" subtitle="Target locations and the career lens for your drafts" />
      {access.data?.enabled ? (
        <View className="flex-row mx-5 mt-4 bg-stone-100 rounded-xl p-1" accessibilityRole="tablist">
          {(
            [
              ['locations', locationsOn && locations.data ? `Locations (${used}/${capacity})` : 'Locations'],
              ['specialist', 'Specialist mode'],
            ] as const
          ).map(([key, label]) => {
            const selected = tab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => switchTab(key)}
                className={`flex-1 min-h-[44px] items-center justify-center rounded-lg ${selected ? 'bg-white' : ''}`}
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
    return <ErrorState message={careerErrorMessage(list.error, 'Could not connect to the career modes service. Please try again.')} onRetry={() => void list.refetch()} />;
  }

  const { items, capacity, allowedRadiusMiles } = list.data;
  const canAdd = canAddLocation(items.length, capacity);
  const openEditor = (id: string) => router.push(`/(dashboard)/career/relocation/${id}` as Href);

  const onDelete = (location: LocationProfile) => {
    Alert.alert('Delete this location profile?', `${location.place} will no longer be used for matching.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setNotice(null);
          remove.mutate(location.id, {
            onSuccess: () => setNotice({ tone: 'success', text: 'Location profile removed.' }),
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
          accessibilityLabel="Add location profile"
        >
          Add location profile
        </Button>
      </View>
      {!canAdd ? (
        <Text className="text-stone-500 text-xs mb-4">All location profiles in your plan are in use. Delete one to add another.</Text>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon="location-outline"
          title="No location profiles configured"
          description="Add your primary location or target relocation cities to power radius-aware opportunity matching."
        />
      ) : (
        items.map((location) => (
          <View key={location.id} className="bg-white border border-stone-100 rounded-2xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <Text className="font-bold text-stone-900 flex-1 mr-2">{location.place}</Text>
              <Pill label={locationBadge(location)} tone={location.isRelocation ? 'brand' : 'default'} />
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
              <Button size="sm" variant="outline" className="min-h-[44px]" onPress={() => openEditor(location.id)} accessibilityLabel={`Edit ${location.place}`}>
                Edit
              </Button>
              <Button
                size="sm"
                className="min-h-[44px]"
                variant="ghost"
                onPress={() => onDelete(location)}
                disabled={remove.isPending}
                accessibilityLabel={`Delete ${location.place}`}
              >
                Delete
              </Button>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function SpecialistTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const query = useSpecialistMode();
  const save = useSaveSpecialistMode();
  const [selected, setSelected] = useState<SpecialistMode | null>(null);
  const [guidelines, setGuidelines] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const savedMode = query.data?.mode ?? 'general';
  const savedGuidelines = query.data?.customGuidelines ?? '';
  const mode = selected ?? savedMode;
  const text = guidelines ?? savedGuidelines;
  const dirty = query.data !== undefined && (mode !== savedMode || text.trim() !== savedGuidelines.trim());

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
        title="Specialist modes are not included in your current plan"
        description="Specialist career modes adapt drafts for Engineering, Executive Leadership, Design, Research, and Career Pivots."
      />
    );
  }
  if (query.error || !query.data) {
    return <ErrorState message={careerErrorMessage(query.error, 'Could not load your specialist mode.')} onRetry={() => void query.refetch()} />;
  }

  const onSave = () => {
    if (text.trim().length > GUIDELINES_MAX) {
      setNotice({ tone: 'error', text: `Keep the custom guidelines under ${GUIDELINES_MAX} characters.` });
      return;
    }
    setNotice(null);
    save.mutate(
      { mode, customGuidelines: guidelinesForSave(text) },
      {
        onSuccess: () => {
          setSelected(null);
          setGuidelines(null);
          setNotice({ tone: 'success', text: 'Specialist career mode updated.' });
        },
        onError: (error) => setNotice({ tone: 'error', text: specialistSaveError(error) }),
      },
    );
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <NoticeBanner notice={notice} />
        <Text className="text-stone-500 text-sm leading-5 mb-4">
          Select a career lens to adapt resume emphasis, prompt weighting, and fit analysis to your specific discipline.
        </Text>
        <View accessibilityRole="radiogroup">
          {SPECIALIST_MODE_OPTIONS.map((option) => {
            const isSelected = option.id === mode;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setSelected(option.id)}
                className={`bg-white rounded-2xl p-4 mb-3 border ${isSelected ? 'border-brand-600' : 'border-stone-100'}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, checked: isSelected }}
                accessibilityLabel={`${option.name}. ${option.description}`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="font-bold text-stone-900 flex-1 mr-2">{option.name}</Text>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.brand[600]} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={colors.stone[300]} />
                  )}
                </View>
                <Text className="text-stone-500 text-xs mt-1 leading-4">{option.description}</Text>
                {option.id === savedMode ? (
                  <View className="mt-2">
                    <Pill label="ACTIVE MODE" tone="success" />
                  </View>
                ) : null}
                <Text className="text-stone-400 text-[10px] font-semibold mt-3 tracking-wide">RECOMMENDED FOCUS</Text>
                <View className="flex-row flex-wrap gap-1 mt-1">
                  {option.recommendedFocus.map((focus) => (
                    <View key={focus} className="bg-stone-100 rounded px-1.5 py-0.5">
                      <Text className="text-stone-700 text-[10px] font-medium">{focus}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="bg-white rounded-2xl border border-stone-100 p-4 mt-1">
          <Text className="font-bold text-stone-900">Discipline guidelines & custom focus</Text>
          <Text className="text-stone-500 text-xs mt-1 leading-4">{specialistModeMeta(mode).promptModifier}</Text>
          <View className="mt-3">
            <Input
              label="Custom guidelines (optional)"
              value={text}
              onChangeText={setGuidelines}
              placeholder="Add any specific industry context, methodologies, or personal focus areas to guide drafts."
              multiline
              maxLength={GUIDELINES_MAX}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
          </View>
          <View className="mt-3 self-start">
            <Button onPress={onSave} loading={save.isPending} disabled={!dirty || save.isPending}>
              Save specialist mode
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
