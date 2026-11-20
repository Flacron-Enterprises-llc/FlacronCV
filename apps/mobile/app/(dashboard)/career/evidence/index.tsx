import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useEvidenceGate, useEvidenceList } from '../../../../src/hooks/career/evidence';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { evidenceLabelLimit, evidenceLabelView, evidenceTypeLabel, formatBytes } from '../../../../src/lib/career/evidence';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

/**
 * Evidence vault: projects, credentials, work samples, references and
 * publications that back career claims. Same items and labels as the website.
 */
export default function EvidenceListScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const gate = useEvidenceGate();
  const list = useEvidenceList();
  const t = useT('careerEvidence');

  const addButton =
    gate === 'open' ? (
      <TouchableOpacity
        onPress={() => router.push('/(dashboard)/career/evidence/new' as Href)}
        className="h-11 w-11 items-center justify-center rounded-full bg-brand-600"
        accessibilityRole="button"
        accessibilityLabel={t('list.add')}
      >
        <Ionicons name="add" size={24} color={colors.white} />
      </TouchableOpacity>
    ) : null;

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.locked')} />;
  } else if (gate === 'off') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.off')} description={t('gate.offBody')} />;
  } else if (gate === 'loading' || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (gate === 'error' || list.error) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, t('list.loadError'))}
        onRetry={() => void (list.error ? list.refetch() : access.refetch())}
      />
    );
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            {t('list.intro')}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="ribbon-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyBody')}
            actionLabel={t('list.add')}
            onAction={() => router.push('/(dashboard)/career/evidence/new' as Href)}
          />
        }
        renderItem={({ item }) => {
          const label = evidenceLabelView(item.evidenceLabel);
          return (
            <TouchableOpacity
              onPress={() => router.push(`/(dashboard)/career/evidence/${encodeURIComponent(item.id)}` as Href)}
              className="bg-surface border border-stone-100 rounded-2xl p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${evidenceTypeLabel(item.evidenceType)}, ${label.text.toLowerCase()}`}
              accessibilityHint={t('list.itemHint')}
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{evidenceTypeLabel(item.evidenceType)}</Text>
                <Pill label={label.text} tone={label.tone} />
              </View>
              {/* What the label does and does not establish (website: label_*_limit under each badge). */}
              <Text className="text-stone-500 text-xs mb-1 leading-4">{evidenceLabelLimit(item.evidenceLabel)}</Text>
              <Text className="font-bold text-stone-900">{item.title}</Text>
              {item.description ? (
                <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {item.linkedSkills.length > 0 ? (
                <Text className="text-stone-500 text-xs mt-2" numberOfLines={1}>
                  {item.linkedSkills.join(' · ')}
                </Text>
              ) : null}
              {item.confidential || (item.linkedFactIds?.length ?? 0) > 0 || (item.verifications?.length ?? 0) > 0 ? (
                <View className="flex-row flex-wrap items-center gap-2 mt-2">
                  {item.confidential ? <Pill label={t('list.confidential')} tone="warning" /> : null}
                  {(item.linkedFactIds?.length ?? 0) > 0 ? (
                    <Text className="text-stone-500 text-xs">{t('list.linkedFacts', { count: item.linkedFactIds.length })}</Text>
                  ) : null}
                  {(item.verifications?.length ?? 0) > 0 ? (
                    <Text className="text-stone-500 text-xs">{t('history.title', { count: item.verifications?.length ?? 0 })}</Text>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row items-center justify-between mt-3">
                <View className="flex-row items-center flex-1 me-2">
                  {item.attachmentStored || item.attachmentUrl ? (
                    <>
                      <Ionicons name={item.attachmentStored ? 'document-attach-outline' : 'link-outline'} size={14} color={colors.stone[500]} />
                      <Text className="text-stone-500 text-xs ms-1" numberOfLines={1}>
                        {item.attachmentStored
                          ? `${item.attachmentName ?? t('list.privateFile')} ${formatBytes(item.attachmentSizeBytes)}`.trim()
                          : (item.attachmentName ?? t('list.link'))}
                      </Text>
                    </>
                  ) : null}
                </View>
                <Text className="text-stone-400 text-xs">{item.isPortfolioShared ? t('list.shared') : t('list.privateOnly')}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} subtitle={t('subtitle')} right={addButton} />
      {content}
    </SafeAreaView>
  );
}
