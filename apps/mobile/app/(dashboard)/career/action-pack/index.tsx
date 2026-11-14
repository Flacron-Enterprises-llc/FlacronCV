import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useActionPacks, useCreateActionPack } from '../../../../src/hooks/career/action-packs';
import { useCareerAccess, useCareerOpportunities } from '../../../../src/hooks/useCareer';
import {
  actionPackErrorMessage,
  checklistProgress,
  creditsLeft,
  fitLabel,
  fitTone,
  statusBadge,
  keyForAction,
  organizationName,
  type KeyedAction,
} from '../../../../src/lib/career/action-packs';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';

/**
 * Action packs, as on the website (career/action-pack): pick a saved
 * opportunity and the career service bundles a fit explanation, tailored CV
 * lines, a cover letter, a checklist and next steps from your confirmed facts.
 * One action-pack credit per pack; reading and ticking the checklist are free.
 */
export default function ActionPacksScreen() {
  const t = useT('careerPlans');
  const tc = useT('common');
  const router = useRouter();
  const access = useCareerAccess();
  const list = useActionPacks();
  const opportunities = useCareerOpportunities();
  const create = useCreateActionPack();
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const action = useRef<KeyedAction | null>(null);

  const featureOff = access.data?.enabled === true && access.data.features?.actionPacks === false;

  const openPicker = () => {
    setCreateError(null);
    setPicking(true);
  };

  const onCreate = () => {
    if (!selected || create.isPending) return;
    // A retry of the same opportunity reuses the key, so it is never charged twice.
    action.current = keyForAction(action.current, selected, () => Crypto.randomUUID());
    setCreateError(null);
    create.mutate(
      { opportunityId: selected, idempotencyKey: action.current.key },
      {
        onSuccess: (paid) => {
          action.current = null;
          setPicking(false);
          setSelected(null);
          router.push(`/(dashboard)/career/action-pack/${paid.actionPack.id}` as Href);
        },
        onError: (error) => setCreateError(actionPackErrorMessage(error)),
      },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (featureOff) {
    content = <EmptyState icon="lock-closed-outline" title={t('actionPack.notOpen')} description={t('nothingChangedNoCredit')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={careerErrorMessage(list.error ?? access.error, t('actionPack.loadError'))} onRetry={() => void list.refetch()} />;
  } else {
    const packs = list.data.items;
    const credits = creditsLeft(list.data.actionPack);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">
          {t('actionPack.intro')}
        </Text>
        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4 flex-row items-center">
          <View className="flex-1 me-3">
            <Text className="text-stone-500 text-xs font-semibold uppercase tracking-wide">{t('actionPack.credits')}</Text>
            <Text className="text-2xl font-black text-stone-900 mt-0.5">{credits ?? '—'}</Text>
          </View>
          <Button onPress={openPicker} icon={<Ionicons name="add" size={18} color={colors.white} />}>
            {t('actionPack.newPack')}
          </Button>
        </View>
        {packs.length === 0 ? (
          <EmptyState icon="rocket-outline" title={t('actionPack.emptyTitle')} description={t('actionPack.emptyBody')} />
        ) : (
          <>
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">{t('actionPack.yourPacks')}</Text>
            {packs.map((pack) => {
              const progress = checklistProgress(pack);
              const badge = statusBadge(pack);
              return (
                <TouchableOpacity
                  key={pack.id}
                  onPress={() => router.push(`/(dashboard)/career/action-pack/${pack.id}` as Href)}
                  className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 flex-row items-center min-h-[56px]"
                  accessibilityRole="button"
                  accessibilityLabel={t('actionPack.itemA11y', {
                    title: pack.vacancySnapshot.title,
                    organization: organizationName(pack.vacancySnapshot.organization),
                    fit: fitLabel(pack.fit.fit).toLowerCase(),
                    done: progress.done,
                    total: progress.total,
                  })}
                  activeOpacity={0.8}
                >
                  <View className="flex-1 me-2">
                    <Text className="font-bold text-stone-900" numberOfLines={1}>
                      {pack.vacancySnapshot.title}
                    </Text>
                    <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={1}>
                      {organizationName(pack.vacancySnapshot.organization)}
                    </Text>
                    <View className="flex-row items-center mt-2 gap-2">
                      <Pill label={fitLabel(pack.fit.fit)} tone={fitTone(pack.fit.fit)} />
                      {badge ? <Pill label={badge.label} tone={badge.tone} /> : null}
                      <Text className="text-stone-400 text-xs">{`${t('actionPack.itemChecklist', { done: progress.done, total: progress.total })} · ${formatDay(pack.createdAt) ?? ''}`}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  }

  const opps = opportunities.data?.items ?? [];
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('actionPack.title')} />
      {content}
      <Modal visible={picking} onClose={() => setPicking(false)} title={t('actionPack.pickTitle')} size="lg" closeDisabled={create.isPending}>
        <Text className="text-stone-500 text-sm leading-5 mb-4">
          {t('actionPack.pickCost')}
        </Text>
        {opportunities.isLoading ? (
          <SkeletonCard />
        ) : opportunities.error ? (
          <Text className="text-red-600 text-sm mb-4">{careerErrorMessage(opportunities.error, t('actionPack.oppsLoadError'))}</Text>
        ) : opps.length === 0 ? (
          <Text className="text-stone-500 text-sm mb-4">{t('actionPack.noOpps')}</Text>
        ) : (
          <View accessibilityRole="radiogroup" className="mb-2">
            {opps.map((opp) => {
              const isSelected = selected === opp.id;
              return (
                <TouchableOpacity
                  key={opp.id}
                  onPress={() => setSelected(opp.id)}
                  disabled={create.isPending}
                  className={`border rounded-2xl p-4 mb-2 flex-row items-center min-h-[56px] ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, checked: isSelected, disabled: create.isPending }}
                  accessibilityLabel={`${opp.title}, ${organizationName(opp.organization)}`}
                  activeOpacity={0.8}
                >
                  <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={20} color={isSelected ? colors.brand[600] : colors.stone[400]} />
                  <View className="flex-1 ms-3">
                    <Text className="font-semibold text-stone-900" numberOfLines={2}>
                      {opp.title}
                    </Text>
                    <Text className="text-stone-500 text-xs mt-0.5" numberOfLines={1}>
                      {organizationName(opp.organization)}
                      {opp.label === 'expired' ? ` · ${t('actionPack.expired')}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {createError ? (
          <View className="bg-error-bg rounded-xl p-3 mb-3" accessibilityLiveRegion="polite">
            <Text className="text-red-700 text-sm">{createError}</Text>
          </View>
        ) : null}
        <View className="flex-row gap-3 mb-8">
          <View className="flex-1">
            <Button variant="outline" fullWidth onPress={() => setPicking(false)} disabled={create.isPending}>
              {tc('cancel')}
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth onPress={onCreate} loading={create.isPending} disabled={!selected}>
              {t('actionPack.create')}
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
