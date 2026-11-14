import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useActionPack, useCancelActionPack, useRetryActionPackLetter, useToggleChecklist } from '../../../../src/hooks/career/action-packs';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import {
  cancelErrorMessage,
  checklistErrorMessage,
  checklistProgress,
  fitLabel,
  fitTone,
  isFinalRetryFailure,
  letterAttemptsLeft,
  organizationName,
  packStatus,
  retryErrorMessage,
} from '../../../../src/lib/career/action-packs';
import { careerErrorMessage, FACT_TYPE_LABEL, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

/**
 * One action pack, as the website's detail column shows it: vacancy, fit
 * reasons and gaps, the preparation checklist (ticking is free), the tailored
 * cover letter, the tailored CV lines and the next steps. An unfinished pack
 * (the letter failed) holds its one credit: retrying the letter is free and
 * cancelling returns the credit. Editing, saving to Documents and downloads
 * are on the website for now.
 */
export default function ActionPackScreen() {
  const t = useT('careerPlans');
  const tc = useT('common');
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useCareerAccess();
  const pack = useActionPack(id);
  const toggle = useToggleChecklist(id);
  const retry = useRetryActionPackLetter(id);
  const cancel = useCancelActionPack();
  const router = useRouter();
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(dashboard)/career/action-pack' as Href);
  };

  const onRetry = () => {
    setNote(null);
    retry.mutate(undefined, {
      onSuccess: (paid) =>
        setNote(
          packStatus(paid.actionPack) === 'complete'
            ? { tone: 'success', text: t('actionPack.retrySucceeded') }
            : { tone: 'error', text: t('actionPack.retryFailed') },
        ),
      onError: (error) => {
        if (isFinalRetryFailure(error)) {
          // The server removed the pack and returned the credit.
          Alert.alert(t('notUpdated'), retryErrorMessage(error), [{ text: 'OK', onPress: leave }]);
          return;
        }
        setNote({ tone: 'error', text: retryErrorMessage(error) });
      },
    });
  };

  const onCancel = (expired: boolean) => {
    if (!id) return;
    Alert.alert(
      expired ? t('actionPack.deletePack') : t('actionPack.cancelPack'),
      expired ? t('actionPack.statusExpired') : t('actionPack.cancelConfirm'),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: expired ? tc('delete') : t('actionPack.cancelPackShort'),
          style: 'destructive',
          onPress: () =>
            cancel.mutate(id, {
              onSuccess: () => Alert.alert(t('actionPack.cancelDoneTitle'), t('actionPack.cancelDone'), [{ text: 'OK', onPress: leave }]),
              onError: (error) => setNote({ tone: 'error', text: cancelErrorMessage(error) }),
            }),
        },
      ],
    );
  };

  const onToggle = (checklistId: string, done: boolean) => {
    toggle.mutate(
      { checklistId, done },
      { onError: (error) => Alert.alert(t('notUpdated'), checklistErrorMessage(error)) },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (pack.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (pack.error || !pack.data) {
    content = <ErrorState message={careerErrorMessage(pack.error, t('actionPack.openError'))} onRetry={() => void pack.refetch()} />;
  } else {
    const p = pack.data;
    const progress = checklistProgress(p);
    const status = packStatus(p);
    const attemptsLeft = letterAttemptsLeft(p);
    const busy = retry.isPending || cancel.isPending;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={pack.isRefetching && !pack.isPlaceholderData} onRefresh={() => void pack.refetch()} tintColor={colors.brand[600]} />}
      >
        {note ? (
          <View className={`rounded-xl p-3 mb-4 ${note.tone === 'success' ? 'bg-success-bg' : 'bg-red-50'}`} accessibilityLiveRegion="polite">
            <Text className={`text-sm ${note.tone === 'success' ? 'text-success' : 'text-red-700'}`}>{note.text}</Text>
          </View>
        ) : null}
        {status === 'partial' || (status === 'generating' && p.coverLetter === null) ? (
          <View className="bg-warning-bg rounded-2xl p-4 mb-4" accessibilityLiveRegion="polite">
            <Text className="text-warning font-bold mb-1">{t('actionPack.statusPartialTitle')}</Text>
            <Text className="text-warning text-sm leading-5">{status === 'partial' ? t('actionPack.statusPartial') : t('actionPack.statusGenerating')}</Text>
            {status === 'partial' ? <Text className="text-warning text-xs mt-1">{t('actionPack.attemptsLeft', { count: attemptsLeft })}</Text> : null}
            <View className="mt-3 gap-2">
              {status === 'partial' && attemptsLeft > 0 ? (
                <Button onPress={onRetry} loading={retry.isPending} disabled={busy} fullWidth>
                  {t('actionPack.retryLetter')}
                </Button>
              ) : null}
              <Button variant="outline" onPress={() => onCancel(false)} loading={cancel.isPending} disabled={busy} fullWidth>
                {t('actionPack.cancelPack')}
              </Button>
            </View>
          </View>
        ) : null}
        {status === 'expired' ? (
          <View className="bg-stone-100 rounded-2xl p-4 mb-4">
            <Text className="text-stone-700 text-sm leading-5">{t('actionPack.statusExpired')}</Text>
            <View className="mt-3">
              <Button variant="outline" onPress={() => onCancel(true)} loading={cancel.isPending} disabled={busy} fullWidth>
                {t('actionPack.deletePack')}
              </Button>
            </View>
          </View>
        ) : null}
        <Card>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 me-2">
              <Text className="text-lg font-bold text-stone-900">{p.vacancySnapshot.title}</Text>
              <Text className="text-brand-700 text-sm font-medium mt-0.5">{organizationName(p.vacancySnapshot.organization)}</Text>
            </View>
            <Pill label={fitLabel(p.fit.fit)} tone={fitTone(p.fit.fit)} />
          </View>
          <Text className="text-stone-400 text-xs mt-2">
            {[
              t('actionPack.created', { date: formatDay(p.createdAt) ?? '' }),
              p.vacancySnapshot.deadline ? t('actionPack.deadline', { date: formatDay(p.vacancySnapshot.deadline) ?? '' }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {p.vacancySnapshot.description ? (
            <>
              <SectionLabel>{t('actionPack.vacancyOverview')}</SectionLabel>
              <Text className="text-stone-700 text-sm leading-5" numberOfLines={6}>
                {p.vacancySnapshot.description}
              </Text>
            </>
          ) : null}
          <SectionLabel>{t('actionPack.whyQualify')}</SectionLabel>
          {p.fit.reasons.length > 0 ? p.fit.reasons.map((r, i) => <Bullet key={i} icon="checkmark-circle-outline" color={colors.success.DEFAULT} text={r} />) : <Text className="text-stone-500 text-sm">{t('actionPack.noReasons')}</Text>}
          <SectionLabel>{t('actionPack.gaps')}</SectionLabel>
          {p.fit.gaps.length > 0 ? p.fit.gaps.map((g, i) => <Bullet key={i} icon="alert-circle-outline" color={colors.warning.DEFAULT} text={g} />) : <Text className="text-stone-500 text-sm">{t('actionPack.noGaps')}</Text>}
          {p.fit.unknowns.length > 0 ? (
            <>
              <SectionLabel>{t('actionPack.unknowns')}</SectionLabel>
              {p.fit.unknowns.map((u, i) => (
                <Bullet key={i} icon="help-circle-outline" color={colors.stone[400]} text={u} />
              ))}
            </>
          ) : null}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">{t('actionPack.checklist')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3">{t('actionPack.checklistProgress', { done: progress.done, total: progress.total })}</Text>
          {p.checklist.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onToggle(item.id, !item.done)}
              className="flex-row items-start border border-stone-100 rounded-xl p-3 mb-2 min-h-[44px]"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={item.label}
              activeOpacity={0.7}
            >
              <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={22} color={item.done ? colors.brand[600] : colors.stone[400]} />
              <Text className={`flex-1 ms-3 text-sm leading-5 ${item.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900 mb-2">{t('actionPack.coverLetter')}</Text>
          {p.coverLetter ? (
            <Text selectable className="text-stone-800 text-sm leading-6">
              {p.coverLetter.body}
            </Text>
          ) : (
            <Text className="text-stone-500 text-sm">{t('actionPack.letterPending')}</Text>
          )}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">{t('actionPack.cvContent')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-2">{t('actionPack.factsIncluded', { count: p.tailoredResume.factIds.length })}</Text>
          {p.tailoredResume.lines.map((line, idx) => (
            <View key={`${line.factId}-${idx}`} className="py-2 border-t border-stone-100">
              <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">{FACT_TYPE_LABEL[line.factType] ?? line.factType}</Text>
              <Text selectable className="text-stone-800 text-sm mt-0.5 leading-5">
                {line.text}
              </Text>
            </View>
          ))}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900 mb-2">{t('actionPack.nextSteps')}</Text>
          {p.nextSteps.map((step, idx) => (
            <View key={idx} className="flex-row mb-2">
              <Text className="text-stone-500 text-sm w-6">{`${idx + 1}.`}</Text>
              <Text className="flex-1 text-stone-800 text-sm leading-5">{step}</Text>
            </View>
          ))}
        </Card>
        <Text className="text-stone-400 text-xs leading-4">{t('actionPack.footer')}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={pack.data?.vacancySnapshot.title ?? t('actionPack.detailSubtitle')} subtitle={t('actionPack.detailSubtitle')} />
      {content}
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">{children}</View>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-1.5">{children}</Text>;
}

function Bullet({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View className="flex-row items-start mb-1.5">
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <Text className="flex-1 ms-2 text-stone-700 text-sm leading-5">{text}</Text>
    </View>
  );
}
