import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useCareerModeLocations,
  useCreateCareerModeLocation,
  useDeleteCareerModeLocation,
  useUpdateCareerModeLocation,
} from '../../../../src/hooks/career/modes';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  canAddLocation,
  COMMUTE_MAX,
  COMMUTE_MIN,
  COMMUTE_STEP,
  draftsEqual,
  draftToCreateInput,
  draftToPatch,
  emptyLocationDraft,
  locationDeleteError,
  locationSaveError,
  locationToDraft,
  NOTES_MAX,
  PLACE_MAX,
  RADIUS_MIN,
  RADIUS_STEP,
  REMOTE_OPTIONS,
  stepValue,
  TIMELINE_OPTIONS,
  validateLocationDraft,
  WORK_AUTH_OPTIONS,
  type LocationDraft,
} from '../../../../src/lib/career/modes';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Add (`id` = "new") or edit one career-mode location profile. Same fields
 * and limits as the website's form; the plan's radius and the number of
 * profiles are enforced by the career API.
 */
export default function CareerLocationEditorScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === 'new';
  const access = useCareerAccess();
  const featureOn = access.data?.features?.locationProfiles === true;
  const list = useCareerModeLocations(featureOn);
  const location = isNew ? undefined : list.data?.items.find((l) => l.id === params.id);
  const allowed = list.data?.allowedRadiusMiles ?? 25;

  const create = useCreateCareerModeLocation();
  const update = useUpdateCareerModeLocation();
  const remove = useDeleteCareerModeLocation();
  const pending = create.isPending || update.isPending || remove.isPending;

  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);

  const baseline = location ? locationToDraft(location) : emptyLocationDraft(allowed);
  const current = draft ?? baseline;
  const dirty = draft !== null && !draftsEqual(draft, baseline);
  useLeaveGuard(dirty && !leave);

  // Leave after a save or delete, once the guard has seen the clean state.
  useEffect(() => {
    if (!leave) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(dashboard)/career/relocation' as Href);
  }, [leave, router]);

  const set = <K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) => {
    setDraft((prev) => ({ ...(prev ?? baseline), [key]: value }));
    setError(null);
  };

  const done = () => {
    setDraft(null);
    setLeave(true);
  };

  const onSave = () => {
    const invalid = validateLocationDraft(current, allowed);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (isNew) {
      create.mutate(draftToCreateInput(current), { onSuccess: done, onError: (e) => setError(locationSaveError(e)) });
      return;
    }
    if (!location) return;
    const patch = draftToPatch(current, baseline);
    if (Object.keys(patch).length === 0) {
      done();
      return;
    }
    update.mutate({ id: location.id, patch }, { onSuccess: done, onError: (e) => setError(locationSaveError(e)) });
  };

  const onDelete = () => {
    if (!location) return;
    Alert.alert('Delete this location profile?', `${location.place} will no longer be used for matching.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate(location.id, { onSuccess: done, onError: (e) => setError(locationDeleteError(e)) }),
      },
    ]);
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.data && !featureOn) {
    content = <EmptyState icon="lock-closed-outline" title="Location profiles are not included in your plan" />;
  } else if (leave || access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, 'Could not connect to the career modes service. Please try again.')}
        onRetry={() => void list.refetch()}
      />
    );
  } else if (!isNew && !location) {
    content = <ErrorState message="This location profile no longer exists." onRetry={() => void list.refetch()} />;
  } else if (isNew && !canAddLocation(list.data.items.length, list.data.capacity)) {
    content = (
      <EmptyState
        icon="location-outline"
        title="All location profiles are in use"
        description="Delete a location profile to add another."
      />
    );
  } else {
    content = (
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {error ? (
            <View className="rounded-xl border border-red-200 bg-red-50 p-3 mb-4" accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          ) : null}
          <View className="bg-white border border-stone-100 rounded-2xl p-4">
            <Input
              label="Location (City, State / Metro) *"
              value={current.place}
              onChangeText={(v) => set('place', v)}
              placeholder="e.g. Austin, TX or Seattle, WA"
              maxLength={PLACE_MAX}
              autoCorrect={false}
            />
            <Stepper
              label="Search radius"
              value={current.radiusMiles}
              unit="miles"
              hint={`Plan maximum radius: ${allowed} miles`}
              onChange={(d) => set('radiusMiles', stepValue(current.radiusMiles, d * RADIUS_STEP, RADIUS_MIN, allowed))}
              canDecrease={current.radiusMiles > RADIUS_MIN}
              canIncrease={current.radiusMiles < allowed}
            />
            <Stepper
              label="Maximum daily commute"
              value={current.commuteMinutesMax}
              unit="min"
              onChange={(d) => set('commuteMinutesMax', stepValue(current.commuteMinutesMax, d * COMMUTE_STEP, COMMUTE_MIN, COMMUTE_MAX))}
              canDecrease={current.commuteMinutesMax > COMMUTE_MIN}
              canIncrease={current.commuteMinutesMax < COMMUTE_MAX}
            />
            <View className="flex-row items-center justify-between min-h-[44px] mb-4">
              <Text className="text-sm font-medium text-stone-700 flex-1 mr-3">
                This is a target relocation destination (not my current home)
              </Text>
              <Switch
                value={current.isRelocation}
                onValueChange={(v) => set('isRelocation', v)}
                accessibilityLabel="This is a target relocation destination"
                accessibilityState={{ checked: current.isRelocation }}
                trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
              />
            </View>
            <Choices label="Target move timeline" options={TIMELINE_OPTIONS} value={current.targetTimeline} onChange={(v) => set('targetTimeline', v)} />
            <Choices label="Work authorization in area" options={WORK_AUTH_OPTIONS} value={current.workAuthorization} onChange={(v) => set('workAuthorization', v)} />
            <Choices label="Work arrangement flexibility" options={REMOTE_OPTIONS} value={current.remoteFlexibility} onChange={(v) => set('remoteFlexibility', v)} />
            <Input
              label="Relocation / location notes (optional)"
              value={current.notes}
              onChangeText={(v) => set('notes', v)}
              placeholder="e.g. Relocating Q4; preference for north suburbs near transit."
              multiline
              maxLength={NOTES_MAX}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>
          <View className="mt-4">
            <Button onPress={onSave} loading={create.isPending || update.isPending} disabled={pending || !current.place.trim()} fullWidth>
              Save location profile
            </Button>
          </View>
          {location ? (
            <View className="mt-3">
              <Button variant="ghost" onPress={onDelete} loading={remove.isPending} disabled={pending} fullWidth>
                Delete location profile
              </Button>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={isNew ? 'Add location profile' : 'Edit location profile'} />
      {content}
    </SafeAreaView>
  );
}

function Stepper({
  label,
  value,
  unit,
  hint,
  onChange,
  canDecrease,
  canIncrease,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
  onChange: (direction: 1 | -1) => void;
  canDecrease: boolean;
  canIncrease: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
      <View className="flex-row items-center" accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: `${value} ${unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment' && canIncrease) onChange(1);
          if (e.nativeEvent.actionName === 'decrement' && canDecrease) onChange(-1);
        }}
      >
        <TouchableOpacity
          onPress={() => onChange(-1)}
          disabled={!canDecrease}
          className={`h-11 w-11 rounded-xl border border-stone-200 items-center justify-center ${canDecrease ? '' : 'opacity-40'}`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
        >
          <Ionicons name="remove" size={20} color={colors.stone[700]} />
        </TouchableOpacity>
        <Text className="mx-4 text-base font-semibold text-stone-900 min-w-[90px] text-center">
          {value} {unit}
        </Text>
        <TouchableOpacity
          onPress={() => onChange(1)}
          disabled={!canIncrease}
          className={`h-11 w-11 rounded-xl border border-stone-200 items-center justify-center ${canIncrease ? '' : 'opacity-40'}`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
        >
          <Ionicons name="add" size={20} color={colors.stone[700]} />
        </TouchableOpacity>
      </View>
      {hint ? <Text className="mt-1 text-xs text-stone-400">{hint}</Text> : null}
    </View>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              className={`min-h-[44px] px-3 justify-center rounded-xl border ${selected ? 'bg-brand-50 border-brand-600' : 'bg-white border-stone-200'}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={option.label}
            >
              <Text className={`text-sm ${selected ? 'text-brand-700 font-semibold' : 'text-stone-700'}`}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
