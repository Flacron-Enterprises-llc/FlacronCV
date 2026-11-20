import React, { useState } from 'react';
import { RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useRecruitingCount, useRecruitingOptIn, useSetRecruitingOptIn } from '../../../src/hooks/career/recruiting';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import { countLine, optInSaveError, RECRUITING_COPY, statusLine } from '../../../src/lib/career/recruiting';
import { careerErrorMessage } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';

/**
 * Recruiting opt-in (website: /career/recruiting): the candidate chooses
 * whether employers may see that they opted in, and saves it explicitly.
 * Employer search and checkout are employer-side and not for sale, so neither
 * is offered here.
 */
export default function CareerRecruitingScreen() {
  const t = useT('careerModes');
  const tb = useT('careerBusiness');
  const access = useCareerAccess();
  const current = useRecruitingOptIn();
  const save = useSetRecruitingOptIn();
  const count = useRecruitingCount();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const saved = current.data ?? null;
  const value = choice ?? saved ?? false;
  const dirty = choice !== null && choice !== saved;
  useLeaveGuard(dirty);

  const onSave = () => {
    setNote(null);
    save.mutate(value, {
      onSuccess: () => {
        setChoice(null);
        setNote({ tone: 'success', text: RECRUITING_COPY.saved });
      },
      onError: (error) => setNote({ tone: 'error', text: optInSaveError(error) }),
    });
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('common.locked')} />;
  } else if (access.isLoading || current.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.error) {
    content = <ErrorState message={careerErrorMessage(access.error, t('common.loadFailed'))} onRetry={() => void access.refetch()} />;
  } else {
    const readFailed = Boolean(current.error);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={current.isRefetching} onRefresh={() => void current.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm leading-5 mb-4">{RECRUITING_COPY.help}</Text>
        {note ? (
          <View
            className={`rounded-xl border p-3 mb-4 ${note.tone === 'success' ? 'bg-success-bg border-green-200' : 'bg-red-50 border-red-200'}`}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text className={`text-sm ${note.tone === 'success' ? 'text-success' : 'text-red-700'}`}>{note.text}</Text>
          </View>
        ) : null}
        <View className="bg-surface rounded-2xl border border-stone-100 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-stone-900 text-base">{t('recruiting.discoverableTitle')}</Text>
            {saved !== null ? <Pill label={saved ? t('recruiting.optedIn') : t('recruiting.notOptedIn')} tone={saved ? 'success' : 'default'} /> : null}
          </View>
          <Text className="text-stone-500 text-sm mt-1 leading-5">
            {readFailed ? careerErrorMessage(current.error, statusLine(null)) : statusLine(saved)}
          </Text>
          <View className="flex-row items-center justify-between mt-4 min-h-[44px]">
            <Text className="text-stone-800 text-sm flex-1 me-3 leading-5">{RECRUITING_COPY.consent}</Text>
            <Switch
              value={value}
              onValueChange={setChoice}
              accessibilityLabel={RECRUITING_COPY.consent}
              accessibilityState={{ checked: value }}
              trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
            />
          </View>
          <View className="mt-4 self-start">
            <Button onPress={onSave} loading={save.isPending} disabled={save.isPending || (!dirty && saved !== null)}>
              {RECRUITING_COPY.save}
            </Button>
          </View>
        </View>
        <View
          className="bg-surface rounded-2xl border border-stone-100 p-5 mt-4"
          accessible
          accessibilityLabel={`${tb('scope.comingSoon')}. ${tb('scope.employerHeading')}. ${tb('scope.employerSoonBody')}`}
        >
          <View className="flex-row items-center flex-wrap gap-2">
            <Pill label={tb('scope.comingSoon')} />
            <Text className="font-bold text-stone-900 text-base flex-1">{tb('scope.employerHeading')}</Text>
          </View>
          <Text className="text-stone-500 text-sm mt-2 leading-5">{tb('scope.employerSoonBody')}</Text>
        </View>
        <View className="bg-surface rounded-2xl border border-stone-100 p-5 mt-4">
          <Text className="font-bold text-stone-900 text-base">{t('recruiting.countTitle')}</Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">{t('recruiting.countHelp')}</Text>
          {count.data !== undefined && count.data !== null ? (
            <Text className="text-stone-900 text-sm font-semibold mt-3" accessibilityLiveRegion="polite">
              {countLine(count.data)}
            </Text>
          ) : null}
          {count.error ? (
            <Text className="text-red-700 text-sm mt-3" accessibilityRole="alert">
              {careerErrorMessage(count.error, t('recruiting.countFailed'))}
            </Text>
          ) : null}
          <View className="mt-3 self-start">
            <Button variant="outline" onPress={() => void count.refetch()} loading={count.isFetching} disabled={count.isFetching}>
              {t('recruiting.countButton')}
            </Button>
          </View>
        </View>
        <Text className="text-stone-400 text-xs mt-4 leading-4">{t('recruiting.footer')}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={RECRUITING_COPY.title} />
      {content}
    </SafeAreaView>
  );
}
